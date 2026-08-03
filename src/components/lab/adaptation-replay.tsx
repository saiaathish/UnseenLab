"use client";

import { useEffect, useRef } from "react";
import type { SessionEvidence } from "@/domain/evidence";
import { PREDICTION_ANSWER_LABELS } from "@/domain/evidence";
import type { TrialRecord } from "@/domain/experiments";
import { DEFAULT_EXPERIMENT_PARAMETERS } from "@/domain/experiments";
import { deriveStopReason } from "@/domain/experiments";
import { parametersEqual } from "@/adaptation/misconception-taxonomy";
import type { CounterfactualResult } from "@/simulation/counterfactual";

interface Props {
  evidence: SessionEvidence;
  lastTrial: TrialRecord | null;
  counterfactualResult: CounterfactualResult | null;
  onClose: () => void;
}

const CONCEPT_LABELS: Record<string, string> = {
  LINEAR_VS_NONLINEAR_GROWTH: "Linear vs. nonlinear growth",
  ABSORBER_EFFECT: "How the absorber changes the reaction",
  STARTING_POPULATION_EFFECT: "How the starting population matters",
  RANDOM_EVENT_VS_SYSTEM_PATTERN: "Random events vs. system pattern",
  MULTIPLE_VARIABLE_CONFOUNDING: "Several variables changed at once",
};

const DECISION_LABELS: Record<string, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  modified: "Modified",
  pending: "Pending",
};

const PARAMETER_LABELS: Record<string, string> = {
  absorberPosition: "Absorber position",
  startingNeutrons: "Starting neutrons",
  materialDensity: "Material density",
  absorptionProbability: "Neutron absorption chance",
  durationSteps: "Duration",
  seed: "Random seed",
};

const STOP_REASON_WORDING: Record<string, string> = {
  max_population:
    "The population hit the safety ceiling of 500 free neutrons.",
  extinct: "The population reached zero.",
};

/**
 * Adaptation Replay: the learner's journey through prediction, trials,
 * adaptation offers, decisions, and counterfactual comparisons — rendered
 * entirely from recorded evidence, one section per real trial in the order
 * they ran. Non-judgmental, plain language throughout. Nothing is fabricated:
 * wording is derived from the same fields that were exported.
 */
