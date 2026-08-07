"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  demoStore,
  type DemoSession,
  type TrialRecord,
} from "@/demonstrations/state/demo-store";
import { validateDemoSpec } from "@/demonstrations/validation";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type {
  EngineVisualState,
  Readout,
} from "@/demonstrations/renderers/lumina-2d/types";
import { engineMappingForSpec } from "@/demonstrations/showcases/coupling";
import { loadLocalSession } from "@/storage/session-storage";

import { DemonstrationShell } from "./demonstration-shell";
import {
  deriveAdaptationSuggestions,
  type AdaptationSuggestion,
} from "./adaptation-panel";
import { orderedRepresentations } from "./representation-tabs";

type BootState = "loading" | "missing" | "ready";

/**
 * Client page assembly. Owns the demo session lifecycle:
 *  1. reads demoStore.getSession() (subscribed),
 *  2. falls back to loadFromDevice(params id),
 *  3. otherwise redirects home with a notice,
 * and wires the trial log (demoStore.getTrials) + replay (restoring
 * parameter state from a past entry: honestly labeled, never claiming to
 * restore simulation state).
 */
export function DemonstrationPage({ demoId }: { demoId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(() =>
    demoStore.getSession()
  );
  const [boot, setBoot] = useState<BootState>(() =>
    demoStore.getSession() ? "ready" : "loading"
  );

  useEffect(
    () => demoStore.subscribe(() => setSession(demoStore.getSession())),
    []
  );

  useEffect(() => {
    if (boot !== "loading") return;
    let cancelled = false;
    (async () => {
      // A successful load emits through the store, so the subscription below
      // updates the session; only the failure path needs a state transition.
      const loaded = demoStore.loadFromDevice(demoId);
      if (loaded) return;
      // Second browser / fresh device: a signed-in learner's account copy is
      // the fallback (GET /api/demonstrations/<id>, owner-scoped server-side).
      // Guests have no account: the 401 restores nothing and the page falls
      // through to "missing".
      const restored = await demoStore.loadFromCloud(demoId);
      if (cancelled) return;
      if (!restored) {
        window.setTimeout(() => setBoot("missing"), 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boot, demoId]);

  // Derived: a device load that succeeded never sets boot itself.
  const effectiveBoot: BootState =
    boot === "loading" && session ? "ready" : boot;

  useEffect(() => {
    if (effectiveBoot !== "missing") return;
    const timer = window.setTimeout(() => router.replace("/"), 1500);
    return () => window.clearTimeout(timer);
  }, [effectiveBoot, router]);

  if (effectiveBoot === "missing") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">No demonstration found</h1>
        <p className="mt-2 text-sm text-muted">
          This demonstration is not on this device. Taking you back home…
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Go home
        </Link>
      </main>
    );
  }

  if (effectiveBoot === "loading" || !session) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-sm text-muted">Looking for your demonstration…</p>
      </main>
    );
  }

  return <DemoExperience session={session} />;
}

// ---------------------------------------------------------------------------
// The live experience (mounted only once the session is real)
// ---------------------------------------------------------------------------

function DemoExperience({ session }: { session: DemoSession }) {
  const spec = useValidatedSpec(session);
  if (!spec) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Demonstration unavailable</h1>
        <p className="mt-2 text-sm text-muted">
          This demonstration could not be verified and cannot be shown.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Go home
        </Link>
      </main>
    );
  }
  return <DemoExperienceReady session={session} spec={spec} />;
}

function useValidatedSpec(session: DemoSession): DemoSpecV1 | null {
  // Defense-in-depth: re-validate on the client before rendering anything.
  return useMemo(() => {
    const outcome = validateDemoSpec(JSON.stringify(session.spec));
    if (outcome.status !== "valid" && outcome.status !== "repaired") {
      return null;
    }
    return outcome.spec ?? null;
  }, [session]);
}

