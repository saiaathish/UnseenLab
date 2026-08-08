/**
 * camera.ts — camera creation, framing, re-framing and orbit application for
 * the primitive-3d renderer (extracted from renderer.ts by C0; C4 (Wave 3)
 * upgrades framing to content-AABB math per design-2-presentation-gate.md §3).
 *
 * Fixes:
 *  - F-12: the frame is derived from the true content AABB (node envelopes +
 *    label rects + edge polylines + trails + engine bodies + field span) with
 *    a content-proportional margin, replacing the node-center-only bounds, the
 *    `max(diagonal*0.72, 1.4)` floor and the 1% perspective margin.
 *  - F-13: `setEngineState` re-frames over the union of static + dynamic
 *    extents — grow-only with REFRAME_HYSTERESIS, never under user control.
 *  - F-14: a swing margin (SWING_MARGIN_RATE * in-plane radius) absorbs the
 *    graph orbit band so corner labels stay inside the frustum at max swing.
 *
 * Pure decision logic (computeContentAABB, graphFrameHalfHeight,
 * perspectiveDistance, maybeReframe, canonicalViews, projectOrthoToCSS,
 * contentAABBFromGraph, dynamicExtentFromEngineState) is Three.js-free —
 * plain Vec3 data — so unit tests never mock `three` for geometry. Only
 * frameCamera / applyCamera / clampGraphOrbit touch Three objects.
 */

import * as THREE from "three";
import type { SceneGraph, EngineMapping } from "./types";
import type { EngineVisualState } from "@/demonstrations/renderers/lumina-2d/types";
import { clampNum } from "./operators";
import { nodeEnvelope as nodeLabelEnvelope, planNodeLabels } from "./labels";
import { deriveGraphEdges } from "./scene-graph";
import {
  FRAME_MARGIN_RATE,
  FRAME_MARGIN_FLOOR,
  FRAME_MARGIN_MIN,
  FRAME_MARGIN_MAX,
  SWING_MARGIN_RATE,
  REFRAME_HYSTERESIS,
} from "./presentation/constants";
import type { Rect } from "./presentation/constants";
import type { Vec3 } from "@/demonstrations/spec/demo-spec";

// Canonical-graph (graph-like scene) camera constants ------------------------
// Graph scenes are rendered as an alternate projection of the same canonical
// graph the 2D diagram resolves: the camera is near-orthographic with heavily
// restricted rotation so the graph never degenerates into spaghetti.
export const GRAPH_VIEW_DIR = new THREE.Vector3(0, 0.55, 1).normalize(); // +z, slight tilt
export const GRAPH_AZIMUTH_BAND = 0.45; // rad of allowed azimuth swing around default
export const GRAPH_POLAR_BAND = 0.18; // rad of allowed polar tilt around default

/** Default perspective fov (kept from the C0 PerspectiveCamera(50, …)). */
export const DEFAULT_FOV_DEG = 50;

/** Build-time aspect used when the canvas has not reported its size yet; the
 * stage enforces the spec's 4/3 via CSS (audit3), so this is the safe default.
 * Per-frame applyCamera uses the live canvas aspect. */
export const FRAME_ASPECT_DEFAULT = 4 / 3;

// Pure-view components of GRAPH_VIEW_DIR (no THREE in the pure math).
const VIEW_DIR_Y = 0.55;
const VIEW_DIR_Z = 1;

/** Orbit/framing state shared with the renderer's pointer controls. */
export interface OrbitState {
  azimuth: number;
  polar: number;
  distance: number;
  target: THREE.Vector3;
  defaultAzimuth: number;
  defaultPolar: number;
  defaultDistance: number;
  userControlled: boolean;
}

// ---------------------------------------------------------------------------
// Content extents (design-2 §3.1)
// ---------------------------------------------------------------------------

/** Axis-aligned world extent (plain data). */
export interface ContentExtent {
  min: Vec3;
  max: Vec3;
}

/** World envelope shape (design-2 §7.1): sphere (radius) or box/rect (halfExtents). */
export interface Envelope {
  id: string;
  kind: "node" | "field" | "ring" | "plane" | "wave" | "particle";
  shape: "sphere" | "box" | "rect";
  center: Vec3;
  halfExtents: Vec3;
  radius?: number;
}

/**
 * Everything the camera frame must cover (design-2 §3.1 — F-12). Structurally
 * compatible with the gate's GateScene (C5): a GateScene carries envelopes,
 * edges (pts polylines), labels (rects) and dynamic, so it is assignable to
 * this interface once geometry-gate.ts lands.
 */
export interface FrameScene {
  envelopes: Envelope[];
  /** Node-label + edge-label rects (placed plans; C2's layout feeds these). */
  labelRects?: Rect[];
  /** Routed edge polylines (curves pre-sampled; C3). */
  edgePolylines?: Vec3[][];
  /** World-space trail bboxes (C3 trail buffers, design-2 §4). */
  trailBounds?: ContentExtent[];
  /** World-space engine body positions with their body radius. */
  engineBodies?: Array<{ center: Vec3; radius: number }>;
  /** Mapped engine field span (tick origins + tick length). */
  engineFieldBounds?: ContentExtent | null;
}

/** Dynamic (runtime) content that can move the frame (design-2 §3.1/§3.4). */
export interface DynamicExtent {
  trailBounds?: ContentExtent[];
  engineBodies?: Array<{ center: Vec3; radius: number }>;
  engineFieldBounds?: ContentExtent | null;
}

export function contentExtentEmpty(): ContentExtent {
  return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
}

export function contentExtentCenter(aabb: ContentExtent): Vec3 {
  return {
    x: (aabb.min.x + aabb.max.x) / 2,
    y: (aabb.min.y + aabb.max.y) / 2,
    z: (aabb.min.z + aabb.max.z) / 2,
  };
}

/** Union of two extents (`b` may be null/undefined — treated as empty). */
export function unionExtent(
  a: ContentExtent,
  b: ContentExtent | null | undefined
): ContentExtent {
  if (!b) return a;
  return {
    min: {
      x: Math.min(a.min.x, b.min.x),
      y: Math.min(a.min.y, b.min.y),
      z: Math.min(a.min.z, b.min.z),
    },
    max: {
      x: Math.max(a.max.x, b.max.x),
      y: Math.max(a.max.y, b.max.y),
      z: Math.max(a.max.z, b.max.z),
    },
  };
}

