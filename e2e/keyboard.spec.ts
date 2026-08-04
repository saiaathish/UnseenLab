import { test, expect } from "@playwright/test";

/**
 * Adversarial validation, browser level:
 * - core flow must work keyboard-only (focus + Enter/Space/Escape)
 * - the scientific safety disclaimer must be visible inside the lab,
 *   not buried in documentation
 */
test("keyboard-only core flow works", async ({ page }) => {
  await page.goto("/lab/nuclear-chain-reaction");

  // The prediction gate is enforced structurally in the guided flow: the Run
  // trial control only exists once a prediction has been submitted.
  await expect(page.getByRole("button", { name: "Run trial" })).toHaveCount(0);

  // Focus the first prediction radio and activate it with the keyboard.
  const radio = page.getByRole("radio", { name: /gets slightly faster/i });
  await radio.focus();
  await page.keyboard.press("Space");
  await expect(radio).toBeChecked();

  // Arrow keys move within the radio group (native radio behavior).
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: /grows much faster than before/i }),
  ).toBeFocused();
  await page.keyboard.press("Space");

  // Submit via keyboard.
  await page.getByRole("button", { name: "Submit prediction" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Your prediction", { exact: false })).toBeVisible();

  // Run via keyboard — with a valid prediction the trial actually runs.
  await page.getByRole("button", { name: "Run trial" }).focus();
  await page.keyboard.press("Enter");
  // The hosted-model path resolves in ~2.5s+; keep the same generous timeout
  // multi-trial.spec's waitForResults uses so a live model can't flake this.
  await expect(page.getByText(/state summary:/i)).toBeVisible({
    timeout: 30_000,
  });
});

test("safety disclaimer is visible inside the lab", async ({ page }) => {
  await page.goto("/lab/nuclear-chain-reaction");
  await expect(
    page.getByText(/not physically predictive/i),
  ).toBeVisible();
  await expect(
    page.getByText(/must not be used for real engineering or safety decisions/i),
  ).toBeVisible();
});

test("replay dialog closes with the Escape key", async ({ page }) => {
  await page.goto("/lab/nuclear-chain-reaction");

  // The Adaptation Replay control appears once a trial has been recorded, so
  // record one first.
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.getByRole("button", { name: "Run trial" }).click();
  await expect(page.getByText(/state summary:/i)).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  await expect(
    page.getByRole("heading", { name: "Adaptation Replay" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Adaptation Replay" }),
  ).not.toBeVisible();
});
