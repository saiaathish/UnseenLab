import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
} from "@playwright/test";

/**
 * Two-user browser isolation — real backend e2e, additive and env-gated
 * (same pattern as the cross-device spec). Proves, in a real browser with
 * REAL session cookies against a REAL Firebase project + MongoDB:
 *
 *   1. learner_a sees an EMPTY cloud, PUTs a session (200, revision 1).
 *   2. learner_b sees an EMPTY cloud (isolation) and PUTting the SAME
 *      session id is a 409 (cross-user conflict — the unique `id` index).
 *   3. learner_a's session persists with revision >= 1.
 *   4. Sign-out privacy (UI): the user-menu sign-out shows the keep/clear
 *      dialog with both mandated options; "Keep" returns home and
 *      /dashboard now redirects to /?auth=open.
 *
 * ---------------------------------------------------------------
 * HOW TO RUN:
 *   set -a; source .env; source .env.local; set +a
 *   ISOLATION_E2E=1 npx playwright test e2e/isolation.spec.ts
 *
 * Prerequisites: real FIREBASE_SERVICE_ACCOUNT + MONGODB_URI (server
 * secrets), NEXT_PUBLIC_FIREBASE_API_KEY (publishable, needed for the token
 * exchange), a build BAKED with the NEXT_PUBLIC_FIREBASE_* envs, and the
 * Mongo collections/indexes from scripts/mongo-setup.mjs (the unique `id`
 * index on learning_sessions is what makes step 2 a 409 instead of a
 * duplicate row).
 *
 * When ISOLATION_E2E is not set, every test here is skipped so the suite
 * stays green in CI (identical contract to CROSS_DEVICE_E2E).
 * ---------------------------------------------------------------
 */

const ENABLED = process.env.ISOLATION_E2E === "1";

test.skip(
  !ENABLED,
  "ISOLATION_E2E=1 is not set — this spec needs real Firebase + MongoDB " +
    "creds (FIREBASE_SERVICE_ACCOUNT, MONGODB_URI, NEXT_PUBLIC_FIREBASE_API_KEY " +
    "for seeding), a build baked with the NEXT_PUBLIC_FIREBASE_* envs, and the " +
    "Mongo collections/indexes from scripts/mongo-setup.mjs. Skipping keeps " +
    "the suite green without external credentials.",
);

test.describe.configure({ mode: "default" });

const BASE_URL = (
  process.env.E2E_BASE_URL ?? "http://localhost:3100"
).replace(/\/+$/, "");
const SEED_SCRIPT = path.join(__dirname, "..", "scripts", "e2e-seed-auth.mjs");

interface MintedSession {
  email: string;
  userId: string;
  cookieName: string;
  cookieValue: string;
  cookieBytes: number;
  expiresAt: number;
}

const SESSION_ID = "9f2d1c5e-6a10-4b3e-8d07-2a1f5c9e4b61";
const CLOUD_URL = `${BASE_URL}/api/cloud/sessions`;

/** Minimal valid write payload (schema in src/app/api/cloud/sessions/route.ts). */
function sessionPayload() {
  return {
    id: SESSION_ID,
    lab_slug: "nuclear-chain-reaction",
    status: "active",
    title: "Nuclear Chain Reaction",
    schema_version: 1,
    evidence: { trials: [], predictions: [] },
    workflow: { pendingPrediction: null },
    completed_at: null,
  };
}

let learnerA: MintedSession;
let learnerB: MintedSession;

