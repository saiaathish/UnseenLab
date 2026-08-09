"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

import { SimRunner } from "@/demonstrations/renderers/lumina-2d/runner";
import type {
  EngineVisualState,
  Readout,
} from "@/demonstrations/renderers/lumina-2d/types";
import { MAX_SIM_TIME } from "@/demonstrations/renderers/lumina-2d/engines/newton-second-law";
import { PrimitiveSceneRenderer } from "@/demonstrations/renderers/primitive-3d";
import {
  presentationSpecForStage,
  stageGuideForSpec,
  type StageGuide,
} from "@/demonstrations/renderers/primitive-3d/presentation";
import {
  resolveGraphEdgeContent,
  TooltipController,
  type TooltipContent,
} from "@/demonstrations/renderers/primitive-3d/presentation/tooltip-controller";
import { ProjectedLabelOverlay } from "@/demonstrations/renderers/primitive-3d/presentation/projected-overlay";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";
import type { DemoSpecV1, PrimitiveObjectSpec } from "@/demonstrations/spec/demo-spec";

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
  reducedMotion,
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
  // Wave 3 (FIX 17): Newton's semantic identity layer — the 2D stage's
  // DOM-over-canvas surface is fed by the engine's own canonical visual state
  // (scalarBodies) at the existing ~15 Hz visual-state cadence, never
  // per-frame. Everything below is gated on this engine id, so every other
  // lumina-2d stage renders exactly as before.
  const isNewton = simulation?.engineId === "newton_second_law";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<TooltipController | null>(null);
  /** Latest canonical engine state (15 Hz) — null until the first emission. */
  const [engineState, setEngineState] = useState<EngineVisualState | null>(null);
  /** Measured canvas box in CSS px (the engine draw space maps 1:1 to it). */
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  /** Hover/tap identity region — React state only on CHANGES. */
  const [hoverRegionId, setHoverRegionId] = useState<NewtonRegionId | null>(null);
  const engineStateRef = useRef(engineState);
  const stageSizeRef = useRef(stageSize);
  useEffect(() => {
    engineStateRef.current = engineState;
    stageSizeRef.current = stageSize;
  });

  useEffect(() => {
    if (!simulation) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let runner: SimRunner | null = null;
    try {
      runner = new SimRunner(canvas);
      runner.onReadouts = (r) => onReadoutsRef.current(r);
      runner.onVisualState = (s) => {
        onVisualStateRef.current?.(s);
        // Newton's identity layer consumes the same canonical state at the
        // same 15 Hz cadence (bounded, never per-frame).
        if (isNewton) setEngineState(s);
      };
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

  // Measure the canvas box so the overlay can mirror the engine's draw-space
  // layout (the canvas fills this wrapper; the runner sizes it from the same
  // parent rect). Fires only on actual size changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        const cr = entry?.contentRect;
        if (cr && cr.width > 0 && cr.height > 0) {
          setStageSize({ width: cr.width, height: cr.height });
        } else {
          measure();
        }
      });
      ro.observe(container);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Hover/tap identity: pointer over the block or a vector region resolves to
  // a name + one-line description (FIX 17 — the 3D stage's identity surface
  // generalized to Newton). Hit-testing is pure math over the engine's layout,
  // done here on the wrapper so the overlay itself never intercepts pointers.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isNewton) return;
    const resolve = (clientX: number, clientY: number): NewtonRegionId | null => {
      const state = engineStateRef.current;
      const size = stageSizeRef.current;
      const body = state?.scalarBodies?.block;
      if (!body || !size) return null;
      const rect = container.getBoundingClientRect();
      return newtonRegionAt(body, size.width, size.height, clientX - rect.left, clientY - rect.top);
    };
    const onMove = (e: PointerEvent) => setHoverRegionId(resolve(e.clientX, e.clientY));
    const onDown = (e: PointerEvent) => setHoverRegionId(resolve(e.clientX, e.clientY));
    const onLeave = () => setHoverRegionId(null);
    container.addEventListener("pointermove", onMove, { passive: true });
    container.addEventListener("pointerdown", onDown, { passive: true });
    container.addEventListener("pointerleave", onLeave);
    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("pointerleave", onLeave);
    };
  }, [isNewton]);

  // Tooltip (FIX 4 pattern, canvas-2D-anchored): one role="tooltip" per stage
  // container, resolved from the region's canonical name + one sentence and
  // anchored at the region's canvas position.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isNewton) return;
    const controller = new TooltipController(container, {
      reducedMotion,
      resolveContent: (id) => newtonRegionContent(id),
      anchorFor: (id) => {
        const state = engineStateRef.current;
        const size = stageSizeRef.current;
        const body = state?.scalarBodies?.block;
        if (!body || !size) return null;
        const anchors = newtonLayout(body, size.width, size.height).anchors;
        // Unknown ids resolve to no anchor (null) — same membership guard
        // newtonRegionContent applies to content.
        return anchors[id as keyof typeof anchors] ?? null;
      },
    });
    tooltipRef.current = controller;
    return () => {
      tooltipRef.current = null;
      controller.dispose();
    };
  }, [isNewton, reducedMotion]);

  useEffect(() => {
    const controller = tooltipRef.current;
    if (!controller) return;
    if (hoverRegionId) {
      controller.show(hoverRegionId);
    } else {
      controller.hide();
    }
  }, [hoverRegionId]);

  // Keep the tooltip anchored while the pointer moves (cheap imperative
  // reposition — never React state, never per-frame).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onPointerMove = () => tooltipRef.current?.reposition();
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => container.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    for (const [key, value] of Object.entries(parameters)) {
      runner.setParam(key, value);
    }
  }, [parameters]);

  useEffect(() => {
    // P2-3 (reduced-motion Play): under reduced motion the runner NEVER runs
    // continuous motion — even when the page hands it playing=true (the same
    // gate the 3D renderer applies, P7). Without this the hidden engine keeps
    // stepping and its visual-state pushes move the coupled 3D body with no
    // trail — the spec's "stage stays still" promise breaks.
    runnerRef.current?.setPlaying(reducedMotion ? false : playing);
  }, [playing, reducedMotion]);

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

  const body = engineState?.scalarBodies?.block ?? null;
  const hasLayout = body !== null && stageSize !== null;

  return (
    <div>
      <p className="sr-only">
        Interactive stage: {spec.title}. {spec.learningObjective}
      </p>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-[#0b0f13]"
        style={{ aspectRatio: `${spec.renderer.preferredAspectRatio}` }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`${spec.title} simulation canvas`}
          className="block h-full w-full"
        />

        {isNewton && hasLayout ? (
          <NewtonIdentityOverlay
            body={body}
            width={stageSize.width}
            height={stageSize.height}
          />
        ) : null}
      </div>

      {/* Keyboard-accessible identity surface (FIX 17): the same names as the
          overlay labels — focusable without a tab trap, Enter/Space pins the
          details card. aria-hidden overlay stays out of the SR tree. */}
      {isNewton && body ? (
        <>
          <NewtonObjectList activeId={hoverRegionId} onActivate={setHoverRegionId} />
          {hoverRegionId ? (
            <NewtonDetailsCard regionId={hoverRegionId} body={body} />
          ) : null}
        </>
      ) : null}
      <ReadoutDisplay readouts={readouts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Newton identity layer (Wave 3, FIX 17 — root-cause seam 5 generalized to
// the pure-2D engine). The block and vector regions, their persistent labels
// and the details card are ALL derived from the engine's canonical visual
// state (scalarBodies — the closure's real position/velocity/acceleration/
// force/mass) and the engine's own draw-space layout, mirrored below so the
// DOM overlay can never disagree with the canvas. The engine canvas itself is
// untouched — this is a DOM-over-canvas layer only.
// ---------------------------------------------------------------------------

/** One scalar body as emitted by the newton engine's getVisualState(). */
export interface NewtonScalarBody {
  position: number;
  velocity: number;
  acceleration: number;
  force: number;
  mass: number;
}

export const NEWTON_REGION_IDS = [
  "block",
  "force",
  "velocity",
  "acceleration",
] as const;

export type NewtonRegionId = (typeof NEWTON_REGION_IDS)[number];

interface NewtonRegionMeta {
  name: string;
  type: string;
  description: string;
}

/** Canonical identity: hover object/vector → Mass / Applied force / Velocity
 * / Acceleration (the engine draws no acceleration vector — the label region
 * is its identity anchor). The same names feed the overlay labels, the
 * tooltip, the keyboard list and the details card. */
export const NEWTON_REGIONS: Record<NewtonRegionId, NewtonRegionMeta> = {
  block: {
    name: "Mass m",
    type: "Block",
    description:
      "The pushed block — its mass m sets how much a given applied force accelerates it (a = F/m).",
  },
  force: {
    name: "Applied force F",
    type: "Force vector",
    description: "The constant horizontal push acting on the block.",
  },
  velocity: {
    name: "Velocity v",
    type: "Velocity vector",
    description: "How fast the block is moving right now.",
  },
  acceleration: {
    name: "Acceleration a",
    type: "Kinematic quantity",
    description:
      "How quickly the block speeds up — a = F/m, constant while the force and mass stay fixed.",
  },
};

export interface NewtonLayout {
  /** Block rect in canvas CSS px (mirrors draw(): rounded rect at
   * (bx, by, blockW, blockW·0.9)). */
  block: { x: number; y: number; w: number; h: number };
  /** Applied-force arrow segment (mirrors draw(): from the block's right
   * edge, length 24 + (F/50)·90, at block vertical center). */
  force: { x: number; y: number; w: number; h: number };
  /** Velocity arrow segment (mirrors draw(): from the block's horizontal
   * center, below the track, length min(140, 10 + v·6)). */
  velocity: { x: number; y: number; w: number; h: number };
  /** Acceleration identity region — the persistent label anchor above the
   * block (the engine draws no 'a' vector; the label is the anchor). */
  acceleration: { x: number; y: number; w: number; h: number };
  /** Label anchor points (CSS px, label centers). */
  anchors: Record<NewtonRegionId, { x: number; y: number }>;
}

function clampNum(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * Mirrors the engine's draw() position mapping (newton-second-law.ts) exactly:
 * pad = min(W,H)·0.08, track at H·0.62, block width max(34, W·0.05), position
 * fraction clamped over maxTravel = max(1, F/m·MAX_SIM_TIME²/2), force arrow
 * length ∝ F, velocity arrow length clamped ∝ v. The engine draw space maps
 * 1:1 to canvas CSS px, so the DOM overlay anchors land on the canvas.
 */
export function newtonLayout(
  body: NewtonScalarBody,
  width: number,
  height: number
): NewtonLayout {
  const pad = Math.min(width, height) * 0.08;
  const trackY = height * 0.62;
  const x0 = pad;
  const x1 = width - pad;
  const trackLen = Math.max(1, width - pad * 2);
  const blockW = Math.max(34, width * 0.05);
  const maxTravel = Math.max(
    1,
    (body.force / body.mass) * MAX_SIM_TIME * MAX_SIM_TIME * 0.5
  );
  const frac = clampNum(body.position / maxTravel, 0, 1);
  const bx = x0 + frac * (trackLen - blockW);
  const by = trackY - blockW * 0.55;
  const block = { x: bx, y: by, w: blockW, h: blockW * 0.9 };

  const arrowLen = 24 + (body.force / 50) * 90;
  const vLen = Math.min(140, 10 + body.velocity * 6);
  const force = { x: bx + blockW + 4, y: by + blockW / 2 - 8, w: arrowLen, h: 16 };
  const velocity = {
    x: bx + blockW / 2,
    y: trackY + 22 - 8,
    w: Math.max(24, vLen),
    h: 16,
  };
  // The 'Acceleration a' label floats above the block; its region is the
  // label's nominal footprint so a pointer can hit it.
  const acceleration = { x: bx + blockW / 2 - 60, y: by - 34 - 8, w: 120, h: 16 };

  const clampX = (x: number) => clampNum(x, pad, x1);
  return {
    block,
    force,
    velocity,
    acceleration,
    anchors: {
      block: { x: bx + blockW / 2, y: by + blockW * 0.45 },
      force: { x: clampX(bx + blockW + 4 + arrowLen / 2), y: by + blockW / 2 - 32 },
      velocity: { x: clampX(bx + blockW / 2 + vLen / 2), y: trackY + 60 },
      acceleration: { x: clampX(bx + blockW / 2), y: by - 34 },
    },
  };
}

function hitTest(
  region: { x: number; y: number; w: number; h: number },
  x: number,
  y: number
): boolean {
  return x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h;
}

/**
 * Region hit-testing in the engine's draw space (canvas CSS px) — the same
 * layout the overlay labels are anchored at. Block first (it is the largest
 * surface), then the two arrows, then the acceleration label region.
 */
export function newtonRegionAt(
  body: NewtonScalarBody,
  width: number,
  height: number,
  x: number,
  y: number
): NewtonRegionId | null {
  const layout = newtonLayout(body, width, height);
  if (hitTest(layout.block, x, y)) return "block";
  if (hitTest(layout.force, x, y)) return "force";
  if (hitTest(layout.velocity, x, y)) return "velocity";
  if (hitTest(layout.acceleration, x, y)) return "acceleration";
  return null;
}

/** Tooltip content: canonical NAME + one learner-facing sentence (FIX 4
 * pattern). */
function newtonRegionContent(regionId: string): TooltipContent | null {
  const meta = NEWTON_REGIONS[regionId as NewtonRegionId];
  if (!meta) return null;
  return { name: meta.name, sentence: meta.description };
}

/** The details card's live readouts — Mass / Applied force / Acceleration,
 * formatted in the engine's units and fed from the canonical state at the
 * existing 15 Hz visual-state cadence (never per-frame). */
function newtonScalarReadouts(body: NewtonScalarBody): Array<{ label: string; value: string }> {
  return [
    { label: "Mass", value: `${body.mass.toFixed(1)} kg` },
    { label: "Applied force", value: `${body.force.toFixed(1)} N` },
    { label: "Acceleration", value: `${body.acceleration.toFixed(2)} m/s²` },
  ];
}

/** Persistent labels, positioned over the canvas at the engine's own layout
 * anchors. aria-hidden — the keyboard list + details card carry the same
 * names for assistive tech. Pointer-events-none: hover hit-testing happens on
 * the wrapper, never here. */
function NewtonIdentityOverlay({
  body,
  width,
  height,
}: {
  body: NewtonScalarBody;
  width: number;
  height: number;
}) {
  const layout = newtonLayout(body, width, height);
  const labelStyle = (anchor: { x: number; y: number }, color: string): CSSProperties => ({
    left: `${anchor.x}px`,
    top: `${anchor.y}px`,
    color,
  });
  const pill =
    "whitespace-nowrap rounded border border-white/10 bg-black/45 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-[2px]";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Block identity: the engine leaves the block face blank; the DOM 'm'
          matches the in-canvas F/v glyph convention. */}
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 text-[12px] font-semibold text-white"
        style={labelStyle(layout.anchors.block, "#ffffff")}
      >
        m
      </span>
      <span
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${pill}`}
        style={labelStyle(layout.anchors.force, "#5eead4")}
      >
        Applied force F
      </span>
      <span
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${pill}`}
        style={labelStyle(layout.anchors.velocity, "rgba(255,255,255,0.92)")}
      >
        Velocity v
      </span>
      <span
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${pill}`}
        style={labelStyle(layout.anchors.acceleration, "#a78bfa")}
      >
        Acceleration a
      </span>
    </div>
  );
}

/** Keyboard surface (FIX 17): the same region names as the overlay labels, in
 * a focusable role=list — Enter/Space pins the details card. No tab trap, no
 * live region (the lesson rail owns announcements). */
function NewtonObjectList({
  activeId,
  onActivate,
}: {
  activeId: NewtonRegionId | null;
  onActivate: (id: NewtonRegionId) => void;
}) {
  return (
    <ul
      role="list"
      tabIndex={0}
      aria-label="Model objects"
      className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-raised/50 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {NEWTON_REGION_IDS.map((id) => {
        const region = NEWTON_REGIONS[id];
        return (
          <li
            key={id}
            role="listitem"
            tabIndex={0}
            aria-label={region.name}
            aria-current={activeId === id ? "true" : undefined}
            onClick={() => onActivate(id)}
            onKeyDown={(event: KeyboardEvent<HTMLLIElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate(id);
              }
            }}
            className="cursor-pointer rounded-full border border-border/70 bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {region.name}
          </li>
        );
      })}
    </ul>
  );
}

/** FIX 17 details surface: compact — the selected identity's name, type, one
 * line, plus the Mass / Applied force / Acceleration live readouts from the
 * canonical engine state at the 15 Hz visual-state cadence. */
function NewtonDetailsCard({
  regionId,
  body,
}: {
  regionId: NewtonRegionId;
  body: NewtonScalarBody;
}) {
  const region = NEWTON_REGIONS[regionId];
  const rows = newtonScalarReadouts(body);
  return (
    <section
      aria-label={`Details: ${region.name}`}
      className="mt-2 rounded-lg border border-border bg-surface-raised/70 px-3 py-2.5"
    >
      <p className="text-sm font-semibold">{region.name}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-muted">
        {region.type}
      </p>
      <p className="mt-0.5 text-xs leading-5 text-muted">{region.description}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {rows.map((row) => (
          <span key={row.label}>
            <span className="font-semibold uppercase tracking-widest text-muted">
              {row.label}
            </span>{" "}
            <span className="font-mono">{row.value}</span>
          </span>
        ))}
      </div>
    </section>
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PrimitiveSceneRenderer | null>(null);
  const tooltipRef = useRef<TooltipController | null>(null);
  /** Host for the persistent DOM label overlay (W4, root-cause seam 5) —
   * a sibling of the canvas inside the stage container; the overlay instance
   * owns the layer div and cleans it up on dispose. */
  const overlayHostRef = useRef<HTMLDivElement | null>(null);
  const labelOverlayRef = useRef<ProjectedLabelOverlay | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [startError, setStartError] = useState(false);
  // FIX 4/FIX 14 hover identity: React state only on hover CHANGES (hover is
  // low-rate by nature — no per-frame state); the tooltip controller does the
  // per-pointer positioning imperatively. Wave 3 (FIX 17/18) adds the graph
  // EDGE hover surface on the same change-only contract.
  const [hoverIdentityId, setHoverIdentityId] = useState<string | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [mobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
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
  const presentationSpec = useMemo(() => presentationSpecForStage(spec), [spec]);
  const guide = useMemo(() => stageGuideForSpec(spec), [spec]);
  // W6 semantic surface (FIX 5/FIX 15, orbit-learning L10): the scene's
  // learner-facing objects — the same identity-pickable kinds and primary-
  // first order the renderer's keyboard/pointer identity uses, so the list
  // items and the focused canvas expose the SAME names. Fed from W3's
  // additive semantic block (name/type/shortDescription) with label/kind
  // fallbacks.
  const semanticObjects = useMemo(
    () => semanticObjectsFor(presentationSpec, engineMapping ?? null),
    [presentationSpec, engineMapping]
  );
  // The identity card follows the renderer's identity surface (pinned ?? 
  // hover — FIX 5/FIX 14): a tap/click or Enter pins it, hover previews it.
  const identityObject = hoverIdentityId
    ? (semanticObjects.find((o) => o.id === hoverIdentityId) ?? null)
    : null;
  // Wave-4b (hostile Q5 — escape disclosure): the learner-visible trajectory
  // line on the planet's details card, driven by the SAME honest
  // classification the debug seam exposes (renderer.getEscapeClassification —
  // the seam's own tracker + rule; never inferred). React bails out when the
  // value did not change, so the 15 Hz emission cadence is not a re-render
  // source.
  const [trajectoryClassification, setTrajectoryClassification] = useState<
    "bound" | "escape" | null
  >(null);
  const primaryObjectId = useMemo(
    () => primaryEngineObjectId(spec, engineMapping ?? null),
    [spec, engineMapping]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: PrimitiveSceneRenderer | null = null;
    let labelOverlay: ProjectedLabelOverlay | null = null;
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
        onHoverIdentity: (id) => setHoverIdentityId(id),
        // Wave 3 (FIX 17/18): graph edge hover — state on change only; the
        // tooltip shows the edge's learner-friendly readout.
        onEdgeHover: (id) => setHoverEdgeId(id),
      });
      renderer.setSpec(presentationSpec, { engineMapping: engineMapping ?? null });
      rendererRef.current = renderer;
      // Persistent DOM label overlay (W4, root-cause fix seam 5): pulls the
      // renderer's label projections on its own rAF and writes the DOM
      // imperatively — no React state, no per-frame re-render. Disposed with
      // the renderer.
      if (overlayHostRef.current) {
        labelOverlay = new ProjectedLabelOverlay(overlayHostRef.current, () =>
          renderer?.readLabelProjections() ?? null
        );
        labelOverlayRef.current = labelOverlay;
      }
    } catch {
      renderer?.dispose();
      rendererRef.current = null;
      // Deferred so the error state update is not synchronous in the effect.
      window.setTimeout(() => setStartError(true), 0);
    }
    return () => {
      rendererRef.current = null;
      labelOverlayRef.current = null;
      labelOverlay?.dispose();
      renderer?.dispose();
    };
    // The mapping is derived from the spec (stable); when it changes the
    // renderer is rebuilt with the new coupling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, engineMapping]);

  // Tooltip (FIX 4): one role="tooltip" element per stage container, driven
  // only by hover-identity changes. The controller owns the DOM; content
  // comes from the semantic data (W3: semantic.name/shortDescription) with
  // the plain label as fallback, anchored at the object's projected coords.
  // Wave 3 (FIX 17/18): graph EDGE ids resolve through
  // resolveGraphEdgeContent (2D-parity readout + plain-word sentence) and
  // anchor at the edge midpoint (renderer.getEdgeAnchor).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new TooltipController(container, {
      reducedMotion,
      resolveContent: (id) => resolveStageTooltipContent(id, presentationSpec, guide),
      anchorFor: (id) => {
        const renderer = rendererRef.current;
        if (!renderer) return null;
        // Node anchor first; edge ids fall through to the edge midpoint.
        return renderer.getIdentityAnchor(id) ?? renderer.getEdgeAnchor(id) ?? null;
      },
    });
    tooltipRef.current = controller;
    return () => {
      tooltipRef.current = null;
      controller.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, reducedMotion]);

  useEffect(() => {
    const controller = tooltipRef.current;
    if (!controller) return;
    // An edge under the pointer wins over a node (the renderer emits exactly
    // one at a time — this ordering is a defensive tie-break for id spaces
    // that could overlap).
    if (hoverEdgeId) {
      controller.show(hoverEdgeId);
    } else if (hoverIdentityId) {
      controller.show(hoverIdentityId);
    } else {
      controller.hide();
    }
  }, [hoverIdentityId, hoverEdgeId]);

  // Keep the tooltip anchored while the pointer moves (cheap imperative
  // reposition — never React state, never per-frame).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onPointerMove = () => tooltipRef.current?.reposition();
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => container.removeEventListener("pointermove", onPointerMove);
  }, []);

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
    // Wave-4b (hostile Q5): refresh the details card's trajectory line from
    // the renderer's OWN classification (same tracker + rule as the debug
    // seam, so the learner-visible line can never diverge from
    // window.__unseenlabScene.engine.classification).
    setTrajectoryClassification(renderer?.getEscapeClassification() ?? null);
  }, [visualState, engineMapping, spec.id]);

  useEffect(() => {
    // Root-cause P7 (trajectory-contract pin): the reduced-motion promise —
    // under reducedMotion the stage never keeps continuous motion running,
    // even when the page hands it playing=true.
    rendererRef.current?.setPlaying(reducedMotion ? false : playing);
  }, [playing, reducedMotion]);

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

  // W6 (camera-contract C6 + root cause §3/§6): the explanatory chrome
  // (legend/relationships/Reset view) is gated behind conceptual OR
  // verified_simulation — orbit/hybrid stages expose Reset view (the
  // permanent userControlled latch must be clearable) and their relationship
  // guide (the gravity relationship must render).
  const showChrome =
    spec.trust.level === "conceptual_demonstration" ||
    spec.trust.level === "verified_simulation";

  return (
    <div>
      <p className="sr-only" id={`stage-help-${spec.id}`}>
        Interactive stage: {spec.title}. {spec.learningObjective}
        {!reducedMotion
          ? " Drag to rotate the model and use the mouse wheel or trackpad to zoom."
          : " Motion is reduced; use the Diagram or Guided steps representation for a static explanation."}
      </p>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-[#080d16] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        style={{ aspectRatio: `${spec.renderer.preferredAspectRatio}` }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`${spec.title} 3D stage canvas`}
          aria-describedby={`stage-help-${spec.id}`}
          className="block h-full w-full cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />

        {/* Persistent DOM label overlay host (W4, root-cause fix seam 5): the
            ProjectedLabelOverlay appends its pointer-events-none layer here
            and renders the scene's labels as absolutely-positioned DOM
            elements (>= 14px primary / >= 12px secondary, clamped in-bounds,
            hidden when the placement planner judges them occluded). */}
        <div
          ref={overlayHostRef}
          className="pointer-events-none absolute inset-0 overflow-hidden"
        />

        {showChrome ? (
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

      {semanticObjects.length > 0 ? (
        <SceneObjectList
          objects={semanticObjects}
          activeId={hoverIdentityId}
          onActivate={setHoverIdentityId}
        />
      ) : null}
      {identityObject ? (
        <ObjectDetailsCard
          object={identityObject}
          readouts={readouts}
          trajectory={
            identityObject.id === primaryObjectId ? trajectoryClassification : null
          }
        />
      ) : null}

      {showChrome ? <RelationshipGuide guide={guide} /> : null}
      <ReadoutDisplay readouts={readouts} />
    </div>
  );
}

/**
 * FIX 4 tooltip content: NAME + one sentence from the semantic data (W3:
 * `semantic.name` / `semantic.shortDescription` on the spec object); falls
 * back to the guide label (or node id) when no sentence exists. The semantic
 * block is consumed structurally (W3's additive spec field may be absent in
 * any intermediate tree) — absent data simply yields the label fallback.
 */
function resolveTooltipContent(
  nodeId: string,
  spec: DemoSpecV1,
  guide: StageGuide
): TooltipContent | null {
  const object = spec.scene3d?.objects.find((o) => o.id === nodeId);
  const semantic = (object as unknown as { semantic?: { name?: string; shortDescription?: string } })
    ?.semantic;
  const guideLabel = guide.entities.find((e) => e.id === nodeId)?.label;
  const name = semantic?.name?.trim() || object?.label?.trim() || guideLabel || nodeId;
  const sentence = semantic?.shortDescription?.trim();
  return { name, sentence: sentence || undefined };
}

/**
 * Wave 3 (FIX 17/18): the stage's tooltip content dispatcher. A graph EDGE id
 * resolves through resolveGraphEdgeContent — the 2D-parity readout ("Cause A
 * → Effect B" / "Effect C ┤ Inhibited D") as the name plus the plain-word
 * sentence ("Cause A activates Effect B.") — mapping the edge's endpoints to
 * their learner-facing node labels. Everything else falls through to the
 * untouched orbit/identity resolver above. Edge ids win over node ids so an
 * id-space collision can never show node content for an edge.
 */
function resolveStageTooltipContent(
  id: string,
  spec: DemoSpecV1,
  guide: StageGuide
): TooltipContent | null {
  const rel = spec.scene3d?.relationships.find((r) => String(r.id) === id);
  if (rel) {
    const nodeLabels: Record<string, string> = {};
    const guideByEntity = new Map(guide.entities.map((e) => [e.id, e.label]));
    for (const obj of spec.scene3d?.objects ?? []) {
      const semantic = (obj as unknown as { semantic?: { name?: string } })
        ?.semantic;
      nodeLabels[String(obj.id)] =
        semantic?.name?.trim() ||
        obj.label?.trim() ||
        guideByEntity.get(obj.id) ||
        String(obj.id);
    }
    const edge = resolveGraphEdgeContent(
      {
        id: String(rel.id),
        type: rel.type,
        label: rel.label ?? rel.type,
        fromId: String(rel.from),
        toId: String(rel.to),
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 0 },
        inhibits: rel.type === "inhibits",
      },
      nodeLabels
    );
    return { name: edge.title, sentence: edge.body };
  }
  return resolveTooltipContent(id, spec, guide);
}

// ---------------------------------------------------------------------------
// W6 semantic object list + details surface (FIX 5 / FIX 15, orbit-learning
// L10): the SR-accessible equivalent of the in-canvas identity — a
// keyboard-reachable role=list of the scene's objects exposing the same names
// as the labels, plus a compact details card (name, type, one-line
// description, live Speed/Distance readouts at the existing low-rate readout
// cadence — never per-frame).
// ---------------------------------------------------------------------------

interface SceneSemanticObject {
  id: string;
  label: string;
  type: string;
  description: string;
}

/** Identity-pickable kinds — mirrors the renderer's IDENTITY_PICK_KINDS so
 * the list, the labels and the keyboard/hover identity always agree on what
 * is an object (decorative lines/trails/particles/groups stay out). */
const SEMANTIC_LIST_KINDS = new Set([
  "sphere",
  "box",
  "plane",
  "ring",
  "energy_packet",
  "wave_surface",
  "orbit_path",
]);

function humanizeObjectId(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * The engine-coupled PRIMARY object id — the moving body that is a mapping
 * body key but NOT a mapping key itself (the orbit "planet": mapping keys are
 * "star" and "planet-system", the planet mesh is the mapped group's child) —
 * or null when the scene has no such object. Mirrors the primary-first
 * ordering of semanticObjectsFor; the trajectory disclosure line (Wave-4b,
 * hostile Q5) is scoped to THIS object, never to the star.
 */
function primaryEngineObjectId(
  spec: DemoSpecV1,
  engineMapping: EngineMapping | null
): string | null {
  if (!engineMapping || Object.keys(engineMapping).length === 0) return null;
  const scene = spec.scene3d;
  if (!scene) return null;
  const mappingKeys = new Set(Object.keys(engineMapping));
  const bodyKeys = new Set<string>();
  for (const entry of Object.values(engineMapping)) {
    if (entry.body && !entry.body.startsWith("@")) bodyKeys.add(entry.body);
  }
  for (const obj of scene.objects) {
    if (
      SEMANTIC_LIST_KINDS.has(obj.kind) &&
      bodyKeys.has(obj.id) &&
      !mappingKeys.has(obj.id)
    ) {
      return obj.id;
    }
  }
  return null;
}

/**
 * The scene's learner-facing objects in keyboard order — primary identity
 * node first (the engine body that is not the mapping key, e.g. the orbit
 * "planet" whose mapping key is the "planet-system" group), then scene order.
 * Mirrors the renderer's non-graph keyboard navigation exactly.
 */
function semanticObjectsFor(
  spec: DemoSpecV1,
  engineMapping: EngineMapping | null
): SceneSemanticObject[] {
  const scene = spec.scene3d;
  if (!scene) return [];
  const objects = scene.objects.filter((o) => SEMANTIC_LIST_KINDS.has(o.kind));
  const primary = primaryEngineObjectId(spec, engineMapping);
  const orderedIds = primary
    ? [primary, ...objects.filter((o) => o.id !== primary).map((o) => o.id)]
    : objects.map((o) => o.id);
  const byId = new Map(objects.map((o) => [o.id, o]));
  return orderedIds.flatMap((id) => {
    const obj = byId.get(id);
    return obj ? [describeSemanticObject(obj, scene)] : [];
  });
}

function describeSemanticObject(
  obj: PrimitiveObjectSpec,
  scene: NonNullable<DemoSpecV1["scene3d"]>
): SceneSemanticObject {
  const semantic = obj.semantic;
  const type = semantic?.type?.trim()
    ? humanizeObjectId(semantic.type)
    : humanizeObjectId(obj.kind);
  const description =
    semantic?.shortDescription?.trim() ||
    semantic?.relationshipSummary?.trim() ||
    (obj.description ?? "").trim() ||
    relationshipSentenceFor(obj, scene) ||
    `A ${type.toLowerCase()} in this model`;
  return {
    id: obj.id,
    label: semantic?.name?.trim() || obj.label?.trim() || humanizeObjectId(obj.id),
    type,
    description,
  };
}

/** One-sentence description derived from the scene's relationships (labels
 * like "The planet orbits the star"), resolving group-mapped endpoints. */
function relationshipSentenceFor(
  obj: PrimitiveObjectSpec,
  scene: NonNullable<DemoSpecV1["scene3d"]>
): string | null {
  const groupOf = new Map<string, string>();
  for (const candidate of scene.objects) {
    if (candidate.kind === "group") {
      for (const child of candidate.children ?? []) groupOf.set(child, candidate.id);
    }
  }
  for (const rel of scene.relationships) {
    const touches =
      rel.from === obj.id ||
      rel.to === obj.id ||
      groupOf.get(rel.from) === obj.id ||
      groupOf.get(rel.to) === obj.id;
    if (touches && rel.label?.trim()) return rel.label.trim();
  }
  return null;
}

function SceneObjectList({
  objects,
  activeId,
  onActivate,
}: {
  objects: SceneSemanticObject[];
  activeId: string | null;
  onActivate: (id: string) => void;
}) {
  return (
    <ul
      role="list"
      tabIndex={0}
      aria-label="Scene objects"
      className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-raised/50 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {objects.map((obj) => (
        <li
          key={obj.id}
          role="listitem"
          tabIndex={0}
          aria-label={obj.label}
          aria-current={activeId === obj.id ? "true" : undefined}
          onClick={() => onActivate(obj.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onActivate(obj.id);
            }
          }}
          className="cursor-pointer rounded-full border border-border/70 bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {obj.label}
        </li>
      ))}
    </ul>
  );
}

/** FIX 15 details surface: compact — name, type, one-line description and
 * the orbit Speed/Distance readouts when the engine provides them. The
 * readouts arrive at the existing low-rate readout cadence (never per-frame);
 * no live region, so the lesson rail's single-announcement contract holds.
 *
 * Wave-4b (hostile Q5 — escape disclosure): when the card shows the PRIMARY
 * engine body and the honest classification is known, a learner-visible
 * "Trajectory: Bound / Escape" line is rendered — driven by the SAME
 * classification the debug seam exposes (engine speed + radial growth, never
 * inferred); null/absent → no line, and an escape is never labeled
 * "orbiting". The rail is untouched. */
function ObjectDetailsCard({
  object,
  readouts,
  trajectory,
}: {
  object: SceneSemanticObject;
  readouts: Readout[];
  /** Honest bound/escape classification of the primary trajectory (null →
   * no line — the UI stays honestly silent, never inferred). */
  trajectory?: "bound" | "escape" | null;
}) {
  const detailReadouts = readouts.filter(
    (r) => r.label === "Speed" || r.label === "Distance"
  );
  return (
    <section
      aria-label={`Details: ${object.label}`}
      className="mt-2 rounded-lg border border-border bg-surface-raised/70 px-3 py-2.5"
    >
      <p className="text-sm font-semibold">{object.label}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-muted">
        {object.type}
      </p>
      <p className="mt-0.5 text-xs leading-5 text-muted">{object.description}</p>
      {trajectory ? (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>
            <span className="font-semibold uppercase tracking-widest text-muted">
              Trajectory
            </span>{" "}
            <span className="font-mono capitalize">{trajectory}</span>
          </span>
        </div>
      ) : null}
      {detailReadouts.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {detailReadouts.map((readout) => (
            <span key={readout.label}>
              <span className="font-semibold uppercase tracking-widest text-muted">
                {readout.label}
              </span>{" "}
              <span className="font-mono">{readout.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
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
