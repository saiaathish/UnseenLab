/**
 * presentation/resolve-presentation.ts — the PURE presentation aggregate
 * (design-2 §0/§7.2, red-team MUST-FIX 1).
 *
 * Implements the design's `resolvePresentation` stage — the missing seam
 * between buildSceneGraph and the geometry gate:
 *
 *   buildSceneGraph → resolvePresentation → checkScene
 *
 * It reproduces, with plain data, EXACTLY the presentation decisions the
 * renderer makes at build time (design-2 §8.1's assembly, re-implemented
 * inside app source so the corpus and the renderer share one code path):
 *
 *   1. node-label placement      planNodeLabels (anchor order, clearances)
 *   2. graph-edge routing        routeEdgeWithReasons (bounded detours)
 *   3. edge-label placement      placeSceneEdgeLabels (skip + density reasons)
 *   4. camera framing            contentAABBFromGraph + graphFrameHalfHeight /
 *                                perspectiveDistance + canonicalViews
 *   5. GateScene assembly        envelopes / edges (shaft polyline + head) /
 *                                labels / camera / declared relationships
 *   6. checkScene                I1–I5 + informational checkers
 *
 * The GateScene is built from the same modules the renderer consumes, so the
 * gate's I4 anchor math (center-to-center head axis, geometry-gate.ts) and
 * the renderer's updateEdge agree by construction (red-team W9).
 *
 * MUST-FIX 5 degrade parity: when an edge is shorter than
 * r_s + r_t + headLen even after the layout's post-repair lengthening, the
 * renderer suppresses its arrowhead and emits
 * `edge_head_suppressed_short_edge`; this module marks the same edges
 * `headSuppressed` so the gate's I4 checker skips them (the suppression
 * reason is the loud surface).
 *
 * PURE TS: no Three.js, no DOM. The graph passed in is READ-ONLY here (the
 * I3 label-shorten degrade lives in shortenGateLabels, which the renderer
 * calls on the graph it is about to build).
 */

import type { SceneGraph, SceneGraphRelationship } from "../types";
import type { GraphEdgePlan } from "../scene-graph";
import type { Vec3 } from "@/demonstrations/spec/demo-spec";
import {
  checkScene,
  gateReasonForInvariant,
  REASON_GATE_UNVERIFIED,
  type CameraGeom,
  type EdgeGeom,
  type GateScene,
  type GateResult,
  type LabelGeom,
  type Violation,
} from "../geometry-gate";
import { deriveGraphEdges, isGraphLikeScene } from "../scene-graph";
import { nodeEnvelopes, placeSceneEdgeLabels, routeEdgeWithReasons } from "../edges";
import {
  GLYPH_HALF_D,
  nodeEnvelope as nodeLabelEnvelope,
  planNodeLabels,
  type LabelEnvelope,
  type NodeLabelPlan,
} from "../labels";
import {
  contentAABBFromGraph,
  canonicalViews,
  contentExtentCenter,
  DEFAULT_FOV_DEG,
  FRAME_ASPECT_DEFAULT,
  graphFrameHalfHeight,
  perspectiveDistance,
} from "../camera";
import {
  REASON_EDGE_HEAD_SUPPRESSED,
  SHAFT_GAP,
  arrowHead,
} from "./constants";

export const REASON_GATE_LABEL_SHORTENED = "gate_label_shortened";

export interface PresentationOptions {
  /** Graph mode (derived from the graph when omitted). */
  graphMode?: boolean;
  /** Build-time aspect (defaults to the stage-enforced 4/3). */
  aspect?: number;
  /**
   * MUST-FIX 5 parity: mark edges shorter than r_s + r_t + headLen as
   * headSuppressed (the renderer suppresses their arrowheads). Default true.
   */
  suppressShortHeads?: boolean;
}