function unionExtents(parts: ContentExtent[]): ContentExtent {
  let acc = contentExtentEmpty();
  let first = true;
  for (const p of parts) {
    if (first) {
      acc = p;
      first = false;
    } else {
      acc = unionExtent(acc, p);
    }
  }
  return acc;
}

/** AABB half-extent of an envelope (radius for spheres, halfExtents else). */
export function envelopeHalfExtents(env: Envelope): Vec3 {
  if (env.shape === "sphere" && env.radius !== undefined) {
    return { x: env.radius, y: env.radius, z: env.radius };
  }
  return { x: env.halfExtents.x, y: env.halfExtents.y, z: env.halfExtents.z };
}

function extentFromEnvelope(env: Envelope): ContentExtent {
  const h = envelopeHalfExtents(env);
  return {
    min: {
      x: env.center.x - h.x,
      y: env.center.y - h.y,
      z: env.center.z - h.z,
    },
    max: {
      x: env.center.x + h.x,
      y: env.center.y + h.y,
      z: env.center.z + h.z,
    },
  };
}

function extentFromRect(r: Rect): ContentExtent {
  return {
    min: { x: r.cx - r.halfW, y: r.cy - r.halfH, z: r.cz - r.halfD },
    max: { x: r.cx + r.halfW, y: r.cy + r.halfH, z: r.cz + r.halfD },
  };
}

/**
 * Content AABB over every class of rendered content (design-2 §3.1):
 * envelopes (sphere/box/rect — sizes, fields, rings, planes, waves all
 * encoded in the envelope), label rects, edge polylines, trails, engine
 * bodies and the engine field span. `dynamic` unions the runtime extents.
 */
export function computeContentAABB(
  scene: FrameScene,
  dynamic?: DynamicExtent | null
): ContentExtent {
  const parts: ContentExtent[] = [];
  for (const env of scene.envelopes) parts.push(extentFromEnvelope(env));
  for (const r of scene.labelRects ?? []) parts.push(extentFromRect(r));
  for (const poly of scene.edgePolylines ?? []) {
    if (poly.length === 0) continue;
    let min = { ...poly[0] };
    let max = { ...poly[0] };
    for (const p of poly) {
      min = {
        x: Math.min(min.x, p.x),
        y: Math.min(min.y, p.y),
        z: Math.min(min.z, p.z),
      };
      max = {
        x: Math.max(max.x, p.x),
        y: Math.max(max.y, p.y),
        z: Math.max(max.z, p.z),
      };
    }
    parts.push({ min, max });
  }
  const sceneDyn: DynamicExtent = {
    trailBounds: scene.trailBounds,
    engineBodies: scene.engineBodies,
    engineFieldBounds: scene.engineFieldBounds,
  };
  if (sceneDyn.trailBounds || sceneDyn.engineBodies || sceneDyn.engineFieldBounds) {
    parts.push(extentFromDynamic(sceneDyn));
  }
  if (
    dynamic &&
    (dynamic.trailBounds || dynamic.engineBodies || dynamic.engineFieldBounds)
  ) {
    parts.push(extentFromDynamic(dynamic));
  }
  return unionExtents(parts);
}

/** Union of the dynamic extents alone (engine bodies + trails + field span). */
export function extentFromDynamic(dynamic: DynamicExtent): ContentExtent {
  const parts: ContentExtent[] = [];
  for (const b of dynamic.trailBounds ?? []) parts.push(b);
  for (const b of dynamic.engineBodies ?? []) {
    parts.push({
      min: {
        x: b.center.x - b.radius,
        y: b.center.y - b.radius,
        z: b.center.z - b.radius,
      },
      max: {
        x: b.center.x + b.radius,
        y: b.center.y + b.radius,
        z: b.center.z + b.radius,
      },
    });
  }
  if (dynamic.engineFieldBounds) parts.push(dynamic.engineFieldBounds);
  return unionExtents(parts);
}

// ---------------------------------------------------------------------------
// Build-time content estimator (design-2 §3.1 — F-12)
// ---------------------------------------------------------------------------

/**
 * World position of every node (child positions in the scene graph are local
 * to their parent group; the renderer stacks holders, so content extents must
 * be accumulated through the parent chain).
 */
function worldPositions(graph: SceneGraph): Map<string, Vec3> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentOf = new Map<string, string>();
  for (const n of graph.nodes) {
    for (const c of n.children) parentOf.set(c, n.id);
  }
  const world = new Map<string, Vec3>();
  const resolve = (id: string): Vec3 => {
    const cached = world.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) return { x: 0, y: 0, z: 0 };
    const parent = parentOf.get(id);
    const p = parent ? resolve(parent) : { x: 0, y: 0, z: 0 };
    const w = {
      x: p.x + node.position.x,
      y: p.y + node.position.y,
      z: p.z + node.position.z,
    };
    world.set(id, w);
    return w;
  };
  for (const n of graph.nodes) resolve(n.id);
  return world;
}

/**
 * The static content the camera must frame at build time. Node envelopes come
 * from labels.ts's per-kind envelope model (design-2 §1.3 anchor table —
 * the same extents the renderer's label placement measures). Label content is
 * the ACTUAL placed plan (labels.ts planNodeLabels — the same planner the
 * renderer runs at build): the sprite box (text-measured, min(s,2)-capped) at
 * the node's world position plus the placed anchor offset. Standalone
 * `label`-kind nodes are covered by their envelope (size·1.1 × size·0.25
 * sprite box) — planNodeLabels excludes them. Group nodes contribute via
 * their children only.
 *
 * When C1's full geometry/envelopes.ts lands, this estimator can switch its
 * envelope source to it; the AABB union (computeContentAABB) is unchanged.
 */
