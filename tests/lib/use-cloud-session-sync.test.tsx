import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { useCloudSessionSync } from "@/sync/use-cloud-session-sync";
import {
  createLocalSession,
  type LocalSession,
} from "@/storage/session-storage";
import type { TrialRecord } from "@/domain/experiments";

/**
 * Hook tests for the "core contract" (plan D1): meaningful-event saves only,
 * never per-frame — enforced by the evidence/workflow fingerprint + 800 ms
 * debounce. The browser client is mocked with a controllable in-memory
 * client, so the real CloudSessionRepository/CloudSessionSync logic runs.
 */

const mocks = vi.hoisted(() => ({
  getBrowserClient: vi.fn(),
}));

vi.mock("@/lib/supabase/browser-client", () => ({
  getBrowserClient: mocks.getBrowserClient,
}));

const USER = {
  id: "user-hook-a",
  email: "ada@example.com",
} as unknown as User;

const TITLE = "Nuclear Chain Reaction";
const SESSION_ID_KEY = "unseenlab.session-id.v1";
const FIXED_SESSION_ID = "11111111-1111-4111-8111-111111111111";

interface FakeCall {
  op: string;
  payload?: unknown;
  options?: unknown;
  args?: unknown[];
}

function createFakeClient() {
  const calls: FakeCall[] = [];
  const state = new Map<string, Record<string, unknown>>();
  const handlers = {
    getById: async (id: string) => ({
      data: state.get(id) ?? null,
      error: null,
    }),
    upsert: async (payload: Record<string, unknown>) => {
      state.set(payload.id as string, { ...payload });
      return { error: null };
    },
  };
  return {
    calls,
    state,
    handlers,
    from: (table: string) => {
      calls.push({ op: "from", args: [table] });
      return {
        select: () => ({
          eq: (column: string, value: unknown) => ({
            maybeSingle: async () => {
              if (column === "id") {
                calls.push({ op: "getById" });
                return handlers.getById(value as string);
              }
              calls.push({ op: `eq:${column}`, args: [value] });
              return { data: null, error: null };
            },
          }),
        }),
        upsert: async (payload: Record<string, unknown>, options: unknown) => {
          calls.push({ op: "upsert", payload, options });
          return handlers.upsert(payload);
        },
      };
    },
  };
}

type FakeClient = ReturnType<typeof createFakeClient>;

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
      useCloudSessionSync(s, USER, TITLE),
    { initialProps: { session } }
  );
}

describe("useCloudSessionSync", () => {
  let client: FakeClient;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    client = createFakeClient();
    mocks.getBrowserClient.mockReset().mockReturnValue(client as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never saves for empty evidence, and flush() is a no-op then", async () => {
    const { result } = renderSyncHook(createLocalSession());
    expect(result.current.status).toBe("idle");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(client.calls.filter((c) => c.op === "getById")).toHaveLength(0);
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(0);
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.flush();
    });
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(0);
    expect(result.current.status).toBe("idle");
  });

  it("a trial change schedules exactly ONE debounced save after 800ms", async () => {
    const gate = deferred<{ data: null; error: null }>();
    client.handlers.getById = () => gate.promise;

    const { result } = renderSyncHook(sessionWithTrial());
    expect(result.current.status).toBe("idle");

    // Nothing before the debounce window.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(client.calls.filter((c) => c.op === "getById")).toHaveLength(0);
    expect(result.current.status).toBe("idle");

    // At 800ms the single save fires and stays in-flight while the read is
    // pending: the status must be "saving".
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.status).toBe("saving");
    expect(client.calls.filter((c) => c.op === "getById")).toHaveLength(1);

    await act(async () => {
      gate.resolve({ data: null, error: null });
    });
    expect(result.current.status).toBe("saved");
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(1);

    // The fingerprint is settled: later time passing never triggers more saves.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(1);
    expect(result.current.status).toBe("saved");

    const upsertCall = client.calls.find((c) => c.op === "upsert");
    expect(upsertCall?.options).toEqual({ onConflict: "id" });
    expect(upsertCall?.payload).toMatchObject({
      user_id: USER.id,
      title: TITLE,
      lab_slug: "nuclear-chain-reaction",
    });
    expect(
      (
        upsertCall?.payload as {
          evidence: { trials: TrialRecord[] };
        }
      ).evidence.trials
    ).toHaveLength(1);
  });

  it("a preference-only session update does not cancel the pending debounced save", async () => {
    const session = sessionWithTrial();
    const { result, rerender } = renderSyncHook(session);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(client.calls.filter((c) => c.op === "getById")).toHaveLength(0);

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
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(1);
    expect(
      (
        client.calls.find((c) => c.op === "upsert")
          ?.payload as { evidence: { trials: TrialRecord[] } }
      ).evidence.trials
    ).toHaveLength(1);
  });

  it("flush() runs the pending debounced save immediately and cancels the timer", async () => {
    const { result } = renderSyncHook(sessionWithTrial());

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(client.calls.filter((c) => c.op === "getById")).toHaveLength(0);

    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.status).toBe("saved");
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(1);

    // The scheduled timer was cleared: no second save when it would have fired.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(1);
  });

  it("a failed cloud read reports status offline", async () => {
    client.handlers.getById = async () => {
      throw new Error("network down");
    };
    const { result } = renderSyncHook(sessionWithTrial());

    act(() => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => {});
    expect(result.current.status).toBe("offline");
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(0);
  });

  it("a failed upsert reports status offline", async () => {
    client.handlers.upsert = async () => {
      throw new Error("write failed");
    };
    const { result } = renderSyncHook(sessionWithTrial());

    act(() => {
      vi.advanceTimersByTime(800);
    });
    await act(async () => {});
    expect(result.current.status).toBe("offline");
  });

  it("maps a kept cloud copy (newer evidence elsewhere) to status cloud_newer", async () => {
    localStorage.setItem(SESSION_ID_KEY, FIXED_SESSION_ID);
    client.state.set(FIXED_SESSION_ID, {
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
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(0);
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
    expect(client.calls.filter((c) => c.op === "upsert")).toHaveLength(1);
  });
});
