/**
 * edges.ts — graph/flow edges + trails + edge planning for the primitive-3d
 * renderer (extracted from renderer.ts by C0; C3 owns the presentation-level
 * edge work on top of the extraction).
 *
 * Owns: the RuntimeEdge record, buildGraphEdge (derived canonical-graph
 * edges: routed shaft + radius-aware arrowhead/inhibits bar), buildFlowEdge
 * (legacy plain flows_to/transfers_to edges), attachEdgeLabels (the scene-level
 * edge-label placement pass: candidates per design-2 §1.4, collision-tested
 * with labels.ts' shared collision space, skip+density reasons), the per-frame
 * updateEdge math (world-space routed polyline, flush arrowhead, placed label),
 * the pure planning functions (routeEdge / buildLineGeometry / shaft+head
 * math), and pushTrailPoint (the world-position trail ring buffer — the trail
 * Line lives in the SCENE, not the moving holder, so the history stays in
 * world space: design-2 §4, F-18).
 *
 * The pure planning functions take/return plain data and never touch Three.js,
 * so unit tests exercise the geometry without a WebGL/three stub.
 */

import * as THREE from "three";
import type { GraphEdgePlan } from "./scene-graph";
import type { SceneGraph, SceneGraphRelationship } from "./types";
import type { RuntimeNode } from "./renderer";
import type { Vec3 } from "@/demonstrations/spec/demo-spec";
import { materialFor } from "./materials";
import {
  buildEdgeLabelSprite,
  GLYPH_HALF_D,
  inflateEnvelope,
  labelRectCollides,
  nodeEnvelope,
  type LabelCollisionContext,
  type LabelEnvelope,
  type NodeLabelPlan,
} from "./labels";
import {
  ROUTE_CLEAR,
  ROUTE_MAX_WAYPOINTS,
  CURVE_SAMPLES,
  arrowHead,
  SHAFT_GAP,
  GLYPH_HALF_H_EDGE,
  LABEL_ENV_CLEAR,
  LABEL_LABEL_CLEAR,
  LABEL_EDGE_CLEAR,
  edgeLabelSpriteScale,
  estimateTextWidthPx,
  resolveLabelText,
  TEXT_SAFETY_PX,
  ELLIPSIS_PX,
  REASON_EDGE_UNROUTABLE,
  REASON_EDGE_LABEL_SKIPPED,
  REASON_EDGE_LABEL_DENSE,
  REASON_EDGE_DEGENERATE,
  REASON_LINE_NO_ENDPOINTS,
  type Rect,
} from "./presentation/constants";

const Y_UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Pure geometry: envelopes + segment/box distance primitives
// ---------------------------------------------------------------------------

/** A world-space collision envelope for one scene object (design-2 §7.1). */
export interface Envelope {
  id: string;
  kind: "node" | "field" | "ring" | "plane" | "wave" | "particle";
  shape: "sphere" | "box";
  center: Vec3;
  halfExtents: Vec3;
  /** sphere only: size*0.5 */
  radius?: number;
}

const EPS = 1e-9;

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Distance from point p to segment a→b. */
function pointSegDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t =
    len2 < EPS
      ? 0
      : clampNum(
          ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2,
          0,
          1
        );
  return Math.hypot(
    p.x - (a.x + abx * t),
    p.y - (a.y + aby * t),
    p.z - (a.z + abz * t)
  );
}

/** Distance from point p to an axis-aligned box (center c, half-extents h). */
function pointAABBDistance(p: Vec3, c: Vec3, h: Vec3): number {
  let d2 = 0;
  for (const axis of ["x", "y", "z"] as const) {
    const delta = Math.abs(p[axis] - c[axis]) - h[axis];
    if (delta > 0) d2 += delta * delta;
  }
  return Math.sqrt(d2);
}

/** Closest-points distance between two segments (Real-Time Collision
 * Detection, section 5.1.9). */
function segSegDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number;
  let t: number;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clampNum(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = clampNum(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clampNum((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clampNum(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clampNum((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = addScaled(p1, d1, s);
  const c2 = addScaled(p2, d2, t);
  return Math.hypot(c1.x - c2.x, c1.y - c2.y, c1.z - c2.z);
}

/** Slab test: does segment a→b intersect the AABB (c, h)? */
function segmentIntersectsAABB(a: Vec3, b: Vec3, c: Vec3, h: Vec3): boolean {
  const d = sub(b, a);
  let tmin = 0;
  let tmax = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const da = a[axis] - c[axis];
    const dv = d[axis];
    if (Math.abs(dv) < EPS) {
      if (da < -h[axis] || da > h[axis]) return false;
    } else {
      let t1 = (-h[axis] - da) / dv;
      let t2 = (h[axis] - da) / dv;
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

/** Exact distance from segment a→b to an AABB (c, h): 0 when intersecting,
 * else the min over (endpoints↔box, corners↔segment, box-edges↔segment). */
function segAABBDistance(a: Vec3, b: Vec3, c: Vec3, h: Vec3): number {
  if (segmentIntersectsAABB(a, b, c, h)) return 0;
  let best = Math.min(pointAABBDistance(a, c, h), pointAABBDistance(b, c, h));
  const corners: Array<[number, number, number]> = [
    [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
  ];
  for (const [sx, sy, sz] of corners) {
    best = Math.min(
      best,
      pointSegDistance(
        { x: c.x + sx * h.x, y: c.y + sy * h.y, z: c.z + sz * h.z },
        a,
        b
      )
    );
  }
  // 12 box edges (segments) vs the segment.
  const edgeAxes: Array<[number, number, number]> = [
    [1, -1, -1], [1, 1, -1], [1, -1, 1], [1, 1, 1], // x-aligned
    [-1, 1, -1], [1, 1, -1], [-1, 1, 1], [1, 1, 1], // y-aligned
    [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1], // z-aligned
  ];
  for (let i = 0; i < edgeAxes.length; i += 2) {
    const [ax, ay, az] = edgeAxes[i];
    const [bx, by, bz] = edgeAxes[i + 1];
    best = Math.min(
      best,
      segSegDistance(
        { x: c.x + ax * h.x, y: c.y + ay * h.y, z: c.z + az * h.z },
        { x: c.x + bx * h.x, y: c.y + by * h.y, z: c.z + bz * h.z },
        a,
        b
      )
    );
  }
  return best;
}

/** Min distance between a segment and an envelope (negative = penetrating). */
function envSegmentDistance(a: Vec3, b: Vec3, env: Envelope): number {
  if (env.shape === "sphere") {
    return pointSegDistance(env.center, a, b) - (env.radius ?? 0);
  }
  return segAABBDistance(a, b, env.center, env.halfExtents);
}

/** Routing radius of an envelope (sphere radius, or in-plane diagonal for
 * boxes — conservative for the waypoint placement). */
function envRoutingRadius(env: Envelope): number {
  if (env.radius !== undefined) return env.radius;
  return Math.hypot(env.halfExtents.x, env.halfExtents.z);
}

/**
 * World-space envelopes for every non-group scene object (design-2 §7.1),
 * used by edge ROUTING. `energy_packet` counts as a transient carrier
 * ("particle") — it never blocks edge routing (it is a moving carrier, not a
 * structural node). `line`/`trail`/`label` objects are decorative and carry
 * no envelope. (Label placement uses labels.ts' own envelope model.)
 */
export function nodeEnvelopes(graph: SceneGraph): Envelope[] {
  const envs: Envelope[] = [];
  for (const n of graph.nodes) {
    const half = n.size * 0.5;
    switch (n.kind) {
      case "group":
      case "line":
      case "trail":
      case "label":
        break;
      case "sphere":
      case "process_node":
      case "box":
      case "camera_marker":
        envs.push({
          id: n.id,
          kind: "node",
          shape: n.kind === "box" ? "box" : "sphere",
          center: { ...n.position },
          halfExtents: { x: half, y: half, z: half },
          radius: n.kind === "box" ? undefined : half,
        });
        break;
      case "energy_packet":
        envs.push({
          id: n.id,
          kind: "particle",
          shape: "sphere",
          center: { ...n.position },
          halfExtents: { x: half, y: half, z: half },
          radius: half,
        });
        break;
      case "particle_field":
        envs.push({
          id: n.id,
          kind: "particle",
          shape: "box",
          center: { ...n.position },
          halfExtents: { x: half, y: half, z: half },
        });
        break;
      case "vector_field":
        envs.push({
          id: n.id,
          kind: "field",
          shape: "box",
          center: { ...n.position },
          halfExtents: { x: half, y: half, z: half },
        });
        break;
      case "plane":
      case "graph_surface":
        envs.push({
          id: n.id,
          kind: "plane",
          shape: "box",
          center: { ...n.position },
          halfExtents: { x: half, y: 0.05, z: half },
        });
        break;
      case "ring":
      case "orbit_path":
        envs.push({
          id: n.id,
          kind: "ring",
          shape: "box",
          center: { ...n.position },
          halfExtents: { x: half, y: 0.05, z: half },
        });
        break;
      case "wave_surface":
        envs.push({
          id: n.id,
          kind: "wave",
          shape: "box",
          center: { ...n.position },
          halfExtents: { x: half, y: half, z: half },
        });
        break;
      default:
        break;
    }
  }
  return envs;
}

// ---------------------------------------------------------------------------
// 2.1 Edge routing around non-endpoint node envelopes (design-2 §2.1, I2)
// ---------------------------------------------------------------------------

/** Intersection tolerance for routing re-checks (matches the gate's I2
 * clearance 0.02). */
const ROUTE_INTERSECT_EPS = 0.02;
/** Clearance growth per retry when a detour still intersects an envelope. */
const ROUTE_CLEAR_GROWTH = 0.15;
/** Max clearance-growth retries before the edge is reported unroutable. */
const ROUTE_MAX_GROWTHS = 3;

export interface RouteResult {
  /** Polyline from → waypoints → to (≥ 2 points; best effort). */
  pts: Vec3[];
  /** True when the polyline still intersects an envelope (gate reports I2). */
  blocked: boolean;
  reasons: string[];
}

function polylineHitsEnvelope(
  poly: Vec3[],
  env: Envelope,
  eps: number
): boolean {
  for (let i = 0; i + 1 < poly.length; i++) {
    if (envSegmentDistance(poly[i], poly[i + 1], env) < eps) return true;
  }
  return false;
}

/**
 * Bounded 3-segment detour around a single obstacle: the polyline dips out to
 * the obstacle's side at clearance, runs parallel past the envelope, and
 * returns. The waypoints sit at perpendicular offset (d_c + r_E + clear) on
 * the obstacle's side of S (d_c = center's distance from S), spanning
 * [t − (r_E + clear), t + (r_E + clear)] along S.
 *
 * DEVIATION FROM DESIGN-2 §2.1 (documented): the design's literal detour
 * points `p ∓ n·side·(r_E + ROUTE_CLEAR)` place both waypoints on OPPOSITE
 * sides of S at the obstacle's projection point, so the polyline still crosses
 * the envelope (the segment d1→d2 passes through p, which lies inside the
 * obstacle whenever the obstacle intersects S). The corrected detour keeps the
 * same constants (clearance, max 3 grows) but places the two waypoints on one
 * parallel offset line beyond the envelope, which is the actual 3-segment
 * detour the section describes.
 */
function detourAround(
  env: Envelope,
  from: Vec3,
  to: Vec3,
  ux: number,
  uy: number,
  uz: number,
  nx: number,
  ny: number,
  nz: number,
  segLen: number,
  clear: number
): Vec3[] {
  const t = clampNum(
    (env.center.x - from.x) * ux +
      (env.center.y - from.y) * uy +
      (env.center.z - from.z) * uz,
    0,
    segLen
  );
  const px = from.x + ux * t;
  const py = from.y + uy * t;
  const pz = from.z + uz * t;
  const pcx = env.center.x - px;
  const pcy = env.center.y - py;
  const pcz = env.center.z - pz;
  const dC = Math.hypot(pcx, pcy, pcz);
  // Side of S the obstacle sits on (collinear → +1, deterministic).
  const side = dC < EPS ? 1 : pcx * nx + pcy * ny + pcz * nz >= 0 ? 1 : -1;
  const rE = envRoutingRadius(env);
  const ext = rE + clear;
  const offset = side * (dC + ext);
  const w1t = Math.max(0, t - ext);
  const w2t = Math.min(segLen, t + ext);
  return [
    {
      x: from.x + ux * w1t + nx * offset,
      y: from.y + uy * w1t + ny * offset,
      z: from.z + uz * w1t + nz * offset,
    },
    {
      x: from.x + ux * w2t + nx * offset,
      y: from.y + uy * w2t + ny * offset,
      z: from.z + uz * w2t + nz * offset,
    },
  ];
}

/**
 * Route a straight segment around non-endpoint node envelopes (I2). Pure and
 * deterministic: obstacles are processed in (radius desc, id asc) order; the
 * clearance is grown by 0.15 up to 3 times per obstacle. When the waypoint
 * budget (ROUTE_MAX_WAYPOINTS) or the clearance retries are exhausted the
 * edge is reported `blocked` with REASON_EDGE_UNROUTABLE — the caller keeps
 * the best-effort polyline and surfaces the reason (the gate flags I2), never
 * silently drawing through a body.
 */
export function routeEdgeWithReasons(
  from: Vec3,
  to: Vec3,
  endpoints: { fromId: string; toId: string },
  envs: Envelope[]
): RouteResult {
  const reasons: string[] = [];
  const obstacles = envs.filter(
    (e) =>
      e.kind === "node" && e.id !== endpoints.fromId && e.id !== endpoints.toId
  );
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const segLen = Math.hypot(dx, dy, dz);
  if (segLen < EPS || obstacles.length === 0) {
    return { pts: [from, to], blocked: false, reasons };
  }
  const ux = dx / segLen;
  const uy = dy / segLen;
  const uz = dz / segLen;
  // In-plane perpendicular of S.
  let nx = -uy;
  let ny = ux;
  let nz = 0;
  if (Math.abs(nx) < EPS && Math.abs(ny) < EPS) {
    nx = 0;
    ny = -uz;
    nz = uy;
  }
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

  let poly: Vec3[] = [from, to];
  let waypoints = 0;
  let blocked = false;

  for (let iter = 0; iter < ROUTE_MAX_WAYPOINTS; iter++) {
    const hit = obstacles
      .filter((o) => polylineHitsEnvelope(poly, o, ROUTE_INTERSECT_EPS))
      .sort(
        (a, b) =>
          envRoutingRadius(b) - envRoutingRadius(a) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      )[0];
    if (!hit) break;
    if (waypoints + 2 > ROUTE_MAX_WAYPOINTS) {
      // Waypoint budget exhausted: degrade by simplification (the caller
      // drops the edge label); never draw through a body.
      blocked = true;
      break;
    }
    let clear = ROUTE_CLEAR;
    let detour: Vec3[] | null = null;
    for (let grow = 0; grow <= ROUTE_MAX_GROWTHS; grow++) {
      const d = detourAround(hit, from, to, ux, uy, uz, nx, ny, nz, segLen, clear);
      const candidate = [from, ...d, to];
      const stillHits = obstacles.some((o) =>
        polylineHitsEnvelope(candidate, o, ROUTE_INTERSECT_EPS)
      );
      if (!stillHits) {
        detour = d;
        break;
      }
      clear += ROUTE_CLEAR_GROWTH;
    }
    if (!detour) {
      blocked = true;
      break;
    }
    poly = [from, ...detour, to];
    waypoints += 2;
  }

  if (blocked) reasons.push(REASON_EDGE_UNROUTABLE);
  return { pts: poly, blocked, reasons };
}

/** Convenience wrapper: the routed polyline only (see routeEdgeWithReasons). */
export function routeEdge(
  from: Vec3,
  to: Vec3,
  endpoints: { fromId: string; toId: string },
  envs: Envelope[]
): Vec3[] {
  return routeEdgeWithReasons(from, to, endpoints, envs).pts;
}

// ---------------------------------------------------------------------------
// 2.2 Curved `line` / `process_edge` geometry (design-2 §2.2, F-07)
// ---------------------------------------------------------------------------

/**
 * Line geometry between two resolved endpoints. Straight: 2 points. Curved:
 * a quadratic Bezier with control C = midpoint + n·(0.18·len) (n = in-plane
 * perpendicular), sampled at CURVE_SAMPLES points — the connector is oriented
 * by its endpoints, never the fixed local [0,0,0]→[0,0,size] stub.
 */
export function buildLineGeometry(
  a: Vec3,
  b: Vec3,
  curved: boolean
): Float32Array {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  if (!curved) {
    return new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]);
  }
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  let nx = -uy;
  let ny = ux;
  let nz = 0;
  if (Math.abs(nx) < EPS && Math.abs(ny) < EPS) {
    nx = 0;
    ny = -uz;
    nz = uy;
  }
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const mz = (a.z + b.z) / 2;
  const bow = 0.18 * len;
  const cx = mx + nx * bow;
  const cy = my + ny * bow;
  const cz = mz + nz * bow;
  const pts: number[] = [];
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const t = i / (CURVE_SAMPLES - 1);
    const omt = 1 - t;
    pts.push(
      omt * omt * a.x + 2 * omt * t * cx + t * t * b.x,
      omt * omt * a.y + 2 * omt * t * cy + t * t * b.y,
      omt * omt * a.z + 2 * omt * t * cz + t * t * b.z
    );
  }
  return new Float32Array(pts);
}

/** Fallback local-frame segment for line/process_edge with no endpoint nodes
 * (the documented degenerate case; reason REASON_LINE_NO_ENDPOINTS). */
export function lineFallbackGeometry(size: number): Float32Array {
  return new Float32Array([0, 0, 0, 0, 0, size]);
}

// ---------------------------------------------------------------------------
// 2.3 Arrowhead + shaft math (design-2 §2.3, I4 + F-08)
// ---------------------------------------------------------------------------

export interface EdgeHeadPlan {
  /** clamp(HEAD_RATIO · r_t, HEAD_LEN_MIN, HEAD_LEN_MAX). */
  len: number;
  /** len / HEAD_LEN_RATIO_W (cone proportions unchanged). */
  radius: number;
  /** Cone center distance from the target center: r_t + len/2 → apex flush. */
  inset: number;
}

export function edgeHeadFor(targetRadius: number): EdgeHeadPlan {
  const { len, radius } = arrowHead(targetRadius);
  return { len, radius, inset: targetRadius + len / 2 };
}

export interface ShaftSpanPlan {
  start: Vec3;
  end: Vec3;
}

/**
 * Surface-to-surface shaft span (F-08): the shaft starts at
 * r_s + SHAFT_GAP from the source center and ends at the head base
 * r_t + len from the target center, so a dimmed 0.35-opacity body never shows
 * a shaft through it and the arrowhead connects exactly at its base. Returns
 * null for zero-length edges (degenerate).
 */
export function shaftSpanPlan(
  from: Vec3,
  to: Vec3,
  fromRadius: number,
  toRadius: number
): ShaftSpanPlan | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < EPS) return null;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const head = edgeHeadFor(toRadius);
  const gap = fromRadius + SHAFT_GAP;
  return {
    start: {
      x: from.x + ux * gap,
      y: from.y + uy * gap,
      z: from.z + uz * gap,
    },
    end: {
      x: to.x - ux * (toRadius + head.len),
      y: to.y - uy * (toRadius + head.len),
      z: to.z - uz * (toRadius + head.len),
    },
  };
}

// ---------------------------------------------------------------------------
// 1.4 Edge-label placement (design-2 §1.4, F-04/F-21) — pure
// ---------------------------------------------------------------------------

export interface SceneEdgeLabelPlan {
  id: string;
  /** Resolved (ellipsized) text — the sprite renders exactly this. */
  text: string;
  /** Graph-space position (world space for static scenes). */
  pos: Vec3;
  /** Glyph half-extents (incl. label-label clearance). */
  halfW: number;
  halfH: number;
}

export interface SceneEdgeLabelInput {
  id: string;
  text: string;
  from: Vec3;
  to: Vec3;
}

/** Along-edge candidate fractions (design-2 §1.4). */
const EDGE_LABEL_T_FRACTIONS = [0.5, 0.38, 0.62, 0.3, 0.7] as const;
/** Perpendicular offset: GLYPH_HALF_H_EDGE + 0.22 ≈ 0.30 nominal. */
const EDGE_LABEL_OFFSET = GLYPH_HALF_H_EDGE + 0.22;

/** Width in px of the *resolved* text (same model labels.ts uses for the
 * sprite scale: ellipsis measured at ELLIPSIS_PX). */
function resolvedTextWidthPx(resolved: {
  text: string;
  truncated: boolean;
}): number {
  if (!resolved.truncated) return estimateTextWidthPx(resolved.text);
  return estimateTextWidthPx(resolved.text.slice(0, -1)) + ELLIPSIS_PX;
}

function placeOneEdgeLabel(
  input: SceneEdgeLabelInput,
  ctx: LabelCollisionContext
): SceneEdgeLabelPlan | null {
  const resolved = resolveLabelText(input.text);
  const scale = edgeLabelSpriteScale(resolvedTextWidthPx(resolved));
  const halfW = scale.w / 2;
  // Design §1.4: the candidate rect's halfH carries the label-label clearance.
  const halfH = GLYPH_HALF_H_EDGE + LABEL_LABEL_CLEAR;
  const { from, to } = input;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < EPS) return null; // degenerate self-loop: no label
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  // In-plane perpendicular. DEVIATION FROM DESIGN-2 §1.4 (documented): the
  // design's literal fallback (0,0,1) for z-aligned edges is PARALLEL to the
  // edge, which would force the label onto its own shaft; (1,0,0) is the
  // actual in-plane perpendicular.
  let nx = -uy;
  let ny = ux;
  let nz = 0;
  if (Math.abs(uy) < EPS && Math.abs(ux) < EPS) {
    nx = 1;
    ny = 0;
    nz = 0;
  }
  const rect: Rect = {
    cx: 0,
    cy: 0,
    cz: 0,
    halfW,
    halfH,
    halfD: GLYPH_HALF_D,
  };
  for (const d of [1, -1]) {
    for (const t of EDGE_LABEL_T_FRACTIONS) {
      const pos: Vec3 = {
        x: from.x + dx * t + nx * d * EDGE_LABEL_OFFSET,
        y: from.y + dy * t + ny * d * EDGE_LABEL_OFFSET,
        z: from.z + dz * t + nz * d * EDGE_LABEL_OFFSET,
      };
      rect.cx = pos.x;
      rect.cy = pos.y;
      rect.cz = pos.z;
      if (!labelRectCollides(rect, ctx)) {
        return { id: input.id, text: resolved.text, pos, halfW, halfH };
      }
    }
  }
  return null;
}

/**
 * Scene-level edge-label placement: node-label rects are placed first, then
 * each edge label takes the first perpendicular-offset candidate whose glyph
 * rect clears every inflated node envelope, every already-placed label rect,
 * and every edge polyline (own shaft included). The collision space is
 * labels.ts' shared `labelRectCollides` with the FULL polyline set (the
 * single-edge `placeEdgeLabel` in labels.ts only tests its own straight
 * shaft — design-2 §1.4(c) requires all polylines). No safe spot → skip +
 * REASON_EDGE_LABEL_SKIPPED (degrade by simplification, never reject); ≥ 5
 * skips additionally emit REASON_EDGE_LABEL_DENSE once.
 */
export function placeSceneEdgeLabels(
  inputs: SceneEdgeLabelInput[],
  envs: LabelEnvelope[],
  nodeLabelRects: Rect[],
  polylines: Array<{ id: string; pts: Vec3[] }>
): { plans: Map<string, SceneEdgeLabelPlan>; reasons: string[] } {
  const plans = new Map<string, SceneEdgeLabelPlan>();
  const reasons: string[] = [];
  const ctx: LabelCollisionContext = {
    nodeEnvelopes: envs.map((env) => inflateEnvelope(env, LABEL_ENV_CLEAR)),
    edgePolylines: polylines,
    // Node labels first, inflated by LABEL_LABEL_CLEAR (same rule as
    // labels.ts placeLabelItems).
    placedRects: nodeLabelRects.map((r) => ({
      cx: r.cx,
      cy: r.cy,
      cz: r.cz,
      halfW: r.halfW + LABEL_LABEL_CLEAR,
      halfH: r.halfH + LABEL_LABEL_CLEAR,
      halfD: r.halfD + LABEL_LABEL_CLEAR,
    })),
  };
  let skipped = 0;
  for (const input of inputs) {
    const plan = placeOneEdgeLabel(input, ctx);
    if (plan) {
      plans.set(input.id, plan);
      ctx.placedRects.push({
        cx: plan.pos.x,
        cy: plan.pos.y,
        cz: plan.pos.z,
        halfW: plan.halfW + LABEL_LABEL_CLEAR,
        halfH: plan.halfH + LABEL_LABEL_CLEAR,
        halfD: GLYPH_HALF_D + LABEL_LABEL_CLEAR,
      });
    } else {
      skipped++;
      reasons.push(REASON_EDGE_LABEL_SKIPPED);
    }
  }
  if (skipped >= 5) reasons.push(REASON_EDGE_LABEL_DENSE);
  return { plans, reasons };
}

// ---------------------------------------------------------------------------
// Runtime edge records + build/update
// ---------------------------------------------------------------------------

/** Runtime record for a rendered edge (canonical or legacy flow). */
export interface RuntimeEdge {
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
  /** Routed polyline (graph space, center-to-center) from build time. */
  route: Vec3[];
  /** Placed edge-label plan (graph space) — null when skipped/no label. */
  labelPlan: SceneEdgeLabelPlan | null;
  /** True when from==to: nothing is drawn and REASON_EDGE_DEGENERATE fires. */
  degenerate: boolean;
}

/** The subset of renderer state edge construction operates on. */
export interface EdgeContext {
  scene: THREE.Scene | null;
  graph: SceneGraph | null;
  trackDisposable(d: { dispose(): void }): void;
  edges: RuntimeEdge[];
  pickEdges: Map<THREE.Object3D, string>;
  /** Reason accumulator; the renderer merges it into lastReasons at build. */
  reasons: string[];
}

/**
 * Build a derived graph edge: routed shaft from → to (surface-to-surface at
 * runtime), arrowhead cone at the DESTINATION (or a `—|` bar for inhibits).
 * The relationship label is attached by attachEdgeLabels (placement needs all
 * edges). All materials are per-edge clones so dim/highlight never touch the
 * shared cache.
 */
export function buildGraphEdge(
  ctx: EdgeContext,
  from: RuntimeNode,
  to: RuntimeNode,
  plan: GraphEdgePlan
): void {
  const group = new THREE.Group();
  group.name = `edge:${plan.id}`;

  const f = from.graph.position;
  const t = to.graph.position;
  const totalLen = Math.hypot(t.x - f.x, t.y - f.y, t.z - f.z);
  const degenerate = totalLen < EPS;
  if (degenerate) ctx.reasons.push(REASON_EDGE_DEGENERATE);

  let route: Vec3[] = [f, t];
  if (!degenerate) {
    const envs = ctx.graph ? nodeEnvelopes(ctx.graph) : [];
    const res = routeEdgeWithReasons(
      f,
      t,
      { fromId: plan.fromId, toId: plan.toId },
      envs
    );
    route = res.pts;
    if (res.blocked) ctx.reasons.push(...res.reasons);
  }

  const n = route.length;
  const geo = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  for (let i = 0; i < n; i++) {
    attribute.setXYZ(i, route[i].x, route[i].y, route[i].z);
  }
  geo.setAttribute("position", attribute);
  if (degenerate) geo.setDrawRange(0, 0);
  const lineMaterial = materialFor("line", from.graph.color).clone();
  lineMaterial.transparent = true;
  const line = new THREE.Line(geo, lineMaterial);
  group.add(line);
  ctx.trackDisposable(geo);

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
    ctx.trackDisposable(barGeo);
  } else {
    // Fixed-proportion cone; updateEdge scales it to the ACTUAL target radius
    // each frame (I4: len = clamp(0.72·r_t, 0.18, 0.5), radius = len/2.4).
    const tipGeo = new THREE.ConeGeometry(0.15, 0.36, 10);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(toColor),
    });
    material.transparent = true;
    const tip = new THREE.Mesh(tipGeo, material);
    group.add(tip);
    head = { mesh: tip, material, baseColor: toColor };
    ctx.trackDisposable(tipGeo);
  }

  ctx.scene?.add(group);
  ctx.edges.push({
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
    label: null,
    route,
    labelPlan: null,
    degenerate,
  });
  ctx.pickEdges.set(group, plan.id);
}

