/**
 * geometry-gate.ts — pure geometry gate (C5, Wave 3; design-2 §7).
 *
 * Enforces the program invariants I1–I5 (PROGRAM.md) on a laid-out scene:
 *
 *   I1  No two node envelopes intersect.
 *   I2  No edge crosses a non-endpoint node's envelope.
 *   I3  No label overlaps any node envelope, edge, or other label.
 *   I4  Every arrowhead anchors on exactly its source→target pair;
 *       inset = actual target radius + head length.
 *   I5  All rendered content stays inside the framed viewport with margin.
 *
 * Plus informational checkers that never flip `ok`:
 *   - checkEdgeEdgeCrossings        (A4 V3 — not an invariant; reported)
 *   - checkRelationshipVisibility   (A4 P1/F-10 — relationship_invisible_both_surfaces)
 *
 * PURE TS: no Three.js, no DOM, no canvas. All types are plain data so unit
 * tests never mock `three`. Imports only the shared presentation constants
 * (presentation/constants.ts) and the demo-spec `Vec3` type.
 *
 * View convention (used by I5; camera.ts / C4 must match): the view direction
 * is parameterized from the renderer's orbit model —
 *
 *   f(azimuth, polar) = (sin(polar)·sin(azimuth), cos(polar), sin(polar)·cos(azimuth))
 *
 * i.e. polar is the elevation measured from +Y (defaultPolar = acos(0.482) ≈
 * 1.068 rad matches GRAPH_VIEW_DIR (0, 0.55, 1) normalized), azimuth swings
 * around +Y. Right = normalize(cross(up, f)), up = cross(f, right). Ortho NDC
 * uses camera.halfW/halfH; perspective NDC uses fov via
 * NDC = (vx, vy) / (vz·tan(fov/2)).
 */

import type { Vec3 } from "@/demonstrations/spec/demo-spec";
import {
  HEAD_LEN_MAX,
  HEAD_LEN_MIN,
  LABEL_EDGE_CLEAR,
  LABEL_ENV_CLEAR,
  LABEL_LABEL_CLEAR,
  REASON_LABEL_ELLIPSIZED,
  REASON_RELATIONSHIP_INVISIBLE_BOTH,
  SHAFT_GAP,
  type Rect,
} from "./presentation/constants";

// ---------------------------------------------------------------------------
// Types (design-2 §7.1, exact)
// ---------------------------------------------------------------------------

export interface Envelope {
  id: string;
  kind: "node" | "field" | "ring" | "plane" | "wave" | "particle";
  shape: "sphere" | "box" | "rect"; // rect = axis-aligned world box (label/field/plane)
  center: Vec3;
  halfExtents: Vec3;
  radius?: number; // sphere: radius = size*0.5
}

export interface EdgeGeom {
  id: string;
  fromId: string;
  toId: string;
  inhibits: boolean;
  pts: Vec3[]; // routed polyline (curves pre-sampled); last point = head base
  headLen: number; // from arrowHead(targetRadius)
  targetRadius: number; // actual (size*0.5), never max(0.25, …)
  /**
   * True when the edge's arrowhead was DEGRADED AWAY (MUST-FIX 5): the edge
   * is shorter than r_s + r_t + headLen even after layout repair, so the
   * renderer suppresses the head and emits `edge_head_suppressed_short_edge`.
   * The I4 checker skips such edges entirely (there is no head to anchor);
   * the suppression reason is the loud surface, never a silent pass.
   */
  headSuppressed?: boolean;
}

export interface LabelGeom {
  id: string;
  kind: "node" | "edge";
  rect: Rect;
  text: string;
  truncated: boolean;
}

export interface CanonicalView {
  name: "front" | "top" | "left" | "right" | "worst";
  azimuth: number;
  polar: number;
  distance: number;
}

export interface CameraGeom {
  mode: "ortho" | "perspective";
  center: Vec3;
  halfH: number;
  halfW: number;
  aspect: number;
  distance: number;
  fovDeg: number;
  canonicalViews: CanonicalView[];
}

/**
 * Dynamic content the frame must also cover (engine bodies + field bounds +
 * trail bboxes; design-2 §3.1). C4's camera stage feeds the same concept —
 * the gate accepts any superset as long as the fields below are present.
 */