export function contentAABBFromGraph(
  graph: SceneGraph | null,
  opts?: { graphMode?: boolean }
): ContentExtent {
  if (!graph || graph.nodes.length === 0) return contentExtentEmpty();
  const world = worldPositions(graph);
  const parts: ContentExtent[] = [];
  for (const node of graph.nodes) {
    if (node.kind === "group") continue;
    const pos = world.get(node.id) ?? node.position;
    const env = nodeLabelEnvelope({
      id: node.id,
      kind: node.kind,
      position: pos,
      size: node.size,
    });
    parts.push({
      min: {
        x: env.center.x - env.halfExtents.x,
        y: env.center.y - env.halfExtents.y,
        z: env.center.z - env.halfExtents.z,
      },
      max: {
        x: env.center.x + env.halfExtents.x,
        y: env.center.y + env.halfExtents.y,
        z: env.center.z + env.halfExtents.z,
      },
    });
  }
  // Placed label sprite rects — mirrors the renderer's buildScene call
  // (planNodeLabels(graph, { edgePlans: this.graphMode ? deriveGraphEdges :
  // undefined })), so the frame covers exactly what will be rendered.
  const labelPlans = (
    opts?.graphMode
      ? planNodeLabels(graph, { edgePlans: deriveGraphEdges(graph) })
      : planNodeLabels(graph)
  ).plans;
  for (const plan of labelPlans) {
    const node = graph.nodes.find((n) => n.id === plan.nodeId);
    if (!node) continue;
    const pos = world.get(node.id) ?? node.position;
    parts.push(
      extentFromRect({
        cx: pos.x + plan.offset.x,
        cy: pos.y + plan.offset.y,
        cz: pos.z + plan.offset.z,
        halfW: plan.spriteW / 2,
        halfH: plan.spriteH / 2,
        halfD: 0,
      })
    );
  }
  return unionExtents(parts);
}

// ---------------------------------------------------------------------------
// Frame formulas (design-2 §3.2/§3.3 — F-12/F-14)
// ---------------------------------------------------------------------------

/**
 * margin = clamp(FRAME_MARGIN_RATE · maxHalf + FRAME_MARGIN_FLOOR,
 * FRAME_MARGIN_MIN, FRAME_MARGIN_MAX) — the content-proportional margin that
 * replaces the 1.4 hard floor (which clipped s=1 labels).
 */
export function frameMarginFor(maxHalf: number): number {
  return clampNum(
    FRAME_MARGIN_RATE * maxHalf + FRAME_MARGIN_FLOOR,
    FRAME_MARGIN_MIN,
    FRAME_MARGIN_MAX
  );
}

/** In-plane (view-plane) radius of the content around the AABB center — the
 * F-14 corner case: content swings out of the frustum when rotating about the
 * view axis. Exact perpendicular distance from the view axis (GRAPH_VIEW_DIR),
 * which folds the tilted y-component in (design-2's "hypot(dx, dz)" shorthand
 * ignores the tilt; the audit's ρ = √(4.1² + 1.55²) overestimates it). */
export function inPlaneRadiusMax(aabb: ContentExtent): number {
  const center = contentExtentCenter(aabb);
  const len = Math.hypot(VIEW_DIR_Y, VIEW_DIR_Z);
  const vy = VIEW_DIR_Y / len;
  const vz = VIEW_DIR_Z / len;
  const xs = [aabb.min.x, aabb.max.x];
  const ys = [aabb.min.y, aabb.max.y];
  const zs = [aabb.min.z, aabb.max.z];
  let rhoMax = 0;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const dx = x - center.x;
        const dy = y - center.y;
        const dz = z - center.z;
        const dot = dy * vy + dz * vz; // view dir has no x component
        const rho2 = dx * dx + dy * dy + dz * dz - dot * dot;
        if (rho2 > rhoMax * rhoMax) rhoMax = Math.sqrt(Math.max(0, rho2));
      }
    }
  }
  return rhoMax;
}

export interface GraphFrame {
  halfH: number;
  halfW: number;
  margin: number;
}

/**
 * Graph-mode (ortho) frame (design-2 §3.2):
 *   halfX/halfY = content half-extents; margin as §3.2;
 *   halfW_needed = halfX + margin; halfH_needed = halfY + margin;
 *   swing = SWING_MARGIN_RATE · in-plane radius (absorbs the orbit band);
 *   halfH = max(halfH_needed, halfW_needed / aspect) + swing.
 * orthoBaseHalf := halfH (applyCamera keeps halfW = halfH · aspect).
 *
 * Worked checks (aspect 4/3, design-2 §3.2 fixtures): process_flow → 4.30,
 * timeline_sequence ≈ 4.19, lone node s=1 ≈ 1.58 — every content corner
 * (incl. the top label) is inside the frustum with margin (F-12 regression
 * vs the 1.4 floor, which clipped the s=1 label top at 1.55).
 */
export function graphFrameHalfHeight(
  aabb: ContentExtent,
  aspect: number
): GraphFrame {
  const halfX = (aabb.max.x - aabb.min.x) / 2;
  const halfY = (aabb.max.y - aabb.min.y) / 2;
  const margin = frameMarginFor(Math.max(halfX, halfY));
  const halfWNeeded = halfX + margin;
  const halfHNeeded = halfY + margin;
  const swing = SWING_MARGIN_RATE * inPlaneRadiusMax(aabb);
  const halfH = Math.max(halfHNeeded, halfWNeeded / aspect) + swing;
  return { halfH, halfW: halfH * aspect, margin };
}

/**
 * Perspective (non-graph) camera distance (design-2 §3.3):
 *   half = max(halfX, halfY, halfX / aspect); margin as §3.2 (no swing);
 *   distance = (half + margin) / tan(fovDeg / 2), clamped [4, 120].
 * Worked checks: layered_system → 5.68; particle_population → 4 (floor).
 *
 * Wave-4b addition (I5 canonical coverage): the axis-aligned half frames the
 * AABB only for content ON the view plane — off-axis corners project beyond
 * the frustum in the top/left/right canonical views (and the ±band worst
 * view), which the gate's I5 enforces. For each canonical view direction the
 * EXACT framing distance is
 *     max over AABB corners c of ( lateral_f(c) / tan(fov/2) + (c − center)·f )
 * (lateral_f is convex in c, so the corner maximum is exact for a box; every
 * content point lies inside the AABB). The distance grows to the max over
 * front/top/left/right + the 9-combo orbit band — the same directions
 * canonicalViews enumerates for non-graph scenes — so the gate's I5 verdict
 * and the rendered frame agree in every canonical view.
 */
export function perspectiveDistance(
  aabb: ContentExtent,
  fovDeg: number,
  aspect: number
): number {
  const halfX = (aabb.max.x - aabb.min.x) / 2;
  const halfY = (aabb.max.y - aabb.min.y) / 2;
  const half = Math.max(halfX, halfY, halfX / aspect);
  const margin = frameMarginFor(half);
  let distance = (half + margin) / Math.tan((fovDeg * Math.PI) / 360);
  distance = Math.max(distance, perspectiveCanonicalDistance(aabb, fovDeg));
  return clampNum(distance, 4, 120);
}