/** Legacy plain edge (flows_to / transfers_to only, non-graph scenes). */
export function buildFlowEdge(
  ctx: EdgeContext,
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
  ctx.scene?.add(group);
  ctx.trackDisposable(geo);
  ctx.edges.push({
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
    route: [from.graph.position, to.graph.position],
    labelPlan: null,
    degenerate: false,
  });
}

/**
 * Second build phase: place every edge label (collision-tested, skip+reason)
 * and attach the sprites via labels.ts' shared sprite builder. Must run after
 * ALL edges AND the node-label placement pass (so labels can collide against
 * every edge polyline, the node-label rects, and each other). The node-label
 * plans come from the renderer's planNodeLabels call.
 */
export function attachEdgeLabels(
  ctx: EdgeContext,
  nodeLabelPlans?: NodeLabelPlan[]
): void {
  if (ctx.edges.length === 0) return;
  const envs: LabelEnvelope[] = ctx.graph
    ? ctx.graph.nodes
        .filter((n) => n.kind !== "group")
        .map((n) => nodeEnvelope(n))
    : [];
  const nodeRects: Rect[] = (nodeLabelPlans ?? []).map((p) => ({ ...p.rect }));
  const polylines = ctx.edges.map((e) => ({ id: e.plan.id, pts: e.route }));
  const inputs: SceneEdgeLabelInput[] = [];
  for (const edge of ctx.edges) {
    if (edge.degenerate) continue;
    const text = edge.plan.label;
    if (!text) continue;
    inputs.push({
      id: edge.plan.id,
      text,
      from: edge.from.graph.position,
      to: edge.to.graph.position,
    });
  }
  const { plans, reasons } = placeSceneEdgeLabels(
    inputs,
    envs,
    nodeRects,
    polylines
  );
  ctx.reasons.push(...reasons);
  for (const edge of ctx.edges) {
    const plan = plans.get(edge.plan.id) ?? null;
    edge.labelPlan = plan;
    if (!plan) continue;
    const sprite = buildEdgeLabelSprite(
      {
        dark: ctx.graph?.background === "dark",
        trackDisposable: ctx.trackDisposable,
      },
      plan.text
    );
    sprite.position.set(plan.pos.x, plan.pos.y, plan.pos.z);
    edge.group.add(sprite);
    edge.label = sprite;
  }
}

