/**
 * edges.ts presentation-planning tests (C3, Wave 3 — 3D Representation
 * Quality Program).
 *
 * Pure geometry tests (routing, shaft/head math, curves, label placement)
 * exercise the exported planning functions with plain data; the runtime
 * integration tests (buildGraphEdge / updateEdge / pushTrailPoint) use the
 * REAL three.js core (no WebGL is touched — jsdom only needs the math
 * classes), matching the "pure decision logic, no three mock for geometry"
 * rule of design-2.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { SceneGraph, SceneGraphNode } from "@/demonstrations/renderers/primitive-3d/types";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  arrowHead,
  CURVE_SAMPLES,
  GLYPH_HALF_H_EDGE,
  LABEL_ENV_CLEAR,
  ROUTE_CLEAR,
  ROUTE_MAX_WAYPOINTS,
  SHAFT_GAP,
  REASON_EDGE_DEGENERATE,
  REASON_EDGE_HEAD_SUPPRESSED,
  REASON_EDGE_LABEL_DENSE,
  REASON_EDGE_LABEL_SKIPPED,
  REASON_EDGE_UNROUTABLE,
} from "@/demonstrations/renderers/primitive-3d/presentation/constants";
import {
  buildFlowEdge,
  buildGraphEdge,
  buildLineGeometry,
  edgeHeadFor,
  nodeEnvelopes,
  placeSceneEdgeLabels,
  pushTrailPoint,
  routeEdge,
  routeEdgeWithReasons,
  shaftSpanPlan,
  updateEdge,
  type EdgeContext,
  type Envelope,
} from "@/demonstrations/renderers/primitive-3d/edges";
import type { RuntimeNode } from "@/demonstrations/renderers/primitive-3d/renderer";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function sphereEnv(id: string, x: number, y: number, radius: number): Envelope {
  return {
    id,
    kind: "node",
    shape: "sphere",
    center: { x, y, z: 0 },
    halfExtents: { x: radius, y: radius, z: radius },
    radius,
  };
}

/** Minimal runtime-node stand-in for edge build/update tests. */
function runtimeNode(
  id: string,
  position: { x: number; y: number; z: number },
  size: number
): RuntimeNode {
  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z);
  return {
    graph: {
      id,
      kind: "process_node",
      position,
      size,
      color: "#5b8def",
      children: [],
      trailPoints: 0,
      particleCount: 0,
      depth: 1,
    },
    group,
    state: null as unknown as RuntimeNode["state"],
    owned: [],
    children: [],
  } as unknown as RuntimeNode;
}

function edgeContext(graph: SceneGraph | null): EdgeContext {
  return {
    scene: new THREE.Scene(),
    graph,
    trackDisposable: () => {},
    edges: [],
    pickEdges: new Map(),
    reasons: [],
  };
}

