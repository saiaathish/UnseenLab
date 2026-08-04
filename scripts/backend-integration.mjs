#!/usr/bin/env node
/**
 * backend-integration.mjs — real-backend integration suite for the UnseenLab
 * platform layer (Firebase Auth + MongoDB). Proves authorization, idempotency,
 * and concurrency against the ACTUAL services using a running app instance.
 *
 * The suite is coded against the platform CONTRACT for cloud sessions:
 *   - PUT upserts by { id, user_id }; user_id always comes from the verified
 *     session cookie, never from the body.
 *   - Every session doc carries an integer `revision` (>= 1) that increments
 *     on each applied write.
 *   - PUT accepts `expected_revision`: on mismatch the server returns
 *     409 { error: "conflict", data: { session } } with the current doc.
 *   - PUT accepts `mutation_id`: re-sending the same mutation_id replays the
 *     previous result idempotently (no revision bump, no re-apply).
 *
 * Usage:
 *   node scripts/backend-integration.mjs
 *
 * Environment (read from .env then .env.local, same KEY='value' format as the
 * repo's other scripts; an already-set process env wins over the files):
 *   FIREBASE_SERVICE_ACCOUNT      (required) — service-account JSON, one line
 *   NEXT_PUBLIC_FIREBASE_API_KEY  (required) — publishable web API key
 *   MONGODB_URI                   (required) — server secret
 *   MONGODB_DB                    (optional, default "unseenlab")
 *   APP_BASE_URL                  (optional, default http://localhost:3100)
 *
 * Exit codes:
 *   0 — every test passed
 *   1 — one or more tests failed
 *   2 — the app is not running (prints build/start instructions)
 *
 * Requires the app to be running on APP_BASE_URL:
 *   npm run build && npm run start -- -p 3100
 *
 * Never prints secrets: the service account and the MongoDB URI are used but
 * never written to stdout/stderr (Mongo details are counts only).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_SCRIPT = path.join(ROOT, "scripts", "e2e-seed-auth.mjs");

const LEARNER_A = "learner_a@test.local";
const LEARNER_B = "learner_b@test.local";
const LAB_SLUG = "nuclear-chain-reaction";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: String(detail) });
  console.log(`${ok ? "PASS" : "FAIL"} | ${name} — ${detail}`);
}

function fail(message) {
  console.error(`[backend-integration] ${message}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Environment loading (.env + .env.local, KEY='value' single-line)    */
/* ------------------------------------------------------------------ */

function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice("export ".length).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
        value = value.slice(1, -1);
      }
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
};
// An already-set process env wins over the files (lets callers override).
const env = { ...fileEnv, ...process.env };

const REQUIRED = [
  "FIREBASE_SERVICE_ACCOUNT",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "MONGODB_URI",
];
const missing = REQUIRED.filter((k) => !env[k] || !env[k].trim());
if (missing.length > 0) {
  fail(
    `missing required env (expected in .env / .env.local): ${missing.join(", ")}`
  );
}

const DB_NAME = (env.MONGODB_DB || "").trim() || "unseenlab";
const BASE = ((env.APP_BASE_URL || "").trim() || "http://localhost:3100").replace(
  /\/+$/,
  ""
);

/* ------------------------------------------------------------------ */
/* Subprocess helper (e2e-seed-auth.mjs)                               */
/* ------------------------------------------------------------------ */