export interface PresentationResult {
  /** The assembled gate scene (design-2 §7.1). */
  scene: GateScene;
  /** checkScene over the assembled scene. */
  gate: GateResult;
  /**
   * Placement + gate-derived reasons, in pipeline order: ellipsis, anchor
   * fallbacks, edge-label skips/density, routing blocks, then gate codes
   * (gate_I{n}_violations per invariant with breaches) and `gate_unverified`
   * when any critical/major violation remains after the degrade steps.
   */
  reasons: string[];
  graphMode: boolean;
  nodeLabelPlans: NodeLabelPlan[];
  edgePlans: GraphEdgePlan[];
  edgeLabelPlans: Map<string, { id: string; text: string; pos: Vec3; halfW: number; halfH: number }>;
  /** Routed polylines keyed by edge id (the gate's edge pts, center-to-center). */
  routes: Map<string, Vec3[]>;
}

// ---------------------------------------------------------------------------
// GateScene assembly (renderer-faithful; see file header)
// ---------------------------------------------------------------------------

/** The renderer's legacy (non-graph) drawn edge types (renderer.ts EDGE_TYPES
 * mirror — kept here so the gate scene covers the same edges). */
const LEGACY_EDGE_TYPES = new Set(["flows_to", "transfers_to", "transforms_into"]);

/** Diagonal of the node position bounds (the renderer's orbit-distance
 * source, camera.ts frameCamera). */
function diagonalOf(graph: SceneGraph): number {
  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  const zs = graph.nodes.map((n) => n.position.z);
  return Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
  );
}

/** Shaft polyline exactly as updateEdge renders it (static scenes: graph
 * space == world space, so the midpoint shift is zero). */
function shaftPolyline(
  route: Vec3[],
  from: Vec3,
  to: Vec3,
  rFrom: number,
  rTo: number,
  headLen: number,
): Vec3[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return [{ ...from }, { ...to }];
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const pts: Vec3[] = [
    {
      x: from.x + ux * (rFrom + SHAFT_GAP),
      y: from.y + uy * (rFrom + SHAFT_GAP),
      z: from.z + uz * (rFrom + SHAFT_GAP),
    },
  ];
  for (let i = 1; i < route.length - 1; i++) pts.push({ ...route[i] });
  pts.push({
    x: to.x - ux * (rTo + headLen),
    y: to.y - uy * (rTo + headLen),
    z: to.z - uz * (rTo + headLen),
  });
  return pts;
}

function buildCamera(
  graph: SceneGraph,
  graphMode: boolean,
  aspect: number,
): CameraGeom {
  const content = contentAABBFromGraph(graph, { graphMode });
  const center = contentExtentCenter(content);
  const distance = Math.min(120, Math.max(4, diagonalOf(graph) * 2.2));
  if (graphMode) {
    const halfH = graphFrameHalfHeight(content, aspect).halfH;
    return {
      mode: "ortho",
      center,
      halfH,
      halfW: halfH * aspect,
      aspect,
      distance,
      fovDeg: DEFAULT_FOV_DEG,
      canonicalViews: canonicalViews({
        graphMode,
        center,
        azimuth: Math.atan2(0, 1),
        polar: Math.acos(0.55 / Math.hypot(0, 0.55, 1)),
        distance,
        halfH,
        aspect,
        content,
      }),
    };
  }
  const perspDistance = perspectiveDistance(content, DEFAULT_FOV_DEG, aspect);
  return {
    mode: "perspective",
    center,
    halfH: 0,
    halfW: 0,
    aspect,
    distance: perspDistance,
    fovDeg: DEFAULT_FOV_DEG,
    canonicalViews: canonicalViews({
      graphMode,
      center,
      azimuth: Math.atan2(1, 1.35),
      polar: Math.acos(0.65 / Math.hypot(1, 0.65, 1.35)),
      distance: perspDistance,
      halfH: 0,
      aspect,
      content,
    }),
  };
}

/** Graph edges for the gate scene: derived edges in graph mode, plus the
 * renderer's legacy drawn edges (flows_to / transfers_to / transforms_into)
 * with their new arrowheads (MUST-FIX 2) in non-graph mode. */
