"use client";

import { useState } from "react";
import type {
  ExperimentParameterKey,
  ExperimentParameterSpec,
  TrialRecord,
} from "@/domain/experiments";
import { COUNTERFACTUAL_VARIABLES } from "@/simulation/counterfactual";
import type { CounterfactualResult } from "@/simulation/counterfactual";

interface Props {
  trial: TrialRecord | null;
  result: CounterfactualResult | null;
  spec: ExperimentParameterSpec[];
  onRun: (variable: ExperimentParameterKey, value: number) => void;
}

/**
 * Counterfactual Microscope: pick ONE variable, keep everything else —
 * including the randomness seed — identical, and compare the two runs side by
 * side. Only the four exposed variables are ever allowed.
 */
export function CounterfactualPanel({ trial, result, spec, onRun }: Props) {
  const [variable, setVariable] = useState<ExperimentParameterKey>(
    COUNTERFACTUAL_VARIABLES[0],
  );
  const parameterSpec = spec.find((s) => s.key === variable);
  const [value, setValue] = useState<number>(
    parameterSpec ? parameterSpec.max * 0.5 : 0.5,
  );

  if (!trial) {
    return (
      <section
        aria-label="Counterfactual comparison"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Counterfactual Microscope
        </h2>
        <p className="mt-2 text-sm text-muted">
          Run a trial first to compare what a single change would do.
        </p>
      </section>
    );
  }

  const specForVariable = spec.find((s) => s.key === variable);

  return (
    <section
      aria-label="Counterfactual comparison"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
        Counterfactual Microscope
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        What single change would most alter or reverse this outcome? One
        variable at a time — same randomness, same everything else.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor="cf-variable" className="text-sm font-medium">
            Which variable to change
          </label>
          <select
            id="cf-variable"
            value={variable}
            onChange={(e) => {
              const next = e.target.value as ExperimentParameterKey;
              setVariable(next);
              const specFor = spec.find((s) => s.key === next);
              if (specFor) {
                setValue(
                  trial.parameters[next] !== specFor.min
                    ? specFor.min
                    : specFor.max,
                );
              }
            }}
            className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
          >
            {COUNTERFACTUAL_VARIABLES.map((key) => {
              const item = spec.find((s) => s.key === key);
              return (
                <option key={key} value={key}>
                  {item?.label ?? key}
                </option>
              );
            })}
          </select>
        </div>

        {specForVariable && (
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="cf-value" className="text-sm font-medium">
                New value
              </label>
              <output htmlFor="cf-value" className="font-mono text-sm text-muted">
                {specForVariable.unit
                  ? `${value} ${specForVariable.unit}`
                  : value}
              </output>
            </div>
            <input
              id="cf-value"
              type="range"
              min={specForVariable.min}
              max={specForVariable.max}
              step={specForVariable.step}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="mt-1 w-full accent-accent"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => onRun(variable, value)}
          className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Run comparison
        </button>
      </div>

      {result && (
        <Comparison
          result={result}
          label={spec.find((s) => s.key === result.changedVariable)?.label ?? result.changedVariable}
        />
      )}
    </section>
  );
}

function Sparkline({
  snapshots,
  color,
  max,
}: {
  snapshots: TrialRecord["snapshots"];
  color: string;
  max: number;
}) {
  const W = 200;
  const H = 70;
  const points = snapshots
    .map(
      (s, i) =>
        `${(i / Math.max(snapshots.length - 1, 1)) * W},${H - 6 - (s.freeNeutrons / Math.max(max, 1)) * (H - 14)}`,
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function Comparison({
  result,
  label,
}: {
  result: CounterfactualResult;
  label: string;
}) {
  const original = result.original.snapshots[result.original.snapshots.length - 1];
  const counter = result.counterfactual.snapshots[result.counterfactual.snapshots.length - 1];
  const max = Math.max(
    result.original.snapshots.reduce((m, s) => Math.max(m, s.freeNeutrons), 0),
    result.counterfactual.snapshots.reduce(
      (m, s) => Math.max(m, s.freeNeutrons),
      0,
    ),
    10,
  );

  const originalValue = result.original.parameters[result.changedVariable];
  const counterValue = result.counterfactual.parameters[result.changedVariable];

  const explanation =
    counter.reactionEvents === original.reactionEvents &&
    counter.freeNeutrons === original.freeNeutrons
      ? `Changing ${label} from ${originalValue} to ${counterValue} (with the same randomness) did not change the final outcome here.`
      : `Keeping everything else identical — including the randomness seed — and changing only ${label} from ${originalValue} to ${counterValue} changed the final free neutrons from ${original.freeNeutrons} to ${counter.freeNeutrons} and reactions from ${original.reactionEvents} to ${counter.reactionEvents}. This shows what that one variable alone controls.`;

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-raised p-3">
      <p className="text-sm font-medium">
        Changed exactly one variable: {label} {originalValue} → {counterValue}
      </p>
      <p className="mt-2 text-xs text-muted">
        Same randomness seed ({result.original.parameters.seed}), same duration.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Original
          </p>
          <Sparkline snapshots={result.original.snapshots} color="#fbbf24" max={max} />
          <dl className="mt-1 text-xs leading-5">
            <div className="flex justify-between">
              <dt className="text-muted">Free neutrons</dt>
              <dd className="font-mono">{original.freeNeutrons}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Reactions</dt>
              <dd className="font-mono">{original.reactionEvents}</dd>
            </div>
          </dl>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Counterfactual
          </p>
          <Sparkline snapshots={result.counterfactual.snapshots} color="#2dd4bf" max={max} />
          <dl className="mt-1 text-xs leading-5">
            <div className="flex justify-between">
              <dt className="text-muted">Free neutrons</dt>
              <dd className="font-mono">{counter.freeNeutrons}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Reactions</dt>
              <dd className="font-mono">{counter.reactionEvents}</dd>
            </div>
          </dl>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6">{explanation}</p>
    </div>
  );
}
