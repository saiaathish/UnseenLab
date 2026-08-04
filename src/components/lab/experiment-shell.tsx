"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ExperimentDefinition,
  ExperimentParameters,
  TrialRecord,
  SimulationStopReason,
} from "@/domain/experiments";
import { deriveStopReason, simulationDisclaimer } from "@/domain/experiments";
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
  addCounterfactual,
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
  clearLocalSession,
  createLocalSession,
  getLocalSessionId,
  loadLocalSession,
  rotateLocalSessionId,
  saveLocalSession,
  setLocalSessionId,
  type LocalSession,
} from "@/storage/session-storage";
import { useSession } from "@/lib/supabase/use-session";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import {
  profileToLearnerPreferences,
  preferenceSummary,
} from "@/personalization/profile-to-learner-preferences";
import type { LearnerPreferencesRow } from "@/lib/supabase/types";
import { CloudSessionRepository } from "@/sync/cloud-session-repository";
import { useCloudSessionSync } from "@/sync/use-cloud-session-sync";
import {
  hasGuestEvidence,
  isSessionImported,
} from "@/sync/guest-session-import";
import { CloudSyncStatus } from "@/components/sync/cloud-sync-status";
import { GuestImportDialog } from "@/components/sync/guest-import-dialog";
import { SessionResumeDialog } from "@/components/sync/session-resume-dialog";
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

/** What the learner is waiting on while a trial runs. */
type RunPhase = "idle" | "simulating" | "interpreting";

/**
 * Orchestrates one lab through a calm, progressive workflow. Only the controls
 * needed for the learner's current step are shown; optional research and
 * accessibility tools remain available without competing with the experiment.
 *
 * The loop is repeatable: predict -> change one variable -> run -> understand
 * -> update prediction -> run another trial. Every trial is appended to the
 * recorded evidence; completed trials are never overwritten.
 */
