import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The shipped ask→orbit→save→reload→restore journey (audit HIGH finding:
 * zero Playwright coverage of the deployed demo flow).
 *
 * Deterministic by construction:
 * - fallback path: POST /api/demonstrations/generate stubbed to 500 → the
 *   client's offline generator (ask-demo-form.tsx runOffline) produces the
 *   curated demo-orbits-001 spec — no LLM, no network dependency.
 * - hosted path: the route is fulfilled with a captured real response
 *   (e2e/fixtures/orbit-spec.json — the verified_simulation orbital spec).
 *
 * Both paths must converge on the same journey:
 * ask → ready card (Verified simulation) → enter → predict → manipulate →
 * observe → save → reload → prediction locked in again (regression for the
 * restoredPredictionIndex fix) → trial log intact → restore re-applies the
 * manipulated parameter.
 *
 * The two specs are NOT identical — the offline showcase pins the Launch
 * speed control to [0.6, 1.2] (step 0.05, default 1) while the hosted
 * fixture allows up to 3 — so the manipulation target is per-path
 * (PathConfig): the fallback path reaches 1.2 with 4 ArrowRight presses,
 * the hosted path reaches 1.25 with 5. Everything else in the journey is
 * path-agnostic; only the slider target and the trial-log snapshot text
 * differ, and both are asserted explicitly per path.
 */

const orbitSpec = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "orbit-spec.json"), "utf8"),
);

interface PathConfig {
  /** Launch speed slider target after keyboard manipulation. */
  sliderTarget: string;
  /** ArrowRight presses on the focused slider to reach sliderTarget. */
  sliderPresses: number;
  /** Trial-log snapshot line, e.g. "Parameters: g 10, speed 1.25". */
  paramsLine: string;
}

const FALLBACK_CONFIG: PathConfig = {
  sliderTarget: "1.2",
  sliderPresses: 4,
  paramsLine: "Parameters: g 10, speed 1.2",
};

const HOSTED_CONFIG: PathConfig = {
  sliderTarget: "1.25",
  sliderPresses: 5,
  paramsLine: "Parameters: g 10, speed 1.25",
};

async function runJourney(
  page: import("@playwright/test").Page,
  cfg: PathConfig,
) {
  // Ask (exact participant-style prompt).
  await page.goto("/");
  await page
    .getByRole("button", { name: "Show why planets stay in orbit." })
    .click();
  await expect(
    page.getByRole("textbox", { name: "What topic do you need help with?" }),
  ).toHaveValue("Show why planets stay in orbit.");
  await page.getByRole("button", { name: "Generate demonstration" }).click();

  // Ready card with the trust label.
  await expect(page.getByText("Your demonstration is ready")).toBeVisible();
  await expect(page.getByText("Verified simulation")).toBeVisible();

  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await expect(
    page.getByRole("heading", { name: "Why Planets Stay in Orbit", level: 1 }),
    // First demo-page mount loads the dynamic engine chunks (offline path
    // measured 5-15s on a warm machine; hosted fixture is faster). The
    // default 5s expect timeout flakes here, so pin a 15s mount budget.
  ).toBeVisible({ timeout: 15_000 });
  // The TrustBadge's accessible name is "Trust: Verified simulation"
  // (aria-label on the badge span; the visible text inside it is
  // aria-hidden, so getByText can never match it). The ready-card
  // visible-text assertion above and this accessible-name assertion
  // together pin both the sighted and the screen-reader trust state.
  await expect(
    page.getByLabel("Trust: Verified simulation"),
  ).toBeVisible();

  // Prediction gate: controls are locked until a prediction is submitted.
  const slider = page.getByRole("slider", { name: "Launch speed" });
  await expect(slider).toBeDisabled();

  await page
    .getByRole("radio", { name: /more elliptical/ })
    .click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByText("Prediction locked in")).toBeVisible();
  await expect(slider).toBeEnabled();

  // Manipulate: launch speed 1 → cfg.sliderTarget via keyboard (range input).
  await slider.focus();
  for (let i = 0; i < cfg.sliderPresses; i++)
    await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", cfg.sliderTarget);

  // Observe: check a prompt + note + save to trial log.
  // The "what to watch" observation prompt is worded per source: the hosted
  // fixture asks about the gravity arrows, the offline catalog about the
  // Speed readout — both paths expose exactly one such prompt.
  await page
    .getByRole("checkbox", { name: /^Watch the (arrows|Speed readout)/ })
    .click();
  await page
    .getByRole("textbox", { name: "Your notes" })
    .fill("Orbit path stretched when I increased launch speed.");
  await page
    .getByRole("button", { name: "Save observations to my trial log" })
    .click();
  await expect(
    page.getByText("Observations recorded to your trial log."),
  ).toBeVisible();

  // Save to device.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();

  // Reload: save status, prediction gate, and trial evidence all survive.
  await page.reload();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  // Regression: the recorded prediction is re-applied on bare reload — the
  // gate must NOT send the learner back to "Predict first".
  await expect(page.getByText("Prediction locked in")).toBeVisible();
  await expect(page.getByText("Predict first")).toHaveCount(0);
  await expect(slider).toBeEnabled();
  await expect(page.getByText(/Show \(2\)/)).toBeVisible();

  // Trial log holds the parameter snapshot with the changed value. The
  // <summary> is not exposed as a button role, so locate it structurally:
  // the only <summary> containing "Trial log" (getByText alone is ambiguous
  // with the "Save observations to my trial log" button).
  await page.locator("summary").filter({ hasText: "Trial log" }).click();
  await expect(
    page.getByText(/Prediction: .*more elliptical/),
  ).toBeVisible();
  await expect(
    page.getByText(cfg.paramsLine, { exact: false }),
  ).toBeVisible();

  // Restore re-applies the manipulated parameter + shows the replay table.
  await page
    .getByRole("button", { name: "Restore these parameters" })
    .nth(1)
    .click();
  await expect(page.getByText(/Parameters restored from entry 2/)).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuenow", cfg.sliderTarget);
}

test("fallback path: full ask→save→reload→restore journey via the offline generator", async ({
  page,
}) => {
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await runJourney(page, FALLBACK_CONFIG);
});

test("hosted path: full journey with a captured verified-simulation spec", async ({
  page,
}) => {
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          outcome: "spec",
          spec: orbitSpec,
          source: "model",
          reason: "e2e fixture",
        },
      }),
    }),
  );
  await runJourney(page, HOSTED_CONFIG);
});
