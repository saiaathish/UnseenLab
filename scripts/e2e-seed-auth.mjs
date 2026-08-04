#!/usr/bin/env node
/**
 * e2e-seed-auth.mjs — seeds two learner accounts on a LOCAL Supabase stack
 * (GoTrue on http://localhost:54321) and mints sessions for cross-device e2e.
 *
 * Zero dependencies: uses only global `fetch` (Node 18+) and `Buffer`.
 *
 * Environment:
 *   SUPABASE_URL              (default http://localhost:54321)
 *   SUPABASE_SERVICE_ROLE_KEY (required for `create`; used as the apikey for
 *                              the password-grant `token` call as well)
 *   SUPABASE_ANON_KEY         (optional; preferred apikey for `token` when set)
 *
 * Usage:
 *   node scripts/e2e-seed-auth.mjs create
 *       Idempotently creates learner_a@test.local and learner_b@test.local via
 *       the GoTrue admin API (GET /auth/v1/admin/users first; skip existing),
 *       and ensures each profile row is onboarding-complete
 *       (onboarding_version = 1) so /dashboard renders instead of redirecting
 *       to /onboarding. Prints a human summary on stdout.
 *
 *   node scripts/e2e-seed-auth.mjs token <email>
 *       Exchanges the seeded password for a real session
 *       (POST /auth/v1/token?grant_type=password) and prints ONE JSON object
 *       on stdout (logs go to stderr) containing:
 *         email, userId, cookieName, cookieValue, chunks, accessToken,
 *         refreshToken, expiresAt
 *       `chunks` is the ready-to-inject cookie list (name/value pairs) for
 *       Playwright `context.addCookies()` — the exact wire format
 *       @supabase/ssr writes (see cookie notes below).
 *
 * Cookie-name determination (evidence in node_modules/@supabase/ssr + auth-js):
 * - supabase-js dist/index.mjs line ~626:
 *     const defaultStorageKey = `sb-${baseUrl.hostname.split(".")[0]}-auth-token`;
 * - @supabase/ssr createBrowserClient.ts (lines ~128-132) forwards
 *   `options.cookieOptions.name` as `auth.storageKey` when provided, otherwise
 *   the supabase-js default above is used. The app's browser client
 *   (src/lib/supabase/browser-client.ts) passes no cookieOptions, so the cookie
 *   name for http://localhost:54321 is  sb-localhost-auth-token.
 * - Cookie VALUE format (@supabase/ssr src/cookies.ts setItem + chunker.ts):
 *   "base64-" + base64url(JSON.stringify(session)), chunked into
 *   MAX_CHUNK_SIZE = 3180-char pieces named <cookieName>.0, .1, ... when the
 *   encoded value overflows; readers combineChunks() then strip the prefix.
 *   This script replicates that encoding exactly so the injected cookie is
 *   byte-for-byte what the app itself would have written.
 *
 * Note: the session cookie injected this way is a REAL session minted by the
 * real local GoTrue — the only thing skipped is the Google OAuth round trip.
 */

const USERS = [
  {
    email: "learner_a@test.local",
    password: "UnseenLab-e2e-2026-dev",
  },
  {
    email: "learner_b@test.local",
    password: "UnseenLab-e2e-2026-dev",
  },
];

const SUPABASE_URL = (
  process.env.SUPABASE_URL ?? "http://localhost:54321"
).replace(/\/+$/, "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

/** Matches @supabase/ssr src/utils/chunker.ts MAX_CHUNK_SIZE. */
const MAX_CHUNK_SIZE = 3180;

class SeedError extends Error {}

function fail(message) {
  console.error(`[e2e-seed-auth] ${message}`);
  process.exit(1);
}

async function request(path, { method = "GET", body, apikey, token } = {}) {
  const headers = { apikey };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null
        ? payload.message ?? payload.error_description ?? payload.code ?? JSON.stringify(payload)
        : String(payload);
    throw new SeedError(`${method} ${path} -> ${response.status}: ${detail}`);
  }
  return payload;
}

function adminApikey() {
  if (!SERVICE_ROLE_KEY) {
    fail(
      "SUPABASE_SERVICE_ROLE_KEY is required (the local stack's service key; it bypasses RLS for seeding).",
    );
  }
  return SERVICE_ROLE_KEY;
}

function tokenApikey() {
  // The password-grant endpoint only needs a gateway key; prefer the anon
  // key (the app's publishable key) when provided, else the service key.
  return ANON_KEY || adminApikey();
}

/** Faithful port of @supabase/ssr createChunks (src/utils/chunker.ts). */
function createChunks(key, value) {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }];
  }
  const chunks = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, MAX_CHUNK_SIZE);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");
    if (lastEscapePos > MAX_CHUNK_SIZE - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }
    let valueHead = "";
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (error instanceof URIError && encodedChunkHead.at(-3) === "%" && encodedChunkHead.length > 3) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
        } else {
          throw error;
        }
      }
    }
    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }
  return chunks.map((value, i) => ({ name: `${key}.${i}`, value }));
}

