/**
 * labels.ts — label pipeline for the primitive-3d renderer (C2, Wave 3 of the
 * 3D Representation Quality Program). Replaces the C0 extraction (fixed sprite
 * scale, `size*0.9+0.4` offset, silent 40-char slice) with the design-2
 * presentation stage:
 *
 *  1. Shared text model: every label passes through resolveLabelText (owned by
 *     presentation/constants.ts), so 3D sprites, 2D SVG and the gate all agree
 *     on width, truncation and the ellipsis — truncation emits a reason, never
 *     silent (F-01).
 *  2. Text-measured sprites: sprite width follows the measured glyph width
 *     (px / NODE_PX_PER_UNIT from presentation/constants.ts), capped at 2.2u;
 *     node labels and `label`-kind nodes share one scale rule (F-02, F-23).
 *  3. Node-label placement: glyph-rect collision model with the anchor order
 *     above → right → left → below and LABEL_ENV_CLEAR clearance; the first
 *     collision-free anchor wins (F-03 critical: layered_system labels land
 *     right of the stack instead of on the neighbor box).
 *  4. World-space overlay layer: label sprites are children of the scene, not
 *     the node holder; every frame the sprite is repositioned to the node's
 *     world position + the placed offset, so rotation never carries a label
 *     sideways and labels follow engine-driven bodies (F-24). Placement is
 *     re-run lazily when a labeled node moves > LABEL_REPLACE_THRESHOLD.
 *  5. Shared edge-label sprite builder + pure placeEdgeLabel (design §1.4)
 *     for C3 (edges.ts) to import; the edge-label decision logic lives here,
 *     the runtime edge consumption stays in edges.ts.
 *
 * Pure decision logic (resolve/plan/collide) never touches Three.js objects,
 * so unit tests exercise it without mocking `three`.
 */

import * as THREE from "three";
import type { PrimitiveKind, Vec3 } from "@/demonstrations/spec/demo-spec";
import type { SceneGraph, SceneGraphNode } from "./types";
import type { RuntimeNode } from "./renderer";
import type { GraphEdgePlan } from "./scene-graph";
import {
  edgeLabelSpriteScale,
  ELLIPSIS_PX,
  estimateTextWidthPx,
  GLYPH_HALF_H_EDGE,
  GLYPH_HALF_H_NODE,
  LABEL_EDGE_CLEAR,
  LABEL_ENV_CLEAR,
  LABEL_LABEL_CLEAR,
  MAX_TEXTURE_PX,
  NODE_ANCHOR_ORDER,
  nodeLabelSpriteScale,
  REASON_LABEL_ELLIPSIZED,
  resolveLabelText,
  type NodeAnchor,
  type Rect,
} from "./presentation/constants";

// ---------------------------------------------------------------------------
// Label texture (the shared canvas builder; draws RESOLVED text, no slice)
// ---------------------------------------------------------------------------

/**
 * Build an in-code label sprite texture from plain text. The text is resolved
 * through the shared resolver (resolveLabelText), so the drawn string is the
 * 288px-budget-ellipsized string — the old silent 40-char `slice` is gone
 * (F-01). The canvas texture is generated deterministically per call and must
 * be disposed by the caller (or via disposeScene on the renderer). Never loads
 * external images.
 */
