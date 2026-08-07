import { test, expect, type Page } from "@playwright/test";

/**
 * Viewport / zoom evidence gap-closure (Phase 3): the committed
 * accessibility.spec.ts covers 320px, keyboard, reduced motion, text scale,
 * and high contrast. This spec closes the 375px and 200%-zoom gaps for the
 * demo/ask flow (homepage topic ask + the lab prediction flow).
 *
 * Zoom method (documented): Chromium CDP has no layout-viewport browser-zoom
 * primitive. `Emulation.setDeviceMetricsOverride { scale }` and
 * `Emulation.setPageScaleFactor` only scale the VISUAL viewport — probed in
 * this worktree: at scale=2 window.innerWidth stayed 1280 and
 * matchMedia("(min-width: 641px)") stayed true. Browser zoom is therefore
 * emulated at its CSS-layout-viewport equivalent: 200% zoom of a 1280x800
 * desktop window yields a 640x400 CSS layout viewport (WCAG 1.4.4 / 1.4.10
 * reflow target), which is exactly what media queries, rem text, and
 * horizontal-overflow checks respond to.
 */

async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );
}

test.describe("375px viewport (mobile)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("homepage ask flow renders without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Ask for a demonstration" }),
    ).toBeVisible();

    // The ask input is usable at 375px: it is the flow's primary control.
    const textarea = page.getByRole("textbox", {
      name: "What topic do you need help with?",
    });
    await expect(textarea).toBeVisible();
    await textarea.fill("nuclear chain reaction");

    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test("lab demo/ask flow renders without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/lab/nuclear-chain-reaction");
    await expect(
      page.getByRole("heading", { name: "Nuclear Chain Reaction" }),
    ).toBeVisible();

    // The prediction gate is present and reachable on a phone-width layout.
    const radio = page.getByRole("radio", { name: /gets slightly faster/i });
    await expect(radio).toBeVisible();
    await radio.check({ force: true });

    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("200% zoom (1280x800 desktop at 2x = 640x400 CSS layout viewport)", () => {
  test.use({ viewport: { width: 640, height: 400 } });

  test("homepage ask flow reflows at 200% zoom with no horizontal overflow", async ({
    page,
  }) => {
    // Sanity: the emulated layout viewport is the 200%-zoom equivalent.
    expect(
      await page.evaluate(() => document.documentElement.clientWidth),
    ).toBe(640);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Ask for a demonstration" }),
    ).toBeVisible();

    const textarea = page.getByRole("textbox", {
      name: "What topic do you need help with?",
    });
    await expect(textarea).toBeVisible();
    await textarea.fill("nuclear chain reaction");

    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test("lab demo/ask flow reflows at 200% zoom with no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/lab/nuclear-chain-reaction");
    await expect(
      page.getByRole("heading", { name: "Nuclear Chain Reaction" }),
    ).toBeVisible();

    const radio = page.getByRole("radio", { name: /gets slightly faster/i });
    await expect(radio).toBeVisible();
    await radio.check({ force: true });

    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});
