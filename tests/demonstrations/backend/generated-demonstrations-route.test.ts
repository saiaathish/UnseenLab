import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listGet, PUT, DELETE as batchDelete } from "@/app/api/demonstrations/route";
import { GET as getOne, DELETE as deleteOne } from "@/app/api/demonstrations/[id]/route";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { validateDemoSpec } from "@/demonstrations/validation";
import type { GeneratedDemonstrationRow } from "@/lib/mongo/types";

/**
 * Route tests for /api/demonstrations. The route's auth (verifySessionUser)
 * and Mongo handle (getPlatformDb) are mocked; the repository underneath and
 * the spec validator are the REAL implementations, so owner scoping and spec
 * gating are exercised end to end against an in-memory fake collection.
 */

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

const SESSION_USER = {
  uid: "user-platform-a",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  provider: "google.com",
};

// ---------------------------------------------------------------------------
// In-memory fake Mongo (same semantics as the repository test suite)
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
    const self = this;
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
      async toArray(): Promise<AnyRecord[]> {
        const docs = [...self.rows.values()].filter((row) => matches(row, filter));
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
  // Eagerly create the demonstration collection so tests can seed it before
  // the first repository call (the repo acquires the db lazily per call).
  const collection = new FakeCollection();
  collections.set("generated_demonstrations", collection);
  return collection;
}

// ---------------------------------------------------------------------------
// Spec fixture (mirrors the validated fixture in tests/demonstrations)
// ---------------------------------------------------------------------------

function baseLimits(): DemoSpecV1["limits"] {
  return {
    maxObjects: 80,
    maxParticles: 1500,
    maxTimelineEvents: 30,
    maxControls: 6,
  };
}

/** Valid Level 1 spec: pendulum engine, accepted by validateDemoSpec. */
function validSpec(overrides: Partial<DemoSpecV1> = {}): DemoSpecV1 {
  const spec: DemoSpecV1 = {
    schemaVersion: 1,
    id: "demo-001",
    generationId: "gen-abc-123",
    userQuery: "How does a pendulum behave?",
    normalizedConcept: "Simple harmonic motion of a pendulum",
    title: "Pendulum Motion",
    learningObjective:
      "Observe how length and amplitude affect the period of a pendulum.",
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
      parameters: [
        {
          key: "length",
          label: "Pendulum length",
          min: 0.1,
          max: 5,
          step: 0.1,
          value: 1.2,
          unit: "m",
        },
      ],
      readouts: [{ key: "period", label: "Period", format: "fixed2" }],
    },
    scene3d: {
      objects: [
        { id: "pivot", kind: "box", position: { x: 0, y: 1, z: 0 } },
        {
          id: "bob",
          kind: "sphere",
          position: { x: 0, y: 0, z: 0 },
          size: 0.25,
          color: "#ff8800",
        },
      ],
      relationships: [{ id: "rod", type: "causes", from: "pivot", to: "bob" }],
      animations: [
        {
          id: "swing",
          target: "bob",
          operator: "oscillate",
          speed: 1,
          axis: "y",
          amplitude: 0.4,
        },
      ],
    },
    controls: [
      {
        id: "length-control",
        type: "slider",
        label: "Length",
        target: { kind: "parameter", ref: "length" },
        min: 0.1,
        max: 5,
        step: 0.1,
      },
    ],
    prediction: {
      prompt: "What happens to the period if the length doubles?",
      options: [
        "It doubles",
        "It stays the same",
        "It increases but not by double",
      ],
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
    limits: baseLimits(),
    ...overrides,
  };
  return spec;
}