function runSeed(args) {
  const res = spawnSync(process.execPath, [SEED_SCRIPT, ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    fail(
      `scripts/e2e-seed-auth.mjs ${args.join(" ")} exited ${res.status}${
        err ? ` — ${err.split("\n").slice(-3).join(" | ")}` : ""
      }`
    );
  }
  return res;
}

function mintCookie(email) {
  const res = runSeed(["token", email]);
  // The token command prints exactly ONE pretty-printed JSON object on stdout
  // (all logs go to stderr), so the whole stdout is the record.
  const stdout = res.stdout.trim();
  if (!stdout) fail(`token for ${email} produced no stdout JSON`);
  let record;
  try {
    record = JSON.parse(stdout);
  } catch {
    fail(`token for ${email} produced non-JSON stdout: ${stdout.slice(0, 120)}`);
  }
  if (!record.cookieValue || !record.userId) {
    fail(`token for ${email} missing cookieValue/userId`);
  }
  return record;
}

/* ------------------------------------------------------------------ */
/* HTTP + Mongo helpers                                                */
/* ------------------------------------------------------------------ */

async function api(method, pathname, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json };
}

let mongoClient = null;
let mongoDb = null;
async function getMongo() {
  if (!mongoClient) {
    mongoClient = new MongoClient(env.MONGODB_URI.trim());
    await mongoClient.connect();
    mongoDb = mongoClient.db(DB_NAME);
  }
  return mongoDb;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  /* Preflight: the app must be running (never start it ourselves). */
  let appUp = false;
  try {
    const res = await fetch(`${BASE}/api/cloud/sessions`, {
      signal: AbortSignal.timeout(5000),
    });
    appUp = res.status === 401 || res.status === 503; // live server answers
  } catch {
    appUp = false;
  }
  if (!appUp) {
    console.error(`[backend-integration] app is not answering at ${BASE}`);
    console.error("Build and start it first, then re-run this suite:");
    console.error("  npm run build && npm run start -- -p 3100");
    process.exit(2);
  }

  /* Seed real Firebase users + clean Mongo slate, mint real cookies. */
  runSeed(["create"]);
  const cookieA = mintCookie(LEARNER_A);
  const cookieB = mintCookie(LEARNER_B);
  const uidA = cookieA.userId;
  const uidB = cookieB.userId;
  if (cookieA.cookieName !== "unseenlab.session") {
    fail(`unexpected cookieName ${cookieA.cookieName}`);
  }
  const headerA = `unseenlab.session=${cookieA.cookieValue}`;
  const headerB = `unseenlab.session=${cookieB.cookieValue}`;

  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const sessionId = `it-${now}-${rand}`;

  const baseBody = {
    id: sessionId,
    lab_slug: LAB_SLUG,
    status: "active",
    title: "Integration Test — Nuclear Chain Reaction (backend-integration)",
    schema_version: 1,
    evidence: { prompt: "chain reaction", observations: ["a", "b", "c"] },
    workflow: { steps: ["predict", "run", "explain"], attempts: 1 },
    completed_at: null,
  };

  /* ---------------------------------------------------------------- */
  /* A1 — no cookie → 401                                              */
  /* ---------------------------------------------------------------- */
  {
    const r = await api("GET", "/api/cloud/sessions");
    check(
      "A1 no cookie → 401",
      r.status === 401,
      `status ${r.status} (expected 401)`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A2 — garbage cookie → 401                                         */
  /* ---------------------------------------------------------------- */
  {
    const r = await api("GET", "/api/cloud/sessions", {
      cookie: "unseenlab.session=definitely-not-a-valid-firebase-cookie",
    });
    check(
      "A2 garbage cookie → 401",
      r.status === 401,
      `status ${r.status} (expected 401)`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A3 — A creates a session; response carries revision >= 1          */
  /* ---------------------------------------------------------------- */
  let createdSession = null;
  {
    const r = await api("PUT", "/api/cloud/sessions", {
      cookie: headerA,
      body: baseBody,
    });
    createdSession = r.json?.data?.session ?? null;
    const rev = createdSession?.revision;
    check(
      "A3 PUT creates session with revision >= 1",
      r.status === 200 && Number.isInteger(rev) && rev >= 1,
      `status ${r.status}, revision=${rev} (contract: revision field on docs)`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A4 — client-supplied user_id is ignored                           */
  /* ---------------------------------------------------------------- */
  {
    const r = await api("PUT", "/api/cloud/sessions", {
      cookie: headerA,
      body: {
        ...baseBody,
        user_id: "someone-else",
        title: "A4 fake-uid ignored",
      },
    });
    const g = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerA,
    });
    const db = await getMongo();
    const mongoDoc = await db
      .collection("learning_sessions")
      .findOne({ id: sessionId });
    const apiUid = g.json?.data?.session?.user_id ?? null;
    const mongoUid = mongoDoc?.user_id ?? null;
    check(
      "A4 client-supplied user_id ignored",
      r.status === 200 && apiUid === uidA && mongoUid === uidA,
      `PUT ${r.status}; stored user_id via GET=${apiUid}, via Mongo=${mongoUid} (expected ${uidA})`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A5 — B cannot read A's session (isolation read)                   */
  /* ---------------------------------------------------------------- */
  {
    const g = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerB,
    });
    check(
      "A5 B cannot read A's session",
      g.status === 200 && g.json?.data?.session === null,
      `status ${g.status}, B sees session=${g.json?.data?.session ?? "null"}`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A6 — B cannot create a row under A's id                           */
  /* ---------------------------------------------------------------- */
  {
    const r = await api("PUT", "/api/cloud/sessions", {
      cookie: headerB,
      body: { ...baseBody, title: "A6 B attempt at A's id" },
    });
    const gB = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerB,
    });
    const gA = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerA,
    });
    check(
      "A6 B cannot create row with A's id",
      gB.json?.data?.session === null &&
        gA.json?.data?.session?.title === "A4 fake-uid ignored",
      `B's PUT status ${r.status} (unique-id index rejects the insert); ` +
        `B GET=${gB.json?.data?.session ?? "null"}, A row title="${gA.json?.data?.session?.title}"`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A7 — B cannot complete A's session                                */
  /* ---------------------------------------------------------------- */
  {
    const r = await api("POST", `/api/cloud/sessions/${sessionId}/complete`, {
      cookie: headerB,
    });
    const gA = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerA,
    });
    const statusA = gA.json?.data?.session?.status ?? null;
    check(
      "A7 B cannot complete A's session",
      gA.json?.data?.session !== null && statusA === "active",
      `B POST status ${r.status}; A's row status=${statusA} (still active)`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A8 — duplicate mutation_id replays idempotently                   */
  /* ---------------------------------------------------------------- */
  {
    const mutationId = `it-mut-${now}-${rand}`;
    const r1 = await api("PUT", "/api/cloud/sessions", {
      cookie: headerA,
      body: { ...baseBody, mutation_id: mutationId, title: "A8 replay first" },
    });
    const r2 = await api("PUT", "/api/cloud/sessions", {
      cookie: headerA,
      body: {
        ...baseBody,
        mutation_id: mutationId,
        title: "A8 replay second (must be ignored)",
      },
    });
    const s1 = r1.json?.data?.session ?? null;
    const s2 = r2.json?.data?.session ?? null;
    check(
      "A8 duplicate mutation_id replays idempotently",
      r1.status === 200 &&
        r2.status === 200 &&
        s1?.revision === s2?.revision &&
        s2?.title === "A8 replay first",
      `PUT1 ${r1.status} rev=${s1?.revision}; PUT2 ${r2.status} rev=${s2?.revision} ` +
        `title="${s2?.title}" (expected rev unchanged + "A8 replay first")`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A9 — stale expected_revision → 409 conflict with data.session     */
  /* ---------------------------------------------------------------- */
  {
    const r = await api("PUT", "/api/cloud/sessions", {
      cookie: headerA,
      body: { ...baseBody, title: "A9 stale write", expected_revision: 999 },
    });
    check(
      "A9 stale expected_revision → 409 conflict",
      r.status === 409 &&
        r.json?.error === "conflict" &&
        r.json?.data?.session != null,
      `status ${r.status}, error=${r.json?.error ?? "none"}, ` +
        `data.session=${r.json?.data?.session ? "present" : "absent"} (contract: 409 + current doc)`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A10 — fresh expected_revision → 200, revision +1                  */
  /* ---------------------------------------------------------------- */
  {
    const g = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerA,
    });
    const currentRev = g.json?.data?.session?.revision ?? null;
    const r = await api("PUT", "/api/cloud/sessions", {
      cookie: headerA,
      body: { ...baseBody, title: "A10 fresh write", expected_revision: currentRev },
    });
    const newRev = r.json?.data?.session?.revision ?? null;
    check(
      "A10 fresh expected_revision increments revision",
      r.status === 200 && newRev === (currentRev ?? 0) + 1,
      `status ${r.status}, revision ${currentRev} → ${newRev} (expected ${(currentRev ?? 0) + 1})`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A11 — complete sets status + completed_at                         */
  /* ---------------------------------------------------------------- */
  {
    const r = await api("POST", `/api/cloud/sessions/${sessionId}/complete`, {
      cookie: headerA,
    });
    const g = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerA,
    });
    const s = g.json?.data?.session ?? null;
    check(
      "A11 complete sets status + completed_at",
      r.status === 200 && s?.status === "complete" && Boolean(s?.completed_at),
      `POST ${r.status}; status=${s?.status}, completed_at=${s?.completed_at ?? "null"}`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A12 — B cannot delete A's session                                 */
  /* ---------------------------------------------------------------- */
  {
    const r = await api("DELETE", "/api/cloud/sessions", {
      cookie: headerB,
      body: { ids: [sessionId] },
    });
    const gA = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerA,
    });
    check(
      "A12 B cannot delete A's session",
      gA.json?.data?.session !== null,
      `B DELETE status ${r.status}; A GET session=${
        gA.json?.data?.session ? "exists" : "null"
      }`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A13 — account wipe: A's sessions + preferences gone, B untouched  */
  /* ---------------------------------------------------------------- */
  {
    // Setup so the wipe has real data to remove and B has data to keep.
    const prefForWipe = {
      learning_goal: "understand_concept",
      preferred_representation: "animation",
      explanation_style: "visual_first",
      learning_pace: "calm",
      animation_speed: 1.0,
      information_density: "medium",
      reduced_motion: false,
      high_contrast: false,
      text_scale: 1.0,
      one_variable_mode: true,
      topic_interests: ["nuclear", "chain-reaction"],
      schema_version: 1,
    };
    await api("PUT", "/api/account/preferences", {
      cookie: headerA,
      body: prefForWipe,
    });
    const sbId = `it-${now}-b-${rand}`;
    await api("PUT", "/api/cloud/sessions", {
      cookie: headerB,
      body: { ...baseBody, id: sbId, title: "B's own session" },
    });

    const r = await api("DELETE", "/api/account", { cookie: headerA });
    const gAcctA = await api("GET", "/api/account", { cookie: headerA });
    const gSessA = await api("GET", `/api/cloud/sessions?id=${sessionId}`, {
      cookie: headerA,
    });
    const gB = await api("GET", `/api/cloud/sessions?id=${sbId}`, {
      cookie: headerB,
    });
    const db = await getMongo();
    const [mA_sessions, mA_prefs, mB_sessions, mB_prefs] = await Promise.all([
      db.collection("learning_sessions").countDocuments({ user_id: uidA }),
      db.collection("learner_preferences").countDocuments({ user_id: uidA }),
      db.collection("learning_sessions").countDocuments({ user_id: uidB }),
      db.collection("learner_preferences").countDocuments({ user_id: uidB }),
    ]);
    check(
      "A13 account wipe removes A's data, leaves B untouched",
      r.status === 200 &&
        gAcctA.json?.data?.preferences === null &&
        gSessA.json?.data?.session === null &&
        mA_sessions === 0 &&
        mA_prefs === 0 &&
        mB_sessions === 1 &&
        mB_prefs === 0 &&
        gB.json?.data?.session?.id === sbId,
      `DELETE ${r.status}; A: session=${gSessA.json?.data?.session ?? "null"}, ` +
        `prefs=${gAcctA.json?.data?.preferences ?? "null"}; ` +
        `Mongo — A sessions=${mA_sessions} prefs=${mA_prefs}, ` +
        `B sessions=${mB_sessions} prefs=${mB_prefs} (B's own row must survive)`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A14 — preferences full PUT / GET; B has none                      */
  /* ---------------------------------------------------------------- */
  {
    const prefBody = {
      learning_goal: "explore_experiments",
      preferred_representation: "graph",
      explanation_style: "step_by_step",
      learning_pace: "balanced",
      animation_speed: 0.75,
      information_density: "low",
      reduced_motion: true,
      high_contrast: true,
      text_scale: 1.1,
      one_variable_mode: false,
      topic_interests: ["nuclear-chain-reaction", "energy-transfer"],
      schema_version: 1,
    };
    const r = await api("PUT", "/api/account/preferences", {
      cookie: headerA,
      body: prefBody,
    });
    const gA = await api("GET", "/api/account", { cookie: headerA });
    const gB = await api("GET", "/api/account", { cookie: headerB });
    const p = gA.json?.data?.preferences ?? null;
    const ok =
      r.status === 200 &&
      p?.learning_goal === "explore_experiments" &&
      p?.preferred_representation === "graph" &&
      p?.animation_speed === 0.75 &&
      Array.isArray(p?.topic_interests) &&
      p.topic_interests.length === 2 &&
      gB.json?.data?.preferences === null;
    check(
      "A14 preferences PUT returns + persists, B's stays null",
      ok,
      `PUT ${r.status}; A prefs=${p ? "present (learning_goal=" + p.learning_goal + ")" : "null"}, ` +
        `B prefs=${gB.json?.data?.preferences === null ? "null" : "present"}`
    );
  }

  /* ---------------------------------------------------------------- */
  /* A15 — cleanup: remove test rows for both learners, keep profiles  */
  /* ---------------------------------------------------------------- */
  {
    const db = await getMongo();
    const sessions = await db
      .collection("learning_sessions")
      .deleteMany({
        $or: [
          { user_id: { $in: [uidA, uidB] } },
          { id: { $regex: "^it-" } },
        ],
      });
    const prefs = await db
      .collection("learner_preferences")
      .deleteMany({ user_id: { $in: [uidA, uidB] } });
    const [leftSessions, leftPrefs, profiles] = await Promise.all([
      db.collection("learning_sessions").countDocuments({
        user_id: { $in: [uidA, uidB] },
      }),
      db.collection("learner_preferences").countDocuments({
        user_id: { $in: [uidA, uidB] },
      }),
      db.collection("profiles").countDocuments({
        user_id: { $in: [uidA, uidB] },
      }),
    ]);
    check(
      "A15 cleanup removes test rows, keeps profiles",
      leftSessions === 0 && leftPrefs === 0 && profiles === 2,
      `deleted sessions=${sessions.deletedCount} prefs=${prefs.deletedCount}; ` +
        `remaining for learners — sessions=${leftSessions} prefs=${leftPrefs}, profiles=${profiles} (kept)`
    );
  }

  /* ---------------------------------------------------------------- */
  /* Summary                                                           */
  /* ---------------------------------------------------------------- */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const exitCode = failed === 0 ? 0 : 1;
  try {
    await mongoClient?.close(); // let the process exit cleanly
  } catch {
    /* driver close failure must not mask the summary */
  }
  console.log(
    `SUMMARY: ${passed}/${results.length} passed, ${failed} failed — ` +
      `integration suite vs REAL Firebase Auth + MongoDB (db "${DB_NAME}")`
  );
  process.exit(exitCode);
}

main().catch((error) => {
  console.error("[backend-integration] unexpected failure:", error);
  process.exit(1);
});
