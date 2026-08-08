/**
 * renderer.ts — PrimitiveSceneRenderer: the single owner of a canvas for the
 * primitive-3d namespace. Direct Three.js (no React Three Fiber), one
 * requestAnimationFrame loop, dt clamp, DPR cap, resize observer, visibility
 * pause, WebGL availability guard, context-loss recovery, full disposal.
 *
 * Since C0 (3D Representation Quality Program, Wave 3) this file is
 * orchestration only: spec/scene building, node/group construction, engine
 * state coupling, graph interaction, time/playback, sizing and lifecycle.
 * Visual construction lives in ./visuals.ts, labels in ./labels.ts, edges +
 * trails in ./edges.ts, and camera framing in ./camera.ts — all moved
 * behavior-identically.
 *
 * Orbit controls are a minimal custom implementation (pointer drag + wheel
 * zoom + gentle idle auto-orbit) instead of three/examples OrbitControls, so
 * the module graph stays tiny and typed. Auto-orbit, dragging and zoom are
 * all disabled under reducedMotion.
 */

import * as THREE from "three";
import type {
  AnimationOperator,
  DemoSpecV1,
  PrimitiveKind,
  Vec3,
} from "@/demonstrations/spec/demo-spec";
import type { EngineVisualState } from "@/demonstrations/renderers/lumina-2d/types";
import { FrameStatsSampler } from "@/demonstrations/performance/frame-stats";
import {
  buildSceneGraph,
  cascadeOrder,
  deriveGraphEdges,
  edgeCausalPath,
  GRAPH_NODE_KINDS,
  isGraphLikeScene,
} from "./scene-graph";
import type { GraphEdgePlan } from "./scene-graph";
import {
  disposeMaterials,
  MAX_EMISSIVE_INTENSITY,
} from "./materials";
import {
  clampNum,
  makeNodeState,
  stepOperator,
  type NodeState,
  type OperatorParams,
} from "./operators";
import type {
  EngineMapping,
  PrimitiveSceneRendererOptions,
  RendererStatus,
  SceneGraph,
  SceneGraphAnimation,
  SceneGraphNode,
  SceneSemantic,
} from "./types";
// The options type is part of the renderer's public surface (the
// semantic-hover-contract test imports it from this module).
export type { PrimitiveSceneRendererOptions } from "./types";
import {
  applyLabelPlans,
  buildLabelSprite,
  isPrimaryLabelKind,
  planNodeLabels,
  updateLabelOverlays,
  type LabelContext,
  type LabelOverlay,
  type LabelProjection,
} from "./labels";
import type { GlyphFrame } from "./presentation/constants";
import {
  attachEdgeLabels,
  buildFlowEdge,
  buildGraphEdge,
  clearTrail,
  updateEdge,
  type EdgeContext,
  type RuntimeEdge,
} from "./edges";
import { buildVisual, updateKind, type VisualContext } from "./visuals";
import {
  classifyOrbitEscape,
  createEscapeTracker,
  installSceneSeam,
  type EscapeTracker,
  type SceneSeam,
} from "./presentation/debug-seam";
import {
  applyCamera,
  clampGraphOrbit,
  contentAABBFromGraph,
  contentExtentCenter,
  DEFAULT_FOV_DEG,
  frameCamera,
  type ContentExtent,
  type OrbitState,
} from "./camera";
import { runGeometryGate } from "./presentation/pipeline";
import { FRAME_ASPECT_DEFAULT } from "./camera";

export const MAX_DT = 0.05; // seconds; avoid huge jumps on tab refocus
export const DPR_CAP = 2;
export const DPR_CAP_MOBILE = 1.5;
const FPS_INTERVAL = 0.5; // seconds between onFps emissions
/** Radial-reach epsilon for the "trail still growing" guard (resetView's
 * bounded shrink): above the per-push radial advance of the curated circular
 * orbit (exactly 0) and of a fresh escape, so the guard only trips on real
 * outward growth of the trajectory. */
const TRAIL_GROWTH_EPS = 0.2;
const AUTO_ORBIT_RATE = 0.06; // rad/s gentle idle orbit
// Legacy (non-graph) drawn edge types. transforms_into joined in MUST-FIX 2:
// before_after's b1→b2 renders on the 3D surface with the same arrowhead
// semantics as flows_to, matching the 2D surface which always drew it.
const EDGE_TYPES = new Set(["flows_to", "transfers_to", "transforms_into"]);

// Canonical-graph (graph-like scene) framing constants live in ./camera.ts
// (GRAPH_VIEW_DIR / GRAPH_AZIMUTH_BAND / GRAPH_POLAR_BAND).
const HIGHLIGHT_TINT = new THREE.Color("#ffe9a8"); // "lights up" color
const CASCADE_STEP_MS = 260; // per-hop delay of the downstream cascade
const CASCADE_FADE_MS = 180; // fade-in duration of each cascade step
/** Focus events arriving this soon after a pointerdown are the click's own
 * focus (the canvas is tabIndex=0), not a keyboard focus — they must not seed
 * phantom keyboard focus or announce keyboard instructions. */
const POINTER_FOCUS_WINDOW_MS = 500;

/**
 * NON-GRAPH identity picking (FIX 4 / FIX 14, orbit-learning root cause §5):
 * the semantic object kinds that hit-test as themselves in non-graph scenes
 * (engine-coupled hybrids and operator-driven scenes). Everything else stays
 * decorative — particles, vector fields, plain lines/trails/labels and group
 * containers never surface an identity. The curated orbit set falls out of
 * this rule: star/planet/moon (sphere) and the "Default orbit guide" ring
 * (orbit_path). Graph scenes register every non-group node as before.
 */
const IDENTITY_PICK_KINDS = new Set<PrimitiveKind>([
  "sphere",
  "box",
  "plane",
  "ring",
  "energy_packet",
  "wave_surface",
  "orbit_path",
]);

/** Hover scale boost for the non-graph identity highlight (subtle). */
const IDENTITY_HOVER_SCALE = 0.035;
/** Pinned (selected) scale boost — stronger than hover (FIX 14). */
const IDENTITY_PIN_SCALE = 0.11;
/** Glow lift for the pinned identity (clamped to MAX_EMISSIVE_INTENSITY). */
const IDENTITY_PIN_GLOW = 0.55;
/** Brief manipulated pulse: decays to zero over this window (FIX 14). */
const IDENTITY_PULSE_MS = 500;
const IDENTITY_PULSE_SCALE = 0.16;

/** Pure dt clamp — exported for direct unit testing (mirrors lumina-2d). */
export function clampDt(dt: number, max: number = MAX_DT): number {
  if (!Number.isFinite(dt)) return 0;
  if (dt < 0) return 0;
  return dt > max ? max : dt;
}

/** "#rrggbb" for a THREE.Color (identity-visual emissive snapshot). */
function colorToHex(c: THREE.Color): string {
  const ch = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
}

/** Which render path each primitive kind takes (coverage-checked in tests). */
export const KIND_GEOMETRY_PLAN: Record<
  PrimitiveKind,
  "mesh" | "line" | "points" | "sprite" | "group"
> = {
  sphere: "mesh",
  box: "mesh",
  plane: "mesh",
  ring: "mesh",
  arrow: "mesh",
  line: "line",
  trail: "line",
  label: "sprite",
  particle_field: "points",
  vector_field: "line",
  orbit_path: "line",
  wave_surface: "mesh",
  graph_surface: "line",
  process_node: "mesh",
  process_edge: "line",
  energy_packet: "mesh",
  camera_marker: "mesh",
  group: "group",
};

/** One runner may own a canvas at a time. */
const canvasOwners = new WeakMap<HTMLCanvasElement, PrimitiveSceneRenderer>();

export function isCanvasOwned(canvas: HTMLCanvasElement): boolean {
  return canvasOwners.has(canvas);
}

// ---------------------------------------------------------------------------
// Runtime scene record
// ---------------------------------------------------------------------------

/** A material owned by a runtime node — animation + selection visuals may
 * mutate it freely (never the shared materials cache). */
export interface OwnedMaterial {
  material: THREE.Material;
  animateOpacity: boolean;
  animateColor: boolean;
  /** Base color for selection highlight lerp (graph scenes only). */
  baseColor?: string;
  /** Non-graph identity visuals (FIX 14): emissive state snapshotted on the
   * first hover/pin so the restore pass can put the glow back exactly. */
  baseEmissiveIntensity?: number;
  baseEmissiveColor?: string;
}

/** Runtime record for a built node: its group, operator state, owned
 * materials and per-kind state (trail/particles/wave/vectorTicks). */
export interface RuntimeNode {
  graph: SceneGraphNode;
  group: THREE.Group;
  state: NodeState;
  owned: OwnedMaterial[];
  children: RuntimeNode[];
  /** Parent runtime node (null for roots). Group-targeted state (opacity)
   * propagates through this chain (MUST-FIX 3). */
  parent: RuntimeNode | null;
  /** FIX 3 semantic identity (additive): mirrors graph.semantic for overlay
   * convenience — hover cards/legends read the learner-facing name,
   * shortDescription, role and interactive flag without reaching through
   * graph. Absent when the spec carried no semantic metadata. */
  semantic?: SceneSemantic;
  trail?: {
    capacity: number;
    /** EXACT-history CPU ring (Float64 — P1/T12): recorded samples equal the
     * engine snapshot exactly. The GPU position attribute is a separate
     * float32 copy synced per push (three requires float32 attributes). */
    buffer: Float64Array;
    geometry: THREE.BufferGeometry;
    attribute: THREE.BufferAttribute;
    line: THREE.Line;
    written: number;
    last: Vec3 | null;
    /** Monotone re-aim epoch (T2): ++ on every clearTrail; synced to the
     * engine's epoch at each re-aim so the debug seam reports the engine's
     * counter ("++ on every re-aim/clear"). */
    epoch: number;
  };
  particles?: {
    count: number;
    half: number;
    positions: Float32Array;
    velocities: Float32Array;
    attribute: THREE.BufferAttribute;
  };
  wave?: {
    attribute: THREE.BufferAttribute;
    base: Float32Array;
    size: number;
  };
  vectorTicks?: {
    attribute: THREE.BufferAttribute;
    origins: Float32Array;
    grid: number;
    span: number;
    len: number;
  };
}

/**
 * Operators that change an object's POSITION. When an object's position is
 * owned by the canonical engine state (hybrid showcases), these operators are
 * skipped — rotation/pulse/glow/etc. may still run (decorative).
 */
const POSITION_OPERATORS = new Set<AnimationOperator>([
  "translate",
  "orbit",
  "oscillate",
  "follow_path",
]);

