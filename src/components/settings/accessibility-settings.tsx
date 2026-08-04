"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import {
  ANIMATION_SPEED_MAX,
  ANIMATION_SPEED_MIN,
  INFORMATION_DENSITIES,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
} from "@/domain/learner";
import { DENSITY_LABELS } from "@/personalization/profile-to-learner-preferences";
import type {
  InformationDensity,
  LearnerPreferencesRow,
} from "@/lib/mongo/types";

/**
 * Accessibility tab (copy spec §6.3). Controls match the lab's accessibility
 * panel: reduced motion, text size, high contrast, animation speed,
 * information density, and one-variable mode. Adjustments apply immediately
 * to the page (same effects as the lab shell) and save debounced (500 ms).
 */

function SliderField({
  id,
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-sm text-muted-foreground">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

export function AccessibilitySettings({
  preferences,
  onPreferencesChange,
}: {
  preferences: LearnerPreferencesRow;
  onPreferencesChange: (preferences: LearnerPreferencesRow) => void;
}) {
  const initial = useRef(preferences);
  const [saveError, setSaveError] = useState(false);

  const update = (patch: Partial<LearnerPreferencesRow>) => {
    setSaveError(false);
    onPreferencesChange({ ...preferences, ...patch });
  };

  // Apply immediately — same effects experiment-shell uses (body class,
  // reduced-motion attribute, root font size). Font size is removed on
  // unmount so it never leaks into other pages.
  useEffect(() => {
    document.body.classList.toggle("high-contrast", preferences.high_contrast);
    document.documentElement.setAttribute(
      "data-reduced-motion",
      String(preferences.reduced_motion),
    );
    const root = document.documentElement;
    root.style.fontSize = `${preferences.text_scale * 100}%`;
    return () => {
      root.style.fontSize = "";
    };
  }, [preferences.high_contrast, preferences.reduced_motion, preferences.text_scale]);

  // Debounced persistence, optimistic UI. The full row is sent without
  // `user_id` — the server derives ownership from the session cookie.
  useEffect(() => {
    if (preferences === initial.current) return;
    const timer = window.setTimeout(() => {
      if (!isFirebaseConfigured()) {
        setSaveError(true);
        return;
      }
      void fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      })
        .then((response) => {
          if (!response.ok) setSaveError(true);
        })
        .catch(() => setSaveError(true));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [preferences]);

  return (
    <section aria-labelledby="accessibility-heading" className="space-y-4">
      <h1
        id="accessibility-heading"
        className="text-2xl font-semibold tracking-tight"
      >
        Accessibility
      </h1>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">
                Reduce animation motion
              </span>
              <p className="text-xs text-muted-foreground">
                Static frames instead of moving particles
              </p>
            </div>
            <Switch
              aria-label="Reduce animation motion"
              checked={preferences.reduced_motion}
              onCheckedChange={(checked) =>
                update({ reduced_motion: checked })
              }
            />
          </div>

          <SliderField
            id="pref-text-scale"
            label="Text size"
            min={TEXT_SCALE_MIN}
            max={TEXT_SCALE_MAX}
            step={0.1}
            value={preferences.text_scale}
            display={`${Math.round(preferences.text_scale * 100)}%`}
            onChange={(value) => update({ text_scale: value })}
          />

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">High contrast</span>
              <p className="text-xs text-muted-foreground">
                Stronger borders and darker text on light background
              </p>
            </div>
            <Switch
              aria-label="High contrast"
              checked={preferences.high_contrast}
              onCheckedChange={(checked) => update({ high_contrast: checked })}
            />
          </div>

          <SliderField
            id="pref-animation-speed"
            label="Animation speed"
            min={ANIMATION_SPEED_MIN}
            max={ANIMATION_SPEED_MAX}
            step={0.25}
            value={preferences.animation_speed}
            display={`${preferences.animation_speed}×`}
            onChange={(value) => update({ animation_speed: value })}
          />

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">
              Information density
            </legend>
            <div className="flex flex-wrap gap-2">
              {INFORMATION_DENSITIES.map((density) => (
                <label
                  key={density}
                  className="flex cursor-pointer items-center gap-1.5 text-sm"
                >
                  <input
                    type="radio"
                    name="pref-density"
                    checked={preferences.information_density === density}
                    onChange={() =>
                      update({ information_density: density })
                    }
                    className="h-4 w-4 accent-accent"
                  />
                  {DENSITY_LABELS[density as InformationDensity]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">One-variable mode</span>
              <p className="text-xs text-muted-foreground">
                Freeze everything except the control you change
              </p>
            </div>
            <Switch
              aria-label="One-variable mode"
              checked={preferences.one_variable_mode}
              onCheckedChange={(checked) =>
                update({ one_variable_mode: checked })
              }
            />
          </div>

          <p className="text-xs text-muted-foreground">
            These adjustments apply where the lab supports them.
          </p>

          {saveError ? (
            <p role="alert" className="text-sm text-danger">
              We couldn&apos;t save that right now. Please try again.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
