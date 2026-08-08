"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { DemoSource, TrialRecord } from "@/demonstrations/state/demo-store";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { RepresentationMode } from "@/domain/learner";
import type {
  EngineVisualState,
  Readout,
} from "@/demonstrations/renderers/lumina-2d/types";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";

import { TrustBadge } from "./trust-badge";
import { AboutThisModel } from "./about-this-model";
import { DemonstrationControls } from "./demonstration-controls";
import { DemonstrationRepresentationTabs } from "./representation-tabs";
import { LessonRail } from "./lesson-rail";
import type { AdaptationSuggestion } from "./adaptation-panel";

export interface DemonstrationShellProps {
  spec: DemoSpecV1;
  source: DemoSource;
  savedToDevice: boolean;
  savedToCloud: boolean;

  // prediction gate
  predictionSubmitted: boolean;
  predictionIndex: number | null;
  manipulated: boolean;
  revealed: boolean;
  onPredictionSubmit: (index: number) => void;
  onReveal: () => void;

  // simulation state
  parameters: Record<string, number>;
  playing: boolean;
  speed: number;
  resetSignal: number;
  readouts: Readout[];
  onReadouts: (readouts: Readout[]) => void;
  onParameterChange: (key: string, value: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (value: number) => void;
  onReset: () => void;
  onControlTouched: (controlId: string) => void;

  // canonical-state coupling (hybrid showcases): the page owns visualState,
  // the hidden 2D engine stage emits it, the 3D stage consumes it.
  onVisualState?: (state: EngineVisualState) => void;
  visualState?: EngineVisualState | null;
  engineMapping?: EngineMapping | null;

  // one-variable mode
  oneVariableMode: boolean;
  lockedControl: string | null;
  onOneVariableModeChange: (value: boolean) => void;

  // representations
  activeRepresentation: string;
  onRepresentationChange: (id: string) => void;
  reducedMotion: boolean;
  preferredRepresentations: RepresentationMode[];

  // observations (absorbed by the lesson rail)
  observationSelections: Record<string, boolean>;
  observationNotes: string;
  observationsSaved: boolean;
  onObservationToggle: (prompt: string, checked: boolean) => void;
  onObservationNotesChange: (value: string) => void;
  onSaveObservations: () => void;

  // adaptations (demoted into the rail's complete step)
  adaptationSuggestions: AdaptationSuggestion[];
  onAdaptationDecision: (
    suggestion: AdaptationSuggestion,
    accepted: boolean
  ) => void;

  // trial log + replay
  trials: TrialRecord[];
  replay: { trial: TrialRecord; token: number } | null;
  onReplayTrial: (trial: TrialRecord) => void;
  onDismissReplay: () => void;

  // canonical interaction surface (graph scenes only): the rail's interact
  // step completes on the referenced node's onNodeManipulate event.
  onNodeSelect?: (nodeId: string | null) => void;
  onNodeManipulate?: (nodeId: string) => void;
  /** Node ids actually manipulated after the prediction was committed. */
  manipulatedNodeIds?: string[];
  /** Control ids actually touched (any interaction with a control). */
  touchedControls?: string[];
}

/**
 * The demo page layout (70/30 workspace): the left column is the model only
 * (representation tabs + stage + a minimal controls strip), the right column
 * is the sequential lesson rail. Product chrome stays deliberately quiet: the
 * phenomenon is the dominant surface, prediction remains the gate, and the
 * rail drives the lesson one step at a time. On mobile the model comes first
 * and the rail stacks below; never a crushed three-column layout. Provenance,
 * save status, limitations, the trial log and adaptation history live behind
 * the ⓘ button (AboutThisModel); the primary workspace shows one trust chip
 * only. Renderer and state contracts are unchanged.
 */
export function DemonstrationShell(props: DemonstrationShellProps) {
  const { spec } = props;

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-10 pt-3 sm:px-5 sm:pt-4">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <Link
          href="/"
          aria-label="← Back to home"
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-medium text-muted-strong transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">Home</span>
        </Link>

        <div className="min-w-0 pt-1 text-center">
          <h1 className="truncate text-xl font-semibold leading-tight sm:text-2xl">
            {spec.title}
          </h1>
          <p className="mx-auto mt-1 max-w-3xl text-sm leading-5 text-muted-strong">
            {spec.learningObjective}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <TrustBadge level={spec.trust.level} />
            <AboutThisModel
              spec={spec}
              source={props.source}
              trials={props.trials}
              onReplayTrial={props.onReplayTrial}
            />
          </div>
        </div>
      </header>

      {props.replay && (
        <ReplayBanner
          replay={props.replay}
          readouts={props.readouts}
          onDismiss={props.onDismissReplay}
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <DemonstrationRepresentationTabs
            spec={spec}
            activeId={props.activeRepresentation}
            reducedMotion={props.reducedMotion}
            preferredRepresentations={props.preferredRepresentations}
            readouts={props.readouts}
            parameters={props.parameters}
            onRepresentationChange={props.onRepresentationChange}
            onNodeSelect={props.onNodeSelect}
            onNodeManipulate={props.onNodeManipulate}
            stage={{
              spec,
              parameters: props.parameters,
              playing: props.playing,
              speed: props.speed,
              resetSignal: props.resetSignal,
              reducedMotion: props.reducedMotion,
              readouts: props.readouts,
              onReadouts: props.onReadouts,
              onVisualState: props.onVisualState,
              visualState: props.visualState ?? null,
              engineMapping: props.engineMapping ?? null,
              onNodeSelect: props.onNodeSelect,
              onNodeManipulate: props.onNodeManipulate,
            }}
          />
          <DemonstrationControls
            spec={spec}
            enabled={props.predictionSubmitted}
            parameters={props.parameters}
            playing={props.playing}
            speed={props.speed}
            oneVariableMode={props.oneVariableMode}
            lockedControl={props.lockedControl}
            onParameterChange={props.onParameterChange}
            onPlayPause={props.onPlayPause}
            onSpeedChange={props.onSpeedChange}
            onReset={props.onReset}
            onControlTouched={props.onControlTouched}
            onOneVariableModeChange={props.onOneVariableModeChange}
          />
        </div>

        <div className="min-w-0">
          <LessonRail
            spec={spec}
            predictionSubmitted={props.predictionSubmitted}
            predictionIndex={props.predictionIndex}
            manipulated={props.manipulated}
            revealed={props.revealed}
            onPredictionSubmit={props.onPredictionSubmit}
            onReveal={props.onReveal}
            manipulatedNodeIds={props.manipulatedNodeIds ?? []}
            touchedControls={props.touchedControls ?? []}
            observationSelections={props.observationSelections}
            observationNotes={props.observationNotes}
            observationsSaved={props.observationsSaved}
            onObservationToggle={props.onObservationToggle}
            onObservationNotesChange={props.onObservationNotesChange}
            onSaveObservations={props.onSaveObservations}
            adaptationSuggestions={props.adaptationSuggestions}
            onAdaptationDecision={props.onAdaptationDecision}
            trials={props.trials}
            onReplayTrial={props.onReplayTrial}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Replay banner: honestly labeled parameter restoration + readout comparison
// ---------------------------------------------------------------------------

function ReplayBanner({
  replay,
  readouts,
  onDismiss,
}: {
  replay: { trial: TrialRecord; token: number };
  readouts: Readout[];
  onDismiss: () => void;
}) {
  const { trial } = replay;
  const paramList = Object.entries(trial.parameters)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
  const liveByLabel = new Map(readouts.map((r) => [r.label, r.value]));

  // The banner is inserted at the top of the page while the trigger lives in
  // the lesson rail or the AboutThisModel trial log; take focus so keyboard
  // users meet the banner (and its Dismiss action) instead of tabbing up
  // blindly.
  const bannerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    bannerRef.current?.focus();
  }, []);

  return (
    <section
      ref={bannerRef}
      tabIndex={-1}
      aria-label={`Replay of trial entry ${trial.trial}`}
      className="mt-4 rounded-2xl border border-accent/35 bg-accent-soft/35 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-accent">
            Replay entry {trial.trial}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Parameters restored from entry {trial.trial}: {paramList || "none"}.
            The simulation restarts fresh with these settings; past simulation
            state (positions, time) is not restored.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-raised"
        >
          Dismiss replay
        </button>
      </div>

      {trial.readouts.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="pb-2 text-left text-sm font-medium">
              Readout comparison
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Readout
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Recorded in entry {trial.trial}
                </th>
                <th scope="col" className="py-2 font-medium">
                  Live now
                </th>
              </tr>
            </thead>
            <tbody>
              {trial.readouts.map((recorded) => (
                <tr key={recorded.label} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 text-muted">{recorded.label}</td>
                  <td className="py-2 pr-4 font-mono">{recorded.value}</td>
                  <td className="py-2 font-mono">
                    {liveByLabel.get(recorded.label) ?? "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Recorded values were captured when entry {trial.trial} was saved;
            live values come from the current run. If the current run has not
            produced readouts yet, live cells show n/a.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No numeric readouts were recorded for this entry.
        </p>
      )}
    </section>
  );
}