export function makeLabelTexture(
  text: string,
  opts?: { dark?: boolean }
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const width = MAX_TEXTURE_PX;
  const height = LABEL_CANVAS_H;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const dark = opts?.dark ?? true;
    const resolved = resolveLabelText(text).text;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = dark ? "#f2f5ff" : "#10131c";
    ctx.fillText(resolved, width / 2, height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------------------------------------------------------------------------
// 1.2 Sprite scale (design-2 §1.2) — text-measured, never a fixed 2.2u box
// ---------------------------------------------------------------------------

/** Label canvas height (texture-only; the width is MAX_TEXTURE_PX). */
const LABEL_CANVAS_H = 72;
/** Glyph z half-depth (sprites are flat in z; collision space needs a band). */
export const GLYPH_HALF_D = 0.001;
/** Placement re-runs when a labeled node moved more than this (design §1.6). */
export const LABEL_REPLACE_THRESHOLD = 0.05;

/** Width in px of the *resolved* text (ellipsis measured at ELLIPSIS_PX). */
function resolvedTextWidthPx(resolved: {
  text: string;
  truncated: boolean;
}): number {
  if (!resolved.truncated) return estimateTextWidthPx(resolved.text);
  return estimateTextWidthPx(resolved.text.slice(0, -1)) + ELLIPSIS_PX;
}

// ---------------------------------------------------------------------------
// Collision space (design-2 §1.3, §1.5)
// ---------------------------------------------------------------------------

/** A node's axis-aligned envelope in world units. */
export interface LabelEnvelope {
  id: string;
  center: Vec3;
  halfExtents: Vec3;
}

/**
 * Node envelope half-extents by kind (design-2 §1.3 anchor table + design-1
 * §1.3 extent table): sphere/process_node/energy_packet r = size·0.5;
 * box / plane / ring / wave_surface / graph_surface / orbit_path size/2;
 * particle_field size/2 (volume); vector_field size/2 horizontal with the
 * tick-height slab; label (size·1.1, size·0.25); arrow (size·0.16, size·0.45);
 * camera_marker r = size·0.4; line/trail/process_edge are points (0).
 * Groups carry no collision envelope (structural containers) and are never
 * passed here.
 */
export function nodeEnvelopeHalfExtents(node: {
  kind: PrimitiveKind;
  size: number;
}): Vec3 {
  const half = node.size / 2;
  switch (node.kind) {
    case "label":
      return { x: node.size * 1.1, y: node.size * 0.25, z: 0.02 };
    case "arrow":
      return { x: node.size * 0.16, y: node.size * 0.45, z: 0.02 };
    case "camera_marker":
      return { x: node.size * 0.4, y: node.size * 0.4, z: node.size * 0.4 };
    case "vector_field":
      return { x: half, y: half, z: (node.size * 0.22) / 2 };
    case "line":
    case "trail":
    case "process_edge":
      return { x: 0, y: 0, z: 0.02 };
    default:
      return { x: half, y: half, z: half };
  }
}

export function nodeEnvelope(node: {
  id: string;
  kind: PrimitiveKind;
  position: Vec3;
  size: number;
}): LabelEnvelope {
  return {
    id: node.id,
    center: { ...node.position },
    halfExtents: nodeEnvelopeHalfExtents(node),
  };
}

export function inflateEnvelope(
  env: LabelEnvelope,
  amount: number
): LabelEnvelope {
  return {
    id: env.id,
    center: { ...env.center },
    halfExtents: {
      x: env.halfExtents.x + amount,
      y: env.halfExtents.y + amount,
      z: env.halfExtents.z + amount,
    },
  };
}

/**
 * Sub-ulp tolerance for clearance-boundary tests. The anchor math places
 * candidate rects EXACTLY at the clearance boundary (a float knife-edge), so
 * without this epsilon a 1-ulp rounding difference flips the strict `<` and
 * makes exact-clearance placements non-deterministic across platforms.
 * 1e-9 world units is far below any visible geometry.
 */
const RECT_EPS = 1e-9;

/** Axis-aligned rect-rect overlap with an optional clearance (strict <). */
export function rectsOverlap(a: Rect, b: Rect, clearance = 0): boolean {
  return (
    Math.abs(a.cx - b.cx) < a.halfW + b.halfW + clearance - RECT_EPS &&
    Math.abs(a.cy - b.cy) < a.halfH + b.halfH + clearance - RECT_EPS &&
    Math.abs(a.cz - b.cz) < a.halfD + b.halfD + clearance - RECT_EPS
  );
}

function rectToEnvelopeRect(env: LabelEnvelope): Rect {
  return {
    cx: env.center.x,
    cy: env.center.y,
    cz: env.center.z,
    halfW: env.halfExtents.x,
    halfH: env.halfExtents.y,
    halfD: env.halfExtents.z,
  };
}

/** Collision context for label placement (design-2 §1.5). */
export interface LabelCollisionContext {
  /**
   * All non-group node envelopes, already inflated by LABEL_ENV_CLEAR (the
   * clearance is folded into the envelopes, not into the label rect).
   */
  nodeEnvelopes: LabelEnvelope[];
  /** Routed edge polylines (straight from→to today; C3 feeds sampled ones). */
  edgePolylines: Array<{ id: string; pts: Vec3[] }>;
  /** Already-placed label rects, inflated by LABEL_LABEL_CLEAR. */
  placedRects: Rect[];
}

// --- segment-vs-AABB distance (exact) ---------------------------------------

function pointBoxDistance(p: Vec3, box: Rect): number {
  const dx = Math.max(0, Math.abs(p.x - box.cx) - box.halfW);
  const dy = Math.max(0, Math.abs(p.y - box.cy) - box.halfH);
  const dz = Math.max(0, Math.abs(p.z - box.cz) - box.halfD);
  return Math.hypot(dx, dy, dz);
}

function segmentIntersectsBox(a: Vec3, b: Vec3, box: Rect): boolean {
  let tmin = 0;
  let tmax = 1;
  const axes = ["x", "y", "z"] as const;
  const half = { x: box.halfW, y: box.halfH, z: box.halfD };
  const c = { x: box.cx, y: box.cy, z: box.cz };
  for (const axis of axes) {
    const d = b[axis] - a[axis];
    const lo = c[axis] - half[axis];
    const hi = c[axis] + half[axis];
    if (Math.abs(d) < 1e-12) {
      if (a[axis] < lo || a[axis] > hi) return false;
    } else {
      let t1 = (lo - a[axis]) / d;
      let t2 = (hi - a[axis]) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

function distanceSegmentSegment(
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  p4: Vec3
): number {
  const d1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
  const d2 = { x: p4.x - p3.x, y: p4.y - p3.y, z: p4.z - p3.z };
  const r = { x: p1.x - p3.x, y: p1.y - p3.y, z: p1.z - p3.z };
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z;
  const e = d2.x * d2.x + d2.y * d2.y + d2.z * d2.z;
  const f = d2.x * r.x + d2.y * r.y + d2.z * r.z;
  let s: number;
  let t: number;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1.x * r.x + d1.y * r.y + d1.z * r.z;
    if (e <= 1e-12) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
      const denom = a * e - b * b;
      s =
        denom > 1e-12
          ? Math.min(1, Math.max(0, (b * f - c * e) / denom))
          : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s };
  const c2 = { x: p3.x + d2.x * t, y: p3.y + d2.y * t, z: p3.z + d2.z * t };
  return Math.hypot(c2.x - c1.x, c2.y - c1.y, c2.z - c1.z);
}

/** Distance from segment (a→b) to a rect treated as a solid AABB. */
function distanceSegmentAABB(a: Vec3, b: Vec3, box: Rect): number {
  if (segmentIntersectsBox(a, b, box)) return 0;
  let best = pointBoxDistance(a, box);
  best = Math.min(best, pointBoxDistance(b, box));

  // Box edges (12): the two z-faces' rectangles.
  const hw = box.halfW;
  const hh = box.halfH;
  const hd = box.halfD;
  const corners = [
    { x: box.cx - hw, y: box.cy - hh, z: box.cz - hd },
    { x: box.cx + hw, y: box.cy - hh, z: box.cz - hd },
    { x: box.cx - hw, y: box.cy + hh, z: box.cz - hd },
    { x: box.cx + hw, y: box.cy + hh, z: box.cz - hd },
    { x: box.cx - hw, y: box.cy - hh, z: box.cz + hd },
    { x: box.cx + hw, y: box.cy - hh, z: box.cz + hd },
    { x: box.cx - hw, y: box.cy + hh, z: box.cz + hd },
    { x: box.cx + hw, y: box.cy + hh, z: box.cz + hd },
  ];
  const edges: Array<[Vec3, Vec3]> = [
    [corners[0], corners[1]],
    [corners[2], corners[3]],
    [corners[0], corners[2]],
    [corners[1], corners[3]],
    [corners[4], corners[5]],
    [corners[6], corners[7]],
    [corners[4], corners[6]],
    [corners[5], corners[7]],
    [corners[0], corners[4]],
    [corners[1], corners[5]],
    [corners[2], corners[6]],
    [corners[3], corners[7]],
  ];
  for (const [p, q] of edges) {
    best = Math.min(best, distanceSegmentSegment(a, b, p, q));
  }

  // Face interiors (6): perpendicular approach when the closest point on the
  // face plane is reached inside the face rect.
  const faces: Array<{
    axis: "x" | "y" | "z";
    offset: number;
    bounds: { minA: number; maxA: number; minB: number; maxB: number };
  }> = [
    { axis: "x", offset: box.cx - hw, bounds: { minA: box.cy - hh, maxA: box.cy + hh, minB: box.cz - hd, maxB: box.cz + hd } },
    { axis: "x", offset: box.cx + hw, bounds: { minA: box.cy - hh, maxA: box.cy + hh, minB: box.cz - hd, maxB: box.cz + hd } },
    { axis: "y", offset: box.cy - hh, bounds: { minA: box.cx - hw, maxA: box.cx + hw, minB: box.cz - hd, maxB: box.cz + hd } },
    { axis: "y", offset: box.cy + hh, bounds: { minA: box.cx - hw, maxA: box.cx + hw, minB: box.cz - hd, maxB: box.cz + hd } },
    { axis: "z", offset: box.cz - hd, bounds: { minA: box.cx - hw, maxA: box.cx + hw, minB: box.cy - hh, maxB: box.cy + hh } },
    { axis: "z", offset: box.cz + hd, bounds: { minA: box.cx - hw, maxA: box.cx + hw, minB: box.cy - hh, maxB: box.cy + hh } },
  ];
  for (const face of faces) {
    const { axis, offset, bounds } = face;
    const a1 = a[axis] - offset;
    const b1 = b[axis] - offset;
    if (Math.abs(b1 - a1) < 1e-12) {
      // Parallel to the face plane: constant distance; candidate only when the
      // segment's projection reaches the face rect.
      const projA = projectToFace(a, axis);
      const projB = projectToFace(b, axis);
      if (segmentTouchesRect2D(projA, projB, bounds)) {
        best = Math.min(best, Math.abs(a1));
      }
      continue;
    }
    const t0 = -a1 / (b1 - a1);
    if (t0 < 0 || t0 > 1) continue;
    const p = {
      x: a.x + t0 * (b.x - a.x),
      y: a.y + t0 * (b.y - a.y),
      z: a.z + t0 * (b.z - a.z),
    };
    const proj = projectToFace(p, axis);
    if (pointInRect2D(proj, bounds)) {
      best = Math.min(best, Math.abs(a1));
    }
  }
  return best;
}

function projectToFace(
  p: Vec3,
  axis: "x" | "y" | "z"
): { u: number; v: number } {
  if (axis === "x") return { u: p.y, v: p.z };
  if (axis === "y") return { u: p.x, v: p.z };
  return { u: p.x, v: p.y };
}

function pointInRect2D(
  p: { u: number; v: number },
  r: { minA: number; maxA: number; minB: number; maxB: number }
): boolean {
  return p.u >= r.minA && p.u <= r.maxA && p.v >= r.minB && p.v <= r.maxB;
}

function segmentTouchesRect2D(
  a: { u: number; v: number },
  b: { u: number; v: number },
  r: { minA: number; maxA: number; minB: number; maxB: number }
): boolean {
  if (pointInRect2D(a, r) || pointInRect2D(b, r)) return true;
  // Segment vs the four rect edges (2D orientation test).
  const edges: Array<
    [{ u: number; v: number }, { u: number; v: number }]
  > = [
    [{ u: r.minA, v: r.minB }, { u: r.maxA, v: r.minB }],
    [{ u: r.minA, v: r.maxB }, { u: r.maxA, v: r.maxB }],
    [{ u: r.minA, v: r.minB }, { u: r.minA, v: r.maxB }],
    [{ u: r.maxA, v: r.minB }, { u: r.maxA, v: r.maxB }],
  ];
  for (const [p, q] of edges) {
    if (segmentsIntersect2D(a, b, p, q)) return true;
  }
  return false;
}

function cross2D(
  o: { u: number; v: number },
  a: { u: number; v: number },
  b: { u: number; v: number }
): number {
  return (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
}

function segmentsIntersect2D(
  a: { u: number; v: number },
  b: { u: number; v: number },
  c: { u: number; v: number },
  d: { u: number; v: number }
): boolean {
  const d1 = cross2D(a, b, c);
  const d2 = cross2D(a, b, d);
  const d3 = cross2D(c, d, a);
  const d4 = cross2D(c, d, b);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  if (d1 === 0 && pointOnSegment2D(c, a, b)) return true;
  if (d2 === 0 && pointOnSegment2D(d, a, b)) return true;
  if (d3 === 0 && pointOnSegment2D(a, c, d)) return true;
  if (d4 === 0 && pointOnSegment2D(b, c, d)) return true;
  return false;
}

function pointOnSegment2D(
  p: { u: number; v: number },
  a: { u: number; v: number },
  b: { u: number; v: number }
): boolean {
  return (
    p.u >= Math.min(a.u, b.u) &&
    p.u <= Math.max(a.u, b.u) &&
    p.v >= Math.min(a.v, b.v) &&
    p.v <= Math.max(a.v, b.v)
  );
}

/**
 * True when the rect collides with anything in the context: an inflated node
 * envelope, an already-placed label rect, or an edge polyline closer than
 * LABEL_EDGE_CLEAR.
 */
export function labelRectCollides(
  r: Rect,
  ctx: LabelCollisionContext
): boolean {
  for (const env of ctx.nodeEnvelopes) {
    if (rectsOverlap(r, rectToEnvelopeRect(env))) return true;
  }
  for (const placed of ctx.placedRects) {
    if (rectsOverlap(r, placed)) return true;
  }
  for (const poly of ctx.edgePolylines) {
    for (let i = 0; i + 1 < poly.pts.length; i++) {
      if (
        distanceSegmentAABB(poly.pts[i], poly.pts[i + 1], r) <
        LABEL_EDGE_CLEAR
      ) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1.3 Node-label anchor selection (design-2 §1.3)
// ---------------------------------------------------------------------------

/**
 * Emitted when no anchor is collision-free; the label still renders at the
 * first anchor (above) so content is never dropped silently. Extension of
 * design-2 (the design defines no fallback for this case).
 */
export const REASON_LABEL_ANCHOR_FALLBACK = "label_anchor_fallback";

/** One placed node label (world-space offset from the node center). */
export interface NodeLabelPlan {
  nodeId: string;
  /** Resolved text (may carry the ellipsis). */
  text: string;
  truncated: boolean;
  anchor: NodeAnchor;
  /** World-space offset from the node center (applied every frame). */
  offset: Vec3;
  /** Raw glyph rect at the node's placement position (not inflated). */
  rect: Rect;
  /** Sprite world width/height (text-measured, min(s,2)-capped). */
  spriteW: number;
  spriteH: number;
}

/** A node participating in label placement (plain data, no Three.js). */
export interface LabelItem {
  id: string;
  kind: PrimitiveKind;
  /** Raw label text (already label ?? id). */
  label: string;
  position: Vec3;
  size: number;
}

export interface PlacementInput {
  /** Label-bearing items, in placement order (node id order). */
  items: LabelItem[];
  /** All non-group node envelopes (raw; inflated internally). */
  envelopes: LabelEnvelope[];
  edgePolylines: Array<{ id: string; pts: Vec3[] }>;
}

function anchorOffset(
  center: Vec3,
  envHalf: Vec3,
  glyphHalfW: number,
  glyphHalfH: number,
  anchor: NodeAnchor
): Vec3 {
  switch (anchor) {
    case "above":
      return { x: 0, y: envHalf.y + glyphHalfH + LABEL_ENV_CLEAR, z: 0 };
    case "right":
      return { x: envHalf.x + glyphHalfW + LABEL_ENV_CLEAR, y: 0, z: 0 };
    case "left":
      return { x: -(envHalf.x + glyphHalfW + LABEL_ENV_CLEAR), y: 0, z: 0 };
    case "below":
      return { x: 0, y: -(envHalf.y + glyphHalfH + LABEL_ENV_CLEAR), z: 0 };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

/**
 * The core placement pass (pure): for each item in order, resolve the text,
 * measure the sprite, then pick the first anchor in NODE_ANCHOR_ORDER whose
 * glyph rect (halfW = sprite/2, halfH = GLYPH_HALF_H_NODE·min(s,2)) collides
 * with nothing. Reasons are pushed for ellipsized labels and anchor fallbacks.
 */
export function placeLabelItems(
  input: PlacementInput,
  reasons: string[]
): NodeLabelPlan[] {
  const inflatedEnvs = input.envelopes.map((env) =>
    inflateEnvelope(env, LABEL_ENV_CLEAR)
  );
  const ctx: LabelCollisionContext = {
    nodeEnvelopes: inflatedEnvs,
    edgePolylines: input.edgePolylines,
    placedRects: [],
  };
  const plans: NodeLabelPlan[] = [];
  for (const item of input.items) {
    const resolved = resolveLabelText(item.label);
    if (resolved.truncated) reasons.push(REASON_LABEL_ELLIPSIZED);
    const textPx = resolvedTextWidthPx(resolved);
    const scale = nodeLabelSpriteScale(item.size, textPx);
    const glyphHalfW = scale.w / 2;
    const glyphHalfH = GLYPH_HALF_H_NODE * Math.min(item.size, 2);
    const envHalf = nodeEnvelopeHalfExtents(item);

    // The anchor math places each candidate EXACTLY LABEL_ENV_CLEAR from the
    // node's own envelope (a float knife-edge), so the own envelope is excluded
    // from the candidate checks — the design's guarantee, made deterministic.
    const ownEnvs = ctx.nodeEnvelopes.filter((e) => e.id !== item.id);
    const itemCtx: LabelCollisionContext = {
      nodeEnvelopes: ownEnvs,
      edgePolylines: ctx.edgePolylines,
      placedRects: ctx.placedRects,
    };

    let chosen: NodeAnchor | null = null;
    for (const anchor of NODE_ANCHOR_ORDER) {
      const offset = anchorOffset(
        item.position,
        envHalf,
        glyphHalfW,
        glyphHalfH,
        anchor
      );
      const rect: Rect = {
        cx: item.position.x + offset.x,
        cy: item.position.y + offset.y,
        cz: item.position.z + offset.z,
        halfW: glyphHalfW,
        halfH: glyphHalfH,
        halfD: GLYPH_HALF_D,
      };
      if (!labelRectCollides(rect, itemCtx)) {
        chosen = anchor;
        break;
      }
    }
    if (chosen === null) {
      // No collision-free anchor: render at the first anchor anyway, loudly.
      chosen = "above";
      reasons.push(REASON_LABEL_ANCHOR_FALLBACK);
    }
    const offset = anchorOffset(
      item.position,
      envHalf,
      glyphHalfW,
      glyphHalfH,
      chosen
    );
    const rect: Rect = {
      cx: item.position.x + offset.x,
      cy: item.position.y + offset.y,
      cz: item.position.z + offset.z,
      halfW: glyphHalfW,
      halfH: glyphHalfH,
      halfD: GLYPH_HALF_D,
    };
    plans.push({
      nodeId: item.id,
      text: resolved.text,
      truncated: resolved.truncated,
      anchor: chosen,
      offset,
      rect,
      spriteW: scale.w,
      spriteH: scale.h,
    });
    // The placed rect enters the label-label space inflated by the clearance.
    ctx.placedRects.push({
      cx: rect.cx,
      cy: rect.cy,
      cz: rect.cz,
      halfW: rect.halfW + LABEL_LABEL_CLEAR,
      halfH: rect.halfH + LABEL_LABEL_CLEAR,
      halfD: rect.halfD + LABEL_LABEL_CLEAR,
    });
  }
  return plans;
}

const FLOW_TYPES = new Set(["flows_to", "transfers_to"]);

function placementInputFromGraph(
  graph: SceneGraph,
  edgePlans?: GraphEdgePlan[]
): PlacementInput {
  const items: LabelItem[] = graph.nodes
    .filter((n) => n.kind !== "label" && n.label !== undefined)
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label ?? n.id,
      position: { ...n.position },
      size: n.size,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const envelopes = graph.nodes
    .filter((n) => n.kind !== "group")
    .map((n) => nodeEnvelope(n));
  let polylines: Array<{ id: string; pts: Vec3[] }>;
  if (edgePlans !== undefined) {
    polylines = edgePlans.map((p) => ({
      id: p.id,
      pts: [{ ...p.from }, { ...p.to }],
    }));
  } else {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    polylines = graph.relationships
      .filter((r) => FLOW_TYPES.has(r.type))
      .map((r) => {
        const from = byId.get(r.from);
        const to = byId.get(r.to);
        if (!from || !to) return null;
        return {
          id: r.id,
          pts: [{ ...from.position }, { ...to.position }],
        };
      })
      .filter((p): p is { id: string; pts: Vec3[] } => p !== null);
  }
  return { items, envelopes, edgePolylines: polylines };
}

/**
 * Deterministic node-label placement for a scene graph. Labels are placed in
 * node id order; the first collision-free anchor per label wins.
 * `opts.edgePlans` supplies the graph-mode edge polylines; when omitted,
 * legacy flows_to/transfers_to relationships are used (non-graph scenes).
 */
export function planNodeLabels(
  graph: SceneGraph,
  opts?: { edgePlans?: GraphEdgePlan[] }
): { plans: NodeLabelPlan[]; reasons: string[] } {
  const reasons: string[] = [];
  const plans = placeLabelItems(
    placementInputFromGraph(graph, opts?.edgePlans),
    reasons
  );
  return { plans, reasons };
}

// ---------------------------------------------------------------------------
// 1.4 Edge-label placement (design-2 §1.4; C3 consumes the plan)
// ---------------------------------------------------------------------------

/** A routed edge's shaft endpoints (world space). */
export interface RoutedEdge {
  id: string;
  fromId: string;
  toId: string;
  from: Vec3;
  to: Vec3;
  /** Edge label text (the relationship label or type). */
  label?: string;
}

export interface EdgeLabelPlan {
  edgeId: string;
  text: string;
  truncated: boolean;
  position: Vec3;
  /** Raw glyph rect (halfH includes LABEL_LABEL_CLEAR per design §1.4). */
  rect: Rect;
}

/**
 * Place an edge label off the shaft, perpendicular to it, away from both
 * endpoint envelopes and every already-placed label. Candidates: d ∈ {+1,−1}
 * (sides of the edge), t ∈ {0.5, 0.38, 0.62, 0.3, 0.7} (along the edge); the
 * first collision-free candidate wins. Returns null when no spot is safe —
 * the caller emits REASON_EDGE_LABEL_SKIPPED (and counts it toward
 * REASON_EDGE_LABEL_DENSE once ≥ 5 skips).
 */
export function placeEdgeLabel(
  edge: RoutedEdge,
  envs: LabelEnvelope[],
  placedRects: Rect[]
): EdgeLabelPlan | null {
  const resolved = resolveLabelText(edge.label ?? edge.id);
  const scale = edgeLabelSpriteScale(resolvedTextWidthPx(resolved));
  const halfW = scale.w / 2;
  // Design §1.4: the candidate rect's halfH carries the label-label clearance.
  const halfH = GLYPH_HALF_H_EDGE + LABEL_LABEL_CLEAR;
  const rect: Rect = {
    cx: 0,
    cy: 0,
    cz: 0,
    halfW,
    halfH,
    halfD: GLYPH_HALF_D,
  };

  const ux = edge.to.x - edge.from.x;
  const uy = edge.to.y - edge.from.y;
  const uz = edge.to.z - edge.from.z;
  const len = Math.hypot(ux, uy, uz);
  if (len < 1e-9) return null; // degenerate self-loop: no label
  const dx = ux / len;
  const dy = uy / len;
  const dz = uz / len;
  // In-plane perpendicular (fallback (0,0,1) for vertical edges).
  let nx = -dy;
  let ny = dx;
  let nz = 0;
  const nlen = Math.hypot(nx, ny, nz);
  if (nlen < 1e-9) {
    nx = 0;
    ny = 0;
    nz = 1;
  } else {
    nx /= nlen;
    ny /= nlen;
  }

  const inflated = envs.map((env) => inflateEnvelope(env, LABEL_ENV_CLEAR));
  const ctx: LabelCollisionContext = {
    nodeEnvelopes: inflated,
    edgePolylines: [{ id: edge.id, pts: [{ ...edge.from }, { ...edge.to }] }],
    placedRects,
  };
  const offset = GLYPH_HALF_H_EDGE + 0.22;
  const tValues = [0.5, 0.38, 0.62, 0.3, 0.7];
  for (const t of tValues) {
    for (const d of [1, -1]) {
      const px = edge.from.x + dx * t * len + nx * d * offset;
      const py = edge.from.y + dy * t * len + ny * d * offset;
      const pz = edge.from.z + dz * t * len + nz * d * offset;
      rect.cx = px;
      rect.cy = py;
      rect.cz = pz;
      if (!labelRectCollides(rect, ctx)) {
        return {
          edgeId: edge.id,
          text: resolved.text,
          truncated: resolved.truncated,
          position: { x: px, y: py, z: pz },
          rect: { ...rect },
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sprite construction (Three.js objects)
// ---------------------------------------------------------------------------

/** The subset of renderer state label construction operates on. */
export interface LabelContext {
  graph: SceneGraph | null;
  graphMode: boolean;
  /** Labels render as a world-space overlay layer (children of the scene). */
  scene: THREE.Scene | null;
  /** Per-renderer overlay registry (built at scene build, updated per frame). */
  labels: LabelOverlay[];
  /** All runtime nodes (world positions for re-placement). */
  runtime: Map<string, RuntimeNode>;
  /** Graph-mode edge plans (straight polylines; C3 feeds routed ones). */
  edgePlans: GraphEdgePlan[];
  trackDisposable(d: { dispose(): void }): void;
}

/** Runtime record for one placed node label. */
export interface LabelOverlay {
  nodeId: string;
  rn: RuntimeNode;
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
  /** Placement plan (null until the build-time placement pass applies). */
  plan: NodeLabelPlan | null;
  /** Node world position when the plan was made (movement threshold). */
  base: Vec3;
}

function worldOf(group: THREE.Object3D): Vec3 {
  const v = new THREE.Vector3();
  group.getWorldPosition(v);
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Build the label sprite for a node that carries a label (every non-label
 * kind). The sprite lives in a WORLD-SPACE overlay layer (child of the scene,
 * not the node holder), so node rotation never carries the label sideways and
 * the label follows the node's world position each frame (F-24). In graph
 * scenes the material participates in selection dimming via `rn.owned`.
 */
export function buildLabelSprite(
  ctx: LabelContext,
  rn: RuntimeNode,
  node: SceneGraphNode
): void {
  const text = node.label ?? node.id;
  const resolved = resolveLabelText(text);
  const texture = makeLabelTexture(text, {
    dark: ctx.graph?.background === "dark",
  });
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  const scale = nodeLabelSpriteScale(node.size, resolvedTextWidthPx(resolved));
  sprite.scale.set(scale.w, scale.h, 1);
  // Tentative position (refined by the placement pass on the next frame);
  // placement is deterministic and completes before the first render.
  sprite.position.set(0, node.size * 0.9 + 0.4, 0);
  ctx.scene?.add(sprite);
  ctx.trackDisposable(texture);
  ctx.labels.push({
    nodeId: node.id,
    rn,
    sprite,
    material,
    texture,
    plan: null,
    base: { ...node.position },
  });
  if (ctx.graphMode) {
    // Labels stay camera-facing and participate in selection dimming (opacity
    // only), via the existing owned-material path.
    rn.owned.push({
      material,
      animateOpacity: true,
      animateColor: false,
      baseColor: undefined,
    });
  }
}

/** The subset of renderer state `buildLabelKindVisual` needs (VisualContext
 * satisfies this structurally — visuals.ts passes its own context). */
export interface LabelKindContext {
  graph: SceneGraph | null;
  trackDisposable(d: { dispose(): void }): void;
}

/** Standalone `label`-kind node sprite (the `label` case of buildVisual). */
export function buildLabelKindVisual(
  ctx: LabelKindContext,
  node: SceneGraphNode,
  holder: THREE.Group
): void {
  const text = node.label ?? node.id;
  const resolved = resolveLabelText(text);
  const texture = makeLabelTexture(text, {
    dark: ctx.graph?.background === "dark",
  });
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  // Same text-measured scale rule as node labels (F-23): capped at min(s, 2).
  const scale = nodeLabelSpriteScale(node.size, resolvedTextWidthPx(resolved));
  sprite.scale.set(scale.w, scale.h, 1);
  holder.add(sprite);
  ctx.trackDisposable(texture);
}

/**
 * Shared edge-label sprite builder for C3 (edges.ts): sprite + texture
 * construction for edge labels lives here per design-2; C3 owns the placement
 * consumption (placeEdgeLabel plan) and per-frame updateEdge positioning.
 * The returned sprite has its scale set and needs its position set by C3.
 */
export function buildEdgeLabelSprite(
  ctx: { dark?: boolean; trackDisposable(d: { dispose(): void }): void },
  text: string
): THREE.Sprite {
  const resolved = resolveLabelText(text);
  const texture = makeLabelTexture(text, { dark: ctx.dark });
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  const scale = edgeLabelSpriteScale(resolvedTextWidthPx(resolved));
  sprite.scale.set(scale.w, scale.h, 1);
  ctx.trackDisposable(texture);
  return sprite;
}

// ---------------------------------------------------------------------------
// 1.6 Runtime label application (world-space overlay)
// ---------------------------------------------------------------------------

/**
 * Assign the build-time placement plans to the matching overlays and snap
 * each sprite to node world position + plan offset.
 */
export function applyLabelPlans(
  ctx: LabelContext,
  plans: NodeLabelPlan[]
): void {
  for (const overlay of ctx.labels) {
    const plan = plans.find((p) => p.nodeId === overlay.nodeId);
    if (!plan) continue;
    overlay.plan = plan;
    overlay.base = worldOf(overlay.rn.group);
    const w = overlay.base;
    overlay.sprite.position.set(
      w.x + plan.offset.x,
      w.y + plan.offset.y,
      w.z + plan.offset.z
    );
  }
}

/**
 * Per-frame label update (call from updateScene): recomputes every label's
 * world position = node world position + placed anchor offset, and lazily
 * re-places ALL labels when any labeled node moved more than
 * LABEL_REPLACE_THRESHOLD from its placement base (design §1.6 — placement
 * stays deterministic; the re-place is silent, reasons surface only at build).
 */
export function updateLabelOverlays(ctx: LabelContext, _dt: number): void {
  if (!ctx.graph || ctx.labels.length === 0) return;
  let needReplan = false;
  for (const overlay of ctx.labels) {
    const w = worldOf(overlay.rn.group);
    if (
      !overlay.plan ||
      Math.abs(w.x - overlay.base.x) > LABEL_REPLACE_THRESHOLD ||
      Math.abs(w.y - overlay.base.y) > LABEL_REPLACE_THRESHOLD ||
      Math.abs(w.z - overlay.base.z) > LABEL_REPLACE_THRESHOLD
    ) {
      needReplan = true;
      break;
    }
  }
  if (needReplan) {
    const items: LabelItem[] = [];
    const envelopes: LabelEnvelope[] = [];
    const byId = new Map(ctx.graph.nodes.map((n) => [n.id, n]));
    for (const node of ctx.graph.nodes) {
      const rn = ctx.runtime.get(node.id);
      const position = rn ? worldOf(rn.group) : { ...node.position };
      if (node.kind !== "group") {
        envelopes.push({
          id: node.id,
          center: { ...position },
          halfExtents: nodeEnvelopeHalfExtents(node),
        });
      }
      if (node.kind !== "label" && node.label !== undefined) {
        items.push({
          id: node.id,
          kind: node.kind,
          label: node.label,
          position,
          size: node.size,
        });
      }
    }
    const polylines: Array<{ id: string; pts: Vec3[] }> = [];
    if (ctx.edgePlans.length > 0 || ctx.graphMode) {
      for (const plan of ctx.edgePlans) {
        const fromRn = ctx.runtime.get(plan.fromId);
        const toRn = ctx.runtime.get(plan.toId);
        polylines.push({
          id: plan.id,
          pts: [
            fromRn ? worldOf(fromRn.group) : { ...plan.from },
            toRn ? worldOf(toRn.group) : { ...plan.to },
          ],
        });
      }
    } else {
      for (const rel of ctx.graph.relationships) {
        if (!FLOW_TYPES.has(rel.type)) continue;
        const from = byId.get(rel.from);
        const to = byId.get(rel.to);
        if (!from || !to) continue;
        const fromRn = ctx.runtime.get(rel.from);
        const toRn = ctx.runtime.get(rel.to);
        polylines.push({
          id: rel.id,
          pts: [
            fromRn ? worldOf(fromRn.group) : { ...from.position },
            toRn ? worldOf(toRn.group) : { ...to.position },
          ],
        });
      }
    }
    // Deterministic order (node id order) — the same rule as the build pass.
    items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const plans = placeLabelItems(
      { items, envelopes, edgePolylines: polylines },
      []
    );
    const byPlanId = new Map(plans.map((p) => [p.nodeId, p]));
    for (const overlay of ctx.labels) {
      const plan = byPlanId.get(overlay.nodeId);
      if (plan) {
        overlay.plan = plan;
        overlay.base = worldOf(overlay.rn.group);
      }
    }
  }
  for (const overlay of ctx.labels) {
    if (!overlay.plan) continue;
    const w = worldOf(overlay.rn.group);
    overlay.sprite.position.set(
      w.x + overlay.plan.offset.x,
      w.y + overlay.plan.offset.y,
      w.z + overlay.plan.offset.z
    );
  }
}
