"use client";

import type { LearnerPreferences } from "@/domain/learner";
import {
  ANIMATION_SPEED_MAX,
  ANIMATION_SPEED_MIN,
  FEEDBACK_TIMINGS,
  INFORMATION_DENSITIES,
  REPRESENTATION_MODES,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
} from "@/domain/learner";

interface Props {
  preferences: LearnerPreferences;
  onChange: (updates: Partial<LearnerPreferences>) => void;
}

/**
 * Explicit, learner-controlled accessibility settings. Every control is a
 * visible labeled control with a readable current value. Settings persist in
 * the local session.
 */
export function AccessibilityControls({ preferences, onChange }: Props) {
  const p = preferences;
  return (
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="pref-speed" className="text-sm font-medium">
            Animation speed
          </label>
          <output htmlFor="pref-speed" className="font-mono text-sm text-muted">
            {p.animationSpeed}×
          </output>
        </div>
        <input
          id="pref-speed"
          type="range"
          min={ANIMATION_SPEED_MIN}
          max={ANIMATION_SPEED_MAX}
          step={0.25}
          value={p.animationSpeed}
          onChange={(e) => onChange({ animationSpeed: Number(e.target.value) })}
          className="mt-1 w-full accent-accent"
        />
      </div>

      <Toggle
        id="pref-reduced-motion"
        label="Reduced motion"
        description="Static frames instead of moving particles"
        checked={p.reducedMotion}
        onChange={(checked) => onChange({ reducedMotion: checked })}
      />

      <fieldset>
        <legend className="text-sm font-medium">Information density</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {INFORMATION_DENSITIES.map((density) => (
            <label
              key={density}
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <input
                type="radio"
                name="pref-density"
                checked={p.informationDensity === density}
                onChange={() => onChange({ informationDensity: density })}
                className="h-4 w-4 accent-accent"
              />
              {density}
            </label>
          ))}
        </div>
      </fieldset>

      <Toggle
        id="pref-one-variable"
        label="One-variable mode"
        description="Freeze everything except the control you change"
        checked={p.oneVariableMode}
        onChange={(checked) => onChange({ oneVariableMode: checked })}
      />

      <Toggle
        id="pref-high-contrast"
        label="High contrast"
        description="Stronger borders and darker text on light background"
        checked={p.highContrast}
        onChange={(checked) => onChange({ highContrast: checked })}
      />

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="pref-text-scale" className="text-sm font-medium">
            Text size
          </label>
          <output htmlFor="pref-text-scale" className="font-mono text-sm text-muted">
            {p.textScale}×
          </output>
        </div>
        <input
          id="pref-text-scale"
          type="range"
          min={TEXT_SCALE_MIN}
          max={TEXT_SCALE_MAX}
          step={0.1}
          value={p.textScale}
          onChange={(e) => onChange({ textScale: Number(e.target.value) })}
          className="mt-1 w-full accent-accent"
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Feedback timing</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {FEEDBACK_TIMINGS.map((timing) => (
            <label
              key={timing}
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <input
                type="radio"
                name="pref-feedback"
                checked={p.feedbackTiming === timing}
                onChange={() => onChange({ feedbackTiming: timing })}
                className="h-4 w-4 accent-accent"
              />
              {timing.replace("_", " ")}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="sm:col-span-2 lg:col-span-3">
        <legend className="text-sm font-medium">
          Preferred views (which representations you like to use)
        </legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {REPRESENTATION_MODES.map((mode) => {
            const checked = p.preferredRepresentations.includes(mode);
            return (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      preferredRepresentations: checked
                        ? p.preferredRepresentations.filter((m) => m !== mode)
                        : [...p.preferredRepresentations, mode],
                    })
                  }
                  className="h-4 w-4 accent-accent"
                />
                {mode.replace("_", " ")}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <p className="text-xs text-muted">{description}</p>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-desc`}
        onClick={() => onChange(!checked)}
        className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
          checked
            ? "border-accent/50 bg-accent-soft text-accent"
            : "border-border hover:bg-surface-raised"
        }`}
      >
        <span aria-hidden="true">{checked ? "On" : "Off"}</span>
      </button>
      <p id={`${id}-desc`} className="sr-only">
        {description}
      </p>
    </div>
  );
}
