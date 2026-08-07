/**
 * RED-TEAM — cross-user isolation on the generated-demonstration persistence
 * layer (real repository + real routes, mocked Mongo and session auth, as in
 * tests/demonstrations/backend/).
 *
 * Hostile cases: user B reading/writing/deleting user A's rows; a body that
 * claims firebaseUid="A" while the session uid is "B"; duplicate
 * demonstrationIds across owners (the unique constraint is per-owner); and
 * spec-gating so an attacker cannot persist a rejected spec.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDemonstrations,
  findDemonstration,
  listDemonstrations,
  upsertDemonstration,
  type DemonstrationUpsertInput,
} from "@/lib/mongo/generated-demonstrations";
import { GET as getOne, DELETE as deleteOne } from "@/app/api/demonstrations/[id]/route";
import { PUT } from "@/app/api/demonstrations/route";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { GeneratedDemonstrationRow } from "@/lib/mongo/types";

const mocks = vi.hoisted(() => ({
  verifySessionUser: vi.fn(),
  getPlatformDb: vi.fn(),
}));

vi.mock("@/lib/firebase/server", () => ({
  verifySessionUser: mocks.verifySessionUser,
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
// In-memory fake Mongo (same driver-subset semantics as the backend suite)
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

class FakeCollection {
  readonly rows = new Map<string, AnyRecord>();
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
      return options.returnDocument === "after" ? existing : null;
    }
    if (!options.upsert) return null;
    const doc: AnyRecord = { _id: `fake-id-${this.nextId++}`, ...$set, ...$setOnInsert };
    for (const [key, value] of Object.entries($inc)) {
      doc[key] = ((doc[key] as number) ?? 0) + (value as number);
    }
    this.rows.set(this.key(filter.firebaseUid, filter.demonstrationId), doc);
    return doc;
  }

  find(filter: AnyRecord) {
    let sortSpec: AnyRecord = {};
    let skipCount = 0;
    let limitCount = Infinity;
    return {
      sort(spec: AnyRecord) { sortSpec = spec; return this; },
      skip(count: number) { skipCount = count; return this; },
      limit(count: number) { limitCount = count; return this; },
      toArray: async (): Promise<AnyRecord[]> => {
        const docs = [...this.rows.values()].filter((row) => matches(row, filter));
        for (const [key, dir] of Object.entries(sortSpec)) {
          docs.sort((a, b) => {
            const av = a[key] as string;
            const bv = b[key] as string;
            if (av === bv) return 0;
            return (av < bv ? -1 : 1) * ((dir as number) < 0 ? -1 : 1);
          });
        }
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

  seed(uid: string, demonstrationId: string, overrides: Partial<GeneratedDemonstrationRow> = {}): void {
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

function demonstrationCollection(): FakeCollection {
  const collections = new Map<string, FakeCollection>();
  mocks.getPlatformDb.mockImplementation(async () => ({
    collection: (name: string) => {
      let collection = collections.get(name);
      if (!collection) {
        collection = new FakeCollection();
        collections.set(name, collection);
      }
      return collection;
    },
  }));
  const collection = new FakeCollection();
  collections.set("generated_demonstrations", collection);
  return collection;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function upsertInput(
  demonstrationId: string,
  overrides: Partial<DemonstrationUpsertInput> = {},
): DemonstrationUpsertInput {
  return {
    demonstrationId,
    firebaseUid: "user-a",
    title: "Pendulum Motion",
    normalizedConcept: "Simple harmonic motion of a pendulum",
    trustLevel: "verified_simulation",
    rendererKind: "lumina_2d",
    schemaVersion: 1,
    spec: { schemaVersion: 1, id: demonstrationId } as unknown as DemoSpecV1,
    source: "curated_engine",
    ...overrides,
  };
}

/** Valid Level 1 spec the route gate accepts (mirrors the backend fixture). */
function validSpec(id: string): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id,
    generationId: "gen-abc-123",
    userQuery: "How does a pendulum behave?",
    normalizedConcept: "Simple harmonic motion of a pendulum",
    title: "Pendulum Motion",
    learningObjective: "Observe how length and amplitude affect the period of a pendulum.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: ["Air resistance is ignored."],
      engineId: "pendulum",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "lumina_2d",
      fallbackKind: "data_table",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    simulation: {
      engineId: "pendulum",
      engineVersion: "1.0.0",
      seed: 42,
      parameters: [{ key: "length", label: "Length", min: 0.1, max: 5, step: 0.1, value: 1.2, unit: "m" }],
      readouts: [{ key: "period", label: "Period", format: "fixed2" }],
    },
    controls: [],
    prediction: {
      prompt: "What happens to the period if the length doubles?",
      options: ["It doubles", "It stays the same", "It increases but not by double"],
      correctIndex: 2,
    },
    observationPrompts: [{ prompt: "Record the period for three lengths." }],
    representations: [
      { id: "rep-stage", kind: "stage_2d", label: "Stage" },
      { id: "rep-table", kind: "table", label: "Data table" },
    ],
    adaptationContext: { allowed: false, oneVariableMode: false },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: { maxObjects: 80, maxParticles: 1500, maxTimelineEvents: 30, maxControls: 6 },
  };
}

const USER_B = { uid: "user-b", email: "b@example.com", displayName: "B", avatarUrl: null, provider: "google.com" };

