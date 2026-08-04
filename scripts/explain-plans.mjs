#!/usr/bin/env node
/**
 * Measures real query plans (explain "executionStats") for the four
 * production query shapes against the live Atlas cluster, using a sentinel
 * (non-existent) user_id so the numbers reflect the index path, not data.
 *
 * Run: `node scripts/explain-plans.mjs` — MONGODB_URI is read from the
 * environment, or auto-loaded from `.env` at the repo root (MONGODB_DB
 * defaults to "unseenlab"). No secrets are printed.
 *
 * Shapes:
 *   1. latest sessions for a user:  find({user_id}).sort({updated_at:-1}).limit(10)
 *   2. incomplete session for a lab: find({user_id, lab_slug, status:"active"})
 *                                   .sort({updated_at:-1}).limit(1)
 *   3. exact resume:                findOne({id, user_id})
 *   4. user data deletion:          deleteMany({user_id}) — explain on the
 *                                   equivalent find({user_id}) as the proxy.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

function loadEnvFromDotenv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    if (process.env[key] !== undefined) continue; // real env wins
    process.env[key] = trimmed
      .slice(i + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFromDotenv();

const uri = process.env.MONGODB_URI;
if (!uri || !uri.trim()) {
  console.error("MONGODB_URI is not set (env or .env).");
  process.exit(1);
}
const dbName = process.env.MONGODB_DB?.trim() || "unseenlab";

const LAB_SLUG = "nuclear-chain-reaction";
const SENTINEL_USER = `explain-sentinel-${randomUUID()}`; // never exists
const SENTINEL_ID = `explain-sentinel-${randomUUID()}`; // never exists

/** Flatten the winningPlan stage tree into stage names + IXSCAN index names. */
function summarizePlan(stage) {
  const stages = [];
  const indexes = new Set();
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.stage === "string") stages.push(n.stage);
    if (n.stage === "IXSCAN" && n.indexName) indexes.add(n.indexName);
    if (n.inputStage) walk(n.inputStage);
    if (Array.isArray(n.inputStages)) n.inputStages.forEach(walk);
  };
  walk(stage);
  return { stages, indexName: indexes.size ? [...indexes].join(", ") : null };
}

const client = new MongoClient(uri.trim());

try {
  await client.connect();
  const db = client.db(dbName);
  const sessions = db.collection("learning_sessions");

  // Defensive: the sentinel must not match any real data.
  for (const coll of ["profiles", "learner_preferences", "learning_sessions"]) {
    const n = await db.collection(coll).countDocuments({ user_id: SENTINEL_USER });
    if (n !== 0) throw new Error(`sentinel user_id collides in ${coll}`);
  }
  if ((await sessions.countDocuments({ id: SENTINEL_ID })) !== 0) {
    throw new Error("sentinel session id collides");
  }

  const shapes = [
    {
      label: "1. latest sessions for a user",
      query: "find({ user_id }).sort({ updated_at: -1 }).limit(10)",
      explain: sessions
        .find({ user_id: SENTINEL_USER })
        .sort({ updated_at: -1 })
        .limit(10)
        .explain("executionStats"),
    },
    {
      label: "2. incomplete session for a lab",
      query: `find({ user_id, lab_slug: "${LAB_SLUG}", status: "active" }).sort({ updated_at: -1 }).limit(1)`,
      explain: sessions
        .find({ user_id: SENTINEL_USER, lab_slug: LAB_SLUG, status: "active" })
        .sort({ updated_at: -1 })
        .limit(1)
        .explain("executionStats"),
    },
    {
      label: "3. exact resume",
      // findOne is find + limit(1); the driver has no findOne().explain.
      query: "findOne({ id, user_id })  — explained as find({ id, user_id }).limit(1)",
      explain: sessions
        .find({ id: SENTINEL_ID, user_id: SENTINEL_USER })
        .limit(1)
        .explain("executionStats"),
    },
    {
      label: "4. user data deletion (proxy: find({ user_id }))",
      query: "deleteMany({ user_id })  — plan proxied by find({ user_id })",
      explain: sessions.find({ user_id: SENTINEL_USER }).explain("executionStats"),
    },
  ];

  console.log(`db: ${dbName} | sentinel user_id: ${SENTINEL_USER}`);
  for (const shape of shapes) {
    const plan = await shape.explain;
    const { stages, indexName } = summarizePlan(plan.queryPlanner.winningPlan);
    const stats = plan.executionStats ?? {};
    console.log(JSON.stringify({
      shape: shape.label,
      query: shape.query,
      winningPlanStages: stages,
      ixscan: Boolean(indexName),
      indexUsed: indexName,
      totalDocsExamined: stats.totalDocsExamined ?? "n/a",
      totalKeysExamined: stats.totalKeysExamined ?? "n/a",
      executionTimeMillis: stats.executionTimeMillis ?? "n/a",
      docsReturned: stats.nReturned ?? "n/a",
    }, null, 2));
  }
} catch (error) {
  console.error("explain-plans failed:", error);
  process.exit(1);
} finally {
  await client.close();
}