export function AdaptationReplay({
  evidence,
  lastTrial,
  counterfactualResult,
  onClose,
}: Props) {
  if (evidence.trials.length === 0) {
    return (
      <Dialog onClose={onClose} title="Adaptation Replay">
        <p className="text-muted">
          No replay history yet — run a trial to start one.
        </p>
      </Dialog>
    );
  }

  const lastTrialId = lastTrial?.id ?? evidence.trials.at(-1)?.id ?? null;

  const interactionPattern: string[] = [];
  if (evidence.trials.length >= 2) {
    const latest = evidence.trials[evidence.trials.length - 1];
    const sameParams = evidence.trials.filter(
      (t) =>
        t.parameters.seed === latest.parameters.seed &&
        t.parameters.absorberPosition === latest.parameters.absorberPosition,
    ).length;
    if (sameParams >= 2) {
      interactionPattern.push("replayed the animation several times");
    }
  }
  if (evidence.trials.some((t) => t.changedVariables.length >= 2)) {
    interactionPattern.push("changed multiple variables at once");
  }
  if (!evidence.representationEvents.some((e) => e.mode === "graph")) {
    interactionPattern.push("did not inspect the graph");
  }
  if (interactionPattern.length === 0) {
    interactionPattern.push("ran a single controlled trial");
  }

  const firstPrediction = evidence.predictions[0] ?? null;
  const latestPrediction = evidence.predictions.at(-1) ?? null;

  return (
    <Dialog onClose={onClose} title="Adaptation Replay">
      <ol className="flex flex-col gap-8">
        {evidence.trials.map((trial, index) => (
          <TrialSection
            key={trial.id}
            trial={trial}
            number={index + 1}
            total={evidence.trials.length}
            evidence={evidence}
            counterfactual={
              evidence.counterfactuals
                .filter((record) => record.originalTrialId === trial.id)
                .at(-1) ?? (lastTrialId === trial.id ? counterfactualResult : null)
            }
          />
        ))}
      </ol>

      <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6">
        <Step n={evidence.trials.length * 5 + 1} title="Observed interaction pattern">
          <p>{interactionPattern.join("; ")}.</p>
        </Step>

        <Step n={evidence.trials.length * 5 + 2} title="Possible conceptual friction">
          {evidence.conceptEvidence.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing flagged — the evidence and prediction lined up.
            </p>
          ) : (
            <ul className="list-inside list-disc">
              {evidence.conceptEvidence.map((concept) => (
                <li key={concept.conceptId}>
                  {CONCEPT_LABELS[concept.conceptId] ?? concept.conceptId}{" "}
                  <span className="text-muted">
                    — evidence suggests: {concept.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Step>

        <Step n={evidence.trials.length * 5 + 3} title="What changed in understanding">
          {firstPrediction && latestPrediction && firstPrediction.id !== latestPrediction.id ? (
            <p className="text-sm leading-6">
              Your first prediction was “{firstPrediction.answer}” (confidence{" "}
              {firstPrediction.confidence ?? "—"}/5) and your latest is “
              {latestPrediction.answer}” (confidence{" "}
              {latestPrediction.confidence ?? "—"}/5). Both are on record, so
              you can compare whether your later prediction lines up better
              with the observed trials.
            </p>
          ) : (
            <p className="text-sm leading-6">
              Only one prediction is on record, so a change in understanding
              cannot be compared.
            </p>
          )}
        </Step>
      </div>

      <p className="mt-4 text-xs text-muted">
        Replay is built from your recorded session data — nothing is
        fabricated. Evidence stays on this device.
      </p>
    </Dialog>
  );
}

function TrialSection({
  trial,
  number,
  total,
  evidence,
  counterfactual,
}: {
  trial: TrialRecord;
  number: number;
  total: number;
  evidence: SessionEvidence;
  counterfactual: CounterfactualResult | null;
}) {
  const trialPredictions = evidence.predictions.filter(
    (prediction) => prediction.trialId === trial.id,
  );
  const initialPrediction = trialPredictions[0] ?? null;
  const updatedPrediction =
    trialPredictions.length > 1
      ? trialPredictions[trialPredictions.length - 1]
      : null;
  const final = trial.snapshots[trial.snapshots.length - 1];
  const trialProposals = evidence.adaptationProposals.filter((proposal) =>
    proposal.evidenceIds.includes(trial.id),
  );
  const isFirst = number === 1;
  const usedDefaults = parametersEqual(
    trial.parameters,
    DEFAULT_EXPERIMENT_PARAMETERS,
  );
  const stopWording = STOP_REASON_WORDING[deriveStopReason(trial)];

  return (
    <li className="rounded-xl border border-border bg-surface-raised/60 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-accent">
        Trial {number} of {total}
      </h3>

      <ol className="mt-4 flex flex-col gap-4">
        <Step n={1} title={isFirst ? "Initial prediction" : "Prediction"}>
          {initialPrediction ? (
            <>
              <p className="italic">“{initialPrediction.answer}”</p>
              <p className="mt-1 text-sm text-muted">
                {initialPrediction.structuredAnswer &&
                initialPrediction.answer !==
                  PREDICTION_ANSWER_LABELS[
                    initialPrediction.structuredAnswer as keyof typeof PREDICTION_ANSWER_LABELS
                  ]
                  ? `${PREDICTION_ANSWER_LABELS[initialPrediction.structuredAnswer as keyof typeof PREDICTION_ANSWER_LABELS]} · `
                  : ""}
                confidence {initialPrediction.confidence ?? "—"}/5
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No prediction on record.</p>
          )}
          {updatedPrediction && updatedPrediction.id !== initialPrediction?.id && (
            <div className="mt-3 rounded-lg bg-surface-raised p-3">
              <p className="text-sm font-medium">Updated prediction</p>
              <p className="mt-1 italic">“{updatedPrediction.answer}”</p>
              <p className="mt-1 text-sm text-muted">
                Confidence {updatedPrediction.confidence ?? "—"}/5
              </p>
            </div>
          )}
        </Step>

        <Step n={2} title="Variables changed">
          {trial.changedVariables.length === 0 ? (
            isFirst && usedDefaults ? (
              <p className="text-sm text-muted">
                This was the first trial — defaults were used.
              </p>
            ) : isFirst ? (
              <p className="text-sm text-muted">
                No variables were changed from the defaults.
              </p>
            ) : (
              <p className="text-sm text-muted">
                No variables changed since the previous trial.
              </p>
            )
          ) : (
            <p>
              {trial.changedVariables
                .map((key) => PARAMETER_LABELS[key] ?? key)
                .join(", ")}
            </p>
          )}
        </Step>

        <Step n={3} title="Trial outcome">
          <p>
            Final free neutrons: {final.freeNeutrons} · Reactions:{" "}
            {final.reactionEvents} · Energy units: {final.cumulativeEnergyUnits}
          </p>
          {stopWording && <p className="mt-1 text-sm text-muted">{stopWording}</p>}
        </Step>

        <Step n={4} title="Adaptation offered">
          {trialProposals.length === 0 ? (
            <p className="text-sm text-muted">No adaptations were offered.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {trialProposals.map((proposal) => (
                <li
                  key={proposal.id}
                  className="rounded-lg bg-surface-raised p-3"
                >
                  <p className="text-sm">{proposal.reason}</p>
                  <p
                    aria-hidden="true"
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      proposal.source === "llm"
                        ? "bg-accent-soft text-accent"
                        : "bg-border/60 text-muted-strong"
                    }`}
                  >
                    {proposal.source === "llm"
                      ? "AI interpretation"
                      : "Offline rules"}
                  </p>
                  {proposal.followUpQuestion && (
                    <p className="mt-1 text-sm">
                      Suggested question: {proposal.followUpQuestion}
                    </p>
                  )}
                  <p className="mt-1 text-sm font-medium">
                    Your decision:{" "}
                    {DECISION_LABELS[proposal.decision] ?? proposal.decision}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Step>

        <Step n={5} title="Counterfactual comparison">
          {counterfactual ? (
            <p>
              One variable changed: {counterfactual.changedVariable} (
              {counterfactual.original.parameters[
                counterfactual.changedVariable
              ]}{" "}
              →{" "}
              {counterfactual.counterfactual.parameters[
                counterfactual.changedVariable
              ]}
              ), same randomness.
            </p>
          ) : (
            <p className="text-sm text-muted">
              No counterfactual comparison in this sequence.
            </p>
          )}
        </Step>
      </ol>
    </li>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
      >
        {n}
      </span>
      <div>
        <h4 className="font-semibold">{title}</h4>
        <div className="mt-1 text-sm leading-6">{children}</div>
      </div>
    </li>
  );
}

/**
 * Accessible modal dialog: focus moves in on open, Tab and Shift+Tab are
 * trapped inside, Escape closes, and focus returns to the opener on close.
 * The full-screen overlay blocks interaction with background content.
 */
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mt-6 w-full max-w-2xl rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close replay"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-raised"
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