function runSeed(args: string[]): string {
  return execFileSync(process.execPath, [SEED_SCRIPT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function mintSession(email: string): MintedSession {
  return JSON.parse(runSeed(["token", email])) as MintedSession;
}

async function signedInContext(
  browser: Browser,
  session: MintedSession,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addCookies([
    { name: session.cookieName, value: session.cookieValue, url: BASE_URL },
  ]);
  return context;
}

test.beforeAll(() => {
  if (!ENABLED) return;
  console.log(`[isolation] seeding auth users via ${SEED_SCRIPT}`);
  runSeed(["create"]);
  learnerA = mintSession("learner_a@test.local");
  learnerB = mintSession("learner_b@test.local");
  if (!learnerA.cookieName || !learnerA.cookieValue || !learnerB.cookieValue) {
    throw new Error("seed script returned no session cookie — see stderr above");
  }
  expect(learnerA.cookieBytes).toBeLessThan(4096);
  expect(learnerB.cookieBytes).toBeLessThan(4096);
});

test.afterAll(() => {
  // Contexts are created and closed per test (each test is independent so a
  // contract failure in one does not hide evidence from the others).
});

test("learner_a: empty cloud, then PUT creates the session at revision 1", async ({
  browser,
}) => {
  const context = await signedInContext(browser, learnerA);
  try {
    const page = await context.newPage();

    const listBefore = await page.request.get(CLOUD_URL);
    expect(listBefore.status()).toBe(200);
    const listBody = (await listBefore.json()) as {
      data: { sessions: unknown[] };
    };
    expect(listBody.data.sessions).toEqual([]);

    const put = await page.request.put(CLOUD_URL, {
      data: sessionPayload(),
    });
    expect(put.status()).toBe(200);
    const putBody = (await put.json()) as {
      data: { session: { id: string; revision: number } };
    };
    expect(putBody.data.session.id).toBe(SESSION_ID);
    expect(putBody.data.session.revision).toBe(1);
  } finally {
    await context.close().catch(() => {});
  }
});

test("learner_b: isolated cloud (empty), and the same session id is a 409", async ({
  browser,
}) => {
  const context = await signedInContext(browser, learnerB);
  try {
    const page = await context.newPage();

    // Isolation: learner_b's cloud is empty even though learner_a wrote.
    const list = await page.request.get(CLOUD_URL);
    expect(list.status()).toBe(200);
    const listBody = (await list.json()) as { data: { sessions: unknown[] } };
    expect(listBody.data.sessions).toEqual([]);

    // Cross-user conflict: the id is owned by learner_a (unique `id` index).
    const put = await page.request.put(CLOUD_URL, {
      data: sessionPayload(),
    });
    expect(put.status()).toBe(409);
    const putBody = (await put.json()) as { error?: string };
    expect(putBody.error).toBe("conflict");
  } finally {
    await context.close().catch(() => {});
  }
});

test("learner_a: the session persists at revision >= 1", async ({ browser }) => {
  const context = await signedInContext(browser, learnerA);
  try {
    const page = await context.newPage();
    // The row is created by the first test in a full run; when this test runs
    // alone (e.g. -g), recreate it idempotently so the persistence claim is
    // still exercised honestly.
    const maybe = await page.request.get(`${CLOUD_URL}?id=${SESSION_ID}`);
    const maybeBody = (await maybe.json()) as {
      data: { session: { revision: number } | null };
    };
    if (maybeBody.data.session === null) {
      const create = await page.request.put(CLOUD_URL, {
        data: sessionPayload(),
      });
      expect(create.status()).toBe(200);
    }

    const byId = await page.request.get(`${CLOUD_URL}?id=${SESSION_ID}`);
    expect(byId.status()).toBe(200);
    const body = (await byId.json()) as {
      data: { session: { id: string; revision: number } | null };
    };
    expect(body.data.session).not.toBeNull();
    expect(body.data.session?.id).toBe(SESSION_ID);
    expect(body.data.session?.revision).toBeGreaterThanOrEqual(1);
  } finally {
    await context.close().catch(() => {});
  }
});

test("sign-out privacy (UI): keep/clear dialog, Keep returns home and /dashboard is gated again", async ({
  browser,
}) => {
  const context = await signedInContext(browser, learnerA);
  try {
    const page = await context.newPage();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);

  // Signed in via the injected real session cookie: the avatar menu is the
  // only account surface (copy spec §2.2).
  const menuTrigger = page.getByRole("button", {
    name: /account menu for learner_a/i,
  });
  await expect(menuTrigger).toBeVisible({ timeout: 20_000 });
  await menuTrigger.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  // The mandated sign-out choice dialog (src/components/auth/sign-out-dialog.tsx).
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign out of UnseenLab?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your learning data on this device is kept private to this browser."),
  ).toBeVisible();
  const keep = page.getByRole("button", {
    name: "Sign out and keep my data on this device",
  });
  const clear = page.getByRole("button", {
    name: "Sign out and clear data on this device",
  });
  await expect(keep).toBeVisible();
  await expect(clear).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

  // "Keep": cloud data untouched, local device data kept, account session ends.
  await keep.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "What topic do you need help with?" }),
  ).toBeVisible({ timeout: 20_000 });

  // The server cookie is gone: /dashboard is gated again for the same context.
  await page.goto("/dashboard");
  await page.waitForURL(/\?auth=open/);
  await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    await context.close().catch(() => {});
  }
});
