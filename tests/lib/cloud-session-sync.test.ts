import { beforeEach, describe, expect, it } from "vitest";
import {
  CloudSessionRepository,
  snapshotFromLocal,
  type SessionSnapshot,
} from "@/sync/cloud-session-repository";
import { CloudSessionSync, newestEvidenceTime } from "@/sync/cloud-session-sync";
import type {
  LearningSessionRow,
  LearningSessionStatus,
} from "@/lib/supabase/types";

/**
 * Stateful, semantically honest mock of the supabase query chain for
 * learning_sessions: it records every call (including order/limit args, eq
 * filters, and upsert options), applies the recorded filters/sort/limit to the
 * in-memory row map, and applies upserts/updates/deletes to the map. A test
 * that relies on the mock's insertion order alone would now fail if
 * production stopped ordering or filtering.
 */
interface MockCall {
  op: string;
  args?: unknown[];
  payload?: unknown;
  options?: unknown;
}

function createMockClient() {
  const calls: MockCall[] = [];
  const state = new Map<string, LearningSessionRow>();
  let failNext = false;

  function buildQuery(_table: string) {
    const filters: Array<{ column: string; value: unknown }> = [];
    let order: { column: string; ascending: boolean } | null = null;
    let limitCount: number | null = null;

    async function finish(single: boolean) {
      let rows = [...state.values()].filter((row) =>
        filters.every(
          ({ column, value }) =>
            (row as unknown as Record<string, unknown>)[column] === value
        )
      );
      if (order) {
        const o = order;
        rows.sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[o.column];
          const bv = (b as unknown as Record<string, unknown>)[o.column];
          if (typeof av === "string" && typeof bv === "string") {
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return o.ascending ? cmp : -cmp;
          }
          return 0;
        });
      }
      if (limitCount !== null) rows = rows.slice(0, limitCount);
      if (failNext) {
        failNext = false;
        throw new Error("network down");
      }
      return single
        ? { data: rows[0] ?? null, error: null }
        : { data: rows, error: null };
    }

    const chain = {
      select: () => {
        calls.push({ op: "select", args: [_table] });
        return chain;
      },
      order: (column: string, options: { ascending: boolean }) => {
        calls.push({ op: "order", args: [column, options] });
        order = { column, ascending: options.ascending };
        return chain;
      },
      // Like the real postgrest-js builder, `limit` returns the chain (so
      // `.limit(1).maybeSingle()` works); awaiting the chain itself runs the
      // list query.
      limit: (n: number) => {
        calls.push({ op: "limit", args: [n] });
        limitCount = n;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        calls.push({ op: "eq", args: [column, value] });
        filters.push({ column, value });
        return chain;
      },
      maybeSingle: async () => {
        calls.push({ op: "maybeSingle" });
        return finish(true);
      },
      then: (
        onFulfilled: (value: { data: LearningSessionRow[]; error: null }) => unknown,
        onRejected: (reason: unknown) => unknown
      ) =>
        finish(false).then(
          (result) =>
            onFulfilled(result as { data: LearningSessionRow[]; error: null }),
          onRejected
        ),
    };
    return chain;
  }

  const client = {
    calls,
    state,
    get failNext() {
      return failNext;
    },
    set failNext(value: boolean) {
      failNext = value;
    },
    from: (table: string) => {
      const chain = buildQuery(table);
      return {
        select: chain.select,
        upsert: async (payload: Record<string, unknown>, options: unknown) => {
          calls.push({ op: "upsert", payload, options });
          const existing = state.get(payload.id as string);
          state.set(payload.id as string, {
            ...(existing ?? ({} as LearningSessionRow)),
            ...payload,
            created_at: existing?.created_at ?? "2026-08-03T00:00:00.000Z",
            updated_at: new Date().toISOString(),
          } as LearningSessionRow);
          return { error: null };
        },
        update: (payload: unknown) => ({
          eq: async (column: string, value: string) => {
            calls.push({ op: "update", payload, args: [column, value] });
            const existing = state.get(value);
            if (existing) {
              state.set(value, { ...existing, ...(payload as object) } as LearningSessionRow);
            }
            return { error: null };
          },
        }),
        delete: () => ({
          in: async (column: string, ids: string[]) => {
            calls.push({ op: "delete", args: [column, ids] });
            for (const id of ids) state.delete(id);
            return { error: null };
          },
        }),
      };
    },
  };
  return client;
}

type MockClient = ReturnType<typeof createMockClient>;

