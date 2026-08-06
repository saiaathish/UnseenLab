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
 */

const orbitSpec = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "orbit-spec.json"), "utf8"),
);

async function runJourney(page: import("@playwright/test").Page) {
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
  ).toBeVisible();
  await expect(
    page.getByText("Trust: Verified simulation"),
  ).toBeVisible();

  // Prediction gate: controls are locked until a prediction is submitted.
  const slider = page.getByRole("slider", { name: "Launch speed" });
  await expect(slider).toBeDisabled();

  await page
    .getByRole("radio", { name: "The orbit becomes more elliptical." })
    .click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByText("Prediction locked in")).toBeVisible();
  await expect(slider).toBeEnabled();

  // Manipulate: launch speed 1 → 1.25 via keyboard (range input).
  await slider.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "1.25");

  // Observe: check a prompt + note + save to trial log.
  await page
    .getByRole("checkbox", {
      name: /Watch the arrows: the red arrow shows gravity pulling inward/,
    })
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

  // Trial log holds the parameter snapshot with the changed value.
  await page.getByText("Trial log", { exact: false }).click();
  await expect(
    page.getByText("Prediction: The orbit becomes more elliptical."),
  ).toBeVisible();
  await expect(
    page.getByText("Parameters: g 10, speed 1.25", { exact: false }),
  ).toBeVisible();

  // Restore re-applies the manipulated parameter + shows the replay table.
  await page
    .getByRole("button", { name: "Restore these parameters" })
    .nth(1)
    .click();
  await expect(page.getByText(/Parameters restored from entry 2/)).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuenow", "1.25");
}

test("fallback path: full ask→save→reload→restore journey via the offline generator", async ({
  page,
}) => {
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await runJourney(page);
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
  await runJourney(page);
});
