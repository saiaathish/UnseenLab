import {
  CloudConflictError,
  CloudSessionRepository,
  type SessionSnapshot,
} from "@/sync/cloud-session-repository";

/**
 * Deterministic local-first sync with the mandated conflict policy:
 * 1. Every session has a stable UUID.
 * 2. Same session id: schema version first, then `updated_at`; the newer
 *    valid snapshot wins; the local unsynced copy is never deleted (it IS
 *    the localStorage session).
 * 3. Different session ids: never touch each other's rows.
 * 4. Never overwrite a newer cloud session with older local evidence.
 * 5. Never silently discard local unsynced evidence.
 */

export type SyncOutcome =
  | "saved"
  | "cloud_newer_kept"
  | "cloud_schema_newer_kept"
  | "offline";

export interface SyncStatusState {
  /** "idle" until the first save is attempted, then one of the outcomes. */
  outcome: SyncOutcome | "idle";
  /** When the last outcome was observed. */
  at: number | null;
}

export function newestEvidenceTime(evidence: Record<string, unknown>): number {
  const trials = Array.isArray(evidence.trials)
    ? (evidence.trials as Array<{ completedAt?: string }>)
    : [];
  const predictions = Array.isArray(evidence.predictions)
    ? (evidence.predictions as Array<{ createdAt?: string }>)
    : [];
  const proposals = Array.isArray(evidence.adaptationProposals)
    ? (evidence.adaptationProposals as Array<{ decidedAt?: string | null; createdAt?: string }>)
    : [];
  let latest = 0;
  for (const t of trials) {
    if (t.completedAt) latest = Math.max(latest, Date.parse(t.completedAt));
  }
  for (const p of predictions) {
    if (p.createdAt) latest = Math.max(latest, Date.parse(p.createdAt));
  }
  for (const p of proposals) {
    if (p.decidedAt) latest = Math.max(latest, Date.parse(p.decidedAt));
    if (p.createdAt) latest = Math.max(latest, Date.parse(p.createdAt));
  }
  return latest;
}

export class CloudSessionSync {
  constructor(private readonly repo: CloudSessionRepository) {}

  /**
   * Saves a snapshot only when it is strictly newer than the cloud copy.
   * A cloud copy marked complete stays complete (resuming a completed
   * session for review must not flip the dashboard row back to in-progress).
   * Returns the outcome; never throws for network/offline failures (the
   * caller surfaces a calm "saved on this device" status).
   *
   * `opts.mutationId` (a fresh id per attempt) makes the write idempotent
   * server-side. The revision of the cloud copy fetched here is threaded into
   * the write as `expected_revision`: if another device changed the row
   * between our read and write, the server answers 409 and we report
   * `cloud_newer_kept` — the same outcome as the evidence-time policy above,
   * so the existing conflict semantics are unchanged.
   */
  async save(
    snapshot: SessionSnapshot,
    opts?: { mutationId?: string }
  ): Promise<SyncOutcome> {
    let cloud: SessionSnapshot | null;
    try {
      cloud = await this.repo.getById(snapshot.id);
    } catch {
      return "offline";
    }

    const localTime = newestEvidenceTime(snapshot.evidence);

    if (cloud) {
      if (cloud.schemaVersion > snapshot.schemaVersion) {
        return "cloud_schema_newer_kept";
      }
      const cloudTime = newestEvidenceTime(cloud.evidence);
      if (cloudTime > localTime) {
        return "cloud_newer_kept";
      }
    }

    // Preserve a completed status: reviewing an old session is not a new
    // attempt, so the dashboard row must not flip back to "In progress".
    const effective: SessionSnapshot =
      cloud?.status === "complete"
        ? { ...snapshot, status: "complete", completedAt: cloud.completedAt }
        : snapshot;

    try {
      await this.repo.upsert(effective, {
        mutationId: opts?.mutationId,
        expectedRevision: cloud ? cloud.revision : undefined,
      });
      return "saved";
    } catch (error) {
      if (error instanceof CloudConflictError) {
        // Defense-in-depth: the server rejected the write because the cloud
        // row moved on. Same product semantics as the evidence-time check
        // above: the cloud copy is newer, the local unsynced copy is kept.
        return "cloud_newer_kept";
      }
      return "offline";
    }
  }
}