export class PrimitiveSceneRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly options: Required<
    Pick<PrimitiveSceneRendererOptions, "reducedMotion" | "mobile">
  > &
    PrimitiveSceneRendererOptions;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;

  private graph: SceneGraph | null = null;
  private spec: DemoSpecV1 | null = null;
  private lastReasons: string[] = [];
  private nodeById = new Map<string, SceneGraphNode>();
  private runtime = new Map<string, RuntimeNode>();
  private roots: RuntimeNode[] = [];
  private edges: RuntimeEdge[] = [];
  private labels: LabelOverlay[] = [];
  private animationsByTarget = new Map<string, SceneGraphAnimation[]>();
  private disposables: Array<{ dispose(): void }> = [];

  // Label presentation state (Wave 2, root-cause §4) -------------------------
  /** Screen-constant glyph frame captured at build (halfH + viewport px):
   * label sprites and placement rects project >= 14 CSS px at this frame. */
  private buildFrame: GlyphFrame | null = null;
  /** Stable replan-throttle accumulator (labels.ts: 4 Hz budget + teleport
   * escape). Lives here so the per-frame labelCtx re-creation never resets
   * it. */
  private readonly labelReplanState = { accum: 0 };

  // Canonical-graph mode (graph-like scenes) -------------------------------
  /** True when the current scene is a canonical graph (nodes + typed
   * relationships) and the renderer derives edges + interaction from it. */
  private graphMode = false;
  /** Derived edges for the current graph scene (graphMode only). */
  private edgePlans: GraphEdgePlan[] = [];
  /** Selection/hover state — drives highlight/dim and the event surface. */
  private selectedNodeId: string | null = null;
  private selectedEdgeId: string | null = null;
  private hoverEdgeId: string | null = null;
  /** Keyboard focus (arrow keys on the focused canvas). */
  private focusNodeId: string | null = null;
  /** Non-graph keyboard-focus visual bookkeeping: the node currently carrying
   * the in-canvas focus tint (the per-frame restore target). */
  private keyboardFocusVisualNodeId: string | null = null;
  /** BFS downstream order from the selected node (cascade). */
  private cascadeNodes: string[] = [];
  private cascadeStart = 0;
  /** Causal path of the selected/hovered edge (nodes and edges). */
  private edgePathNodes = new Set<string>();
  private edgePathEdges = new Set<string>();
  /** Non-graph identity surface (FIX 4/FIX 14): the node under the pointer
   * (hover) and the node pinned by a click/tap (selection). Emitted on
   * changes only, keyed by semantic node id (never mesh), so child meshes of
   * one object can never flicker the identity. */
  private hoverIdentityId: string | null = null;
  private pinnedIdentityId: string | null = null;
  /** Last identity actually emitted (dedupe across hover/pin merges). */
  private lastEmittedIdentityId: string | null = null;
  /** Node currently carrying identity visuals (for the restore pass). */
  private identityVisualNodeId: string | null = null;
  /** Timestamp of the last pin — drives the manipulated pulse. */
  private identityPinAt = 0;
  /** Object → node/edge id registries for pointer picking (graphMode). */
  private pickTargets = new Map<THREE.Object3D, string>();
  private pickEdges = new Map<THREE.Object3D, string>();
  private raycaster: THREE.Raycaster | null = null;
  /** Orthographic frustum base half-height (graph scenes; scaled by zoom). */
  private orthoBaseHalf = 5;
  private cameraAspect = 1;
  private pointerDown = { x: 0, y: 0 };
  private pointerMoved = 0;
  /** Timestamp of the last pointerdown (-1 = no pointer interaction yet).
   * Consumed by onFocus to distinguish click-induced focus from keyboard
   * focus. */
  private pointerInteractedAt = -1;

  /** Object-id → engine body/grid mapping (hybrid showcases; set per spec). */
  private engineMapping: EngineMapping | null = null;
  /** The latest canonical engine visual state (null → operator-driven). */
  private engineState: EngineVisualState | null = null;
  /** Max field magnitude in the current field state (bounds arrow lengths). */
  private engineFieldMaxMag = 0;

  private raf = 0;
  private last = 0;
  private time = 0;
  private playing = true;
  private speed = 1;
  private animSpeedAll = 1;
  private animSpeedById = new Map<string, number>();

  private ro: ResizeObserver | null = null;
  private disposed = false;
  private webglFailed = false;
  private contextLost = false;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private fpsAcc = 0;
  /** Optional EMA frame-time sampler — only instantiated when onFps is set,
   * so the default path carries zero instrumentation overhead. */
  private frameStats: FrameStatsSampler | null = null;

  private orbit: OrbitState = {
    azimuth: 0,
    polar: Math.PI / 3,
    distance: 10,
    target: new THREE.Vector3(0, 0, 0),
    defaultAzimuth: 0,
    defaultPolar: Math.PI / 3,
    defaultDistance: 10,
    userControlled: false,
  };

  /** Last engine re-aim epoch seen in setEngineState (the engine bumps a
   * monotone `epoch` counter on every learner-visible re-aim — C4 latch
   * release + T2 clear-on-re-aim). null = no epoch seen yet (the first
   * sighting is the baseline, never a re-aim). */
  private lastReaimedEpoch: number | null = null;
  /** Previous `reaimed` flag (boolean engines): the renderer clears on the
   * false->true EDGE, so a persistent flag (the orbits engine never
   * consumes it — getVisualState is a pure read) cannot re-clear the trail
   * on every emission. */
  private lastSeenReaimed: boolean | null = null;
  /** Escape-classification tracker for the debug seam (radial-distance
   * series keyed by engine epoch — honest bound/escape, root-cause §6). */
  private readonly escapeTracker: EscapeTracker = createEscapeTracker();
  /** Detach for the window.__unseenlabScene poller (installed on construct,
   * removed on dispose). */
  private detachSceneSeam: (() => void) | null = null;
  /** Camera seam data (e2e/orbit-learning.spec.ts `camera{reframed,
   * reframeCount}` — the seam module consumes this via getCameraReframeStatus):
   * `reframeCount` is monotone; `reframed` reflects the most recent engine
   * push / reset decision. */
  private reframeCount = 0;
  private lastReframed = false;
  /** Union bbox of the runtime trail bounds at the last engine-state push.
   * resetView skips the bounded shrink while the trail is still growing into
   * the frame (the shrink would be undone by the next grow — jitter). */
  private lastTrailUnion: ContentExtent | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    options: PrimitiveSceneRendererOptions = {}
  ) {
    if (canvasOwners.has(canvas)) {
      throw new Error(
        "PrimitiveSceneRenderer: canvas is already owned by another renderer"
      );
    }
    this.canvas = canvas;
    this.options = {
      reducedMotion: options.reducedMotion ?? false,
      mobile: options.mobile ?? false,
      ...options,
    };
    // Optional instrumentation: the sampler is a single multiply-add per
    // frame and is only created when the caller asked for FPS feedback.
    this.frameStats = options.onFps ? new FrameStatsSampler() : null;
    canvasOwners.set(canvas, this);

    const gl = this.acquireContext();
    if (!gl) {
      // No WebGL at all: stop and let the shell fall back to the accessible
      // representation. No loop is ever started.
      this.webglFailed = true;
      this.options.onError?.({
        reason: "webgl_unavailable",
        message:
          "WebGL is not available in this browser or context; the accessible representation will be shown instead.",
      });
      return;
    }

    this.initThree();
    // Wave-2 debug seam (e2e/orbit-learning.spec.ts dependency #1): the
    // renderer is the stage mount point, so it owns the
    // window.__unseenlabScene poller (<=10Hz, detached in dispose).
    this.detachSceneSeam = installSceneSeam(this);
    this.attachEvents();
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement ?? canvas);
    }
    this.raf = requestAnimationFrame(this.boundLoop);
  }

  // -------------------------------------------------------------------------
  // WebGL guard + context acquisition
  // -------------------------------------------------------------------------

  private acquireContext(): WebGLRenderingContext | WebGL2RenderingContext | null {
    const attrs: WebGLContextAttributes = {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: "high-performance",
    };
    try {
      const gl2 = this.canvas.getContext("webgl2", attrs);
      if (gl2) return gl2 as WebGL2RenderingContext;
    } catch {
      /* fall through */
    }
    try {
      const gl = this.canvas.getContext("webgl", attrs);
      if (gl) return gl as WebGLRenderingContext;
    } catch {
      /* fall through */
    }
    return null;
  }

  private initThree(): void {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  }

  getStatus(): RendererStatus {
    if (this.disposed) return "disposed";
    if (this.webglFailed) return "webgl_unavailable";
    if (this.contextLost) return "context_lost";
    return "ready";
  }

  /** The current validated scene graph (null before setSpec). The shell can
   * consume this for the accessible representation. */
  getSceneGraph(): SceneGraph | null {
    return this.graph;
  }

  getLastReasons(): string[] {
    return this.lastReasons;
  }

  getSimTime(): number {
    return this.time;
  }

  /**
   * Read-only projection snapshot for the DOM label overlay (Wave-2 seam,
   * root-cause fix seam 5): every placed label's anchor projected to canvas
   * CSS px through the live camera. The overlay pulls this imperatively on
   * its own rAF (no React state, no per-frame callback). Returns null when
   * the scene is not ready.
   *
   * Label source: the W3 semantic name where present, else the resolved
   * placement text (which is node.label through the shared resolver — the
   * same string the 2D surface renders). Hidden objects and labels the
   * placement planner judged occluded (anchor fallback) are suppressed.
   *
   * Note: the projection currently uses THREE Vector3.project (uniform for
   * ortho + perspective); W2's perspective projection helper in camera.ts
   * can replace the NDC math once it lands.
   */
  readLabelProjections(): LabelProjection[] | null {
    if (!this.camera || this.labels.length === 0) return null;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return null;
    const v = new THREE.Vector3();
    const out: LabelProjection[] = [];
    for (const overlay of this.labels) {
      const plan = overlay.plan;
      const node = this.nodeById.get(overlay.nodeId);
      if (!plan || plan.occluded || node?.hidden) continue;
      overlay.sprite.getWorldPosition(v);
      v.project(this.camera);
      // Outside the frustum (behind the camera / beyond the far plane).
      if (!Number.isFinite(v.x) || v.z < -1 || v.z > 1) continue;
      out.push({
        nodeId: overlay.nodeId,
        label: node?.semantic?.name?.trim() || plan.text,
        x: ((v.x + 1) / 2) * w,
        y: ((1 - v.y) / 2) * h,
        primary: isPrimaryLabelKind(node?.kind ?? "label"),
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Spec + scene building
  // -------------------------------------------------------------------------

  /** Build the scene from a spec; fully disposes the previous scene. The
   * optional engineMapping couples scene object ids to canonical engine state
   * (hybrid showcases); without it every object is operator-driven. */
  setSpec(
    spec: DemoSpecV1,
    options?: { engineMapping?: EngineMapping | null }
  ): void {
    this.spec = spec;
    this.engineMapping = options?.engineMapping ?? null;
    this.engineState = null;
    this.engineFieldMaxMag = 0;
    if (this.webglFailed || this.disposed) return;
    const { graph, reasons } = buildSceneGraph(spec, {
      mobile: this.options.mobile,
    });
    this.lastReasons = reasons;
    this.disposeScene(true);
    this.graph = graph;
    this.nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    // Canonical graph mode: no engine coupling AND node-style objects
    // connected by typed relationships. Engine-coupled hybrid showcases keep
    // their dedicated orbital/field/wave rendering untouched; containment
    // scenes (groups/particle fields/boxes) keep their objects as-is.
    const hasMapping =
      this.engineMapping !== null && Object.keys(this.engineMapping).length > 0;
    this.graphMode = !hasMapping && isGraphLikeScene(graph);
    this.resetSelection();
    this.animationsByTarget = new Map<string, SceneGraphAnimation[]>();
    for (const anim of graph.animations) {
      const list = this.animationsByTarget.get(anim.target) ?? [];
      list.push(anim);
      this.animationsByTarget.set(anim.target, list);
    }
    // GEOMETRY GATE — production wiring (MUST-FIX 1, design-2 §7.2): the
    // production runner degrades repairable I3 (shorten + re-place colliding
    // node labels — MUST run before buildScene so the built scene carries
    // the degraded labels), assembles the GateScene exactly as this renderer
    // renders it, runs checkScene (I1–I5 + INFO) over the laid-out scene,
    // and joins its surfaced reasons (gate_I{n}_violations / gate_unverified)
    // into the renderer's reason surface. Fail loudly / degrade is now real:
    // a scene that breaches I1–I5 after every repair stage reports it here,
    // never silently. The gate camera uses the build-time default aspect —
    // exactly the frame frameCamera applies at build — so the gate verdict
    // matches the corpus.
    this.lastReasons.push(
      ...runGeometryGate(graph, {
        graphMode: this.graphMode,
        aspect: FRAME_ASPECT_DEFAULT,
      }).reasons,
    );
    this.buildScene(graph);
    // Red-team 4c survivor 7: the gate runner and buildScene each compute the
    // same placement reasons (edge_unroutable, label_truncated_ellipsis,
    // label_anchor_fallback, edge_label_skipped_no_space,
    // edge_label_suppressed_density, edge_head_suppressed_short_edge), so the
    // joined surface carried every code twice. Dedupe at the join point:
    // first occurrence wins, pipeline order preserved, getLastReasons() is
    // unique per code.
    const seenReasons = new Set<string>();
    this.lastReasons = this.lastReasons.filter((reason) => {
      if (seenReasons.has(reason)) return false;
      seenReasons.add(reason);
      return true;
    });
  }

  /**
   * Feed the canonical engine visual state into the scene. Every mapped
   * object with a matching body/field/surface is overridden per frame (see
   * applyTransforms / applyEngineField / applyEngineSurface); objects without
   * engine state keep their operator-driven behavior. Passing null restores
   * operator-driven behavior for everything.
   */
  setEngineState(state: EngineVisualState | null): void {
    this.engineState = state;
    this.engineFieldMaxMag = 0;
    if (state?.field?.vectors) {
      for (const v of state.field.vectors) {
        if (v.magnitude > this.engineFieldMaxMag) {
          this.engineFieldMaxMag = v.magnitude;
        }
      }
    }
    // C4 (design-2 §3.4, F-13): engine-state pushes re-fit the frame over the
    // union of static graph content and engine dynamic extents (bodies, field
    // span, trail bounds). Grow-only with REFRAME_HYSTERESIS; skipped while
    // the orbit is user-controlled; the orbit record and camera are never
    // reset.
    //
    // Wave-2 latch release (root-cause §3 "camera latch freeze"): a re-aim
    // (parameter change — the engine flags `reaimed` on the visual state it
    // emits right after placeBodies, or bumps an epoch counter) clears the
    // userControlled latch and lets THIS push reframe, so an escape/high-
    // speed body never exits the frustum (contract C4). Pure pointer
    // exploration keeps the latch semantics — the next pointerdown re-latches.
    //
    // Re-aim detection consumes the monotone `epoch` counter (authoritative:
    // a JSON-deduped pipeline can never swallow a number change — the stage's
    // dedupe key stringifies the whole state, epoch/reaimed included) or the
    // `reaimed` boolean's false->true EDGE (one-shot and persistent flags
    // both work; the orbits engine's flag is persistent by design — pure
    // getVisualState). The first epoch sighting is the baseline, never a
    // re-aim.
    const raw = (state as
      | (EngineVisualState & { reaimed?: boolean | number; epoch?: number })
      | null);
    const reaimed = raw?.reaimed;
    const epoch = raw?.epoch;
    let reaimedNow = false;
    if (typeof reaimed === "number") {
      if (reaimed !== this.lastReaimedEpoch) {
        this.lastReaimedEpoch = reaimed;
        reaimedNow = true;
      }
    } else if (typeof epoch === "number") {
      if (this.lastReaimedEpoch === null) {
        this.lastReaimedEpoch = epoch; // baseline — never a re-aim
      } else if (epoch !== this.lastReaimedEpoch) {
        this.lastReaimedEpoch = epoch;
        reaimedNow = true;
      }
    }
    if (reaimed === true && this.lastSeenReaimed !== true) reaimedNow = true;
    this.lastSeenReaimed = reaimed === true;
    if (reaimedNow) {
      this.orbit.userControlled = false;
      // T2 — atomic clear-on-re-aim, EXACTLY ONCE per epoch flip, before the
      // next pushTrailPoint records a point: setEngineState always runs
      // between frames (the stage applies the engine state outside the frame
      // loop), and the frame loop pushes the body's world position AFTER
      // applyTransforms — so the next recorded point is the post-teleport
      // position and starts a fresh segment (never an old-last -> new-start
      // teleport connector, root-cause §2). The engine's monotone epoch is
      // recorded on each trail for the debug seam.
      const engineEpoch =
        typeof epoch === "number"
          ? epoch
          : typeof reaimed === "number"
            ? reaimed
            : undefined;
      for (const rn of this.runtime.values()) {
        const t = rn.trail;
        if (!t) continue;
        clearTrail(t);
        if (engineEpoch !== undefined) t.epoch = engineEpoch;
      }
    }

    // Trail bounds — the REAL producer for dynamicExtentFromEngineState's
    // trailBounds: bboxes over the written world points of every runtime
    // trail ring buffer, keyed by node id (contracts C3/C4).
    const trailBounds = this.trailBoundsFromRuntime();
    const reframed = frameCamera(this.camera, this.graph, {
      graphMode: this.graphMode,
      orbit: this.orbit,
      orthoBaseHalf: this.orthoBaseHalf,
      reframe: {
        graph: this.graph,
        engineMapping: this.engineMapping,
        engineState: state,
        aspect: this.cameraAspect,
        trailBounds,
        releaseLatch: reaimedNow === true,
      },
    });
    if (reframed) {
      if (reframed.graphMode) {
        this.orthoBaseHalf = reframed.orthoBaseHalf;
      } else if (reframed.distance !== undefined) {
        this.orbit.distance = reframed.distance;
      }
      this.reframeCount++;
      this.lastReframed = true;
    } else {
      this.lastReframed = false;
    }
    this.lastTrailUnion = this.unionTrailBounds(trailBounds);
  }

  /** Bbox over the WRITTEN world points of every runtime trail ring buffer,
   * keyed by node id (the trailBounds producer for the camera frame — C3/C4).
   * The buffers are world-space (pushTrailPoint records getWorldPosition);
   * nodes without a trail or with <2 written points contribute nothing. */
  private trailBoundsFromRuntime(): Map<string, ContentExtent> | null {
    let out: Map<string, ContentExtent> | null = null;
    for (const rn of this.runtime.values()) {
      const t = rn.trail;
      if (!t || t.written < 2) continue;
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < t.written; i++) {
        const x = t.buffer[i * 3];
        const y = t.buffer[i * 3 + 1];
        const z = t.buffer[i * 3 + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      if (!out) out = new Map();
      out.set(rn.graph.id, {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
      });
    }
    return out;
  }

  /** Union bbox of a set of trail bounds (null-safe; empty set -> null). */
  private unionTrailBounds(
    bounds: Map<string, ContentExtent> | null
  ): ContentExtent | null {
    if (!bounds || bounds.size === 0) return null;
    let acc: ContentExtent | null = null;
    for (const b of bounds.values()) {
      if (!acc) {
        acc = {
          min: { x: b.min.x, y: b.min.y, z: b.min.z },
          max: { x: b.max.x, y: b.max.y, z: b.max.z },
        };
        continue;
      }
      acc = {
        min: {
          x: Math.min(acc.min.x, b.min.x),
          y: Math.min(acc.min.y, b.min.y),
          z: Math.min(acc.min.z, b.min.z),
        },
        max: {
          x: Math.max(acc.max.x, b.max.x),
          y: Math.max(acc.max.y, b.max.y),
          z: Math.max(acc.max.z, b.max.z),
        },
      };
    }
    return acc;
  }

  /**
   * True when the trail is still growing into the frame: the current union of
   * the runtime trail bounds reaches farther from the static content center
   * than the union seen at the last engine-state push (radial reach about the
   * system center — monotone for an escape, constant for a circular orbit, so
   * the guard is exact for the curated case and conservative for eccentric
   * orbits). resetView never shrinks while this holds.
   */
  private trailStillGrowing(
    current: Map<string, ContentExtent> | null
  ): boolean {
    const union = this.unionTrailBounds(current);
    if (!union) return false;
    const last = this.lastTrailUnion;
    if (!last) return true; // first sighting: the trail is filling the frame
    const center = this.graph
      ? contentExtentCenter(
          contentAABBFromGraph(this.graph, { graphMode: false })
        )
      : contentExtentCenter(union);
    const radialReach = (b: ContentExtent): number =>
      Math.max(
        Math.hypot(
          b.min.x - center.x,
          b.min.y - center.y,
          b.min.z - center.z
        ),
        Math.hypot(
          b.max.x - center.x,
          b.max.y - center.y,
          b.max.z - center.z
        )
      );
    return radialReach(union) > radialReach(last) + TRAIL_GROWTH_EPS;
  }

  /** Camera seam data (e2e/orbit-learning.spec.ts `camera{reframed,
   * reframeCount}`): whether the most recent engine push / reset reframed,
   * and the monotone reframe counter. */
  getCameraReframeStatus(): { reframed: boolean; reframeCount: number } {
    return { reframed: this.lastReframed, reframeCount: this.reframeCount };
  }

  // -------------------------------------------------------------------------
  // Debug seam (e2e/orbit-learning.spec.ts dependency #1): the renderer is
  // the stage mount point, so it composes `window.__unseenlabScene` from the
  // data it owns — trail runtimes, W4's label projections, W2's camera
  // status and the engine state (debug-seam.ts owns the classification and
  // the <=10Hz window poller).
  // -------------------------------------------------------------------------

  /**
   * The full seam payload for the current scene, or null before the scene is
   * ready. The primary trail is the engine-coupled moving body's (mapping
   * body id match — the orbit "planet"), falling back to the trail with the
   * most recorded points (a single honest trajectory history, never a
   * synthetic blend).
   */
  getSceneSeam(): SceneSeam | null {
    if (!this.scene || !this.camera || !this.graph) return null;

    const bodyValues = new Set<string>();
    if (this.engineMapping) {
      for (const entry of Object.values(this.engineMapping)) {
        if (entry.body && !entry.body.startsWith("@") && entry.body !== "star") {
          bodyValues.add(entry.body);
        }
      }
    }
    let bestTrail: NonNullable<RuntimeNode["trail"]> | null = null;
    let bestScore = -1;
    for (const rn of this.runtime.values()) {
      const t = rn.trail;
      if (!t) continue;
      const score = (bodyValues.has(rn.graph.id) ? 1e9 : 0) + t.written;
      if (score > bestScore) {
        bestTrail = t;
        bestScore = score;
      }
    }
    const points: SceneSeam["trail"]["points"] = [];
    if (bestTrail) {
      for (let i = 0; i < bestTrail.written; i++) {
        points.push({
          x: bestTrail.buffer[i * 3],
          y: bestTrail.buffer[i * 3 + 1],
          z: bestTrail.buffer[i * 3 + 2],
        });
      }
    }

    const objects: SceneSeam["objects"] = [];
    for (const p of this.readLabelProjections() ?? []) {
      const rn = this.runtime.get(p.nodeId);
      if (!rn) continue;
      const radiusPx = this.projectedRadiusPx(rn);
      if (radiusPx === null) continue;
      objects.push({
        id: p.nodeId,
        label: p.label,
        projected: { x: p.x, y: p.y },
        projectedRadiusPx: radiusPx,
      });
    }

    const { reframed, reframeCount } = this.getCameraReframeStatus();
    return {
      trail: { points, epoch: bestTrail?.epoch ?? 0 },
      objects,
      camera: { reframed, reframeCount },
      engine: { classification: classifyOrbitEscape(this.engineState, this.escapeTracker) },
    };
  }

  /** The node's world radius (renderer geometry, design-1 §1.3): spheres and
   * most kinds render size*0.5; camera_marker is size*0.4. */
  private nodeWorldRadius(node: SceneGraphNode): number {
    return node.kind === "camera_marker" ? node.size * 0.4 : node.size * 0.5;
  }

  /** Project a node's world radius to CSS px at the live camera (C1 — the
   * seam's projectedRadiusPx). The radius is measured along the two
   * view-tangential world axes and the larger projection wins, so a view
   * axis-aligned offset can never collapse the estimate. */
  private projectedRadiusPx(rn: RuntimeNode): number | null {
    const camera = this.camera;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const radius = this.nodeWorldRadius(rn.graph);
    if (!camera || w <= 0 || h <= 0 || !(radius > 0)) return null;
    const center = new THREE.Vector3();
    rn.group.getWorldPosition(center);
    const project = (p: THREE.Vector3): { x: number; y: number; z: number } => {
      p.project(camera);
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, z: p.z };
    };
    const c = project(center.clone());
    if (c.z < -1 || c.z > 1) return null; // behind / beyond the far plane
    let best = 0;
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const off = project(center.clone().add(new THREE.Vector3(dx * radius, 0, dz * radius)));
      best = Math.max(best, Math.hypot(off.x - c.x, off.y - c.y));
    }
    return best;
  }

  private buildScene(graph: SceneGraph): void {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(
      graph.background === "dark" ? 0x0a0e18 : 0xf3f5fa
    );
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(6, 10, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-6, 4, -8);
    scene.add(fill);
    this.scene = scene;

    // Frame the camera FIRST (was the last step of buildScene): the build
    // frame is needed before any sprite is built, so label sprites and
    // placement rects can be screen-constant (Wave 2, root-cause §4 — glyphs
    // must project >= 14 CSS px at the frame the scene renders at).
    const framed = frameCamera(this.camera, graph, {
      graphMode: this.graphMode,
      orbit: this.orbit,
      orthoBaseHalf: this.orthoBaseHalf,
    });
    if (framed) {
      this.camera = framed.camera;
      this.orthoBaseHalf = framed.orthoBaseHalf;
    }
    const viewportPx = this.canvas.clientHeight || 720;
    this.buildFrame =
      this.graphMode || this.camera instanceof THREE.OrthographicCamera
        ? { halfH: this.orthoBaseHalf, viewportPx }
        : {
            // Perspective: visible half-height at the target plane.
            halfH:
              this.orbit.distance *
              Math.tan(
                ((this.camera instanceof THREE.PerspectiveCamera
                  ? this.camera.fov
                  : DEFAULT_FOV_DEG) *
                  Math.PI) /
                  360
              ),
            viewportPx,
          };

    this.runtime = new Map();
    this.roots = [];
    this.labels = [];
    this.pickTargets.clear();
    this.pickEdges.clear();
    const childSet = new Set<string>();
    for (const n of graph.nodes) for (const c of n.children) childSet.add(c);
    for (const node of graph.nodes) {
      if (!childSet.has(node.id)) {
        const rn = this.buildNode(node, null);
        this.roots.push(rn);
      }
    }

    // Edges: graph-like scenes derive them from scene3d.relationships (the
    // canonical graph — arrowhead at the destination, bar for inhibits, label
    // mid-edge); other scenes keep the legacy plain flows_to/transfers_to
    // lines so hybrid showcases render exactly as before.
    this.edgePlans = this.graphMode ? deriveGraphEdges(graph) : [];
    this.edges = [];
    if (this.graphMode) {
      for (const plan of this.edgePlans) {
        const from = this.runtime.get(plan.fromId);
        const to = this.runtime.get(plan.toId);
        if (from && to) buildGraphEdge(this.edgeCtx, from, to, plan);
      }
    } else {
      for (const rel of graph.relationships) {
        if (!EDGE_TYPES.has(rel.type)) continue;
        const from = this.runtime.get(rel.from);
        const to = this.runtime.get(rel.to);
        if (from && to) buildFlowEdge(this.edgeCtx, from, to, rel);
      }
    }

    // Node-label placement: deterministic collision-tested stage (labels.ts).
    // Truncation / anchor-fallback reasons join the renderer's reason surface
    // (never silent). Fresh world matrices first, so placement anchors measure
    // real world positions (nested groups / engine nodes) and applyLabelPlans
    // snaps the overlay sprites correctly before the first frame. The build
    // frame makes the glyph rects screen-constant (>= 14 CSS px).
    this.scene?.updateMatrixWorld(true);
    const labelPlan = planNodeLabels(graph, {
      edgePlans: this.graphMode ? this.edgePlans : undefined,
      frame: this.buildFrame,
    });
    this.lastReasons.push(...labelPlan.reasons);
    applyLabelPlans(this.labelCtx, labelPlan.plans);

    // Edge-label placement (C3, design-2 §1.4): collision-tested candidates
    // with skip+density reasons; consumes the node-label plans placed above
    // so edge labels never overlap a node label. Runs after all edges and
    // node labels exist.
    attachEdgeLabels(this.edgeCtx, labelPlan.plans);

    // Keyboard interaction: graph nodes are reachable via the focused canvas;
    // non-graph scenes (orbit/hybrid) with identity-pickable objects get the
    // same focusable canvas so keyboard focus exposes object identity
    // (root cause §5 L10 — today the canvas is only focusable in graph mode).
    this.canvas.tabIndex =
      this.graphMode || this.nonGraphFocusIds().length > 0
        ? 0
        : this.canvas.tabIndex;
  }

  private buildNode(node: SceneGraphNode, parent: RuntimeNode | null): RuntimeNode {
    const holder = new THREE.Group();
    holder.name = node.id;
    const rn: RuntimeNode = {
      graph: node,
      group: holder,
      state: makeNodeState({ position: node.position, color: node.color }),
      owned: [],
      children: [],
      parent,
      semantic: node.semantic,
    };
    this.runtime.set(node.id, rn);

    if (node.kind !== "group") buildVisual(this.visualCtx, rn, node, holder);
    if (node.kind !== "label" && node.label !== undefined) {
      buildLabelSprite(this.labelCtx, rn, node);
    }
    if (node.kind !== "group") {
      if (this.graphMode) {
        // Pointer picking: the holder and every mesh it owns hit-test as the
        // node (meshes are named by node id so keyboard/raycast resolution is
        // deterministic).
        this.pickTargets.set(holder, node.id);
        for (const child of holder.children) {
          if (child instanceof THREE.Mesh) {
            child.name = node.id;
            this.pickTargets.set(child, node.id);
          }
        }
      } else if (this.isIdentityPickableNode(node)) {
        // Non-graph identity picking (FIX 4/FIX 14): semantic meshes
        // hit-test as their node for hover/click IDENTITY ONLY — selection
        // and manipulation stay graph-only (frozen contract "non-graph
        // scenes ignore pointer picks" for selection is untouched).
        this.pickTargets.set(holder, node.id);
        for (const child of holder.children) {
          if (child instanceof THREE.Mesh) {
            this.pickTargets.set(child, node.id);
          }
        }
        // Clone-once owned materials so the hover/pin highlight never touches
        // the shared material cache (no per-hover material creation). Skipped
        // when the node already owns clones (opacity/color animation).
        if (rn.owned.length === 0) {
          this.cloneMaterials(holder, rn, false, false);
        }
      }
    }
    for (const childId of node.children) {
      const childNode = this.nodeById.get(childId);
      if (!childNode) continue;
      const childRn = this.buildNode(childNode, rn);
      rn.children.push(childRn);
      holder.add(childRn.group);
    }
    if (parent) {
      parent.group.add(holder);
    } else {
      this.scene?.add(holder);
    }
    return rn;
  }

  private trackDisposable(d: { dispose(): void }): void {
    this.disposables.push(d);
  }

  // Structural context views handed to the extracted modules (labels/edges/
  // visuals). Each exposes exactly the renderer state that module's functions
  // operate on; the getters are re-evaluated per call so the views always
  // reflect the current scene/state.

  private get labelCtx(): LabelContext {
    return {
      graph: this.graph,
      graphMode: this.graphMode,
      scene: this.scene,
      labels: this.labels,
      runtime: this.runtime,
      edgePlans: this.edgePlans,
      trackDisposable: (d) => this.trackDisposable(d),
      frame: this.buildFrame,
      replanState: this.labelReplanState,
    };
  }

  private get edgeCtx(): EdgeContext {
    return {
      scene: this.scene,
      graph: this.graph,
      trackDisposable: (d) => this.trackDisposable(d),
      edges: this.edges,
      pickEdges: this.pickEdges,
      // Edge reasons (routing/head/label skips) join the same reason surface
      // as scene-graph and label reasons.
      reasons: this.lastReasons,
    };
  }

  private get visualCtx(): VisualContext {
    return {
      scene: this.scene,
      graph: this.graph,
      time: this.time,
      graphMode: this.graphMode,
      animationsByTarget: this.animationsByTarget,
      engineMapping: this.engineMapping,
      engineState: this.engineState,
      engineFieldMaxMag: this.engineFieldMaxMag,
      trackDisposable: (d) => this.trackDisposable(d),
      cloneMaterials: (holder, rn, animateOpacity, animateColor) =>
        this.cloneMaterials(holder, rn, animateOpacity, animateColor),
      // Visual reasons (field auto-fit, line/process_edge endpoint fallback)
      // join the same reason surface as scene-graph/edge reasons.
      reasons: this.lastReasons,
    };
  }

  /** Per-node material clones when opacity or color is animated, so shared
   * cached materials are never mutated. Graph scenes clone every material
   * so selection dimming/highlighting can run per node. Called from
   * visuals.buildVisual. */
  private cloneMaterials(
    holder: THREE.Object3D,
    rn: RuntimeNode,
    animateOpacity: boolean,
    animateColor: boolean
  ): void {
    for (const child of holder.children) {
      const mesh = child as THREE.Mesh & {
        material?: THREE.Material | THREE.Material[];
      };
      if (!mesh.material) continue;
      const material = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material;
      if (!material) continue;
      const clone = material.clone();
      clone.transparent = animateOpacity;
      rn.owned.push({
        material: clone,
        animateOpacity,
        animateColor,
        baseColor: rn.graph.color,
      });
      this.trackDisposable(clone);
      if (Array.isArray(mesh.material)) {
        mesh.material = [clone];
      } else {
        mesh.material = clone;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Time + playback controls
  // -------------------------------------------------------------------------

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    this.last = 0;
  }

  setSpeed(multiplier: number): void {
    this.speed = Math.max(0, multiplier);
  }

  /** Override the playback multiplier of one animation (by target node id) or
   * of every animation when targetId is omitted. */
  setAnimationSpeed(targetId: string | undefined, speed: number): void {
    const s = Math.max(0, speed);
    if (targetId === undefined) {
      this.animSpeedAll = s;
    } else {
      this.animSpeedById.set(targetId, s);
    }
  }

  /** Restore default framing (azimuth/polar/distance) and re-enable idle
   * auto-orbit. */
  resetView(): void {
    this.orbit.azimuth = this.orbit.defaultAzimuth;
    this.orbit.polar = this.orbit.defaultPolar;
    this.orbit.userControlled = false;
    if (this.graphMode) {
      // Canonical-graph scenes keep the build frame contract: restore the
      // zoom factor (the ortho frustum is scaled by distance/defaultDistance;
      // the base half-height is pinned at build).
      this.orbit.distance = this.orbit.defaultDistance;
    }
    // Wave-2 bounded shrink (root-cause §3 "grow-only no-shrink"): recompute
    // the concept frame over static + current dynamic extents and shrink with
    // hysteresis, so a slider round-trip never leaves the planet a 0.58° dot.
    // Never while the trail is still growing into the frame (the shrink would
    // be undone by the next grow — jitter).
    const trailBounds = this.trailBoundsFromRuntime();
    const shrink = !this.graphMode && !this.trailStillGrowing(trailBounds);
    const reframed = frameCamera(this.camera, this.graph, {
      graphMode: this.graphMode,
      orbit: this.orbit,
      orthoBaseHalf: this.orthoBaseHalf,
      reframe: {
        graph: this.graph,
        engineMapping: this.engineMapping,
        engineState: this.engineState,
        aspect: this.cameraAspect,
        trailBounds,
        shrink,
      },
    });
    if (reframed) {
      if (reframed.graphMode) {
        this.orthoBaseHalf = reframed.orthoBaseHalf;
      } else if (reframed.distance !== undefined) {
        this.orbit.distance = reframed.distance;
      }
      this.reframeCount++;
      this.lastReframed = true;
    }
  }

  private effectiveSpeed(anim: SceneGraphAnimation): number {
    const perTarget = this.animSpeedById.get(anim.target);
    const multiplier = perTarget ?? this.animSpeedAll;
    return anim.speed * multiplier;
  }

  // -------------------------------------------------------------------------
  // Sizing
  // -------------------------------------------------------------------------

  private currentDpr(): number {
    const device = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    return Math.min(device, this.options.mobile ? DPR_CAP_MOBILE : DPR_CAP);
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    const rect = parent
      ? parent.getBoundingClientRect()
      : { width: this.canvas.clientWidth || 300, height: this.canvas.clientHeight || 150 };
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = this.currentDpr();
    if (this.canvas.width !== Math.floor(w * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
    }
    if (this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.height = Math.floor(h * dpr);
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.renderer?.setPixelRatio(dpr);
    this.renderer?.setSize(w, h, false);
    this.cameraAspect = w / h;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  private loop(now: number): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.boundLoop);
    let dt = 0;
    if (!this.last) {
      this.last = now; // first frame establishes the clock
    } else {
      dt = clampDt((now - this.last) / 1000);
    }
    this.last = now;

    if (this.playing && !this.contextLost) {
      const sdt = dt * this.speed;
      this.time += sdt;
      this.updateScene(sdt, this.time);
    } else if (!this.contextLost) {
      this.updateScene(0, this.time);
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    // Optional frame-time instrumentation: EMA-smoothed FPS via
    // FrameStatsSampler, emitted on the existing onFps callback every
    // FPS_INTERVAL of accumulated frame time. No sampler, no work.
    this.fpsAcc += dt;
    const stats = this.frameStats;
    if (stats) {
      const sample = stats.sample(now);
      if (this.fpsAcc >= FPS_INTERVAL && this.options.onFps) {
        this.options.onFps(sample.fps);
        this.fpsAcc = 0;
      }
    }
  }

  private updateScene(dt: number, time: number): void {
    if (!this.scene || !this.graph) return;
    for (const rn of this.runtime.values()) this.applyAnimations(rn, dt, time);
    for (const rn of this.runtime.values()) this.applyTransforms(rn);
    // Group-targeted state propagation (MUST-FIX 3, design-2 §5.3): groups
    // own no materials, so a reveal/fade targeting a group was a visual
    // no-op. A deterministic recursive pass (bounded by the graph's group
    // depth) multiplies each group's opacity into every descendant's
    // materials after the per-node pass, so the before_after "after" group
    // reveal actually reveals its children (and nested groups compose).
    this.applyGroupOpacity();
    // Fresh world matrices: edges, trails and labels read world positions
    // every frame (a stale matrix would trail a moving body by one frame).
    this.scene.updateMatrixWorld(true);
    for (const rn of this.runtime.values()) updateKind(this.visualCtx, rn, dt);
    for (const edge of this.edges) updateEdge(edge);
    updateLabelOverlays(this.labelCtx, dt);
    if (this.graphMode) {
      this.applySelectionVisuals();
    } else {
      // Non-graph identity visuals (hover/pin glow, FIX 4/FIX 14) plus the
      // keyboard-focus tint (root cause §5 focus-visible).
      if (this.identityVisualActive()) this.applyIdentityVisuals();
      this.applyKeyboardFocusVisual();
    }
    if (!this.options.reducedMotion && !this.orbit.userControlled && !this.graphMode) {
      this.orbit.azimuth += AUTO_ORBIT_RATE * dt;
    }
    applyCamera(this.camera, this.orbit, this.orthoBaseHalf, this.cameraAspect);
  }

  // -------------------------------------------------------------------------
  // Canonical-state coupling (hybrid showcases)
  // -------------------------------------------------------------------------

  /** The engine body position owning a node, or null when not engine-owned. */
  private engineBodyPosition(rn: RuntimeNode): { x: number; y: number } | null {
    const mapping = this.engineMapping?.[rn.graph.id];
    if (!mapping || !this.engineState?.bodies) return null;
    if (mapping.body === "@midpoint") {
      // C3 sentinel (sh-charge-03): the live engine midpoint of the charge
      // pair — the marker tracks an asymmetric drag instead of sitting frozen
      // at the world origin. Missing charge bodies → not driven (decorative).
      const c1 = this.engineState.bodies["charge1"];
      const c2 = this.engineState.bodies["charge2"];
      if (!c1 || !c2) return null;
      return { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
    }
    const body = this.engineState.bodies[mapping.body];
    if (!body) return null;
    return { x: body.x, y: body.y };
  }

  private applyAnimations(rn: RuntimeNode, dt: number, time: number): void {
    const anims = this.animationsByTarget.get(rn.graph.id);
    if (!anims || anims.length === 0) return;
    // Engine-owned position: skip translation/orbit/oscillate/follow_path so
    // the operator animation can never diverge from the canonical state.
    const engineOwned = this.engineBodyPosition(rn) !== null;
    let state = rn.state;
    for (const anim of anims) {
      if (engineOwned && POSITION_OPERATORS.has(anim.operator)) continue;
      const params: OperatorParams = {
        speed: this.effectiveSpeed(anim),
        delayMs: anim.delayMs,
        amplitude: anim.amplitude,
      };
      if (anim.axis) params.axis = anim.axis;
      if (anim.path) params.path = anim.path;
      if (anim.orbitCenter) params.orbitCenter = anim.orbitCenter;
      if (anim.orbitRadius !== undefined) params.orbitRadius = anim.orbitRadius;
      if (anim.slidePath) params.slidePath = anim.slidePath;
      state = stepOperator(
        { operator: anim.operator, params },
        state,
        dt,
        time,
        {
          reducedMotion: this.options.reducedMotion,
          // Dynamic I5 floor (design-1 §3.2): position operators clamp into
          // the deterministic post-layout bounds.
          bounds: this.graph?.layout?.bounds,
        }
      );
    }
    rn.state = state;
  }

  private applyTransforms(rn: RuntimeNode): void {
    const s = rn.state;
    rn.group.position.set(s.position.x, s.position.y, s.position.z);
    rn.group.rotation.set(s.rotation.x, s.rotation.y, s.rotation.z);
    rn.group.scale.setScalar(s.scale);
    // Engine-owned position override: authoritative over any operator state.
    // Engine (x, y) maps to world (x, y-base, z) via the curated mapping, so
    // the object sits exactly on the engine trajectory (e.g. the 3D planet on
    // the engine's orbit radius).
    const body = this.engineBodyPosition(rn);
    if (body) {
      const entry = this.engineMapping![rn.graph.id];
      rn.group.position.set(
        (entry.offsetX ?? 0) + body.x * entry.scale,
        rn.graph.position.y,
        (entry.offsetY ?? 0) + body.y * entry.scale
      );
    }
    for (const owned of rn.owned) {
      if (owned.animateOpacity) {
        owned.material.opacity = s.opacity;
        owned.material.transparent = s.opacity < 1;
      }
      if (owned.animateColor) {
        const color = owned.material as THREE.MeshBasicMaterial & {
          color: THREE.Color;
        };
        color.color.set(s.color);
      }
    }
  }

  /**
   * Cumulative opacity factor of a node's GROUP ANCESTORS (MUST-FIX 3):
   * the product of every ancestor group's state opacity. A leaf's effective
   * opacity is its own state opacity × this factor; used by the propagation
   * pass and by selection visuals so dim/highlight never erases a group
   * reveal.
   */
  private groupOpacityFactor(rn: RuntimeNode): number {
    let factor = 1;
    let current = rn.parent;
    let depth = 0;
    while (current && depth < 8) {
      if (current.graph.kind === "group") factor *= current.state.opacity;
      current = current.parent;
      depth++;
    }
    return factor;
  }

  /**
   * Recursive group-opacity propagation (MUST-FIX 3, design-2 §5.3): walk the
   * runtime tree from the roots; every descendant's opacity-animated material
   * is multiplied by the cumulative group factor. Deterministic (fixed tree
   * order, depth-bounded at the graph's max group depth) and idempotent per
   * frame — the per-node applyTransforms ran first, this pass is last.
   */
  private applyGroupOpacity(): void {
    for (const rn of this.roots) this.propagateGroupOpacity(rn, 1, 0);
  }

  private propagateGroupOpacity(
    rn: RuntimeNode,
    inherited: number,
    depth: number
  ): void {
    const factor =
      rn.graph.kind === "group" ? inherited * rn.state.opacity : inherited;
    if (depth >= 8) return; // bounded — the graph caps group depth at 4 anyway
    for (const child of rn.children) {
      this.propagateGroupOpacity(child, factor, depth + 1);
    }
    if (rn.graph.kind === "group" || Math.abs(factor - 1) < 1e-9) return;
    for (const owned of rn.owned) {
      if (!owned.animateOpacity) continue;
      const opacity = rn.state.opacity * factor;
      owned.material.opacity = opacity;
      owned.material.transparent = opacity < 1;
    }
  }

  // -------------------------------------------------------------------------
  // Pointer input (minimal custom orbit: drag rotate, wheel zoom) + graph
  // interaction (node/edge selection, hover dim, keyboard focus)
  // -------------------------------------------------------------------------

  private onPointerDown(e: PointerEvent): void {
    this.pointerInteractedAt = this.now();
    this.pointerDown = { x: e.clientX, y: e.clientY };
    this.pointerMoved = 0;
    // Clicks still work under reduced motion; only dragging is disabled.
    if (this.options.reducedMotion || !this.camera) return;
    this.dragging = true;
    this.orbit.userControlled = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (typeof this.canvas.setPointerCapture === "function") {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer may already be gone */
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.dragging) {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.pointerMoved += Math.abs(dx) + Math.abs(dy);
      this.orbit.azimuth -= dx * 0.005;
      this.orbit.polar = clampNum(this.orbit.polar - dy * 0.005, 0.05, Math.PI - 0.05);
      if (this.graphMode) clampGraphOrbit(this.orbit);
      return;
    }
    if (this.graphMode) {
      // Edge hover: dim everything outside the hovered edge's causal path
      // (visual only — no callbacks; ignored while a selection is active).
      if (this.selectedNodeId === null && this.selectedEdgeId === null) {
        this.hoverPick(e.clientX, e.clientY);
      }
      return;
    }
    // Non-graph identity hover (FIX 4): identity keyed by semantic node id,
    // so moving across child meshes of one object never flickers.
    this.identityHoverPick(e.clientX, e.clientY);
  }

  private onPointerUp(e: PointerEvent): void {
    const leaving = e.type === "pointerleave";
    this.dragging = false;
    if (!this.graphMode) {
      // Non-graph identity surface: a pointerleave clears the hover WITHOUT
      // pinning (a leave is never a click); a release inside the drag
      // threshold over an object pins the identity (tap/touch/click). The
      // drag-vs-click threshold is preserved; selection/manipulation are
      // never fired for non-graph scenes.
      if (leaving) {
        if (this.hoverIdentityId !== null) {
          this.hoverIdentityId = null;
          this.emitIdentity();
        }
      } else if (this.pointerMoved < 6) {
        this.pickAt(e.clientX, e.clientY);
      }
      return;
    }
    if (this.pointerMoved < 6) {
      this.pickAt(e.clientX, e.clientY);
    }
  }

  private onWheel(e: WheelEvent): void {
    if (this.options.reducedMotion || !this.camera) return;
    e.preventDefault();
    this.orbit.userControlled = true;
    this.orbit.distance = clampNum(
      this.orbit.distance * (1 + e.deltaY * 0.0012),
      2,
      200
    );
  }

  private ndcFromClient(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: -((clientY - rect.top) / rect.height) * 2 + 1,
    };
  }

  private raycastHits(
    ndcX: number,
    ndcY: number
  ): THREE.Intersection[] {
    const camera = this.camera;
    const scene = this.scene;
    if (!camera || !scene) return [];
    if (!this.raycaster) this.raycaster = new THREE.Raycaster();
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    return this.raycaster.intersectObjects(scene.children, true);
  }

  /** Resolve a raycast hit to a node id by walking up to a registered
   * pickable (or a node-named mesh — mesh names equal node ids in graph
   * scenes, which also keeps stub-based tests deterministic). */
  private resolveNodePick(object: THREE.Object3D): string | null {
    let o: THREE.Object3D | null = object;
    while (o) {
      const id = this.pickTargets.get(o);
      if (id) return id;
      if (o.name && this.nodeById.has(o.name)) return o.name;
      o = o.parent ?? null;
    }
    return null;
  }

  private resolveEdgePick(object: THREE.Object3D): string | null {
    let o: THREE.Object3D | null = object;
    while (o) {
      const id = this.pickEdges.get(o);
      if (id) return id;
      if (o.name && o.name.startsWith("edge:")) return o.name.slice(5);
      o = o.parent ?? null;
    }
    return null;
  }

  private pickAt(clientX: number, clientY: number): void {
    if (!this.graphMode) {
      // Non-graph identity click (FIX 14): pin/unpin the hover identity
      // WITHOUT firing selection/manipulation (frozen contract).
      this.identityPickAt(clientX, clientY);
      return;
    }
    const ndc = this.ndcFromClient(clientX, clientY);
    if (!ndc) return;
    for (const hit of this.raycastHits(ndc.x, ndc.y)) {
      const nodeId = this.resolveNodePick(hit.object);
      if (nodeId) {
        this.selectNode(nodeId, true, "pointer");
        return;
      }
      const edgeId = this.resolveEdgePick(hit.object);
      if (edgeId) {
        this.selectEdge(edgeId);
        return;
      }
    }
    this.clearSelection();
  }

  /**
   * Non-graph identity hover (FIX 4): resolve the semantic node under the
   * pointer and emit it on change (null over empty space). Never fires
   * selection callbacks; dragging and reduced-motion paths never reach here.
   */
  private identityHoverPick(clientX: number, clientY: number): void {
    const ndc = this.ndcFromClient(clientX, clientY) ?? { x: 0, y: 0 };
    let found: string | null = null;
    for (const hit of this.raycastHits(ndc.x, ndc.y)) {
      const nodeId = this.resolveNodePick(hit.object);
      if (nodeId && this.isIdentityPickableNodeId(nodeId)) {
        found = nodeId;
        break;
      }
    }
    if (found !== this.hoverIdentityId) {
      this.hoverIdentityId = found;
      this.emitIdentity();
    }
  }

  /**
   * Non-graph identity click (FIX 14): a tap/click inside the drag threshold
   * pins the identity (persists independent of hover); an empty-space click
   * clears the pin. The emitted identity is `pinned ?? hover`, so a pinned
   * selection is never erased by hover or pointerleave (L4 contract).
   */
  private identityPickAt(clientX: number, clientY: number): void {
    const ndc = this.ndcFromClient(clientX, clientY) ?? { x: 0, y: 0 };
    let found: string | null = null;
    for (const hit of this.raycastHits(ndc.x, ndc.y)) {
      const nodeId = this.resolveNodePick(hit.object);
      if (nodeId && this.isIdentityPickableNodeId(nodeId)) {
        found = nodeId;
        break;
      }
    }
    if (found !== this.pinnedIdentityId) {
      this.pinnedIdentityId = found;
      if (found) this.identityPinAt = this.now();
    }
    this.emitIdentity();
  }

  /** Emit the effective identity (pinned ?? hover) on change only. */
  private emitIdentity(): void {
    const id = this.pinnedIdentityId ?? this.hoverIdentityId;
    if (id === this.lastEmittedIdentityId) return;
    this.lastEmittedIdentityId = id;
    this.options.onHoverIdentity?.(id);
  }

  /** True when the node participates in non-graph identity picking. */
  private isIdentityPickableNode(node: SceneGraphNode): boolean {
    return node.kind !== "group" && IDENTITY_PICK_KINDS.has(node.kind);
  }

  private isIdentityPickableNodeId(nodeId: string): boolean {
    const node = this.nodeById.get(nodeId);
    return node !== undefined && this.isIdentityPickableNode(node);
  }

  private hoverPick(clientX: number, clientY: number): void {
    if (!this.graphMode) return;
    const ndc = this.ndcFromClient(clientX, clientY);
    if (!ndc) return;
    let found: string | null = null;
    for (const hit of this.raycastHits(ndc.x, ndc.y)) {
      const edgeId = this.resolveEdgePick(hit.object);
      if (edgeId) {
        found = edgeId;
        break;
      }
    }
    if (found !== this.hoverEdgeId) {
      this.hoverEdgeId = found;
      this.rebuildEdgePath(found);
    }
  }

  private rebuildEdgePath(edgeId: string | null): void {
    const path = edgeId
      ? edgeCausalPath(this.graph?.relationships ?? [], edgeId)
      : null;
    this.edgePathNodes = new Set(path?.nodes ?? []);
    this.edgePathEdges = new Set(path?.edges ?? []);
  }

  private resetSelection(): void {
    this.selectedNodeId = null;
    this.selectedEdgeId = null;
    this.hoverEdgeId = null;
    this.focusNodeId = null;
    this.cascadeNodes = [];
    this.edgePathNodes = new Set();
    this.edgePathEdges = new Set();
    // Non-graph identity surface resets with the scene; a previously emitted
    // identity is cleared so a stale tooltip never survives a spec swap.
    this.hoverIdentityId = null;
    this.pinnedIdentityId = null;
    this.identityVisualNodeId = null;
    this.keyboardFocusVisualNodeId = null;
    if (this.lastEmittedIdentityId !== null) {
      this.lastEmittedIdentityId = null;
      this.options.onHoverIdentity?.(null);
    }
  }

  /** Select a node: highlight it, light up its outgoing edges, then cascade
   * downstream (a brief wave, not a physics sim). Fires the event surface.
   * The single activation function — pointer clicks and keyboard both
   * converge here; `source` only shapes focus seeding and the announcement. */
  private selectNode(
    nodeId: string,
    manipulated: boolean,
    source: "pointer" | "keyboard" = "keyboard"
  ): void {
    const changed = this.selectedNodeId !== nodeId || this.selectedEdgeId !== null;
    const hadEdge = this.selectedEdgeId !== null;
    this.selectedNodeId = nodeId;
    this.selectedEdgeId = null;
    this.hoverEdgeId = null;
    // Pointer activation seeds the keyboard focus so a later Enter/Space
    // activates the node the learner clicked (predictable, no phantom focus).
    if (source === "pointer") this.focusNodeId = nodeId;
    this.cascadeNodes = cascadeOrder(this.graph?.relationships ?? [], nodeId);
    this.cascadeStart = this.now();
    if (hadEdge) this.options.onEdgeSelect?.(null);
    if (changed) this.options.onNodeSelect?.(nodeId);
    if (manipulated) this.options.onNodeManipulate?.(nodeId);
    this.announceNodeFocus(nodeId, source);
  }

  /** Select an edge: dim everything outside its causal path. */
  private selectEdge(edgeId: string): void {
    if (this.selectedEdgeId === edgeId) return;
    const hadNode = this.selectedNodeId !== null;
    this.selectedNodeId = null;
    this.selectedEdgeId = edgeId;
    this.hoverEdgeId = null;
    this.cascadeNodes = [];
    this.rebuildEdgePath(edgeId);
    if (hadNode) this.options.onNodeSelect?.(null);
    this.options.onEdgeSelect?.(edgeId);
  }

  private clearSelection(): void {
    const hadNode = this.selectedNodeId !== null;
    const hadEdge = this.selectedEdgeId !== null;
    this.selectedNodeId = null;
    this.selectedEdgeId = null;
    this.hoverEdgeId = null;
    this.edgePathNodes = new Set();
    this.edgePathEdges = new Set();
    if (hadNode) this.options.onNodeSelect?.(null);
    if (hadEdge) this.options.onEdgeSelect?.(null);
  }

  // -------------------------------------------------------------------------
  // Keyboard interaction (graph scenes): nodes are focusable, Enter/Space
  // selects — same event surface as pointer clicks.
  // -------------------------------------------------------------------------

  private firstGraphNodeId(): string | null {
    const nodes = this.graph?.nodes ?? [];
    for (const n of nodes) {
      if (GRAPH_NODE_KINDS.has(n.kind)) return n.id;
    }
    return null;
  }

  private onFocus(): void {
    if (!this.graphMode) {
      // Non-graph identity focus (L10, root cause §5): the focused canvas
      // announces the same semantic name hover shows — the canonical object
      // under focus (the primary identity node of the scene).
      this.announceIdentityFocus();
      // Seed the keyboard navigation position from the announced object so
      // arrow keys continue where the announcement pointed. A pointer click
      // focuses the canvas on its own; within the pointer-focus window the
      // focus is click-induced and never seeds a phantom keyboard position
      // (same rule as graph scenes).
      const pointerInduced =
        this.pointerInteractedAt >= 0 &&
        this.now() - this.pointerInteractedAt <= POINTER_FOCUS_WINDOW_MS;
      this.pointerInteractedAt = -1;
      if (!pointerInduced && !this.focusNodeId) {
        const primary = this.primaryIdentityNodeId();
        if (primary) {
          this.focusNodeId = primary;
          this.applyKeyboardFocusVisual();
        }
      }
      return;
    }
    // A pointer click focuses the tabIndex=0 canvas on its own. Focus landing
    // within the pointer-focus window is click-induced: never seed a phantom
    // keyboard focus on the first node and never announce keyboard
    // instructions — an empty-space click means clear-selection only.
    const pointerInduced =
      this.pointerInteractedAt >= 0 &&
      this.now() - this.pointerInteractedAt <= POINTER_FOCUS_WINDOW_MS;
    this.pointerInteractedAt = -1;
    if (pointerInduced) return;
    if (!this.focusNodeId) {
      const first = this.firstGraphNodeId();
      if (first) {
        this.focusNodeId = first;
        this.announceNodeFocus(first);
      }
    }
  }

  /**
   * The canonical object under focus for non-graph scenes (L10): prefer the
   * node that IS an engine body without being the engine-mapping key itself
   * (the wrapped body mesh — e.g. the orbit "planet" whose mapping key is the
   * "planet-system" group); fall back to the first identity-pickable node.
   */
  private primaryIdentityNodeId(): string | null {
    const mapping = this.engineMapping;
    const mappingKeys =
      mapping && Object.keys(mapping).length > 0 ? new Set(Object.keys(mapping)) : null;
    if (mapping && mappingKeys) {
      const bodyKeys = new Set<string>();
      for (const entry of Object.values(mapping)) {
        if (entry.body && !entry.body.startsWith("@")) bodyKeys.add(entry.body);
      }
      for (const node of this.graph?.nodes ?? []) {
        if (!this.isIdentityPickableNode(node)) continue;
        if (bodyKeys.has(node.id) && !mappingKeys.has(node.id)) return node.id;
      }
    }
    for (const node of this.graph?.nodes ?? []) {
      if (this.isIdentityPickableNode(node)) return node.id;
    }
    return null;
  }

  /** Reflect the primary identity in the canvas's accessible name (L10). */
  private announceIdentityFocus(): void {
    const primary = this.primaryIdentityNodeId();
    if (!primary) return;
    const node = this.nodeById.get(primary);
    const label = node?.label ?? primary;
    const selected = this.pinnedIdentityId === primary ? " Selected." : "";
    this.canvas.setAttribute("aria-label", `${label}.${selected}`);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.graphMode) {
      this.onNonGraphKeyDown(e);
      return;
    }
    if (e.key === "Escape") {
      this.clearSelection();
      return;
    }
    const nodes = this.graph?.nodes ?? [];
    const graphNodes = nodes.filter((n) => GRAPH_NODE_KINDS.has(n.kind));
    if (graphNodes.length === 0) return;
    let idx = graphNodes.findIndex((n) => n.id === this.focusNodeId);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      idx = (idx + 1) % graphNodes.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      idx = (idx - 1 + graphNodes.length) % graphNodes.length;
    } else if (e.key === "Enter" || e.key === " ") {
      if (this.focusNodeId) this.selectNode(this.focusNodeId, true, "keyboard");
      e.preventDefault();
      return;
    } else {
      return;
    }
    this.focusNodeId = graphNodes[idx].id;
    this.announceNodeFocus(this.focusNodeId);
    e.preventDefault();
  }

  /** Reflect the focused/selected node in the canvas's accessible name.
   * Keyboard-driven focus/selection keeps the operation hint; a selection
   * that already happened via pointer activation announces without it (the
   * click already did the work — telling the learner to press Enter again
   * would contradict the successful activation). */
  private announceNodeFocus(
    nodeId: string,
    source: "pointer" | "keyboard" = "keyboard"
  ): void {
    if (!this.graphMode) return;
    const node = this.nodeById.get(nodeId);
    const label = node?.label ?? nodeId;
    const selected = this.selectedNodeId === nodeId ? " Selected." : "";
    const hint = source === "keyboard" ? " Use arrow keys to move focus, Enter to select." : "";
    this.canvas.setAttribute("aria-label", `${label}.${selected}${hint}`);
  }

  // -------------------------------------------------------------------------
  // Non-graph keyboard interaction (orbit/hybrid scenes — root cause §5 L10):
  // the canvas is focusable, arrow keys move focus across the scene's
  // identity-pickable objects, Enter/Space pins the focused object's identity
  // (the stage's details surface shows it) and Escape clears the pin. The
  // canvas aria-label carries the focused object's learner-facing name with
  // the same hint graph scenes use; the graph event surface (onNodeSelect /
  // onNodeManipulate) is NEVER fired — non-graph scenes ignore keyboard
  // SELECTION (frozen contract) — only the identity surface emits.
  // -------------------------------------------------------------------------

  private onNonGraphKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.clearNonGraphPin();
      return;
    }
    const ids = this.nonGraphFocusIds();
    if (ids.length === 0) return;
    let idx = ids.indexOf(this.focusNodeId ?? "");
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      idx = (idx + 1) % ids.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      idx = (idx - 1 + ids.length) % ids.length;
    } else if (e.key === "Enter" || e.key === " ") {
      if (this.focusNodeId) this.pinIdentity(this.focusNodeId);
      e.preventDefault();
      return;
    } else {
      return;
    }
    this.focusNodeId = ids[idx];
    this.announceNonGraphFocus(this.focusNodeId);
    this.applyKeyboardFocusVisual();
    e.preventDefault();
  }

  /** The scene's identity-pickable objects in keyboard order: the primary
   * identity node first (the object the focus announcement points at), then
   * scene order — the same objects the pointer identity surface exposes, so
   * keyboard and hover/tap always agree on what is an object. */
  private nonGraphFocusIds(): string[] {
    const nodes = this.graph?.nodes ?? [];
    const pickable = nodes.filter((n) => this.isIdentityPickableNode(n));
    const primary = this.primaryIdentityNodeId();
    const rest = pickable.filter((n) => n.id !== primary);
    if (primary) return [primary, ...rest.map((n) => n.id)];
    return rest.map((n) => n.id);
  }

  /** Pin the focused object's identity (non-graph scenes): the stage's
   * details surface shows it and it persists independent of hover — the
   * keyboard equivalent of a tap-select (root cause §5 L10). Emits the
   * identity surface exactly like pointer selection; never the graph node
   * surface. */
  private pinIdentity(nodeId: string): void {
    if (this.pinnedIdentityId !== nodeId) {
      this.pinnedIdentityId = nodeId;
      this.identityPinAt = this.now();
      this.emitIdentity();
    }
    this.announceNonGraphFocus(nodeId);
  }

  /** Escape clears a non-graph pin: the details surface closes and the
   * identity emission falls back to hover (or null). Focus and its in-canvas
   * indicator stay — arrow keys continue from the same object. */
  private clearNonGraphPin(): void {
    if (this.pinnedIdentityId !== null) {
      this.pinnedIdentityId = null;
      this.emitIdentity();
    }
  }

  /** Reflect the focused object in the canvas's accessible name (non-graph
   * scenes) — the announceNodeFocus pattern: the learner-facing name, a
   * "Selected." marker for the pinned object, and the keyboard hint. */
  private announceNonGraphFocus(nodeId: string): void {
    const node = this.nodeById.get(nodeId);
    const label = node?.label ?? nodeId;
    const selected = this.pinnedIdentityId === nodeId ? " Selected." : "";
    this.canvas.setAttribute(
      "aria-label",
      `${label}.${selected} Use arrow keys to move focus, Enter to select.`
    );
  }

  /** Per-frame in-canvas focus indicator for non-graph scenes: the object
   * under keyboard focus tints toward the graph-mode keyboard ring
   * (HIGHLIGHT_TINT at the same 0.3 strength the graph scenes use for
   * focusNodeId); the previously focused object is restored. Materials were
   * cloned once at build (the identity-pickable clone path), so the shared
   * material cache is never mutated. Static color only — nothing animates,
   * so reducedMotion is respected by construction. */
  private applyKeyboardFocusVisual(): void {
    if (this.graphMode) return;
    const focusId = this.focusNodeId;
    if (
      this.keyboardFocusVisualNodeId !== null &&
      this.keyboardFocusVisualNodeId !== focusId
    ) {
      const previous = this.runtime.get(this.keyboardFocusVisualNodeId);
      if (previous) {
        for (const owned of previous.owned) {
          if (!owned.baseColor) continue;
          const m = owned.material as THREE.MeshStandardMaterial & {
            color: THREE.Color;
          };
          m.color.set(owned.baseColor);
        }
      }
    }
    this.keyboardFocusVisualNodeId = focusId;
    if (!focusId) return;
    const rn = this.runtime.get(focusId);
    if (!rn) return;
    for (const owned of rn.owned) {
      if (!owned.baseColor) continue;
      const m = owned.material as THREE.MeshStandardMaterial & {
        color: THREE.Color;
      };
      m.color.set(owned.baseColor).lerp(HIGHLIGHT_TINT, 0.3 * 0.55);
    }
  }

  // -------------------------------------------------------------------------
  // Selection visuals (graph scenes): highlight/dim per node and edge
  // -------------------------------------------------------------------------

  private now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  /** Per-node dim (0 = normal, 1 = dimmed) and highlight (0..1) factors. */
  private nodeVisual(nodeId: string): { dim: number; highlight: number } {
    let dim = 0;
    const dimSource =
      this.selectedEdgeId ?? (this.selectedNodeId === null ? this.hoverEdgeId : null);
    if (dimSource) dim = this.edgePathNodes.has(nodeId) ? 0 : 1;

    let highlight = 0;
    if (this.selectedNodeId === nodeId) {
      highlight = 1;
    } else if (this.focusNodeId === nodeId && this.selectedNodeId === null) {
      highlight = 0.3; // keyboard focus ring
    }
    if (this.selectedNodeId && this.cascadeNodes.length > 1) {
      const depth = this.cascadeNodes.indexOf(nodeId);
      if (depth > 0) {
        if (this.options.reducedMotion) {
          // Discrete analogue: downstream responds at once, no animation.
          highlight = Math.max(highlight, 0.9);
        } else {
          const t = this.now() - (this.cascadeStart + depth * CASCADE_STEP_MS);
          highlight = Math.max(highlight, clampNum(t / CASCADE_FADE_MS, 0, 1));
        }
      }
    }
    return { dim, highlight };
  }

  /** Per-edge dim/highlight. Outgoing edges of the selected node light up;
   * for an edge selection everything outside the causal path dims. */
  private edgeVisual(edge: RuntimeEdge): { dim: number; highlight: number } {
    const id = edge.plan.id;
    let dim = 0;
    let highlight = 0;
    if (this.selectedEdgeId) {
      const onPath = this.edgePathEdges.has(id);
      dim = onPath ? 0 : 1;
      highlight = id === this.selectedEdgeId ? 1 : onPath ? 0.4 : 0;
    } else if (this.selectedNodeId) {
      if (edge.plan.fromId === this.selectedNodeId) highlight = 1;
    } else if (this.hoverEdgeId) {
      const onPath = this.edgePathEdges.has(id);
      dim = onPath ? 0 : 1;
      highlight = id === this.hoverEdgeId ? 0.7 : 0;
    }
    return { dim, highlight };
  }

  private applyEdgeHighlight(
    material: THREE.Material,
    baseColor: string,
    highlight: number
  ): void {
    const m = material as THREE.Material & { color: THREE.Color };
    m.color.set(baseColor).lerp(HIGHLIGHT_TINT, highlight * 0.7);
  }

  private applySelectionVisuals(): void {
    if (!this.graphMode) return;
    for (const rn of this.runtime.values()) {
      if (rn.graph.kind === "group") continue;
      const { dim, highlight } = this.nodeVisual(rn.graph.id);
      // Group-targeted opacity (MUST-FIX 3) composes with selection dimming:
      // a revealed group's children stay hidden while dimmed, never
      // re-shown by the selection pass.
      const baseOpacity = rn.state.opacity * this.groupOpacityFactor(rn);
      const opacity = baseOpacity * (1 - dim * 0.65);
      for (const owned of rn.owned) {
        owned.material.opacity = opacity;
        owned.material.transparent = opacity < 1;
        if (owned.baseColor) {
          const m = owned.material as THREE.MeshStandardMaterial & {
            color: THREE.Color;
            emissiveIntensity: number;
          };
          m.color.set(owned.baseColor).lerp(HIGHLIGHT_TINT, highlight * 0.55);
          if (typeof m.emissiveIntensity === "number") {
            // Never above the materials.ts bound.
            m.emissiveIntensity = Math.min(
              MAX_EMISSIVE_INTENSITY,
              0.5 + highlight * 0.1
            );
          }
        }
      }
      rn.group.scale.setScalar(rn.state.scale * (1 + highlight * 0.12));
    }
    for (const edge of this.edges) {
      const { dim, highlight } = this.edgeVisual(edge);
      const opacity = 1 - dim * 0.78;
      edge.shaft.material.opacity = opacity;
      edge.shaft.material.transparent = true;
      this.applyEdgeHighlight(edge.shaft.material, edge.shaft.baseColor, highlight);
      if (edge.head) {
        edge.head.material.opacity = opacity;
        this.applyEdgeHighlight(edge.head.material, edge.head.baseColor, highlight);
      }
      if (edge.label) {
        (edge.label.material as THREE.SpriteMaterial).opacity = opacity;
      }
    }
  }

  /** Whether the current scene is a canonical graph (nodes + typed
   * relationships) rendered with derived edges and interaction. */
  getGraphMode(): boolean {
    return this.graphMode;
  }

  // -------------------------------------------------------------------------
  // Non-graph identity visuals (FIX 4 / FIX 14): hover → subtle highlight,
  // pinned → stronger glow + a brief manipulated pulse (reduced-motion
  // permits a static pin, never the pulse). Runs only while an identity is
  // active; materials were cloned once at build (clone-once owned-material
  // path), so the shared material cache is never mutated.
  // -------------------------------------------------------------------------

  private identityVisualActive(): boolean {
    return (
      this.pinnedIdentityId !== null ||
      this.hoverIdentityId !== null ||
      this.identityVisualNodeId !== null
    );
  }

  private applyIdentityVisuals(): void {
    const active = this.pinnedIdentityId ?? this.hoverIdentityId;
    if (this.identityVisualNodeId !== null && this.identityVisualNodeId !== active) {
      this.resetIdentityVisual(this.identityVisualNodeId);
    }
    this.identityVisualNodeId = active;
    if (active) {
      this.applyIdentityVisual(active, this.pinnedIdentityId === active ? 1 : 0.35);
    }
  }

  private applyIdentityVisual(nodeId: string, strength: number): void {
    const rn = this.runtime.get(nodeId);
    if (!rn) return;
    const pinned = this.pinnedIdentityId === nodeId;
    // FIX 14: the manipulated pulse only when reduced-motion permits it.
    const pulse =
      pinned && !this.options.reducedMotion
        ? Math.max(0, 1 - (this.now() - this.identityPinAt) / IDENTITY_PULSE_MS) *
            IDENTITY_PULSE_SCALE
        : 0;
    const factor =
      (pinned ? IDENTITY_PIN_SCALE : IDENTITY_HOVER_SCALE) * strength + pulse;
    rn.group.scale.setScalar(rn.state.scale * (1 + factor));
    for (const owned of rn.owned) {
      if (!owned.baseColor) continue;
      const m = owned.material as THREE.MeshStandardMaterial & {
        emissive: THREE.Color;
        emissiveIntensity: number;
      };
      if (typeof m.emissiveIntensity !== "number") continue;
      // Snapshot the pre-hover emissive state on first use so the restore
      // pass puts the glow back exactly (EMISSIVE_KINDS ship at 0.5).
      if (owned.baseEmissiveIntensity === undefined) {
        owned.baseEmissiveIntensity = m.emissiveIntensity ?? 0;
        owned.baseEmissiveColor = colorToHex(m.emissive);
      }
      m.emissive.set(owned.baseColor);
      m.emissiveIntensity = Math.min(
        MAX_EMISSIVE_INTENSITY,
        (pinned ? IDENTITY_PIN_GLOW : 0.18) * strength + pulse
      );
    }
  }

  private resetIdentityVisual(nodeId: string): void {
    const rn = this.runtime.get(nodeId);
    if (!rn) return;
    rn.group.scale.setScalar(rn.state.scale);
    for (const owned of rn.owned) {
      if (owned.baseEmissiveIntensity === undefined) continue;
      const m = owned.material as THREE.MeshStandardMaterial & {
        emissive: THREE.Color;
        emissiveIntensity: number;
      };
      if (typeof m.emissiveIntensity !== "number") continue;
      m.emissive.set(owned.baseEmissiveColor ?? "#000000");
      m.emissiveIntensity = owned.baseEmissiveIntensity;
    }
  }

  /**
   * Project a node's world position to CSS px within the canvas (camera
   * helpers) — the tooltip anchor for non-graph identity hover (FIX 4).
   * Returns null when the object is behind the camera or not present.
   */
  getIdentityAnchor(nodeId: string): { x: number; y: number } | null {
    const rn = this.runtime.get(nodeId);
    const camera = this.camera;
    if (!rn || !camera) return null;
    const world = new THREE.Vector3();
    rn.group.getWorldPosition(world);
    const ndc = world.project(camera);
    if (ndc.z > 1 || ndc.z < -1) return null; // behind the camera
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    return {
      x: ((ndc.x + 1) / 2) * w,
      y: ((1 - ndc.y) / 2) * h,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle: events, visibility, context loss, disposal
  // -------------------------------------------------------------------------

  private readonly boundLoop = (now: number) => this.loop(now);
  private readonly boundVisibility = () => this.onVisibilityChange();
  private readonly boundContextLost = (e: Event) => this.onContextLost(e);
  private readonly boundContextRestored = () => this.onContextRestored();
  private readonly boundPointerDown = (e: PointerEvent) => this.onPointerDown(e);
  private readonly boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private readonly boundPointerUp = (e: PointerEvent) => this.onPointerUp(e);
  private readonly boundWheel = (e: WheelEvent) => this.onWheel(e);
  private readonly boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private readonly boundFocus = () => this.onFocus();

  private attachEvents(): void {
    document.addEventListener("visibilitychange", this.boundVisibility);
    this.canvas.addEventListener("webglcontextlost", this.boundContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.boundContextRestored);
    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    this.canvas.addEventListener("pointerup", this.boundPointerUp);
    this.canvas.addEventListener("pointerleave", this.boundPointerUp);
    this.canvas.addEventListener("wheel", this.boundWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.boundContextMenu);
    this.canvas.addEventListener("keydown", this.boundKeyDown);
    this.canvas.addEventListener("focus", this.boundFocus);
  }

  private removeEvents(): void {
    document.removeEventListener("visibilitychange", this.boundVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.boundContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.boundContextRestored);
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("pointerup", this.boundPointerUp);
    this.canvas.removeEventListener("pointerleave", this.boundPointerUp);
    this.canvas.removeEventListener("wheel", this.boundWheel);
    this.canvas.removeEventListener("contextmenu", this.boundContextMenu);
    this.canvas.removeEventListener("keydown", this.boundKeyDown);
    this.canvas.removeEventListener("focus", this.boundFocus);
  }

  private readonly boundContextMenu = (e: Event) => e.preventDefault();

  private onVisibilityChange(): void {
    if (document.hidden) this.setPlaying(false);
  }

  private onContextLost(e: Event): void {
    e.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.disposeScene(false);
    this.renderer?.dispose();
    this.renderer = null;
  }

  private onContextRestored(): void {
    if (this.disposed || this.webglFailed) return;
    this.initThree();
    if (this.graph) this.buildScene(this.graph);
    this.contextLost = false;
    this.last = 0;
    this.raf = requestAnimationFrame(this.boundLoop);
  }

  /** Dispose all Three.js scene objects and geometry caches. The graph and
   * spec are kept so the scene can be rebuilt after a context restore. */
  private disposeScene(keepCamera: boolean): void {
    this.disposeThreeObjects();
    this.runtime = new Map();
    this.roots = [];
    this.edges = [];
    this.pickTargets.clear();
    this.pickEdges.clear();
    this.scene = null;
    if (!keepCamera) this.camera = null;
    disposeMaterials();
  }

  private disposeThreeObjects(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* disposal must never throw */
      }
    }
    this.disposables = [];
  }

  /** Full teardown: loop, observers, listeners, Three resources, canvas. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.detachSceneSeam) {
      this.detachSceneSeam();
      this.detachSceneSeam = null;
    }
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.ro = null;
    this.removeEvents();
    this.disposeScene(false);
    this.renderer?.dispose();
    this.renderer = null;
    disposeMaterials();
    this.graph = null;
    this.spec = null;
    canvasOwners.delete(this.canvas);
  }
}