export interface DynamicExtent {
  /** world-space points that must remain in frame (body centers, trail points). */
  points: Vec3[];
  /** world-space axis-aligned boxes that must remain in frame (engine field spans). */
  boxes?: Array<{ min: Vec3; max: Vec3 }>;
}

/**
 * Declared relationships (spec-level) so checkRelationshipVisibility can tell
 * a relationship with no rendered edge on this surface. Additive to
 * design-2's GateScene: the INFO checker needs the declared set.
 */
export interface DeclaredRelationship {
  id: string;
  from: string;
  to: string;
}

export interface GateScene {
  envelopes: Envelope[];
  edges: EdgeGeom[];
  labels: LabelGeom[];
  camera: CameraGeom;
  dynamic?: DynamicExtent;
  declaredRelationships?: DeclaredRelationship[];
}

export type InvariantId = "I1" | "I2" | "I3" | "I4" | "I5" | "INFO";

export interface Violation {
  id: string;
  invariant: InvariantId;
  severity: "critical" | "major" | "minor" | "info";
  reason: string;
  detail?: Record<string, number | string>;
}

export interface GateResult {
  ok: boolean;
  violations: Violation[];
}

// ---------------------------------------------------------------------------
// Gate reason codes (surfaced via the renderer's reason channel)
// ---------------------------------------------------------------------------

export const REASON_ENVELOPE_OVERLAP = "envelope_intersection";
export const REASON_FIELD_OVERLAPS_NODE = "field_overlaps_node";
export const REASON_EDGE_CROSSES_NODE = "edge_crosses_node_envelope";
export const REASON_LABEL_OVERLAP = "label_overlap";
export const REASON_ARROW_TIP_OFF_SURFACE = "arrow_tip_off_surface";
export const REASON_ARROW_HEAD_PENETRATES_TARGET = "arrow_head_penetrates_target";
export const REASON_ARROW_HEAD_IN_SOURCE = "arrow_head_inside_source";
export const REASON_ARROW_HEAD_LENGTH = "arrow_head_length_out_of_bounds";
export const REASON_SHAFT_INSIDE_SOURCE = "shaft_inside_source_envelope";
export const REASON_VIEWPORT_OUT_OF_FRAME = "content_outside_viewport";
export const REASON_EDGE_EDGE_CROSSING = "edge_edge_crossing";

// ---------------------------------------------------------------------------
// Gate reason codes for the PRODUCTION wiring (design-2 §7.2 / MUST-FIX 1):
// violation-derived codes appended to the renderer's reason channel so a
// gated scene that fails loudly is never silent. One code per invariant with
// any critical/major violation; `gate_unverified` when any breach remains
// after the degrade steps (the scene is accepted with a documented residual).
// ---------------------------------------------------------------------------

export const REASON_GATE_I1 = "gate_I1_violations";
export const REASON_GATE_I2 = "gate_I2_violations";
export const REASON_GATE_I3 = "gate_I3_violations";
export const REASON_GATE_I4 = "gate_I4_violations";
export const REASON_GATE_I5 = "gate_I5_violations";
export const REASON_GATE_UNVERIFIED = "gate_unverified";

/** Invariant → gate code for a violation with severity ≥ major. */
export function gateReasonForInvariant(invariant: InvariantId): string | null {
  switch (invariant) {
    case "I1":
      return REASON_GATE_I1;
    case "I2":
      return REASON_GATE_I2;
    case "I3":
      return REASON_GATE_I3;
    case "I4":
      return REASON_GATE_I4;
    case "I5":
      return REASON_GATE_I5;
    default:
      return null; // INFO never blocks and never gets a gate code
  }
}

// ---------------------------------------------------------------------------
// Tolerances (design-2 §7)
// ---------------------------------------------------------------------------

/** I1 pairwise envelope intersection epsilon (design-2 §7.1). */
export const GATE_EPS = 1e-4;
/** I2 segment-vs-envelope clearance. */
export const GATE_EDGE_ENV_CLEAR = 0.02;
/** I4 anchoring tolerance (±) and I5 NDC slack. */
export const GATE_TOLERANCE = 0.02;
/** I5 NDC slack outside [−1, 1]. */
export const GATE_NDC_SLACK = 0.02;

