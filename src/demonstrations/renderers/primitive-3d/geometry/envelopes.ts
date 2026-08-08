/**
 * geometry/envelopes.ts — shared geometry module (C1, Wave 3; design-1 §6).
 *
 * Shapes, per-kind extents, the two-tier label model, collision predicates,
 * scene bounds and the runtime position clamp. This is the single source of
 * truth for the geometry constants: the sanitizer (bounds alignment +
 * geometric rejections), the layout engine, the animation clamp and B2's
 * stages all read the same module — constants are never re-declared elsewhere
 * (design-1 §6 ownership rules).
 *
 * Purity rule: imports only `demo-spec` types and `types.ts` (both pure).
 * No Three.js, no DOM, no canvas; char-width math is the measured model of
 * design-1 §1.4 (no measureText at runtime).
 *
 * Envelope model (design-1 §1.3): every rendered object maps to one collision
 * shape; the graph camera is a near-ortho projection down +z, so the in-plane
 * rect is the conservative projection for labels. Group nodes have no
 * envelope of their own (their members' shapes are used by the layout unit
 * model); they map to a degenerate point so callers that do not special-case
 * groups see a zero-size shape.
 */

import type { PrimitiveKind, Vec3 } from "@/demonstrations/spec/demo-spec";
import type { SceneBounds, SceneGraphNode } from "../types";

// ---------------------------------------------------------------------------
// Constants (design-1 §6 — exact)
// ---------------------------------------------------------------------------

/** Label canvas + text model (design-1 §1.4). */
export const LABEL_CANVAS_W = 320;
export const LABEL_CANVAS_H = 72;
export const LABEL_FONT_PX = 30;
export const LABEL_HARD_MAX_CHARS = 40;
/** Conservative mixed-case width per char at the 30px font (≥ all measured
 * avgs 13 / 15.2 / 12.8 px per char). */
export const CHAR_WIDTH_PX = 16;
/** floor(320 / 16) — labels beyond this clip at the canvas edge. */
export const CANVAS_FIT_CHARS = 20;

/** Spec-level bounds (design-1 §7.1 — aligned with scene-graph clamps). */
export const SCENE_POSITION_BOUND = 500;
export const SCENE_SIZE_MIN = 0.001;
export const SCENE_SIZE_MAX = 100;

/** Clearance constants (design-1 §1.5). */
export const SCENE_BOUNDS_MARGIN = 0.5; // covers arrowhead cone base + inhibits bar
export const ENVELOPE_CLEARANCE = 0.1;
export const PATH_CLEARANCE = 0.1;
export const PACKET_SPACING = 0.2;
export const LABEL_GLYPH_CLEARANCE = 0.05;

/** Label sprite geometry (design-1 §1.4 / renderer constants). */
export const NODE_LABEL_OFFSET_BASE = 0.4;
export const NODE_LABEL_OFFSET_FACTOR = 0.9;
export const NODE_LABEL_SPRITE_W = 2.2;
export const NODE_LABEL_SPRITE_H = 0.5;
export const EDGE_LABEL_SPRITE_W = 1.9;
export const EDGE_LABEL_SPRITE_H = 0.42;
export const EDGE_LABEL_Y_OFFSET = 0.5;

/** Measured glyph height ratio (28px text on the 72px canvas → half-height
 * ratio 28/72/2·… — used by the tier-2 glyph boxes). */
export const GLYPH_HEIGHT_RATIO = 28 / 72;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type Envelope =
  | { kind: "sphere"; center: Vec3; radius: number }
  | { kind: "box"; center: Vec3; half: number }
  /** x–y plane rect (labels / in-plane shapes). */
  | { kind: "rect"; center: Vec3; halfW: number; halfH: number };

export interface Rect {
  center: Vec3;
  halfW: number;
  halfH: number;
}

/** Half extents of a kind's conservative axis-aligned shape. */
export interface KindExtent {
  halfW: number;
  halfH: number;
  halfD: number;
}

