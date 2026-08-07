"use client";

import { useEffect, useRef, useState } from "react";

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
        className="rounded-2xl border border-border/70 bg-surface/70 p-4 shadow-sm backdrop-blur-sm"
      >
        <p role="status" className="sr-only">
          Prediction recorded — controls unlocked.
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Prediction locked in
        </p>
        <p className="mt-2 text-sm leading-5 text-muted-strong">{prediction.prompt}</p>
        <div className="mt-3">
          <p className="text-xs font-medium text-muted">You predicted</p>
          <blockquote className="mt-1 border-l-2 border-accent pl-3 text-base font-medium leading-6 text-foreground">
            {chosenOption}
          </blockquote>
        </div>

        {truth.graded ? (
          revealed ? (
            <GradedResult prediction={prediction} correctIndex={truth.correctIndex!} chosen={predictionIndex!} />
          ) : (
            <div className="mt-4 border-t border-border/60 pt-3">
              <button
                type="button"
                onClick={onReveal}
                disabled={!manipulated}
                className="w-full rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reveal the verified answer
              </button>
              <p className="mt-2 text-xs leading-5 text-muted">
                {manipulated
                  ? "Now compare what you expected with the verified result."
                  : "Change the model first. The answer stays hidden until you have observed what happens."}
              </p>
            </div>
          )
        ) : (
          <div className="mt-4 border-t border-border/60 pt-3">
            <p className="text-sm font-medium">Now test it in the model</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              This {TRUST_LABELS[trustLevel].toLowerCase()} is not graded. Change
              the model, notice what happens, then compare the result with your
              prediction.
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Prediction"
      className="rounded-2xl border border-accent/30 bg-surface/80 p-4 shadow-sm backdrop-blur-sm"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Predict first
        </h2>
      </div>
      <p className="mt-3 text-lg font-medium leading-7">{prediction.prompt}</p>

      <fieldset className="mt-4">
        <legend className="sr-only">What do you think will happen?</legend>
        <div className="flex flex-col gap-2">
          {prediction.options.map((option, index) => (
            <label
              key={`${option}-${index}`}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm leading-5 transition",
                choice === index
                  ? "border-accent/60 bg-accent-soft/45"
                  : "border-border/70 bg-surface/40 hover:border-border hover:bg-surface-raised/70"
              )}
            >
              <input
                type="radio"
                name="prediction-option"
                checked={choice === index}
                onChange={() => setChoice(index)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
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
        className="mt-4 w-full rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
      >
        Submit prediction
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        Your choice unlocks the experiment controls.
      </p>
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

  // The Reveal button is replaced by this result; take focus so keyboard
  // users stay on the outcome instead of being dropped to <body>.
  const resultRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    resultRef.current?.focus();
  }, []);

  return (
    <div
      ref={resultRef}
      tabIndex={-1}
      className="mt-4 border-t border-border/60 pt-3"
    >
      <p
        role="status"
        className={cn(
          "text-sm font-semibold",
          isCorrect ? "text-ok" : "text-danger"
        )}
      >
        {isCorrect ? "Your prediction matched the verified result." : "Your prediction differed from the verified result."}
      </p>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">You predicted</dt>
          <dd className="text-right font-medium">{chosenOption}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">You observed</dt>
          <dd className="text-right font-medium">{correct}</dd>
        </div>
      </dl>
    </div>
  );
}
