import {
  snapshotFromLocal,
  type CloudSessionRepository,
} from "@/sync/cloud-session-repository";
import type { LocalSession } from "@/storage/session-storage";

/**
 * Guest-session import state machine.
 *
 * Rules (program contract):
 * - never upload guest evidence automatically;
 * - never delete local evidence before cloud confirmation;
 * - the dialog is dismissed for the current visit and does not reappear;
 * - imported session retains its original evidence IDs;
 * - importing twice never creates duplicates (idempotent by session id).
 */

const IMPORTED_FLAG_KEY = "unseenlab.imported-session-id.v1";
const DISMISSED_KEY = "unseenlab.import-dismissed.v1";

export type ImportOutcome =
  | "imported"
  | "already_imported"
  | "nothing_to_import"
  | "offline";

export function hasGuestEvidence(local: LocalSession): boolean {
  return local.evidence.trials.length > 0;
}

function readImportedIds(): string[] {
  try {
    const raw = globalThis.localStorage.getItem(IMPORTED_FLAG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeImportedIds(ids: string[]): void {
  try {
    globalThis.localStorage.setItem(IMPORTED_FLAG_KEY, JSON.stringify(ids));
  } catch {
    // Ignore: import is best-effort once cloud confirmation exists.
  }
}

export function isSessionImported(sessionId: string): boolean {
  return readImportedIds().includes(sessionId);
}

export function isImportDismissedForVisit(sessionId: string): boolean {
  try {
    const dismissed: unknown = globalThis.sessionStorage.getItem(
      `${DISMISSED_KEY}.${sessionId}`
    );
    return dismissed === "1";
  } catch {
    return false;
  }
}

export function dismissImportForVisit(sessionId: string): void {
  try {
    globalThis.sessionStorage.setItem(`${DISMISSED_KEY}.${sessionId}`, "1");
  } catch {
    // Ignore: sessionStorage may be unavailable; the dialog may reappear.
  }
}

/**
 * Performs the consenting import. Returns the outcome; never throws for
 * network failures.
 */
export async function importGuestSession(
  repo: CloudSessionRepository,
  local: LocalSession,
  sessionId: string,
  title: string
): Promise<ImportOutcome> {
  if (!hasGuestEvidence(local)) return "nothing_to_import";
  if (isSessionImported(sessionId)) return "already_imported";

  const snapshot = snapshotFromLocal(
    sessionId,
    title,
    local.evidence as unknown as Record<string, unknown>,
    local.workflow as unknown as Record<string, unknown>
  );

  try {
    await repo.upsert(snapshot);
    writeImportedIds([...readImportedIds(), sessionId]);
    return "imported";
  } catch {
    return "offline";
  }
}
