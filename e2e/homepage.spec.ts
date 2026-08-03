import { test, expect } from "@playwright/test";

/**
 * New homepage topic-input flow, browser level:
 * - keyboard-only path from topic to lab for a supported topic
 * - unsupported-topic recovery loop (Edit my topic preserves input)
 * - reduced-motion rendering (static gradient, no WebGL canvas)
 * - mobile layout: no horizontal overflow, menu + anchor navigation
 * - no login/signup controls anywhere on the homepage
 */

test("keyboard-only: supported topic reaches the lab", async ({ page }) => {
  await page.goto("/");

  const textarea = page.getByLabel("Describe the topic you need help with");
  await textarea.focus();
  await textarea.pressSequentially("nuclear chain reaction");
  await page.keyboard.press("Enter");

  // Focus moves to the result panel heading so keyboard users land on the
  // outcome instead of having to tab back to it.
  const resultHeading = page.getByRole("heading", {
    name: "We found an interactive lab for this topic.",
  });
  await expect(resultHeading).toBeVisible();
  await expect(resultHeading).toBeFocused();

  await page.getByRole("link", { name: "Start this lab" }).first().click();
  // The result-panel link carries the normalized topic as a query param.
  await page.waitForURL(/\/lab\/nuclear-chain-reaction/);
  await expect(
    page.getByRole("heading", { name: "Nuclear Chain Reaction" }),
  ).toBeVisible();
  // In the guided lab flow the prediction step is the first interactive step.
  await expect(
    page.getByRole("button", { name: "Submit prediction" }),
  ).toBeVisible();
});

test("unsupported topic offers recovery and preserves the input", async ({
  page,
}) => {
  await page.goto("/");

  const textarea = page.getByLabel("Describe the topic you need help with");
  await textarea.fill("photosynthesis");
  await page.getByRole("button", { name: "Find my learning path" }).click();

  const unsupportedHeading = page.getByRole("heading", {
    name: "That topic is not available as an interactive lab yet.",
  });
  await expect(unsupportedHeading).toBeVisible();
  await expect(
    page.getByText("The Nuclear Chain Reaction lab is currently ready."),
  ).toBeVisible();

  // Editing the topic must dismiss the result panel, restore focus to the
  // textarea, and keep the typed topic.
  await page.getByRole("button", { name: "Edit my topic" }).click();
  await expect(unsupportedHeading).not.toBeVisible();
  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveValue("photosynthesis");

  // The recovery loop works repeatedly: extend the topic and resubmit.
  await textarea.pressSequentially(" and light");
  await page.keyboard.press("Enter");
  await expect(unsupportedHeading).toBeVisible();
  await expect(
    page.getByText("The Nuclear Chain Reaction lab is currently ready."),
  ).toBeVisible();

  // The recovery path never surfaces an error to the learner.
  await expect(page.getByText(/Error|Failed|Invalid topic/i)).toHaveCount(0);
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("homepage renders without a WebGL canvas and the topic flow works", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "What topic do you need help with?" }),
    ).toBeVisible();

    // Under reduced motion the hero is a static CSS gradient — no canvas.
    await expect(page.locator("canvas")).toHaveCount(0);

    const textarea = page.getByLabel("Describe the topic you need help with");
    await expect(textarea).toBeVisible();
    await textarea.fill("nuclear chain reaction");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", {
        name: "We found an interactive lab for this topic.",
      }),
    ).toBeVisible();
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
      page.getByRole("heading", { name: "What topic do you need help with?" }),
    ).toBeVisible();

    const menuButton = page.getByRole("button", { name: "Open menu" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();

    await page.getByRole("link", { name: "Available lab" }).click();
    await expect(page).toHaveURL(/#available-lab/);
    await expect(page.locator("#available-lab")).toBeVisible();
  });
});

test("homepage has no login or signup controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /log ?in/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /sign ?up/i })).toHaveCount(0);
  await expect(page.getByText(/login|signup/i)).toHaveCount(0);
});
