import { useMemo, useState } from "react";
import { z } from "zod";
import { ADAPTATION_PROPOSAL_TYPES } from "@/domain/evidence";
import { REPRESENTATION_MODES } from "@/domain/learner";
import { EXPLANATION_STYLES } from "@/personalization/onboarding-schema";

/**
 * Facilitator-only impact evidence recorder (research mode).
 *
 * Everything is anonymous and local — nothing is transmitted anywhere until
 * the facilitator explicitly exports a JSON file from the research page. The
 * recorder NEVER collects identity (no email, no account token, no cloud
 * secret) and NEVER collects or infers a diagnosis: preferences and concept
 * status are learner-controlled, and the export schema simply has no fields
 * for identity or diagnosis.
 *
 * Gating rules:
 * - Consent must be "agreed" (localStorage `unseenlab.research-consent.v1`).
 * - In the lab, capture additionally requires the `?research=1` query param so
 *   ordinary learners get zero overhead and zero recording.
 * - Every read and write is Zod-validated; corrupt storage fails safely to
 *   null / empty rather than crashing or fabricating data.
 */

export const RESEARCH_CONSENT_KEY = "unseenlab.research-consent.v1";
export const RESEARCH_SESSION_KEY = "unseenlab.research-session.v1";
export const RESEARCH_NOTES_KEY = "unseenlab.research-notes.v1";

export const RESEARCH_LABEL =
  "Initial design case study evidence. Not a statistically validated learning study.";

/** One fixed concept question, asked identically before and after the lab. */
export const RESEARCH_CONCEPT_QUESTION =
  "What happens to the number of free neutrons over time if nothing changes?";

export const researchConsentSchema = z.enum(["agreed", "declined"]).nullable();
export type ResearchConsent = z.infer<typeof researchConsentSchema>;

export const researchPreSchema = z.object({
  confidence: z.number().int().min(1).max(5),
  expectedEffort: z.number().int().min(1).max(5),
  explanationStyle: z.enum(EXPLANATION_STYLES),
  answeredAt: z.string().datetime(),
});
export type ResearchPre = z.infer<typeof researchPreSchema>;

export const researchPostSchema = z.object({
  confidence: z.number().int().min(1).max(5),
  actualEffort: z.number().int().min(1).max(5),
  clearer: z.string(),
  confusing: z.string(),
  remove: z.string(),
  keep: z.string(),
  answeredAt: z.string().datetime(),
});
export type ResearchPost = z.infer<typeof researchPostSchema>;

/**
 * Interaction evidence captured from the lab. Timestamps are always the
 * moment the event actually happened; nothing is backfilled or invented.
 */
export const researchEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("prediction_submitted"),
    at: z.string().datetime(),
    trialId: z.string().min(1),
    answer: z.string(),
    structuredAnswer: z.string().nullable(),
    confidence: z.number().int().min(1).max(5).nullable(),
  }),
  z.object({
    type: z.literal("trial_completed"),
    at: z.string().datetime(),
    trialId: z.string().min(1),
    changedVariables: z.array(z.string()),
    stopReason: z.enum(["completed", "max_population", "extinct"]),
  }),
  z.object({
    type: z.literal("adaptation_offered"),
    at: z.string().datetime(),
    proposalId: z.string().min(1),
    proposalType: z.enum(ADAPTATION_PROPOSAL_TYPES),
    source: z.enum(["llm", "rules"]),
  }),
  z.object({
    type: z.literal("adaptation_decided"),
    at: z.string().datetime(),
    proposalId: z.string().min(1),
    proposalType: z.enum(ADAPTATION_PROPOSAL_TYPES),
    decision: z.enum(["accepted", "rejected", "modified"]),
  }),
  z.object({
    type: z.literal("representation_opened"),
    at: z.string().datetime(),
    mode: z.enum(REPRESENTATION_MODES),
  }),
  z.object({
    type: z.literal("counterfactual_run"),
    at: z.string().datetime(),
    originalTrialId: z.string().min(1),
    changedVariable: z.string(),
  }),
  z.object({ type: z.literal("replay_opened"), at: z.string().datetime() }),
  z.object({
    type: z.literal("error"),
    at: z.string().datetime(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("abandoned"),
    at: z.string().datetime(),
    point: z.enum(["predict", "experiment", "understand"]),
  }),
]);
export type ResearchEvent = z.infer<typeof researchEventSchema>;

