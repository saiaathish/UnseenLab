import { test, expect } from "@playwright/test";

/**
 * The repeatable adaptive loop, browser level:
 * - at least three trials without a reload
 * - an updated prediction is required before each new trial
 * - trials are appended, never overwritten
 * - replay lists every trial in order
 * - a reload restores the latest stage without duplicating evidence
 * - only one /api/adapt request is sent per trial run
 *
 * The AI interpretation may take up to ~12 seconds per run, so result
 * assertions use generous timeouts. Nothing here depends on which specific
 * intervention the model picks — the flow only ever clicks Accept on whatever
 * appears, or skips proposals entirely.
 */

const EVIDENCE_KEY = "unseenlab.evidence.v1";

/**
 * Waits for a trial to finish. The results view only renders after the run
 * (including the AI interpretation) completes, so its heading is the honest
 * completion marker — the "State summary" text also exists on the previous
 * trial's canvas while the next run is still processing.
 */
async function waitForResults(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible({ timeout: 30_000 });
}

test("learner can run three trials without reloading and compare them in replay", async ({
  page,
}) => {
  await page.goto("/lab/nuclear-chain-reaction");

  // Trial 1: withdraw the absorber.
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();
  await waitForResults(page);

  // Updated prediction is the gate to trial 2.
  await expect(
    page.getByRole("button", { name: /run trial/i }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /update my prediction/i })
    .click();
  await page
    .getByRole("radio", { name: /grows much faster than before/i })
    .click();
  await page
    .getByRole("button", { name: /submit updated prediction/i })
    .click();

  // Trial 2: change the material density.
  await expect(
    page.getByRole("heading", { name: /trial 2 — run another trial/i }),
  ).toBeVisible();
  await page.locator("#param-materialDensity").fill("0.4");
  await page.getByRole("button", { name: "Run trial" }).click();
  await waitForResults(page);

  // Trial 3: change the starting population.
  await page
    .getByRole("button", { name: /update my prediction/i })
    .click();
  await page
    .getByRole("radio", { name: /it stays about the same/i })
    .click();
  await page
    .getByRole("button", { name: /submit updated prediction/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /trial 3 — run another trial/i }),
  ).toBeVisible();
  await page.locator("#param-startingNeutrons").fill("5");
  await page.getByRole("button", { name: "Run trial" }).click();
  await waitForResults(page);

  // Three trials were appended, each with its own prediction.
  const stored = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, EVIDENCE_KEY);
  expect(stored.trials).toHaveLength(3);
  expect(stored.predictions).toHaveLength(3);
  expect(stored.trials[1].changedVariables).toEqual(["materialDensity"]);
  expect(stored.trials[2].changedVariables).toEqual(["startingNeutrons"]);

  // Replay lists every trial in order.
  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  await expect(page.getByText("Trial 1 of 3")).toBeVisible();
  await expect(page.getByText("Trial 2 of 3")).toBeVisible();
  await expect(page.getByText("Trial 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: /close replay/i }).click();
});

test("reload restores the results stage without duplicating evidence", async ({
  page,
}) => {
  await page.goto("/lab/nuclear-chain-reaction");
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();
  await waitForResults(page);

  await page.reload();

  // The results stage is restored, not the empty initial state.
  await expect(
    page.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /predict first/i }),
  ).toHaveCount(0);

  // Exactly one trial and one prediction survived the reload.
  const stored = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, EVIDENCE_KEY);
  expect(stored.trials).toHaveLength(1);
  expect(stored.predictions).toHaveLength(1);
});

test("sends at most one adaptation request per trial and shows progress while waiting", async ({
  page,
}) => {
  let adaptRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/adapt")) adaptRequests += 1;
  });

  await page.goto("/lab/nuclear-chain-reaction");
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");

  const runButton = page.getByRole("button", { name: "Run trial" });
  await runButton.click();

  // While the interpretation is in flight the run control is disabled and the
  // live status explains what is happening.
  await expect(runButton).toBeDisabled();
  await expect(
    page.getByText(/interpreting your evidence/i),
  ).toBeVisible({ timeout: 10_000 });

  await waitForResults(page);
  expect(adaptRequests).toBeLessThanOrEqual(1);
});
