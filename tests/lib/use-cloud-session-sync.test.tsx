import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCloudSessionSync } from "@/sync/use-cloud-session-sync";
import {
  createLocalSession,
  type LocalSession,
} from "@/storage/session-storage";
import type { TrialRecord } from "@/domain/experiments";
import type { LearningSessionRow } from "@/lib/mongo/types";
import type { FetchLike } from "@/sync/cloud-session-repository";

/**
 * Hook tests for the "core contract" (plan D1): meaningful-event saves only,
 * never per-frame — enforced by the evidence/workflow fingerprint + 800 ms
 * debounce. The Firebase session hook is mocked and global `fetch` is stubbed
 * with a controllable in-memory fetcher, so the real
 * CloudSessionRepository/CloudSessionSync logic runs against it.
 */

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/firebase/use-session", () => ({
  useSession: mocks.useSession,
}));

const USER = {
  id: "user-hook-a",
  email: "ada@example.com",
  displayName: null,
  avatarUrl: null,
  provider: null,
};

const TITLE = "Nuclear Chain Reaction";
const SESSION_ID_KEY = "unseenlab.session-id.v1";
const FIXED_SESSION_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface FetchCall {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

/**
 * Minimal stand-in for the /api/cloud/sessions server: GET by id consults an
 * in-memory row map, PUT upserts into it. Failures and a deferred read are
 * scriptable per test via `mock.flags`.
 */
function createFetchMock() {
  const calls: FetchCall[] = [];
  const state = new Map<string, LearningSessionRow>();
  const flags = {
    readGate: null as (() => Promise<Response>) | null,
    failReadNext: false,
    failPut: false,
  };

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

    if (flags.readGate && method === "GET") return flags.readGate();
    if (flags.failReadNext && method === "GET") {
      flags.failReadNext = false;
      throw new Error("network down");
    }
    if (flags.failPut && method === "PUT") {
      flags.failPut = false;
      throw new Error("write failed");
    }

    if (method === "GET" && url.startsWith("/api/cloud/sessions")) {
      const id = new URL(url, "http://unseenlab.test").searchParams.get("id");
      return jsonResponse({
        data: { session: id ? (state.get(id) ?? null) : null },
      });
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
    return jsonResponse({ error: "not_found" }, 404);
  };

  return { fetcher, calls, state, flags };
}

type FetchMock = ReturnType<typeof createFetchMock>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function trialFixture(completedAt = "2026-08-03T10:00:00.000Z"): TrialRecord {
  return {
    id: "t-1",
    parameters: {
      absorberPosition: 0.5,
      startingNeutrons: 200,
      materialDensity: 0.5,
      absorptionProbability: 0.5,
      durationSteps: 300,
      seed: 42,
    },
    snapshots: [
      {
        step: 1,
        freeNeutrons: 100,
        absorbedNeutrons: 50,
        escapedNeutrons: 50,
        reactionEvents: 10,
        cumulativeEnergyUnits: 1000,
      },
    ],
    changedVariables: ["absorberPosition"],
    startedAt: "2026-08-03T09:00:00.000Z",
    completedAt,
  };
}

/** A local session with exactly one completed trial (a meaningful event). */
function sessionWithTrial(): LocalSession {
  const base = createLocalSession();
  return {
    ...base,
    evidence: { ...base.evidence, trials: [trialFixture()] },
  };
}

function renderSyncHook(session: LocalSession) {
  return renderHook(
    ({ session: s }: { session: LocalSession }) =>
      useCloudSessionSync(s, TITLE),
    { initialProps: { session } }
  );
}

describe("useCloudSessionSync", () => {
  let mock: FetchMock;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mock = createFetchMock();
    vi.stubGlobal("fetch", mock.fetcher);
    mocks.useSession.mockReset().mockReturnValue({ user: USER, loading: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("never saves for empty evidence, and flush() is a no-op then", async () => {
    const { result } = renderSyncHook(createLocalSession());
    expect(result.current.status).toBe("idle");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mock.calls.filter((c) => c.method === "GET")).toHaveLength(0);
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.flush();
    });
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    expect(result.current.status).toBe("idle");
  });

  it("a trial change schedules exactly ONE debounced save after 800ms", async () => {
    const gate = deferred<Response>();
    mock.flags.readGate = () => gate.promise;

    const { result } = renderSyncHook(sessionWithTrial());
    expect(result.current.status).toBe("idle");

    // Nothing before the debounce window.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(mock.calls.filter((c) => c.method === "GET")).toHaveLength(0);
    expect(result.current.status).toBe("idle");

    // At 800ms the single save fires and stays in-flight while the read is
    // pending: the status must be "saving".
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.status).toBe("saving");
    expect(mock.calls.filter((c) => c.method === "GET")).toHaveLength(1);

    await act(async () => {
      gate.resolve(jsonResponse({ data: { session: null } }));
    });
    expect(result.current.status).toBe("saved");
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(1);

    // The fingerprint is settled: later time passing never triggers more saves.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(result.current.status).toBe("saved");

    const putCall = mock.calls.find((c) => c.method === "PUT");
    expect(putCall?.url).toBe("/api/cloud/sessions");
    expect(putCall?.body).toMatchObject({
      id: expect.any(String),
      lab_slug: "nuclear-chain-reaction",
      status: "active",
      schema_version: 1,
      title: TITLE,
    });
    // Security invariant: ownership comes from the session cookie, so the
    // wire payload never carries a user id.
    expect(putCall?.body?.user_id).toBeUndefined();
    expect(
      (putCall?.body?.evidence as { trials: TrialRecord[] }).trials
    ).toHaveLength(1);
  });

  it("a preference-only session update does not cancel the pending debounced save", async () => {
    const session = sessionWithTrial();
    const { result, rerender } = renderSyncHook(session);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mock.calls.filter((c) => c.method === "GET")).toHaveLength(0);

    // New session object, same evidence/workflow references, preferences only.
    const prefsOnlyUpdate: LocalSession = {
      ...session,
      preferences: { ...session.preferences, animationSpeed: 2 },
    };
    rerender({ session: prefsOnlyUpdate });
    expect(result.current.status).toBe("idle");

    // The original 800ms timer survives the rerender and fires exactly once.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {});
    expect(result.current.status).toBe("saved");
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(
      (
        mock.calls.find((c) => c.method === "PUT")
          ?.body?.evidence as { trials: TrialRecord[] }
      ).trials
    ).toHaveLength(1);
  });

  it("flush() runs the pending debounced save immediately and cancels the timer", async () => {
    const { result } = renderSyncHook(sessionWithTrial());

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(mock.calls.filter((c) => c.method === "GET")).toHaveLength(0);

    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.status).toBe("saved");
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(1);

    // The scheduled timer was cleared: no second save when it would have fired.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("a failed cloud read reports status offline", async () => {
    mock.flags.failReadNext = true;
    const { result } = renderSyncHook(sessionWithTrial());

    act(() => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => {});
    expect(result.current.status).toBe("offline");
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("a failed upsert reports status offline", async () => {
    mock.flags.failPut = true;
    const { result } = renderSyncHook(sessionWithTrial());

    act(() => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => {});
    expect(result.current.status).toBe("offline");
  });

  it("maps a kept cloud copy (newer evidence elsewhere) to status cloud_newer", async () => {
    localStorage.setItem(SESSION_ID_KEY, FIXED_SESSION_ID);
    mock.state.set(FIXED_SESSION_ID, {
      id: FIXED_SESSION_ID,
      user_id: USER.id,
      lab_slug: "nuclear-chain-reaction",
      status: "active",
      title: TITLE,
      schema_version: 1,
      // Newer than the local trial (10:00): the cloud copy wins.
      evidence: { trials: [{ completedAt: "2026-08-03T12:00:00.000Z" }] },
      workflow: { pendingPrediction: null },
      created_at: "2026-08-03T00:00:00.000Z",
      updated_at: "2026-08-03T12:00:00.000Z",
      completed_at: null,
    });

    const { result } = renderSyncHook(sessionWithTrial());
    act(() => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => {});
    expect(result.current.status).toBe("cloud_newer");
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("a pending save survives unmount (tab closing mid-debounce still syncs)", async () => {
    const { unmount } = renderSyncHook(sessionWithTrial());

    act(() => {
      unmount();
    });
    // The effect deliberately has no cleanup for the save timer.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => {});
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("without a signed-in user the hook stays idle and never fetches", async () => {
    mocks.useSession.mockReturnValue({ user: null, loading: false });
    const { result } = renderSyncHook(sessionWithTrial());

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.status).toBe("idle");
    expect(mock.calls).toHaveLength(0);

    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.status).toBe("idle");
    expect(mock.calls).toHaveLength(0);
  });
});
