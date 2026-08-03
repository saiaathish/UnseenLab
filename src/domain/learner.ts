import { z } from "zod";

/**
 * Representation modes offered to the learner for viewing a trial.
 * The learner may switch freely; adaptations may suggest a mode but never force it.
 */
export const REPRESENTATION_MODES = [
  "animation",
  "graph",
  "equation",
  "causal",
  "plain_language",
] as const;
export type RepresentationMode = (typeof REPRESENTATION_MODES)[number];

export const FEEDBACK_TIMINGS = [
  "immediate",
  "after_trial",
  "hints_only",
  "manual",
] as const;
export type FeedbackTiming = (typeof FEEDBACK_TIMINGS)[number];

export const INFORMATION_DENSITIES = ["low", "medium", "full"] as const;
export type InformationDensity = (typeof INFORMATION_DENSITIES)[number];

/**
 * Learner preferences are explicit, learner-controlled settings.
 * They are never inferred from a diagnosis or a learner's identity.
 */
export interface LearnerPreferences {
  /** Multiplier applied to animation frame pacing. 1 = normal. */
  animationSpeed: number;
  /** When true, the animation reduces to simplified, low-motion rendering. */
  reducedMotion: boolean;
  informationDensity: InformationDensity;
  preferredRepresentations: RepresentationMode[];
  feedbackTiming: FeedbackTiming;
  /** When true, the shell freezes non-essential variables between trials. */
  oneVariableMode: boolean;
  highContrast: boolean;
  /** Text size multiplier. 1 = normal. */
  textScale: number;
}

export const ANIMATION_SPEED_MIN = 0.25;
export const ANIMATION_SPEED_MAX = 2;
export const TEXT_SCALE_MIN = 1;
export const TEXT_SCALE_MAX = 1.5;

export const DEFAULT_LEARNER_PREFERENCES: LearnerPreferences = {
  animationSpeed: 1,
  reducedMotion: false,
  informationDensity: "medium",
  preferredRepresentations: ["animation"],
  feedbackTiming: "after_trial",
  oneVariableMode: false,
  highContrast: false,
  textScale: 1,
};

export const learnerPreferencesSchema = z.object({
  animationSpeed: z
    .number()
    .min(ANIMATION_SPEED_MIN)
    .max(ANIMATION_SPEED_MAX),
  reducedMotion: z.boolean(),
  informationDensity: z.enum(INFORMATION_DENSITIES),
  preferredRepresentations: z.array(z.enum(REPRESENTATION_MODES)),
  feedbackTiming: z.enum(FEEDBACK_TIMINGS),
  oneVariableMode: z.boolean(),
  highContrast: z.boolean(),
  textScale: z.number().min(TEXT_SCALE_MIN).max(TEXT_SCALE_MAX),
});

export function createDefaultPreferences(): LearnerPreferences {
  return structuredClone(DEFAULT_LEARNER_PREFERENCES);
}
