"use client";

import { useState } from "react";
import type {
  ExperimentParameters,
  ExperimentParameterSpec,
} from "@/domain/experiments";
import { diffParameters } from "@/domain/evidence";

interface Props {
  parameters: ExperimentParameters;
  previousParameters: ExperimentParameters | null;
  spec: ExperimentParameterSpec[];
  oneVariableMode: boolean;
  onChange: (parameters: ExperimentParameters) => void;
}

const PARAMETER_LABELS: Record<string, string> = {
  absorberPosition: "Absorber position",
  startingNeutrons: "Starting neutrons",
  materialDensity: "Material density",
  absorptionProbability: "Neutron absorption chance",
  durationSteps: "Duration",
  seed: "Random seed",
};

/**
 * One labeled slider per experiment parameter. In one-variable mode all
 * sliders freeze except the one the learner last touched, so each run changes
 * a single variable.
 */
export function VariableControls({
  parameters,
  previousParameters,
  spec,
  oneVariableMode,
  onChange,
}: Props) {
  const [lastChanged, setLastChanged] = useState<string | null>(null);
  const [showSeed, setShowSeed] = useState(false);

  const changed = diffParameters(previousParameters, parameters);
  const visibleSpec = spec.filter(
    (s) => s.key !== "seed" || showSeed,
  );

  const update = (key: keyof ExperimentParameters, value: number) => {
    setLastChanged(key);
    onChange({ ...parameters, [key]: value });
  };

  return (
    <section
      aria-label="Experiment variables"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
        Experiment variables
      </h2>

      {oneVariableMode && (
        <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm leading-5 text-accent">
          One-variable mode is on: everything is frozen except the control you
          change.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        {visibleSpec.map((item) => {
          const frozen =
            oneVariableMode && lastChanged !== null && lastChanged !== item.key;
          const value = parameters[item.key];
          return (
            <div key={item.key} className={frozen ? "opacity-50" : undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`param-${item.key}`} className="text-sm font-medium">
                  {item.label}
                </label>
                <output
                  htmlFor={`param-${item.key}`}
                  className="font-mono text-sm text-muted"
                >
                  {item.unit ? `${value} ${item.unit}` : value}
                </output>
              </div>
              <input
                id={`param-${item.key}`}
                type="range"
                min={item.min}
                max={item.max}
                step={item.step}
                value={value}
                disabled={frozen}
                onChange={(e) => update(item.key, Number(e.target.value))}
                className="mt-1 w-full accent-accent"
              />
              {!oneVariableMode && (
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  {item.plainExplanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowSeed((v) => !v)}
        aria-expanded={showSeed}
        className="mt-3 text-sm font-medium text-accent hover:underline"
      >
        {showSeed ? "Hide advanced: randomness seed" : "Show advanced: randomness seed"}
      </button>

      {changed.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Changed since last run:{" "}
          <span className="font-medium text-foreground">
            {changed.map((key) => PARAMETER_LABELS[key] ?? key).join(", ")}
          </span>
        </p>
      )}
    </section>
  );
}
