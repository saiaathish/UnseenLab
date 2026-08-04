import {
  ANIMATION_SPEED_MAX,
  ANIMATION_SPEED_MIN,
  DEFAULT_LEARNER_PREFERENCES,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  type LearnerPreferences,
} from "@/domain/learner";
import type {
  ExplanationStyle,
  InformationDensity,
  LearnerPreferencesRow,
  LearningGoal,
  LearningPace,
  PreferredRepresentation,
} from "@/lib/mongo/types";
import type { OnboardingDraft } from "@/personalization/onboarding-schema";

/**
 * CANONICAL personalization conversion layer.
 *
 * The only place profile/onboarding data becomes lab preferences. UI
 * components never map preferences themselves. Every mapping below has a
 * visible consumer (initial representation, animation speed, density,
 * reduced motion, high contrast, text scale, one-variable mode).
 */

export const PACE_TO_SPEED: Record<LearningPace, number> = {
  calm: 0.5,
  balanced: 1,
  quick: 1.5,
};

export const GOAL_LABELS: Record<LearningGoal, string> = {
  understand_concept: "Understand a difficult concept",
  prepare_for_class: "Prepare for class or a test",
  explore_experiments: "Explore through experiments",
};

export const EXPLANATION_LABELS: Record<ExplanationStyle, string> = {
  visual_first: "Show me visually first",
  step_by_step: "Walk me through it step by step",
  concise: "Keep it concise",
};

export const PACE_LABELS: Record<LearningPace, string> = {
  calm: "Calm pace",
  balanced: "Balanced pace",
  quick: "Quick pace",
};

export const REPRESENTATION_LABELS: Record<PreferredRepresentation, string> = {
  animation: "Visual-first",
  graph: "Graphs",
  equation: "Equations",
  causal: "Causal view",
  plain_language: "Plain language",
};

export const DENSITY_LABELS: Record<InformationDensity, string> = {
  low: "Less detail",
  medium: "Balanced detail",
  full: "Full detail",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Maps a stored learner_preferences row onto the lab's typed
 * LearnerPreferences. Missing or invalid rows fall back to defaults.
 */
export function profileToLearnerPreferences(
  profile: LearnerPreferencesRow | null
): LearnerPreferences {
  const prefs = structuredClone(DEFAULT_LEARNER_PREFERENCES);
  if (!profile) return prefs;
  return {
    ...prefs,
    animationSpeed: clamp(
      profile.animation_speed,
      ANIMATION_SPEED_MIN,
      ANIMATION_SPEED_MAX
    ),
    reducedMotion: profile.reduced_motion,
    informationDensity: profile.information_density,
    preferredRepresentations: [profile.preferred_representation],
    oneVariableMode: profile.one_variable_mode,
    highContrast: profile.high_contrast,
    textScale: clamp(profile.text_scale, TEXT_SCALE_MIN, TEXT_SCALE_MAX),
  };
}

/**
 * Human-readable chips for the lab's "Using your saved learning preferences"
 * indicator. Only preferences that actually change behavior appear.
 */
export function preferenceSummary(
  profile: LearnerPreferencesRow
): string[] {
  const items: string[] = [REPRESENTATION_LABELS[profile.preferred_representation]];
  items.push(PACE_LABELS[profile.learning_pace]);
  if (profile.one_variable_mode) items.push("One-variable mode");
  if (profile.reduced_motion) items.push("Reduced motion");
  if (profile.high_contrast) items.push("High contrast");
  if (profile.text_scale > 1) items.push(`${profile.text_scale}× text`);
  return items;
}

/**
 * Builds the learner_preferences upsert payload from an onboarding draft.
 * `learning_pace` drives the initial animation speed; both are stored so a
 * later explicit animation-speed adjustment can diverge from the pace label.
 * `preferred_representation` is not part of the four onboarding steps and is
 * left at the database default; it can be changed in Settings.
 */
export function draftToPreferencesRow(
  draft: OnboardingDraft
): Omit<
  LearnerPreferencesRow,
  | "user_id"
  | "created_at"
  | "updated_at"
  | "schema_version"
  | "preferred_representation"
> {
  return {
    learning_goal: draft.learningGoal,
    explanation_style: draft.explanationStyle,
    learning_pace: draft.learningPace,
    animation_speed: PACE_TO_SPEED[draft.learningPace],
    information_density: "medium",
    reduced_motion: draft.reducedMotion,
    high_contrast: draft.highContrast,
    text_scale: draft.textScale,
    one_variable_mode: true,
    topic_interests: draft.topicInterests,
  };
}
