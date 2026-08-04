import { beforeEach, describe, expect, it } from "vitest";
import {
  CloudSessionRepository,
  snapshotFromLocal,
  type FetchLike,
  type SessionSnapshot,
} from "@/sync/cloud-session-repository";
import { CloudSessionSync, newestEvidenceTime } from "@/sync/cloud-session-sync";
import type {
  LearningSessionRow,
  LearningSessionStatus,
} from "@/lib/mongo/types";

/**
 * Stateful, semantically honest mock of the session-cookie-protected API
 * routes: it records every fetch (method, URL, body), applies the route's
 * filtering/sorting/limiting to the in-memory row map, and applies
 * upserts/updates/deletes to the map. A test that relies on the mock's
 * insertion order alone would now fail if production stopped ordering or
 * filtering.
 */
interface FetchCall {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function createMockFetcher() {
  const calls: FetchCall[] = [];
  const state = new Map<string, LearningSessionRow>();
  let failNext = false;
  let failNextStatus: number | null = null;

  const fetcher: FetchLike = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url,
      body:
        init?.body !== undefined
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined,
    });

    if (failNext) {
      failNext = false;
      throw new Error("network down");
    }
    if (failNextStatus !== null) {
      const status = failNextStatus;
      failNextStatus = null;
      return jsonResponse({ error: "internal" }, status);
    }

    if (method === "GET" && url.startsWith("/api/cloud/sessions")) {
      const params = new URL(url, "http://unseenlab.test").searchParams;
      const rows = [...state.values()];
      const id = params.get("id");
      if (id) {
        return jsonResponse({
          data: { session: rows.find((r) => r.id === id) ?? null },
        });
      }
      const labSlug = params.get("lab_slug");
      const status = params.get("status");
      const filtered = rows.filter(
        (row) =>
          (labSlug === null || row.lab_slug === labSlug) &&
          (status === null || row.status === status)
      );
      filtered.sort((a, b) =>
        a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0
      );
      const limit = Number(params.get("limit") ?? "20");
      return jsonResponse({ data: { sessions: filtered.slice(0, limit) } });
    }

    if (method === "PUT" && url === "/api/cloud/sessions") {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const existing = state.get(payload.id as string);
      const row = {
        ...(existing ?? ({} as LearningSessionRow)),
        ...(payload as object),
        created_at: existing?.created_at ?? "2026-08-03T00:00:00.000Z",
        updated_at: new Date().toISOString(),
      } as LearningSessionRow;
      state.set(payload.id as string, row);
      return jsonResponse({ data: { session: row } });
    }

    if (method === "DELETE" && url === "/api/cloud/sessions") {
      const { ids } = JSON.parse(String(init?.body)) as { ids: string[] };
      for (const id of ids) state.delete(id);
      return jsonResponse({ ok: true });
    }

    if (method === "POST" && url.endsWith("/complete")) {
      // /api/cloud/sessions/<id>/complete
      const id = url.split("/")[4];
      const existing = state.get(id);
      if (existing) {
        state.set(id, {
          ...existing,
          status: "complete",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "not_found" }, 404);
  };

  return {
    fetcher,
    calls,
    state,
    get failNext() {
      return failNext;
    },
    set failNext(value: boolean) {
      failNext = value;
    },
    set failNextStatus(value: number | null) {
      failNextStatus = value;
    },
  };
}

