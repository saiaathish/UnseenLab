"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ExperimentDefinition,
  ExperimentParameters,
  TrialRecord,
  SimulationStopReason,
} from "@/domain/experiments";
import { simulationDisclaimer } from "@/domain/experiments";
import { diffParameters } from "@/domain/evidence";
import type { LearnerPreferences, RepresentationMode } from "@/domain/learner";
import {
  applyProposedChanges as applyPreferenceChanges,
  type AdaptationInput,
} from "@/domain/adaptation";
import type {
  AdaptationProposal,
  PredictionAnswerChoice,
  PredictionRecord,
  SessionEvidence,
} from "@/domain/evidence";
import {
  addAdaptationProposal,
  addConceptEvidence,
  addPrediction,
  addRepresentationEvent,
  addTrial,
  updateAdaptationProposal,
} from "@/domain/evidence";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import {
  runCounterfactual,
  type CounterfactualResult,
} from "@/simulation/counterfactual";
import { createAdaptationProvider } from "@/adaptation/llm-provider";
import { classifyConceptEvidence } from "@/adaptation/misconception-taxonomy";
import {
  loadLocalSession,
  saveLocalSession,
  type LocalSession,
} from "@/storage/session-storage";
import { PredictionPanel } from "./prediction-panel";
import { VariableControls } from "./variable-controls";
import { SimulationCanvas } from "./simulation-canvas";
import { RepresentationTabs } from "./representation-tabs";
import { AdaptationCard } from "./adaptation-card";
import { CounterfactualPanel } from "./counterfactual-panel";
import { AdaptationReplay } from "./adaptation-replay";
import { AccessibilityControls } from "./accessibility-controls";
import { ResearchMode } from "./research-mode";

const adaptationProvider = createAdaptationProvider();

interface PendingPrediction {
  trialId: string;
  answer: string;
  structuredAnswer: PredictionAnswerChoice | null;
  confidence: number;
}

const STEPS = [
  { id: "predict", label: "Predict", description: "Say what you expect." },
  {
    id: "experiment",
    label: "Experiment",
    description: "Change one thing and run it.",
  },
  {
    id: "understand",
    label: "Understand",
    description: "See why the result changed.",
  },
] as const;

/**
 * Orchestrates one lab through a calm, progressive workflow. Only the controls
 * needed for the learner's current step are shown; optional research and
 * accessibility tools remain available without competing with the experiment.
 */
