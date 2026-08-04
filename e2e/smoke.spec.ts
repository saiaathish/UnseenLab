import { test, expect } from "@playwright/test";

/**
 * The critical demo smoke flow:
 * open app -> enter lab -> predict -> withdraw absorber -> run ->
 * adaptation appears -> accept -> counterfactual -> replay.
 */
test("demo smoke: predict, run, adapt, compare, replay", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "What topic do you need help with?" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Start this lab" }).first().click();

  await expect(
    page.getByRole("heading", { name: "Nuclear Chain Reaction" }),
  ).toBeVisible();

  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByText("Your prediction", { exact: false })).toBeVisible();

  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();

  await expect(
    page.getByText(/the simulation stopped at the safety ceiling/i),
  ).toBeVisible({ timeout: 10_000 });

  await expect(
    page.getByText(/suggested adaptation/i),
  ).toBeVisible();

  await page.getByRole("button", { name: "Accept" }).first().click();

  // The comparison tool lives inside a collapsible section in the guided flow.
  await page.getByText("Compare one change").click();
  await page.getByRole("button", { name: "Run comparison" }).click();
  await expect(
    page.getByText(/changed exactly one variable/i),
  ).toBeVisible();

  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  await expect(
    page.getByRole("heading", { name: "Adaptation Replay" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Initial prediction" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close replay" }).click();
});
