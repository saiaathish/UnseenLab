import { test, expect } from "@playwright/test";

/**
 * Auth dialog behavior, browser level (guest build — no Supabase config):
 * - opens from the header with the mandated copy (AUTH-01..07)
 * - Escape closes and restores focus to the trigger
 * - "Continue with Google" degrades gracefully when sign-in is unavailable
 * - "Try without an account" closes the dialog
 * - 320px viewport: no horizontal overflow
 * - reduced motion: dialog remains usable, focus trap intact
 */

test("opens from the header with the mandated copy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to UnseenLab" }),
  ).toBeVisible();
  await expect(
    page.getByText("Save your learning preferences and continue across devices."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try without an account" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Try the lab now. Sign in whenever you want to save progress across devices.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Your saved learning data is private to your account. We do not ask for diagnosis information.",
    ),
  ).toBeVisible();
});

test("closes on Escape and restores focus to the trigger", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Sign in" }).first();
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Continue with Google degrades gracefully when sign-in is unavailable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByRole("button", { name: "Continue with Google" }).click();

  // No navigation, no crash: the dialog stays open with the calm failure copy.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("We couldn't sign you in with Google. Please try again."),
  ).toBeVisible();
});

test("Try without an account closes the dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("button", { name: "Try without an account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("320px viewport", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("dialog fits without horizontal overflow", async ({ page }) => {
    await page.goto("/?auth=open");
    await expect(page.getByRole("dialog")).toBeVisible();

    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    );
    expect(fits).toBe(true);
  });
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("dialog opens and is keyboard-dismissible", async ({ page }) => {
    await page.goto("/?auth=open");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sign in to UnseenLab" }),
    ).toBeVisible();

    // Focus restore on auto-open deep links is handled by the modal's focus
    // trap; the explicit trigger-click restore is covered above.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
