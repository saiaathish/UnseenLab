import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";

/**
 * DATABASE SECURITY CONTRACT — live-cluster checks.
 *
 * Everything else in tests/demonstrations/ mocks `getPlatformDb()` with an
 * in-memory fake, which is correct for repository/route logic but can never
 * prove two things that only the live cluster can:
 *
 *  1. LEAST PRIVILEGE — the app user behind `MONGODB_URI` must NOT hold
 *     Atlas/global admin roles. The documented target is exactly
 *     `readWrite` on the `unseenlab` database (docs/firebase-mongodb-setup.md
 *     §2.2, docs/closure-atlas.md §9). User creation/role changes are
 *     manual-only (Atlas console — `createUser` is not permitted over the
 *     wire), so an executable check is the ONLY thing that catches drift.
 *
 *  2. SCHEMA CONTRACT — scripts/mongo-setup.mjs installs the composite
 *     unique upsert key `{ firebaseUid: 1, demonstrationId: 1 }`, the
 *     dashboard list index `{ firebaseUid: 1, updatedAt: -1 }`, and
 *     `$jsonSchema` validators at `validationLevel: "strict"` on all four
 *     platform collections. The repository's duplicate-key-conflict path
 *     (generated-demonstrations.ts:262) and the atomic concurrency filter
 *     depend on the unique index existing; without it, two concurrent
 *     upserts can both insert the same (firebaseUid, demonstrationId).
 *
 * The suite self-skips when `MONGODB_URI` is absent (guest mode / CI without
 * secrets). Credentials are never logged: only role NAMES and index keys are
 * asserted.
 */

const FORBIDDEN_ADMIN_ROLES = [
  "atlasAdmin",
  "readWriteAnyDatabase",
  "dbAdminAnyDatabase",
  "userAdminAnyDatabase",
  "root",
  "clusterAdmin",
  "clusterManager",
  "hostManager",
  "backup",
  "restore",
];

const PLATFORM_COLLECTIONS = [
  "profiles",
  "learner_preferences",
  "learning_sessions",
  "generated_demonstrations",
] as const;

/** Parse the repo .env the way Next.js would for server code (no dotenv dep). */
function loadMongoUri(): string | null {
  const envPath = path.join(process.cwd(), ".env");
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^MONGODB_URI=(.*)$/);
      if (!m) continue;
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v || null;
    }
  } catch {
    // .env missing — fall through to process.env.
  }
  return process.env.MONGODB_URI?.trim() || null;
}

const MONGODB_URI = loadMongoUri();
const DB_NAME = process.env.MONGODB_DB?.trim() || "unseenlab";

const run = MONGODB_URI ? describe : describe.skip;

let client: MongoClient | null = null;

run("DATABASE SECURITY CONTRACT (live cluster)", () => {
  beforeAll(async () => {
    client = new MongoClient(MONGODB_URI as string);
    await client.connect();
  });

  afterAll(async () => {
    await client?.close();
    client = null;
  });

  it("app DB user is least-privilege: no Atlas/global admin role; readWrite on the platform db", async () => {
    const res = await (client as MongoClient)
      .db("admin")
      .command({ connectionStatus: 1 });
    const roles: Array<{ role: string; db: string }> =
      res.authInfo?.authenticatedUserRoles ?? [];

    const forbidden = roles.filter((r) =>
      FORBIDDEN_ADMIN_ROLES.includes(r.role)
    );
    expect(forbidden, "admin/global roles held by the app user").toEqual([]);
    expect(
      roles,
      "app user must hold readWrite on the platform database"
    ).toContainEqual({ role: "readWrite", db: DB_NAME });
  });

  it("generated_demonstrations has the unique (firebaseUid, demonstrationId) upsert key and the list index", async () => {
    const indexes = await (client as MongoClient)
      .db(DB_NAME)
      .collection("generated_demonstrations")
      .indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));

    expect(
      indexes.some(
        (i) =>
          i.unique &&
          JSON.stringify(i.key) ===
            JSON.stringify({ firebaseUid: 1, demonstrationId: 1 })
      ),
      "unique index {firebaseUid:1, demonstrationId:1}"
    ).toBe(true);
    expect(
      keys.includes(JSON.stringify({ firebaseUid: 1, updatedAt: -1 })),
      "index {firebaseUid:1, updatedAt:-1}"
    ).toBe(true);
  });

  it("all platform collections carry a $jsonSchema validator at validationLevel strict", async () => {
    for (const name of PLATFORM_COLLECTIONS) {
      const coll = (
        await (client as MongoClient)
          .db(DB_NAME)
          .listCollections({ name }, { nameOnly: false })
          .toArray()
      )[0];
      expect(Boolean(coll?.options?.validator), `${name} validator`).toBe(true);
      expect(
        coll?.options?.validationLevel,
        `${name} validationLevel`
      ).toBe("strict");
    }
  });
});