/** Box-form of an envelope for AABB math (rect → zero z thickness). */
function envBox(env: Envelope): { center: Vec3; halfX: number; halfY: number; halfZ: number } {
  if (env.kind === "box") {
    return { center: env.center, halfX: env.half, halfY: env.half, halfZ: env.half };
  }
  if (env.kind === "rect") {
    return { center: env.center, halfX: env.halfW, halfY: env.halfH, halfZ: 0 };
  }
  return { center: env.center, halfX: 0, halfY: 0, halfZ: 0 }; // sphere handled by callers
}

function sphereRadius(env: Envelope): number | null {
  return env.kind === "sphere" ? env.radius : null;
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// ---------------------------------------------------------------------------
// Per-kind extents
// ---------------------------------------------------------------------------

/**
 * Conservative axis-aligned half extents per kind (design-1 §1.3).
 * x–z plane rects (plane/wave/graph_surface/particle_field, ring, orbit_path,
 * arrow) report zero y extent; the layout repulsion treats their collision
 * shape via the same table (planes act as square obstacles in the graph
 * plane, which is the design's "rect half size*0.5 (outer radius)" row).
 */
export function kindExtent(kind: PrimitiveKind, size: number): KindExtent {
  switch (kind) {
    case "sphere":
    case "process_node":
    case "energy_packet":
      return { halfW: size * 0.5, halfH: size * 0.5, halfD: size * 0.5 };
    case "box":
      return { halfW: size / 2, halfH: size / 2, halfD: size / 2 };
    case "plane":
    case "wave_surface":
    case "graph_surface":
    case "particle_field":
      return { halfW: size / 2, halfH: 0, halfD: size / 2 };
    case "ring":
    case "orbit_path":
      return { halfW: size * 0.5, halfH: 0, halfD: size * 0.5 };
    case "vector_field":
      // height = tick length size*0.22 → half-height size*0.11
      return { halfW: size / 2, halfH: size * 0.11, halfD: size / 2 };
    case "arrow":
      return { halfW: size * 0.45, halfH: 0, halfD: size * 0.16 };
    case "line":
    case "trail":
    case "process_edge":
      return { halfW: 0, halfH: 0, halfD: 0 };
    case "label":
      return { halfW: size * 1.1, halfH: size * 0.25, halfD: 0 };
    case "camera_marker":
      return { halfW: size * 0.4, halfH: size * 0.4, halfD: size * 0.4 };
    case "group":
      // Containers have no envelope of their own (members' shapes are used).
      return { halfW: 0, halfH: 0, halfD: 0 };
  }
}

/**
 * Collision envelope of a single node (design-1 §1.3 table). Group nodes map
 * to a degenerate point — the layout unit model and the sanitizer handle
 * groups explicitly (members' shapes, never the container's).
 */
export function nodeEnvelope(node: SceneGraphNode): Envelope {
  const ext = kindExtent(node.kind, node.size);
  if (node.kind === "sphere" || node.kind === "process_node" || node.kind === "energy_packet") {
    return { kind: "sphere", center: { ...node.position }, radius: ext.halfW };
  }
  if (node.kind === "camera_marker") {
    return { kind: "sphere", center: { ...node.position }, radius: ext.halfW };
  }
  if (node.kind === "label") {
    return { kind: "rect", center: { ...node.position }, halfW: ext.halfW, halfH: ext.halfH };
  }
  // box, plane-like rects, rings, arrows, vector fields, points: conservative
  // box (x–z rects are squares in the graph plane; y is conservative).
  return { kind: "box", center: { ...node.position }, half: Math.max(ext.halfW, ext.halfD) };
}

/** Sprite scale factor for node labels: min(size, 2) (renderer.ts:947–948). */
function nodeLabelScale(node: SceneGraphNode): number {
  return node.kind === "label" ? node.size : Math.min(node.size, 2);
}

/** The tier-1 sprite rect of a node's label (design-1 §1.4), or null when the
 * node carries no label text. Standalone `label` objects are centered at
 * their position; attached node labels sit at `size*0.9 + 0.4` above. */
export function nodeLabelRect(node: SceneGraphNode): Rect | null {
  if (node.label === undefined) return null;
  const scale = nodeLabelScale(node);
  const offsetY = node.kind === "label" ? 0 : node.size * NODE_LABEL_OFFSET_FACTOR + NODE_LABEL_OFFSET_BASE;
  return {
    center: { x: node.position.x, y: node.position.y + offsetY, z: node.position.z },
    halfW: (NODE_LABEL_SPRITE_W / 2) * scale,
    halfH: (NODE_LABEL_SPRITE_H / 2) * scale,
  };
}

/**
 * The tier-2 measured glyph box of a node's label (design-1 §1.4): the same
 * placement as the sprite rect, but width scaled by the text length against
 * the 320-px canvas and height by the measured glyph ratio. Sprite boxes are
 * text-independent; glyph boxes are what the layout engine's soft pre-clear
 * uses. Null when the node carries no label.
 */
export function nodeLabelGlyphRect(node: SceneGraphNode): Rect | null {
  const sprite = nodeLabelRect(node);
  if (!sprite || node.label === undefined) return null;
  const scale = nodeLabelScale(node);
  const text = node.label;
  const halfW = (Math.min(LABEL_CANVAS_W, text.length * CHAR_WIDTH_PX) / LABEL_CANVAS_W) * sprite.halfW;
  return {
    center: { ...sprite.center },
    halfW,
    halfH: scale * 0.097,
  };
}

/**
 * Tier-1 edge-label sprite rect (design-1 §1.4): fixed 1.9×0.42 world-unit
 * sprite centered on the edge midpoint + 0.5 in y. The label string is part
 * of the frozen signature (tier-2 consumers may measure it); the sprite
 * rect itself is text-independent.
 */
export function edgeLabelRect(from: Vec3, to: Vec3, _label: string): Rect {
  return {
    center: {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2 + EDGE_LABEL_Y_OFFSET,
      z: (from.z + to.z) / 2,
    },
    halfW: EDGE_LABEL_SPRITE_W / 2,
    halfH: EDGE_LABEL_SPRITE_H / 2,
  };
}

/**
 * Tier-2 glyph half extents for a text length against a sprite of half
 * extents `spriteW × spriteH`: the glyph box is the sprite box scaled to the
 * measured text width (clipped at the canvas) and the measured glyph height.
 */
export function labelTextExtent(
  text: string,
  spriteW: number,
  spriteH: number,
): { halfW: number; halfH: number } {
  const n = text.length;
  return {
    halfW: (Math.min(LABEL_CANVAS_W, n * CHAR_WIDTH_PX) / LABEL_CANVAS_W) * spriteW,
    halfH: spriteH * GLYPH_HEIGHT_RATIO,
  };
}

// ---------------------------------------------------------------------------
// Predicates (margin = extra required gap)
// ---------------------------------------------------------------------------

/** Minimum distance between a point and an axis-aligned box. */
function pointBoxDistance(p: Vec3, center: Vec3, halfX: number, halfY: number, halfZ: number): number {
  const dx = Math.max(0, Math.abs(p.x - center.x) - halfX);
  const dy = Math.max(0, Math.abs(p.y - center.y) - halfY);
  const dz = Math.max(0, Math.abs(p.z - center.z) - halfZ);
  return Math.hypot(dx, dy, dz);
}

function boxesOverlap(
  a: { center: Vec3; halfX: number; halfY: number; halfZ: number },
  b: { center: Vec3; halfX: number; halfY: number; halfZ: number },
  margin: number,
): boolean {
  return (
    Math.abs(a.center.x - b.center.x) < a.halfX + b.halfX + margin &&
    Math.abs(a.center.y - b.center.y) < a.halfY + b.halfY + margin &&
    Math.abs(a.center.z - b.center.z) < a.halfZ + b.halfZ + margin
  );
}

/** True when two envelopes overlap past the required margin. */
export function envelopeOverlap(a: Envelope, b: Envelope, margin: number): boolean {
  const ra = sphereRadius(a);
  const rb = sphereRadius(b);
  if (ra !== null && rb !== null) {
    return dist(a.center, b.center) < ra + rb + margin;
  }
  if (ra !== null) {
    const box = envBox(b);
    return pointBoxDistance(a.center, box.center, box.halfX, box.halfY, box.halfZ) < ra + margin;
  }
  if (rb !== null) {
    const box = envBox(a);
    return pointBoxDistance(b.center, box.center, box.halfX, box.halfY, box.halfZ) < rb + margin;
  }
  return boxesOverlap(envBox(a), envBox(b), margin);
}

/** True when an x–y plane rect overlaps an envelope past the margin. */
export function rectEnvelopeOverlap(rect: Rect, env: Envelope, margin: number): boolean {
  const rectBox = {
    center: rect.center,
    halfX: rect.halfW,
    halfY: rect.halfH,
    halfZ: 0,
  };
  const r = sphereRadius(env);
  if (r !== null) {
    return pointBoxDistance(env.center, rectBox.center, rectBox.halfX, rectBox.halfY, rectBox.halfZ) < r + margin;
  }
  return boxesOverlap(rectBox, envBox(env), margin);
}

/** True when two x–y plane rects overlap past the margin (z-thickness 0). */
export function rectRectOverlap(a: Rect, b: Rect, margin: number): boolean {
  return (
    Math.abs(a.center.x - b.center.x) < a.halfW + b.halfW + margin &&
    Math.abs(a.center.y - b.center.y) < a.halfH + b.halfH + margin &&
    Math.abs(a.center.z - b.center.z) < margin
  );
}

/** Minimum distance from point p to segment [a, b]. */
export function pointSegmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (len2 > 0) {
    t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
    t = Math.min(1, Math.max(0, t));
  }
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}