export function ExperimentShell({
  experiment,
}: {
  experiment: ExperimentDefinition;
}) {
  // All persisted state starts EMPTY so the server-rendered HTML and the first
  // client render always agree (a reload with retained evidence must not
  // cause a hydration mismatch). The latest valid workflow stage is restored
  // atomically after mount — never showing an empty initial state while
  // evidence says trials exist, and never fabricating one.
  const [session, setSession] = useState<LocalSession>(() =>
    createLocalSession(),
  );
  const [currentParameters, setCurrentParameters] =
    useState<ExperimentParameters>(() => ({
      ...experiment.defaultParameters,
    }));
  const [lastTrial, setLastTrial] = useState<TrialRecord | null>(null);
  const [lastStopReason, setLastStopReason] =
    useState<SimulationStopReason | null>(null);
  const [activeProposals, setActiveProposals] = useState<AdaptationProposal[]>(
    [],
  );
  const [counterfactual, setCounterfactual] =
    useState<CounterfactualResult | null>(null);
  const [activeRepresentation, setActiveRepresentation] =
    useState<RepresentationMode>("animation");
  const [counterfactualOpen, setCounterfactualOpen] = useState(false);
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [showReplay, setShowReplay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const reflectSectionRef = useRef<HTMLElement | null>(null);
  const [importRequested, setImportRequested] = useState(false);

  // Optional account layer: the lab stays fully usable signed out.
  const { user, loading: sessionLoading } = useSession();
  const { status: syncStatus, flush: flushSync } = useCloudSessionSync(
    session,
    user,
    experiment.title
  );
  const [profilePrefs, setProfilePrefs] =
    useState<LearnerPreferencesRow | null>(null);
  const cloudPrefsApplied = useRef(false);
  const localPrefsChanged = useRef(false);

  const preferences = session.preferences;
  // The pending prediction lives inside the persisted workflow, so a reload
  // mid-experiment restores the exact guided step.
  const pendingPrediction = session.workflow.pendingPrediction;

  // Restore AFTER hydration (declared before the save effect). The restore is
  // deferred out of the effect body so the hydration render is identical to
  // the server render; the save effect skips its very first run so it can
  // never clobber persisted evidence with the empty hydration session.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = loadLocalSession();
      const latest = restored.evidence.trials.at(-1) ?? null;
      setSession(restored);
      setLastTrial(latest);
      setLastStopReason(deriveStopReason(latest));
      setCurrentParameters({
        ...(latest?.parameters ?? experiment.defaultParameters),
      });
      setActiveProposals(
        latest
          ? restored.evidence.adaptationProposals.filter(
              (proposal) =>
                proposal.decision === "pending" &&
                proposal.evidenceIds.includes(latest.id),
            )
          : [],
      );
      setCounterfactual(() => {
        if (!latest) return null;
        const record = restored.evidence.counterfactuals
          .filter((item) => item.originalTrialId === latest.id)
          .at(-1);
        return record
          ? {
              original: record.original,
              counterfactual: record.counterfactual,
              changedVariable: record.changedVariable,
            }
          : null;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [experiment.defaultParameters]);

  // The very first render is the empty hydration session — never persist it
  // over retained evidence before the restore effect has run.
  const skipInitialSave = useRef(true);
  useEffect(() => {
    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      return;
    }
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
    return () => {
      media?.removeEventListener("change", apply);
      // Leave the page as we found it: contrast and motion are per-page
      // settings, so they must not leak into the dashboard or settings.
      document.body.classList.remove("high-contrast");
      document.documentElement.removeAttribute("data-reduced-motion");
    };
  }, [preferences.highContrast, preferences.reducedMotion]);

  // Text size is applied to the root element so rem-based Tailwind classes
  // actually scale (a wrapper font-size has no effect on rem units). It is
  // removed on unmount so it never leaks into other pages, and it composes
  // with browser zoom instead of fighting it.
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${preferences.textScale * 100}%`;
    return () => {
      root.style.fontSize = "";
    };
  }, [preferences.textScale]);

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

  const nextTrialNumber = (lastTrial ? session.evidence.trials.length : 0) + 1;
  const currentStep = pendingPrediction ? 2 : lastTrial ? 3 : 1;

  const updatePreferences = useCallback(
    (updates: Partial<LearnerPreferences>) => {
      localPrefsChanged.current = true;
      setSession((previous) => ({
        ...previous,
        preferences: { ...previous.preferences, ...updates },
      }));
    },
    [],
  );

  // Cloud preferences are fetched once per visit and merged through the
  // canonical mapper before the learner starts — unless they have already
  // adjusted something locally, in which case the local session wins. The
  // preferred representation also selects the initial lab view.
  const applyCloudPreferences = useCallback(async () => {
    const client = getBrowserClient();
    if (!user || !client || cloudPrefsApplied.current) return;
    cloudPrefsApplied.current = true;
    try {
      const { data } = await client
        .from("learner_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return;
      if (localPrefsChanged.current) return;
      setProfilePrefs(data);
      setSession((previous) => ({
        ...previous,
        preferences: profileToLearnerPreferences(data),
      }));
      // Preferred representation selects the initial lab view, but only
      // before the learner has opened any representation themselves.
      if (session.evidence.representationEvents.length === 0) {
        setActiveRepresentation(data.preferred_representation);
      }
    } catch {
      // Cloud unavailable: defaults stay; nothing crashes.
    }
  }, [user, session.evidence.representationEvents.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => void applyCloudPreferences(), 0);
    return () => window.clearTimeout(timer);
  }, [applyCloudPreferences]);

  /**
   * Submitting a prediction always feeds the NEXT trial. On the first trial it
   * creates a pending prediction; on later trials it is the updated prediction
   * that must exist before another trial can run. Updating an existing pending
   * prediction keeps the same trial id, so duplicates are impossible.
   */
  const handlePredictionSubmit = useCallback(
    (
      answer: string,
      structuredAnswer: PredictionAnswerChoice | null,
      confidence: number,
    ) => {
      setSession((previous) => {
        const pending = previous.workflow.pendingPrediction;
        return {
          ...previous,
          workflow: {
            pendingPrediction: pending
              ? { ...pending, answer, structuredAnswer, confidence }
              : {
                  trialId: crypto.randomUUID(),
                  answer,
                  structuredAnswer,
                  confidence,
                },
          },
        };
      });
      setNotice(null);
    },
    [],
  );

  const handleRun = useCallback(async () => {
    if (runPhase !== "idle") return;
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

    // First-trial changes are computed against the actual default parameters;
    // later trials against the previous real trial. Replay and the LLM payload
    // therefore always receive truthful change evidence.
    const baseline = lastTrial?.parameters ?? experiment.defaultParameters;
    const changedVariables = diffParameters(baseline, currentParameters);

    setRunPhase("simulating");
    // Let the "Running the simulation…" status paint before the synchronous
    // engine runs and the (possibly slow) AI interpretation starts.
    await new Promise((resolve) => setTimeout(resolve, 0));

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
    setRunPhase("interpreting");
    try {
      proposals = await adaptationProvider.propose(input);
      for (const proposal of proposals) {
        nextEvidence = addAdaptationProposal(nextEvidence, proposal);
      }
    } catch {
      proposals = [];
      adaptationFailed = true;
    }

    setSession((previous) => ({
      ...previous,
      evidence: nextEvidence,
      workflow: { pendingPrediction: null },
    }));
    setLastTrial(trial);
    setLastStopReason(result.stopReason);
    setCounterfactual(null);
    setCounterfactualOpen(false);
    setActiveProposals(proposals);
    setActiveRepresentation("animation");
    setRunPhase("idle");
    setNotice(
      adaptationFailed
        ? "Something went wrong while preparing suggestions — your experiment ran normally."
        : null,
    );
  }, [
    currentParameters,
    experiment.defaultParameters,
    experiment.goal,
    lastTrial,
    pendingPrediction,
    preferences,
    runPhase,
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
        // Every allowed intervention must lead somewhere visible: comparing
        // trials opens the one-change comparison tool, and asking for a new
        // prediction moves focus to the reflection panel.
        if (proposal.type === "compare_trials") {
          setCounterfactualOpen(true);
        }
        if (proposal.type === "ask_prediction_again") {
          reflectSectionRef.current?.focus();
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
        evidence: addCounterfactual(previous.evidence, {
          originalTrialId: lastTrial.id,
          changedVariable: variable,
          original: result.original,
          counterfactual: result.counterfactual,
          createdAt: new Date().toISOString(),
        }),
      }));
      setNotice(null);
    },
    [lastTrial],
  );

  const handleClearSession = useCallback(async () => {
    // "Start over" closes the previous session on the cloud (when signed in)
    // and rotates the local session id so a fresh session can never overwrite
    // an imported one. The pending debounced save is flushed FIRST so
    // markComplete can never race an in-flight upsert back to "active".
    const hadTrials = session.evidence.trials.length > 0;
    if (hadTrials && user) {
      await flushSync();
      const client = getBrowserClient();
      if (client) {
        const repo = new CloudSessionRepository(client, user.id);
        void repo.markComplete(getLocalSessionId()).catch(() => {
          // Cloud unavailable: the local session remains the source of truth.
        });
      }
    }
    rotateLocalSessionId();
    clearLocalSession();
    localPrefsChanged.current = false;
    cloudPrefsApplied.current = false;
    const freshSession = loadLocalSession();
    setSession(freshSession);
    setCurrentParameters({ ...experiment.defaultParameters });
    setLastTrial(null);
    setLastStopReason(null);
    setActiveProposals([]);
    setCounterfactual(null);
    setCounterfactualOpen(false);
    setActiveRepresentation("animation");
    setNotice(null);
    void applyCloudPreferences();
  }, [
    experiment.defaultParameters,
    session.evidence.trials.length,
    user,
    flushSync,
    applyCloudPreferences,
  ]);

  const handleResume = useCallback(
    (restored: LocalSession, cloudId: string) => {
      // Adopt the cloud row id so later saves continue the same row instead
      // of forking a duplicate; keep saved preferences applied.
      setLocalSessionId(cloudId);
      const withPrefs = profilePrefs
        ? { ...restored, preferences: profileToLearnerPreferences(profilePrefs) }
        : restored;
      setSession(withPrefs);
      const latest = withPrefs.evidence.trials.at(-1) ?? null;
      setLastTrial(latest);
      setLastStopReason(deriveStopReason(latest));
      setCurrentParameters({
        ...(latest?.parameters ?? experiment.defaultParameters),
      });
      setActiveProposals(
        latest
          ? withPrefs.evidence.adaptationProposals.filter(
              (proposal) =>
                proposal.decision === "pending" &&
                proposal.evidenceIds.includes(latest.id),
            )
          : [],
      );
      setCounterfactual(null);
      setCounterfactualOpen(false);
      setActiveRepresentation("animation");
      setNotice(null);
    },
    [experiment.defaultParameters, profilePrefs],
  );

  const handleNewSession = useCallback(() => {
    // The empty local session stays as-is; nothing is clobbered.
  }, []);

  return (
    <>
      <div
        inert={showReplay ? true : undefined}
        className="flex min-h-screen flex-col"
      >
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start gap-3 px-4 py-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="text-sm font-medium text-accent hover:underline"
            >
              ← Home
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

        {!sessionLoading && (
          <div className="border-t border-border bg-background/70">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {profilePrefs ? (
                  <>
                    <span className="text-xs text-muted">
                      Using your saved learning preferences
                    </span>
                    <span
                      aria-label="Saved learning preferences"
                      className="hidden text-xs text-muted/90 md:inline"
                    >
                      {preferenceSummary(profilePrefs).join(" · ")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSettings(true)}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      Adjust for this session
                    </button>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {user &&
                hasGuestEvidence(session) &&
                !isSessionImported(getLocalSessionId()) ? (
                  <button
                    type="button"
                    onClick={() => setImportRequested(true)}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    Save this session to your account
                  </button>
                ) : null}
                {!user && (
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(new Event("unseenlab:open-auth"))
                    }
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Sign in to save progress across devices.
                  </button>
                )}
                <CloudSyncStatus
                  status={syncStatus}
                  signedIn={Boolean(user)}
                />
              </div>
            </div>
          </div>
        )}
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
            <p className="mt-3 text-xs text-muted">
              Changes apply to this session and won&apos;t update your saved
              preferences.
            </p>
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

        {pendingPrediction && (
          <section className="mt-6">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {lastTrial
                      ? `Trial ${nextTrialNumber} — run another trial`
                      : "Change one thing"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {lastTrial
                      ? `Adjust one control, then run it. Trial ${
                          nextTrialNumber - 1
                        } stays on record so you can compare. You can always
                        start over.`
                      : "Adjust a control, then run the experiment. You can always start over."}
                  </p>
                </div>
                <PredictionPanel
                  goal={experiment.goal}
                  lastPrediction={lastPrediction}
                  pending={pendingPrediction}
                  disabled={runPhase !== "idle"}
                  onSubmit={handlePredictionSubmit}
                />
                <VariableControls
                  parameters={currentParameters}
                  previousParameters={lastTrial?.parameters ?? null}
                  spec={experiment.parameterSpecs}
                  oneVariableMode={preferences.oneVariableMode}
                  onChange={setCurrentParameters}
                />
                <button
                  type="button"
                  onClick={() => void handleRun()}
                  disabled={runPhase !== "idle"}
                  className="w-full rounded-xl bg-accent-strong px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Run trial
                </button>
                {runPhase !== "idle" && (
                  <p
                    role="status"
                    className="rounded-lg bg-surface-raised px-3 py-2 text-sm text-foreground"
                  >
                    {runPhase === "simulating"
                      ? "Running the simulation…"
                      : "Interpreting your evidence…"}
                  </p>
                )}
              </div>

              <div className="lg:sticky lg:top-6">
                <SimulationCanvas
                  key={lastTrial?.id ?? "empty"}
                  trial={lastTrial}
                  stopReason={lastStopReason}
                  preferences={preferences}
                />
              </div>
            </div>
          </section>
        )}

        {lastTrial && !pendingPrediction && (
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
                    explanationStyle={profilePrefs?.explanation_style}
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

            <details
              className="rounded-xl border border-border bg-surface"
              open={counterfactualOpen}
              onToggle={(event) =>
                setCounterfactualOpen(
                  (event.target as HTMLDetailsElement).open,
                )
              }
            >
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
              ref={reflectSectionRef}
              tabIndex={-1}
              aria-labelledby="reflect-heading"
              className="rounded-2xl border border-border bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-focus sm:p-6"
            >
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <h2 id="reflect-heading" className="text-xl font-semibold">
                    Ready for another trial?
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    Update your prediction, then change one variable and run
                    the next trial. Your completed trials stay on record so you
                    can compare how your thinking changed.
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
                  <button
                    type="button"
                    onClick={handleClearSession}
                    className="rounded-lg border border-danger/50 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
                  >
                    Start over
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

      {showResearch && lastTrial && !pendingPrediction && (
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
      </div>

      {showReplay && (
        <AdaptationReplay
          evidence={session.evidence}
          lastTrial={lastTrial}
          counterfactualResult={counterfactual}
          onClose={() => setShowReplay(false)}
        />
      )}

      {user &&
        !sessionLoading &&
        session.evidence.trials.length === 0 &&
        !pendingPrediction && (
          <Suspense fallback={null}>
            <SessionResumeDialog
              user={user}
              onResume={handleResume}
              onNewSession={handleNewSession}
            />
          </Suspense>
        )}
      <GuestImportDialog
        user={user}
        session={session}
        title={experiment.title}
        requestOpen={importRequested}
        onRequestHandled={() => setImportRequested(false)}
      />
    </>
  );
}
