import {
  learnerPreferencesSchema,
  type LearnerPreferences,
  createDefaultPreferences,
} from "@/domain/learner";
import {
  createEmptySessionEvidence,
  sessionEvidenceSchema,
  type SessionEvidence,
} from "@/domain/evidence";

/**
 * All persistence is anonymous and local. Nothing is transmitted anywhere.
 * Every read is validated with Zod; corrupt data fails safely to defaults.
 */

const PREFERENCES_KEY = "unseenlab.preferences.v1";
const EVIDENCE_KEY = "unseenlab.evidence.v1";

export interface LocalSession {
  preferences: LearnerPreferences;
  evidence: SessionEvidence;
}

export function createLocalSession(): LocalSession {
  return {
    preferences: createDefaultPreferences(),
    evidence: createEmptySessionEvidence(),
  };
}

function storageAvailable(): boolean {
  try {
    const testKey = "unseenlab.storage-test";
    const storage = globalThis.localStorage;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function loadLocalSession(): LocalSession {
  const session = createLocalSession();
  if (!storageAvailable()) return session;

  try {
    const rawPrefs = globalThis.localStorage.getItem(PREFERENCES_KEY);
    if (rawPrefs !== null) {
      const parsed = learnerPreferencesSchema.safeParse(JSON.parse(rawPrefs));
      if (parsed.success) session.preferences = parsed.data;
    }
  } catch {
    // Corrupt data: keep defaults, then repair storage below.
  }

  try {
    const rawEvidence = globalThis.localStorage.getItem(EVIDENCE_KEY);
    if (rawEvidence !== null) {
      const parsed = sessionEvidenceSchema.safeParse(JSON.parse(rawEvidence));
      if (parsed.success) session.evidence = parsed.data;
    }
  } catch {
    // Corrupt data: keep empty evidence, then repair storage below.
  }

  return session;
}

export function saveLocalSession(session: LocalSession): boolean {
  if (!storageAvailable()) return false;
  try {
    globalThis.localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify(session.preferences),
    );
    globalThis.localStorage.setItem(
      EVIDENCE_KEY,
      JSON.stringify(session.evidence),
    );
    return true;
  } catch {
    return false;
  }
}

export function exportSessionJson(session: LocalSession): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      preferences: session.preferences,
      evidence: session.evidence,
      label:
        "Initial design case study evidence. Not a statistically validated learning study.",
    },
    null,
    2,
  );
}

export function clearLocalSession(): void {
  if (!storageAvailable()) return;
  try {
    globalThis.localStorage.removeItem(PREFERENCES_KEY);
    globalThis.localStorage.removeItem(EVIDENCE_KEY);
  } catch {
    // Ignore: storage unavailable means nothing to clear.
  }
}

export function downloadSessionJson(session: LocalSession): void {
  const blob = new Blob([exportSessionJson(session)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "unseenlab-session.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
