import { z } from "zod";

/**
 * Onboarding schema — the single source of truth for the four steps.
 * Values are the exact strings stored in `learner_preferences` and must
 * match the CHECK constraints in the platform migration.
 */

export const CURRENT_ONBOARDING_VERSION = 1;

export const LEARNING_GOALS = [
  "understand_concept",
  "prepare_for_class",
  "explore_experiments",
] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];

export const EXPLANATION_STYLES = [
  "visual_first",
  "step_by_step",
  "concise",
] as const;
export type ExplanationStyle = (typeof EXPLANATION_STYLES)[number];

export const LEARNING_PACES = ["calm", "balanced", "quick"] as const;
export type LearningPace = (typeof LEARNING_PACES)[number];

export const learningGoalSchema = z.enum(LEARNING_GOALS);
export const explanationStyleSchema = z.enum(EXPLANATION_STYLES);
export const learningPaceSchema = z.enum(LEARNING_PACES);

export const topicInterestsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(12);

/** Draft persisted locally so a refresh resumes at the correct step. */
export const onboardingDraftSchema = z.object({
  step: z.number().int().min(1).max(4),
  learningGoal: learningGoalSchema,
  explanationStyle: explanationStyleSchema,
  learningPace: learningPaceSchema,
  reducedMotion: z.boolean(),
  textScale: z.number().min(1).max(1.5),
  highContrast: z.boolean(),
  topicInterests: topicInterestsSchema,
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

export const emptyOnboardingDraft = (): OnboardingDraft => ({
  step: 1,
  learningGoal: "understand_concept",
  explanationStyle: "step_by_step",
  learningPace: "balanced",
  reducedMotion: false,
  textScale: 1,
  highContrast: false,
  topicInterests: [],
});
