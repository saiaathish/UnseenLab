"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/firebase/use-session";
import {
  CloudSessionRepository,
  snapshotFromLocal,
} from "@/sync/cloud-session-repository";
import { CloudSessionSync, type SyncOutcome } from "@/sync/cloud-session-sync";
import { getLocalSessionId } from "@/storage/session-storage";
import type { LocalSession } from "@/storage/session-storage";

export type CloudSyncStatus =
  | "idle"
  | "saving"
  | "saved"
  | "cloud_newer"
  | "offline";

const SAVE_DEBOUNCE_MS = 800;

/**
 * Saves the local session to the cloud after meaningful events only.
 *
 * - The signed-in user comes from Firebase auth state (`useSession`); the
 *   repository is built per save, and only when a user is present.
 * - A fingerprint of evidence + workflow gates the save, so animation frames
 *   and preference-only changes never trigger a request.
 * - The effect depends on the evidence/workflow REFERENCES (not the whole
 *   session), so preference-only session updates cannot cancel a pending
 *   debounced save.
 * - `flush()` runs the pending save immediately; the lab uses it before
 *   marking a session complete so "Start over" cannot race a save.
 */
export function useCloudSessionSync(
  session: LocalSession,
  title: string
): { status: CloudSyncStatus; flush: () => Promise<void> } {
  const { user } = useSession();
  const [status, setStatus] = useState<CloudSyncStatus>("idle");
  const lastFingerprint = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const pendingRun = useRef<(() => Promise<void>) | null>(null);
  const evidenceRef = session.evidence;
  const workflowRef = session.workflow;

  const runSave = useCallback(() => {
    if (!user) return Promise.resolve();
    setStatus("saving");
    const repo = new CloudSessionRepository(user.id);
    const sync = new CloudSessionSync(repo);
    const snapshot = snapshotFromLocal(
      getLocalSessionId(),
      title,
      evidenceRef as unknown as Record<string, unknown>,
      workflowRef as unknown as Record<string, unknown>
    );
    // One idempotency key per save attempt: replaying the same attempt (a
    // retry after a timeout, a second tab) can never double-apply a write.
    const mutationId = crypto.randomUUID();
    return sync.save(snapshot, { mutationId }).then((outcome: SyncOutcome) => {
      setStatus(
        outcome === "saved"
          ? "saved"
          : outcome === "offline"
            ? "offline"
            : "cloud_newer"
      );
    });
  }, [user, title, evidenceRef, workflowRef]);

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const run = pendingRun.current;
    if (run) {
      pendingRun.current = null;
      await run();
    }
  }, []);

  useEffect(() => {
    if (!user) {
      const timerId = window.setTimeout(() => setStatus("idle"), 0);
      return () => window.clearTimeout(timerId);
    }

    // Never create an empty cloud session: nothing has happened yet.
    if (
      evidenceRef.trials.length === 0 &&
      evidenceRef.predictions.length === 0
    ) {
      return;
    }

    const fingerprint = JSON.stringify([evidenceRef, workflowRef]);
    if (fingerprint === lastFingerprint.current) return;
    lastFingerprint.current = fingerprint;

    if (timer.current !== null) window.clearTimeout(timer.current);
    const run = runSave;
    pendingRun.current = run;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      pendingRun.current = null;
      void run();
    }, SAVE_DEBOUNCE_MS);

    // No cleanup here: a pending save must survive preference-only updates
    // and even unmount (a tab closing mid-debounce still syncs the trial).
  }, [user, title, evidenceRef, workflowRef, runSave]);

  return { status, flush };
}
