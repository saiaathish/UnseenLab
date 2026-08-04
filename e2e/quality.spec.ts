import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Quality matrix (browser level, additive):
 *
 * - Console: home, lab, and the signed-out /dashboard redirect must load with
 *   ZERO `error`-level console messages (the known signed-out /api/auth/me
 *   401 was fixed to 200-with-user:null). Warnings are collected too and
 *   written to validation-pack/screenshots/quality-data.json for the report
 *   (no source changes — findings are reported verbatim).
 * - Perf: navigation timing (domContentLoadedEventEnd, loadEventEnd) and LCP
 *   (PerformanceObserver) on home and lab. Numbers are RECORDED, never
 *   asserted against budgets (flaky in CI).
 * - AI fallback: on the lab, a trial must surface the adaptation source
 *   badge with the real copy from src/components/lab/adaptation-card.tsx
 *   ("AI interpretation" | "Offline rules"), and with the /api/adapt bridge
 *   forced to fail the card must show the "Offline rules" badge (the
 *   deterministic fallback path).
 * - Screenshots: the six-file evidence pack in validation-pack/screenshots/.
 */

const SCREENSHOT_DIR = path.join(__dirname, "..", "validation-pack", "screenshots");
const QUALITY_DATA_FILE = path.join(SCREENSHOT_DIR, "quality-data.json");

interface ConsoleMessage {
  level: string;
  text: string;
}

const qualityData: {
  console: Record<string, ConsoleMessage[]>;
  perf: Record<string, unknown>;
  screenshots: string[];
  adaptationBadge?: string;
  aiFallbackBadge?: string;
  researchPageStatus?: number;
} = { console: {}, perf: {}, screenshots: [] };

test.afterAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.writeFileSync(QUALITY_DATA_FILE, JSON.stringify(qualityData, null, 2));
});

function collectConsole(page: Page): ConsoleMessage[] {
  const messages: ConsoleMessage[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      messages.push({ level: msg.type(), text: msg.text() });
    }
  });
  return messages;
}

async function settle(page: Page): Promise<void> {
  // Let late requests (e.g. /api/auth/me after mount) finish before judging.
  await page.waitForTimeout(1500);
}

function assertNoErrors(messages: ConsoleMessage[], context: string): void {
  const errors = messages.filter((m) => m.level === "error");
  expect(
    errors,
    `${context}: expected zero error-level console messages, got:\n` +
      errors.map((e) => `  [${e.level}] ${e.text}`).join("\n"),
  ).toEqual([]);
}

test("console: home loads without error-level messages", async ({ page }) => {
  const messages = collectConsole(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What topic do you need help with?" }),
  ).toBeVisible();
  await settle(page);
  assertNoErrors(messages, "home");
  qualityData.console.home = messages;
});

test("console: lab loads without error-level messages", async ({ page }) => {
  const messages = collectConsole(page);
  await page.goto("/lab/nuclear-chain-reaction");
  await expect(
    page.getByRole("heading", { name: "Nuclear Chain Reaction" }),
  ).toBeVisible();
  await settle(page);
  assertNoErrors(messages, "lab");
  qualityData.console.lab = messages;
});

test("console: signed-out /dashboard redirect loads without error-level messages", async ({
  page,
}) => {
  const messages = collectConsole(page);
  await page.goto("/dashboard");
  await page.waitForURL(/\?auth=open/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await settle(page);
  assertNoErrors(messages, "/dashboard redirect");
  qualityData.console.dashboard = messages;
});

test("perf: navigation timing and LCP on home and lab (recorded, no budgets)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __unseenlabLcp: unknown }).__unseenlabLcp = null;
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lcp = entries[entries.length - 1] as
          | { startTime: number; size?: number }
          | undefined;
        (window as unknown as { __unseenlabLcp: unknown }).__unseenlabLcp = lcp
          ? { value: lcp.startTime, size: lcp.size ?? null }
          : null;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // LCP unsupported in this browser — navigation timing still recorded.
    }
  });

  async function measure(name: string, url: string) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      return nav
        ? {
            domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
            loadEventEnd: nav.loadEventEnd,
            responseStart: nav.responseStart,
          }
        : null;
    });
    const lcp = await page.evaluate(
      () =>
        (window as unknown as { __unseenlabLcp: unknown }).__unseenlabLcp ??
        null,
    );
    qualityData.perf[name] = { timing, lcp };
    return { timing, lcp };
  }

  const home = await measure("home", "/");
  const lab = await measure("lab", "/lab/nuclear-chain-reaction");
  expect(home.timing).not.toBeNull();
  expect(lab.timing).not.toBeNull();
});