/**
 * Flat-scene canonical coverage (orbit-learning Wave-2 close-out, contracts
 * C1/C2): scenes whose content is planar on the ground plane (x-z) get a
 * REDUCED canonical view set — the near-top view (polar 0.05) is excluded.
 * For a flat scene the top view is pedagogically useless (the disc is seen
 * face-on only from a true top view, which the learner never needs) and it
 * degenerates into over-coverage: its projected span equals the horizontal
 * span the front/side views already enforce, so it can only INFLATE the
 * frame. The front/side views and the ±band orbit combos remain in the set,
 * so I5 canonical coverage keeps its meaning; non-flat (3D) scenes keep the
 * full set — the camera.test.ts canonical-coverage pins use cube fixtures
 * and are untouched (gated by isFlatScene).
 */
export const FLAT_SCENE_MAX_THICKNESS_RATIO = 0.5;

/** True when the content is planar: its thickness along the canonical up
 * axis (+y) is below FLAT_SCENE_MAX_THICKNESS_RATIO of its largest span in
 * the ground plane (x/z). Empty extents are never flat. */
export function isFlatScene(aabb: ContentExtent): boolean {
  if (aabb.max.x < aabb.min.x) return false; // empty extent
  const thicknessY = aabb.max.y - aabb.min.y;
  const groundSpan = Math.max(
    aabb.max.x - aabb.min.x,
    aabb.max.z - aabb.min.z
  );
  return groundSpan > 0 && thicknessY < FLAT_SCENE_MAX_THICKNESS_RATIO * groundSpan;
}

/** The exact distance that keeps every AABB corner inside the frustum for the
 * canonical non-graph view set (front/top/left/right + the ±band worst).
 * FLAT-SCENE EXCEPTION (C1/C2): when the content is planar (isFlatScene) the
 * degenerate near-top view is excluded from the set — a flat disc needs no
 * top view, and it is the over-coverage constraint that keeps the orbit frame
 * dead-space-inflated. */
export function perspectiveCanonicalDistance(
  aabb: ContentExtent,
  fovDeg: number
): number {
  if (aabb.max.x < aabb.min.x) return 0; // empty extent — nothing to frame
  const tanHalfFov = Math.tan((fovDeg * Math.PI) / 360);
  const center = contentExtentCenter(aabb);
  const corners: Vec3[] = [];
  for (const dx of [aabb.min.x, aabb.max.x]) {
    for (const dy of [aabb.min.y, aabb.max.y]) {
      for (const dz of [aabb.min.z, aabb.max.z]) {
        corners.push({ x: dx, y: dy, z: dz });
      }
    }
  }
  const dirs = perspectiveCanonicalViewDirs(isFlatScene(aabb));
  let required = 0;
  for (const { azimuth, polar } of dirs) {
    const f = viewDir(azimuth, polar);
    let req = 0;
    for (const c of corners) {
      const v = { x: c.x - center.x, y: c.y - center.y, z: c.z - center.z };
      const along = v.x * f.x + v.y * f.y + v.z * f.z;
      const latX = v.x - along * f.x;
      const latY = v.y - along * f.y;
      const latZ = v.z - along * f.z;
      const lateral = Math.hypot(latX, latY, latZ);
      req = Math.max(req, lateral / tanHalfFov + along);
    }
    required = Math.max(required, req);
  }
  return required;
}

/** Canonical view directions for non-graph (perspective) scenes — mirrors the
 * azimuth/polar formulas canonicalViews uses (default dir (1, 0.65, 1.35),
 * top polar 0.05, left/right ± π/2, worst over the ±band 9-combo). For FLAT
 * scenes (`flatScene` = isFlatScene(aabb)) the near-top view (polar 0.05) is
 * excluded — the degenerate top view of a planar scene adds no coverage the
 * front/side/band views do not already enforce, while inflating the frame
 * (contract C1/C2). Exported for the contract test to pin the set membership
 * (pure decision logic — no Three.js). */
export function perspectiveCanonicalViewDirs(
  flatScene: boolean
): Array<{ azimuth: number; polar: number }> {
  const azimuth = Math.atan2(1, 1.35);
  const polar = Math.acos(0.65 / Math.hypot(1, 0.65, 1.35));
  const dirs: Array<{ azimuth: number; polar: number }> = [
    { azimuth, polar },
  ];
  if (!flatScene) dirs.push({ azimuth, polar: 0.05 });
  dirs.push(
    { azimuth: azimuth - Math.PI / 2, polar },
    { azimuth: azimuth + Math.PI / 2, polar }
  );
  for (const da of [-GRAPH_AZIMUTH_BAND, 0, GRAPH_AZIMUTH_BAND]) {
    for (const dp of [-GRAPH_POLAR_BAND, 0, GRAPH_POLAR_BAND]) {
      dirs.push({ azimuth: azimuth + da, polar: polar + dp });
    }
  }
  return dirs;
}

/** Unit view direction from the orbit azimuth/polar (mirror of the gate's
 * viewDirection — the camera sits along +f from the target). */
function viewDir(azimuth: number, polar: number): { x: number; y: number; z: number } {
  return {
    x: Math.sin(polar) * Math.sin(azimuth),
    y: Math.cos(polar),
    z: Math.sin(polar) * Math.cos(azimuth),
  };
}

// ---------------------------------------------------------------------------
// Re-framing with hysteresis (design-2 §3.4 — F-13)
// ---------------------------------------------------------------------------

export interface MaybeReframeInput {
  graphMode: boolean;
  aspect: number;
  fovDeg: number;
  orbit: { userControlled: boolean; distance: number };
  orthoBaseHalf: number;
  /** Static content AABB (the build frame source). */
  content: ContentExtent;
  /** Runtime extents: engine bodies + trails + field span. */
  dynamic?: DynamicExtent | null;
  /**
   * ENGINE PARAMETER CHANGE (re-aim): ignore the userControlled latch for
   * THIS decision, so an escape/high-speed body never exits the frustum
   * (root-cause §3 "camera latch freeze"; contract C4). Pure pointer
   * exploration keeps the latch semantics — the latch is released only on
   * the re-aim push and the next pointerdown re-latches.
   */
  releaseLatch?: boolean;
  /**
   * RESET-VIEW path: recompute the concept frame over static + dynamic
   * extents and shrink with hysteresis when the current frame is more than
   * REFRAME_HYSTERESIS larger than required (bounded — the required frame
   * is a lower bound of the build frame, so the shrink never overshoots the
   * default frame; the deadband prevents jitter). Perspective scenes only;
   * graph scenes keep the grow-only contract. The caller must NOT set
   * shrink while the trail is still growing into the frame (the shrink
   * would be undone by the very next grow).
   */
  shrink?: boolean;
}