export const researchSessionSchema = z.object({
  sessionId: z.string().uuid(),
  consent: z.literal("agreed"),
  conceptQuestion: z.string().min(1),
  pre: researchPreSchema.nullable(),
  post: researchPostSchema.nullable(),
  events: z.array(researchEventSchema),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type ResearchSession = z.infer<typeof researchSessionSchema>;

/**
 * The ONLY shape that can leave the device. Deliberately has no field for
 * email, account token, cloud secret, or diagnosis — absence is enforced by
 * the schema and asserted in tests.
 */
export const researchExportSchema = z.object({
  label: z.literal(RESEARCH_LABEL),
  exportedAt: z.string().datetime(),
  sessionId: z.string().uuid(),
  consent: z.literal("agreed"),
  conceptQuestion: z.string().min(1),
  pre: researchPreSchema.nullable(),
  post: researchPostSchema.nullable(),
  interactionEvidence: z.array(researchEventSchema),
  facilitatorNotes: z.string(),
  timestamps: z.object({
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    exportedAt: z.string().datetime(),
  }),
});
export type ResearchExport = z.infer<typeof researchExportSchema>;

function storageAvailable(): boolean {
  try {
    const storage = globalThis.localStorage;
    const testKey = "unseenlab.research-storage-test";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Reads and Zod-validates the persisted consent state. */
export function getResearchConsent(): ResearchConsent {
  if (!storageAvailable()) return null;
  try {
    const raw = globalThis.localStorage.getItem(RESEARCH_CONSENT_KEY);
    if (raw === null) return null;
    const parsed = researchConsentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Persists a consent decision. Declined sessions record nothing. */
export function setResearchConsent(consent: Exclude<ResearchConsent, null>): void {
  if (!storageAvailable()) return;
  try {
    globalThis.localStorage.setItem(RESEARCH_CONSENT_KEY, JSON.stringify(consent));
  } catch {
    // Storage unavailable: consent applies to this visit only.
  }
}

/** True when the participant agreed to research recording. */
export function isResearchRecordingEnabled(): boolean {
  return getResearchConsent() === "agreed";
}

/** True when the lab URL carries the facilitator `?research=1` param. */
export function researchParamEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("research") === "1";
}

function persist(session: ResearchSession): boolean {
  if (!storageAvailable()) return false;
  // Validate the complete record before it touches storage; corrupt or
  // fabricated-looking data is never written.
  const parsed = researchSessionSchema.safeParse(session);
  if (!parsed.success) return false;
  try {
    globalThis.localStorage.setItem(RESEARCH_SESSION_KEY, JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}

/** Loads the current research session; corrupt storage fails safely to null. */
export function loadResearchSession(): ResearchSession | null {
  if (!storageAvailable()) return null;
  try {
    const raw = globalThis.localStorage.getItem(RESEARCH_SESSION_KEY);
    if (raw === null) return null;
    const parsed = researchSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Creates the session record from the pre-session form. A still-unfinished
 * session (no post answers yet) is continued rather than duplicated, so a
 * reload mid-session — or a lab opened before the pre form — never fragments
 * or loses the evidence. Requires consent.
 */
export function createResearchSession(pre: ResearchPre): ResearchSession | null {
  if (!isResearchRecordingEnabled()) return null;
  const existing = loadResearchSession();
  if (existing && !existing.post) {
    const continued: ResearchSession = {
      ...existing,
      pre,
      updatedAt: nowIso(),
    };
    return persist(continued) ? continued : null;
  }
  const session: ResearchSession = {
    sessionId: createSessionId(),
    consent: "agreed",
    conceptQuestion: RESEARCH_CONCEPT_QUESTION,
    pre,
    post: null,
    events: [],
    startedAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
  };
  return persist(session) ? session : null;
}

/**
 * Records one interaction event. No-op unless consent is agreed. When no
 * session record exists yet (lab opened before the pre form), a session with
 * `pre: null` is created so capture is never silently dropped — a session
 * without pre answers is truthful, not fabricated.
 */
export function recordResearchEvent(event: ResearchEvent): boolean {
  if (!isResearchRecordingEnabled()) return false;
  const session = loadResearchSession() ?? {
    sessionId: createSessionId(),
    consent: "agreed" as const,
    conceptQuestion: RESEARCH_CONCEPT_QUESTION,
    pre: null,
    post: null,
    events: [] as ResearchEvent[],
    startedAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
  };
  const next: ResearchSession = {
    ...session,
    events: [...session.events, event],
    updatedAt: nowIso(),
  };
  return persist(next);
}

/**
 * Records the abandonment point when the participant leaves mid-session.
 * Dropped when the session already has post answers (it completed normally)
 * or when nothing was actually recorded (the participant never started).
 */
export function recordAbandonment(
  point: "predict" | "experiment" | "understand",
): boolean {
  if (!isResearchRecordingEnabled()) return false;
  const session = loadResearchSession();
  if (!session) return false;
  if (session.post) return false;
  if (session.events.length === 0) return false;
  return recordResearchEvent({
    type: "abandoned",
    point,
    at: nowIso(),
  });
}

/** Attaches the post-session answers; marks the session complete. */
export function attachResearchPost(post: ResearchPost): boolean {
  if (!isResearchRecordingEnabled()) return false;
  const session = loadResearchSession();
  if (!session) return false;
  const next: ResearchSession = {
    ...session,
    post,
    completedAt: nowIso(),
    updatedAt: nowIso(),
  };
  return persist(next);
}

/** Facilitator-only manual log (hesitation, help requests, verbatim remarks). */
export function getResearchNotes(): string {
  if (!storageAvailable()) return "";
  try {
    const raw = globalThis.localStorage.getItem(RESEARCH_NOTES_KEY);
    return raw ?? "";
  } catch {
    return "";
  }
}

export function saveResearchNotes(text: string): void {
  if (!storageAvailable()) return;
  try {
    globalThis.localStorage.setItem(RESEARCH_NOTES_KEY, text);
  } catch {
    // Ignore: notes are best-effort facilitator scratch space.
  }
}

/**
 * Builds the anonymized export JSON. Returns null when there is no session or
 * the assembled record fails Zod validation — an export is never produced
 * from invalid or fabricated data.
 */
export function exportResearchSession(): string | null {
  const session = loadResearchSession();
  if (!session) return null;
  const exportedAt = nowIso();
  const candidate = {
    label: RESEARCH_LABEL,
    exportedAt,
    sessionId: session.sessionId,
    consent: session.consent,
    conceptQuestion: session.conceptQuestion,
    pre: session.pre,
    post: session.post,
    interactionEvidence: session.events,
    facilitatorNotes: getResearchNotes(),
    timestamps: {
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt,
      exportedAt,
    },
  };
  const parsed = researchExportSchema.safeParse(candidate);
  return parsed.success ? JSON.stringify(parsed.data, null, 2) : null;
}

/** Downloads the anonymized export as a JSON file (facilitator-initiated). */
export function downloadResearchExport(): boolean {
  const json = exportResearchSession();
  if (json === null) return false;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "unseenlab-research-session.json";
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Wipes ALL research data (consent, session, notes). */
export function clearAllResearchData(): void {
  if (!storageAvailable()) return;
  try {
    globalThis.localStorage.removeItem(RESEARCH_CONSENT_KEY);
    globalThis.localStorage.removeItem(RESEARCH_SESSION_KEY);
    globalThis.localStorage.removeItem(RESEARCH_NOTES_KEY);
  } catch {
    // Ignore: storage unavailable means nothing to clear.
  }
}

/**
 * Lab-side hook. `enabled` is pinned from the URL once at mount (zero
 * overhead for ordinary learners — no storage reads, no listeners); `active`
 * additionally requires consent. `record` is a stable reference, so adding it
 * to handler dependencies never retriggers effects.
 */
export function useResearchRecorder() {
  const [enabled] = useState<boolean>(() => researchParamEnabled());
  // Lazy initializer: consent is read once at mount, not in an effect
  // (set-state-in-effect is an error in this repo's lint).
  const [active] = useState<boolean>(() =>
    enabled ? isResearchRecordingEnabled() : false
  );

  return useMemo(
    () => ({
      enabled,
      active,
      record: recordResearchEvent,
      abandon: recordAbandonment,
      createSession: createResearchSession,
    }),
    [enabled, active],
  );
}
