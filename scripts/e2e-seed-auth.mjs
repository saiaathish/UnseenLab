#!/usr/bin/env node
/**
 * e2e-seed-auth.mjs — seeds two learner accounts on a REAL Firebase Auth
 * project + a REAL MongoDB (Atlas or local) and mints a REAL session cookie
 * for the cross-device e2e without a browser.
 *
 * Dependencies (both already in package.json): `firebase-admin` (server SDK,
 * custom token + session cookie) and `mongodb` (driver v7, seeding).
 *
 * Environment:
 *   FIREBASE_SERVICE_ACCOUNT      (required) — service-account JSON as a
 *                                 single line; must contain project_id,
 *                                 client_email, private_key
 *   NEXT_PUBLIC_FIREBASE_API_KEY  (required for `token`) — the web app's
 *                                 publishable API key, used for the
 *                                 Identity Toolkit REST exchange
 *   MONGODB_URI                   (required for `create`) — server secret
 *   MONGODB_DB                    (optional, default `unseenlab`)
 *
 * Usage:
 *   node scripts/e2e-seed-auth.mjs create
 *       Idempotently creates learner_a@test.local and learner_b@test.local on
 *       Firebase Auth (getUserByEmail first; createUser when missing), upserts
 *       each learner's `profiles` row with onboarding_version = 1 (so the
 *       auth callback routes them to /dashboard instead of /onboarding), and
 *       DELETES all `learning_sessions` + `learner_preferences` docs for both
 *       users (clean slate for repeatable runs). Prints a human summary on
 *       stdout; detail logs go to stderr.
 *
 *   node scripts/e2e-seed-auth.mjs token <email>
 *       Mints a session cookie WITHOUT a browser, exactly as the server's
 *       POST /api/auth/session path would:
 *         getAuth().createCustomToken(uid)            — admin SDK
 *         POST identitytoolkit .../accounts:signInWithCustomToken?key=<API_KEY>
 *           body { token, returnSecureToken: true }   — exchanges for an idToken
 *         getAuth().createSessionCookie(idToken, { expiresIn: 14d })
 *       and prints ONE JSON object on stdout (logs go to stderr):
 *         cookieName   — "unseenlab.session" (must match
 *                        src/lib/firebase/server.ts SESSION_COOKIE_NAME)
 *         cookieValue  — the raw cookie value for context.addCookies()
 *         cookieBytes  — UTF-8 byte length of cookieValue (measured)
 *         email, userId, expiresAt (ms since epoch)
 *
 * Cookie-size design decision
 * ---------------------------
 * The app expects ONE cookie named `unseenlab.session` (the server reads it
 * with cookies().get(SESSION_COOKIE_NAME) — there is no chunk-recombine
 * path), so this script mints a SINGLE cookie and measures it at runtime.
 * Browsers cap an individual cookie at 4096 bytes (name+value line); a
 * Firebase session cookie is a compact JWT (~1–1.5 KB with the standard
 * claim set), comfortably under the cap. If a build ever measures
 * cookieBytes approaching 3800, do NOT reintroduce the old @supabase/ssr
 * chunking scheme (the server would not recombine it) — redesign the server
 * contract first (e.g. a session-reference cookie + server-side store).
 */

import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { MongoClient } from "mongodb";

const USERS = [
  { email: "learner_a@test.local", password: "UnseenLab-e2e-2026-dev" },
  { email: "learner_b@test.local", password: "UnseenLab-e2e-2026-dev" },
];

/** Must match src/lib/firebase/server.ts (the server reads exactly this name). */
const SESSION_COOKIE_NAME = "unseenlab.session";
/** Must match src/lib/firebase/server.ts SESSION_COOKIE_MAX_AGE_MS (14 days). */
const SESSION_COOKIE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Browser per-cookie hard limit (name=value line). */
const COOKIE_HARD_LIMIT_BYTES = 4096;
/** Warn well below the hard limit so there is headroom for the name + attrs. */
const COOKIE_WARN_BYTES = 3800;

const IDENTITY_TOOLKIT_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";

const DB_NAME = process.env.MONGODB_DB?.trim() || "unseenlab";

class SeedError extends Error {}

function fail(message) {
  console.error(`[e2e-seed-auth] ${message}`);
  process.exit(1);
}

function isAuthError(error, code) {
  return (
    typeof error?.code === "string" &&
    error.code.includes(code)
  );
}

/** Lazily initializes the firebase-admin app from FIREBASE_SERVICE_ACCOUNT. */
function initAdminAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    fail(
      "FIREBASE_SERVICE_ACCOUNT is required (service-account JSON as a single line; " +
        "see docs/firebase-mongodb-setup.md).",
    );
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    fail("FIREBASE_SERVICE_ACCOUNT is not valid JSON — check quoting/newlines.");
  }
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    fail(
      "FIREBASE_SERVICE_ACCOUNT JSON is missing project_id, client_email or private_key.",
    );
  }
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: sa.private_key,
      }),
      projectId: sa.project_id,
    });
  }
  return getAuth();
}

/**
 * Idempotent user creation: getUserByEmail first (also covers a
 * createUser-then-"already exists" race), createUser when missing.
 */
async function ensureAuthUser(auth, { email, password }) {
  try {
    const user = await auth.getUserByEmail(email);
    console.log(`[e2e-seed-auth] ${email} already exists (${user.uid}) — skipped`);
    return { user, created: false };
  } catch (error) {
    if (!isAuthError(error, "user-not-found")) {
      throw error;
    }
  }
  const user = await auth.createUser({ email, password });
  console.log(`[e2e-seed-auth] created ${email} (${user.uid})`);
  return { user, created: true };
}