function gateEdges(
  graph: SceneGraph,
  graphMode: boolean,
  envelopes: GateScene["envelopes"],
  suppressShortHeads: boolean,
): {
  edges: EdgeGeom[];
  polylines: Array<{ id: string; pts: Vec3[] }>;
  plans: GraphEdgePlan[];
  reasons: string[];
  routes: Map<string, Vec3[]>;
} {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges: EdgeGeom[] = [];
  const polylines: Array<{ id: string; pts: Vec3[] }> = [];
  const plans: GraphEdgePlan[] = [];
  const reasons: string[] = [];
  const routes = new Map<string, Vec3[]>();

  interface EdgeInput {
    id: string;
    fromId: string;
    toId: string;
    from: Vec3;
    to: Vec3;
    label: string;
    inhibits: boolean;
  }
  const inputs: EdgeInput[] = [];
  if (graphMode) {
    for (const plan of deriveGraphEdges(graph)) {
      plans.push(plan);
      inputs.push({
        id: plan.id,
        fromId: plan.fromId,
        toId: plan.toId,
        from: plan.from,
        to: plan.to,
        label: plan.label,
        inhibits: plan.inhibits,
      });
    }
  } else {
    for (const rel of graph.relationships) {
      if (!LEGACY_EDGE_TYPES.has(rel.type)) continue;
      const from = byId.get(rel.from);
      const to = byId.get(rel.to);
      if (!from || !to) continue;
      inputs.push({
        id: rel.id,
        fromId: rel.from,
        toId: rel.to,
        from: from.position,
        to: to.position,
        label: rel.label ?? rel.type,
        inhibits: false,
      });
    }
  }

  for (const input of inputs) {
    const fromNode = byId.get(input.fromId);
    const toNode = byId.get(input.toId);
    if (!fromNode || !toNode) continue;
    const rFrom = fromNode.size * 0.5;
    const rTo = toNode.size * 0.5;
    const routeRes = routeEdgeWithReasons(
      input.from,
      input.to,
      { fromId: input.fromId, toId: input.toId },
      envelopes as unknown as Parameters<typeof routeEdgeWithReasons>[3],
    );
    if (routeRes.reasons.length > 0) reasons.push(...routeRes.reasons);
    const head = arrowHead(rTo);
    const pts = shaftPolyline(routeRes.pts, input.from, input.to, rFrom, rTo, head.len);
    polylines.push({ id: input.id, pts });
    routes.set(input.id, routeRes.pts);
    const L = Math.hypot(
      input.to.x - input.from.x,
      input.to.y - input.from.y,
      input.to.z - input.from.z,
    );
    const headSuppressed =
      suppressShortHeads && L < rFrom + rTo + head.len - 1e-6;
    if (headSuppressed) reasons.push(REASON_EDGE_HEAD_SUPPRESSED);
    edges.push({
      id: input.id,
      fromId: input.fromId,
      toId: input.toId,
      inhibits: input.inhibits,
      pts,
      headLen: head.len,
      targetRadius: rTo,
      ...(headSuppressed ? { headSuppressed: true } : {}),
    });
  }
  return { edges, polylines, plans, reasons, routes };
}

/** Node labels + edge labels as gate LabelGeoms (the renderer's placement
 * passes — planNodeLabels then placeSceneEdgeLabels). */
