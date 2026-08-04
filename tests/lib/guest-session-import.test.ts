import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dismissImportForVisit,
  hasGuestEvidence,
  importGuestSession,
  isImportDismissedForVisit,
  isSessionImported,
} from "@/sync/guest-session-import";
import { createLocalSession } from "@/storage/session-storage";
import { snapshotFromLocal, type CloudSessionRepository } from "@/sync/cloud-session-repository";
import type { TrialRecord } from "@/domain/experiments";

function localWithOneTrial() {
  const session = createLocalSession();
  session.evidence = {
    ...session.evidence,
    trials: [
      {
        id: "trial-1",
        parameters: {
          absorberPosition: 0.9,
          startingNeutrons: 3,
          materialDensity: 0.9,
          absorptionProbability: 0.25,
          durationSteps: 60,
          seed: 42,
        },
        snapshots: [{ step: 1, freeNeutrons: 3, absorbedNeutrons: 0, escapedNeutrons: 0, reactionEvents: 0, cumulativeEnergyUnits: 0 }],
        changedVariables: [],
        startedAt: "2026-08-03T10:00:00.000Z",
        completedAt: "2026-08-03T10:01:00.000Z",
      } satisfies TrialRecord,
    ],
  };
  return session;
}

function createRepoMock() {
  const upserts: unknown[] = [];
  const repo = {
    upserts,
    upsert: async (snapshot: unknown) => {
      upserts.push(snapshot);
    },
  } as CloudSessionRepository & { upserts: unknown[] };
  return repo;
}

describe("guest session import", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("returns nothing_to_import without local evidence", async () => {
    const repo = createRepoMock();
    const outcome = await importGuestSession(repo, createLocalSession(), "s-1", "Lab");
    expect(outcome).toBe("nothing_to_import");
    expect(repo.upserts).toHaveLength(0);
  });

  it("imports once and keeps original evidence ids", async () => {
    const repo = createRepoMock();
    const local = localWithOneTrial();
    const outcome = await importGuestSession(repo, local, "s-1", "Nuclear Chain Reaction");
    expect(outcome).toBe("imported");
    expect(repo.upserts).toHaveLength(1);
    const snapshot = repo.upserts[0] as ReturnType<typeof snapshotFromLocal>;
    expect(snapshot.id).toBe("s-1");
    expect(snapshot.title).toBe("Nuclear Chain Reaction");
    const evidence = snapshot.evidence as { trials: Array<{ id: string }> };
    expect(evidence.trials[0]?.id).toBe("trial-1"); // ids preserved verbatim
  });

  it("never imports the same session twice (idempotent by session id)", async () => {
    const repo = createRepoMock();
    const local = localWithOneTrial();
    await importGuestSession(repo, local, "s-1", "Lab");
    const second = await importGuestSession(repo, local, "s-1", "Lab");
    expect(second).toBe("already_imported");
    expect(repo.upserts).toHaveLength(1);
  });

  it("importing a different session id creates a separate row", async () => {
    const repo = createRepoMock();
    const local = localWithOneTrial();
    await importGuestSession(repo, local, "s-1", "Lab");
    await importGuestSession(repo, local, "s-2", "Lab");
    expect(repo.upserts).toHaveLength(2);
  });

  it("remembers dismissal for the current visit only", async () => {
    const session = localWithOneTrial();
    expect(isImportDismissedForVisit("s-1")).toBe(false);
    dismissImportForVisit("s-1");
    expect(isImportDismissedForVisit("s-1")).toBe(true);
    expect(isImportDismissedForVisit("s-2")).toBe(false);
    expect(hasGuestEvidence(session)).toBe(true);
    // dismissal never marks the session as imported
    expect(isSessionImported("s-1")).toBe(false);
  });

  it("reports offline when the cloud save fails", async () => {
    const repo = {
      upsert: async () => {
        throw new Error("network down");
      },
    } as unknown as CloudSessionRepository;
    const outcome = await importGuestSession(repo, localWithOneTrial(), "s-1", "Lab");
    expect(outcome).toBe("offline");
    expect(isSessionImported("s-1")).toBe(false); // retryable, not marked
  });
});
