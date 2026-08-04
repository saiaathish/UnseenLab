import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  test,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * Cross-device session resume — real backend e2e against a LOCAL Supabase
 * stack (postgres + GoTrue on http://localhost:54321, anon + service keys).
 *
 * ---------------------------------------------------------------
 * HOW TO RUN (the npm script belongs to package.json, owned by another
 * agent; this is the exact equivalent until it lands there):
 *
 *   # 1. The app build must be made WITH the Supabase env baked in:
 *   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local anon key> \
 *   npm run build
 *
 *   # 2. Run the spec with the local stack up and the service key exported:
 *   SUPABASE_SERVICE_ROLE_KEY=<local service key> \
 *   CROSS_DEVICE_E2E=1 \
 *   npx playwright test e2e/cross-device-resume.spec.ts
 *
 *   # optional overrides:
 *   E2E_BASE_URL=http://localhost:3100   (default)
 *   SUPABASE_URL=http://localhost:54321  (default; forwarded to the seed)
 *
 *   npm-script equivalent for package.json (NOT added by this agent):
 *   "test:e2e:cross": "CROSS_DEVICE_E2E=1 playwright test e2e/cross-device-resume.spec.ts"
 *
 * When CROSS_DEVICE_E2E is not set, every test here is skipped so the suite
 * stays green in CI without the local stack (same contract as
 * NOT_RUN_EXTERNAL_CREDENTIALS, but now backed by a REAL local backend).
 * ---------------------------------------------------------------
 *
 * Honesty notes:
 * - The session cookie injected into each browser context is a REAL session
 *   minted by the real local GoTrue via the password grant
 *   (scripts/e2e-seed-auth.mjs). Only the Google OAuth round trip is skipped;
 *   the app authenticates against the real backend exactly as after OAuth.
 * - No network is intercepted and no API is stubbed: dashboard rows, resume
 *   snapshots and sync saves all hit the real stack through the app's own
 *   code paths.
 * - Where the product deliberately cannot do what a naive cross-device flow
 *   demands, the step is SKIPPED with the contract reason and the closest
 *   REAL behavior is asserted instead (see the last test).
 *
 * Contract references: docs/platform-contracts.md §5 (sync), §3 (RLS);
 * docs/platform-copy-spec.md §5 (dashboard), §7 (sync/import);
 * docs/test-plan-platform.md (honesty rules).
 */

const ENABLED = process.env.CROSS_DEVICE_E2E === "1";

test.skip(
  !ENABLED,
  "CROSS_DEVICE_E2E=1 is not set — this spec needs the local Supabase stack " +
    "(postgres + GoTrue on http://localhost:54321), a build baked with " +
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and " +
    "SUPABASE_SERVICE_ROLE_KEY for seeding. Skipping keeps the suite green " +
    "without the stack.",
);

test.describe.configure({ mode: "serial" });

const BASE_URL = (
  process.env.E2E_BASE_URL ?? "http://localhost:3100"
).replace(/\/+$/, "");
const SEED_SCRIPT = path.join(__dirname, "..", "scripts", "e2e-seed-auth.mjs");
const SUPABASE_API = new URL(
  process.env.SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? "http://localhost:54321",
);

const EVIDENCE_KEY = "unseenlab.evidence.v1";
const SESSION_ID_KEY = "unseenlab.session-id.v1";

interface CookieChunk {
  name: string;
  value: string;
}

interface MintedSession {
  email: string;
  userId: string | null;
  cookieName: string;
  cookieValue: string;
  chunks: CookieChunk[];
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

/** Evidence ids captured on device A after the guest trial. */
interface DeviceAEvidence {
  sessionId: string;
  trialIds: string[];
  predictionIds: string[];
  trialCount: number;
}

let learnerA: MintedSession;
let learnerB: MintedSession;
let cloudSessionId: string;
let deviceAEvidence: DeviceAEvidence;
let deviceAContext: BrowserContext;
let deviceBContext: BrowserContext;
let deviceCContext: BrowserContext;
let deviceBPage: Page;

function runSeed(args: string[]): string {
  return execFileSync(process.execPath, [SEED_SCRIPT, ...args], {
    env: {
      ...process.env,
      SUPABASE_URL: SUPABASE_API.href.replace(/\/+$/, ""),
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function mintSession(email: string): MintedSession {
  const stdout = runSeed(["token", email]);
  return JSON.parse(stdout) as MintedSession;
}

/** Injects the minted session cookie into a fresh browser context. */
async function signInContext(
  context: BrowserContext,
  session: MintedSession,
): Promise<void> {
  await context.addCookies(
    session.chunks.map((chunk) => ({
      name: chunk.name,
      value: chunk.value,
      url: BASE_URL,
      path: "/",
    })),
  );
}

async function runFirstTrial(page: Page): Promise<void> {
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();
  await expect(
    page.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible({ timeout: 30_000 });
}

function readLocalEvidence(
  page: Page,
): Promise<{
  trials: Array<{ id: string }>;
  predictions: Array<{ id: string }>;
}> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw
      ? { trials: JSON.parse(raw).trials ?? [], predictions: JSON.parse(raw).predictions ?? [] }
      : { trials: [], predictions: [] };
  }, EVIDENCE_KEY);
}

test.beforeAll(() => {
  // Never touch the network when the suite is env-gated off.
  if (!ENABLED) return;
  console.log(
    `[cross-device] seeding auth users via ${SEED_SCRIPT} against ${SUPABASE_API.href}`,
  );
  runSeed(["create"]);
  learnerA = mintSession("learner_a@test.local");
  learnerB = mintSession("learner_b@test.local");
  if (!learnerA.cookieName) {
    throw new Error("seed script returned no cookieName — see stderr above");
  }
});

test.afterAll(async () => {
  for (const context of [deviceAContext, deviceBContext, deviceCContext]) {
    if (context) await context.close().catch(() => {});
  }
});

test("device A: guest trial, then sign-in imports the session to the account", async ({
  browser,
}) => {
  // Device A starts fully signed out: a genuine guest session.
  deviceAContext = await browser.newContext();
  const page = await deviceAContext.newPage();
  await page.goto("/lab/nuclear-chain-reaction");

  // The header proves the signed-out phase (no avatar menu yet).
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await runFirstTrial(page);
  await expect(
    page.getByRole("heading", { name: /ready for another trial/i }),
  ).toBeVisible();

  // Capture the guest evidence ids BEFORE any cloud write so the resume on
  // device B can prove id-for-id identity.
  const local = await readLocalEvidence(page);
  expect(local.trials).toHaveLength(1);
  expect(local.predictions).toHaveLength(1);
  const sessionId = await page.evaluate((key) => localStorage.getItem(key), SESSION_ID_KEY);
  expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  deviceAEvidence = {
    sessionId: sessionId as string,
    trialIds: local.trials.map((t) => t.id),
    predictionIds: local.predictions.map((p) => p.id),
    trialCount: local.trials.length,
  };

  // Sign in: the minted session cookie is a real GoTrue session, so this is
  // the post-OAuth state with the Google round trip skipped.
  await signInContext(deviceAContext, learnerA);
  await page.reload();

  // Consent-only guest import dialog (copy spec §7.2, IMP-01/IMP-03).
  await expect(
    page.getByRole("heading", { name: "Save your current learning session?" }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(
    page.getByText("Your session is saved to your account."),
  ).toBeVisible({ timeout: 15_000 });

  // Import is idempotent and keeps the evidence: one cloud row, same ids.
  const afterImport = await readLocalEvidence(page);
  expect(afterImport.trials).toHaveLength(1);
  expect(afterImport.trials[0].id).toBe(deviceAEvidence.trialIds[0]);
  expect(afterImport.predictions[0].id).toBe(deviceAEvidence.predictionIds[0]);
});

test("device B (same account): dashboard shows the imported session", async ({
  browser,
}) => {
  deviceBContext = await browser.newContext();
  await signInContext(deviceBContext, learnerA);
  const page = await deviceBContext.newPage();

  await page.goto("/dashboard");

  // Signed in: greeting derives the name from the profile/email (copy §5.1).
  await expect(
    page.getByRole("heading", { level: 1, name: /learner_a/i }),
  ).toBeVisible({ timeout: 20_000 });

  // Recent sessions (copy §5.5): exactly the one active session, 1 trial.
  await expect(
    page.getByRole("heading", { name: "Recent sessions" }),
  ).toBeVisible();
  await expect(page.getByText(/1 completed trial/)).toBeVisible();
  const resumeLink = page.getByRole("link", { name: "Resume" });
  await expect(resumeLink).toBeVisible();
  const href = await resumeLink.getAttribute("href");
  expect(href).toMatch(/\/lab\/nuclear-chain-reaction\?resume=/);
  cloudSessionId = new URL(href as string, BASE_URL).searchParams.get("resume") as string;
  expect(cloudSessionId).toMatch(/^[0-9a-f-]{36}$/i);

  // The cloud row is the one device A imported (same stable session id).
  expect(cloudSessionId).toBe(deviceAEvidence.sessionId);
});

test("device B (same account): ?resume restores the session with the SAME evidence ids", async () => {
  // No shared `page` fixture: contexts are owned by this file.
  deviceBPage = await deviceBContext.newPage();
  const page = deviceBPage;
  await page.goto(`/lab/nuclear-chain-reaction?resume=${cloudSessionId}`);

  // Resume prompt (copy: "Continue where you left off?").
  await expect(
    page.getByRole("heading", { name: /continue where you left off/i }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(/you have a saved nuclear chain reaction session with 1 completed trial/i),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue saved session" }).click();

  // The restored session is the cloud snapshot, id-for-id.
  await expect(
    page.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible({ timeout: 20_000 });
  const restored = await readLocalEvidence(page);
  expect(restored.trials).toHaveLength(deviceAEvidence.trialCount);
  expect(restored.trials[0].id).toBe(deviceAEvidence.trialIds[0]);
  expect(restored.predictions[0].id).toBe(deviceAEvidence.predictionIds[0]);

  // The lab adopted the cloud row id so the next save continues the same row.
  const adoptedId = await page.evaluate((key) => localStorage.getItem(key), SESSION_ID_KEY);
  expect(adoptedId).toBe(cloudSessionId);
});

test("device B runs trial 2; device A's DASHBOARD shows the updated session (2 trials)", async () => {
  const pageB = deviceBPage;
  await pageB.bringToFront();

  // Trial 2 on device B, continuing the resumed session.
  await pageB.getByRole("button", { name: /update my prediction/i }).click();
  await pageB.getByRole("radio", { name: /grows much faster than before/i }).click();
  await pageB.getByRole("button", { name: /submit updated prediction/i }).click();
  await expect(
    pageB.getByRole("heading", { name: /trial 2 — run another trial/i }),
  ).toBeVisible();
  await pageB.locator("#param-materialDensity").fill("0.4");
  await pageB.getByRole("button", { name: "Run trial" }).click();
  await expect(
    pageB.getByRole("heading", { name: /watch what happened/i }),
  ).toBeVisible({ timeout: 30_000 });

  // Wait for the debounced cloud upsert of the 2-trial copy (real network).
  await pageB.waitForResponse(
    (response) =>
      response.ok() &&
      response.url().includes("/rest/v1/learning_sessions") &&
      ["POST", "PATCH", "PUT"].includes(response.request().method()),
    { timeout: 20_000 },
  );

  const onB = await readLocalEvidence(pageB);
  expect(onB.trials).toHaveLength(2);

  // Device A never received the newer copy in its LAB (see the SKIP below);
  // what the product actually does — and what the sync contract promises —
  // is that device A's DASHBOARD, server-rendered straight from the
  // learning_sessions table, shows the updated cloud row.
  const pageA = deviceAContext.pages()[0];
  await pageA.bringToFront();
  await pageA.goto("/dashboard");
  await expect(
    pageA.getByText(/2 completed trials/),
  ).toBeVisible({ timeout: 20_000 });
  await expect(pageA.getByText("In progress").first()).toBeVisible();
});

test("device A's lab auto-pulls the newer cloud copy — SKIPPED: not a product behavior", async () => {
  // The naive cross-device flow would reload device A's LAB and expect it to
  // show the 2-trial copy automatically. The product deliberately does NOT do
  // this: docs/platform-contracts.md §5 keeps local state the source of truth
  // during an active lab, and SessionResumeDialog only offers a cloud session
  // when there is NO local evidence. Device A's lab keeps its local 1-trial
  // copy; its dashboard reflects the cloud truth (asserted in the previous
  // test). This step is documented, not faked.
  test.skip(
    true,
    "Product behavior absent by design: no automatic cloud pull into a lab " +
      "session that already has local evidence (sync contract §5: local remains " +
      "source of truth during an active lab; resume is offered only when local " +
      "evidence is empty). The REAL cross-device assertion — device A's " +
      "dashboard shows 2 completed trials — is covered by the previous test.",
  );
});

test("isolation: learner_b's dashboard shows zero learner_a sessions", async ({
  browser,
}) => {
  deviceCContext = await browser.newContext();
  await signInContext(deviceCContext, learnerB);
  const page = await deviceCContext.newPage();

  await page.goto("/dashboard");

  await expect(
    page.getByRole("heading", { level: 1, name: /learner_b/i }),
  ).toBeVisible({ timeout: 20_000 });

  // RLS-verified empty state (copy §5.5 EMP-01 / §5.2 DASH-15): learner_b can
  // see the dashboard scaffolding but never learner_a's rows.
  await expect(page.getByText("No sessions yet.")).toBeVisible();
  await expect(
    page.getByText("Your lab sessions will appear here once you start one."),
  ).toBeVisible();
  await expect(page.getByText("Nothing in progress right now.")).toBeVisible();
  await expect(page.getByText("In progress")).toHaveCount(0);
  await expect(page.getByText(/1 completed trial/)).toHaveCount(0);
});