/** The grown frame: `orthoBaseHalf` is meaningful in graph mode, `distance`
 * in perspective mode; the other field echoes the current value. */
export interface ReframeResult {
  graphMode: boolean;
  orthoBaseHalf: number;
  distance: number;
}

/**
 * Re-frame decision (design-2 §3.4): recompute the required frame over the
 * union of static content and dynamic extents, and grow the current frame
 * only when `required > current · REFRAME_HYSTERESIS` — monotone growth, no
 * shrink (no jitter), never under user control. Returns null when skipped or
 * when no growth is required.
 *
 * Wave-2 (orbit-learning): two escapes from the grow-only contract, both
 * deliberate — `releaseLatch` ignores the userControlled latch for the single
 * engine parameter-change push (contract C4), and `shrink` implements the
 * bounded reset-view shrink described on MaybeReframeInput.
 */
export function maybeReframe(input: MaybeReframeInput): ReframeResult | null {
  if (input.orbit.userControlled && !input.releaseLatch) return null;
  const aabb = input.dynamic
    ? unionExtent(input.content, extentFromDynamic(input.dynamic))
    : input.content;
  if (input.graphMode) {
    const required = graphFrameHalfHeight(aabb, input.aspect).halfH;
    if (required > input.orthoBaseHalf * REFRAME_HYSTERESIS) {
      return {
        graphMode: true,
        orthoBaseHalf: required,
        distance: input.orbit.distance,
      };
    }
    return null;
  }
  const required = perspectiveDistance(aabb, input.fovDeg, input.aspect);
  if (required > input.orbit.distance * REFRAME_HYSTERESIS) {
    return {
      graphMode: false,
      orthoBaseHalf: input.orthoBaseHalf,
      distance: required,
    };
  }
  // Reset-view bounded shrink: the current frame is more than 5% larger than
  // the required concept frame — snap back (the deadband absorbs jitter).
  if (input.shrink && input.orbit.distance > required * REFRAME_HYSTERESIS) {
    return {
      graphMode: false,
      orthoBaseHalf: input.orthoBaseHalf,
      distance: required,
    };
  }
  return null;
}

/**
 * Dynamic extents from the canonical engine state (design-2 §3.1): mapped
 * engine body world positions (world = (offsetX, baseY, offsetY) + body·scale)
 * inflated by the body radius AND the node's placed label reach — the label
 * overlay follows the body rigidly (labels.ts updateLabelOverlays), so its
 * sprite box (placed offset + text-measured sprite halves) moves with the
 * body and must stay framed (F-13). The engine field span covers the grid
 * tick origins + max vector magnitude. "@surface" mappings are skipped (the
 * wave amplitude stays within the static envelope's size·0.15). Returns null
 * when there is nothing dynamic.
 *
 * Wave-2 (orbit-learning, root-cause §3 "phantom dynamic extent"): the extent
 * covers the VISIBLE MESH, not just the mapping pivot. A mapped node may be a
 * GROUP whose pivot is nowhere near the geometry (orbits: the planet-system
 * pivot tracks the engine body; the planet mesh sits at local +6 and the moon
 * at +7.4). For every mapped node the extent includes the node itself plus
 * every non-group descendant at its group-relative world offset, each with its
 * own radius + label reach — the frame decision covers exactly what renders.
 *
 * TRAIL BOUNDS (contract C3/C4): every trail-bearing engine mesh contributes a
 * `trailBounds` bbox. `trailBoundsByNode` (node id -> bbox over the WRITTEN
 * world points of the trail ring buffer) is the real producer — the renderer
 * computes it from the runtime trail buffers and passes it through
 * frameCamera. When it carries no bbox for a mesh, the extent falls back to
 * the mesh's CURRENT extent: the body's position is always on its own trail,
 * so the fallback is a valid lower bound that keeps a live trajectory part of
 * the frame decision (nothing produces trail extents today).
 */