type MockFetcher = ReturnType<typeof createMockFetcher>;

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
  let mock: MockFetcher;

  beforeEach(() => {
    mock = createMockFetcher();
  });

  it("PUTs the snapshot to /api/cloud/sessions without a user id (ownership comes from the session cookie)", async () => {
    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    await repo.upsert(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"));
    const putCall = mock.calls.find((c) => c.method === "PUT");
    expect(putCall?.url).toBe("/api/cloud/sessions");
    expect(putCall?.body).toMatchObject({
      id: "s-1",
      lab_slug: "nuclear-chain-reaction",
      status: "active",
      title: "Nuclear Chain Reaction",
      schema_version: 1,
      evidence: expect.any(Object),
      workflow: expect.any(Object),
      completed_at: null,
    });
    // Security invariant: the body must never carry a user id — the server
    // derives ownership from the verified session cookie only.
    expect(putCall?.body?.user_id).toBeUndefined();
  });

  it("upserts are idempotent: re-saving the same id never creates a duplicate row", async () => {
    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    const snapshot = snapshotWith("s-1", "2026-08-03T10:00:00.000Z");
    // Re-importing the same stable id (two devices / import twice) must never
    // create a duplicate row: the server upserts on { id }.
    await repo.upsert(snapshot);
    await repo.upsert(snapshot);
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(2);
    expect(mock.state.size).toBe(1);
    expect(mock.state.get("s-1")?.id).toBe("s-1");
  });

  it("lists newest first: GET with limit=20 and the server returns rows sorted by updated_at desc", async () => {
    // s-1 is inserted first, but s-2 has the newer updated_at. If the mock
    // were consulted in insertion order (or production dropped the sort) this
    // assertion would fail.
    mock.state.set(
      "s-1",
      rowFor(
        snapshotWith("s-1", "2026-08-03T10:00:00.000Z"),
        "user-a",
        "2026-08-03T10:00:00.000Z"
      )
    );
    mock.state.set(
      "s-2",
      rowFor(
        snapshotWith("s-2", "2026-08-03T11:00:00.000Z"),
        "user-a",
        "2026-08-03T11:00:00.000Z"
      )
    );
    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    const rows = await repo.list();
    expect(rows.map((r) => r.id)).toEqual(["s-2", "s-1"]);
    expect(rows[0]?.labSlug).toBe("nuclear-chain-reaction");
    expect(mock.calls[0]).toEqual({
      method: "GET",
      url: "/api/cloud/sessions?limit=20",
      body: undefined,
    });
  });

  it("honors a custom limit", async () => {
    for (const id of ["s-1", "s-2", "s-3"]) {
      mock.state.set(id, rowFor(snapshotWith(id, "2026-08-03T10:00:00.000Z")));
    }
    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    const rows = await repo.list(2);
    expect(rows).toHaveLength(2);
    expect(mock.calls[0]?.url).toBe("/api/cloud/sessions?limit=2");
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
    mock.state.set("s-1", mk("s-1", "active", "2026-08-03T08:00:00.000Z"));
    mock.state.set("s-2", mk("s-2", "complete", "2026-08-03T11:00:00.000Z"));
    mock.state.set("s-3", mk("s-3", "active", "2026-08-03T10:00:00.000Z"));

    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    const row = await repo.getIncompleteForLab("nuclear-chain-reaction");

    expect(row?.id).toBe("s-3");
    expect(mock.calls[0]?.url).toBe(
      "/api/cloud/sessions?lab_slug=nuclear-chain-reaction&status=active&limit=1"
    );
  });

  it("getIncompleteForLab returns null when nothing matches the filters", async () => {
    mock.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"))
    );
    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    const row = await repo.getIncompleteForLab("some-other-lab");
    expect(row).toBeNull();
  });

  it("marks a session complete via POST to the id-scoped complete route", async () => {
    mock.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"))
    );
    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    await repo.markComplete("s-1");
    expect(mock.calls[0]).toMatchObject({
      method: "POST",
      url: "/api/cloud/sessions/s-1/complete",
    });
    expect(mock.state.get("s-1")?.status).toBe("complete");
    expect(typeof mock.state.get("s-1")?.completed_at).toBe("string");
  });

  it("deletes only requested ids", async () => {
    mock.state.set("s-1", rowFor(snapshotWith("s-1", "2026-08-03T10:00:00.000Z")));
    mock.state.set("s-2", rowFor(snapshotWith("s-2", "2026-08-03T10:00:00.000Z")));
    mock.state.set("s-3", rowFor(snapshotWith("s-3", "2026-08-03T10:00:00.000Z")));
    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    await repo.deleteByIds(["s-1", "s-2"]);
    const deleteCall = mock.calls.find((c) => c.method === "DELETE");
    expect(deleteCall?.url).toBe("/api/cloud/sessions");
    expect(deleteCall?.body).toEqual({ ids: ["s-1", "s-2"] });
    expect(mock.state.has("s-1")).toBe(false);
    expect(mock.state.has("s-2")).toBe(false);
    expect(mock.state.has("s-3")).toBe(true);
    await repo.deleteByIds([]);
    expect(mock.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("throws on HTTP errors instead of swallowing them (caller maps to offline)", async () => {
    mock.failNextStatus = 500;
    const repo = new CloudSessionRepository("user-a", mock.fetcher);
    await expect(
      repo.upsert(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"))
    ).rejects.toThrow();
  });
});

describe("CloudSessionSync conflict policy", () => {
  let mock: MockFetcher;

  beforeEach(() => {
    mock = createMockFetcher();
  });

  function makeSync(): CloudSessionSync {
    return new CloudSessionSync(new CloudSessionRepository("user-a", mock.fetcher));
  }

  it("saves when no cloud copy exists", async () => {
    const outcome = await makeSync().save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("saved");
  });

  it("saves when the local snapshot is newer", async () => {
    mock.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T09:00:00.000Z"))
    );
    const outcome = await makeSync().save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("saved");
  });

  it("keeps a newer cloud copy (never overwrites with older local evidence)", async () => {
    mock.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T11:00:00.000Z"))
    );
    const outcome = await makeSync().save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("cloud_newer_kept");
    expect(mock.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("keeps a cloud copy with a newer schema version", async () => {
    const cloud = rowFor(snapshotWith("s-1", "2026-08-03T09:00:00.000Z"));
    cloud.schema_version = 99;
    mock.state.set("s-1", cloud);
    const outcome = await makeSync().save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("cloud_schema_newer_kept");
  });

  it("preserves a completed cloud session: save() keeps status complete and completedAt", async () => {
    // Reviewing an old completed session must not flip the dashboard row back
    // to in progress: the local snapshot is active and newer, but the cloud
    // copy is complete.
    mock.state.set("s-1", {
      ...rowFor(snapshotWith("s-1", "2026-08-03T09:00:00.000Z")),
      status: "complete",
      completed_at: "2026-08-03T11:00:00.000Z",
    });
    const outcome = await makeSync().save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("saved");
    const putCall = mock.calls.find((c) => c.method === "PUT");
    expect(putCall?.body).toMatchObject({
      id: "s-1",
      status: "complete",
      completed_at: "2026-08-03T11:00:00.000Z",
    });
  });

  it("on an equal-timestamp conflict the local snapshot wins (documented tie policy)", async () => {
    // Policy: "the newer valid snapshot wins" — a tie (cloudTime === localTime)
    // is not strictly newer, so the local save proceeds instead of keeping the
    // cloud copy.
    mock.state.set(
      "s-1",
      rowFor(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"))
    );
    const outcome = await makeSync().save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("saved");
    expect(mock.calls.some((c) => c.method === "PUT")).toBe(true);
  });

  it("reports offline instead of throwing when the cloud is unreachable", async () => {
    mock.failNext = true;
    const outcome = await makeSync().save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("offline");
  });

  it("reports offline when the server answers with an HTTP error", async () => {
    mock.failNextStatus = 500;
    const outcome = await makeSync().save(
      snapshotWith("s-1", "2026-08-03T10:00:00.000Z")
    );
    expect(outcome).toBe("offline");
  });

  it("does not touch other sessions with different ids", async () => {
    mock.state.set(
      "other",
      rowFor(snapshotWith("other", "2026-08-03T11:00:00.000Z"))
    );
    await makeSync().save(snapshotWith("s-1", "2026-08-03T10:00:00.000Z"));
    expect(mock.state.has("other")).toBe(true);
    expect(mock.state.get("other")?.id).toBe("other");
  });
});
