import { test, expect } from "@playwright/test";

/**
 * Adversarial validation, browser level:
 * - core flow must work keyboard-only (focus + Enter/Space/Escape)
 * - the scientific safety disclaimer must be visible inside the lab,
 *   not buried in documentation
 */
test("keyboard-only core flow works", async ({ page }) => {
  await page.goto("/lab/nuclear-chain-reaction");

  // The prediction gate is enforced for keyboard users too.
  await page.getByRole("button", { name: "Run trial" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/prediction is required before running a trial/i),
  ).toBeVisible();

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
  await expect(page.getByText(/state summary:/i)).toBeVisible();
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
  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  await expect(
    page.getByRole("heading", { name: "Adaptation Replay" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Adaptation Replay" }),
  ).not.toBeVisible();
});