export function dynamicExtentFromEngineState(
  engineMapping: EngineMapping | null,
  engineState: EngineVisualState | null,
  graph: SceneGraph | null,
  trailBoundsByNode?: Map<string, ContentExtent> | null
): DynamicExtent | null {
  if (!engineMapping || !engineState) return null;
  const nodeById = new Map((graph?.nodes ?? []).map((n) => [n.id, n]));
  const world = graph ? worldPositions(graph) : new Map<string, Vec3>();
  // Placed label plans for label-bearing engine nodes (non-graph scenes are
  // the only engine-coupled ones, so the no-edgePlans call matches the
  // renderer's build-time planNodeLabels call exactly).
  const labelReach = new Map<string, Vec3>();
  if (graph) {
    for (const plan of planNodeLabels(graph).plans) {
      const node = nodeById.get(plan.nodeId);
      if (!node) continue;
      const radius = node.size * 0.5;
      labelReach.set(plan.nodeId, {
        x: Math.max(radius, Math.abs(plan.offset.x) + plan.spriteW / 2),
        y: Math.max(radius, Math.abs(plan.offset.y) + plan.spriteH / 2),
        z: Math.max(radius, Math.abs(plan.offset.z)),
      });
    }
  }
  const engineBodies: Array<{ center: Vec3; radius: number }> = [];
  const trailBounds: ContentExtent[] = [];
  let engineFieldBounds: ContentExtent | null = null;
  for (const [nodeId, entry] of Object.entries(engineMapping)) {
    if (entry.body === "@field") {
      const field = engineState.field;
      if (!field) continue;
      const node = nodeById.get(nodeId);
      let maxMag = 0;
      for (const v of field.vectors) {
        if (v.magnitude > maxMag) maxMag = v.magnitude;
      }
      const half = (field.span + maxMag) * entry.scale;
      const x = entry.offsetX ?? 0;
      const z = entry.offsetY ?? 0;
      engineFieldBounds = {
        min: { x: x - half, y: node?.position.y ?? 0, z: z - half },
        max: { x: x + half, y: node?.position.y ?? 0, z: z + half },
      };
      continue;
    }
    if (entry.body === "@surface") continue;
    const body = engineState.bodies?.[entry.body];
    if (!body) continue;
    const node = nodeById.get(nodeId);
    const pivot: Vec3 = {
      x: (entry.offsetX ?? 0) + body.x * entry.scale,
      y: node?.position.y ?? 0,
      z: (entry.offsetY ?? 0) + body.y * entry.scale,
    };
    // The visible meshes of this mapping: the mapped node itself (leaf bodies
    // — and an id missing from the graph keeps the raw pivot extent so the
    // engine body position itself is never dropped from the frame) or, for a
    // group, every non-group descendant (groups carry no geometry of their
    // own; the children's local offsets are added below).
    const meshes: Array<{ id: string; size: number }> = [];
    if (node && node.kind === "group") {
      const stack = [...node.children];
      while (stack.length > 0) {
        const childId = stack.pop()!;
        const child = nodeById.get(childId);
        if (!child) continue;
        if (child.kind === "group") {
          stack.push(...child.children);
          continue;
        }
        meshes.push({ id: child.id, size: child.size });
      }
    } else {
      meshes.push({ id: nodeId, size: node?.size ?? 0 });
    }
    const nodeWorld = node
      ? world.get(nodeId) ?? { x: node.position.x, y: node.position.y, z: node.position.z }
      : pivot;
    for (const mesh of meshes) {
      const meshWorld = node
        ? world.get(mesh.id) ?? { x: 0, y: 0, z: 0 }
        : pivot;
      const center: Vec3 = {
        x: pivot.x + (meshWorld.x - nodeWorld.x),
        y: pivot.y + (meshWorld.y - nodeWorld.y),
        z: pivot.z + (meshWorld.z - nodeWorld.z),
      };
      const radius = mesh.size * 0.5;
      const reach = nodeById.has(mesh.id) ? labelReach.get(mesh.id) : undefined;
      engineBodies.push({
        center,
        radius: reach
          ? Math.max(radius, reach.x, reach.y, reach.z)
          : radius,
      });
      // Trail bounds: the runtime bbox (real producer) wins; else the current
      // extent of a trail-bearing mesh — the body is always on its own trail.
      const runtimeBox = trailBoundsByNode?.get(mesh.id);
      if (runtimeBox) {
        trailBounds.push(runtimeBox);
      } else if ((nodeById.get(mesh.id)?.trailPoints ?? 0) > 0) {
        trailBounds.push({
          min: { x: center.x - radius, y: center.y - radius, z: center.z - radius },
          max: { x: center.x + radius, y: center.y + radius, z: center.z + radius },
        });
      }
    }
  }
  if (
    engineBodies.length === 0 &&
    !engineFieldBounds &&
    trailBounds.length === 0
  ) {
    return null;
  }
  return {
    engineBodies: engineBodies.length > 0 ? engineBodies : undefined,
    trailBounds: trailBounds.length > 0 ? trailBounds : undefined,
    engineFieldBounds,
  };
}

// ---------------------------------------------------------------------------
// Canonical views (design-2 §3.5 — gate screenshots + e2e)
// ---------------------------------------------------------------------------

export interface CanonicalView {
  name: "front" | "top" | "left" | "right" | "worst";
  azimuth: number;
  polar: number;
  distance: number;
}

/**
 * Inputs for canonicalViews — structurally compatible with the future
 * CameraPlan from resolvePresentation (C1/C5): same fields a camera plan
 * carries, plus the content AABB for the worst-view argmax.
 */
export interface CanonicalViewInput {
  graphMode: boolean;
  center: Vec3;
  /** Default (front) azimuth/polar of the orbit. */
  azimuth: number;
  polar: number;
  distance: number;
  /** Graph-mode ortho base half-height (screenshots at the current zoom). */
  halfH: number;
  aspect: number;
  content: ContentExtent;
}

/**
 * The five canonical views (design-2 §3.5): front (the default view), top
 * (polar 0.05), left/right (azimuth ± π/2 from default) and worst — the
 * argmax over the 9-combo orbit band {azimuth + {0, ±0.45}} × {polar +
 * {0, ±0.18}} of the projected content AABB screen area.
 */
export function canonicalViews(input: CanonicalViewInput): CanonicalView[] {
  const { graphMode, azimuth, polar, distance, content } = input;
  const front: CanonicalView = { name: "front", azimuth, polar, distance };
  const top: CanonicalView = { name: "top", azimuth, polar: 0.05, distance };
  const left: CanonicalView = {
    name: "left",
    azimuth: azimuth - Math.PI / 2,
    polar,
    distance,
  };
  const right: CanonicalView = {
    name: "right",
    azimuth: azimuth + Math.PI / 2,
    polar,
    distance,
  };
  void graphMode; // the same orbit band applies to both modes (design-2 §3.5)

  let worst: CanonicalView | null = null;
  let worstArea = -1;
  for (const da of [-GRAPH_AZIMUTH_BAND, 0, GRAPH_AZIMUTH_BAND]) {
    for (const dp of [-GRAPH_POLAR_BAND, 0, GRAPH_POLAR_BAND]) {
      const az = azimuth + da;
      const po = polar + dp;
      const area = projectedContentArea(content, input.center, az, po);
      if (area > worstArea) {
        worstArea = area;
        worst = { name: "worst", azimuth: az, polar: po, distance };
      }
    }
  }
  return [front, top, left, right, worst ?? front];
}

/** Screen-space bbox area of the content AABB through an orbit view. */
function projectedContentArea(
  content: ContentExtent,
  center: Vec3,
  azimuth: number,
  polar: number
): number {
  // View basis from the orbit position (mirrors applyCamera's placement):
  // zAxis = pos − target; xAxis = normalize(cross(up, zAxis)); yAxis = zAxis × xAxis.
  const sp = Math.sin(polar);
  const cp = Math.cos(polar);
  const dir = { x: sp * Math.sin(azimuth), y: cp, z: sp * Math.cos(azimuth) };
  const zAxis = dir;
  // xAxis = normalize(cross((0,1,0), zAxis)) = (zAxis.z, 0, −zAxis.x) normalized
  let xa = Math.hypot(zAxis.z, zAxis.x);
  if (xa < 1e-9) xa = 1;
  const xAxis = { x: zAxis.z / xa, y: 0, z: -zAxis.x / xa };
  // yAxis = zAxis × xAxis
  const yAxis = {
    x: zAxis.y * xAxis.z - zAxis.z * xAxis.y,
    y: zAxis.z * xAxis.x - zAxis.x * xAxis.z,
    z: zAxis.x * xAxis.y - zAxis.y * xAxis.x,
  };
  const xs = [content.min.x, content.max.x];
  const ys = [content.min.y, content.max.y];
  const zs = [content.min.z, content.max.z];
  let minSX = Infinity;
  let maxSX = -Infinity;
  let minSY = Infinity;
  let maxSY = -Infinity;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const dx = x - center.x;
        const dy = y - center.y;
        const dz = z - center.z;
        const sx = dx * xAxis.x + dy * xAxis.y + dz * xAxis.z;
        const sy = dx * yAxis.x + dy * yAxis.y + dz * yAxis.z;
        minSX = Math.min(minSX, sx);
        maxSX = Math.max(maxSX, sx);
        minSY = Math.min(minSY, sy);
        maxSY = Math.max(maxSY, sy);
      }
    }
  }
  return (maxSX - minSX) * (maxSY - minSY);
}