export function ExperimentShell({
  experiment,
}: {
  experiment: ExperimentDefinition;
}) {
  const [session, setSession] = useState<LocalSession>(() => loadLocalSession());
  const [currentParameters, setCurrentParameters] =
    useState<ExperimentParameters>(() => ({
      ...experiment.defaultParameters,
    }));
  const [lastTrial, setLastTrial] = useState<TrialRecord | null>(null);
  const [lastStopReason, setLastStopReason] =
    useState<SimulationStopReason | null>(null);
  const [pendingPrediction, setPendingPrediction] =
    useState<PendingPrediction | null>(null);
  const [activeProposals, setActiveProposals] = useState<AdaptationProposal[]>(
    [],
  );
  const [activeRepresentation, setActiveRepresentation] =
    useState<RepresentationMode>("animation");
  const [counterfactual, setCounterfactual] =
    useState<CounterfactualResult | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const preferences = session.preferences;

  useEffect(() => {
    saveLocalSession(session);
  }, [session]);

  useEffect(() => {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : undefined;
    const apply = () => {
      const osReduced = media?.matches ?? false;
      document.body.classList.toggle("high-contrast", preferences.highContrast);
      document.documentElement.setAttribute(
        "data-reduced-motion",
        String(osReduced || preferences.reducedMotion),
      );
    };
    apply();
    media?.addEventListener("change", apply);
    return () => media?.removeEventListener("change", apply);
  }, [preferences.highContrast, preferences.reducedMotion]);

  const lastPrediction = useMemo(
    () =>
      lastTrial
        ? session.evidence.predictions
            .filter((prediction) => prediction.trialId === lastTrial.id)
            .at(-1) ?? null
        : null,
    [lastTrial, session.evidence.predictions],
  );

  const lastOpenedMode = useMemo(
    () => session.evidence.representationEvents.at(-1)?.mode ?? null,
    [session.evidence.representationEvents],
  );

  const currentStep = lastTrial ? 3 : pendingPrediction ? 2 : 1;

  const updatePreferences = useCallback(
    (updates: Partial<LearnerPreferences>) => {
      setSession((previous) => ({
        ...previous,
        preferences: { ...previous.preferences, ...updates },
      }));
    },
    [],
  );

  const handlePredictionSubmit = useCallback(
    (
      answer: string,
      structuredAnswer: PredictionAnswerChoice | null,
      confidence: number,
    ) => {
      if (lastTrial) {
        const record: PredictionRecord = {
          id: crypto.randomUUID(),
          trialId: lastTrial.id,
          prompt: experiment.goal,
          answer,
          structuredAnswer,
          confidence,
          createdAt: new Date().toISOString(),
        };
        setSession((previous) => ({
          ...previous,
          evidence: addPrediction(previous.evidence, record),
        }));
      } else {
        setPendingPrediction({
          trialId: crypto.randomUUID(),
          answer,
          structuredAnswer,
          confidence,
        });
      }
      setNotice(null);
    },
    [experiment.goal, lastTrial],
  );

  const handleRun = useCallback(async () => {
    if (!pendingPrediction) {
      setNotice("Make a prediction first, then run the experiment.");
      return;
    }

    const predictionRecord: PredictionRecord = {
      id: crypto.randomUUID(),
      trialId: pendingPrediction.trialId,
      prompt: experiment.goal,
      answer: pendingPrediction.answer,
      structuredAnswer: pendingPrediction.structuredAnswer,
      confidence: pendingPrediction.confidence,
      createdAt: new Date().toISOString(),
    };

    const changedVariables = diffParameters(
      lastTrial?.parameters ?? null,
      currentParameters,
    );
    const result = runSimulation(currentParameters);
    const trial: TrialRecord = {
      ...result.trial,
      id: pendingPrediction.trialId,
      changedVariables,
    };

    let nextEvidence: SessionEvidence = addPrediction(
      session.evidence,
      predictionRecord,
    );
    nextEvidence = addTrial(nextEvidence, trial);

    const input: AdaptationInput = {
      preferences,
      predictions: nextEvidence.predictions,
      trials: nextEvidence.trials,
      sessionEvidence: nextEvidence,
    };

    const conceptEvidence = classifyConceptEvidence(input);
    for (const concept of conceptEvidence) {
      nextEvidence = addConceptEvidence(nextEvidence, concept);
    }

    let proposals: AdaptationProposal[] = [];
    let adaptationFailed = false;
    try {
      proposals = await adaptationProvider.propose(input);
      for (const proposal of proposals) {
        nextEvidence = addAdaptationProposal(nextEvidence, proposal);
      }
    } catch {
      proposals = [];
      adaptationFailed = true;
    }

    setSession((previous) => ({ ...previous, evidence: nextEvidence }));
    setLastTrial(trial);
    setLastStopReason(result.stopReason);
    setPendingPrediction(null);
    setCounterfactual(null);
    setActiveProposals(proposals);
    setActiveRepresentation("animation");
    setNotice(
      adaptationFailed
        ? "Helpful suggestions are unavailable, but your experiment ran normally."
        : null,
    );
  }, [
    currentParameters,
    experiment.goal,
    lastTrial,
    pendingPrediction,
    preferences,
    session.evidence,
  ]);

  const handleProposalDecision = useCallback(
    (
      proposal: AdaptationProposal,
      decision: "accepted" | "rejected" | "modified",
      changeSubset?: Record<string, unknown>,
    ) => {
      const decided: AdaptationProposal = {
        ...proposal,
        decision,
        decidedAt: new Date().toISOString(),
      };
      const changes =
        decision === "modified"
          ? changeSubset ?? {}
          : decision === "accepted"
            ? proposal.proposedChanges
            : {};

      if (Object.keys(changes).length > 0) {
        updatePreferences(applyPreferenceChanges(preferences, changes));
      }
      if (decision === "accepted") {
        if (proposal.type === "show_graph") setActiveRepresentation("graph");
        if (proposal.type === "show_causal_view") {
          setActiveRepresentation("causal");
        }
      }

      setSession((previous) => ({
        ...previous,
        evidence: updateAdaptationProposal(previous.evidence, decided),
      }));
      setActiveProposals((previous) =>
        previous.filter((item) => item.id !== proposal.id),
      );
      setNotice(null);
    },
    [preferences, updatePreferences],
  );

  const handleRepresentationChange = useCallback(
    (mode: RepresentationMode) => {
      setActiveRepresentation(mode);
      if (mode !== lastOpenedMode) {
        setSession((previous) => ({
          ...previous,
          evidence: addRepresentationEvent(previous.evidence, {
            mode,
            openedAt: new Date().toISOString(),
          }),
        }));
      }
    },
    [lastOpenedMode],
  );

  const handleCounterfactual = useCallback(
    (variable: Parameters<typeof runCounterfactual>[1], value: number) => {
      if (!lastTrial) {
        setNotice("Run the main experiment before comparing one change.");
        return;
      }
      const result = runCounterfactual(lastTrial, variable, value);
      setCounterfactual(result);
      setSession((previous) => ({
        ...previous,
        evidence: addTrial(previous.evidence, result.counterfactual),
      }));
      setNotice(null);
    },
    [lastTrial],
  );

  const handleClearSession = useCallback(() => {
    const freshSession = loadLocalSession();
    setSession(freshSession);
    setCurrentParameters({ ...experiment.defaultParameters });
    setLastTrial(null);
    setLastStopReason(null);
    setPendingPrediction(null);
    setActiveProposals([]);
    setCounterfactual(null);
    setActiveRepresentation("animation");
    setNotice(null);
  }, [experiment.defaultParameters]);

  return (
    <div
      style={{ fontSize: `${preferences.textScale * 100}%` }}
      className="flex min-h-screen flex-col"
    >
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-start gap-4 px-4 py-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="text-sm font-medium text-accent hover:underline"
            >
              ← All labs
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {experiment.title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted sm:text-base">
              {experiment.goal}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((value) => !value)}
            aria-expanded={showSettings}
            className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-surface-raised"
          >
            Accessibility &amp; display
          </button>
        </div>

        <div className="border-t border-border bg-background/70">
          <p className="mx-auto w-full max-w-5xl px-4 py-2.5 text-xs leading-5 text-muted sm:px-6">
            <span className="font-semibold text-foreground">
              Safe conceptual model:
            </span>{" "}
            {simulationDisclaimer}
          </p>
        </div>
      </header>

      {showSettings && (
        <section
          aria-label="Accessibility and display settings"
          className="border-b border-border bg-surface px-4 py-5 sm:px-6"
        >
          <div className="mx-auto w-full max-w-5xl">
            <AccessibilityControls
              preferences={preferences}
              onChange={updatePreferences}
            />
          </div>
        </section>
      )}

      {notice && (
        <div
          role="alert"
          className="border-b border-warn/30 bg-warn/10 px-4 py-3 text-center text-sm text-warn"
        >
          {notice}
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <nav aria-label="Experiment progress">
          <ol className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-surface">
            {STEPS.map((step, index) => {
              const stepNumber = index + 1;
              const complete = stepNumber < currentStep;
              const active = stepNumber === currentStep;
              return (
                <li
                  key={step.id}
                  aria-current={active ? "step" : undefined}
                  className={[
                    "min-w-0 px-3 py-3 sm:px-5",
                    index > 0 ? "border-l border-border" : "",
                    active ? "bg-accent-soft" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={[
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        active || complete
                          ? "bg-accent-strong text-white"
                          : "bg-surface-raised text-muted",
                      ].join(" ")}
                    >
                      {complete ? "✓" : stepNumber}
                    </span>
                    <span className="truncate text-sm font-semibold">
                      {step.label}
                    </span>
                  </div>
                  <p className="mt-1 hidden text-xs leading-5 text-muted sm:block">
                    {step.description}
                  </p>
                </li>
              );
            })}
          </ol>
        </nav>

        {!lastTrial && !pendingPrediction && (
          <section className="mx-auto mt-6 max-w-2xl">
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-semibold">What do you expect?</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Choose an answer. This is a hypothesis, not a grade.
              </p>
            </div>
            <PredictionPanel
              goal={experiment.goal}
              lastPrediction={lastPrediction}
              pending={pendingPrediction}
              onSubmit={handlePredictionSubmit}
            />
          </section>
        )}

        {!lastTrial && pendingPrediction && (
          <section className="mt-6">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Change one thing</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Adjust a control, then run the experiment. You can always
                    reset and try again.
                  </p>
                </div>
                <PredictionPanel
                  goal={experiment.goal}
                  lastPrediction={lastPrediction}
                  pending={pendingPrediction}
                  onSubmit={handlePredictionSubmit}
                />
                <VariableControls
                  parameters={currentParameters}
                  previousParameters={null}
                  spec={experiment.parameterSpecs}
                  oneVariableMode
                  onChange={setCurrentParameters}
                />
                <button
                  type="button"
                  onClick={() => void handleRun()}
                  className="w-full rounded-xl bg-accent-strong px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:brightness-105"
                >
                  Run trial
                </button>
              </div>

              <div className="lg:sticky lg:top-6">
                <SimulationCanvas
                  key="empty"
                  trial={null}
                  stopReason={null}
                  preferences={preferences}
                />
              </div>
            </div>
          </section>
        )}

        {lastTrial && (
          <div className="mt-6 space-y-6">
            <section aria-labelledby="watch-result-heading">
              <div className="mb-4">
                <h2 id="watch-result-heading" className="text-2xl font-semibold">
                  Watch what happened
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Play the animation at your pace. Pause or step through it
                  whenever you need.
                </p>
              </div>
              <SimulationCanvas
                key={lastTrial.id}
                trial={lastTrial}
                stopReason={lastStopReason}
                preferences={preferences}
              />

              <details className="mt-4 rounded-xl border border-border bg-surface">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                  See the result another way
                </summary>
                <div className="border-t border-border p-4">
                  <RepresentationTabs
                    active={activeRepresentation}
                    trial={lastTrial}
                    stopReason={lastStopReason}
                    preferences={preferences}
                    onChange={handleRepresentationChange}
                  />
                </div>
              </details>
            </section>

            {activeProposals.length > 0 && (
              <section aria-labelledby="helpful-change-heading">
                <div className="mb-4">
                  <h2
                    id="helpful-change-heading"
                    className="text-2xl font-semibold"
                  >
                    Try one helpful change
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    UnseenLab noticed something worth comparing. You stay in
                    control: accept it, change it, or skip it.
                  </p>
                </div>
                <AdaptationCard
                  proposals={activeProposals}
                  preferences={preferences}
                  onAccept={(proposal) =>
                    handleProposalDecision(proposal, "accepted")
                  }
                  onReject={(proposal) =>
                    handleProposalDecision(proposal, "rejected")
                  }
                  onModify={(proposal, subset) =>
                    handleProposalDecision(proposal, "modified", subset)
                  }
                />
              </section>
            )}

            <details className="rounded-xl border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-4 text-base font-semibold">
                Compare one change
                <span className="ml-2 text-sm font-normal text-muted">
                  Optional
                </span>
              </summary>
              <div className="border-t border-border p-4">
                <CounterfactualPanel
                  trial={lastTrial}
                  result={counterfactual}
                  spec={experiment.parameterSpecs}
                  onRun={handleCounterfactual}
                />
              </div>
            </details>

            <section
              aria-labelledby="reflect-heading"
              className="rounded-2xl border border-border bg-surface p-4 sm:p-6"
            >
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <h2 id="reflect-heading" className="text-xl font-semibold">
                    What do you think now?
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    Update your prediction only when you are ready. Your first
                    answer is kept so you can see how your thinking changed.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReplay(true)}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-raised"
                  >
                    Adaptation Replay
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResearch((value) => !value)}
                    aria-expanded={showResearch}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-raised"
                  >
                    Research mode
                  </button>
                </div>
              </div>
              <div className="mt-5 max-w-2xl">
                <PredictionPanel
                  goal={experiment.goal}
                  lastPrediction={lastPrediction}
                  pending={pendingPrediction}
                  onSubmit={handlePredictionSubmit}
                />
              </div>
            </section>
          </div>
        )}
      </main>

      {showResearch && lastTrial && (
        <section
          aria-label="Research mode"
          className="border-t border-border bg-surface px-4 py-5 sm:px-6"
        >
          <div className="mx-auto w-full max-w-5xl">
            <ResearchMode
              session={session}
              onClear={handleClearSession}
              preferences={preferences}
            />
          </div>
        </section>
      )}

      {showReplay && (
        <AdaptationReplay
          evidence={session.evidence}
          lastTrial={lastTrial}
          counterfactualResult={counterfactual}
          onClose={() => setShowReplay(false)}
        />
      )}
    </div>
  );
}
