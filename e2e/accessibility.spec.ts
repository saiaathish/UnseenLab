import { test, expect, type Page } from "@playwright/test";

/**
 * Accessibility matrix (browser level, guest build; additive — the keyboard
 * and auth-dialog specs already cover the lab's keyboard basics and the
 * dialog's Escape/click paths, so this spec only adds what they leave out):
 *
 * - keyboard: Tab reaches the header "Sign in", Enter opens the dialog,
 *   Escape closes it and restores focus to the trigger
 * - focus-visible indicators: the Sign in button and the topic input show a
 *   visible focus indicator (ring/outline) after keyboard Tab
 * - no tab trap on the homepage: focus cycles through every control and
 *   never freezes on a single element
 * - reduced motion: the lab simulation view mounts (static SVG frames — the
 *   lab has no WebGL canvas) and a trial still runs; the homepage
 *   reduced-motion case is covered in homepage.spec.ts
 * - text scale: the lab accessibility control applies
 *   document.documentElement.style.fontSize (root rem scaling)
 * - 320px viewport: homepage AND lab without horizontal overflow
 * - high contrast: the lab toggle applies the `high-contrast` body class and
 *   changes a computed design token
 *
 * Onboarding is auth-gated (redirects to /?auth=open signed out), so it is
 * intentionally not covered here.
 */

const SIGN_IN_NAME = "Sign in";

async function tabTo(page: Page, locator: import("@playwright/test").Locator, maxTabs = 24): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`tabTo: could not reach element within ${maxTabs} Tabs`);
}

test("keyboard: Enter opens the auth dialog; Escape closes and restores focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: SIGN_IN_NAME }).first();
  await tabTo(page, trigger);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to UnseenLab" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("focus-visible: Sign in and the topic input show a focus indicator after Tab", async ({ page }) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: SIGN_IN_NAME }).first();
  await tabTo(page, trigger);
  const triggerIndicator = await trigger.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      focusVisible: el.matches(":focus-visible"),
      boxShadow: cs.boxShadow,
      outlineStyle: cs.outlineStyle,
    };
  });
  expect(triggerIndicator.focusVisible).toBe(true);
  expect(triggerIndicator.boxShadow).not.toBe("none");

  const textarea = page.getByLabel("Describe the topic you need help with");
  await tabTo(page, textarea);
  await expect(textarea).toBeFocused();
  const inputIndicator = await textarea.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      focusVisible: el.matches(":focus-visible"),
      boxShadow: cs.boxShadow,
      outlineStyle: cs.outlineStyle,
    };
  });
  expect(inputIndicator.focusVisible).toBe(true);
  expect(inputIndicator.boxShadow).not.toBe("none");
});

test("no tab trap: keyboard focus cycles through every homepage control", async ({ page }) => {
  await page.goto("/");

  const focusableCount = await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), ' +
          'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    return candidates.filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length;
  });
  expect(focusableCount).toBeGreaterThan(5);

  // Tab through every control, plus one wrap press. Focus must never freeze
  // on a single element across consecutive presses (a tab trap would repeat
  // the same activeElement forever).
  const visited: string[] = [];
  for (let i = 0; i <= focusableCount; i++) {
    await page.keyboard.press("Tab");
    visited.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return (
          el.tagName +
          ":" +
          (el.getAttribute("aria-label") ??
            el.textContent?.trim().slice(0, 24) ??
            "")
        );
      }),
    );
  }
  for (let i = 1; i < visited.length; i++) {
    expect(visited[i], `focus stuck on ${visited[i - 1]}`).not.toBe(visited[i - 1]);
  }
});

test("reduced motion: the lab simulation view mounts and a trial runs", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/nuclear-chain-reaction");

  // The lab records the OS preference on <html> (same effect that disables
  // the animation: static frames, no pulses).
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");

  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByRole("button", { name: "Run trial" })).toBeVisible();

  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();
  await expect(
    page.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible({ timeout: 30_000 });

  // The simulation view is an inline SVG (role=img); under OS reduced motion
  // the html[data-reduced-motion] kill-switch (globals.css) pins the
  // animation to static frames (the lab has no <canvas> — the
  // WebGL-canvas-free behavior is asserted for the homepage hero in
  // homepage.spec.ts).
  await expect(
    page.locator('svg[aria-label^="Neutron population"]'),
  ).toBeVisible();
});

test("text scale: the lab accessibility control applies root font-size", async ({ page }) => {
  await page.goto("/lab/nuclear-chain-reaction");
  await page.getByRole("button", { name: /accessibility & display/i }).click();

  const slider = page.locator("#pref-text-scale");
  await expect(slider).toBeVisible();
  // Real keyboard interaction: focus the range and arrow it up from 1.0 to
  // 1.5 in 0.1 steps (TEXT_SCALE_MAX = 1.5) so React's onChange fires.
  await slider.focus();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowRight");
  }

  // The control must apply the root font-size that rem-based Tailwind classes
  // actually scale from (the shell sets documentElement.style.fontSize).
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("150%");
});

test.describe("320px viewport", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("homepage fits without horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "What topic do you need help with?" }),
    ).toBeVisible();
    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    );
    expect(fits).toBe(true);
  });

  test("lab fits without horizontal overflow", async ({ page }) => {
    await page.goto("/lab/nuclear-chain-reaction");
    await expect(
      page.getByRole("heading", { name: "Nuclear Chain Reaction" }),
    ).toBeVisible();
    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    );
    expect(fits).toBe(true);
  });
});

test("high contrast: toggle applies the body class and changes a computed token", async ({ page }) => {
  await page.goto("/lab/nuclear-chain-reaction");
  const before = await page.evaluate(() => ({
    border: getComputedStyle(document.body).getPropertyValue("--border").trim(),
    background: getComputedStyle(document.body).getPropertyValue("--background").trim(),
  }));

  await page.getByRole("button", { name: /accessibility & display/i }).click();
  await page.getByRole("switch", { name: "High contrast" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => document.body.classList.contains("high-contrast")),
    )
    .toBe(true);

  const after = await page.evaluate(() => ({
    border: getComputedStyle(document.body).getPropertyValue("--border").trim(),
    background: getComputedStyle(document.body).getPropertyValue("--background").trim(),
  }));
  // body.high-contrast overrides the tokens (border -> #111111, background ->
  // #ffffff); at least one must actually change.
  expect(after.border !== before.border || after.background !== before.background).toBe(true);
});
