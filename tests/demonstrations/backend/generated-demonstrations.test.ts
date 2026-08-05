import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDemonstrations,
  findDemonstration,
  listDemonstrations,
  upsertDemonstration,
  type DemonstrationUpsertInput,
} from "@/lib/mongo/generated-demonstrations";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { GeneratedDemonstrationRow } from "@/lib/mongo/types";

/**
 * Repository tests for generated demonstrations. The repository talks only to
 * `getPlatformDb()` (mocked here), so these tests run without a real Mongo —
 * the fake collection implements the driver subset the repository uses
 * (findOne / find / findOneAndUpdate with $set/$inc/$setOnInsert and upsert /
 * deleteMany) with semantically honest behavior: upserts merge equality query
 * fields into inserted docs, updates apply operators to the first match, and
 * a scriptable flag simulates the unique-index 11000 violation.
 */

const mocks = vi.hoisted(() => ({
  getPlatformDb: vi.fn(),
}));

vi.mock("@/lib/mongo/client", () => ({
  COLLECTIONS: {
    profiles: "profiles",
    learnerPreferences: "learner_preferences",
    learningSessions: "learning_sessions",
    generatedDemonstrations: "generated_demonstrations",
  },
  getPlatformDb: mocks.getPlatformDb,
}));

// ---------------------------------------------------------------------------
// In-memory fake Mongo
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

function isOperatorObject(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matches(doc: AnyRecord, filter: AnyRecord): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or" && Array.isArray(cond)) {
      return cond.some((sub) => matches(doc, sub as AnyRecord));
    }
    if (isOperatorObject(cond)) {
      if ("$in" in cond) {
        return Array.isArray(cond.$in) && cond.$in.includes(doc[key]);
      }
      if ("$exists" in cond) {
        return (doc[key] !== undefined) === cond.$exists;
      }
    }
    return doc[key] === cond;
  });
}

/** Equality fields from the filter that Mongo merges into upserted docs. */
function equalityFields(filter: AnyRecord): AnyRecord {
  const out: AnyRecord = {};
  for (const [key, cond] of Object.entries(filter)) {
    if (key === "$or" || isOperatorObject(cond)) continue;
    out[key] = cond;
  }
  return out;
}

class FakeCollection {
  readonly rows = new Map<string, AnyRecord>();
  /** Scriptable unique-index violation on upsert-insert. */
  simulateDuplicateKey = false;
  /** Number of findOneAndUpdate calls that actually wrote a document. */
  writeCount = 0;
  private nextId = 1;

  private key(uid: unknown, demonstrationId: unknown): string {
    return `${String(uid)}\u0000${String(demonstrationId)}`;
  }

  private stored(filter: AnyRecord): AnyRecord | null {
    for (const row of this.rows.values()) {
      if (matches(row, filter)) return row;
    }
    return null;
  }

  async findOne(filter: AnyRecord): Promise<AnyRecord | null> {
    return this.stored(filter);
  }

  async findOneAndUpdate(
    filter: AnyRecord,
    update: AnyRecord,
    options: { upsert?: boolean; returnDocument?: "before" | "after" } = {}
  ): Promise<AnyRecord | null> {
    const existing = this.stored(filter);
    const $set = (update.$set as AnyRecord) ?? {};
    const $inc = (update.$inc as AnyRecord) ?? {};
    const $setOnInsert = (update.$setOnInsert as AnyRecord) ?? {};

    if (existing) {
      for (const [key, value] of Object.entries($set)) existing[key] = value;
      for (const [key, value] of Object.entries($inc)) {
        existing[key] = ((existing[key] as number) ?? 0) + (value as number);
      }
      this.writeCount += 1;
      return options.returnDocument === "after" ? existing : null;
    }

    if (!options.upsert) return null;

    const uid = filter.firebaseUid;
    const demonstrationId = filter.demonstrationId;
    const key = this.key(uid, demonstrationId);
    if (this.simulateDuplicateKey) {
      // Scripted unique-index violation on insert (models the index refusing
      // the write even though a prior read saw no row — the race a unique
      // index guards against).
      const error = new Error("E11000 duplicate key error") as Error & {
        code: number;
      };
      error.code = 11000;
      throw error;
    }
    const doc: AnyRecord = {
      _id: `fake-id-${this.nextId++}`,
      ...equalityFields(filter),
      ...$set,
      ...$setOnInsert,
    };
    for (const [key2, value] of Object.entries($inc)) {
      doc[key2] = ((doc[key2] as number) ?? 0) + (value as number);
    }
    this.rows.set(key, doc);
    this.writeCount += 1;
    return doc;
  }

