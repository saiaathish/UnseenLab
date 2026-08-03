"use client";

import { useEffect } from "react";
import type { SessionEvidence } from "@/domain/evidence";
import { PREDICTION_ANSWER_LABELS } from "@/domain/evidence";
import type { TrialRecord } from "@/domain/experiments";
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

/**
 * Adaptation Replay: the learner's journey through prediction, trial,
 * adaptation offers, decisions, updated prediction, and counterfactual
 * comparison — rendered entirely from recorded evidence. Non-judgmental,
 * plain language throughout.
 */
export function AdaptationReplay({
  evidence,
  lastTrial,
  counterfactualResult,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (evidence.trials.length === 0) {
    return (
      <Dialog onClose={onClose} title="Adaptation Replay">
        <p className="text-muted">
          No replay history yet — run a trial to start one.
        </p>
      </Dialog>
    );
  }

  const firstPrediction = evidence.predictions[0] ?? null;
  const trial = lastTrial ?? evidence.trials[evidence.trials.length - 1];
  const trialPredictions = evidence.predictions.filter(
    (p) => p.trialId === trial.id,
  );
  const initialPrediction = trialPredictions[0] ?? firstPrediction;
  const updatedPrediction =
    trialPredictions.length > 1
      ? trialPredictions[trialPredictions.length - 1]
      : null;
  const final = trial.snapshots[trial.snapshots.length - 1];
  const trialProposals = evidence.adaptationProposals.filter((proposal) =>
    proposal.evidenceIds.includes(trial.id),
  );
  const concepts = evidence.conceptEvidence;

  const interactionPattern: string[] = [];
  if (evidence.trials.length >= 2) {
    const sameParams = evidence.trials.filter(
      (t) =>
        t.parameters.seed === trial.parameters.seed &&
        t.parameters.absorberPosition === trial.parameters.absorberPosition,
    ).length;
    if (sameParams >= 2) interactionPattern.push("replayed the animation several times");
  }
  if (trial.changedVariables.length >= 2)
    interactionPattern.push("changed multiple variables at once");
  if (!evidence.representationEvents.some((e) => e.mode === "graph"))
    interactionPattern.push("did not inspect the graph");
  if (interactionPattern.length === 0)
    interactionPattern.push("ran a single controlled trial");

  return (
    <Dialog onClose={onClose} title="Adaptation Replay">
      <ol className="flex flex-col gap-4">
        <Step n={1} title="Initial prediction">
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
        </Step>

        <Step n={2} title="Variables changed">
          {trial.changedVariables.length === 0 ? (
            <p className="text-sm text-muted">
              This was the first trial — defaults were used.
            </p>
          ) : (
            <p>{trial.changedVariables.join(", ")}</p>
          )}
        </Step>

        <Step n={3} title="Trial outcome">
          <p>
            Final free neutrons: {final.freeNeutrons} · Reactions:{" "}
            {final.reactionEvents} · Energy units: {final.cumulativeEnergyUnits}
          </p>
        </Step>

        <Step n={4} title="Observed interaction pattern">
          <p>{interactionPattern.join("; ")}.</p>
        </Step>

        <Step n={5} title="Possible conceptual friction">
          {concepts.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing flagged — the evidence and prediction lined up.
            </p>
          ) : (
            <ul className="list-inside list-disc">
              {concepts.map((concept) => (
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

        <Step n={6} title="Adaptation offered">
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
                        : "bg-border/40 text-muted"
                    }`}
                  >
                    {proposal.source === "llm" ? "AI interpretation" : "Offline rules"}
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

        <Step n={7} title="Updated prediction">
          {updatedPrediction ? (
            <>
              <p className="italic">“{updatedPrediction.answer}”</p>
              <p className="mt-1 text-sm text-muted">
                Confidence {updatedPrediction.confidence ?? "—"}/5
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              No updated prediction was submitted.
            </p>
          )}
        </Step>

        <Step n={8} title="Counterfactual comparison">
          {counterfactualResult ? (
            <p>
              One variable changed: {counterfactualResult.changedVariable}{" "}
              ({counterfactualResult.original.parameters[
                counterfactualResult.changedVariable
              ]}{" "}
              →{" "}
              {counterfactualResult.counterfactual.parameters[
                counterfactualResult.changedVariable
              ]}
              ), same randomness.
            </p>
          ) : (
            <p className="text-sm text-muted">
              No counterfactual comparison in this sequence.
            </p>
          )}
        </Step>

        <Step n={9} title="What changed in understanding">
          <p className="text-sm leading-6">
            {updatedPrediction
              ? "The updated prediction is on record — it can be compared with the observed outcome to see whether the later prediction is better aligned with the evidence."
              : "Only one prediction was recorded for this trial, so understanding change cannot be compared."}
            {" "}
            {initialPrediction && updatedPrediction
              ? `Confidence moved from ${initialPrediction.confidence ?? "—"}/5 to ${updatedPrediction.confidence ?? "—"}/5.`
              : ""}
          </p>
        </Step>
      </ol>

      <p className="mt-4 text-xs text-muted">
        Replay is built from your recorded session data — nothing is
        fabricated. Evidence stays on this device.
      </p>
    </Dialog>
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
        <h3 className="font-semibold">{title}</h3>
        <div className="mt-1 text-sm leading-6">{children}</div>
      </div>
    </li>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mt-6 w-full max-w-2xl rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
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
