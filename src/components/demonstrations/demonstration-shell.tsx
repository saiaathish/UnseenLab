"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { predictionTruth, type DemoSource, type TrialRecord } from "@/demonstrations/state/demo-store";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { RepresentationMode } from "@/domain/learner";
import type { Readout } from "@/demonstrations/renderers/lumina-2d/types";
import { cn } from "@/lib/utils";

import { TrustBadge } from "./trust-badge";
import { DemonstrationPredictionPanel } from "./prediction-panel";
import { DemonstrationControls } from "./demonstration-controls";
import { DemonstrationRepresentationTabs } from "./representation-tabs";
import { DemonstrationObservationPanel } from "./observation-panel";
import { DemonstrationAdaptationPanel, type AdaptationSuggestion } from "./adaptation-panel";
import { DemonstrationLimitations } from "./demo-limitations";
import { DemoSaveControl } from "./demo-save-control";

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

  // one-variable mode
  oneVariableMode: boolean;
  lockedControl: string | null;
  onOneVariableModeChange: (value: boolean) => void;

  // representations
  activeRepresentation: string;
  onRepresentationChange: (id: string) => void;
  reducedMotion: boolean;
  preferredRepresentations: RepresentationMode[];

  // observations
  observationSelections: Record<string, boolean>;
  observationNotes: string;
  observationsSaved: boolean;
  onObservationToggle: (prompt: string, checked: boolean) => void;
  onObservationNotesChange: (value: string) => void;
  onSaveObservations: () => void;

  // adaptations
  adaptationSuggestions: AdaptationSuggestion[];
  onAdaptationDecision: (suggestion: AdaptationSuggestion, accepted: boolean) => void;

  // trial log + replay
  trials: TrialRecord[];
  replay: { trial: TrialRecord; token: number } | null;
  onReplayTrial: (trial: TrialRecord) => void;
  onDismissReplay: () => void;
}

/**
 * The demo page layout: header (title, trust badge, source badge, save
 * status, back link), central stage with controls, prediction panel
 * (right column on desktop, below the stage on mobile), representation tabs,
 * observation, adaptation, limitations and the trial log. On mobile
 * everything stacks with the stage first — never a crushed three-column
 * layout.
 */