  find(filter: AnyRecord) {
    let sortSpec: AnyRecord = {};
    let skipCount = 0;
    let limitCount = Infinity;
    return {
      sort(spec: AnyRecord) {
        sortSpec = spec;
        return this;
      },
      skip(count: number) {
        skipCount = count;
        return this;
      },
      limit(count: number) {
        limitCount = count;
        return this;
      },
      toArray: async (): Promise<AnyRecord[]> => {
        const docs = [...this.rows.values()].filter((row) =>
          matches(row, filter)
        );
        const sortEntries = Object.entries(sortSpec);
        docs.sort((a, b) => {
          for (const [key, dir] of sortEntries) {
            const av = a[key] as string;
            const bv = b[key] as string;
            if (av === bv) continue;
            return (av < bv ? -1 : 1) * ((dir as number) < 0 ? -1 : 1);
          }
          return 0;
        });
        return docs.slice(skipCount, skipCount + limitCount);
      },
    };
  }

  async deleteMany(filter: AnyRecord): Promise<{ deletedCount: number }> {
    let deletedCount = 0;
    for (const [key, row] of this.rows) {
      if (matches(row, filter)) {
        this.rows.delete(key);
        deletedCount += 1;
      }
    }
    return { deletedCount };
  }

  /** Direct test seeding (bypasses write counting and the duplicate flag). */
  seed(
    uid: string,
    demonstrationId: string,
    overrides: Partial<GeneratedDemonstrationRow> = {}
  ): void {
    const row: AnyRecord = {
      _id: `fake-id-${this.nextId++}`,
      demonstrationId,
      firebaseUid: uid,
      title: `Title for ${demonstrationId}`,
      normalizedConcept: "A normalized concept",
      trustLevel: "conceptual_demonstration",
      rendererKind: "lumina_2d",
      schemaVersion: 1,
      spec: { schemaVersion: 1 },
      revision: 0,
      source: "template_composition",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      lastClientMutationId: null,
      ...overrides,
    };
    this.rows.set(this.key(uid, demonstrationId), row);
  }
}

class FakeDb {
  private collections = new Map<string, FakeCollection>();

