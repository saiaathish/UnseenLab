"use client";

import { useState } from "react";
import type { PredictionRecord } from "@/domain/evidence";
import {
  PREDICTION_ANSWER_CHOICES,
  PREDICTION_ANSWER_LABELS,
  type PredictionAnswerChoice,
} from "@/domain/evidence";

interface Props {
  goal: string;
  lastPrediction: PredictionRecord | null;
  pending: {
    trialId: string;
    answer: string;
    structuredAnswer: PredictionAnswerChoice | null;
    confidence: number;
  } | null;
  onSubmit: (
    answer: string,
    structuredAnswer: PredictionAnswerChoice | null,
    confidence: number,
  ) => void;
}

const CONFIDENCE_LABELS = [
  "1 — not sure",
  "2 — a little unsure",
  "3 — in the middle",
  "4 — fairly sure",
  "5 — very sure",
];

/**
 * The prediction panel. A prediction (answer + confidence) is REQUIRED before
 * a trial may run. After a trial, the learner can submit an updated
 * prediction linked to the same trial.
 */
export function PredictionPanel({ goal, lastPrediction, pending, onSubmit }: Props) {
  const [choice, setChoice] = useState<PredictionAnswerChoice | null>(null);
  const [freeText, setFreeText] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [editing, setEditing] = useState(false);

  const editingNow = editing || (!lastPrediction && !pending);
  const existing = lastPrediction ?? pending ?? null;

  if (existing && !editingNow) {
    return (
      <section
        aria-label="Your prediction"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Your prediction
        </h2>
        <p className="mt-2 leading-6">{goal}</p>
        <blockquote className="mt-2 border-l-2 border-accent pl-3 italic text-foreground">
          {existing.answer}
        </blockquote>
        <p className="mt-2 text-sm text-muted">
          Confidence:{" "}
          <span className="font-medium text-foreground">
            {existing.confidence ?? "—"}/5
          </span>
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised"
        >
          Update my prediction
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Prediction"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
        {lastPrediction ? "Updated prediction" : "Predict first"}
      </h2>
      <p className="mt-2 leading-6">{goal}</p>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium">
          What do you think will happen?
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          {PREDICTION_ANSWER_CHOICES.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-raised"
            >
              <input
                type="radio"
                name="prediction-choice"
                checked={choice === key}
                onChange={() => setChoice(key)}
                className="h-4 w-4 accent-current"
              />
              {PREDICTION_ANSWER_LABELS[key]}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="prediction-freetext" className="mt-4 block text-sm font-medium">
        Your prediction in your own words (optional)
      </label>
      <textarea
        id="prediction-freetext"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
        placeholder="For example: the reaction will get slightly faster…"
      />

      <label
        htmlFor="prediction-confidence"
        className="mt-4 block text-sm font-medium"
      >
        How confident are you?{" "}
        <span className="text-muted">{CONFIDENCE_LABELS[confidence - 1]}</span>
      </label>
      <div className="mt-1 flex items-center gap-3">
        <input
          id="prediction-confidence"
          type="range"
          min={1}
          max={5}
          step={1}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <output className="w-8 text-right font-mono text-sm">{confidence}</output>
      </div>

      <button
        type="button"
        onClick={() => {
          const answer =
            freeText.trim() !== ""
              ? freeText.trim()
              : choice
                ? PREDICTION_ANSWER_LABELS[choice]
                : "";
          if (answer === "") return;
          onSubmit(answer, choice, confidence);
          setFreeText("");
          setChoice(null);
          setEditing(false);
        }}
        disabled={freeText.trim() === "" && choice === null}
        className="mt-4 w-full rounded-lg bg-accent-strong px-4 py-2.5 font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {lastPrediction ? "Submit updated prediction" : "Submit prediction"}
      </button>
      {lastPrediction && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-2 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-raised"
        >
          Cancel
        </button>
      )}
    </section>
  );
}