/** Cookie name for the app's storage key (supabase-js default). */
function cookieNameFor(url) {
  const hostname = new URL(url).hostname;
  return `sb-${hostname.split(".")[0]}-auth-token`;
}

/** Full cookie value @supabase/ssr writes: "base64-" + base64url(session JSON). */
function encodeSessionCookie(session) {
  const json = JSON.stringify(session);
  const base64url = Buffer.from(json, "utf8").toString("base64url");
  return `base64-${base64url}`;
}

function findUser(users, email) {
  return users.find((u) => u.email === email);
}

async function listAuthUsers() {
  const payload = await request("/auth/v1/admin/users", {
    apikey: adminApikey(),
    token: SERVICE_ROLE_KEY,
  });
  return Array.isArray(payload?.users) ? payload.users : [];
}

async function createAuthUser(email, password) {
  const payload = await request("/auth/v1/admin/users", {
    method: "POST",
    apikey: adminApikey(),
    token: SERVICE_ROLE_KEY,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {},
      app_metadata: {},
    },
  });
  if (!payload?.id) {
    throw new SeedError(`admin create for ${email} returned no id`);
  }
  return payload;
}

/**
 * Ensures the profile row is onboarding-complete (onboarding_version = 1) so
 * /dashboard renders real data instead of redirecting to /onboarding. The
 * auth-triggered `handle_new_user` function (migration
 * 20260803193000_platform_schema.sql) creates the row on user creation with
 * onboarding_version 0; PATCH fixes it, POST covers a missing trigger/row.
 */
async function ensureOnboardingComplete(userId, email) {
  const now = new Date().toISOString();
  const headers = {
    apikey: adminApikey(),
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  let patched = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        onboarding_version: 1,
        onboarding_completed_at: now,
      }),
    },
  );

  if (patched.ok) {
    const rows = await patched.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  }

  const post = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_id: userId,
      onboarding_version: 1,
      onboarding_completed_at: now,
    }),
  });
  if (post.ok) {
    return true;
  }
  const detail = await post.text().catch(() => "");
  console.error(
    `[e2e-seed-auth] warning: could not mark ${email} onboarding-complete ` +
      `(PATCH ${patched.status}, POST ${post.status}${detail ? `: ${detail.slice(0, 200)}` : ""}). ` +
      "Is the platform migration applied to this stack? /dashboard will redirect to /onboarding.",
  );
  return false;
}

async function runCreate() {
  const existing = await listAuthUsers();
  const byEmail = new Map(existing.map((u) => [u.email, u]));

  const summary = [];
  for (const { email, password } of USERS) {
    const known = byEmail.get(email);
    let user = known;
    if (!user) {
      user = await createAuthUser(email, password);
      console.log(`[e2e-seed-auth] created ${email} (${user.id})`);
    } else {
      console.log(`[e2e-seed-auth] ${email} already exists (${user.id}) — skipped`);
    }
    const onboardingOk = await ensureOnboardingComplete(user.id, email);
    summary.push({ email, id: user.id, onboardingComplete: onboardingOk });
  }
  console.log("[e2e-seed-auth] create complete:", JSON.stringify(summary));
}

async function runToken(email) {
  const user = findUser(USERS, email);
  if (!user) {
    fail(`unknown email "${email}" — expected one of ${USERS.map((u) => u.email).join(", ")}`);
  }

  const payload = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    apikey: tokenApikey(),
    body: { email: user.email, password: user.password },
  });

  if (!payload?.access_token || !payload?.refresh_token) {
    fail(`password grant for ${email} returned no session (${JSON.stringify(payload).slice(0, 300)})`);
  }

  const session = { ...payload };
  session.expires_at =
    typeof session.expires_at === "number"
      ? session.expires_at
      : Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);

  const cookieName = cookieNameFor(SUPABASE_URL);
  const cookieValue = encodeSessionCookie(session);
  const chunks = createChunks(cookieName, cookieValue);

  process.stdout.write(
    JSON.stringify(
      {
        email: user.email,
        userId: session.user?.id ?? null,
        cookieName,
        cookieValue,
        chunks,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
      },
      null,
      2,
    ) + "\n",
  );
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === "create") {
    await runCreate();
  } else if (command === "token" && arg) {
    await runToken(arg);
  } else {
    console.error(
      "Usage:\n" +
        "  node scripts/e2e-seed-auth.mjs create\n" +
        "  node scripts/e2e-seed-auth.mjs token <email>\n" +
        `Env: SUPABASE_URL (default ${SUPABASE_URL}), SUPABASE_SERVICE_ROLE_KEY (required), SUPABASE_ANON_KEY (optional)\n` +
        `Known users: ${USERS.map((u) => u.email).join(", ")}`,
    );
    process.exit(2);
  }
}

main().catch((error) => {
  if (error instanceof SeedError) {
    fail(error.message);
  }
  console.error("[e2e-seed-auth] unexpected failure:", error);
  process.exit(1);
});