// ---------------------------------------------------------------------------
// Geometry helpers (pure)
// ---------------------------------------------------------------------------

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
function normalize(a: Vec3): Vec3 {
  const l = len(a);
  if (l < 1e-12) return { x: 0, y: 1, z: 0 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
function scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Distance from point p to the axis-aligned box centered at c with half-extents h. */
function pointBoxDistance(p: Vec3, c: Vec3, h: Vec3): number {
  const gap = (v: number, cv: number, hv: number) =>
    Math.max(0, Math.abs(v - cv) - hv);
  const gx = gap(p.x, c.x, h.x);
  const gy = gap(p.y, c.y, h.y);
  const gz = gap(p.z, c.z, h.z);
  return Math.hypot(gx, gy, gz);
}

/** Distance from point p to the box [min, max] (point-AABB). */
function pointAABBDistance(p: Vec3, min: Vec3, max: Vec3): number {
  return pointBoxDistance(
    p,
    { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    { x: (max.x - min.x) / 2, y: (max.y - min.y) / 2, z: (max.z - min.z) / 2 }
  );
}

/** Distance from point p to the segment [a, b]. */
export function pointSegmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return len(sub(p, a));
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return len(sub(p, add(a, scale(ab, t))));
}

/**
 * Distance from segment [a, b] to an axis-aligned box (min/max). dist(p(t),
 * box) is convex in t (distance to a convex set composed with an affine map),
 * so ternary search over t ∈ [0, 1] converges to the exact minimum.
 */
export function segmentBoxDistance(a: Vec3, b: Vec3, min: Vec3, max: Vec3): number {
  const d = sub(b, a);
  const f = (t: number) => pointAABBDistance(add(a, scale(d, t)), min, max);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2;
    else lo = m1;
  }
  return f((lo + hi) / 2);
}

/** Distance from a point to an envelope surface (0 when inside). */
function pointEnvelopeDistance(p: Vec3, e: Envelope): number {
  if (e.shape === "sphere") {
    return Math.max(0, len(sub(p, e.center)) - (e.radius ?? 0));
  }
  return pointBoxDistance(p, e.center, e.halfExtents);
}

/**
 * SIGNED distance from a point to an envelope surface: negative inside
 * (penetration depth), zero on the surface, positive outside. Used by I4 so
 * "head dips into the target/source" is detectable (plain max(0, …) clamps
 * penetrations to 0).
 */
function signedEnvelopeDistance(p: Vec3, e: Envelope): number {
  if (e.shape === "sphere") {
    return len(sub(p, e.center)) - (e.radius ?? 0);
  }
  const d = {
    x: Math.abs(p.x - e.center.x) - e.halfExtents.x,
    y: Math.abs(p.y - e.center.y) - e.halfExtents.y,
    z: Math.abs(p.z - e.center.z) - e.halfExtents.z,
  };
  if (d.x <= 0 && d.y <= 0 && d.z <= 0) {
    // Inside: penetration depth = the smallest axis-wise overshoot.
    return -Math.min(-d.x, -d.y, -d.z);
  }
  return Math.hypot(Math.max(0, d.x), Math.max(0, d.y), Math.max(0, d.z));
}

/** Min signed distance from a segment to an envelope (sampled — head segments are short). */
function segmentSignedEnvelopeDistance(a: Vec3, b: Vec3, e: Envelope): number {
  let min = Infinity;
  const samples = 8;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
    min = Math.min(min, signedEnvelopeDistance(p, e));
  }
  return min;
}

/** Distance from a segment to an envelope surface (0 when intersecting). */
function segmentEnvelopeDistance(a: Vec3, b: Vec3, e: Envelope): number {
  if (e.shape === "sphere") {
    return Math.max(0, pointSegmentDistance(e.center, a, b) - (e.radius ?? 0));
  }
  const min = {
    x: e.center.x - e.halfExtents.x,
    y: e.center.y - e.halfExtents.y,
    z: e.center.z - e.halfExtents.z,
  };
  const max = {
    x: e.center.x + e.halfExtents.x,
    y: e.center.y + e.halfExtents.y,
    z: e.center.z + e.halfExtents.z,
  };
  return segmentBoxDistance(a, b, min, max);
}

