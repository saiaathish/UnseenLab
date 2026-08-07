import { test, expect } from "@playwright/test";

/**
 * Homepage ask-to-demonstration flow, browser level. The restored visual hero
 * deliberately uses the old CTA/chip vocabulary, but every submission still
 * enters the generative pipeline rather than the deleted routeTopic router.
 */

test("keyboard-only: a supported topic generates and enters its demonstration", async ({
  page,
}) => {
  await page.goto("/");

  const input = page.getByRole("textbox", {
    name: "What topic do you need help with?",
  });
  await input.focus();
  await input.pressSequentially("nuclear chain reaction");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Verified simulation")).toBeVisible();

  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuclear Chain Reaction", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit prediction" }),
  ).toBeVisible();
});

test("acceptance: Newton's second law generates an experience — never the nuclear fallback", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("textbox", { name: "What topic do you need help with?" })
    .fill("second law of newton");
  await page.getByRole("button", { name: "Find my learning path" }).click();

  await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("Gravity & Orbits", { exact: false }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await expect(
    page.getByRole("heading", { name: "Newton's Second Law", level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel("Trust: Verified simulation")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Applied force" })).toBeVisible();
  // The redesign's lesson rail opens on the Predict step; controls stay
  // locked ("Predict first to unlock") until the prediction is committed.
  await expect(
    page.getByRole("region", { name: "Prediction" }).getByRole("heading", { name: "Predict" }),
  ).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeVisible();
  await expect(
    page.getByText("Nuclear Chain Reaction", { exact: false }),
  ).toHaveCount(0);
});

test("restored old-style hero still uses the generative entrance", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "What topic do you need help with?", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Describe the idea that feels unclear. We’ll guide you to the closest interactive learning experience.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Find my learning path" }),
  ).toBeVisible();

  // The three old visual suggestion chips are back, but the old nuclear-only
  // result card/available-lab funnel remains deleted.
  await expect(
    page.getByRole("button", { name: "Nuclear chain reactions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Why reactions accelerate" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "How absorbers change reactions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Available lab" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Start this lab" }),
  ).toHaveCount(0);
  await expect(page.getByText("Or try an example:")).toHaveCount(0);
});

test("ambiguous topic offers a clarifying question and preserves the input", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("textbox", { name: "What topic do you need help with?" })
    .fill("orbital motion");
  await page.getByRole("button", { name: "Find my learning path" }).click();

  await expect(page.getByText("Your demonstration is ready")).not.toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("textbox", { name: "Your answer" }),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Your answer" })
    .fill("planets around the sun");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Error|Failed|Invalid topic/i)).toHaveCount(0);
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("homepage renders without a canvas and the ask flow works", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "What topic do you need help with?" }),
    ).toBeVisible();

    await expect(page.locator("canvas")).toHaveCount(0);

    const input = page.getByRole("textbox", {
      name: "What topic do you need help with?",
    });
    await expect(input).toBeVisible();
    await input.fill("nuclear chain reaction");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("mobile viewport", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("homepage fits 320px without horizontal overflow and the menu navigates", async ({
    page,
  }) => {
    await page.goto("/");

    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    );
    expect(fits).toBe(true);

    await expect(
      page.getByRole("heading", { name: "What topic do you need help with?" }),
    ).toBeVisible();

    const menuButton = page.getByRole("button", { name: "Open menu" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();

    await page.getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/#how-it-works/);
    await expect(page.locator("#how-it-works")).toBeVisible();
  });
});

test("homepage auth entry opens the dialog; guest path stays auth-free", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("link", { name: /log ?in|sign ?up/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to UnseenLab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Try without an account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "What topic do you need help with?" })
    .fill("nuclear chain reaction");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });
});