export function DemonstrationShell(props: DemonstrationShellProps) {
  const { spec } = props;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
          >
            ← Back to home
          </Link>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">
            {spec.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-strong">
            {spec.learningObjective}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TrustBadge level={spec.trust.level} />
            <SourceBadge source={props.source} />
          </div>
        </div>
        <div className="shrink-0">
          <DemoSaveControl />
        </div>
      </header>

      {props.replay && (
        <ReplayBanner
          replay={props.replay}
          readouts={props.readouts}
          onDismiss={props.onDismissReplay}
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <DemonstrationRepresentationTabs
            spec={spec}
            activeId={props.activeRepresentation}
            reducedMotion={props.reducedMotion}
            preferredRepresentations={props.preferredRepresentations}
            readouts={props.readouts}
            parameters={props.parameters}
            onRepresentationChange={props.onRepresentationChange}
            stage={{
              spec,
              parameters: props.parameters,
              playing: props.playing,
              speed: props.speed,
              resetSignal: props.resetSignal,
              reducedMotion: props.reducedMotion,
              readouts: props.readouts,
              onReadouts: props.onReadouts,
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

        <aside className="flex min-w-0 flex-col gap-6">
          <DemonstrationPredictionPanel
            prediction={spec.prediction}
            trustLevel={spec.trust.level}
            truth={predictionTruth(spec)}
            submitted={props.predictionSubmitted}
            predictionIndex={props.predictionIndex}
            manipulated={props.manipulated}
            revealed={props.revealed}
            onSubmit={props.onPredictionSubmit}
            onReveal={props.onReveal}
          />
          <DemonstrationObservationPanel
            prompts={spec.observationPrompts}
            selections={props.observationSelections}
            notes={props.observationNotes}
            onToggle={props.onObservationToggle}
            onNotesChange={props.onObservationNotesChange}
            onSave={props.onSaveObservations}
            savedNotice={props.observationsSaved}
          />
          <DemonstrationAdaptationPanel
            suggestions={props.adaptationSuggestions}
            onDecision={props.onAdaptationDecision}
          />
        </aside>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <DemonstrationLimitations spec={spec} />
        <TrialLog
          spec={spec}
          trials={props.trials}
          replay={props.replay}
          onReplayTrial={props.onReplayTrial}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: DemoSource }) {
  const label = source === "model" ? "AI-generated" : "Offline catalog";
  return (
    <span
      aria-label={`Source: ${label}`}
      className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface-raised px-3 py-1 text-sm font-medium text-muted-strong"
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Replay banner — honestly labeled parameter restoration + readout comparison
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
  // the trial log far below; take focus so keyboard users meet the banner
  // (and its Dismiss action) instead of tabbing up blindly.
  const bannerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    bannerRef.current?.focus();
  }, []);

  return (
    <section
      ref={bannerRef}
      tabIndex={-1}
      aria-label={`Replay of trial entry ${trial.trial}`}
      className="mt-6 rounded-xl border border-accent/40 bg-accent-soft/40 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-accent">
            Replay — entry {trial.trial}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-strong">
            Parameters restored from entry {trial.trial}: {paramList || "none"}.
            The simulation restarts fresh with these settings; past simulation
            state (positions, time) is not restored.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-raised"
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
                  <td className="py-2 pr-4 text-muted-strong">{recorded.label}</td>
                  <td className="py-2 pr-4 font-mono">{recorded.value}</td>
                  <td className="py-2 font-mono">
                    {liveByLabel.get(recorded.label) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            “Recorded” values were captured when entry {trial.trial} was saved;
            “Live now” comes from the current run. If the current run has not
            produced readouts yet, live cells show —.
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

// ---------------------------------------------------------------------------
// Trial log
// ---------------------------------------------------------------------------

function entryKind(trial: TrialRecord): "prediction" | "observation" | "adaptation" {
  if (trial.predictionIndex !== null) return "prediction";
  if (trial.adaptations.length > 0) return "adaptation";
  return "observation";
}

function TrialLog({
  spec,
  trials,
  replay,
  onReplayTrial,
}: {
  spec: DemoSpecV1;
  trials: TrialRecord[];
  replay: { trial: TrialRecord; token: number } | null;
  onReplayTrial: (trial: TrialRecord) => void;
}) {
  return (
    <details className="group rounded-xl border border-border bg-surface p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold uppercase tracking-widest text-muted">
        Trial log
        <span aria-hidden="true" className="text-muted group-open:hidden">
          Show ({trials.length})
        </span>
        <span aria-hidden="true" className="hidden text-muted group-open:inline">
          Hide
        </span>
      </summary>

      {trials.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Nothing recorded yet. Submit a prediction to start your trial log.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {trials.map((trial) => {
            const kind = entryKind(trial);
            const isReplaying = replay?.trial.trial === trial.trial;
            return (
              <li
                key={trial.trial}
                className={cn(
                  "rounded-lg border border-border bg-surface-raised p-3",
                  isReplaying && "border-accent"
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    Entry {trial.trial} ·{" "}
                    {kind === "prediction"
                      ? "Prediction"
                      : kind === "adaptation"
                        ? "Adaptation decision"
                        : "Observation"}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(trial.recordedAt).toLocaleTimeString()}
                  </p>
                </div>

                {trial.predictionIndex !== null && (
                  <p className="mt-1 text-sm">
                    Prediction:{" "}
                    <span className="font-medium">
                      {spec.prediction.options[trial.predictionIndex] ?? "Unknown option"}
                    </span>
                  </p>
                )}
                {trial.adaptations.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-strong">
                    {trial.adaptations.map((adaptation) => (
                      <li key={adaptation.suggestion}>
                        {adaptation.accepted ? "Accepted" : "Rejected"}:{" "}
                        {adaptation.suggestion}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-muted">
                  Parameters:{" "}
                  {Object.entries(trial.parameters)
                    .map(([key, value]) => `${key} ${value}`)
                    .join(", ") || "none"}
                </p>
                {trial.readouts.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted">
                    Readouts captured when this entry was saved:{" "}
                    {trial.readouts.map((r) => `${r.label} ${r.value}`).join("; ")}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => onReplayTrial(trial)}
                  className="mt-2 min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Restore these parameters
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}
