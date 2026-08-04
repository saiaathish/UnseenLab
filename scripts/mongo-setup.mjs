#!/usr/bin/env node
/**
 * Idempotent MongoDB platform-schema setup (replaces the Supabase migrations
 * for profiles / learner_preferences / learning_sessions).
 *
 * Run: `node scripts/mongo-setup.mjs` with MONGODB_URI set (and optionally
 * MONGODB_DB, defaulting to "unseenlab").
 *
 * Ownership is enforced at the API layer (every write derives user_id from
 * the verified session cookie), so the indexes here are for uniqueness and
 * query shape — not security. createIndex on an existing identical index is
 * a no-op, so re-running is always safe.
 *
 * $jsonSchema validators are installed on every run — via the
 * createCollection options for missing collections, or `db.command({
 * collMod, validator, validationLevel: "strict" })` for existing ones — and
 * mirror the Zod schemas in src/lib/mongo/types.ts and the API routes.
 * They are defense-in-depth only: Zod validation at the API boundary remains
 * the primary validation layer. `additionalProperties: true` keeps future
 * additive fields from breaking writes, and fields the parallel optimistic
 * concurrency workstream is adding (revision, last_client_mutation_id) are
 * deliberately OPTIONAL here so pre-existing documents keep validating.
 *
 * BSON note: the driver serializes safe JS integers as Int32, so integer
 * fields are typed "int" and bounded number fields accept ["double","int"].
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri || !uri.trim()) {
  console.error(
    "MONGODB_URI is not set. Export it first (e.g. a MongoDB connection string), then re-run."
  );
  process.exit(1);
}

const dbName = process.env.MONGODB_DB?.trim() || "unseenlab";

const COLLECTIONS = ["profiles", "learner_preferences", "learning_sessions"];

/**
 * $jsonSchema validators, one per collection. "required" lists only the
 * fields the spec marks required; everything else is optional-on-write but
 * type-checked when present.
 */
const VALIDATORS = {
  profiles: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: true,
      required: ["user_id", "created_at", "updated_at"],
      properties: {
        user_id: { bsonType: "string" },
        display_name: { bsonType: ["string", "null"] },
        avatar_url: { bsonType: ["string", "null"] },
        onboarding_version: { bsonType: "int", minimum: 0 },
        onboarding_completed_at: { bsonType: ["string", "null"] },
        created_at: { bsonType: "string" },
        updated_at: { bsonType: "string" },
      },
    },
  },
  learner_preferences: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: true,
      required: ["user_id"],
      properties: {
        user_id: { bsonType: "string" },
        learning_goal: {
          enum: ["understand_concept", "prepare_for_class", "explore_experiments"],
        },
        preferred_representation: {
          enum: ["animation", "graph", "equation", "causal", "plain_language"],
        },
        explanation_style: { enum: ["visual_first", "step_by_step", "concise"] },
        learning_pace: { enum: ["calm", "balanced", "quick"] },
        animation_speed: { bsonType: ["double", "int"], minimum: 0.25, maximum: 2 },
        information_density: { enum: ["low", "medium", "full"] },
        reduced_motion: { bsonType: "bool" },
        high_contrast: { bsonType: "bool" },
        one_variable_mode: { bsonType: "bool" },
        text_scale: { bsonType: ["double", "int"], minimum: 1, maximum: 1.5 },
        topic_interests: {
          bsonType: "array",
          maxItems: 12,
          items: { bsonType: "string", maxLength: 80 },
        },
        schema_version: { bsonType: "int", minimum: 1 },
        created_at: { bsonType: "string" },
        updated_at: { bsonType: "string" },
      },
    },
  },
  learning_sessions: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: true,
      required: ["id", "user_id", "lab_slug", "created_at", "updated_at"],
      properties: {
        id: { bsonType: "string" },
        user_id: { bsonType: "string" },
        lab_slug: { bsonType: "string" },
        status: { enum: ["active", "complete"] },
        title: { bsonType: "string", maxLength: 120 },
        schema_version: { bsonType: "int", minimum: 1 },
        evidence: { bsonType: "object" },
        workflow: { bsonType: "object" },
        // OPTIONAL on purpose: a parallel workstream is adding optimistic
        // concurrency; pre-existing docs may lack these fields.
        revision: { bsonType: "int", minimum: 0 },
        last_client_mutation_id: { bsonType: ["string", "null"] },
        created_at: { bsonType: "string" },
        updated_at: { bsonType: "string" },
        completed_at: { bsonType: ["string", "null"] },
      },
    },
  },
};

const client = new MongoClient(uri.trim());

try {
  await client.connect();
  const db = client.db(dbName);

  // Create collections first so index creation below can reference them,
  // installing the validator at creation time when the collection is new.
  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  );
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name, {
        validator: VALIDATORS[name],
        validationLevel: "strict",
      });
      console.log(`created collection ${dbName}.${name} (validator installed)`);
    } else {
      await db.command({
        collMod: name,
        validator: VALIDATORS[name],
        validationLevel: "strict",
      });
      console.log(`validator installed (collMod) on ${dbName}.${name}`);
    }
  }

  // Unique user_id: the platform is one row per user.
  await db
    .collection("profiles")
    .createIndex({ user_id: 1 }, { unique: true });
  await db
    .collection("learner_preferences")
    .createIndex({ user_id: 1 }, { unique: true });

  // Sessions: unique stable id (upsert key), plus the ownership/query shapes
  // used by the API routes and dashboard.
  const sessions = db.collection("learning_sessions");
  await sessions.createIndex({ id: 1 }, { unique: true });
  await sessions.createIndex({ user_id: 1 });
  await sessions.createIndex({ user_id: 1, lab_slug: 1, status: 1 });
  await sessions.createIndex({ user_id: 1, updated_at: -1 });

  const indexes = await Promise.all(
    COLLECTIONS.map(async (name) => ({
      collection: name,
      count: (await db.collection(name).indexes()).length,
    }))
  );
  console.log(`setup complete for ${dbName}:`);
  for (const { collection, count } of indexes) {
    console.log(`  ${collection}: ${count} index(es)`);
  }

  // Verify validators actually landed (createCollection options or collMod).
  const info = await db.listCollections({}, { nameOnly: false }).toArray();
  for (const name of COLLECTIONS) {
    const coll = info.find((c) => c.name === name);
    const hasValidator = Boolean(coll?.options?.validator);
    const level = coll?.options?.validationLevel ?? "n/a";
    console.log(
      `  ${name}: validator ${hasValidator ? "installed" : "MISSING"} (validationLevel=${level})`
    );
  }
} catch (error) {
  console.error(`mongo-setup failed for ${dbName}:`, error);
  process.exit(1);
} finally {
  await client.close();
}