/** Minimum distance from a segment to a box's surface (0 when intersecting). */
function segmentBoxDistance(
  from: Vec3,
  to: Vec3,
  center: Vec3,
  halfX: number,
  halfY: number,
  halfZ: number,
): number {
  const minX = center.x - halfX;
  const maxX = center.x + halfX;
  const minY = center.y - halfY;
  const maxY = center.y + halfY;
  const minZ = center.z - halfZ;
  const maxZ = center.z + halfZ;

  // Slab intersection test — inside ⇒ 0.
  const dirX = to.x - from.x;
  const dirY = to.y - from.y;
  const dirZ = to.z - from.z;
  let tmin = 0;
  let tmax = 1;
  for (const [d, lo, hi] of [
    [dirX, minX - from.x, maxX - from.x],
    [dirY, minY - from.y, maxY - from.y],
    [dirZ, minZ - from.z, maxZ - from.z],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (lo > 0 || hi < 0) return Number.POSITIVE_INFINITY;
      continue;
    }
    let t1 = lo / d;
    let t2 = hi / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) break;
  }
  if (tmin <= tmax && tmax >= 0 && tmin <= 1) return 0;

  // Not intersecting: min over the 12 box edges of segment–segment distance.
  const corners: Array<[number, number, number]> = [
    [minX, minY, minZ], [maxX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
    [minX, minY, maxZ], [maxX, minY, maxZ], [minX, maxY, maxZ], [maxX, maxY, maxZ],
  ];
  const edges: Array<[number, number]> = [
    [0, 1], [2, 3], [4, 5], [6, 7], // x
    [0, 2], [1, 3], [4, 6], [5, 7], // y
    [0, 4], [1, 5], [2, 6], [3, 7], // z
  ];
  let best = Number.POSITIVE_INFINITY;
  for (const [i, j] of edges) {
    const c1 = corners[i];
    const c2 = corners[j];
    const d = segmentSegmentDistance(from, to, { x: c1[0], y: c1[1], z: c1[2] }, { x: c2[0], y: c2[1], z: c2[2] });
    if (d < best) best = d;
  }
  return best;
}

