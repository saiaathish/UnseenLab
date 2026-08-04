import { z } from "zod";
import {
  learnerPreferencesSchema,
  type LearnerPreferences,
  createDefaultPreferences,
} from "@/domain/learner";
import {
  createEmptySessionEvidence,
  sessionEvidenceSchema,
  PREDICTION_ANSWER_CHOICES,
  type SessionEvidence,
} from "@/domain/evidence";

/**
 * All persistence is anonymous and local. Nothing is transmitted anywhere.
 * Every read is validated with Zod; corrupt data fails safely to defaults.
 */

const PREFERENCES_KEY = "unseenlab.preferences.v1";
const EVIDENCE_KEY = "unseenlab.evidence.v1";
const WORKFLOW_KEY = "unseenlab.workflow.v1";

/**
 * A prediction submitted but not yet attached to a run trial. Persisted so a
 * reload mid-experiment restores the learner to the same guided step instead
 * of silently losing their typed prediction.
 */
export interface PendingPrediction {
  trialId: string;
  answer: string;
  structuredAnswer: (typeof PREDICTION_ANSWER_CHOICES)[number] | null;
  confidence: number;
}

const pendingPredictionSchema = z.object({
  trialId: z.string().min(1),
  answer: z.string().min(1),
  structuredAnswer: z.enum(PREDICTION_ANSWER_CHOICES).nullable(),
  confidence: z.number().int().min(1).max(5),
});

export interface LocalWorkflow {
  pendingPrediction: PendingPrediction | null;
}

const workflowSchema = z.object({
  pendingPrediction: pendingPredictionSchema.nullable().default(null),
});

export interface LocalSession {
  preferences: LearnerPreferences;
  evidence: SessionEvidence;
  workflow: LocalWorkflow;
}

export function createLocalSession(): LocalSession {
  return {
    preferences: createDefaultPreferences(),
    evidence: createEmptySessionEvidence(),
    workflow: { pendingPrediction: null },
  };
}

/**
 * Splits legacy counterfactual trials (ids starting with "cf-", recorded into
 * the trials array by an earlier build) out of the real trial list. They were
 * comparisons, not learner-run trials, and counting them as trials corrupted
 * multi-trial rules and replay. Real trials are never renumbered.
 */
function migrateEvidence(evidence: SessionEvidence): SessionEvidence {
  if (!evidence.trials.some((trial) => trial.id.startsWith("cf-"))) {
    return evidence;
  }
  return {
    ...evidence,
    trials: evidence.trials.filter((trial) => !trial.id.startsWith("cf-")),
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
      if (parsed.success) session.evidence = migrateEvidence(parsed.data);
    }
  } catch {
    // Corrupt data: keep empty evidence, then repair storage below.
  }

  try {
    const rawWorkflow = globalThis.localStorage.getItem(WORKFLOW_KEY);
    if (rawWorkflow !== null) {
      const parsed = workflowSchema.safeParse(JSON.parse(rawWorkflow));
      if (parsed.success) session.workflow = parsed.data;
    }
  } catch {
    // Corrupt data: keep a fresh workflow, then repair storage below.
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
    globalThis.localStorage.setItem(
      WORKFLOW_KEY,
      JSON.stringify(session.workflow),
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
    globalThis.localStorage.removeItem(WORKFLOW_KEY);
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