/** True when two envelopes intersect by more than EPS (I1 semantics). */
function envelopeIntersects(a: Envelope, b: Envelope, eps: number): boolean {
  const sa = a.shape === "sphere";
  const sb = b.shape === "sphere";
  if (sa && sb) {
    return len(sub(a.center, b.center)) < (a.radius ?? 0) + (b.radius ?? 0) - eps;
  }
  if (sa) {
    return pointBoxDistance(a.center, b.center, b.halfExtents) < (a.radius ?? 0) - eps;
  }
  if (sb) {
    return pointBoxDistance(b.center, a.center, a.halfExtents) < (b.radius ?? 0) - eps;
  }
  // box vs box (rect included): separated if any axis gap is positive.
  const gap = (av: number, ah: number, bv: number, bh: number) =>
    Math.abs(av - bv) - (ah + bh);
  const gx = gap(a.center.x, a.halfExtents.x, b.center.x, b.halfExtents.x);
  const gy = gap(a.center.y, a.halfExtents.y, b.center.y, b.halfExtents.y);
  const gz = gap(a.center.z, a.halfExtents.z, b.center.z, b.halfExtents.z);
  return gx < -eps && gy < -eps && gz < -eps;
}

/** AABB (rect inflated by margin) vs envelope overlap test (I3 semantics). */
function rectEnvelopeOverlap(
  rect: Rect,
  env: Envelope,
  margin: number
): boolean {
  if (env.shape === "sphere") {
    // Uninflated rect vs sphere inflated by margin: the label must clear the
    // envelope surface by `margin`.
    const min = { x: rect.cx - rect.halfW, y: rect.cy - rect.halfH, z: rect.cz - rect.halfD };
    const max = { x: rect.cx + rect.halfW, y: rect.cy + rect.halfH, z: rect.cz + rect.halfD };
    return pointAABBDistance(env.center, min, max) < (env.radius ?? 0) + margin - GATE_EPS;
  }
  // Box/rect envelope: inflated-rect vs envelope (the inflation is unwound in
  // the axis comparison below, i.e. the UNINFLATED rect must clear the
  // envelope by `margin`).
  const min = {
    x: rect.cx - rect.halfW - margin,
    y: rect.cy - rect.halfH - margin,
    z: rect.cz - rect.halfD - margin,
  };
  const max = {
    x: rect.cx + rect.halfW + margin,
    y: rect.cy + rect.halfH + margin,
    z: rect.cz + rect.halfD + margin,
  };
  const envMin = {
    x: env.center.x - env.halfExtents.x,
    y: env.center.y - env.halfExtents.y,
    z: env.center.z - env.halfExtents.z,
  };
  const envMax = {
    x: env.center.x + env.halfExtents.x,
    y: env.center.y + env.halfExtents.y,
    z: env.center.z + env.halfExtents.z,
  };
  const overlap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
    aMin < bMax - margin + GATE_EPS && bMin < aMax - margin + GATE_EPS;
  return (
    overlap(min.x, max.x, envMin.x, envMax.x) &&
    overlap(min.y, max.y, envMin.y, envMax.y) &&
    overlap(min.z, max.z, envMin.z, envMax.z)
  );
}

/** True when two rects come within `margin` of each other (I3 semantics). */
function rectRectOverlap(a: Rect, b: Rect, margin: number): boolean {
  const gap = (av: number, ah: number, bv: number, bh: number) =>
    Math.abs(av - bv) - (ah + bh);
  const gx = gap(a.cx, a.halfW, b.cx, b.halfW);
  const gy = gap(a.cy, a.halfH, b.cy, b.halfH);
  const gz = gap(a.cz, a.halfD, b.cz, b.halfD);
  return gx < margin + GATE_EPS && gy < margin + GATE_EPS && gz < margin + GATE_EPS;
}

// ---------------------------------------------------------------------------
// I1 — no two node envelopes intersect
// ---------------------------------------------------------------------------

