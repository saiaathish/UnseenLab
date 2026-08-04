import { beforeEach, describe, expect, it } from "vitest";
import {
  CloudSessionRepository,
  snapshotFromLocal,
  type SessionSnapshot,
} from "@/sync/cloud-session-repository";
import { CloudSessionSync, newestEvidenceTime } from "@/sync/cloud-session-sync";
import type { LearningSessionRow } from "@/lib/supabase/types";

/** Minimal mock of the supabase query chain for learning_sessions. */
function createMockClient() {
  const calls: Array<{ op: string; payload?: unknown }> = [];
  const state = new Map<string, LearningSessionRow>();
  let failNext = false;

  const client = {
    calls,
    state,
    get failNext() {
      return failNext;
    },
    set failNext(value: boolean) {
      failNext = value;
    },
    maybeSingleImpl: async () => {
      if (failNext) {
        failNext = false;
        throw new Error("network down");
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          limit: async () => {
            calls.push({ op: `select:${table}:order` });
            return { data: [...state.values()], error: null };
          },
          maybeSingle: async () => {
            calls.push({ op: `select:${table}:order` });
            if (failNext) {
              failNext = false;
              throw new Error("network down");
            }
            const first = [...state.values()][0] ?? null;
            return { data: first, error: null };
          },
        }),
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            calls.push({ op: `select:${table}:${column}` });
            if (failNext) {
              failNext = false;
              throw new Error("network down");
            }
            const row = [...state.values()].find(
              (r) => r[column as keyof LearningSessionRow] === value
            );
            return { data: row ?? null, error: null };
          },
          order: () => ({
            limit: async () => {
              calls.push({ op: `select:${table}:eq:order` });
              return { data: [...state.values()], error: null };
            },
            maybeSingle: async () => {
              calls.push({ op: `select:${table}:eq:order` });
              if (failNext) {
                failNext = false;
                throw new Error("network down");
              }
              const first = [...state.values()][0] ?? null;
              return { data: first, error: null };
            },
          }),
        }),
      }),
      upsert: async (payload: unknown) => {
        calls.push({ op: "upsert", payload });
        return { error: null };
      },
      update: () => ({
        eq: async () => {
          calls.push({ op: "update" });
          return { error: null };
        },
      }),
      delete: () => ({
        in: async () => {
          calls.push({ op: "delete" });
          return { error: null };
        },
      }),
    }),
  };
  return client;
}

type MockClient = ReturnType<typeof createMockClient>;

function rowFor(snapshot: SessionSnapshot, userId = "user-a"): LearningSessionRow {
  return {
    id: snapshot.id,
    user_id: userId,
    lab_slug: snapshot.labSlug,
    status: snapshot.status,
    title: snapshot.title,
    schema_version: snapshot.schemaVersion,
    evidence: snapshot.evidence,
    workflow: snapshot.workflow,
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-03T00:00:00.000Z",
    completed_at: snapshot.completedAt,
  };
}

function snapshotWith(id: string, trialTime: string): SessionSnapshot {
  return snapshotFromLocal(
    id,
    "Nuclear Chain Reaction",
    {
      trials: [{ id: "t-1", completedAt: trialTime }],
      predictions: [],
      representationEvents: [],
      adaptationProposals: [],
      conceptEvidence: [],
      counterfactuals: [],
    },
    { pendingPrediction: null }
  );
}

describe("newestEvidenceTime", () => {
  it("returns 0 for empty evidence", () => {
    expect(newestEvidenceTime({})).toBe(0);
  });

  it("finds the latest timestamp across trials, predictions and proposals", () => {
    const time = newestEvidenceTime({
      trials: [{ completedAt: "2026-08-03T10:00:00.000Z" }],
      predictions: [{ createdAt: "2026-08-03T11:00:00.000Z" }],
      adaptationProposals: [{ decidedAt: "2026-08-03T12:00:00.000Z" }],
    });
    expect(time).toBe(Date.parse("2026-08-03T12:00:00.000Z"));
  });
});

describe("CloudSessionRepository", () => {
  let client: MockClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("upserts with the authenticated user id (RLS with check requires it)", async () => {
    const repo = new CloudSessionRepository(client as never, "user-a");
    await repo.upsert(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"));
    const upsertCall = client.calls.find((c) => c.op === "upsert");
    expect(upsertCall?.payload).toMatchObject({
      id: "s-1",
      user_id: "user-a",
      lab_slug: "nuclear-chain-reaction",
    });
  });

  it("lists newest first and maps rows back to snapshots", async () => {
    client.state.set("s-1", rowFor(snapshotWith("s-1", "2026-08-03T10:00:00.000Z")));
    client.state.set("s-2", rowFor(snapshotWith("s-2", "2026-08-03T11:00:00.000Z")));
    const repo = new CloudSessionRepository(client as never, "user-a");
    const rows = await repo.list();
    expect(rows.map((r) => r.id)).toEqual(["s-1", "s-2"]);
  });

  it("marks a session complete", async () => {
    const repo = new CloudSessionRepository(client as never, "user-a");
    await repo.markComplete("s-1");
    expect(client.calls.some((c) => c.op === "update")).toBe(true);
  });

  it("deletes only requested ids", async () => {
    const repo = new CloudSessionRepository(client as never, "user-a");
    await repo.deleteByIds(["s-1", "s-2"]);
    expect(client.calls.some((c) => c.op === "delete")).toBe(true);
    await repo.deleteByIds([]);
    expect(client.calls.filter((c) => c.op === "delete")).toHaveLength(1);
  });
});

describe("CloudSessionSync conflict policy", () => {
  let client: MockClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("saves when no cloud copy exists", async () => {
    const sync = new CloudSessionSync(
      new CloudSessionRepository(client as never, "user-a")
    );
    const outcome = await sync.save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("saved");
  });

  it("saves when the local snapshot is newer", async () => {
    client.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T09:00:00.000Z"))
    );
    const sync = new CloudSessionSync(
      new CloudSessionRepository(client as never, "user-a")
    );
    const outcome = await sync.save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("saved");
  });

  it("keeps a newer cloud copy (never overwrites with older local evidence)", async () => {
    client.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T11:00:00.000Z"))
    );
    const sync = new CloudSessionSync(
      new CloudSessionRepository(client as never, "user-a")
    );
    const outcome = await sync.save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("cloud_newer_kept");
    expect(client.calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("keeps a cloud copy with a newer schema version", async () => {
    const cloud = rowFor(snapshotWith("s-1", "2026-08-03T09:00:00.000Z"));
    cloud.schema_version = 99;
    client.state.set("s-1", cloud);
    const sync = new CloudSessionSync(
      new CloudSessionRepository(client as never, "user-a")
    );
    const outcome = await sync.save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("cloud_schema_newer_kept");
  });

  it("reports offline instead of throwing when the cloud is unreachable", async () => {
    const broken = createMockClient();
    broken.failNext = true;
    const sync = new CloudSessionSync(
      new CloudSessionRepository(broken as never, "user-a")
    );
    const outcome = await sync.save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("offline");
  });

  it("does not touch other sessions with different ids", async () => {
    client.state.set(
      "other",
      rowFor(snapshotWith("other", "2026-08-03T11:00:00.000Z"))
    );
    const sync = new CloudSessionSync(
      new CloudSessionRepository(client as never, "user-a")
    );
    await sync.save(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"));
    expect(client.state.has("other")).toBe(true);
    expect(client.state.get("other")?.id).toBe("other");
  });
});
