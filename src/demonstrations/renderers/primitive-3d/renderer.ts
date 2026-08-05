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
import type { DemoSpecV1, PrimitiveKind, Vec3 } from "@/demonstrations/spec/demo-spec";
import { buildSceneGraph } from "./scene-graph";
import {
  disposeMaterials,
  makeLabelTexture,
  materialFor,
} from "./materials";
import {
  makeNodeState,
  stepOperator,
  type NodeState,
  type OperatorParams,
} from "./operators";
import type {
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
  from: RuntimeNode;
  to: RuntimeNode;
  geometry: THREE.BufferGeometry;
  attribute: THREE.BufferAttribute;
  line: THREE.Line;
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

export class PrimitiveSceneRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly options: Required<
    Pick<PrimitiveSceneRendererOptions, "reducedMotion" | "mobile">
  > &
    PrimitiveSceneRendererOptions;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  private graph: SceneGraph | null = null;
  private spec: DemoSpecV1 | null = null;
  private lastReasons: string[] = [];
  private nodeById = new Map<string, SceneGraphNode>();
  private runtime = new Map<string, RuntimeNode>();
  private roots: RuntimeNode[] = [];
  private edges: RuntimeEdge[] = [];
  private animationsByTarget = new Map<string, SceneGraphAnimation[]>();
  private disposables: Array<{ dispose(): void }> = [];

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
  private fpsFrames = 0;

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

  /** Build the scene from a spec; fully disposes the previous scene. */
  setSpec(spec: DemoSpecV1): void {
    this.spec = spec;
    if (this.webglFailed || this.disposed) return;
    const { graph, reasons } = buildSceneGraph(spec, {
      mobile: this.options.mobile,
    });
    this.lastReasons = reasons;
    this.disposeScene(true);
    this.graph = graph;
    this.nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    this.animationsByTarget = new Map<string, SceneGraphAnimation[]>();
    for (const anim of graph.animations) {
      const list = this.animationsByTarget.get(anim.target) ?? [];
      list.push(anim);
      this.animationsByTarget.set(anim.target, list);
    }
    this.buildScene(graph);
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
    const childSet = new Set<string>();
    for (const n of graph.nodes) for (const c of n.children) childSet.add(c);
    for (const node of graph.nodes) {
      if (!childSet.has(node.id)) {
        const rn = this.buildNode(node, null);
        this.roots.push(rn);
      }
    }

    // Relationship edges (flows_to / transfers_to) drawn as lines.
    this.edges = [];
    for (const rel of graph.relationships) {
      if (!EDGE_TYPES.has(rel.type)) continue;
      const from = this.runtime.get(rel.from);
      const to = this.runtime.get(rel.to);
      if (from && to) this.buildEdge(from, to, rel);
    }

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
    // cached materials are never mutated.
    const anims = this.animationsByTarget.get(node.id) ?? [];
    const animateOpacity = anims.some((a) => OPACITY_ANIMATORS.has(a.operator));
    const animateColor = anims.some((a) => COLOR_ANIMATORS.has(a.operator));
    if (animateOpacity || animateColor) {
      this.cloneMaterials(holder, rn, animateOpacity, animateColor);
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
      rn.owned.push({ material: clone, animateOpacity, animateColor });
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
  }

  private buildEdge(
    from: RuntimeNode,
    to: RuntimeNode,
    rel: SceneGraphRelationship
  ): void {
    const geo = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(new Float32Array(6), 3);
    attribute.setXYZ(0, from.graph.position.x, from.graph.position.y, from.graph.position.z);
    attribute.setXYZ(1, to.graph.position.x, to.graph.position.y, to.graph.position.z);
    geo.setAttribute("position", attribute);
    const line = new THREE.Line(geo, materialFor("line", from.graph.color));
    line.name = `edge:${rel.id}`;
    this.scene?.add(line);
    this.edges.push({ from, to, geometry: geo, attribute, line });
    this.trackDisposable(geo);
  }

  private frameCamera(graph: SceneGraph): void {
    const camera = this.camera;
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
    if (this.camera) {
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

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= FPS_INTERVAL && this.options.onFps) {
      this.options.onFps(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  }

  private updateScene(dt: number, time: number): void {
    if (!this.scene || !this.graph) return;
    for (const rn of this.runtime.values()) this.applyAnimations(rn, dt, time);
    this.scene.updateMatrixWorld(true);
    for (const rn of this.runtime.values()) this.applyTransforms(rn);
    for (const rn of this.runtime.values()) this.updateKind(rn, dt);
    for (const edge of this.edges) this.updateEdge(edge);
    if (!this.options.reducedMotion && !this.orbit.userControlled) {
      this.orbit.azimuth += AUTO_ORBIT_RATE * dt;
    }
    this.applyCamera();
  }

  private applyAnimations(rn: RuntimeNode, dt: number, time: number): void {
    const anims = this.animationsByTarget.get(rn.graph.id);
    if (!anims || anims.length === 0) return;
    let state = rn.state;
    for (const anim of anims) {
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

    if (rn.vectorTicks) {
      const vt = rn.vectorTicks;
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

    if (rn.trail && dt > 0) {
      this.pushTrailPoint(rn);
    }
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
    edge.attribute.setXYZ(0, from.x, from.y, from.z);
    edge.attribute.setXYZ(1, to.x, to.y, to.z);
    edge.attribute.needsUpdate = true;
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
  }

  // -------------------------------------------------------------------------
  // Pointer input (minimal custom orbit: drag rotate, wheel zoom)
  // -------------------------------------------------------------------------

  private onPointerDown(e: PointerEvent): void {
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
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.orbit.azimuth -= dx * 0.005;
    this.orbit.polar = clampNum(this.orbit.polar - dy * 0.005, 0.05, Math.PI - 0.05);
  }

  private onPointerUp(): void {
    this.dragging = false;
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

  // -------------------------------------------------------------------------
  // Lifecycle: events, visibility, context loss, disposal
  // -------------------------------------------------------------------------

  private readonly boundLoop = (now: number) => this.loop(now);
  private readonly boundVisibility = () => this.onVisibilityChange();
  private readonly boundContextLost = (e: Event) => this.onContextLost(e);
  private readonly boundContextRestored = () => this.onContextRestored();
  private readonly boundPointerDown = (e: PointerEvent) => this.onPointerDown(e);
  private readonly boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private readonly boundPointerUp = () => this.onPointerUp();
  private readonly boundWheel = (e: WheelEvent) => this.onWheel(e);

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