function useReducedMotionPref(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

function DemoExperienceReady({
  session,
  spec,
}: {
  session: DemoSession;
  spec: DemoSpecV1;
}) {
  const osReducedMotion = useReducedMotionPref();
  // Stored learner preferences (settings page): text scale, high contrast,
  // motion and representation choices. Never inferred from a diagnosis.
  const preferences = useMemo(() => loadLocalSession().preferences, []);
  // Motion is reduced when the OS asks for it OR the learner chose it.
  const reducedMotion = osReducedMotion || preferences.reducedMotion;

  // Document-level preference effects, mirroring the lab shell: the global
  // CSS reduced-motion kill-switch, the high-contrast token palette, and
  // rem-based text scale on the root. All removed on unmount so settings
  // never leak into other pages (they compose with browser zoom).
  useEffect(() => {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : undefined;
    const apply = () => {
      document.body.classList.toggle("high-contrast", preferences.highContrast);
      document.documentElement.setAttribute(
        "data-reduced-motion",
        String((media?.matches ?? false) || preferences.reducedMotion)
      );
    };
    apply();
    media?.addEventListener("change", apply);
    return () => {
      media?.removeEventListener("change", apply);
      document.body.classList.remove("high-contrast");
      document.documentElement.removeAttribute("data-reduced-motion");
    };
  }, [preferences.highContrast, preferences.reducedMotion]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${preferences.textScale * 100}%`;
    return () => {
      root.style.fontSize = "";
    };
  }, [preferences.textScale]);

  const paramDefaults = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of spec.simulation?.parameters ?? []) out[p.key] = p.value;
    return out;
  }, [spec]);

  const [parameters, setParameters] = useState<Record<string, number>>(paramDefaults);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [resetSignal, setResetSignal] = useState(0);
  const [readouts, setReadouts] = useState<Readout[]>([]);

  // Canonical engine visual state (hybrid showcases): the hidden 2D engine
  // stage emits it via onVisualState; the 3D stage consumes it together with
  // the curated engine mapping, so the 3D picture always reads exactly the
  // state the readouts and 2D view come from.
  const [visualState, setVisualState] = useState<EngineVisualState | null>(null);
  const engineMapping = useMemo(() => engineMappingForSpec(spec), [spec]);

  const [predictionIndex, setPredictionIndex] = useState<number | null>(null);
  const [manipulated, setManipulated] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const [oneVariableMode, setOneVariableMode] = useState(
    () => preferences.oneVariableMode && spec.adaptationContext.oneVariableMode
  );
  const [lockedControl, setLockedControl] = useState<string | null>(null);

  const orderedReps = useMemo(
    () =>
      orderedRepresentations(spec, reducedMotion, preferences.preferredRepresentations),
    [spec, reducedMotion, preferences.preferredRepresentations]
  );
  const [activeRepresentation, setActiveRepresentation] = useState<string | null>(
    null
  );
  const activeRepresentationId = activeRepresentation ?? orderedReps[0]?.id ?? "";

  const [observationSelections, setObservationSelections] = useState<
    Record<string, boolean>
  >({});
  const [observationNotes, setObservationNotes] = useState("");
  const [observationsSaved, setObservationsSaved] = useState(false);

  const [adaptationDecisions, setAdaptationDecisions] = useState<
    Record<string, boolean>
  >({});
  const [replay, setReplay] = useState<{ trial: TrialRecord; token: number } | null>(
    null
  );

  const trials = demoStore.getTrials();

  // -- prediction gate -------------------------------------------------------

  const handlePredictionSubmit = (index: number) => {
    setPredictionIndex(index);
    demoStore.recordTrial({
      predictionIndex: index,
      parameters: { ...parameters },
      readouts: readouts.map((r) => ({ label: r.label, value: r.value })),
      controls: { playing, speed },
      adaptations: [],
    });
  };

  const handleReveal = () => setRevealed(true);

  // -- simulation state ------------------------------------------------------

  const handleParameterChange = (key: string, value: number) => {
    setParameters((prev) => ({ ...prev, [key]: value }));
  };

  const handleControlTouched = (controlId: string) => {
    setManipulated(true);
    setLockedControl(controlId);
    setTouchedControls((prev) =>
      prev.includes(controlId) ? prev : [...prev, controlId]
    );
  };

  // -- canonical interaction surface (graph scenes) ---------------------------
  // The rail's interact step completes when the referenced node is actually
  // manipulated. Manipulations before the prediction is committed are not
  // recorded: a learner clicking around during the predict step must still
  // perform the interact step's real interaction after committing.
  const [manipulatedNodeIds, setManipulatedNodeIds] = useState<string[]>([]);
  const [touchedControls, setTouchedControls] = useState<string[]>([]);

  const handleNodeManipulate = (nodeId: string) => {
    if (predictionIndex === null) return;
    setManipulatedNodeIds((prev) =>
      prev.includes(nodeId) ? prev : [...prev, nodeId]
    );
  };

  // -- observations ----------------------------------------------------------

  const handleSaveObservations = () => {
    setObservationsSaved(true);
    demoStore.recordTrial({
      predictionIndex: null,
      parameters: { ...parameters },
      readouts: readouts.map((r) => ({ label: r.label, value: r.value })),
      controls: { playing, speed },
      adaptations: [],
    });
  };

  // -- adaptations -----------------------------------------------------------

  const suggestions = useMemo(
    () =>
      deriveAdaptationSuggestions(spec, {
        activeRepresentation: activeRepresentationId,
        oneVariableMode,
        parameters,
      }),
    [spec, activeRepresentationId, oneVariableMode, parameters]
  );
  const visibleSuggestions = suggestions.filter(
    (s) => adaptationDecisions[s.id] === undefined
  );

  const applyAdaptation = (suggestion: AdaptationSuggestion) => {
    const action = suggestion.action;
    if (action.kind === "set_parameter") {
      setParameters((prev) => ({ ...prev, [action.key]: action.value }));
    } else if (action.kind === "switch_representation") {
      setActiveRepresentation(action.representationId);
    } else if (action.kind === "enable_one_variable_mode") {
      setOneVariableMode(true);
    }
  };

  const handleAdaptationDecision = (
    suggestion: AdaptationSuggestion,
    accepted: boolean
  ) => {
    setAdaptationDecisions((prev) => ({ ...prev, [suggestion.id]: accepted }));
    demoStore.recordTrial({
      predictionIndex: null,
      parameters: { ...parameters },
      readouts: readouts.map((r) => ({ label: r.label, value: r.value })),
      controls: { playing, speed },
      adaptations: [{ suggestion: suggestion.text, accepted }],
    });
    if (accepted) applyAdaptation(suggestion);
  };

  // -- replay ----------------------------------------------------------------

  const handleReplayTrial = (trial: TrialRecord) => {
    setParameters({ ...trial.parameters });
    setResetSignal((n) => n + 1);
    setReplay({ trial, token: Date.now() });
  };

  const handleDismissReplay = () => setReplay(null);

  // -- shell -----------------------------------------------------------------

  return (
    <DemonstrationShell
      spec={spec}
      source={session.source}
      savedToDevice={session.savedToDevice}
      savedToCloud={session.savedToCloud}
      predictionSubmitted={predictionIndex !== null}
      predictionIndex={predictionIndex}
      manipulated={manipulated}
      revealed={revealed}
      onPredictionSubmit={handlePredictionSubmit}
      onReveal={handleReveal}
      parameters={parameters}
      playing={playing}
      speed={speed}
      resetSignal={resetSignal}
      readouts={readouts}
      onReadouts={setReadouts}
      onVisualState={setVisualState}
      visualState={visualState}
      engineMapping={engineMapping}
      onParameterChange={handleParameterChange}
      onPlayPause={() => setPlaying((p) => !p)}
      onSpeedChange={setSpeed}
      onReset={() => setResetSignal((n) => n + 1)}
      onControlTouched={handleControlTouched}
      oneVariableMode={oneVariableMode}
      lockedControl={lockedControl}
      onOneVariableModeChange={setOneVariableMode}
      activeRepresentation={activeRepresentationId}
      onRepresentationChange={setActiveRepresentation}
      reducedMotion={reducedMotion}
      preferredRepresentations={preferences.preferredRepresentations}
      observationSelections={observationSelections}
      observationNotes={observationNotes}
      observationsSaved={observationsSaved}
      onObservationToggle={(prompt, checked) =>
        setObservationSelections((prev) => ({ ...prev, [prompt]: checked }))
      }
      onObservationNotesChange={setObservationNotes}
      onSaveObservations={handleSaveObservations}
      adaptationSuggestions={predictionIndex !== null ? visibleSuggestions : []}
      onAdaptationDecision={handleAdaptationDecision}
      trials={trials}
      replay={replay}
      onReplayTrial={handleReplayTrial}
      onDismissReplay={handleDismissReplay}
      onNodeManipulate={handleNodeManipulate}
      manipulatedNodeIds={manipulatedNodeIds}
      touchedControls={touchedControls}
    />
  );
}
