/**
 * renderer.ts — PrimitiveSceneRenderer: the single owner of a canvas for the
 * primitive-3d namespace. Direct Three.js (no React Three Fiber), one
 * requestAnimationFrame loop, dt clamp, DPR cap, resize observer, visibility
 * pause, WebGL availability guard, context-loss recovery, full disposal.
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
import type { EngineFieldVector, EngineVisualState } from "@/demonstrations/renderers/lumina-2d/types";
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
  makeLabelTexture,
  materialFor,
  MAX_EMISSIVE_INTENSITY,
} from "./materials";
import {
  makeNodeState,
  stepOperator,
  type NodeState,
  type OperatorParams,
} from "./operators";
import type {
  EngineMapping,
  EngineMappingEntry,
  PrimitiveSceneRendererOptions,
  RendererStatus,
  SceneGraph,
  SceneGraphAnimation,
  SceneGraphNode,
  SceneGraphRelationship,
} from "./types";

export const MAX_DT = 0.05; // seconds; avoid huge jumps on tab refocus
export const DPR_CAP = 2;
export const DPR_CAP_MOBILE = 1.5;
const FPS_INTERVAL = 0.5; // seconds between onFps emissions
const AUTO_ORBIT_RATE = 0.06; // rad/s gentle idle orbit
const EDGE_TYPES = new Set(["flows_to", "transfers_to"]);

// Canonical-graph (graph-like scene) constants -------------------------------
// Graph scenes are rendered as an alternate projection of the same canonical
// graph the 2D diagram resolves: edges derive from scene3d.relationships,
// arrowheads attach to the destination, inhibits ends in a bar, and the
// camera is near-orthographic with heavily restricted rotation so the graph
// never degenerates into spaghetti.
const GRAPH_VIEW_DIR = new THREE.Vector3(0, 0.55, 1).normalize(); // +z, slight tilt
const GRAPH_AZIMUTH_BAND = 0.45; // rad of allowed azimuth swing around default
const GRAPH_POLAR_BAND = 0.18; // rad of allowed polar tilt around default
const Y_UP = new THREE.Vector3(0, 1, 0);
const HIGHLIGHT_TINT = new THREE.Color("#ffe9a8"); // "lights up" color
const CASCADE_STEP_MS = 260; // per-hop delay of the downstream cascade
const CASCADE_FADE_MS = 180; // fade-in duration of each cascade step
/** Focus events arriving this soon after a pointerdown are the click's own
 * focus (the canvas is tabIndex=0), not a keyboard focus — they must not seed
 * phantom keyboard focus or announce keyboard instructions. */
const POINTER_FOCUS_WINDOW_MS = 500;

/** Pure dt clamp — exported for direct unit testing (mirrors lumina-2d). */
export function clampDt(dt: number, max: number = MAX_DT): number {
  if (!Number.isFinite(dt)) return 0;
  if (dt < 0) return 0;
  return dt > max ? max : dt;
}

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
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
// Deterministic helpers (seeded PRNG for particles)
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Runtime scene record
// ---------------------------------------------------------------------------

interface OwnedMaterial {
  material: THREE.Material;
  animateOpacity: boolean;
  animateColor: boolean;
  /** Base color for selection highlight lerp (graph scenes only). */
  baseColor?: string;
}