function rowFor(
  snapshot: SessionSnapshot,
  userId = "user-a",
  updatedAt = "2026-08-03T00:00:00.000Z"
): LearningSessionRow {
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
    updated_at: updatedAt,
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

  it("upserts are idempotent: every call carries { onConflict: 'id' } and one row per session id", async () => {
    const repo = new CloudSessionRepository(client as never, "user-a");
    const snapshot = snapshotWith("s-1", "2026-08-03T10:00:00.000Z");
    // Re-importing the same stable id (two devices / import twice) must never
    // create a duplicate row: the upsert options are the contract.
    await repo.upsert(snapshot);
    await repo.upsert(snapshot);
    const upsertCalls = client.calls.filter((c) => c.op === "upsert");
    expect(upsertCalls).toHaveLength(2);
    for (const call of upsertCalls) {
      expect(call.options).toEqual({ onConflict: "id" });
    }
    expect(client.state.size).toBe(1);
    expect(client.state.get("s-1")?.id).toBe("s-1");
  });

  it("lists newest first: issues order(updated_at desc) + limit(20) and returns the sorted rows", async () => {
    // s-1 is inserted first, but s-2 has the newer updated_at. If the mock
    // were consulted in insertion order (or production dropped the order
    // clause) this assertion would fail.
    client.state.set(
      "s-1",
      rowFor(
        snapshotWith("s-1", "2026-08-03T10:00:00.000Z"),
        "user-a",
        "2026-08-03T10:00:00.000Z"
      )
    );
    client.state.set(
      "s-2",
      rowFor(
        snapshotWith("s-2", "2026-08-03T11:00:00.000Z"),
        "user-a",
        "2026-08-03T11:00:00.000Z"
      )
    );
    const repo = new CloudSessionRepository(client as never, "user-a");
    const rows = await repo.list();
    expect(rows.map((r) => r.id)).toEqual(["s-2", "s-1"]);
    expect(rows[0]?.labSlug).toBe("nuclear-chain-reaction");
    expect(client.calls.find((c) => c.op === "order")).toEqual({
      op: "order",
      args: ["updated_at", { ascending: false }],
    });
    expect(client.calls.find((c) => c.op === "limit")).toEqual({
      op: "limit",
      args: [20],
    });
  });

  it("honors a custom limit", async () => {
    for (const id of ["s-1", "s-2", "s-3"]) {
      client.state.set(id, rowFor(snapshotWith(id, "2026-08-03T10:00:00.000Z")));
    }
    const repo = new CloudSessionRepository(client as never, "user-a");
    const rows = await repo.list(2);
    expect(rows).toHaveLength(2);
    expect(client.calls.find((c) => c.op === "limit")).toEqual({
      op: "limit",
      args: [2],
    });
  });

  it("getIncompleteForLab filters lab_slug + status active and returns the newest match", async () => {
    const mk = (
      id: string,
      status: LearningSessionStatus,
      updatedAt: string
    ): LearningSessionRow => ({
      ...rowFor(snapshotWith(id, "2026-08-03T09:00:00.000Z")),
      status,
      updated_at: updatedAt,
    });
    // s-2 has the newest updated_at but is complete — it must be filtered out.
    client.state.set("s-1", mk("s-1", "active", "2026-08-03T08:00:00.000Z"));
    client.state.set("s-2", mk("s-2", "complete", "2026-08-03T11:00:00.000Z"));
    client.state.set("s-3", mk("s-3", "active", "2026-08-03T10:00:00.000Z"));

    const repo = new CloudSessionRepository(client as never, "user-a");
    const row = await repo.getIncompleteForLab("nuclear-chain-reaction");

    expect(row?.id).toBe("s-3");
    const eqCalls = client.calls
      .filter((c) => c.op === "eq")
      .map((c) => c.args);
    expect(eqCalls).toContainEqual(["lab_slug", "nuclear-chain-reaction"]);
    expect(eqCalls).toContainEqual(["status", "active"]);
    expect(client.calls.find((c) => c.op === "order")).toEqual({
      op: "order",
      args: ["updated_at", { ascending: false }],
    });
    expect(client.calls.find((c) => c.op === "limit")).toEqual({
      op: "limit",
      args: [1],
    });
    expect(client.calls.some((c) => c.op === "maybeSingle")).toBe(true);
  });

  it("getIncompleteForLab returns null when nothing matches the filters", async () => {
    client.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"))
    );
    const repo = new CloudSessionRepository(client as never, "user-a");
    const row = await repo.getIncompleteForLab("some-other-lab");
    expect(row).toBeNull();
  });

  it("marks a session complete with an update payload and the id filter", async () => {
    const repo = new CloudSessionRepository(client as never, "user-a");
    await repo.markComplete("s-1");
    const updateCall = client.calls.find((c) => c.op === "update");
    expect(updateCall?.payload).toMatchObject({ status: "complete" });
    expect(
      typeof (updateCall?.payload as { completed_at?: unknown })
        .completed_at
    ).toBe("string");
    expect(updateCall?.args).toEqual(["id", "s-1"]);
  });

  it("deletes only requested ids", async () => {
    const repo = new CloudSessionRepository(client as never, "user-a");
    await repo.deleteByIds(["s-1", "s-2"]);
    const deleteCall = client.calls.find((c) => c.op === "delete");
    expect(deleteCall?.args).toEqual(["id", ["s-1", "s-2"]]);
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

  it("preserves a completed cloud session: save() keeps status complete and completedAt", async () => {
    // Reviewing an old completed session must not flip the dashboard row back
    // to in progress: the local snapshot is active and newer, but the cloud
    // copy is complete.
    client.state.set("s-1", {
      ...rowFor(snapshotWith("s-1", "2026-08-03T09:00:00.000Z")),
      status: "complete",
      completed_at: "2026-08-03T11:00:00.000Z",
    });
    const sync = new CloudSessionSync(
      new CloudSessionRepository(client as never, "user-a")
    );
    const outcome = await sync.save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("saved");
    const upsertCall = client.calls.find((c) => c.op === "upsert");
    expect(upsertCall?.payload).toMatchObject({
      id: "s-1",
      status: "complete",
      completed_at: "2026-08-03T11:00:00.000Z",
    });
  });

  it("on an equal-timestamp conflict the local snapshot wins (documented tie policy)", async () => {
    // Policy: "the newer valid snapshot wins" — a tie (cloudTime === localTime)
    // is not strictly newer, so the local save proceeds instead of keeping the
    // cloud copy.
    client.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"))
    );
    const sync = new CloudSessionSync(
      new CloudSessionRepository(client as never, "user-a")
    );
    const outcome = await sync.save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("saved");
    expect(client.calls.some((c) => c.op === "upsert")).toBe(true);
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