function graphFromSpec(scene: NonNullable<DemoSpecV1["scene3d"]>): SceneGraph {
  return buildSceneGraph({
    schemaVersion: 1,
    id: "t",
    generationId: "g",
    userQuery: "t",
    normalizedConcept: "t",
    title: "T",
    learningObjective: "T",
    trust: {
      level: "conceptual_demonstration",
      label: "Conceptual",
      limitations: [],
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    scene3d: scene,
    controls: [],
    prediction: { prompt: "?", options: ["a", "b"] },
    observationPrompts: [],
    representations: [],
    adaptationContext: { allowed: false, oneVariableMode: true },
    provenance: {
      source: "template_composition",
      templateIds: [],
      generatedAt: "2026-08-08T00:00:00Z",
    },
    limits: {},
  } as unknown as DemoSpecV1).graph;
}

function node(
  id: string,
  kind: "process_node" | "sphere" | "box" | "energy_packet",
  position: { x: number; y: number; z: number },
  size = 1
): SceneGraphNode {
  return {
    id,
    kind,
    label: id,
    position,
    size,
    color: "#5b8def",
    children: [],
    trailPoints: 0,
    particleCount: 0,
    depth: 1,
  };
}

// ---------------------------------------------------------------------------
// 2.1 routeEdge
// ---------------------------------------------------------------------------

describe("routeEdge — bounded detours around non-endpoint envelopes (I2)", () => {
  it("returns the straight segment when nothing blocks", () => {
    const pts = routeEdge(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { fromId: "a", toId: "b" },
      []
    );
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(pts[1]).toEqual({ x: 10, y: 0, z: 0 });
  });

  it("routes around a node sitting ON the segment with clearance ≥ ROUTE_CLEAR", () => {
    const obstacle = sphereEnv("mid", 5, 0, 0.5);
    const pts = routeEdge(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { fromId: "a", toId: "b" },
      [obstacle]
    );
    expect(pts.length).toBeGreaterThanOrEqual(4); // from, 2 waypoints, to
    expect(pts.length - 2).toBeLessThanOrEqual(ROUTE_MAX_WAYPOINTS);
    // Every segment clears the obstacle envelope by ≥ ROUTE_INTERSECT_EPS.
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      // Point-to-segment distance of the obstacle center minus radius.
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abz = b.z - a.z;
      const len2 = abx * abx + aby * aby + abz * abz;
      const t = Math.min(
        1,
        Math.max(
          0,
          ((obstacle.center.x - a.x) * abx +
            (obstacle.center.y - a.y) * aby +
            (obstacle.center.z - a.z) * abz) /
            len2
        )
      );
      const dist = Math.hypot(
        a.x + abx * t - obstacle.center.x,
        a.y + aby * t - obstacle.center.y,
        a.z + abz * t - obstacle.center.z
      );
      expect(dist - obstacle.radius!).toBeGreaterThanOrEqual(0.02 - 1e-9);
    }
    // The detour actually leaves the straight line (waypoints off the x-axis;
    // the in-plane perpendicular of a horizontal edge is +y).
    expect(pts.some((p) => Math.abs(p.y) > 1e-6)).toBe(true);
  });

  it("keeps a minimum clearance of ROUTE_CLEAR from the obstacle surface", () => {
    const obstacle = sphereEnv("mid", 5, 0.3, 0.5);
    const pts = routeEdge(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { fromId: "a", toId: "b" },
      [obstacle]
    );
    // The waypoints sit beyond the envelope: |offset| ≥ r_E + ROUTE_CLEAR.
    let minSurfaceDist = Infinity;
    for (const p of pts) {
      const d = Math.hypot(p.x - 5, p.y - 0.3, p.z);
      minSurfaceDist = Math.min(minSurfaceDist, d - 0.5);
    }
    expect(minSurfaceDist).toBeGreaterThanOrEqual(ROUTE_CLEAR - 1e-9);
  });

  it("ignores envelopes of the edge's own endpoints", () => {
    const a = sphereEnv("a", 0, 0, 0.5);
    const b = sphereEnv("b", 10, 0, 0.5);
    const pts = routeEdge(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { fromId: "a", toId: "b" },
      [a, b]
    );
    expect(pts).toHaveLength(2); // no detour for endpoint envelopes
  });

  it("chains detours for multiple obstacles, capped at ROUTE_MAX_WAYPOINTS", () => {
    const obstacles = [
      sphereEnv("o1", 3, 0, 0.5),
      sphereEnv("o2", 7, 0, 0.5),
    ];
    const pts = routeEdge(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { fromId: "a", toId: "b" },
      obstacles
    );
    expect(pts.length - 2).toBeLessThanOrEqual(ROUTE_MAX_WAYPOINTS);
    // All cleared.
    for (const o of obstacles) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const abz = b.z - a.z;
        const len2 = abx * abx + aby * aby + abz * abz;
        const t = Math.min(
          1,
          Math.max(
            0,
            ((o.center.x - a.x) * abx + (o.center.y - a.y) * aby) / len2
          )
        );
        const dist = Math.hypot(
          a.x + abx * t - o.center.x,
          a.y + aby * t - o.center.y,
          a.z + abz * t - o.center.z
        );
        expect(dist - o.radius!).toBeGreaterThanOrEqual(0.02 - 1e-9);
      }
    }
  });

  it("reports edge_unroutable when the waypoint budget is exhausted", () => {
    // Three big spheres on one segment: each needs 2 waypoints → 6 > 4 cap.
    const obstacles = [
      sphereEnv("o1", 2.5, 0, 0.9),
      sphereEnv("o2", 5, 0, 0.9),
      sphereEnv("o3", 7.5, 0, 0.9),
    ];
    const res = routeEdgeWithReasons(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { fromId: "a", toId: "b" },
      obstacles
    );
    expect(res.blocked).toBe(true);
    expect(res.reasons).toContain(REASON_EDGE_UNROUTABLE);
  });

  it("is deterministic: the same input yields the same polyline", () => {
    const obstacles = [sphereEnv("o1", 3, 0, 0.5), sphereEnv("o2", 7, 0.2, 0.6)];
    const a = routeEdge({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { fromId: "a", toId: "b" }, obstacles);
    const b = routeEdge({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { fromId: "a", toId: "b" }, obstacles);
    expect(a).toEqual(b);
  });

  it("nodeEnvelopes excludes transient carriers and decorative objects", () => {
    const graph: SceneGraph = {
      nodes: [
        node("n1", "process_node", { x: 0, y: 0, z: 0 }),
        node("box1", "box", { x: 2, y: 0, z: 0 }),
        node("ep1", "energy_packet", { x: 1, y: 0, z: 0 }, 0.3),
        { ...node("lab1", "sphere", { x: 3, y: 0, z: 0 }), kind: "label" as const },
      ],
      relationships: [],
      animations: [],
      background: "dark",
      limits: {
        maxObjects: 80,
        particleLimit: 1500,
        maxTrailPoints: 300,
        maxLabels: 25,
        maxRelationships: 100,
        maxGroupDepth: 4,
      },
    };
    const envs = nodeEnvelopes(graph);
    const kinds = new Map(envs.map((e) => [e.id, e.kind]));
    expect(kinds.get("n1")).toBe("node");
    expect(kinds.get("box1")).toBe("node");
    expect(kinds.get("ep1")).toBe("particle"); // never a routing obstacle
    expect(kinds.has("lab1")).toBe(false);
    // A packet on a segment does not force a detour.
    const pts = routeEdge(
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { fromId: "n1", toId: "box1" },
      envs
    );
    expect(pts).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 2.3 Arrowhead + shaft math (I4, F-08)
// ---------------------------------------------------------------------------

describe("arrowhead + shaft span (I4 / F-08)", () => {
  it("arrowHead: size-1 pair matches today's cone exactly", () => {
    const h = arrowHead(0.5);
    expect(h.len).toBeCloseTo(0.36, 5);
    expect(h.radius).toBeCloseTo(0.15, 5);
  });

  it("arrowHead: len = clamp(0.72·r, 0.18, 0.5) across sizes", () => {
    expect(arrowHead(0.09).len).toBeCloseTo(0.18, 5); // floor
    expect(arrowHead(0.3).len).toBeCloseTo(0.216, 5);
    expect(arrowHead(1).len).toBeCloseTo(0.5, 5); // cap
    expect(arrowHead(2.5).len).toBeCloseTo(0.5, 5); // cap (size-5 target)
  });

  it("cone center sits at r_t + len/2 (apex flush on the target surface)", () => {
    const plan = edgeHeadFor(0.5);
    expect(plan.inset).toBeCloseTo(0.5 + 0.36 / 2, 5);
  });

  it("shaft span: start at r_s + SHAFT_GAP, end at the head base r_t + len", () => {
    const span = shaftSpanPlan(
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      0.5,
      0.5
    )!;
    expect(span.start.x).toBeCloseTo(0.5 + SHAFT_GAP, 5);
    expect(span.start.y).toBeCloseTo(0, 5);
    expect(span.end.x).toBeCloseTo(3 - (0.5 + 0.36), 5); // head base, F-08
  });

  it("shaft span is null for zero-length edges", () => {
    expect(
      shaftSpanPlan({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0.5, 0.5)
    ).toBeNull();
  });

  it("updateEdge writes the surface-to-surface shaft and flush head", () => {
    const graph = graphFromSpec({
      objects: [
        { id: "a", kind: "process_node", position: { x: 0, y: 0, z: 0 }, size: 1 },
        { id: "b", kind: "process_node", position: { x: 3, y: 0, z: 0 }, size: 1 },
      ],
      relationships: [{ id: "r1", type: "flows_to", from: "a", to: "b" }],
      animations: [],
    });
    const ctx = edgeContext(graph);
    buildGraphEdge(
      ctx,
      runtimeNode("a", { x: 0, y: 0, z: 0 }, 1),
      runtimeNode("b", { x: 3, y: 0, z: 0 }, 1),
      {
        id: "r1",
        type: "flows_to",
        label: "flows_to",
        fromId: "a",
        toId: "b",
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 0, z: 0 },
        inhibits: false,
      }
    );
    const edge = ctx.edges[0];
    updateEdge(edge);
    const attr = edge.shaft.attribute;
    // Shaft: from surface (0.52) to head base (2.14).
    expect(attr.array[0]).toBeCloseTo(0.5 + SHAFT_GAP, 5);
    expect(attr.array[3]).toBeCloseTo(3 - (0.5 + 0.36), 5);
    // Head: cone center at r_t + len/2 → apex on the surface at 2.5.
    const pos = edge.head!.mesh.position;
    expect(pos.x).toBeCloseTo(3 - (0.5 + 0.18), 5);
    // Size-1 target → cone scale 1 (identical to today's cone).
    expect(edge.head!.mesh.scale.x).toBeCloseTo(1, 5);
  });

  it("zero-length edges draw nothing and emit REASON_EDGE_DEGENERATE", () => {
    const graph = graphFromSpec({
      objects: [
        { id: "a", kind: "process_node", position: { x: 0, y: 0, z: 0 }, size: 1 },
      ],
      relationships: [{ id: "r1", type: "flows_to", from: "a", to: "a" }],
      animations: [],
    });
    const ctx = edgeContext(graph);
    const from = runtimeNode("a", { x: 0, y: 0, z: 0 }, 1);
    buildGraphEdge(ctx, from, from, {
      id: "r1",
      type: "flows_to",
      label: "flows_to",
      fromId: "a",
      toId: "a",
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 0 },
      inhibits: false,
    });
    expect(ctx.reasons).toContain(REASON_EDGE_DEGENERATE);
    const edge = ctx.edges[0];
    updateEdge(edge);
    expect(edge.shaft.geometry.drawRange.count).toBe(0);
    expect(edge.head!.mesh.visible).toBe(false);
  });

  it("legacy flow edges share the surface-to-surface trim (F-08)", () => {
    const graph = graphFromSpec({
      objects: [
        { id: "b1", kind: "box", position: { x: -2.5, y: 0, z: 0 }, size: 1 },
        { id: "b2", kind: "box", position: { x: 2.5, y: 0, z: 0 }, size: 1 },
      ],
      relationships: [{ id: "r1", type: "transfers_to", from: "b1", to: "b2" }],
      animations: [],
    });
    const ctx = edgeContext(graph);
    buildFlowEdge(
      ctx,
      runtimeNode("b1", { x: -2.5, y: 0, z: 0 }, 1),
      runtimeNode("b2", { x: 2.5, y: 0, z: 0 }, 1),
      graph.relationships[0]
    );
    const edge = ctx.edges[0];
    updateEdge(edge);
    expect(edge.shaft.attribute.array[0]).toBeCloseTo(-2.5 + 0.52, 5);
    expect(edge.shaft.attribute.array[3]).toBeCloseTo(2.5 - 0.86, 5);
  });

  it("transforms_into renders a legacy 3D edge with a real arrowhead (MUST-FIX 2, tpl-before-after-01)", () => {
    // before_after's b1→b2: non-graph (groups + boxes), so the edge goes
    // through the legacy path — which previously drew only flows_to /
    // transfers_to, leaving transforms_into invisible in 3D while the 2D
    // surface drew it. Now it renders with the same arrowhead semantics as
    // flows_to (parity with the 2D surface, which draws every relationship).
    const graph = graphFromSpec({
      objects: [
        { id: "b1", kind: "box", position: { x: -2.5, y: 0, z: 0 }, size: 1 },
        { id: "b2", kind: "box", position: { x: 2.5, y: 0, z: 0 }, size: 1 },
      ],
      relationships: [
        { id: "r1", type: "transforms_into", from: "b1", to: "b2", label: "transforms into" },
      ],
      animations: [],
    });
    const ctx = edgeContext(graph);
    buildFlowEdge(
      ctx,
      runtimeNode("b1", { x: -2.5, y: 0, z: 0 }, 1),
      runtimeNode("b2", { x: 2.5, y: 0, z: 0 }, 1),
      graph.relationships[0]
    );
    expect(ctx.edges).toHaveLength(1);
    expect(ctx.reasons).not.toContain(REASON_EDGE_HEAD_SUPPRESSED); // 5u edge
    const edge = ctx.edges[0];
    updateEdge(edge);
    // Arrowhead present and oriented like flows_to (head base at r_t + len).
    expect(edge.head).not.toBeNull();
    expect(edge.head!.mesh.position.x).toBeCloseTo(2.5 - (0.5 + 0.18), 5);
    // Shaft surface-to-surface (r_s + SHAFT_GAP → r_t + len base).
    expect(edge.shaft.attribute.array[0]).toBeCloseTo(-2.5 + 0.52, 5);
    expect(edge.shaft.attribute.array[3]).toBeCloseTo(2.5 - 0.86, 5);
  });

  it("short edges suppress the arrowhead with a loud reason (MUST-FIX 5, red-team W7)", () => {
    // L = 1.0 < r_s + r_t + headLen = 0.5 + 0.5 + 0.36 → the head would embed
    // the source. The renderer degrades by simplification: no arrowhead,
    // REASON_EDGE_HEAD_SUPPRESSED fires once at build. The bare surfaces need
    // r_s + r_t + 2·SHAFT_GAP = 1.04, so at L = 1.0 nothing is drawn at all —
    // never an inverted stub; at L = 1.1 the shaft spans surface-to-surface.
    const graph = graphFromSpec({
      objects: [
        { id: "a", kind: "process_node", position: { x: 0, y: 0, z: 0 }, size: 1 },
        { id: "b", kind: "process_node", position: { x: 1, y: 0, z: 0 }, size: 1 },
      ],
      relationships: [{ id: "r1", type: "causes", from: "a", to: "b" }],
      animations: [],
    });
    const ctx = edgeContext(graph);
    buildGraphEdge(
      ctx,
      runtimeNode("a", { x: 0, y: 0, z: 0 }, 1),
      runtimeNode("b", { x: 1, y: 0, z: 0 }, 1),
      {
        id: "r1",
        type: "causes",
        label: "causes",
        fromId: "a",
        toId: "b",
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1, y: 0, z: 0 },
        inhibits: false,
      }
    );
    expect(ctx.reasons).toContain(REASON_EDGE_HEAD_SUPPRESSED);
    const edge = ctx.edges[0];
    expect(edge.headSuppressed).toBe(true);
    expect(edge.head).toBeNull(); // degraded away — never a head inside a body
    updateEdge(edge);
    // 1.0 < 1.04: even the bare surfaces cannot span the gap → draw nothing.
    expect(edge.shaft.geometry.drawRange.count).toBe(0);
    expect(edge.shaft.line.visible).toBe(false);

    // L = 1.1 (just above the 1.04 floor): the shaft runs surface-to-surface
    // (SHAFT_GAP at both ends), still no head.
    const ctx2 = edgeContext(graph);
    buildGraphEdge(
      ctx2,
      runtimeNode("a", { x: 0, y: 0, z: 0 }, 1),
      runtimeNode("b", { x: 1.1, y: 0, z: 0 }, 1),
      {
        id: "r1",
        type: "causes",
        label: "causes",
        fromId: "a",
        toId: "b",
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1.1, y: 0, z: 0 },
        inhibits: false,
      }
    );
    expect(ctx2.reasons).toContain(REASON_EDGE_HEAD_SUPPRESSED);
    const edge2 = ctx2.edges[0];
    updateEdge(edge2);
    expect(edge2.shaft.attribute.array[0]).toBeCloseTo(0.5 + SHAFT_GAP, 5);
    expect(edge2.shaft.attribute.array[3]).toBeCloseTo(1.1 - (0.5 + SHAFT_GAP), 5);
    expect(edge2.shaft.line.visible).toBe(true);
  });

  it("short LEGACY flow edges suppress the arrowhead too (MUST-FIX 5, non-graph scenes)", () => {
    // buildFlowEdge (before_after / box scenes) got the same short-edge
    // degrade as derived graph edges: L = 0.9 < r_s + r_t + headLen = 1.36
    // → no head mesh, REASON_EDGE_HEAD_SUPPRESSED fires once at build.
    const graph = graphFromSpec({
      objects: [
        { id: "a", kind: "box", position: { x: 0, y: 0, z: 0 }, size: 1 },
        { id: "b", kind: "box", position: { x: 0.9, y: 0, z: 0 }, size: 1 },
      ],
      relationships: [
        { id: "r1", type: "flows_to", from: "a", to: "b", label: "transforms into" },
      ],
      animations: [],
    });
    const ctx = edgeContext(graph);
    buildFlowEdge(
      ctx,
      runtimeNode("a", { x: 0, y: 0, z: 0 }, 1),
      runtimeNode("b", { x: 0.9, y: 0, z: 0 }, 1),
      graph.relationships[0]
    );
    expect(ctx.reasons).toContain(REASON_EDGE_HEAD_SUPPRESSED);
    const edge = ctx.edges[0];
    expect(edge.headSuppressed).toBe(true);
    expect(edge.head).toBeNull(); // never a head inside a body
    // L = 0.9 < the 1.04 bare-surface floor → nothing is drawn.
    updateEdge(edge);
    expect(edge.shaft.geometry.drawRange.count).toBe(0);
    expect(edge.shaft.line.visible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2.2 buildLineGeometry (F-07)
// ---------------------------------------------------------------------------

describe("buildLineGeometry — endpoint-oriented connectors (F-07)", () => {
  it("straight: exactly the two endpoints", () => {
    const pts = buildLineGeometry({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, false);
    expect(pts).toHaveLength(6);
    expect(Array.from(pts)).toEqual([0, 0, 0, 2, 0, 0]);
  });

  it("curved: CURVE_SAMPLES samples, endpoints exact, mid bows perpendicular", () => {
    const pts = buildLineGeometry({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, true);
    expect(pts.length / 3).toBe(CURVE_SAMPLES);
    const first = Array.from(pts.slice(0, 3));
    const last = Array.from(pts.slice(-3));
    expect(first).toEqual([0, 0, 0]);
    expect(last).toEqual([4, 0, 0]);
    // Mid-sample (i = CURVE_SAMPLES/2 → t = 8/15) bows in y (the in-plane
    // perpendicular of a horizontal edge); its x follows the Bezier chord.
    const midIdx = Math.floor(CURVE_SAMPLES / 2);
    const tMid = midIdx / (CURVE_SAMPLES - 1);
    const mid = Array.from(pts.slice(midIdx * 3, midIdx * 3 + 3));
    expect(mid[0]).toBeCloseTo(2 * (1 - tMid) * tMid * 2 + tMid * tMid * 4, 4);
    expect(Math.abs(mid[1])).toBeGreaterThan(0.1);
    expect(mid[2]).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// 1.4 Edge-label placement (F-04 / F-21)
// ---------------------------------------------------------------------------

describe("placeSceneEdgeLabels — candidates, collisions, skip reasons", () => {
  it("vertical edge labels clear endpoint spheres on horizontal edges (F-04)", () => {
    // cause_effect_network r1 repro: a(−3,1) → b(0,1), size 1 — the label
    // lands OFF the shaft at (±0.30) and clears both endpoint envelopes.
    const envs = [
      { id: "a", center: { x: -3, y: 1, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: "b", center: { x: 0, y: 1, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    ];
    const { plans, reasons } = placeSceneEdgeLabels(
      [
        {
          id: "r1",
          text: "activates",
          from: { x: -3, y: 1, z: 0 },
          to: { x: 0, y: 1, z: 0 },
        },
      ],
      envs,
      [],
      [{ id: "r1", pts: [{ x: -3, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }] }]
    );
    const plan = plans.get("r1");
    expect(plan).toBeDefined();
    // First candidate wins: t = 0.5, d = +1 → 0.30 above the shaft midpoint.
    expect(plan!.pos.x).toBeCloseTo(-1.5, 5);
    expect(plan!.pos.y).toBeCloseTo(1 + GLYPH_HALF_H_EDGE + 0.22, 5);
    expect(reasons).toEqual([]);
    // The rect clears both endpoint envelopes (inflated by LABEL_ENV_CLEAR).
    for (const env of envs) {
      const clearX =
        Math.abs(plan!.pos.x - env.center.x) >= plan!.halfW + env.halfExtents.x + LABEL_ENV_CLEAR;
      const clearY =
        Math.abs(plan!.pos.y - env.center.y) >= plan!.halfH + env.halfExtents.y + LABEL_ENV_CLEAR;
      expect(clearX || clearY).toBe(true);
    }
  });

  it("skips labels that cannot clear their own shaft (vertical r2 'activates')", () => {
    // cause_effect_network r2 (b→c) is VERTICAL: every candidate's rect
    // (halfW 0.39 > offset 0.30) straddles the shaft, so the own-polyline
    // check (design §1.4c) rejects all ten candidates — the honest outcome is
    // a skip with a reason, never a label drawn over node B (F-04/I3).
    const envs = [
      { id: "b", center: { x: 0, y: 1, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: "c", center: { x: 0, y: -1, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    ];
    const { plans, reasons } = placeSceneEdgeLabels(
      [
        {
          id: "r2",
          text: "activates",
          from: { x: 0, y: 1, z: 0 },
          to: { x: 0, y: -1, z: 0 },
        },
      ],
      envs,
      [
        {
          cx: 0,
          cy: 0.3,
          cz: 0,
          halfW: 0.5,
          halfH: 0.146,
          halfD: 0.001,
        }, // "Effect C" node label
      ],
      [{ id: "r2", pts: [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }] }]
    );
    expect(plans.size).toBe(0);
    expect(reasons).toEqual([REASON_EDGE_LABEL_SKIPPED]);
  });

  it("falls back across the ± sides and along-edge fractions deterministically", () => {
    // An envelope ABOVE the midpoint blocks the d=+1 candidate; the d=−1
    // side wins at the same t.
    const envs = [
      { id: "a", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: "b", center: { x: 3, y: 0, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: "block", center: { x: 1.5, y: 0.6, z: 0 }, halfExtents: { x: 0.35, y: 0.35, z: 0.35 } },
    ];
    const { plans } = placeSceneEdgeLabels(
      [
        { id: "r1", text: "flows_to", from: { x: 0, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 } },
      ],
      envs,
      [],
      [{ id: "r1", pts: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }] }]
    );
    const plan = plans.get("r1")!;
    expect(plan.pos.x).toBeCloseTo(1.5, 5); // t = 0.5
    expect(plan.pos.y).toBeCloseTo(-(GLYPH_HALF_H_EDGE + 0.22), 5); // d = −1
  });

  it("skips with a reason when every candidate collides (short edge)", () => {
    const envs = [
      { id: "a", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: "b", center: { x: 0.6, y: 0, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    ];
    const { plans, reasons } = placeSceneEdgeLabels(
      [
        { id: "r1", text: "flows_to", from: { x: 0, y: 0, z: 0 }, to: { x: 0.6, y: 0, z: 0 } },
      ],
      envs,
      [],
      [{ id: "r1", pts: [{ x: 0, y: 0, z: 0 }, { x: 0.6, y: 0, z: 0 }] }]
    );
    expect(plans.size).toBe(0);
    expect(reasons).toEqual([REASON_EDGE_LABEL_SKIPPED]);
  });

  it("emits REASON_EDGE_LABEL_DENSE once when ≥ 5 labels are skipped", () => {
    const envs = [
      { id: "a", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: "b", center: { x: 0.6, y: 0, z: 0 }, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    ];
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      text: "flows_to",
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0.6, y: 0, z: 0 },
    }));
    const { plans, reasons } = placeSceneEdgeLabels(inputs, envs, [], []);
    expect(plans.size).toBe(0);
    expect(reasons.filter((r) => r === REASON_EDGE_LABEL_SKIPPED)).toHaveLength(5);
    expect(reasons.filter((r) => r === REASON_EDGE_LABEL_DENSE)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4 Trail world-space behavior (F-18)
// ---------------------------------------------------------------------------

describe("pushTrailPoint — world-space trail", () => {
  it("recorded points stay at their world positions when the body moves", () => {
    const capacity = 4;
    const buffer = new Float32Array(capacity * 3);
    const geo = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(buffer, 3);
    geo.setAttribute("position", attribute);
    const group = new THREE.Group();
    const rn = {
      graph: {
        id: "p",
        kind: "sphere",
        position: { x: 0, y: 0, z: 0 },
        size: 1,
        color: "#fff",
        children: [],
        trailPoints: capacity,
        particleCount: 0,
        depth: 1,
      },
      group,
      state: null as unknown as RuntimeNode["state"],
      owned: [],
      children: [],
      trail: {
        capacity,
        buffer,
        geometry: geo,
        attribute,
        line: new THREE.Line(geo, new THREE.LineBasicMaterial()),
        written: 0,
        last: null,
      },
    } as unknown as RuntimeNode;

    group.position.set(0, 0, 0);
    pushTrailPoint(rn);
    group.position.set(5, 0, 0); // body moves away
    pushTrailPoint(rn);

    // The first recorded point stays at (0,0,0) — it is a WORLD position, not
    // a holder-local offset (pre-fix it would have been displaced to (5,0,0)).
    expect(Array.from(buffer.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(buffer.slice(3, 6))).toEqual([5, 0, 0]);
  });

  it("ring-buffer wrap keeps capacity", () => {
    const capacity = 3;
    const buffer = new Float32Array(capacity * 3);
    const geo = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(buffer, 3);
    geo.setAttribute("position", attribute);
    const group = new THREE.Group();
    const rn = {
      graph: {
        id: "p",
        kind: "sphere",
        position: { x: 0, y: 0, z: 0 },
        size: 1,
        color: "#fff",
        children: [],
        trailPoints: capacity,
        particleCount: 0,
        depth: 1,
      },
      group,
      state: null as unknown as RuntimeNode["state"],
      owned: [],
      children: [],
      trail: {
        capacity,
        buffer,
        geometry: geo,
        attribute,
        line: new THREE.Line(geo, new THREE.LineBasicMaterial()),
        written: 0,
        last: null,
      },
    } as unknown as RuntimeNode;

    for (let i = 0; i < 5; i++) {
      group.position.set(i, 0, 0);
      pushTrailPoint(rn);
    }
    expect(rn.trail!.written).toBe(capacity);
    expect(Array.from(buffer.slice(-3))).toEqual([4, 0, 0]);
  });
});