interface RuntimeNode {
  graph: SceneGraphNode;
  group: THREE.Group;
  state: NodeState;
  owned: OwnedMaterial[];
  children: RuntimeNode[];
  trail?: {
    capacity: number;
    buffer: Float32Array;
    geometry: THREE.BufferGeometry;
    attribute: THREE.BufferAttribute;
    line: THREE.Line;
    written: number;
    last: Vec3 | null;
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

interface RuntimeEdge {
  /** The derived edge (canonical graph). Legacy flow edges carry a minimal
   * plan (no arrowhead/label) and are only drawn for non-graph scenes. */
  plan: GraphEdgePlan;
  from: RuntimeNode;
  to: RuntimeNode;
  group: THREE.Group;
  shaft: {
    geometry: THREE.BufferGeometry;
    attribute: THREE.BufferAttribute;
    line: THREE.Line;
    material: THREE.Material;
    baseColor: string;
  };
  head: { mesh: THREE.Mesh; material: THREE.Material; baseColor: string } | null;
  label: THREE.Sprite | null;
}

interface OrbitState {
  azimuth: number;
  polar: number;
  distance: number;
  target: THREE.Vector3;
  defaultAzimuth: number;
  defaultPolar: number;
  defaultDistance: number;
  userControlled: boolean;
}

const OPACITY_ANIMATORS = new Set(["fade", "pulse", "reveal"]);
const COLOR_ANIMATORS = new Set(["change_color"]);

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

/** Sentinel mapping body keys for grid-driven objects (see EngineMapping). */
const FIELD_BODY = "@field";
const SURFACE_BODY = "@surface";

/** Bilinear sample of a row-major values grid at continuous (gx, gy) cells. */
function sampleBilinear(
  gx: number,
  gy: number,
  width: number,
  height: number,
  values: number[]
): number {
  if (width < 2 || height < 2) return values[0] ?? 0;
  const x = clampNum(gx, 0, width - 1);
  const y = clampNum(gy, 0, height - 1);
  const x0 = Math.min(Math.floor(x), width - 2);
  const y0 = Math.min(Math.floor(y), height - 2);
  const fx = x - x0;
  const fy = y - y0;
  const i0 = x0 + y0 * width;
  return (
    values[i0] * (1 - fx) * (1 - fy) +
    values[i0 + 1] * fx * (1 - fy) +
    values[i0 + width] * (1 - fx) * fy +
    values[i0 + width + 1] * fx * fy
  );
}

/** Bilinear sample of a row-major field-vector grid (cell index j*width+i). */
function sampleFieldBilinear(
  gx: number,
  gy: number,
  width: number,
  height: number,
  vectors: EngineFieldVector[]
): EngineFieldVector {
  const fallback: EngineFieldVector = { x: 0, y: 0, ex: 0, ey: 0, magnitude: 0 };
  if (width < 2 || height < 2) return vectors[0] ?? fallback;
  const x = clampNum(gx, 0, width - 1);
  const y = clampNum(gy, 0, height - 1);
  const x0 = Math.min(Math.floor(x), width - 2);
  const y0 = Math.min(Math.floor(y), height - 2);
  const fx = x - x0;
  const fy = y - y0;
  const i0 = x0 + y0 * width;
  const mix = (
    a: number,
    b: number,
    c: number,
    d: number
  ) => a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  const v00 = vectors[i0];
  const v10 = vectors[i0 + 1];
  const v01 = vectors[i0 + width];
  const v11 = vectors[i0 + width + 1];
  if (!v00 || !v10 || !v01 || !v11) return fallback;
  const ex = mix(v00.ex, v10.ex, v01.ex, v11.ex);
  const ey = mix(v00.ey, v10.ey, v01.ey, v11.ey);
  return { x: 0, y: 0, ex, ey, magnitude: Math.hypot(ex, ey) };
}

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
  private animationsByTarget = new Map<string, SceneGraphAnimation[]>();
  private disposables: Array<{ dispose(): void }> = [];

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
  /** BFS downstream order from the selected node (cascade). */
  private cascadeNodes: string[] = [];
  private cascadeStart = 0;
  /** Causal path of the selected/hovered edge (nodes and edges). */
  private edgePathNodes = new Set<string>();
  private edgePathEdges = new Set<string>();
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
    this.buildScene(graph);
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

    this.runtime = new Map();
    this.roots = [];
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
        if (from && to) this.buildGraphEdge(from, to, plan);
      }
    } else {
      for (const rel of graph.relationships) {
        if (!EDGE_TYPES.has(rel.type)) continue;
        const from = this.runtime.get(rel.from);
        const to = this.runtime.get(rel.to);
        if (from && to) this.buildFlowEdge(from, to, rel);
      }
    }

    // Keyboard interaction: graph nodes are reachable via the focused canvas.
    this.canvas.tabIndex = this.graphMode ? 0 : this.canvas.tabIndex;

    this.frameCamera(graph);
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
    };
    this.runtime.set(node.id, rn);

    if (node.kind !== "group") this.buildVisual(rn, node, holder);
    if (node.kind !== "label" && node.label !== undefined) {
      this.buildLabelSprite(rn, node, holder);
    }
    if (this.graphMode && node.kind !== "group") {
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

  private buildVisual(rn: RuntimeNode, node: SceneGraphNode, holder: THREE.Group): void {
    const color = node.color;
    const size = node.size;

    switch (node.kind) {
      case "sphere": {
        const geo = new THREE.SphereGeometry(size * 0.5, 24, 16);
        holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
        this.trackDisposable(geo);
        break;
      }
      case "box": {
        const geo = new THREE.BoxGeometry(size, size, size);
        holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
        this.trackDisposable(geo);
        break;
      }
      case "plane": {
        const geo = new THREE.PlaneGeometry(size, size);
        const mesh = new THREE.Mesh(geo, materialFor(node.kind, color));
        mesh.rotation.x = -Math.PI / 2;
        holder.add(mesh);
        this.trackDisposable(geo);
        break;
      }
      case "ring": {
        const geo = new THREE.RingGeometry(size * 0.35, size * 0.5, 28);
        const mesh = new THREE.Mesh(geo, materialFor(node.kind, color));
        mesh.rotation.x = -Math.PI / 2;
        holder.add(mesh);
        this.trackDisposable(geo);
        break;
      }
      case "arrow": {
        const shaft = new THREE.CylinderGeometry(
          size * 0.05,
          size * 0.05,
          size * 0.6,
          8
        );
        const tip = new THREE.ConeGeometry(size * 0.16, size * 0.3, 12);
        const mat = materialFor(node.kind, color);
        const tipMesh = new THREE.Mesh(tip, mat);
        tipMesh.position.y = size * 0.45;
        holder.add(new THREE.Mesh(shaft, mat));
        holder.add(tipMesh);
        this.trackDisposable(shaft);
        this.trackDisposable(tip);
        break;
      }
      case "line":
      case "process_edge": {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, size]), 3)
        );
        holder.add(new THREE.Line(geo, materialFor("line", color)));
        this.trackDisposable(geo);
        break;
      }
      case "orbit_path": {
        const segments = 64;
        const pts = new Float32Array((segments + 1) * 3);
        const radius = size * 0.5;
        for (let i = 0; i <= segments; i++) {
          const a = (i / segments) * Math.PI * 2;
          pts[i * 3] = radius * Math.cos(a);
          pts[i * 3 + 1] = 0;
          pts[i * 3 + 2] = radius * Math.sin(a);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
        holder.add(new THREE.Line(geo, materialFor("line", color)));
        this.trackDisposable(geo);
        break;
      }
      case "trail": {
        const capacity = Math.max(2, node.trailPoints);
        const buffer = new Float32Array(capacity * 3);
        const geo = new THREE.BufferGeometry();
        const attribute = new THREE.BufferAttribute(buffer, 3);
        geo.setAttribute("position", attribute);
        geo.setDrawRange(0, 0);
        const line = new THREE.Line(geo, materialFor("line", color));
        holder.add(line);
        rn.trail = {
          capacity,
          buffer,
          geometry: geo,
          attribute,
          line,
          written: 0,
          last: null,
        };
        this.trackDisposable(geo);
        break;
      }
      case "graph_surface": {
        const n = 12;
        const pts = new Float32Array((n + 1) * 2 * 2 * 3);
        let w = 0;
        for (let i = 0; i <= n; i++) {
          const t = (i / n - 0.5) * size;
          for (const s of [-1, 1]) {
            pts[w++] = t;
            pts[w++] = 0;
            pts[w++] = s * size * 0.5;
            pts[w++] = t;
            pts[w++] = 0;
            pts[w++] = -s * size * 0.5;
          }
        }
        for (let i = 0; i <= n; i++) {
          const t = (i / n - 0.5) * size;
          for (const s of [-1, 1]) {
            pts[w++] = s * size * 0.5;
            pts[w++] = 0;
            pts[w++] = t;
            pts[w++] = -s * size * 0.5;
            pts[w++] = 0;
            pts[w++] = t;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
        holder.add(new THREE.LineSegments(geo, materialFor("line", color)));
        this.trackDisposable(geo);
        break;
      }
      case "wave_surface": {
        const segments = 24;
        const geo = new THREE.PlaneGeometry(size, size, segments, segments);
        const attribute = geo.attributes.position as THREE.BufferAttribute;
        const base = new Float32Array(attribute.array);
        const mesh = new THREE.Mesh(geo, materialFor(node.kind, color));
        mesh.rotation.x = -Math.PI / 2;
        holder.add(mesh);
        rn.wave = { attribute, base, size };
        this.trackDisposable(geo);
        break;
      }
      case "particle_field": {
        const count = node.particleCount;
        const half = size * 0.5;
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const rng = mulberry32(hashString(node.id));
        for (let i = 0; i < count; i++) {
          positions[i * 3] = (rng() * 2 - 1) * half;
          positions[i * 3 + 1] = (rng() * 2 - 1) * half;
          positions[i * 3 + 2] = (rng() * 2 - 1) * half;
          const speed = 0.4 + rng() * 0.8;
          const phi = rng() * Math.PI * 2;
          const theta = rng() * Math.PI;
          velocities[i * 3] = speed * Math.sin(theta) * Math.cos(phi);
          velocities[i * 3 + 1] = speed * Math.cos(theta);
          velocities[i * 3 + 2] = speed * Math.sin(theta) * Math.sin(phi);
        }
        const geo = new THREE.BufferGeometry();
        const attribute = new THREE.BufferAttribute(positions, 3);
        geo.setAttribute("position", attribute);
        const points = new THREE.Points(geo, materialFor(node.kind, color));
        holder.add(points);
        rn.particles = { count, half, positions, velocities, attribute };
        this.trackDisposable(geo);
        break;
      }
      case "vector_field": {
        const grid = 4;
        const span = size;
        const len = span * 0.22;
        const ticks = grid * grid;
        const pts = new Float32Array(ticks * 2 * 3);
        const origins = new Float32Array(ticks * 3);
        for (let i = 0; i < grid; i++) {
          for (let j = 0; j < grid; j++) {
            const k = i * grid + j;
            const ox = (i / (grid - 1) - 0.5) * span;
            const oz = (j / (grid - 1) - 0.5) * span;
            origins[k * 3] = ox;
            origins[k * 3 + 1] = 0;
            origins[k * 3 + 2] = oz;
            // tick from base to base + (0, len, 0)
            pts[k * 6] = ox;
            pts[k * 6 + 1] = 0;
            pts[k * 6 + 2] = oz;
            pts[k * 6 + 3] = ox;
            pts[k * 6 + 4] = len;
            pts[k * 6 + 5] = oz;
          }
        }
        const geo = new THREE.BufferGeometry();
        const attribute = new THREE.BufferAttribute(pts, 3);
        geo.setAttribute("position", attribute);
        holder.add(
          new THREE.LineSegments(geo, materialFor("vector_field", color))
        );
        rn.vectorTicks = { attribute, origins, grid, span, len };
        this.trackDisposable(geo);
        break;
      }
      case "process_node": {
        const geo = new THREE.SphereGeometry(size * 0.5, 16, 12);
        holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
        this.trackDisposable(geo);
        break;
      }
      case "energy_packet": {
        const geo = new THREE.SphereGeometry(size * 0.5, 12, 8);
        holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
        this.trackDisposable(geo);
        break;
      }
      case "camera_marker": {
        const geo = new THREE.OctahedronGeometry(size * 0.4);
        holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
        this.trackDisposable(geo);
        break;
      }
      case "label": {
        const texture = makeLabelTexture(node.label ?? node.id, {
          dark: this.graph?.background === "dark",
        });
        const material = new THREE.SpriteMaterial({
          map: texture,
          depthTest: false,
          transparent: true,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(size * 2.2, size * 0.5, 1);
        holder.add(sprite);
        this.trackDisposable(texture);
        break;
      }
      case "group": {
        break;
      }
      default: {
        // Compile-time exhaustiveness: adding a new PrimitiveKind without a
        // case here stops typechecking.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const never: never = node.kind;
        return;
      }
    }

    // Per-node material clones when opacity or color is animated, so shared
    // cached materials are never mutated. Graph scenes clone every material
    // so selection dimming/highlighting can run per node.
    const anims = this.animationsByTarget.get(node.id) ?? [];
    const animateOpacity = anims.some((a) => OPACITY_ANIMATORS.has(a.operator));
    const animateColor = anims.some((a) => COLOR_ANIMATORS.has(a.operator));
    if (animateOpacity || animateColor || this.graphMode) {
      this.cloneMaterials(holder, rn, animateOpacity || this.graphMode, animateColor);
    }
  }

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

  private buildLabelSprite(
    rn: RuntimeNode,
    node: SceneGraphNode,
    holder: THREE.Group
  ): void {
    const texture = makeLabelTexture(node.label ?? node.id, {
      dark: this.graph?.background === "dark",
    });
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.y = node.size * 0.9 + 0.4;
    sprite.scale.set(Math.min(node.size, 2) * 2.2, Math.min(node.size, 2) * 0.5, 1);
    holder.add(sprite);
    this.trackDisposable(texture);
    if (this.graphMode) {
      // Labels stay locked above their nodes and always face the camera
      // (sprites). In graph scenes they participate in selection dimming.
      rn.owned.push({
        material,
        animateOpacity: true,
        animateColor: false,
        baseColor: undefined,
      });
    }
  }

  /**
   * Build a derived graph edge: shaft line from → to, arrowhead cone at the
   * DESTINATION (or a `—|` bar for inhibits), and the relationship label
   * mid-edge. All materials are per-edge clones so dim/highlight never touch
   * the shared cache.
   */
  private buildGraphEdge(
    from: RuntimeNode,
    to: RuntimeNode,
    plan: GraphEdgePlan
  ): void {
    const group = new THREE.Group();
    group.name = `edge:${plan.id}`;

    const geo = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(new Float32Array(6), 3);
    attribute.setXYZ(0, from.graph.position.x, from.graph.position.y, from.graph.position.z);
    attribute.setXYZ(1, to.graph.position.x, to.graph.position.y, to.graph.position.z);
    geo.setAttribute("position", attribute);
    const lineMaterial = materialFor("line", from.graph.color).clone();
    lineMaterial.transparent = true;
    const line = new THREE.Line(geo, lineMaterial);
    group.add(line);
    this.trackDisposable(geo);

    const toColor = to.graph.color;
    let head: RuntimeEdge["head"] = null;
    if (plan.inhibits) {
      const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(toColor),
      });
      material.transparent = true;
      const bar = new THREE.Mesh(barGeo, material);
      group.add(bar);
      head = { mesh: bar, material, baseColor: toColor };
      this.trackDisposable(barGeo);
    } else {
      const tipGeo = new THREE.ConeGeometry(0.15, 0.36, 10);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(toColor),
      });
      material.transparent = true;
      const tip = new THREE.Mesh(tipGeo, material);
      group.add(tip);
      head = { mesh: tip, material, baseColor: toColor };
      this.trackDisposable(tipGeo);
    }

    let label: THREE.Sprite | null = null;
    const labelText = plan.label;
    if (labelText) {
      const texture = makeLabelTexture(labelText, {
        dark: this.graph?.background === "dark",
      });
      const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(1.9, 0.42, 1);
      group.add(sprite);
      this.trackDisposable(texture);
      label = sprite;
    }

    this.scene?.add(group);
    this.edges.push({
      plan,
      from,
      to,
      group,
      shaft: {
        geometry: geo,
        attribute,
        line,
        material: lineMaterial,
        baseColor: from.graph.color,
      },
      head,
      label,
    });
    this.pickEdges.set(group, plan.id);
  }

  /** Legacy plain edge (flows_to / transfers_to only, non-graph scenes). */
  private buildFlowEdge(
    from: RuntimeNode,
    to: RuntimeNode,
    rel: SceneGraphRelationship
  ): void {
    const group = new THREE.Group();
    group.name = `edge:${rel.id}`;
    const geo = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(new Float32Array(6), 3);
    attribute.setXYZ(0, from.graph.position.x, from.graph.position.y, from.graph.position.z);
    attribute.setXYZ(1, to.graph.position.x, to.graph.position.y, to.graph.position.z);
    geo.setAttribute("position", attribute);
    const line = new THREE.Line(geo, materialFor("line", from.graph.color));
    group.add(line);
    this.scene?.add(group);
    this.trackDisposable(geo);
    this.edges.push({
      plan: {
        id: rel.id,
        type: rel.type,
        label: rel.label ?? rel.type,
        fromId: rel.from,
        toId: rel.to,
        from: from.graph.position,
        to: to.graph.position,
        inhibits: false,
      },
      from,
      to,
      group,
      shaft: {
        geometry: geo,
        attribute,
        line,
        material: materialFor("line", from.graph.color),
        baseColor: from.graph.color,
      },
      head: null,
      label: null,
    });
  }

  private frameCamera(graph: SceneGraph): void {
    let camera = this.camera;
    if (!camera) return;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const n of graph.nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      minZ = Math.min(minZ, n.position.z);
      maxX = Math.max(maxX, n.position.x);
      maxY = Math.max(maxY, n.position.y);
      maxZ = Math.max(maxZ, n.position.z);
    }
    const hasNodes = Number.isFinite(minX);
    const center = new THREE.Vector3(
      hasNodes ? (minX + maxX) / 2 : 0,
      hasNodes ? (minY + maxY) / 2 : 0,
      hasNodes ? (minZ + maxZ) / 2 : 0
    );
    const diagonal = hasNodes
      ? Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
      : 0;
    const distance = clampNum(diagonal * 2.2, 4, 120);

    if (this.graphMode) {
      // Near-orthographic default for canonical graphs: the graph lives in a
      // plane, so a flat projection keeps it readable and never turns it into
      // spaghetti. Rotation is clamped to a narrow band around the default.
      if (!(camera instanceof THREE.OrthographicCamera)) {
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
        camera = this.camera;
      }
      this.orthoBaseHalf = Math.max(diagonal * 0.72, 1.4);
      const dir = GRAPH_VIEW_DIR;
      const pos = center.clone().addScaledVector(dir, distance);
      camera.position.copy(pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(center);
      this.orbit.target.copy(center);
      this.orbit.distance = distance;
      this.orbit.defaultDistance = distance;
      this.orbit.defaultAzimuth = Math.atan2(dir.x, dir.z);
      this.orbit.defaultPolar = Math.acos(dir.y / dir.length());
      this.orbit.azimuth = this.orbit.defaultAzimuth;
      this.orbit.polar = this.orbit.defaultPolar;
      this.orbit.userControlled = false;
      return;
    }

    if (!(camera instanceof THREE.PerspectiveCamera)) {
      this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
      camera = this.camera;
    }
    const dir = new THREE.Vector3(1, 0.65, 1.35).normalize();
    const pos = center.clone().addScaledVector(dir, distance);
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(center);

    this.orbit.target.copy(center);
    this.orbit.distance = distance;
    this.orbit.defaultDistance = distance;
    this.orbit.defaultAzimuth = Math.atan2(dir.x, dir.z);
    this.orbit.defaultPolar = Math.acos(dir.y);
    this.orbit.azimuth = this.orbit.defaultAzimuth;
    this.orbit.polar = this.orbit.defaultPolar;
    this.orbit.userControlled = false;
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
    this.orbit.distance = this.orbit.defaultDistance;
    this.orbit.userControlled = false;
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
    this.scene.updateMatrixWorld(true);
    for (const rn of this.runtime.values()) this.applyTransforms(rn);
    for (const rn of this.runtime.values()) this.updateKind(rn, dt);
    for (const edge of this.edges) this.updateEdge(edge);
    if (this.graphMode) this.applySelectionVisuals();
    if (!this.options.reducedMotion && !this.orbit.userControlled && !this.graphMode) {
      this.orbit.azimuth += AUTO_ORBIT_RATE * dt;
    }
    this.applyCamera();
  }

  // -------------------------------------------------------------------------
  // Canonical-state coupling (hybrid showcases)
  // -------------------------------------------------------------------------

  /** The engine body position owning a node, or null when not engine-owned. */
  private engineBodyPosition(rn: RuntimeNode): { x: number; y: number } | null {
    const mapping = this.engineMapping?.[rn.graph.id];
    if (!mapping || !this.engineState?.bodies) return null;
    const body = this.engineState.bodies[mapping.body];
    if (!body) return null;
    return { x: body.x, y: body.y };
  }

  /** Mapping entry for a vector_field node when a field grid is present. */
  private engineFieldEntry(rn: RuntimeNode): EngineMappingEntry | null {
    if (!this.engineState?.field) return null;
    const entry = this.engineMapping?.[rn.graph.id];
    return entry && entry.body === FIELD_BODY ? entry : null;
  }

  /** Mapping entry for a wave_surface node when a surface grid is present. */
  private engineSurfaceEntry(rn: RuntimeNode): EngineMappingEntry | null {
    if (!this.engineState?.surface) return null;
    const entry = this.engineMapping?.[rn.graph.id];
    return entry && entry.body === SURFACE_BODY ? entry : null;
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
      state = stepOperator(
        { operator: anim.operator, params },
        state,
        dt,
        time,
        { reducedMotion: this.options.reducedMotion }
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

  private updateKind(rn: RuntimeNode, dt: number): void {
    const s = rn.state;
    const scene = this.scene;
    if (!scene) return;

    if (rn.particles && s.emitting && dt > 0) {
      const p = rn.particles;
      for (let i = 0; i < p.count; i++) {
        p.positions[i * 3] += p.velocities[i * 3] * dt;
        p.positions[i * 3 + 1] += p.velocities[i * 3 + 1] * dt;
        p.positions[i * 3 + 2] += p.velocities[i * 3 + 2] * dt;
        for (let k = 0; k < 3; k++) {
          const v = p.positions[i * 3 + k];
          if (v > p.half) {
            p.positions[i * 3 + k] = p.half;
            p.velocities[i * 3 + k] = -Math.abs(p.velocities[i * 3 + k]) * 0.9;
          } else if (v < -p.half) {
            p.positions[i * 3 + k] = -p.half;
            p.velocities[i * 3 + k] = Math.abs(p.velocities[i * 3 + k]) * 0.9;
          }
        }
      }
      p.attribute.needsUpdate = true;
    }

    if (rn.wave) {
      const w = rn.wave;
      const surfaceEntry = this.engineSurfaceEntry(rn);
      if (surfaceEntry) {
        this.applyEngineSurface(w, surfaceEntry);
      } else {
        const wavelength = Math.max(0.001, w.size / 3);
        const amplitude = w.size * 0.15;
        for (let i = 0; i < w.base.length; i += 3) {
          const x = w.base[i];
          // Displace the local y (world z after the -90deg x rotation).
          w.attribute.array[i + 1] =
            amplitude * Math.sin(Math.PI * 2 * (x / wavelength + this.time * 0.5));
        }
        w.attribute.needsUpdate = true;
      }
    }

    if (rn.vectorTicks) {
      const vt = rn.vectorTicks;
      const fieldEntry = this.engineFieldEntry(rn);
      if (fieldEntry) {
        this.applyEngineField(vt, fieldEntry);
      } else {
        const v = s.vector;
        for (let k = 0; k < vt.origins.length / 3; k++) {
          const ox = vt.origins[k * 3];
          const oy = vt.origins[k * 3 + 1];
          const oz = vt.origins[k * 3 + 2];
          vt.attribute.array[k * 6] = ox;
          vt.attribute.array[k * 6 + 1] = oy;
          vt.attribute.array[k * 6 + 2] = oz;
          vt.attribute.array[k * 6 + 3] = ox + v.x * vt.len;
          vt.attribute.array[k * 6 + 4] = oy + v.y * vt.len;
          vt.attribute.array[k * 6 + 5] = oz + v.z * vt.len;
        }
        vt.attribute.needsUpdate = true;
      }
    }

    if (rn.trail && dt > 0) {
      this.pushTrailPoint(rn);
    }
  }

  /**
   * Drive a wave_surface mesh from the engine's u field. The mesh is rotated
   * -90° about x, so local +y maps to world -z; the engine's normalized y
   * (row/GH - 0.5, positive toward +z) therefore samples the flipped row:
   *   engineY = (0.5 - localY/size) - 0.5 = -localY/size
   * Heights are written into the local y channel (same visual language as the
   * operator-driven ripples), additively on top of the base plane so the
   * surface keeps its in-plane spread. Bilinear-sampled from the engine grid,
   * values clamped to ±1 before scaling.
   */
  private applyEngineSurface(
    w: NonNullable<RuntimeNode["wave"]>,
    entry: EngineMappingEntry
  ): void {
    const surface = this.engineState?.surface;
    if (!surface) return;
    const { width, height, values } = surface;
    const dispScale = w.size * 0.15; // matches the operator ripple amplitude
    const inv = 1 / entry.scale;
    const ox = entry.offsetX ?? 0;
    const oy = entry.offsetY ?? 0;
    for (let i = 0; i < w.base.length; i += 3) {
      const lx = w.base[i];
      const ly = w.base[i + 1];
      const gx = ((lx - ox) * inv + 0.5) * width;
      const gy = (-(ly - oy) * inv + 0.5) * height;
      const value = sampleBilinear(gx, gy, width, height, values);
      w.attribute.array[i + 1] =
        w.base[i + 1] + clampNum(value, -1, 1) * dispScale;
    }
    w.attribute.needsUpdate = true;
  }

  /**
   * Drive a vector_field's arrows from the engine's field grid. Each arrow
   * samples the grid at its own world position (mapped back through the
   * curated entry scale/offsets); the direction follows (ex, 0, ey) and the
   * length is bounded by the field maximum in the current state, so arrows
   * near charges compress rather than explode.
   */
  private applyEngineField(
    vt: NonNullable<RuntimeNode["vectorTicks"]>,
    entry: EngineMappingEntry
  ): void {
    const field = this.engineState?.field;
    if (!field) return;
    const { width, height, vectors, span } = field;
    const maxMag = this.engineFieldMaxMag > 0 ? this.engineFieldMaxMag : 1;
    const inv = 1 / entry.scale;
    const ox = entry.offsetX ?? 0;
    const oy = entry.offsetY ?? 0;
    const invSpan = 1 / (2 * span);
    for (let k = 0; k < vt.origins.length / 3; k++) {
      const oxW = vt.origins[k * 3];
      const ozW = vt.origins[k * 3 + 2];
      const px = (oxW - ox) * inv;
      const py = (ozW - oy) * inv;
      const gx = (px * invSpan + 0.5) * width;
      const gy = (py * invSpan + 0.5) * height;
      const sample = sampleFieldBilinear(gx, gy, width, height, vectors);
      const mag = sample.magnitude;
      const len =
        mag > 1e-6
          ? vt.len * Math.max(0.08, Math.sqrt(Math.min(1, mag / maxMag)))
          : 0;
      const dirX = mag > 1e-6 ? sample.ex / mag : 0;
      const dirY = mag > 1e-6 ? sample.ey / mag : 0;
      vt.attribute.array[k * 6] = oxW;
      vt.attribute.array[k * 6 + 1] = 0;
      vt.attribute.array[k * 6 + 2] = ozW;
      // engine (ex, ey) → world (x, z): the field lives in the plane.
      vt.attribute.array[k * 6 + 3] = oxW + dirX * len;
      vt.attribute.array[k * 6 + 4] = 0;
      vt.attribute.array[k * 6 + 5] = ozW + dirY * len;
    }
    vt.attribute.needsUpdate = true;
  }

  private pushTrailPoint(rn: RuntimeNode): void {
    const t = rn.trail;
    if (!t) return;
    const world = new THREE.Vector3();
    rn.group.getWorldPosition(world);
    const x = world.x;
    const y = world.y;
    const z = world.z;
    if (
      t.last &&
      Math.abs(t.last.x - x) < 1e-6 &&
      Math.abs(t.last.y - y) < 1e-6 &&
      Math.abs(t.last.z - z) < 1e-6
    ) {
      return; // stationary: do not duplicate points
    }
    if (t.written < t.capacity) {
      t.buffer[t.written * 3] = x;
      t.buffer[t.written * 3 + 1] = y;
      t.buffer[t.written * 3 + 2] = z;
      t.written++;
    } else {
      t.buffer.copyWithin(0, 3, t.capacity * 3);
      t.buffer[(t.capacity - 1) * 3] = x;
      t.buffer[(t.capacity - 1) * 3 + 1] = y;
      t.buffer[(t.capacity - 1) * 3 + 2] = z;
    }
    t.last = { x, y, z };
    t.geometry.setDrawRange(0, t.written);
    t.attribute.needsUpdate = true;
  }

  private updateEdge(edge: RuntimeEdge): void {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    edge.from.group.getWorldPosition(from);
    edge.to.group.getWorldPosition(to);
    edge.shaft.attribute.setXYZ(0, from.x, from.y, from.z);
    edge.shaft.attribute.setXYZ(1, to.x, to.y, to.z);
    edge.shaft.attribute.needsUpdate = true;

    const head = edge.head;
    if (!head) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    // Head anchors at the DESTINATION node, just outside its radius.
    const nodeRadius = Math.max(0.25, edge.to.graph.size * 0.5);
    const inset = nodeRadius + 0.22;
    head.mesh.position.set(
      to.x - ux * inset,
      to.y - uy * inset,
      to.z - uz * inset
    );
    if (edge.plan.inhibits) {
      // `—|` bar: perpendicular to the edge direction at the destination.
      let px = -uy;
      let py = ux;
      let pz = 0;
      const plen = Math.hypot(px, py, pz);
      if (plen < 1e-6) {
        // Edge runs along z (no in-plane perpendicular): fall back to x-z.
        px = 0;
        py = -uz;
        pz = uy;
      } else {
        px /= plen;
        py /= plen;
        pz /= plen;
      }
      head.mesh.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(px, py, pz));
    } else {
      head.mesh.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(ux, uy, uz));
    }
    if (edge.label) {
      edge.label.position.set(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2 + 0.5,
        (from.z + to.z) / 2
      );
    }
  }

  private applyCamera(): void {
    const camera = this.camera;
    if (!camera) return;
    const { azimuth, polar, distance, target } = this.orbit;
    const sp = Math.sin(polar);
    const cp = Math.cos(polar);
    camera.position.set(
      target.x + distance * sp * Math.sin(azimuth),
      target.y + distance * cp,
      target.z + distance * sp * Math.cos(azimuth)
    );
    camera.lookAt(target);
    if (camera instanceof THREE.OrthographicCamera) {
      // Zoom = frustum scaling; distance is the zoom factor (larger = out).
      const halfH = this.orthoBaseHalf * (distance / this.orbit.defaultDistance);
      const halfW = halfH * this.cameraAspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
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
      if (this.graphMode) this.clampGraphOrbit();
      return;
    }
    // Edge hover: dim everything outside the hovered edge's causal path
    // (visual only — no callbacks; ignored while a selection is active).
    if (this.graphMode && this.selectedNodeId === null && this.selectedEdgeId === null) {
      this.hoverPick(e.clientX, e.clientY);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.dragging = false;
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

  /** Graph scenes: rotation is heavily restricted so the graph never turns
   * into spaghetti — a narrow azimuth swing and a small tilt band. */
  private clampGraphOrbit(): void {
    this.orbit.azimuth = clampNum(
      this.orbit.azimuth,
      this.orbit.defaultAzimuth - GRAPH_AZIMUTH_BAND,
      this.orbit.defaultAzimuth + GRAPH_AZIMUTH_BAND
    );
    this.orbit.polar = clampNum(
      this.orbit.polar,
      this.orbit.defaultPolar - GRAPH_POLAR_BAND,
      this.orbit.defaultPolar + GRAPH_POLAR_BAND
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
    if (!this.graphMode) return;
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
    if (!this.graphMode) return;
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

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.graphMode) return;
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
      const baseOpacity = rn.state.opacity;
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
