import type {
  AdaptationProposal,
  PredictionRecord,
  SessionEvidence,
} from "./evidence";
import type { TrialRecord } from "./experiments";
import type { LearnerPreferences } from "./learner";

/**
 * The adaptation provider interprets learner behavior and proposes changes to
 * how the experiment is represented, paced, or structured. It NEVER modifies
 * scientific truth: it cannot change simulation equations or outcomes.
 */
export interface AdaptationInput {
  preferences: LearnerPreferences;
  predictions: PredictionRecord[];
  trials: TrialRecord[];
  sessionEvidence: SessionEvidence;
}

export interface AdaptationProvider {
  /**
   * Returns zero or more proposals. Implementations must be deterministic for
   * the same input and must attach evidence IDs to every proposal.
   */
  propose(input: AdaptationInput): Promise<AdaptationProposal[]>;
}

/**
 * Applies a proposal's changes to preferences. Unknown keys are ignored.
 * Preferences are persisted so the learner's choice outlives the session.
 */
export function applyProposedChanges(
  preferences: LearnerPreferences,
  changes: Record<string, unknown>,
): LearnerPreferences {
  const out = { ...preferences };
  if (typeof changes.animationSpeed === "number") {
    out.animationSpeed = changes.animationSpeed;
  }
  if (typeof changes.informationDensity === "string") {
    out.informationDensity = changes.informationDensity as LearnerPreferences["informationDensity"];
  }
  if (typeof changes.oneVariableMode === "boolean") {
    out.oneVariableMode = changes.oneVariableMode;
  }
  if (Array.isArray(changes.preferredRepresentations)) {
    out.preferredRepresentations = changes.preferredRepresentations as LearnerPreferences["preferredRepresentations"];
  }
  if (typeof changes.feedbackTiming === "string") {
    out.feedbackTiming = changes.feedbackTiming as LearnerPreferences["feedbackTiming"];
  }
  if (typeof changes.reducedMotion === "boolean") {
    out.reducedMotion = changes.reducedMotion;
  }
  if (typeof changes.highContrast === "boolean") {
    out.highContrast = changes.highContrast;
  }
  if (typeof changes.textScale === "number") {
    out.textScale = changes.textScale;
  }
  return out;
}
