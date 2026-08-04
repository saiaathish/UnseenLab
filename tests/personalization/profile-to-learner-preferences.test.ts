import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEARNER_PREFERENCES,
  createDefaultPreferences,
} from "@/domain/learner";
import {
  draftToPreferencesRow,
  PACE_TO_SPEED,
  preferenceSummary,
  profileToLearnerPreferences,
} from "@/personalization/profile-to-learner-preferences";
import { emptyOnboardingDraft, type OnboardingDraft } from "@/personalization/onboarding-schema";
import type { LearnerPreferencesRow } from "@/lib/mongo/types";

const rowFixture = (overrides: Partial<LearnerPreferencesRow> = {}): LearnerPreferencesRow => ({
  user_id: "user-1",
  learning_goal: "understand_concept",
  preferred_representation: "animation",
  explanation_style: "step_by_step",
  learning_pace: "balanced",
  animation_speed: 1,
  information_density: "medium",
  reduced_motion: false,
  high_contrast: false,
  text_scale: 1,
  one_variable_mode: true,
  topic_interests: [],
  schema_version: 1,
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
  ...overrides,
});

describe("profileToLearnerPreferences", () => {
  it("returns defaults for a null profile", () => {
    expect(profileToLearnerPreferences(null)).toEqual(createDefaultPreferences());
  });

  it("maps preferred representation to the initial representation list", () => {
    const prefs = profileToLearnerPreferences(
      rowFixture({ preferred_representation: "causal" })
    );
    expect(prefs.preferredRepresentations).toEqual(["causal"]);
  });

  it("maps learning pace to the initial animation speed", () => {
    // Settings and onboarding keep animation_speed in sync with the pace
    // label at write time, so a calm-pace row carries 0.5.
    expect(
      profileToLearnerPreferences(
        rowFixture({ learning_pace: "calm", animation_speed: 0.5 })
      ).animationSpeed
    ).toBe(PACE_TO_SPEED.calm);
    expect(
      profileToLearnerPreferences(
        rowFixture({ learning_pace: "quick", animation_speed: 1.5 })
      ).animationSpeed
    ).toBe(PACE_TO_SPEED.quick);
  });

  it("prefers an explicit animation speed over the pace label", () => {
    // A learner who used the animation-speed slider after choosing a pace.
    const prefs = profileToLearnerPreferences(
      rowFixture({ learning_pace: "calm", animation_speed: 1.75 })
    );
    expect(prefs.animationSpeed).toBe(1.75);
  });

  it("maps density, motion, contrast, text scale and one-variable mode", () => {
    const prefs = profileToLearnerPreferences(
      rowFixture({
        information_density: "low",
        reduced_motion: true,
        high_contrast: true,
        text_scale: 1.4,
        one_variable_mode: false,
      })
    );
    expect(prefs.informationDensity).toBe("low");
    expect(prefs.reducedMotion).toBe(true);
    expect(prefs.highContrast).toBe(true);
    expect(prefs.textScale).toBe(1.4);
    expect(prefs.oneVariableMode).toBe(false);
  });

  it("clamps out-of-range persisted values to the supported range", () => {
    const prefs = profileToLearnerPreferences(
      rowFixture({ animation_speed: 9, text_scale: 4 })
    );
    expect(prefs.animationSpeed).toBe(2); // ANIMATION_SPEED_MAX
    expect(prefs.textScale).toBe(1.5); // TEXT_SCALE_MAX
  });

  it("never changes feedback timing or other unsupported fields", () => {
    const prefs = profileToLearnerPreferences(rowFixture());
    expect(prefs.feedbackTiming).toBe(DEFAULT_LEARNER_PREFERENCES.feedbackTiming);
  });
});

describe("preferenceSummary", () => {
  it("lists only preferences that change behavior", () => {
    const summary = preferenceSummary(
      rowFixture({
        preferred_representation: "graph",
        learning_pace: "calm",
        one_variable_mode: false,
        reduced_motion: true,
        high_contrast: true,
        text_scale: 1.3,
      })
    );
    expect(summary).toContain("Graphs");
    expect(summary).toContain("Calm pace");
    expect(summary).toContain("Reduced motion");
    expect(summary).toContain("High contrast");
    expect(summary).toContain("1.3× text");
    expect(summary).not.toContain("One-variable mode");
  });
});

describe("draftToPreferencesRow", () => {
  it("maps every onboarding choice to a stored preference", () => {
    const draft: OnboardingDraft = {
      ...emptyOnboardingDraft(),
      learningGoal: "prepare_for_class",
      explanationStyle: "concise",
      learningPace: "quick",
      reducedMotion: true,
      textScale: 1.25,
      highContrast: false,
      topicInterests: ["physics", "nuclear"],
    };

    const row = draftToPreferencesRow(draft);
    expect(row.learning_goal).toBe("prepare_for_class");
    expect(row.explanation_style).toBe("concise");
    expect(row.learning_pace).toBe("quick");
    expect(row.animation_speed).toBe(PACE_TO_SPEED.quick);
    expect(row.reduced_motion).toBe(true);
    expect(row.text_scale).toBe(1.25);
    expect(row.high_contrast).toBe(false);
    expect(row.topic_interests).toEqual(["physics", "nuclear"]);
    // Representation is not part of onboarding; it stays at the DB default.
    expect(row).not.toHaveProperty("preferred_representation");
  });
});