// ---------------------------------------------------------------------------
// CSS projection (design-2 §3.5 — the single source for the demo-lesson-rail
// projectNode math; D2 swaps the in-file copy for this import in Wave 4)
// ---------------------------------------------------------------------------

export interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Project a world position to CSS-pixel canvas coordinates through the
 * graph-mode ortho camera — math-identical to the frozen `projectNode` helper
 * in e2e/demo-lesson-rail.spec.ts (design-2 §3.5):
 *   view basis: zAxis = normalize(0, 0.55, 1), xAxis = (1, 0, 0),
 *   yAxis = cross(zAxis, xAxis) = (0, dz, −dy);
 *   viewX = dx; viewY = dz·dy − dy·dz; ndc = (viewX/halfW, viewY/halfH);
 *   css = canvasBox origin + ((ndc + 1)/2 · size), y flipped.
 */
export function projectOrthoToCSS(
  world: Vec3,
  params: {
    center: Vec3;
    halfH: number;
    aspect: number;
    canvasBox: CanvasBox;
  }
): { x: number; y: number } {
  const { center, halfH, aspect, canvasBox } = params;
  const dx = world.x - center.x;
  const dy = world.y - center.y;
  const dz = world.z - center.z;
  const len = Math.hypot(VIEW_DIR_Y, VIEW_DIR_Z);
  const vz = VIEW_DIR_Z / len;
  const vy = VIEW_DIR_Y / len;
  const viewX = dx; // dot with xAxis (1, 0, 0)
  const viewY = vz * dy - vy * dz; // dot with yAxis (0, vz, −vy)
  const halfW = halfH * aspect;
  const ndcX = viewX / halfW;
  const ndcY = viewY / halfH;
  return {
    x: canvasBox.x + ((ndcX + 1) / 2) * canvasBox.width,
    y: canvasBox.y + ((1 - ndcY) / 2) * canvasBox.height,
  };
}

export interface PerspectiveProjectParams {
  /** Orbit target (the frame center the camera looks at). */
  center: Vec3;
  azimuth: number;
  polar: number;
  distance: number;
  /** Defaults to DEFAULT_FOV_DEG. */
  fovDeg?: number;
  aspect: number;
  canvasBox: CanvasBox;
}

/**
 * Project a world position to CSS-pixel canvas coordinates through the
 * PERSPECTIVE orbit camera (Wave-2 seam for the DOM overlay work — W4/W5
 * import this). Mirrors applyCamera's placement exactly: the camera sits at
 * target + distance·viewDir(azimuth, polar) and looks at the target, so the
 * view basis is the Three.js lookAt basis (right = cross(up, dir),
 * up = cross(dir, right), depth along −dir) and the y-axis flips into CSS
 * pixels like projectOrthoToCSS. Returns null when the point is behind the
 * camera (depth <= 0) — the caller keeps its label hidden.
 */
export function projectPerspectiveToCSS(
  world: Vec3,
  params: PerspectiveProjectParams
): { x: number; y: number } | null {
  const { center, azimuth, polar, distance, aspect, canvasBox } = params;
  const fovDeg = params.fovDeg ?? DEFAULT_FOV_DEG;
  const sp = Math.sin(polar);
  const cp = Math.cos(polar);
  const dir = {
    x: sp * Math.sin(azimuth),
    y: cp,
    z: sp * Math.cos(azimuth),
  };
  const pos = {
    x: center.x + distance * dir.x,
    y: center.y + distance * dir.y,
    z: center.z + distance * dir.z,
  };
  // Three.js lookAt basis: x = cross(up, z) with z = normalize(pos − target)
  // (the camera looks down −z toward the target); y = z × x.
  const right = { x: dir.z, y: 0, z: -dir.x };
  const rl = Math.hypot(right.x, right.y, right.z);
  if (rl < 1e-12) return null;
  right.x /= rl;
  right.z /= rl;
  const upv = {
    x: dir.y * right.z - dir.z * right.y,
    y: dir.z * right.x - dir.x * right.z,
    z: dir.x * right.y - dir.y * right.x,
  };
  const dx = world.x - pos.x;
  const dy = world.y - pos.y;
  const dz = world.z - pos.z;
  const depth = -(dx * dir.x + dy * dir.y + dz * dir.z);
  if (depth <= 0) return null;
  const xc = dx * right.x + dy * right.y + dz * right.z;
  const yc = dx * upv.x + dy * upv.y + dz * upv.z;
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const ndcX = (xc * f) / (depth * aspect);
  const ndcY = (yc * f) / depth;
  return {
    x: canvasBox.x + (ndcX * 0.5 + 0.5) * canvasBox.width,
    y: canvasBox.y + (1 - (ndcY * 0.5 + 0.5)) * canvasBox.height,
  };
}

// ---------------------------------------------------------------------------
// Three.js surface (camera objects + orbit application)
// ---------------------------------------------------------------------------

/** Inputs for frameCamera: the graph-mode flag, the live orbit record, the
 * current orthographic base half-height, and (C4) the build aspect + the
 * optional reframe request (design-2 §3.4). */
export interface FrameInput {
  graphMode: boolean;
  orbit: OrbitState;
  orthoBaseHalf: number;
  /** Build-time aspect (defaults to the stage-enforced 4/3; per-frame
   * applyCamera uses the live canvas aspect). */
  aspect?: number;
  /** C4 reframe mode: recompute the frame over the union of static graph
   * content and engine dynamic extents instead of framing from scratch.
   * Grow-only with REFRAME_HYSTERESIS; skipped when orbit.userControlled
   * (unless `releaseLatch` — engine parameter change); never resets the
   * orbit record or the camera. */
  reframe?: {
    graph: SceneGraph | null;
    engineMapping: EngineMapping | null;
    engineState: EngineVisualState | null;
    aspect: number;
    fovDeg?: number;
    /** World-space trail bboxes keyed by node id — the renderer's runtime
     * producer for dynamicExtentFromEngineState's trailBounds (C3/C4). */
    trailBounds?: Map<string, ContentExtent> | null;
    /** Engine parameter change (re-aim): ignore the userControlled latch for
     * this reframe decision (C4 — an escape never exits the frustum). */
    releaseLatch?: boolean;
    /** Reset-view: bounded shrink toward the concept frame (never while the
     * trail is still growing into the frame — the caller decides). */
    shrink?: boolean;
  };
}