function gateLabels(
  graph: SceneGraph,
  graphMode: boolean,
  plans: GraphEdgePlan[],
  polylines: Array<{ id: string; pts: Vec3[] }>,
): {
  labels: LabelGeom[];
  nodeLabelPlans: NodeLabelPlan[];
  edgeLabelPlans: Map<
    string,
    { id: string; text: string; pos: Vec3; halfW: number; halfH: number }
  >;
  reasons: string[];
} {
  const reasons: string[] = [];
  const nodeLabelPlan = planNodeLabels(graph, graphMode ? { edgePlans: plans } : undefined);
  reasons.push(...nodeLabelPlan.reasons);

  const labelEnvelopes: LabelEnvelope[] = graph.nodes
    .filter((n) => n.kind !== "group")
    .map((n) => nodeLabelEnvelope(n));

  // Edge-label inputs: the edges the renderer actually draws (graph edges in
  // graph mode; legacy flow/transforms edges otherwise).
  const inputs: Array<{ id: string; text: string; from: Vec3; to: Vec3 }> = [];
  if (graphMode) {
    for (const plan of plans) {
      inputs.push({ id: plan.id, text: plan.label, from: plan.from, to: plan.to });
    }
  } else {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const rel of graph.relationships) {
      if (!LEGACY_EDGE_TYPES.has(rel.type)) continue;
      const from = byId.get(rel.from);
      const to = byId.get(rel.to);
      if (!from || !to) continue;
      inputs.push({
        id: rel.id,
        text: rel.label ?? rel.type,
        from: from.position,
        to: to.position,
      });
    }
  }
  const edgeLabelPlans = placeSceneEdgeLabels(
    inputs,
    labelEnvelopes,
    nodeLabelPlan.plans.map((p) => p.rect),
    polylines,
  );
  reasons.push(...edgeLabelPlans.reasons);

  const labels: LabelGeom[] = nodeLabelPlan.plans.map((plan) => ({
    id: `node-label-${plan.nodeId}`,
    kind: "node",
    rect: plan.rect,
    text: plan.text,
    truncated: plan.truncated,
  }));
  for (const plan of edgeLabelPlans.plans.values()) {
    labels.push({
      id: `edge-label-${plan.id}`,
      kind: "edge",
      rect: {
        cx: plan.pos.x,
        cy: plan.pos.y,
        cz: plan.pos.z,
        halfW: plan.halfW,
        halfH: plan.halfH,
        halfD: GLYPH_HALF_D,
      },
      text: plan.text,
      truncated: false,
    });
  }
  return { labels, nodeLabelPlans: nodeLabelPlan.plans, edgeLabelPlans: edgeLabelPlans.plans, reasons };
}

/** Violation-derived reasons (design-2 §7.2): one gate code per invariant
 * with any critical/major breach, then `gate_unverified` when any remains
 * after the degrade steps. */
function gateReasons(gate: GateResult): string[] {
  const reasons: string[] = [];
  const emitted = new Set<string>();
  let unverified = false;
  for (const v of gate.violations) {
    if (v.severity !== "critical" && v.severity !== "major") continue;
    const code = gateReasonForInvariant(v.invariant);
    if (code && !emitted.has(code)) {
      emitted.add(code);
      reasons.push(code);
    }
    unverified = true;
  }
  if (unverified) reasons.push(REASON_GATE_UNVERIFIED);
  return reasons;
}

// ---------------------------------------------------------------------------
// resolvePresentation
// ---------------------------------------------------------------------------

/**
 * The pure presentation aggregate (design-2 §0/§7.2). Assembles the GateScene
 * for the laid-out graph exactly as the renderer builds it, runs checkScene,
 * and returns the placement + gate reasons. READ-ONLY over `graph` (the I3
 * shorten degrade is `shortenGateLabels`, called by the renderer BEFORE this
 * on the graph it renders).
 */
