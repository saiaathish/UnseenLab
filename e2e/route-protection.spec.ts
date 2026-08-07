import { test, expect } from "@playwright/test";

/**
 * Route protection (signed-out), browser level.
 * Runs real: with no Firebase config baked into the build, the proxy
 * (src/proxy.ts) short-circuits on `isFirebaseConfigured()` and redirects —
 * no session, no interception required. The lab is never guarded.
 */

const DIALOG_HEADING = "Sign in to UnseenLab";

for (const path of [
  "/dashboard",
  "/onboarding",
  "/settings",
  "/settings/profile",
]) {
  test(`${path} redirects signed-out visitors to /?auth=open with the dialog open`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.waitForURL(/\?auth=open/);

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: DIALOG_HEADING }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  });
}

test("deep link /?auth=open opens the dialog on first paint", async ({
  page,
}) => {
  await page.goto("/?auth=open");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: DIALOG_HEADING }),
  ).toBeVisible();
});

test("the lab stays public for signed-out visitors", async ({ page }) => {
  await page.goto("/lab/nuclear-chain-reaction");
  await expect(page).toHaveURL(/\/lab\/nuclear-chain-reaction/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Nuclear Chain Reaction" }),
  ).toBeVisible();
});

test("guest flow regression after dismissing the redirect dialog", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\?auth=open/);
  await expect(page.getByRole("dialog")).toBeVisible();

  // Dismiss the dialog; the lab must open with no auth wall and no dialog.
  // (The homepage no longer routes topics to the lab — navigate directly.)
  await page.getByRole("button", { name: "Try without an account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/lab/nuclear-chain-reaction");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: /gets slightly faster/i }),
  ).toBeVisible();
});
