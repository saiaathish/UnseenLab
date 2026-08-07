"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { SimRunner } from "@/demonstrations/renderers/lumina-2d/runner";
import type {
  EngineVisualState,
  Readout,
} from "@/demonstrations/renderers/lumina-2d/types";
import { PrimitiveSceneRenderer } from "@/demonstrations/renderers/primitive-3d";
import {
  presentationSpecForStage,
  stageGuideForSpec,
  type StageGuide,
} from "@/demonstrations/renderers/primitive-3d/presentation";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

import { AccessibleRepresentation } from "./accessible-representation";

export interface StageProps {
  spec: DemoSpecV1;
  parameters: Record<string, number>;
  playing: boolean;
  speed: number;
  /** Bump to re-seed the running simulation with the current parameters. */
  resetSignal: number;
  reducedMotion: boolean;
  readouts: Readout[];
  onReadouts: (readouts: Readout[]) => void;
  /**
   * Canonical engine visual state, lifted from the (possibly hidden) 2D
   * engine stage to the page, which forwards it to the 3D stage so the 3D
   * picture always reads the same state as the readouts.
   */
  onVisualState?: (state: EngineVisualState) => void;
  /** Latest canonical engine state for the 3D stage (null → operator-driven). */
  visualState?: EngineVisualState | null;
  /** Scene-object → engine-body coupling for hybrid showcases. */
  engineMapping?: EngineMapping | null;
  /**
   * Which surface a hybrid spec should show. "2d" renders the verified
   * lumina-2d engine (SimRunner) — the source of truth for readouts; "3d"
   * renders the approved-primitive Three.js stage. Defaults by renderer.kind:
   * lumina_2d → "2d", primitive_3d/hybrid → "3d".
   */
  mode?: "2d" | "3d";
}

/**
 * The stage. Renders by spec.renderer.kind and the requested mode:
 *  - lumina_2d (or mode "2d")  → canvas owned by a SimRunner (spec.simulation)
 *  - primitive_3d/hybrid (or mode "3d") → canvas owned by the
 *    PrimitiveSceneRenderer
 *
 * For hybrid showcase specs the shell keeps a hidden mode="2d" engine stage
 * mounted as the readout driver, so the readout table stays live while the
 * learner watches the 3D view.
 *
 * The Lumina runner exposes no serialize/restore, so parameter state stays in
 * the shell: parameter changes are pushed with setParam, and a reset re-seeds
 * via runner.reset() then re-applies the current parameters. The stage never
 * claims to restore past simulation state — a reset is always a fresh start.
 *
 * The nuclear_chain_reaction engine is deliberately NOT in the Lumina
 * registry; a spec that names it gets an informative card pointing at the
 * verified lab instead of an empty canvas.
 *
 * Every stage carries a screen-reader summary, and when the engine or WebGL
 * is unavailable it falls back to the accessible representation with an
 * honest note.
 */
export function DemonstrationStage(props: StageProps) {
  const { spec, mode } = props;
  const engineId = spec.simulation?.engineId ?? spec.trust.engineId;

  if (engineId === "nuclear_chain_reaction") {
    return <NuclearChainReactionCard />;
  }

  if (spec.renderer.kind === "lumina_2d" || mode === "2d") {
    return <Lumina2DStage {...props} />;
  }
  return <Primitive3DStage {...props} />;
}

// ---------------------------------------------------------------------------
// Nuclear chain reaction — verified home
// ---------------------------------------------------------------------------