function putRequest(payload: unknown): Request {
  return new Request("http://localhost:3000/api/demonstrations", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

function deleteRequest(payload: unknown): Request {
  return new Request("http://localhost:3000/api/demonstrations", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

function idRouteRequest(id: string, method: "GET" | "DELETE"): Request {
  return new Request(`http://localhost:3000/api/demonstrations/${id}`, {
    method,
  });
}

function idParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/demonstrations", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
  });

  it("returns 401 without a verified session", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);
    const response = await listGet(
      new Request("http://localhost:3000/api/demonstrations")
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns the owner's demonstrations newest first in the contract shape", async () => {
    collection.seed("user-platform-a", "demo-old", {
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    collection.seed("user-platform-a", "demo-new", {
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
    const response = await listGet(
      new Request("http://localhost:3000/api/demonstrations?limit=1")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      data: {
        demonstrations: [expect.objectContaining({ demonstrationId: "demo-new" })],
      },
    });
  });

  it("defaults to limit 20 and never includes another owner's rows", async () => {
    collection.seed("user-platform-a", "demo-a1");
    collection.seed("user-platform-b", "demo-b1");
    const response = await listGet(
      new Request("http://localhost:3000/api/demonstrations")
    );
    const body = await response.json();
    expect(body.data.demonstrations).toHaveLength(1);
    expect(body.data.demonstrations[0].demonstrationId).toBe("demo-a1");
  });

  it("rejects out-of-range limits with 400", async () => {
    const response = await listGet(
      new Request("http://localhost:3000/api/demonstrations?limit=0")
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_input" });
  });
});

describe("PUT /api/demonstrations", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
  });

  it("returns 401 without a verified session", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);
    const response = await PUT(putRequest({ demonstration: validSpec() }));
    expect(response.status).toBe(401);
  });

  it("persists a validated spec at revision 1 with derived columns", async () => {
    const response = await PUT(putRequest({ demonstration: validSpec() }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.demonstration).toMatchObject({
      demonstrationId: "demo-001",
      title: "Pendulum Motion",
      normalizedConcept: "Simple harmonic motion of a pendulum",
      trustLevel: "verified_simulation",
      rendererKind: "lumina_2d",
      schemaVersion: 1,
      source: "curated_engine",
      revision: 1,
    });
    expect(body.data.demonstration).not.toHaveProperty("_id");
  });

  it("rejects an invalid spec with 400 invalid_spec (safe reasons only)", async () => {
    const response = await PUT(putRequest({ demonstration: { bogus: true } }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_spec");
    expect(Array.isArray(body.reasons)).toBe(true);
    expect(collection.rows.size).toBe(0);
  });

  it("rejects an oversize spec (>256 KB) with 413 before validation", async () => {
    const huge = validSpec({
      userQuery: "x".repeat(256 * 1024 + 1),
    });
    const response = await PUT(putRequest({ demonstration: huge }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too_large" });
    expect(collection.rows.size).toBe(0);
  });

  it("ignores a fake uid in the body: ownership always comes from the session cookie", async () => {
    const response = await PUT(
      putRequest({
        demonstration: validSpec(),
        firebaseUid: "user-platform-evil",
        user_id: "user-platform-evil",
      })
    );
    expect(response.status).toBe(200);
    const stored = [...collection.rows.values()][0];
    expect(stored.firebaseUid).toBe("user-platform-a");
    expect(stored.firebaseUid).not.toBe("user-platform-evil");
  });

  it("rejects a body without a demonstration", async () => {
    const response = await PUT(putRequest({ expected_revision: 1 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_input" });
  });

  it("rejects a non-JSON body", async () => {
    const request = new Request("http://localhost:3000/api/demonstrations", {
      method: "PUT",
      body: "not json",
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("responds 409 conflict with the current row on a stale expected_revision", async () => {
    await PUT(putRequest({ demonstration: validSpec() }));
    const stale = await PUT(
      putRequest({
        demonstration: validSpec(),
        expected_revision: 0,
      })
    );
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error).toBe("conflict");
    expect(body.data.demonstration.revision).toBe(1);
    expect(collection.rows.size).toBe(1);
  });

  it("treats a repeated mutation_id as an idempotent replay (revision stays 1)", async () => {
    const first = await PUT(
      putRequest({ demonstration: validSpec(), mutation_id: "m-1" })
    );
    expect(first.status).toBe(200);
    const replay = await PUT(
      putRequest({ demonstration: validSpec(), mutation_id: "m-1" })
    );
    expect(replay.status).toBe(200);
    const body = await replay.json();
    expect(body.data.demonstration.revision).toBe(1);
    expect(collection.rows.size).toBe(1);
  });
});

describe("DELETE /api/demonstrations", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
  });

  it("returns 401 without a verified session", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);
    const response = await batchDelete(deleteRequest({ ids: ["demo-1"] }));
    expect(response.status).toBe(401);
  });

  it("deletes only the owner's rows, even when another owner shares the id", async () => {
    collection.seed("user-platform-a", "demo-1");
    collection.seed("user-platform-b", "demo-1");
    const response = await batchDelete(deleteRequest({ ids: ["demo-1"] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(collection.rows.size).toBe(1);
    const remaining = [...collection.rows.values()][0];
    expect(remaining.firebaseUid).toBe("user-platform-b");
  });

  it("rejects empty id lists with 400", async () => {
    const response = await batchDelete(deleteRequest({ ids: [] }));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/demonstrations/[id]", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
  });

  it("returns 401 without a verified session", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);
    const response = await getOne(
      idRouteRequest("demo-1", "GET"),
      idParams("demo-1")
    );
    expect(response.status).toBe(401);
  });

  it("returns the owner's row", async () => {
    collection.seed("user-platform-a", "demo-1", {
      title: "Pendulum Motion",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
    const response = await getOne(
      idRouteRequest("demo-1", "GET"),
      idParams("demo-1")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      data: {
        demonstration: expect.objectContaining({
          demonstrationId: "demo-1",
          title: "Pendulum Motion",
        }),
      },
    });
  });

  it("returns null for an id owned by another user", async () => {
    collection.seed("user-platform-b", "demo-1");
    const response = await getOne(
      idRouteRequest("demo-1", "GET"),
      idParams("demo-1")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { demonstration: null } });
  });

  it("returns null for an unknown id", async () => {
    const response = await getOne(
      idRouteRequest("demo-unknown", "GET"),
      idParams("demo-unknown")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { demonstration: null } });
  });
});

describe("DELETE /api/demonstrations/[id]", () => {
  let collection: FakeCollection;

  beforeEach(() => {
    vi.clearAllMocks();
    collection = demonstrationCollection();
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
  });

  it("returns 401 without a verified session", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);
    const response = await deleteOne(
      idRouteRequest("demo-1", "DELETE"),
      idParams("demo-1")
    );
    expect(response.status).toBe(401);
  });

  it("deletes only the owner's row; another owner's same-id row survives", async () => {
    collection.seed("user-platform-a", "demo-1");
    collection.seed("user-platform-b", "demo-1");
    const response = await deleteOne(
      idRouteRequest("demo-1", "DELETE"),
      idParams("demo-1")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(collection.rows.size).toBe(1);
    const remaining = [...collection.rows.values()][0];
    expect(remaining.firebaseUid).toBe("user-platform-b");
  });

  it("deleting an unknown id is ok, not an error", async () => {
    const response = await deleteOne(
      idRouteRequest("demo-unknown", "DELETE"),
      idParams("demo-unknown")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

// Guard: the fixture spec must actually pass the validator the route gates on.
describe("fixture sanity", () => {
  it("the validSpec fixture is accepted by validateDemoSpec", () => {
    const result = validateDemoSpec(validSpec());
    expect(result.status).toBe("valid");
  });
});