test("adaptation: a trial surfaces the source badge with the real badge copy", async ({
  page,
}) => {
  await page.goto("/lab/nuclear-chain-reaction");
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();
  await expect(
    page.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible({ timeout: 30_000 });

  // A proposal exists (the card's singular heading only renders with one).
  await expect(page.getByText("Suggested adaptation")).toBeVisible();
  // Source badge copy (src/components/lab/adaptation-card.tsx):
  //   `proposal.source === "llm" ? "AI interpretation" : "Offline rules"`
  // The badge is the first aria-hidden <p> inside the suggestions section.
  const badge = page
    .locator("section[aria-label='Adaptation suggestions'] p[aria-hidden='true']")
    .first();
  await expect(badge).toBeVisible();
  const badgeText = ((await badge.textContent()) ?? "").trim();
  expect(["AI interpretation", "Offline rules"]).toContain(badgeText);
  qualityData.adaptationBadge = badgeText;
});

test("AI fallback: with the LLM bridge failing, the card shows the Offline rules badge", async ({
  page,
}) => {
  // Force the server bridge to fail so the adaptation provider must fall
  // back to the deterministic offline rules (source "rules").
  await page.route("**/api/adapt", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );

  await page.goto("/lab/nuclear-chain-reaction");
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();
  await expect(
    page.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText("Suggested adaptation")).toBeVisible();
  // The deterministic rule set fires for this input (the run hits the safety
  // ceiling — reduce_density), so the card must carry the offline badge. The
  // rules provider may offer several proposals, so take the first badge.
  await expect(page.getByText("Offline rules").first()).toBeVisible();
  qualityData.aiFallbackBadge = "Offline rules";
});

test("evidence pack: six QA screenshots", async ({ page }) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  async function shot(
    name: string,
    url: string,
    width: number,
    height: number,
    settlePage: (p: Page) => Promise<void>,
  ) {
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: "load" });
    await settlePage(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, name) });
    qualityData.screenshots.push(name);
  }

  // S01 home, desktop.
  await shot("S01-home-1440.png", "/", 1440, 900, async (p) => {
    await expect(
      p.getByRole("heading", { name: "What topic do you need help with?" }),
    ).toBeVisible();
  });

  // S02 home, 320x568.
  await shot("S02-home-320.png", "/", 320, 568, async (p) => {
    await expect(
      p.getByRole("heading", { name: "What topic do you need help with?" }),
    ).toBeVisible();
  });

  // S03 auth dialog open via the deep link.
  await shot("S03-auth-dialog.png", "/?auth=open", 1440, 900, async (p) => {
    await expect(p.getByRole("dialog")).toBeVisible();
    await expect(
      p.getByRole("heading", { name: "Sign in to UnseenLab" }),
    ).toBeVisible();
  });

  // S04 lab predict step.
  await shot(
    "S04-lab-predict.png",
    "/lab/nuclear-chain-reaction",
    1440,
    900,
    async (p) => {
      await expect(
        p.getByRole("button", { name: "Submit prediction" }),
      ).toBeVisible();
    },
  );

  // S05 lab results step after one trial (same deterministic flow as the
  // adaptation test above).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lab/nuclear-chain-reaction", { waitUntil: "load" });
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();
  await expect(
    page.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "S05-lab-results.png") });
  qualityData.screenshots.push("S05-lab-results.png");

  // S06 research consent gate. The /research route is absent from the
  // current .next build (build time < HEAD commit that added it), so the
  // page 404s — record that honestly instead of failing the whole pack.
  const researchCheck = await page.request.get("/research");
  if (researchCheck.status() !== 200) {
    qualityData.researchPageStatus = researchCheck.status();
    qualityData.screenshots.push(
      "S06-research-consent.png (NOT captured — /research returned " +
        `${researchCheck.status()} in the current build)`,
    );
  } else {
    await shot("S06-research-consent.png", "/research", 1440, 900, async (p) => {
      await expect(
        p.getByRole("heading", { name: "Product research session" }),
      ).toBeVisible();
      await expect(p.getByRole("button", { name: "Agree and begin" })).toBeVisible();
    });
  }
});