function NuclearChainReactionCard() {
  return (
    <section
      aria-label="Nuclear chain reaction lab"
      className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-border bg-surface p-6 text-center"
    >
      <p className="text-lg font-medium">
        The Nuclear Chain Reaction lab is the verified home for this topic
      </p>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">
        The chain-reaction engine runs in the dedicated lab with its own
        prediction, trial and replay workflow. Open it there instead.
      </p>
      <Link
        href="/lab/nuclear-chain-reaction"
        className="mt-4 rounded-lg bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Open the Nuclear Chain Reaction lab
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Lumina 2D
// ---------------------------------------------------------------------------

function Lumina2DStage({
  spec,
  parameters,
  playing,
  speed,
  resetSignal,
  readouts,
  onReadouts,
  onVisualState,
}: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runnerRef = useRef<SimRunner | null>(null);
  const [startError, setStartError] = useState(false);
  const onReadoutsRef = useRef(onReadouts);
  const onVisualStateRef = useRef(onVisualState);
  // Keep the latest callbacks for the runner without recreating it; runs
  // before the runner-creation effect on mount so the first emission lands.
  useEffect(() => {
    onReadoutsRef.current = onReadouts;
    onVisualStateRef.current = onVisualState;
  });

  const simulation = spec.simulation;
  const paramsAtMountRef = useRef(parameters);

  useEffect(() => {
    if (!simulation) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let runner: SimRunner | null = null;
    try {
      runner = new SimRunner(canvas);
      runner.onReadouts = (r) => onReadoutsRef.current(r);
      runner.onVisualState = (s) => onVisualStateRef.current?.(s);
      runner.setScene({
        engineId: simulation.engineId,
        parameters: paramsAtMountRef.current,
        seed: simulation.seed,
      });
      runnerRef.current = runner;
    } catch {
      runner?.dispose();
      runnerRef.current = null;
      // Deferred so the error state update is not synchronous in the effect.
      window.setTimeout(() => setStartError(true), 0);
    }
    return () => {
      runnerRef.current = null;
      runner?.dispose();
    };
    // The runner is created once per engine; later parameter changes flow
    // through setParam, never through setScene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, simulation?.engineId]);

  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    for (const [key, value] of Object.entries(parameters)) {
      runner.setParam(key, value);
    }
  }, [parameters]);

  useEffect(() => {
    runnerRef.current?.setPlaying(playing);
  }, [playing]);

  useEffect(() => {
    runnerRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    if (resetSignal === 0) return;
    const runner = runnerRef.current;
    if (!runner) return;
    runner.reset();
    for (const [key, value] of Object.entries(parameters)) {
      runner.setParam(key, value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  if (startError || !simulation) {
    return (
      <StageFallback
        spec={spec}
        note="This simulation could not be started in this environment. The accessible representation is shown instead."
        readouts={readouts}
        parameters={parameters}
      />
    );
  }

  return (
    <div>
      <p className="sr-only">
        Interactive stage: {spec.title}. {spec.learningObjective}
      </p>
      <div
        className="w-full overflow-hidden rounded-xl border border-border bg-[#0b0f13]"
        style={{ aspectRatio: `${spec.renderer.preferredAspectRatio}` }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`${spec.title} simulation canvas`}
          className="block h-full w-full"
        />
      </div>
      <ReadoutDisplay readouts={readouts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitive 3D / hybrid
// ---------------------------------------------------------------------------

function Primitive3DStage({
  spec,
  playing,
  speed,
  reducedMotion,
  readouts,
  parameters,
  visualState,
  engineMapping,
}: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PrimitiveSceneRenderer | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [startError, setStartError] = useState(false);
  const [mobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  const presentationSpec = useMemo(() => presentationSpecForStage(spec), [spec]);
  const guide = useMemo(() => stageGuideForSpec(spec), [spec]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: PrimitiveSceneRenderer | null = null;
    try {
      renderer = new PrimitiveSceneRenderer(canvas, {
        reducedMotion,
        mobile,
        onError: (err) => {
          if (err.reason === "webgl_unavailable") {
            setWebglUnavailable(true);
          }
        },
      });
      renderer.setSpec(presentationSpec, { engineMapping: engineMapping ?? null });
      rendererRef.current = renderer;
    } catch {
      renderer?.dispose();
      rendererRef.current = null;
      // Deferred so the error state update is not synchronous in the effect.
      window.setTimeout(() => setStartError(true), 0);
    }
    return () => {
      rendererRef.current = null;
      renderer?.dispose();
    };
    // The mapping is derived from the spec (stable); when it changes the
    // renderer is rebuilt with the new coupling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, engineMapping]);

  // Apply the canonical engine state on change only. A ref of the last
  // applied (stringified) state avoids re-applying identical emissions every
  // ~66 ms from the engine loop; the renderer stays in sync with the latest
  // state without redundant setEngineState calls.
  const lastAppliedRef = useRef<{ specId: string; json: string } | null>(null);
  useEffect(() => {
    const renderer = rendererRef.current;
    const json = JSON.stringify(visualState ?? null);
    const last = lastAppliedRef.current;
    if (last && last.specId === spec.id && last.json === json) return;
    lastAppliedRef.current = { specId: spec.id, json };
    renderer?.setEngineState(visualState ?? null);
  }, [visualState, engineMapping, spec.id]);

  useEffect(() => {
    rendererRef.current?.setPlaying(playing);
  }, [playing]);

  useEffect(() => {
    rendererRef.current?.setSpeed(speed);
  }, [speed]);

  if (webglUnavailable || startError) {
    return (
      <StageFallback
        spec={spec}
        note={
          webglUnavailable
            ? "WebGL is not available here, so the 3D stage cannot run. The accessible representation is shown instead."
            : "This 3D stage could not be started in this environment. The accessible representation is shown instead."
        }
        readouts={readouts}
        parameters={parameters}
      />
    );
  }

  const conceptual = spec.trust.level === "conceptual_demonstration";

  return (
    <div>
      <p className="sr-only" id={`stage-help-${spec.id}`}>
        Interactive stage: {spec.title}. {spec.learningObjective}
        {!reducedMotion
          ? " Drag to rotate the model and use the mouse wheel or trackpad to zoom."
          : " Motion is reduced; use the Diagram or Guided steps representation for a static explanation."}
      </p>
      <div
        className="relative w-full overflow-hidden rounded-xl border border-border bg-[#080d16] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        style={{ aspectRatio: `${spec.renderer.preferredAspectRatio}` }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`${spec.title} 3D stage canvas`}
          aria-describedby={`stage-help-${spec.id}`}
          className="block h-full w-full cursor-grab active:cursor-grabbing"
        />

        {conceptual ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 to-transparent"
            />

            <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2 sm:left-4 sm:top-4">
              <span className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
                Interactive model
              </span>
              {guide.relationships.length > 0 ? (
                <span className="hidden rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-white/65 backdrop-blur-sm sm:inline-flex">
                  {guide.relationships.length} visible relationship
                  {guide.relationships.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            <div className="absolute right-3 top-3 flex items-center gap-2 sm:right-4 sm:top-4">
              <span className="pointer-events-none hidden rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-white/65 backdrop-blur-sm md:inline-flex">
                {reducedMotion ? "Static view" : "Drag to rotate · Scroll to zoom"}
              </span>
              {!reducedMotion ? (
                <button
                  type="button"
                  onClick={() => rendererRef.current?.resetView()}
                  className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  Reset view
                </button>
              ) : null}
            </div>

            <EntityLegend guide={guide} />
          </>
        ) : null}
      </div>

      {conceptual ? <RelationshipGuide guide={guide} /> : null}
      <ReadoutDisplay readouts={readouts} />
    </div>
  );
}

function EntityLegend({ guide }: { guide: StageGuide }) {
  if (guide.entities.length === 0) return null;
  return (
    <div
      aria-label="Model entities"
      className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5 sm:inset-x-4 sm:bottom-4"
    >
      {guide.entities.map((entity) => (
        <span
          key={entity.id}
          className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-sm"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full ring-1 ring-white/25"
            style={{ backgroundColor: entity.color }}
          />
          {entity.label}
        </span>
      ))}
    </div>
  );
}

function RelationshipGuide({ guide }: { guide: StageGuide }) {
  if (guide.relationships.length === 0) return null;
  return (
    <section
      aria-label="Model relationships"
      className="mt-3 rounded-lg border border-border bg-surface-raised/70 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs leading-5">
        <span className="font-semibold uppercase tracking-[0.14em] text-muted">
          Relationships
        </span>
        {guide.relationships.map((relationship) => (
          <span
            key={relationship.id}
            className="rounded-md bg-surface px-2 py-1 text-foreground"
          >
            {relationship.from}{" "}
            <span className="font-medium text-accent-strong">
              {relationship.label}
            </span>{" "}
            {relationship.to}
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared fallback + readout display
// ---------------------------------------------------------------------------

function StageFallback({
  spec,
  note,
  readouts,
  parameters,
}: {
  spec: DemoSpecV1;
  note: string;
  readouts: Readout[];
  parameters: Record<string, number>;
}) {
  return (
    <section
      aria-label="Accessible representation"
      className="rounded-xl border border-border bg-surface p-4"
    >
      {/* role=status announces the canvas → fallback transition once, when
          the fallback mounts. The text is also the visible note. */}
      <p
        role="status"
        className="rounded-lg bg-info/10 px-3 py-2 text-sm leading-6 text-info"
      >
        {note}
      </p>
      <div className="mt-4">
        <AccessibleRepresentation
          spec={spec}
          kind={spec.renderer.fallbackKind}
          readouts={readouts}
          parameters={parameters}
        />
      </div>
    </section>
  );
}

function ReadoutDisplay({ readouts }: { readouts: Readout[] }) {
  if (readouts.length === 0) return null;
  return (
    <div
      aria-label="Live readouts"
      className="mt-3 grid gap-2 sm:grid-cols-2"
    >
      {readouts.map((readout, index) => (
        <div
          key={`${readout.label}-${index}`}
          className="rounded-lg border border-border bg-surface-raised px-3 py-2"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            {readout.label}
          </p>
          <p className="mt-0.5 font-mono text-sm">{readout.value}</p>
        </div>
      ))}
    </div>
  );
}