export function checkEnvelopeIntersections(scene: GateScene): GateResult {
  const violations: Violation[] = [];
  const nodes = scene.envelopes.filter((e) => e.kind === "node");
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (envelopeIntersects(a, b, GATE_EPS)) {
        violations.push({
          id: a.id,
          invariant: "I1",
          severity: "major",
          reason: REASON_ENVELOPE_OVERLAP,
          detail: { with: b.id },
        });
      }
    }
  }
  // Informational: non-node envelopes (fields/rings/planes/waves/particles)
  // may overlap node envelopes only as a documented survivor (design-2 §5.3).
  for (const other of scene.envelopes) {
    if (other.kind === "node") continue;
    for (const node of nodes) {
      if (envelopeIntersects(other, node, GATE_EPS)) {
        violations.push({
          id: other.id,
          invariant: "INFO",
          severity: "info",
          reason: REASON_FIELD_OVERLAPS_NODE,
          detail: { with: node.id },
        });
        break;
      }
    }
  }
  // INFO violations never flip `ok` — I1 is about node envelopes only.
  const invariantViolations = violations.filter((v) => v.invariant === "I1");
  return { ok: invariantViolations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// I2 — no edge crosses a non-endpoint node envelope
// ---------------------------------------------------------------------------

export function checkEdgeCrossings(scene: GateScene): GateResult {
  const violations: Violation[] = [];
  const nodes = scene.envelopes.filter((e) => e.kind === "node");
  for (const edge of scene.edges) {
    for (let i = 1; i < edge.pts.length; i++) {
      const a = edge.pts[i - 1];
      const b = edge.pts[i];
      for (const env of nodes) {
        if (env.id === edge.fromId || env.id === edge.toId) continue;
        const dist = segmentEnvelopeDistance(a, b, env);
        if (dist < GATE_EDGE_ENV_CLEAR) {
          violations.push({
            id: edge.id,
            invariant: "I2",
            severity: "major",
            reason: REASON_EDGE_CROSSES_NODE,
            detail: { node: env.id, clearance: dist },
          });
        }
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// I3 — no label overlaps any node envelope, edge, or other label
// ---------------------------------------------------------------------------

export function checkLabelOverlaps(scene: GateScene): GateResult {
  const violations: Violation[] = [];
  const nodes = scene.envelopes.filter((e) => e.kind === "node");

  for (const label of scene.labels) {
    // Ellipsized labels are informational, never a violation (design-2 §7.1).
    if (label.truncated) {
      violations.push({
        id: label.id,
        invariant: "INFO",
        severity: "info",
        reason: REASON_LABEL_ELLIPSIZED,
      });
    }
    for (const env of nodes) {
      if (rectEnvelopeOverlap(label.rect, env, LABEL_ENV_CLEAR)) {
        violations.push({
          id: label.id,
          invariant: "I3",
          severity: "major",
          reason: REASON_LABEL_OVERLAP,
          detail: { with: `envelope:${env.id}` },
        });
      }
    }
    for (const edge of scene.edges) {
      for (let i = 1; i < edge.pts.length; i++) {
        if (segmentBoxDistance(edge.pts[i - 1], edge.pts[i], labelRectMin(label.rect), labelRectMax(label.rect)) < LABEL_EDGE_CLEAR) {
          violations.push({
            id: label.id,
            invariant: "I3",
            severity: "major",
            reason: REASON_LABEL_OVERLAP,
            detail: { with: `edge:${edge.id}` },
          });
        }
      }
    }
  }

  for (let i = 0; i < scene.labels.length; i++) {
    for (let j = i + 1; j < scene.labels.length; j++) {
      if (rectRectOverlap(scene.labels[i].rect, scene.labels[j].rect, LABEL_LABEL_CLEAR)) {
        violations.push({
          id: scene.labels[i].id,
          invariant: "I3",
          severity: "major",
          reason: REASON_LABEL_OVERLAP,
          detail: { with: `label:${scene.labels[j].id}` },
        });
      }
    }
  }

  // INFO (ellipsized) violations never flip `ok`.
  const invariantViolations = violations.filter((v) => v.invariant === "I3");
  return { ok: invariantViolations.length === 0, violations };
}

function labelRectMin(rect: Rect): Vec3 {
  return { x: rect.cx - rect.halfW, y: rect.cy - rect.halfH, z: rect.cz - rect.halfD };
}
function labelRectMax(rect: Rect): Vec3 {
  return { x: rect.cx + rect.halfW, y: rect.cy + rect.halfH, z: rect.cz + rect.halfD };
}

// ---------------------------------------------------------------------------
// I4 — arrowhead anchoring: inset = actual target radius + head length
// ---------------------------------------------------------------------------

export function checkArrowAnchoring(scene: GateScene): GateResult {
  const violations: Violation[] = [];
  const byId = new Map(scene.envelopes.map((e) => [e.id, e]));

  for (const edge of scene.edges) {
    if (edge.headSuppressed) continue; // degraded away — reason surfaces it
    if (edge.headLen < HEAD_LEN_MIN - GATE_EPS || edge.headLen > HEAD_LEN_MAX + GATE_EPS) {
      violations.push({
        id: edge.id,
        invariant: "I4",
        severity: "major",
        reason: REASON_ARROW_HEAD_LENGTH,
        detail: { headLen: edge.headLen },
      });
    }
    if (edge.pts.length < 2) continue;

    const source = byId.get(edge.fromId);
    const target = byId.get(edge.toId);
    if (!source || !target) continue; // endpoint envelope missing — nothing to anchor to

    const base = edge.pts[edge.pts.length - 1];
    // DEVIATION FROM DESIGN-2 §7.1 (documented, W9): the head axis is the
    // CENTER-TO-CENTER axis of the endpoint envelopes — exactly how the
    // renderer's updateEdge orients the cone every frame — not the last
    // polyline segment. On detoured (routed) edges the last segment's
    // direction differs from the rendered head axis, which produced false
    // `arrow_tip_off_surface` majors (red-team W9). The check still enforces
    // tip-on-surface, band [r_t, r_t + len] and head-not-in-source.
    const dir = normalize(sub(target.center, source.center));
    const tip = add(base, scale(dir, edge.headLen));

    // Tip exactly ON the target surface: signed distance ≈ 0 (±0.02).
    // For sphere targets this is the design's "tipDist == r_t ± 0.02";
    // for box/rect targets it means the apex sits on the hit face.
    const tipSigned = signedEnvelopeDistance(tip, target);
    if (Math.abs(tipSigned) > GATE_TOLERANCE) {
      violations.push({
        id: edge.id,
        invariant: "I4",
        severity: "major",
        reason: REASON_ARROW_TIP_OFF_SURFACE,
        detail: { tipSigned, radius: edge.targetRadius },
      });
    }

    // Head band [r_t, r_t + len] outside the target: the base sits `headLen`
    // beyond the surface (±0.02) and the head never dips inside the volume.
    const baseSigned = signedEnvelopeDistance(base, target);
    if (Math.abs(baseSigned - edge.headLen) > GATE_TOLERANCE) {
      violations.push({
        id: edge.id,
        invariant: "I4",
        severity: "major",
        reason: REASON_ARROW_HEAD_PENETRATES_TARGET,
        detail: { baseSigned, expected: edge.headLen },
      });
    }
    const headToTarget = segmentSignedEnvelopeDistance(base, tip, target);
    if (headToTarget < -GATE_TOLERANCE) {
      violations.push({
        id: edge.id,
        invariant: "I4",
        severity: "major",
        reason: REASON_ARROW_HEAD_PENETRATES_TARGET,
        detail: { penetration: -headToTarget },
      });
    }

    // Head not inside the SOURCE envelope: L >= r_s + r_t + len − 0.02 for
    // radial heads (design-2 §2.3), plus a direct segment test for every shape.
    const L = len(sub(target.center, source.center));
    const rSource = source.shape === "sphere" ? (source.radius ?? 0) : 0;
    if (source.shape === "sphere" && L < rSource + edge.targetRadius + edge.headLen - GATE_TOLERANCE) {
      violations.push({
        id: edge.id,
        invariant: "I4",
        severity: "major",
        reason: REASON_ARROW_HEAD_IN_SOURCE,
        detail: { distance: L, required: rSource + edge.targetRadius + edge.headLen },
      });
    }
    const headToSource = segmentSignedEnvelopeDistance(base, tip, source);
    if (headToSource < -GATE_TOLERANCE) {
      violations.push({
        id: edge.id,
        invariant: "I4",
        severity: "major",
        reason: REASON_ARROW_HEAD_IN_SOURCE,
        detail: { penetration: -headToSource },
      });
    }

    // Shaft start sits SHAFT_GAP outside the source surface — the shaft never
    // pierces either endpoint volume at any opacity (F-08). Signed distance:
    // a shaft that starts INSIDE the source reads as a large negative gap.
    const startGap = signedEnvelopeDistance(edge.pts[0], source);
    if (Math.abs(startGap - SHAFT_GAP) > GATE_TOLERANCE) {
      violations.push({
        id: edge.id,
        invariant: "I4",
        severity: "major",
        reason: REASON_SHAFT_INSIDE_SOURCE,
        detail: { startGap, expected: SHAFT_GAP },
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// I5 — all content inside the framed viewport with margin (each canonical view)
// ---------------------------------------------------------------------------

/** Unit view direction: f(azimuth, polar) = (sin p · sin a, cos p, sin p · cos a). */
export function viewDirection(azimuth: number, polar: number): Vec3 {
  return {
    x: Math.sin(polar) * Math.sin(azimuth),
    y: Math.cos(polar),
    z: Math.sin(polar) * Math.cos(azimuth),
  };
}

export interface ViewProjection {
  view: CanonicalView;
  /** NDC x/y for a world point; null when behind the camera (perspective). */
  project(p: Vec3): { x: number; y: number } | null;
}

export function makeViewProjection(camera: CameraGeom, view: CanonicalView): ViewProjection {
  const f = viewDirection(view.azimuth, view.polar);
  const up = { x: 0, y: 1, z: 0 };
  // Degenerate when f ∥ up (polar ≈ 0, a straight top-down view): fall back
  // to +x as the right vector so the basis stays well-defined.
  const c = cross(up, f);
  const right = len(c) < 1e-9 ? { x: 1, y: 0, z: 0 } : normalize(c);
  const upv = cross(f, right);
  const eye = add(camera.center, scale(f, view.distance));
  const tanHalfFov = Math.tan(((camera.fovDeg * Math.PI) / 180) / 2);
  return {
    view,
    project(p: Vec3): { x: number; y: number } | null {
      const v = sub(p, eye);
      // View-space depth along the LOOK direction: the eye sits at
      // center + f·distance and the camera looks along −f (three.js
      // convention), so depth = −dot(v, f) is positive exactly for points
      // in front of the camera. (Wave-4b MUST-FIX 1 wiring exposed a sign
      // bug here: the code used dot(v, f), which reads every visible point
      // as "behind_camera" — every perspective / non-graph scene failed
      // I5 in production while the ortho graph scenes masked it.)
      const depth = -dot(v, f);
      if (camera.mode === "perspective") {
        if (depth <= GATE_EPS) return null; // behind the camera
        const scaleFactor = 1 / (depth * tanHalfFov);
        return { x: dot(v, right) * scaleFactor, y: dot(v, upv) * scaleFactor };
      }
      return { x: dot(v, right) / camera.halfW, y: dot(v, upv) / camera.halfH };
    },
  };
}

/** Content sample points for I5: envelope corners/surface, label corners, edge points, dynamic. */
export function contentPoints(scene: GateScene): Array<{ id: string; kind: "envelope" | "label" | "edge" | "dynamic"; p: Vec3 }> {
  const out: Array<{ id: string; kind: "envelope" | "label" | "edge" | "dynamic"; p: Vec3 }> = [];
  for (const e of scene.envelopes) {
    const h = e.halfExtents;
    const r = e.shape === "sphere" ? (e.radius ?? 0) : 0;
    for (const [dx, dy, dz] of [
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
      [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    ] as const) {
      out.push({
        id: e.id,
        kind: "envelope",
        p: {
          x: e.center.x + (e.shape === "sphere" ? r : h.x) * dx,
          y: e.center.y + (e.shape === "sphere" ? r : h.y) * dy,
          z: e.center.z + (e.shape === "sphere" ? r : h.z) * dz,
        },
      });
    }
  }
  for (const l of scene.labels) {
    const r = l.rect;
    for (const [dx, dy, dz] of [
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
      [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    ] as const) {
      out.push({
        id: l.id,
        kind: "label",
        p: { x: r.cx + r.halfW * dx, y: r.cy + r.halfH * dy, z: r.cz + r.halfD * dz },
      });
    }
  }
  for (const e of scene.edges) {
    for (const p of e.pts) out.push({ id: e.id, kind: "edge", p });
  }
  const dyn = scene.dynamic;
  if (dyn) {
    for (const p of dyn.points) out.push({ id: "dynamic", kind: "dynamic", p });
    for (const box of dyn.boxes ?? []) {
      for (const [dx, dy, dz] of [
        [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
        [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
      ] as const) {
        out.push({
          id: "dynamic",
          kind: "dynamic",
          p: {
            x: dx > 0 ? box.max.x : box.min.x,
            y: dy > 0 ? box.max.y : box.min.y,
            z: dz > 0 ? box.max.z : box.min.z,
          },
        });
      }
    }
  }
  return out;
}

export function checkViewportCoverage(scene: GateScene): GateResult {
  const violations: Violation[] = [];
  const points = contentPoints(scene);
  for (const view of scene.camera.canonicalViews) {
    const projection = makeViewProjection(scene.camera, view);
    for (const cp of points) {
      const ndc = projection.project(cp.p);
      if (ndc === null) {
        violations.push({
          id: cp.id,
          invariant: "I5",
          severity: cp.kind === "edge" ? "minor" : "major",
          reason: REASON_VIEWPORT_OUT_OF_FRAME,
          detail: { view: view.name, cause: "behind_camera" },
        });
        continue;
      }
      if (Math.abs(ndc.x) > 1 + GATE_NDC_SLACK || Math.abs(ndc.y) > 1 + GATE_NDC_SLACK) {
        violations.push({
          id: cp.id,
          invariant: "I5",
          severity: cp.kind === "edge" ? "minor" : "major",
          reason: REASON_VIEWPORT_OUT_OF_FRAME,
          detail: { view: view.name, ndcX: ndc.x, ndcY: ndc.y },
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Informational checkers (never flip `ok`)
// ---------------------------------------------------------------------------

/** 2D segment-segment intersection (orientation test; collinear overlap counts). */
function segmentsIntersect2D(
  a: Vec3, b: Vec3, c: Vec3, d: Vec3
): boolean {
  const o = (p: Vec3, q: Vec3, r: Vec3) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    // Collinear: overlap iff the projections on the dominant axis overlap.
    const axis = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? "x" : "y";
    const [p1, p2] = axis === "x" ? [a.x, b.x] : [a.y, b.y];
    const [p3, p4] = axis === "x" ? [c.x, d.x] : [c.y, d.y];
    const lo = Math.max(Math.min(p1, p2), Math.min(p3, p4));
    const hi = Math.min(Math.max(p1, p2), Math.max(p3, p4));
    return lo <= hi;
  }
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function checkEdgeEdgeCrossings(scene: GateScene): GateResult {
  const violations: Violation[] = [];
  for (let i = 0; i < scene.edges.length; i++) {
    for (let j = i + 1; j < scene.edges.length; j++) {
      const a = scene.edges[i];
      const b = scene.edges[j];
      for (let k = 1; k < a.pts.length; k++) {
        for (let m = 1; m < b.pts.length; m++) {
          if (segmentsIntersect2D(a.pts[k - 1], a.pts[k], b.pts[m - 1], b.pts[m])) {
            violations.push({
              id: a.id,
              invariant: "INFO",
              severity: "info",
              reason: REASON_EDGE_EDGE_CROSSING,
              detail: { with: b.id },
            });
            break;
          }
        }
      }
    }
  }
  return { ok: true, violations };
}

export function checkRelationshipVisibility(scene: GateScene): GateResult {
  const violations: Violation[] = [];
  const rendered = new Set(scene.edges.map((e) => `${e.fromId}->${e.toId}`));
  for (const rel of scene.declaredRelationships ?? []) {
    if (!rendered.has(`${rel.from}->${rel.to}`)) {
      violations.push({
        id: rel.id,
        invariant: "INFO",
        severity: "info",
        reason: REASON_RELATIONSHIP_INVISIBLE_BOTH,
        detail: { from: rel.from, to: rel.to },
      });
    }
  }
  return { ok: true, violations };
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

const INVARIANT_ORDER: Record<InvariantId, number> = {
  I1: 0, I2: 1, I3: 2, I4: 3, I5: 4, INFO: 5,
};
const SEVERITY_ORDER: Record<Violation["severity"], number> = {
  critical: 0, major: 1, minor: 2, info: 3,
};

export function checkScene(scene: GateScene): GateResult {
  const results = [
    checkEnvelopeIntersections(scene),
    checkEdgeCrossings(scene),
    checkLabelOverlaps(scene),
    checkArrowAnchoring(scene),
    checkViewportCoverage(scene),
    checkEdgeEdgeCrossings(scene),
    checkRelationshipVisibility(scene),
  ];
  const violations = results.flatMap((r) => r.violations);
  const ok = results.slice(0, 5).every((r) => r.ok);
  violations.sort(
    (x, y) =>
      INVARIANT_ORDER[x.invariant] - INVARIANT_ORDER[y.invariant] ||
      SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity] ||
      x.id.localeCompare(y.id)
  );
  return { ok, violations };
}
