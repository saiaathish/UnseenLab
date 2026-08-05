import { MongoClient, type Db } from "mongodb";

/**
 * Server-only MongoDB connection (replaces the Supabase Postgres platform
 * schema). `MONGODB_URI` is a server secret — it must never appear in any
 * browser-visible environment file.
 *
 * Ownership is enforced at the API layer: every write derives `user_id`
 * from the verified session cookie, never from request bodies (the role
 * RLS played in the Postgres schema).
 */
export const COLLECTIONS = {
  profiles: "profiles",
  learnerPreferences: "learner_preferences",
  learningSessions: "learning_sessions",
  generatedDemonstrations: "generated_demonstrations",
} as const;

const DB_NAME = process.env.MONGODB_DB?.trim() || "unseenlab";

let clientPromise: Promise<MongoClient> | null = null;

/** Lazy cached client; null when `MONGODB_URI` is unset (guest mode). */
export function getMongoClient(): Promise<MongoClient> | null {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) return null;
  if (!clientPromise) {
    clientPromise = new MongoClient(uri.trim()).connect();
  }
  return clientPromise;
}

/** Platform database handle, or null when MongoDB is not configured. */
export async function getPlatformDb(): Promise<Db | null> {
  const client = getMongoClient();
  if (!client) return null;
  try {
    return (await client).db(DB_NAME);
  } catch {
    return null;
  }
}