  collection(name: string): FakeCollection {
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new FakeCollection();
      this.collections.set(name, collection);
    }
    return collection;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function upsertInput(
  demonstrationId: string,
  overrides: Partial<DemonstrationUpsertInput> = {}
): DemonstrationUpsertInput {
  return {
    demonstrationId,
    firebaseUid: "user-a",
    title: "Pendulum Motion",
    normalizedConcept: "Simple harmonic motion of a pendulum",
    trustLevel: "verified_simulation",
    rendererKind: "lumina_2d",
    schemaVersion: 1,
    // The repository treats the spec as an opaque validated document; the
    // route is what gates it with validateDemoSpec.
    spec: { schemaVersion: 1, id: demonstrationId } as unknown as DemoSpecV1,
    source: "curated_engine",
    ...overrides,
  };
}

function demonstrationCollection(): FakeCollection {
  const db = new FakeDb();
  mocks.getPlatformDb.mockResolvedValue(db as never);
  return db.collection("generated_demonstrations");
}

describe("upsertDemonstration", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
  });

  it("creates a row at revision 1 with server-managed fields and no _id leak", async () => {
    const result = await upsertDemonstration("user-a", upsertInput("demo-1"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.row).toMatchObject({
      demonstrationId: "demo-1",
      firebaseUid: "user-a",
      title: "Pendulum Motion",
      revision: 1,
      lastClientMutationId: null,
    });
    expect(result.row.createdAt).toEqual(result.row.updatedAt);
    expect(typeof result.row.createdAt).toBe("string");
    // The wire contract never exposes the driver-managed _id.
    expect(result.row).not.toHaveProperty("_id");
  });

  it("re-saving the same demonstrationId updates in place: one row, revision 2", async () => {
    await upsertDemonstration("user-a", upsertInput("demo-1"));
    const second = await upsertDemonstration("user-a", {
      ...upsertInput("demo-1"),
      title: "Pendulum Motion (updated)",
    });
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.row.revision).toBe(2);
    expect(second.row.title).toBe("Pendulum Motion (updated)");
    expect(collection.rows.size).toBe(1);
  });

  it("replaying the same mutation_id is an idempotent no-op: no write, same row", async () => {
    const first = await upsertDemonstration("user-a", upsertInput("demo-1"), {
      mutationId: "m-1",
    });
    const replay = await upsertDemonstration("user-a", upsertInput("demo-1"), {
      mutationId: "m-1",
    });
    expect(replay.status).toBe("replay");
    if (replay.status !== "replay") return;
    expect(replay.row.revision).toBe(1);
    expect(replay.row.updatedAt).toBe(first.status === "ok" ? first.row.updatedAt : "");
    expect(collection.writeCount).toBe(1);
    expect(collection.rows.size).toBe(1);
  });

  it("a stale expected_revision conflicts and returns the current row untouched", async () => {
    await upsertDemonstration("user-a", upsertInput("demo-1"));
    const conflict = await upsertDemonstration(
      "user-a",
      { ...upsertInput("demo-1"), title: "Should not land" },
      { expectedRevision: 0 }
    );
    expect(conflict.status).toBe("conflict");
    if (conflict.status !== "conflict") return;
    expect(conflict.row).toMatchObject({
      demonstrationId: "demo-1",
      revision: 1,
    });
    expect(conflict.row?.title).toBe("Pendulum Motion");
    expect(collection.writeCount).toBe(1);
  });

  it("a matching expected_revision advances the row atomically", async () => {
    await upsertDemonstration("user-a", upsertInput("demo-1"));
    const result = await upsertDemonstration(
      "user-a",
      { ...upsertInput("demo-1"), title: "Pendulum v2" },
      { expectedRevision: 1, mutationId: "m-2" }
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.row.revision).toBe(2);
    expect(result.row.title).toBe("Pendulum v2");
    expect(result.row.lastClientMutationId).toBe("m-2");
  });

  it("creates at revision 1 when expected_revision is 0 and no row exists", async () => {
    const result = await upsertDemonstration(
      "user-a",
      upsertInput("demo-1"),
      { expectedRevision: 0 }
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.row.revision).toBe(1);
  });

  it("reports not_found_created when expected_revision implies a row that does not exist", async () => {
    const result = await upsertDemonstration(
      "user-a",
      upsertInput("demo-1"),
      { expectedRevision: 4 }
    );
    expect(result.status).toBe("not_found_created");
    if (result.status !== "not_found_created") return;
    expect(result.row.revision).toBe(1);
  });

  it("a unique-index violation resolves to conflict without leaking the other row", async () => {
    collection.simulateDuplicateKey = true;
    const result = await upsertDemonstration("user-a", upsertInput("demo-1"));
    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") return;
    // The other user's row must never surface in the result.
    expect(result.row).toBeNull();
  });
});

describe("owner isolation and reads", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
  });

  it("cannot read another owner's row even with the same demonstrationId", async () => {
    collection.seed("user-b", "demo-1");
    expect(await findDemonstration("user-a", "demo-1")).toBeNull();
    expect(await listDemonstrations("user-a", { limit: 20 })).toEqual([]);
    // The owner's own row reads back fine.
    expect(await findDemonstration("user-b", "demo-1")).not.toBeNull();
  });

  it("cannot delete another owner's row even with the same demonstrationId", async () => {
    collection.seed("user-a", "demo-1");
    collection.seed("user-b", "demo-1");
    const deleted = await deleteDemonstrations("user-a", ["demo-1"]);
    expect(deleted).toBe(1);
    expect(collection.rows.size).toBe(1);
    expect(await findDemonstration("user-b", "demo-1")).not.toBeNull();
  });

  it("an upsert by another user never overwrites the row of the first user", async () => {
    collection.seed("user-b", "demo-1");
    const result = await upsertDemonstration(
      "user-a",
      upsertInput("demo-1", { firebaseUid: "user-a" })
    );
    expect(result.status).toBe("ok");
    expect(collection.rows.size).toBe(2);
    const bRow = await findDemonstration("user-b", "demo-1");
    expect(bRow?.title).toBe("Title for demo-1");
  });
});

