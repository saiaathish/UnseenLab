"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { useSession } from "@/lib/supabase/use-session";
import {
  DENSITY_LABELS,
  EXPLANATION_LABELS,
  GOAL_LABELS,
  PACE_LABELS,
  PACE_TO_SPEED,
  REPRESENTATION_LABELS,
} from "@/personalization/profile-to-learner-preferences";
import type {
  ExplanationStyle,
  InformationDensity,
  LearnerPreferencesRow,
  LearningGoal,
  LearningPace,
  PreferredRepresentation,
} from "@/lib/supabase/types";
import type { SettingsUserInfo } from "./settings-tabs";

/**
 * Learning preferences tab (copy spec §6.2). Option sets match the schema
 * enums exactly; labels come from the canonical personalization layer. Every
 * change saves immediately (500 ms debounce) with optimistic UI.
 */

const GOAL_OPTIONS: Array<[LearningGoal, string]> = [
  ["understand_concept", GOAL_LABELS.understand_concept],
  ["prepare_for_class", GOAL_LABELS.prepare_for_class],
  ["explore_experiments", GOAL_LABELS.explore_experiments],
];

const REPRESENTATION_OPTIONS: Array<[PreferredRepresentation, string]> = [
  ["animation", REPRESENTATION_LABELS.animation],
  ["graph", REPRESENTATION_LABELS.graph],
  ["equation", REPRESENTATION_LABELS.equation],
  ["causal", REPRESENTATION_LABELS.causal],
  ["plain_language", REPRESENTATION_LABELS.plain_language],
];

const EXPLANATION_OPTIONS: Array<[ExplanationStyle, string]> = [
  ["visual_first", EXPLANATION_LABELS.visual_first],
  ["step_by_step", EXPLANATION_LABELS.step_by_step],
  ["concise", EXPLANATION_LABELS.concise],
];

const PACE_OPTIONS: Array<[LearningPace, string]> = [
  ["calm", PACE_LABELS.calm],
  ["balanced", PACE_LABELS.balanced],
  ["quick", PACE_LABELS.quick],
];

const DENSITY_OPTIONS: Array<[InformationDensity, string]> = [
  ["low", DENSITY_LABELS.low],
  ["medium", DENSITY_LABELS.medium],
  ["full", DENSITY_LABELS.full],
];

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LearningPreferencesSettings({
  preferences,
  onPreferencesChange,
  user,
}: {
  preferences: LearnerPreferencesRow;
  onPreferencesChange: (preferences: LearnerPreferencesRow) => void;
  user: SettingsUserInfo;
}) {
  const { user: sessionUser } = useSession();
  const userId = sessionUser?.id ?? user.id;
  const initial = useRef(preferences);
  const [saveError, setSaveError] = useState(false);

  const update = (patch: Partial<LearnerPreferencesRow>) => {
    setSaveError(false);
    onPreferencesChange({ ...preferences, ...patch });
  };

  // Immediate save (500 ms debounce) — optimistic UI: the row above is
  // already the new state while the upsert is in flight.
  useEffect(() => {
    if (preferences === initial.current) return;
    const timer = window.setTimeout(() => {
      const supabase = getBrowserClient();
      if (!supabase) {
        setSaveError(true);
        return;
      }
      void supabase
        .from("learner_preferences")
        .upsert({
          user_id: userId,
          learning_goal: preferences.learning_goal,
          preferred_representation: preferences.preferred_representation,
          explanation_style: preferences.explanation_style,
          learning_pace: preferences.learning_pace,
          animation_speed: preferences.animation_speed,
          information_density: preferences.information_density,
          reduced_motion: preferences.reduced_motion,
          high_contrast: preferences.high_contrast,
          text_scale: preferences.text_scale,
          one_variable_mode: preferences.one_variable_mode,
          topic_interests: preferences.topic_interests,
          schema_version: preferences.schema_version,
        })
        .then(({ error }) => {
          if (error) setSaveError(true);
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [preferences, userId]);

  return (
    <section
      aria-labelledby="learning-preferences-heading"
      className="space-y-4"
    >
      <h1
        id="learning-preferences-heading"
        className="text-2xl font-semibold tracking-tight"
      >
        Learning preferences
      </h1>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="pref-learning-goal"
              label="Learning goal"
              value={preferences.learning_goal}
              options={GOAL_OPTIONS}
              onChange={(value) => update({ learning_goal: value as LearningGoal })}
            />
            <SelectField
              id="pref-representation"
              label="Preferred view"
              value={preferences.preferred_representation}
              options={REPRESENTATION_OPTIONS}
              onChange={(value) =>
                update({
                  preferred_representation: value as PreferredRepresentation,
                })
              }
            />
            <SelectField
              id="pref-explanation-style"
              label="Explanation style"
              value={preferences.explanation_style}
              options={EXPLANATION_OPTIONS}
              onChange={(value) =>
                update({ explanation_style: value as ExplanationStyle })
              }
            />
            <SelectField
              id="pref-learning-pace"
              label="Pace"
              value={preferences.learning_pace}
              options={PACE_OPTIONS}
              onChange={(value) => {
                const pace = value as LearningPace;
                // The pace label drives the initial animation speed; keep the
                // stored speed in sync so the lab mapper stays coherent.
                update({ learning_pace: pace, animation_speed: PACE_TO_SPEED[pace] });
              }}
            />
            <SelectField
              id="pref-information-density"
              label="Information density"
              value={preferences.information_density}
              options={DENSITY_OPTIONS}
              onChange={(value) =>
                update({ information_density: value as InformationDensity })
              }
            />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="text-sm font-medium">One-variable mode</span>
              <Switch
                aria-label="One-variable mode"
                checked={preferences.one_variable_mode}
                onCheckedChange={(checked) =>
                  update({ one_variable_mode: checked })
                }
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            You can change these anytime.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/onboarding?rerun=1"
              className={buttonVariants({ variant: "outline" })}
            >
              Rerun onboarding
            </Link>
            {saveError ? (
              <p role="alert" className="text-sm text-danger">
                We couldn&apos;t save that right now. Please try again.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
