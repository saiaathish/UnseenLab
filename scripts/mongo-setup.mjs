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

const client = new MongoClient(uri.trim());

try {
  await client.connect();
  const db = client.db(dbName);

  // Create collections first so index creation below can reference them.
  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  );
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      console.log(`created collection ${dbName}.${name}`);
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
} catch (error) {
  console.error(`mongo-setup failed for ${dbName}:`, error);
  process.exit(1);
} finally {
  await client.close();
}