/** Minimum distance between two segments (closest points). */
function segmentSegmentDistance(p1: Vec3, p2: Vec3, p3: Vec3, p4: Vec3): number {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d1z = p2.z - p1.z;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const d2z = p4.z - p3.z;
  const rx = p1.x - p3.x;
  const ry = p1.y - p3.y;
  const rz = p1.z - p3.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  if (a <= 1e-12 && e <= 1e-12) return Math.hypot(rx, ry, rz);
  if (a <= 1e-12) {
    const t = Math.min(1, Math.max(0, f / e));
    return Math.hypot(rx - d2x * t, ry - d2y * t, rz - d2z * t);
  }
  const c = d1x * rx + d1y * ry + d1z * rz;
  if (e <= 1e-12) {
    const t = Math.min(1, Math.max(0, -c / a));
    return Math.hypot(rx + d1x * t, ry + d1y * t, rz + d1z * t);
  }
  const b = d1x * d2x + d1y * d2y + d1z * d2z;
  const denom = a * e - b * b;
  let s = denom > 1e-12 ? (b * f - c * e) / denom : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.min(1, Math.max(0, -c / a));
  } else if (t > 1) {
    t = 1;
    s = Math.min(1, Math.max(0, (b - c) / a));
  }
  s = Math.min(1, Math.max(0, s));
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(
    rx + d1x * s - d2x * t,
    ry + d1y * s - d2y * t,
    rz + d1z * s - d2z * t,
  );
}

