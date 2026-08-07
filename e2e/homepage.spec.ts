import { test, expect } from "@playwright/test";

/**
 * Homepage ask-to-demonstration flow, browser level:
 * - keyboard-only path: a STEM topic generates a demonstration and enters it
 * - the Newton's-second-law acceptance: generated experience, never the
 *   legacy nuclear fallback, never "unsupported"
 * - breadth examples are the single entrance; the legacy nuclear hero and
 *   the nuclear homepage sections are gone
 * - ambiguous topics get one clarifying question (recovery loop)
 * - reduced-motion rendering (no canvas)
 * - mobile layout: no horizontal overflow, menu + anchor navigation
 * - the single auth entry point (header Sign in -> dialog) and the guest
 *   path staying auth-free
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

  // The generative pipeline produces a verified-simulation demonstration.
  await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Verified simulation")).toBeVisible();

  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuclear Chain Reaction", level: 1 }),
  ).toBeVisible();
  // In the guided flow the prediction step is the first interactive step.
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
  await page.getByRole("button", { name: "Generate demonstration" }).click();

  // NOT the legacy nuclear fallback: no "Start this lab", no lab redirect.
  await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("Gravity & Orbits", { exact: false }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await expect(
    page.getByRole("heading", { name: "Newton's Second Law", level: 1 }),
  ).toBeVisible();
  // Honest trust tier + the force/mass science the acceptance requires.
  // One-variable mode keeps the focus control (force) and holds mass
  // constant; the prediction gate asks about force/acceleration (the exact
  // F/m relationship is pinned deterministically in the unit acceptance
  // test — the hosted model's wording varies per generation).
  await expect(page.getByLabel("Trust: Verified simulation")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Applied force" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Predict first" }),
  ).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeVisible();
  // No nuclear content anywhere in the generated experience.
  await expect(
    page.getByText("Nuclear Chain Reaction", { exact: false }),
  ).toHaveCount(0);
});

test("the legacy nuclear hero and homepage sections are gone", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Ask for a demonstration", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Find a learning path" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Available lab" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nuclear chain reactions" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Start this lab" }),
  ).toHaveCount(0);

  // Breadth examples are the entrance.
  await expect(
    page.getByRole("button", {
      name: "What does Newton's second law say about force and mass?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "How does photosynthesis transfer energy?" }),
  ).toBeVisible();
});

test("ambiguous topic offers a clarifying question and preserves the input", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("textbox", { name: "What topic do you need help with?" })
    .fill("orbital motion");
  await page.getByRole("button", { name: "Generate demonstration" }).click();

  // The intent layer asks one short question instead of guessing.
  await expect(page.getByText("Your demonstration is ready")).not.toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("textbox", { name: "Your answer" }),
  ).toBeVisible();

  // Answering the clarify question resubmits with the appended detail and
  // lands on a demonstration.
  await page
    .getByRole("textbox", { name: "Your answer" })
    .fill("planets around the sun");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });

  // The path never surfaces an error to the learner.
  await expect(page.getByText(/Error|Failed|Invalid topic/i)).toHaveCount(0);
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("homepage renders without a canvas and the ask flow works", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Ask for a demonstration" }),
    ).toBeVisible();

    // No animated hero canvas under reduced motion.
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

    // No horizontal overflow: scrollWidth must not exceed clientWidth (1px
    // tolerance for fractional rounding).
    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    );
    expect(fits).toBe(true);

    await expect(
      page.getByRole("heading", { name: "Ask for a demonstration" }),
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

  // No login/signup *pages or links* — the only auth surface is the dialog
  // trigger in the header.
  await expect(
    page.getByRole("link", { name: /log ?in|sign ?up/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The header "Sign in" opens the single auth dialog with mandated copy.
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to UnseenLab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();

  // Guest dismissal keeps the ask flow working with no auth wall.
  await page.getByRole("button", { name: "Try without an account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "What topic do you need help with?" })
    .fill("nuclear chain reaction");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Your demonstration is ready")).toBeVisible({ timeout: 20_000 });
});
