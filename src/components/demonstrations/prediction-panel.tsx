"use client";

import { useState } from "react";

import type { PredictionSpec, TrustLevel } from "@/demonstrations/spec/demo-spec";
import { TRUST_LABELS } from "@/demonstrations/spec/demo-spec";
import { cn } from "@/lib/utils";

export interface PredictionTruth {
  /** Only curated verified simulations are ever graded. */
  graded: boolean;
  correctIndex?: number;
}

interface Props {
  prediction: PredictionSpec;
  truth: PredictionTruth;
  trustLevel: TrustLevel;
  /** True once the learner's prediction has been recorded. */
  submitted: boolean;
  predictionIndex: number | null;
  /** True after the learner has changed at least one control. */
  manipulated: boolean;
  revealed: boolean;
  onSubmit: (index: number) => void;
  onReveal: () => void;
}

/**
 * Prediction-first flow:
 *  1. The learner must submit a prediction before the controls unlock.
 *  2. After submission the prediction is locked in.
 *  3. For curated verified simulations (predictionTruth(spec).graded) a
 *     "Reveal" action appears — but only after the learner has manipulated
 *     and observed, never before. It shows correct vs chosen honestly.
 *  4. For conceptual/level-3 specs nothing is ever graded: the panel prompts
 *     "Compare with what you observed".
 */
export function DemonstrationPredictionPanel({
  prediction,
  truth,
  trustLevel,
  submitted,
  predictionIndex,
  manipulated,
  revealed,
  onSubmit,
  onReveal,
}: Props) {
  const [choice, setChoice] = useState<number | null>(null);
  const chosenOption =
    predictionIndex !== null ? prediction.options[predictionIndex] : null;

  if (submitted && chosenOption) {
    return (
      <section
        aria-label="Prediction"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Prediction locked in
        </h2>
        <p className="mt-2 leading-6">{prediction.prompt}</p>
        <blockquote className="mt-2 border-l-2 border-accent pl-3 text-foreground">
          {chosenOption}
        </blockquote>

        {truth.graded ? (
          revealed ? (
            <GradedResult prediction={prediction} correctIndex={truth.correctIndex!} chosen={predictionIndex!} />
          ) : (
            <div className="mt-3">
              <button
                type="button"
                onClick={onReveal}
                disabled={!manipulated}
                className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reveal the verified answer
              </button>
              <p className="mt-2 text-xs leading-5 text-muted">
                {manipulated
                  ? "Compare what you expected with the verified answer."
                  : "Manipulate the demonstration first — the answer stays hidden until you have observed the behavior."}
              </p>
            </div>
          )
        ) : (
          <div className="mt-3 rounded-lg bg-surface-raised px-3 py-2.5">
            <p className="text-sm font-medium">Compare with what you observed</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              This {TRUST_LABELS[trustLevel].toLowerCase()} is not graded. Watch
              what happens as you change the controls and judge your prediction
              against your own observations.
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Prediction"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
        Predict first
      </h2>
      <p className="mt-2 leading-6">{prediction.prompt}</p>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium">What do you think will happen?</legend>
        <div className="mt-2 flex flex-col gap-2">
          {prediction.options.map((option, index) => (
            <label
              key={`${option}-${index}`}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-raised"
            >
              <input
                type="radio"
                name="prediction-option"
                checked={choice === index}
                onChange={() => setChoice(index)}
                className="h-4 w-4 accent-accent"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => {
          if (choice === null) return;
          onSubmit(choice);
          setChoice(null);
        }}
        disabled={choice === null}
        className="mt-4 w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Submit prediction
      </button>
    </section>
  );
}

function GradedResult({
  prediction,
  correctIndex,
  chosen,
}: {
  prediction: PredictionSpec;
  correctIndex: number;
  chosen: number;
}) {
  const correct = prediction.options[correctIndex];
  const chosenOption = prediction.options[chosen];
  const isCorrect = correctIndex === chosen;
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-raised p-3">
      <p
        role="status"
        className={cn(
          "text-sm font-semibold",
          isCorrect ? "text-ok" : "text-danger"
        )}
      >
        {isCorrect ? "Your prediction was correct." : "Your prediction differed from the verified answer."}
      </p>
      <dl className="mt-2 flex flex-col gap-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Your prediction</dt>
          <dd className="text-right font-medium">{chosenOption}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Verified answer</dt>
          <dd className="text-right font-medium">{correct}</dd>
        </div>
      </dl>
    </div>
  );
}
