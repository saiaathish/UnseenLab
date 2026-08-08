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
import {
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
  // per-pointer positioning imperatively.
  const [hoverIdentityId, setHoverIdentityId] = useState<string | null>(null);
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
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new TooltipController(container, {
      reducedMotion,
      resolveContent: (id) => resolveTooltipContent(id, presentationSpec, guide),
      anchorFor: (id) => rendererRef.current?.getIdentityAnchor(id) ?? null,
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
    if (hoverIdentityId) {
      controller.show(hoverIdentityId);
    } else {
      controller.hide();
    }
  }, [hoverIdentityId]);

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
        <ObjectDetailsCard object={identityObject} readouts={readouts} />
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
  const mappingKeys =
    engineMapping && Object.keys(engineMapping).length > 0
      ? new Set(Object.keys(engineMapping))
      : null;
  let primary: string | null = null;
  if (engineMapping && mappingKeys) {
    const bodyKeys = new Set<string>();
    for (const entry of Object.values(engineMapping)) {
      if (entry.body && !entry.body.startsWith("@")) bodyKeys.add(entry.body);
    }
    for (const obj of objects) {
      if (bodyKeys.has(obj.id) && !mappingKeys.has(obj.id)) {
        primary = obj.id;
        break;
      }
    }
  }
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
 * no live region, so the lesson rail's single-announcement contract holds. */
function ObjectDetailsCard({
  object,
  readouts,
}: {
  object: SceneSemanticObject;
  readouts: Readout[];
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