export function resolvePresentation(
  graph: SceneGraph,
  opts?: PresentationOptions,
): PresentationResult {
  const graphMode = opts?.graphMode ?? isGraphLikeScene(graph);
  const aspect = opts?.aspect ?? FRAME_ASPECT_DEFAULT;
  const suppressShortHeads = opts?.suppressShortHeads ?? true;

  const reasons: string[] = [];
  const envelopes = nodeEnvelopes(graph) as unknown as GateScene["envelopes"];

  const edgeResult = gateEdges(graph, graphMode, envelopes, suppressShortHeads);
  reasons.push(...edgeResult.reasons);

  const labelResult = gateLabels(
    graph,
    graphMode,
    edgeResult.plans,
    edgeResult.polylines,
  );
  reasons.push(...labelResult.reasons);

  const camera = buildCamera(graph, graphMode, aspect);

  const declaredRelationships: GateScene["declaredRelationships"] =
    graph.relationships.map((r: SceneGraphRelationship) => ({
      id: r.id,
      from: r.from,
      to: r.to,
    }));

  const scene: GateScene = {
    envelopes,
    edges: edgeResult.edges,
    labels: labelResult.labels,
    camera,
    declaredRelationships,
  };
  const gate = checkScene(scene);
  reasons.push(...gateReasons(gate));

  return {
    scene,
    gate,
    reasons,
    graphMode,
    nodeLabelPlans: labelResult.nodeLabelPlans,
    edgePlans: edgeResult.plans,
    edgeLabelPlans: labelResult.edgeLabelPlans,
    routes: edgeResult.routes,
  };
}

// ---------------------------------------------------------------------------
// I3 degrade (renderer-side, MUST-FIX 1)
// ---------------------------------------------------------------------------

/**
 * Gate-aware I3 degrade: when the placement pass could not find a
 * collision-free anchor for a node label (the loud `label_anchor_fallback`
 * path), SHORTEN that label and re-place — a shorter glyph rect can resolve
 * an anchor the long text could not. Deterministic: labels are shortened in
 * violation order (node id order), by halving (floor 2 chars), and the
 * placement is re-run (bounded passes). Labels that STILL collide after the
 * bound keep rendering (never dropped — labels.test.ts pins that policy) and
 * the residual is reported by the gate (`gate_I3_violations` +
 * `gate_unverified`), never silent.
 *
 * Mutates the labels of the passed graph (the graph the renderer is about to
 * build); returns the reasons.
 */
export function shortenGateLabels(graph: SceneGraph, graphMode: boolean): string[] {
  const reasons: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const result = resolvePresentation(graph, { graphMode });
    const violated = new Set<string>();
    for (const v of result.gate.violations) {
      if (v.invariant !== "I3" || v.severity !== "major") continue;
      if (!v.id.startsWith("node-label-")) continue;
      violated.add(v.id.slice("node-label-".length));
    }
    if (violated.size === 0) break;
    let changed = false;
    for (const node of graph.nodes) {
      if (!violated.has(node.id)) continue;
      if (node.label === undefined || node.label.length <= 2) continue;
      node.label = node.label.slice(0, Math.max(2, Math.floor(node.label.length / 2)));
      changed = true;
    }
    if (!changed) break;
    reasons.push(REASON_GATE_LABEL_SHORTENED);
  }
  return reasons;
}

/** Convenience: the I3 node-label violations of a presentation (exported for
 * tests + the 2D surface). */
export function nodeLabelI3Violations(gate: GateResult): Violation[] {
  return gate.violations.filter(
    (v) => v.invariant === "I3" && v.severity === "major" && v.id.startsWith("node-label-"),
  );
}

/** The 2D surface's cheap gate surface: I1/I2/I3/I4 major counts over the
 * SAME pure presentation the 3D renderer gates (design-2 §7.2 "where cheap").
 * The 2D diagram consumes resolveLayout's repaired graph, so this is the
 * shared 3D-side verdict; the diagram's own spread handles the 2D projection
 * residuals on top. */
export function gateSummary(gate: GateResult): {
  i1: number;
  i2: number;
  i3: number;
  i4: number;
  i5: number;
  unverified: boolean;
} {
  let i1 = 0;
  let i2 = 0;
  let i3 = 0;
  let i4 = 0;
  let i5 = 0;
  for (const v of gate.violations) {
    if (v.severity !== "critical" && v.severity !== "major") continue;
    if (v.invariant === "I1") i1++;
    else if (v.invariant === "I2") i2++;
    else if (v.invariant === "I3") i3++;
    else if (v.invariant === "I4") i4++;
    else if (v.invariant === "I5") i5++;
  }
  return { i1, i2, i3, i4, i5, unverified: !gate.ok };
}