/** Result of frameCamera. Build mode returns the camera + ortho base
 * half-height; reframe mode additionally reports which frame parameter grew
 * (graphMode → orthoBaseHalf, else distance). */
export interface FrameResult {
  camera: THREE.Camera;
  orthoBaseHalf: number;
  /** Reframe mode: the graph-mode flag of the request. */
  graphMode?: boolean;
  /** Reframe mode, perspective: the grown camera distance. */
  distance?: number;
}

/**
 * Frame the camera from the graph's content AABB (envelopes + labels, F-12).
 * Returns the camera to use (a fresh Orthographic/PerspectiveCamera when the
 * projection class changed), the orthographic base half-height, and — in
 * reframe mode — the grown perspective distance (design-2 §3.4). Returns
 * null only when a reframe was requested but no growth is needed.
 */
export function frameCamera(
  camera: THREE.Camera | null,
  graph: SceneGraph | null,
  input: FrameInput
): FrameResult | null {
  if (!camera) return null;

  if (input.reframe) {
    const ref = input.reframe;
    const dynamic =
      ref.graph || ref.engineMapping || ref.engineState || ref.trailBounds
        ? dynamicExtentFromEngineState(
            ref.engineMapping,
            ref.engineState,
            ref.graph,
            ref.trailBounds
          )
        : null;
    const result = maybeReframe({
      graphMode: input.graphMode,
      aspect: ref.aspect,
      fovDeg: ref.fovDeg ?? DEFAULT_FOV_DEG,
      orbit: {
        userControlled: input.orbit.userControlled,
        distance: input.orbit.distance,
      },
      orthoBaseHalf: input.orthoBaseHalf,
      content: contentAABBFromGraph(ref.graph, { graphMode: input.graphMode }),
      dynamic,
      releaseLatch: ref.releaseLatch,
      shrink: ref.shrink,
    });
    if (!result) return null;
    return {
      camera,
      orthoBaseHalf: result.orthoBaseHalf,
      graphMode: result.graphMode,
      distance: result.distance,
    };
  }

  if (!graph) return null;
  const aspect = input.aspect ?? FRAME_ASPECT_DEFAULT;
  const content = contentAABBFromGraph(graph, { graphMode: input.graphMode });
  const center3 = contentExtentCenter(content);
  const center = new THREE.Vector3(center3.x, center3.y, center3.z);

  const hasNodes = graph.nodes.length > 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const n of graph.nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    minZ = Math.min(minZ, n.position.z);
    maxX = Math.max(maxX, n.position.x);
    maxY = Math.max(maxY, n.position.y);
    maxZ = Math.max(maxZ, n.position.z);
  }
  const diagonal = hasNodes
    ? Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
    : 0;

  const { graphMode, orbit, orthoBaseHalf } = input;
  if (graphMode) {
    // Near-orthographic default for canonical graphs: the graph lives in a
    // plane, so a flat projection keeps it readable and never turns it into
    // spaghetti. Rotation is clamped to a narrow band around the default.
    if (!(camera instanceof THREE.OrthographicCamera)) {
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    }
    const baseHalf = graphFrameHalfHeight(content, aspect).halfH;
    const distance = clampNum(diagonal * 2.2, 4, 120);
    const dir = GRAPH_VIEW_DIR;
    const pos = center.clone().addScaledVector(dir, distance);
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(center);
    orbit.target.copy(center);
    orbit.distance = distance;
    orbit.defaultDistance = distance;
    orbit.defaultAzimuth = Math.atan2(dir.x, dir.z);
    orbit.defaultPolar = Math.acos(dir.y / dir.length());
    orbit.azimuth = orbit.defaultAzimuth;
    orbit.polar = orbit.defaultPolar;
    orbit.userControlled = false;
    return { camera, orthoBaseHalf: baseHalf };
  }

  if (!(camera instanceof THREE.PerspectiveCamera)) {
    camera = new THREE.PerspectiveCamera(DEFAULT_FOV_DEG, 1, 0.1, 2000);
  }
  const fovDeg =
    camera instanceof THREE.PerspectiveCamera ? camera.fov : DEFAULT_FOV_DEG;
  const distance = perspectiveDistance(content, fovDeg, aspect);
  const dir = new THREE.Vector3(1, 0.65, 1.35).normalize();
  const pos = center.clone().addScaledVector(dir, distance);
  camera.position.copy(pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);

  orbit.target.copy(center);
  orbit.distance = distance;
  orbit.defaultDistance = distance;
  orbit.defaultAzimuth = Math.atan2(dir.x, dir.z);
  orbit.defaultPolar = Math.acos(dir.y);
  orbit.azimuth = orbit.defaultAzimuth;
  orbit.polar = orbit.defaultPolar;
  orbit.userControlled = false;
  return { camera, orthoBaseHalf };
}

/** Apply the current orbit state to the camera (called every frame). */
export function applyCamera(
  camera: THREE.Camera | null,
  orbit: OrbitState,
  orthoBaseHalf: number,
  cameraAspect: number
): void {
  if (!camera) return;
  const { azimuth, polar, distance, target } = orbit;
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
    const halfH = orthoBaseHalf * (distance / orbit.defaultDistance);
    const halfW = halfH * cameraAspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
}

/** Graph scenes: rotation is heavily restricted so the graph never turns
 * into spaghetti — a narrow azimuth swing and a small tilt band. */
export function clampGraphOrbit(orbit: OrbitState): void {
  orbit.azimuth = clampNum(
    orbit.azimuth,
    orbit.defaultAzimuth - GRAPH_AZIMUTH_BAND,
    orbit.defaultAzimuth + GRAPH_AZIMUTH_BAND
  );
  orbit.polar = clampNum(
    orbit.polar,
    orbit.defaultPolar - GRAPH_POLAR_BAND,
    orbit.defaultPolar + GRAPH_POLAR_BAND
  );
}