function putRequest(payload: unknown): Request {
  return new Request("http://localhost:3000/api/demonstrations", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

function idRouteRequest(id: string, method: "GET" | "DELETE"): Request {
  return new Request(`http://localhost:3000/api/demonstrations/${id}`, { method });
}

function idParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("RED-TEAM: repository-level owner isolation", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
  });

  it("user B cannot read user A's row, even with the exact same demonstrationId", async () => {
    collection.seed("user-a", "demo-shared", { title: "A's secret demo" });
    expect(await findDemonstration("user-b", "demo-shared")).toBeNull();
    expect(await listDemonstrations("user-b", { limit: 20 })).toEqual([]);
    expect((await findDemonstration("user-a", "demo-shared"))?.title).toBe("A's secret demo");
  });

  it("user B cannot delete user A's row by id", async () => {
    collection.seed("user-a", "demo-shared");
    collection.seed("user-b", "demo-shared");
    const deleted = await deleteDemonstrations("user-b", ["demo-shared"]);
    expect(deleted).toBe(1); // only B's own row
    expect(collection.rows.size).toBe(1);
    expect(await findDemonstration("user-a", "demo-shared")).not.toBeNull();
  });

  it("an upsert keyed on uid=B never overwrites A's row, even for the same demonstrationId", async () => {
    collection.seed("user-a", "demo-shared", { title: "A's version" });
    const result = await upsertDemonstration("user-b", upsertInput("demo-shared", { firebaseUid: "user-b", title: "B's version" }));
    expect(result.status).toBe("ok");
    expect(collection.rows.size).toBe(2);
    expect((await findDemonstration("user-a", "demo-shared"))?.title).toBe("A's version");
    expect((await findDemonstration("user-b", "demo-shared"))?.title).toBe("B's version");
  });

  it("a row object whose firebaseUid claims A is stored under the session uid (B) — the body can never name an owner", async () => {
    const result = await upsertDemonstration("user-b", upsertInput("demo-x", { firebaseUid: "user-a" }));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.row.firebaseUid).toBe("user-b");
    const stored = [...collection.rows.values()][0];
    expect(stored.firebaseUid).toBe("user-b");
    expect(stored.firebaseUid).not.toBe("user-a");
  });

  it("duplicate demonstrationIds across owners coexist (unique constraint is per-owner)", async () => {
    await upsertDemonstration("user-a", upsertInput("demo-same"));
    const b = await upsertDemonstration("user-b", upsertInput("demo-same"));
    expect(b.status).toBe("ok");
    if (b.status !== "ok") return;
    expect(b.row.firebaseUid).toBe("user-b");
    expect(collection.rows.size).toBe(2);
  });

  it("listDemonstrations never leaks another owner's rows even when the other owner is newer", async () => {
    collection.seed("user-b", "demo-b", { updatedAt: "2026-08-04T00:00:00.000Z" });
    collection.seed("user-a", "demo-a", { updatedAt: "2026-08-01T00:00:00.000Z" });
    const rows = await listDemonstrations("user-a", { limit: 20 });
    expect(rows.map((r) => r.demonstrationId)).toEqual(["demo-a"]);
  });
});

describe("RED-TEAM: route-level owner isolation (GET/PUT/DELETE)", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
    mocks.verifySessionUser.mockResolvedValue(USER_B);
  });

  it("GET /api/demonstrations/[id] returns null for another owner's id", async () => {
    collection.seed("user-a", "demo-shared", { title: "A's secret" });
    const response = await getOne(idRouteRequest("demo-shared", "GET"), idParams("demo-shared"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { demonstration: null } });
  });

  it("DELETE /api/demonstrations/[id] cannot delete another owner's row", async () => {
    collection.seed("user-a", "demo-shared");
    const response = await deleteOne(idRouteRequest("demo-shared", "DELETE"), idParams("demo-shared"));
    expect(response.status).toBe(200);
    expect(collection.rows.size).toBe(1);
    expect(await findDemonstration("user-a", "demo-shared")).not.toBeNull();
  });

  it("PUT ignores a body that claims firebaseUid=A: the row is stored under the session uid B", async () => {
    const response = await PUT(
      putRequest({
        demonstration: validSpec("demo-claim"),
        firebaseUid: "user-a",
        user_id: "user-a",
        owner_uid: "user-a",
      }),
    );
    expect(response.status).toBe(200);
    const stored = [...collection.rows.values()][0];
    expect(stored.firebaseUid).toBe("user-b");
    expect(stored.firebaseUid).not.toBe("user-a");
    // A's view of the same id remains empty.
    expect(await findDemonstration("user-a", "demo-claim")).toBeNull();
  });

  it("PUT cannot overwrite user A's row when the session user is B", async () => {
    collection.seed("user-a", "demo-shared", { title: "A's original" });
    const response = await PUT(putRequest({ demonstration: validSpec("demo-shared") }));
    expect(response.status).toBe(200);
    expect(collection.rows.size).toBe(2);
    expect((await findDemonstration("user-a", "demo-shared"))?.title).toBe("A's original");
  });

  it("PUT rejects an invalid spec (400 invalid_spec) and persists nothing", async () => {
    const response = await PUT(putRequest({ demonstration: { bogus: true } }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_spec");
    expect(Array.isArray(body.reasons)).toBe(true);
    expect(collection.rows.size).toBe(0);
  });

  it("PUT returns 401 without a verified session", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);
    const response = await PUT(putRequest({ demonstration: validSpec("demo-401") }));
    expect(response.status).toBe(401);
    expect(collection.rows.size).toBe(0);
  });
});