describe("listDemonstrations", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
  });

  it("orders newest first (updatedAt desc)", async () => {
    // Inserted in a deliberately non-chronological order.
    collection.seed("user-a", "demo-old", { updatedAt: "2026-08-01T00:00:00.000Z" });
    collection.seed("user-a", "demo-new", { updatedAt: "2026-08-03T00:00:00.000Z" });
    collection.seed("user-a", "demo-mid", { updatedAt: "2026-08-02T00:00:00.000Z" });
    const rows = await listDemonstrations("user-a", { limit: 20 });
    expect(rows.map((r) => r.demonstrationId)).toEqual([
      "demo-new",
      "demo-mid",
      "demo-old",
    ]);
    expect(rows[0]).not.toHaveProperty("_id");
  });

  it("paginates with limit and skip", async () => {
    for (let i = 1; i <= 5; i += 1) {
      collection.seed("user-a", `demo-${i}`, {
        updatedAt: `2026-08-0${i}T00:00:00.000Z`,
      });
    }
    const page1 = await listDemonstrations("user-a", { limit: 2 });
    expect(page1.map((r) => r.demonstrationId)).toEqual(["demo-5", "demo-4"]);
    const page2 = await listDemonstrations("user-a", { limit: 2, skip: 2 });
    expect(page2.map((r) => r.demonstrationId)).toEqual(["demo-3", "demo-2"]);
    const page3 = await listDemonstrations("user-a", { limit: 2, skip: 4 });
    expect(page3.map((r) => r.demonstrationId)).toEqual(["demo-1"]);
    expect(page3).toHaveLength(1);
  });

  it("never lists another owner's rows", async () => {
    collection.seed("user-b", "demo-b1", { updatedAt: "2026-08-03T00:00:00.000Z" });
    collection.seed("user-a", "demo-a1", { updatedAt: "2026-08-02T00:00:00.000Z" });
    const rows = await listDemonstrations("user-a", { limit: 20 });
    expect(rows.map((r) => r.demonstrationId)).toEqual(["demo-a1"]);
  });
});

describe("concurrent writers and operator-shaped ids", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
  });

  it("two simultaneous writers with the same expected_revision produce exactly one success", async () => {
    await upsertDemonstration("user-a", upsertInput("demo-race"), {
      expectedRevision: 0,
    });
    const writesBefore = collection.writeCount;
    const [a, b] = await Promise.all([
      upsertDemonstration(
        "user-a",
        { ...upsertInput("demo-race"), title: "Writer A" },
        { expectedRevision: 1 }
      ),
      upsertDemonstration(
        "user-a",
        { ...upsertInput("demo-race"), title: "Writer B" },
        { expectedRevision: 1 }
      ),
    ]);
    const statuses = [a.status, b.status].sort();
    // Exactly one write lands; the loser observes the winner's row as a
    // conflict (the revision is part of the atomic match filter).
    expect(statuses).toEqual(["conflict", "ok"]);
    const winner = a.status === "ok" ? a : b;
    const loser = a.status === "ok" ? b : a;
    expect(winner.row?.revision).toBe(2);
    expect(loser.status === "conflict" ? loser.row?.revision : -1).toBe(2);
    expect(collection.rows.size).toBe(1);
    expect(collection.writeCount).toBe(writesBefore + 1);
  });

  it("a simultaneous writer with the same mutation_id and expected_revision replays, not overwrites", async () => {
    await upsertDemonstration("user-a", upsertInput("demo-replay"), {
      mutationId: "m-seed",
      expectedRevision: 0,
    });
    const writesBefore = collection.writeCount;
    const [a, b] = await Promise.all([
      upsertDemonstration("user-a", upsertInput("demo-replay"), {
        mutationId: "m-same",
        expectedRevision: 1,
      }),
      upsertDemonstration("user-a", upsertInput("demo-replay"), {
        mutationId: "m-same",
        expectedRevision: 1,
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    // One writer advances the revision; the other's atomic filter misses and
    // the stored mutation id matches, so it is served as a replay.
    expect(statuses).toEqual(["ok", "replay"]);
    expect(collection.writeCount).toBe(writesBefore + 1);
    expect(collection.rows.size).toBe(1);
  });

  it("dollar-prefixed ids are matched as literals, never as operators", async () => {
    collection.seed("user-a", "$gt");
    collection.seed("user-a", "demo-1");
    // An id of "$gt" reads back only the literal row — no operator behavior.
    expect((await findDemonstration("user-a", "$gt"))?.demonstrationId).toBe("$gt");
    expect(await findDemonstration("user-a", "$ne")).toBeNull();
    expect(await findDemonstration("user-a", "$in")).toBeNull();
    const deleted = await deleteDemonstrations("user-a", ["$gt"]);
    expect(deleted).toBe(1);
    expect(await findDemonstration("user-a", "demo-1")).not.toBeNull();
  });
});
