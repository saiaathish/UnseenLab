"use client";

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
} from "@/domain/evidence";import {
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

/**
 * Orchestrates one lab: prediction -> trial -> adaptation -> counterfactual ->
 * replay. All evidence lives in the local anonymous session; nothing is sent
 * anywhere. The deterministic adaptation provider runs offline.
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

  // Honor both the operating-system reduced-motion preference and the in-app
  // override: either one switches the app to static rendering.
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
            .filter((p) => p.trialId === lastTrial.id)
            .at(-1) ?? null
        : null,
    [lastTrial, session.evidence.predictions],
  );

  const lastOpenedMode = useMemo(
    () => session.evidence.representationEvents.at(-1)?.mode ?? null,
    [session.evidence.representationEvents],
  );

  const updatePreferences = useCallback(
    (updates: Partial<LearnerPreferences>) => {
      setSession((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, ...updates },
      }));
    },
    [],
  );

  const handlePredictionSubmit = useCallback(
    (answer: string, structuredAnswer: PredictionAnswerChoice | null, confidence: number) => {
      if (lastTrial) {
        // Updated prediction after a trial: record it immediately against the
        // trial that just ran.
        const record: PredictionRecord = {
          id: crypto.randomUUID(),
          trialId: lastTrial.id,
          prompt: experiment.goal,
          answer,
          structuredAnswer,
          confidence,
          createdAt: new Date().toISOString(),
        };
        setSession((prev) => ({
          ...prev,
          evidence: addPrediction(prev.evidence, record),
        }));
      } else {
        // Pre-run prediction: hold it as pending; the record is created when
        // the trial runs, linked to the trial's id.
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
      setNotice(
        "A prediction is required before running a trial. Please submit your prediction first.",
      );
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

    // Build the next evidence snapshot synchronously, then ask the
    // deterministic adaptation provider to interpret it.
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

    setSession((prev) => ({ ...prev, evidence: nextEvidence }));
    setLastTrial(trial);
    setLastStopReason(result.stopReason);
    setPendingPrediction(null);
    setCounterfactual(null);
    setActiveProposals(proposals);
    setActiveRepresentation("animation");
    setNotice(
      adaptationFailed
        ? "Adaptation suggestions are temporarily unavailable. Your trial still ran normally."
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
        if (proposal.type === "show_causal_view")
          setActiveRepresentation("causal");
      }
      setSession((prev) => ({
        ...prev,
        evidence: updateAdaptationProposal(prev.evidence, decided),
      }));
      setActiveProposals((prev) => prev.filter((p) => p.id !== proposal.id));
      setNotice(null);
    },
    [preferences, updatePreferences],
  );

  const handleRepresentationChange = useCallback(
    (mode: RepresentationMode) => {
      setActiveRepresentation(mode);
      if (mode !== lastOpenedMode) {
        setSession((prev) => ({
          ...prev,
          evidence: addRepresentationEvent(prev.evidence, {
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
        setNotice("Run a trial first before using the counterfactual comparison.");
        return;
      }
      const result = runCounterfactual(lastTrial, variable, value);
      setCounterfactual(result);
      setSession((prev) => ({
        ...prev,
        evidence: addTrial(prev.evidence, result.counterfactual),
      }));
      setNotice(null);
    },
    [lastTrial],
  );

  const handleClearSession = useCallback(() => {
    const session = loadLocalSession();
    setSession(session);
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
      className="flex flex-1 flex-col"
    >
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {experiment.title}
            </h1>
            <p className="text-sm text-muted">{experiment.goal}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {simulationDisclaimer}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              aria-expanded={showSettings}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised"
            >
              Accessibility &amp; display
            </button>
            <button
              type="button"
              onClick={() => setShowReplay(true)}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised"
            >
              Adaptation Replay
            </button>
            <button
              type="button"
              onClick={() => setShowResearch((v) => !v)}
              aria-expanded={showResearch}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised"
            >
              Research mode
            </button>
          </div>
        </div>
      </header>

      {showSettings && (
        <div className="border-b border-border bg-surface px-4 py-4 sm:px-6">
          <div className="mx-auto w-full max-w-7xl">
            <AccessibilityControls
              preferences={preferences}
              onChange={updatePreferences}
            />
          </div>
        </div>
      )}

      {notice && (
        <div
          role="alert"
          className="border-b border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn sm:px-6"
        >
          {notice}
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            <PredictionPanel
              goal={experiment.goal}
              lastPrediction={lastPrediction}
              pending={pendingPrediction}
              onSubmit={handlePredictionSubmit}
            />
            <VariableControls
              parameters={currentParameters}
              previousParameters={lastTrial?.parameters ?? null}
              spec={experiment.parameterSpecs}
              oneVariableMode={preferences.oneVariableMode}
              onChange={setCurrentParameters}
            />
            <div className="rounded-xl border border-border bg-surface p-4">
              <button
                type="button"
                onClick={() => void handleRun()}
                className="w-full rounded-lg bg-accent-strong px-4 py-3 text-base font-semibold text-white hover:brightness-110"
              >
                Run trial
              </button>
              <p className="mt-2 text-xs leading-5 text-muted">
                Runs the seeded simulation with the variables above. A
                prediction is required first.
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <SimulationCanvas
              key={lastTrial?.id ?? "empty"}
              trial={lastTrial}
              stopReason={lastStopReason}
              preferences={preferences}
            />
            <RepresentationTabs
              active={activeRepresentation}
              trial={lastTrial}
              stopReason={lastStopReason}
              preferences={preferences}
              onChange={handleRepresentationChange}
            />
          </div>

          <div className="flex flex-col gap-4">
            <AdaptationCard
              proposals={activeProposals}
              preferences={preferences}
              onAccept={(p) => handleProposalDecision(p, "accepted")}
              onReject={(p) => handleProposalDecision(p, "rejected")}
              onModify={(p, subset) => handleProposalDecision(p, "modified", subset)}
            />
            <CounterfactualPanel
              trial={lastTrial}
              result={counterfactual}
              spec={experiment.parameterSpecs}
              onRun={handleCounterfactual}
            />
          </div>
        </div>
      </main>

      {showResearch && (
        <section
          aria-label="Research mode"
          className="border-t border-border bg-surface px-4 py-4 sm:px-6"
        >
          <div className="mx-auto w-full max-w-7xl">
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