/** Per-frame world-space edge update (routed shaft, head, label). */
export function updateEdge(edge: RuntimeEdge): void {
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  edge.from.group.getWorldPosition(from);
  edge.to.group.getWorldPosition(to);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);

  if (edge.degenerate || len < EPS) {
    // Zero-length (self-loop): draw nothing, no head, no label (F-11). The
    // reason was emitted once at build time.
    edge.shaft.geometry.setDrawRange(0, 0);
    if (edge.head) edge.head.mesh.visible = false;
    if (edge.label) edge.label.visible = false;
    return;
  }

  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const rFrom = edge.from.graph.size * 0.5;
  const rTo = edge.to.graph.size * 0.5;
  const headPlan = edgeHeadFor(rTo);

  // Routed polyline in world space: endpoints on the surfaces (F-08), interior
  // waypoints shifted by the segment's world↔graph midpoint delta.
  const route = edge.route;
  const n = route.length;
  const midGraphX = (route[0].x + route[n - 1].x) / 2;
  const midGraphY = (route[0].y + route[n - 1].y) / 2;
  const midGraphZ = (route[0].z + route[n - 1].z) / 2;
  const shiftX = (from.x + to.x) / 2 - midGraphX;
  const shiftY = (from.y + to.y) / 2 - midGraphY;
  const shiftZ = (from.z + to.z) / 2 - midGraphZ;

  const gap = rFrom + SHAFT_GAP;
  const headBase = rTo + headPlan.len;
  const attribute = edge.shaft.attribute;
  attribute.setXYZ(
    0,
    from.x + ux * gap,
    from.y + uy * gap,
    from.z + uz * gap
  );
  for (let i = 1; i < n - 1; i++) {
    attribute.setXYZ(
      i,
      route[i].x + shiftX,
      route[i].y + shiftY,
      route[i].z + shiftZ
    );
  }
  attribute.setXYZ(
    n - 1,
    to.x - ux * headBase,
    to.y - uy * headBase,
    to.z - uz * headBase
  );
  attribute.needsUpdate = true;
  edge.shaft.geometry.setDrawRange(0, n);
  edge.shaft.line.visible = true;

  const head = edge.head;
  if (!head) return;
  head.mesh.visible = true;
  if (edge.plan.inhibits) {
    // `—|` bar: perpendicular to the edge direction at the destination; its
    // span is [r_t, r_t + 0.4] (len_bar 0.4 unchanged).
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
    head.mesh.scale.set(1, 1, 1);
    head.mesh.position.set(
      to.x - ux * (rTo + 0.2),
      to.y - uy * (rTo + 0.2),
      to.z - uz * (rTo + 0.2)
    );
    head.mesh.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(px, py, pz));
  } else {
    // Cone center at r_t + len/2 → the APEX lands exactly on the target
    // surface (I4, fixes the 0.04 hover gap). The cone geometry is the fixed
    // 0.15×0.36 proportion; scale to the actual head size.
    const { len: hl, radius: hr } = arrowHead(rTo);
    head.mesh.scale.set(hr / 0.15, hl / 0.36, hr / 0.15);
    head.mesh.position.set(
      to.x - ux * headPlan.inset,
      to.y - uy * headPlan.inset,
      to.z - uz * headPlan.inset
    );
    head.mesh.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(ux, uy, uz));
  }

  if (edge.label && edge.labelPlan) {
    const p = edge.labelPlan.pos;
    edge.label.position.set(p.x + shiftX, p.y + shiftY, p.z + shiftZ);
    edge.label.visible = true;
  }
}

/**
 * Record the holder's world position into the trail ring buffer. The recorded
 * points are WORLD space and the trail Line lives in the SCENE (not the moving
 * holder), so the history stays truthful when the body moves (F-18).
 */
export function pushTrailPoint(rn: RuntimeNode): void {
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

/** Re-exported for visuals.ts (line/process_edge fallback reason). */
export { REASON_LINE_NO_ENDPOINTS };