/**
 * Minimum distance from segment [from, to] to an envelope's surface (stage-4
 * I2 support; 0 when the segment enters the shape).
 */
export function segmentEnvelopeDistance(from: Vec3, to: Vec3, env: Envelope): number {
  const r = sphereRadius(env);
  if (r !== null) {
    return Math.max(0, pointSegmentDistance(env.center, from, to) - r);
  }
  const box = envBox(env);
  return segmentBoxDistance(from, to, box.center, box.halfX, box.halfY, box.halfZ);
}

// ---------------------------------------------------------------------------
// Scene bounds + runtime clamp
// ---------------------------------------------------------------------------

/**
 * Deterministic content AABB for a scene: every node envelope + every
 * node-label sprite rect + every edge-label sprite rect, inflated by
 * SCENE_BOUNDS_MARGIN (covers the arrowhead cone base and inhibits bar
 * extents, design-1 §1.5/§3.2). Always finite; a scene with no nodes yields a
 * degenerate bounds at the origin.
 */
export function computeSceneBounds(
  nodes: SceneGraphNode[],
  edges: Array<{ from: Vec3; to: Vec3 }>,
): SceneBounds {
  let minX = 0;
  let minY = 0;
  let minZ = 0;
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  let first = true;

  const include = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void => {
    if (first) {
      minX = cx - hx; maxX = cx + hx;
      minY = cy - hy; maxY = cy + hy;
      minZ = cz - hz; maxZ = cz + hz;
      first = false;
      return;
    }
    minX = Math.min(minX, cx - hx);
    maxX = Math.max(maxX, cx + hx);
    minY = Math.min(minY, cy - hy);
    maxY = Math.max(maxY, cy + hy);
    minZ = Math.min(minZ, cz - hz);
    maxZ = Math.max(maxZ, cz + hz);
  };

  for (const node of nodes) {
    const env = nodeEnvelope(node);
    if (env.kind === "sphere") {
      include(env.center.x, env.center.y, env.center.z, env.radius, env.radius, env.radius);
    } else if (env.kind === "box") {
      include(env.center.x, env.center.y, env.center.z, env.half, env.half, env.half);
    } else {
      include(env.center.x, env.center.y, env.center.z, env.halfW, env.halfH, 0);
    }
    const label = nodeLabelRect(node);
    if (label) {
      include(label.center.x, label.center.y, label.center.z, label.halfW, label.halfH, 0);
    }
  }
  for (const edge of edges) {
    const rect = edgeLabelRect(edge.from, edge.to, "");
    include(rect.center.x, rect.center.y, rect.center.z, rect.halfW, rect.halfH, 0);
  }

  const margin = SCENE_BOUNDS_MARGIN;
  const min: Vec3 = { x: minX - margin, y: minY - margin, z: minZ - margin };
  const max: Vec3 = { x: maxX + margin, y: maxY + margin, z: maxZ + margin };
  const center: Vec3 = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  return {
    min,
    max,
    center,
    radius: Math.hypot(max.x - center.x, max.y - center.y, max.z - center.z),
  };
}

/** Position-level floor into the scene AABB (dynamic I5; design-1 §3.2). */
export function clampPositionToBounds(p: Vec3, bounds: SceneBounds): Vec3 {
  return {
    x: Math.min(bounds.max.x, Math.max(bounds.min.x, p.x)),
    y: Math.min(bounds.max.y, Math.max(bounds.min.y, p.y)),
    z: Math.min(bounds.max.z, Math.max(bounds.min.z, p.z)),
  };
}
