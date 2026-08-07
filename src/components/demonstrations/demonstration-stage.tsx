"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SimRunner } from "@/demonstrations/renderers/lumina-2d/runner";
import type {
  EngineVisualState,
  Readout,
} from "@/demonstrations/renderers/lumina-2d/types";
import { PrimitiveSceneRenderer } from "@/demonstrations/renderers/primitive-3d";
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
  /**
   * Interaction event surface (graph-like scenes only — conceptual templates
   * rendered as canonical graphs). The PrimitiveSceneRenderer fires these on
   * selection-state changes; the shell/page (A2) forwards them to the lesson
   * rail. All optional: without them the stage renders and behaves exactly as
   * before.
   *
   * - onNodeSelect(nodeId | null): a node was selected (pointer click or
   *   Enter/Space on the focused node) or the selection cleared.
   * - onEdgeSelect(edgeId | null): an edge was selected (pointer click) or
   *   the selection cleared.
   * - onNodeManipulate(nodeId): a node was actually interacted with (pointer
   *   click or keyboard activation) — the rail's interaction-step completion
   *   keys off this.
   */
  onNodeSelect?: (nodeId: string | null) => void;
  onEdgeSelect?: (edgeId: string | null) => void;
  onNodeManipulate?: (nodeId: string) => void;
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
  onNodeSelect,
  onEdgeSelect,
  onNodeManipulate,
}: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PrimitiveSceneRenderer | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [startError, setStartError] = useState(false);
  const [mobile] = useState(
    () =>
      typeof window !== "undefined" && window.innerWidth < 768
  );
  // Keep the latest interaction callbacks without recreating the renderer
  // (same pattern as onReadoutsRef/onVisualStateRef below).
  const onNodeSelectRef = useRef(onNodeSelect);
  const onEdgeSelectRef = useRef(onEdgeSelect);
  const onNodeManipulateRef = useRef(onNodeManipulate);
  useEffect(() => {
    onNodeSelectRef.current = onNodeSelect;
    onEdgeSelectRef.current = onEdgeSelect;
    onNodeManipulateRef.current = onNodeManipulate;
  });

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
        onNodeSelect: (nodeId) => onNodeSelectRef.current?.(nodeId),
        onEdgeSelect: (edgeId) => onEdgeSelectRef.current?.(edgeId),
        onNodeManipulate: (nodeId) => onNodeManipulateRef.current?.(nodeId),
      });
      renderer.setSpec(spec, { engineMapping: engineMapping ?? null });
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
        onNodeSelect={onNodeSelect}
        onNodeManipulate={onNodeManipulate}
      />
    );
  }

  return (
    <div>
      <p className="sr-only">
        Interactive stage: {spec.title}. {spec.learningObjective}
      </p>
      <div
        className="w-full overflow-hidden rounded-xl border border-border bg-surface"
        style={{ aspectRatio: `${spec.renderer.preferredAspectRatio}` }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`${spec.title} 3D stage canvas`}
          className="block h-full w-full"
        />
      </div>
      <ReadoutDisplay readouts={readouts} />
    </div>
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
  onNodeSelect,
  onNodeManipulate,
}: {
  spec: DemoSpecV1;
  note: string;
  readouts: Readout[];
  parameters: Record<string, number>;
  onNodeSelect?: (nodeId: string | null) => void;
  onNodeManipulate?: (nodeId: string) => void;
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
          onNodeSelect={onNodeSelect}
          onNodeManipulate={onNodeManipulate}
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