/**
 * Clean-slate Mongo seeding: profiles upserted to onboarding_version = 1
 * (so /dashboard renders instead of redirecting to /onboarding — the old
 * script's PATCH-equivalent), sessions + preferences deleted for both users.
 */
async function seedMongo(userIdsByEmail) {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    fail(
      "MONGODB_URI is required for seeding (server secret; see docs/firebase-mongodb-setup.md).",
    );
  }
  const client = new MongoClient(uri.trim());
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const profiles = db.collection("profiles");
    const sessions = db.collection("learning_sessions");
    const preferences = db.collection("learner_preferences");

    const now = new Date().toISOString();
    const uids = Object.values(userIdsByEmail);
    const summary = [];

    for (const [email, uid] of Object.entries(userIdsByEmail)) {
      const result = await profiles.updateOne(
        { user_id: uid },
        {
          $set: {
            onboarding_version: 1,
            onboarding_completed_at: now,
            updated_at: now,
          },
          // New rows get the full row contract; existing rows keep any
          // display_name/avatar_url (the test never sets them).
          $setOnInsert: {
            display_name: null,
            avatar_url: null,
            created_at: now,
          },
        },
        { upsert: true },
      );
      summary.push({
        email,
        profile: result.upsertedCount === 1 ? "inserted" : "updated",
      });
    }

    const sessionsDeleted = (await sessions.deleteMany({ user_id: { $in: uids } }))
      .deletedCount;
    const preferencesDeleted = (
      await preferences.deleteMany({ user_id: { $in: uids } })
    ).deletedCount;

    console.log(
      `[e2e-seed-auth] mongo clean slate (db "${DB_NAME}"): deleted ` +
        `${sessionsDeleted} learning_sessions, ${preferencesDeleted} learner_preferences`,
    );
    return { summary, sessionsDeleted, preferencesDeleted };
  } finally {
    await client.close();
  }
}

async function runCreate() {
  const auth = initAdminAuth();

  const userIdsByEmail = {};
  const users = [];
  for (const { email, password } of USERS) {
    const { user, created } = await ensureAuthUser(auth, { email, password });
    userIdsByEmail[email] = user.uid;
    users.push({ email, id: user.uid, created });
  }

  const mongo = await seedMongo(userIdsByEmail);
  console.log(
    "[e2e-seed-auth] create complete:",
    JSON.stringify({ users, ...mongo }, null, 2),
  );
}

async function runToken(email) {
  const known = USERS.find((u) => u.email === email);
  if (!known) {
    fail(
      `unknown email "${email}" — expected one of ${USERS.map((u) => u.email).join(", ")}`,
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    fail(
      "NEXT_PUBLIC_FIREBASE_API_KEY is required for the token exchange " +
        "(the project's web API key; it is publishable, matching the browser config).",
    );
  }

  const auth = initAdminAuth();

  let record;
  try {
    record = await auth.getUserByEmail(email);
  } catch (error) {
    if (isAuthError(error, "user-not-found")) {
      fail(`no Firebase user for ${email} — run \`create\` first.`);
    }
    throw error;
  }

  // Step 1: admin SDK mints a custom token for the uid (no browser needed).
  const customToken = await auth.createCustomToken(record.uid);

  // Step 2: exchange it for an ID token via the public Identity Toolkit REST
  // endpoint (the same exchange the Firebase client SDK performs internally).
  const response = await fetch(
    `${IDENTITY_TOOLKIT_ENDPOINT}?key=${encodeURIComponent(apiKey.trim())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.idToken) {
    fail(
      `Identity Toolkit signInWithCustomToken -> ${response.status}: ` +
        `${payload?.error?.message ?? JSON.stringify(payload).slice(0, 300)}`,
    );
  }

  // Step 3: exchange the ID token for the httpOnly session cookie value the
  // app's server verifies (same call as src/lib/firebase/server.ts).
  const cookieValue = await auth.createSessionCookie(payload.idToken, {
    expiresIn: SESSION_COOKIE_MAX_AGE_MS,
  });
  if (!cookieValue) {
    fail("createSessionCookie returned no cookie value.");
  }

  const cookieBytes = Buffer.byteLength(cookieValue, "utf8");
  if (cookieBytes > COOKIE_WARN_BYTES) {
    console.error(
      `[e2e-seed-auth] WARNING: session cookie is ${cookieBytes} bytes (> ${COOKIE_WARN_BYTES}). ` +
        `The browser per-cookie hard limit is ${COOKIE_HARD_LIMIT_BYTES} bytes and the app expects ` +
        `ONE cookie named "${SESSION_COOKIE_NAME}" (no chunk-recombine path exists server-side). ` +
        "This is not expected for a Firebase session cookie (~1–1.5 KB); investigate before shipping.",
    );
  }

  process.stdout.write(
    JSON.stringify(
      {
        cookieName: SESSION_COOKIE_NAME,
        cookieValue,
        cookieBytes,
        email,
        userId: record.uid,
        expiresAt: Date.now() + SESSION_COOKIE_MAX_AGE_MS,
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
        "Env: FIREBASE_SERVICE_ACCOUNT (required), NEXT_PUBLIC_FIREBASE_API_KEY (required for `token`),\n" +
        `     MONGODB_URI (required for \`create\`), MONGODB_DB (optional, default ${DB_NAME})\n` +
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
