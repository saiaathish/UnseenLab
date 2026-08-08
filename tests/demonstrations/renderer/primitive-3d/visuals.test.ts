/**
 * visuals.ts tests (C3, Wave 3 — 3D Representation Quality Program).
 *
 * Uses the REAL three.js core (no WebGL touched): buildVisual / updateKind are
 * exercised with plain scenes, and the vector-field auto-fit, trail scene
 * parenting and endpoint-oriented line/process_edge geometry are asserted.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { SceneGraph, SceneGraphNode } from "@/demonstrations/renderers/primitive-3d/types";
import type { RuntimeNode } from "@/demonstrations/renderers/primitive-3d/renderer";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";
import type { EngineVisualState } from "@/demonstrations/renderers/lumina-2d/types";
import { buildVisual, updateKind, type VisualContext } from "@/demonstrations/renderers/primitive-3d/visuals";
import { makeNodeState } from "@/demonstrations/renderers/primitive-3d/operators";
import { REASON_FIELD_AUTO_FIT, REASON_LINE_NO_ENDPOINTS, CURVE_SAMPLES } from "@/demonstrations/renderers/primitive-3d/presentation/constants";

function node(
  id: string,
  kind: SceneGraphNode["kind"],
  position: { x: number; y: number; z: number },
  size = 1
): SceneGraphNode {
  return {
    id,
    kind,
    label: undefined,
    position,
    size,
    color: "#5b8def",
    children: [],
    trailPoints: 0,
    particleCount: 0,
    depth: 1,
  };
}

function makeContext(graph: SceneGraph, overrides: Partial<VisualContext> = {}): VisualContext {
  return {
    scene: new THREE.Scene(),
    graph,
    time: 0,
    graphMode: true,
    animationsByTarget: new Map(),
    engineMapping: null,
    engineState: null,
    engineFieldMaxMag: 0,
    trackDisposable: () => {},
    cloneMaterials: () => {},
    reasons: [],
    ...overrides,
  };
}

function makeRuntime(
  graph: SceneGraph,
  id: string
): { rn: RuntimeNode; holder: THREE.Group } {
  const holder = new THREE.Group();
  const gnode = graph.nodes.find((n) => n.id === id)!;
  const rn: RuntimeNode = {
    graph: gnode,
    group: holder,
    state: makeNodeState({ position: gnode.position, color: gnode.color }),
    owned: [],
    children: [],
  };
  return { rn, holder };
}

const LIMITS: SceneGraph["limits"] = {
  maxObjects: 80,
  particleLimit: 1500,
  maxTrailPoints: 300,
  maxLabels: 25,
  maxRelationships: 100,
  maxGroupDepth: 4,
};

describe("vector_field auto-fit (F-15a)", () => {
  it("extends the field span to the anchor surfaces (field_relationship: 3 → 3.7)", () => {
    const graph: SceneGraph = {
      nodes: [
        node("s1", "sphere", { x: -2, y: 0, z: 0 }, 0.6),
        node("s2", "sphere", { x: 2, y: 0, z: 0 }, 0.6),
        node("vf1", "vector_field", { x: 0, y: 0, z: 0 }, 3),
      ],
      relationships: [],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "vf1");
    buildVisual(ctx, rn, rn.graph, holder);
    // halfSpan 1.85 → span 3.7 (2 − 0.3 + 0.15 = 1.85).
    expect(rn.vectorTicks!.span).toBeCloseTo(3.7, 5);
    expect(rn.vectorTicks!.len).toBeCloseTo(3.7 * 0.22, 5);
    // Tick origins reach ±1.85 so arrows start/end at the charge surfaces.
    const origins = rn.vectorTicks!.origins;
    const maxX = Math.max(...Array.from(origins).filter((_, i) => i % 3 === 0));
    expect(maxX).toBeCloseTo(1.85, 5);
    expect(ctx.reasons).toContain(REASON_FIELD_AUTO_FIT);
  });

  it("leaves the span unchanged when no anchors are near", () => {
    const graph: SceneGraph = {
      nodes: [node("vf1", "vector_field", { x: 0, y: 0, z: 0 }, 3)],
      relationships: [],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "vf1");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.vectorTicks!.span).toBeCloseTo(3, 5);
    expect(ctx.reasons).not.toContain(REASON_FIELD_AUTO_FIT);
  });

  it("non-graph mode anchors only on relationship endpoints touching the field", () => {
    const graph: SceneGraph = {
      nodes: [
        node("vf1", "vector_field", { x: 0, y: 0, z: 0 }, 2),
        // Connected sphere (gap 0.3 ≤ FIELD_AUTO_FIT_GAP) → anchors.
        node("far", "sphere", { x: 1.8, y: 0, z: 0 }, 1),
        // Unconnected sphere at the same distance → NOT an anchor in
        // non-graph mode.
        node("near", "sphere", { x: 1.7, y: 0, z: 0 }, 1),
      ],
      relationships: [
        { id: "r1", type: "attracts", from: "far", to: "vf1" },
      ],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    // Non-graph context: only relationship endpoints touching vf1 anchor.
    const ctx = makeContext(graph, { graphMode: false });
    const { rn, holder } = makeRuntime(graph, "vf1");
    buildVisual(ctx, rn, rn.graph, holder);
    // r1 touches vf1 → "far" is the only anchor: halfSpan = 1.8 − 0.5 + 0.15
    // = 1.45 → span 2.9. "near" (unconnected) never extends the field.
    expect(rn.vectorTicks!.span).toBeCloseTo(2.9, 5);
  });

  it("keeps the @field engine sentinel path working after auto-fit", () => {
    const graph: SceneGraph = {
      nodes: [
        node("q1", "sphere", { x: -3, y: 0, z: 0 }, 1),
        node("q2", "sphere", { x: 3, y: 0, z: 0 }, 1),
        node("fv", "vector_field", { x: 0, y: 0, z: 0 }, 9),
      ],
      relationships: [],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    const mapping: EngineMapping = {
      fv: { body: "@field", scale: 3 / 70, offsetX: 0, offsetY: 0 },
    };
    const engineState = {
      field: {
        width: 4,
        height: 4,
        span: 70,
        vectors: [
          { x: 0, y: 0, ex: 1, ey: 0, magnitude: 1 },
          { x: 0, y: 0, ex: 0, ey: 1, magnitude: 1 },
          { x: 0, y: 0, ex: -1, ey: 0, magnitude: 1 },
          { x: 0, y: 0, ex: 0, ey: -1, magnitude: 1 },
          { x: 0, y: 0, ex: 1, ey: 0, magnitude: 1 },
          { x: 0, y: 0, ex: 0, ey: 1, magnitude: 1 },
          { x: 0, y: 0, ex: -1, ey: 0, magnitude: 1 },
          { x: 0, y: 0, ex: 0, ey: -1, magnitude: 1 },
          { x: 0, y: 0, ex: 1, ey: 0, magnitude: 1 },
          { x: 0, y: 0, ex: 0, ey: 1, magnitude: 1 },
          { x: 0, y: 0, ex: -1, ey: 0, magnitude: 1 },
          { x: 0, y: 0, ex: 0, ey: -1, magnitude: 1 },
          { x: 0, y: 0, ex: 1, ey: 0, magnitude: 1 },
          { x: 0, y: 0, ex: 0, ey: 1, magnitude: 1 },
          { x: 0, y: 0, ex: -1, ey: 0, magnitude: 1 },
          { x: 0, y: 0, ex: 0, ey: -1, magnitude: 1 },
        ],
      },
    } as unknown as EngineVisualState;
    const ctx = makeContext(graph, {
      engineMapping: mapping,
      engineState,
      engineFieldMaxMag: 1,
    });
    const { rn, holder } = makeRuntime(graph, "fv");
    buildVisual(ctx, rn, rn.graph, holder);
    // Auto-fit must NOT extend the showcase field (charges r 0.5 at ±3 with
    // span 9: gap = 3 − 0.5 − 4.5 < 0 → but reach 2.65 < half 4.5, so the
    // span stays 9).
    expect(rn.vectorTicks!.span).toBeCloseTo(9, 5);
    // The engine sentinel drives the ticks: the tick at the field center
    // samples (ex=1, ey=0) → its end point points +x (world), and the
    // needsUpdate setter bumps the attribute version (three r185 has no
    // needsUpdate getter).
    const attr = rn.vectorTicks!.attribute;
    expect(attr.array.length).toBe(16 * 6 * 3); // 4×4 grid × 6 pts (shaft+barbs) × 3
    const versionBefore = attr.version;
    updateKind(ctx, rn, 0.016);
    expect(attr.version).toBe(versionBefore + 1);
    // tick-0 (world corner, samples ex=1) end x follows the sampled direction
    // (start x = array[0]); the arrowhead barbs sit perpendicular (±z for a
    // +x direction) at TICK_TIP_RATIO of the tick length (F-17).
    const tipLen = rn.vectorTicks!.len * 0.3;
    expect(attr.array[3]).toBeGreaterThan(attr.array[0]);
    expect(attr.array[11]).toBeCloseTo(attr.array[5] + tipLen, 5);
    expect(attr.array[17]).toBeCloseTo(attr.array[5] - tipLen, 5);
  });
});

describe("vector tick arrowhead tips (F-17)", () => {
  it("operator-driven ticks render shaft + perpendicular barbs at TICK_TIP_RATIO", () => {
    const graph: SceneGraph = {
      nodes: [node("vf1", "vector_field", { x: 0, y: 0, z: 0 }, 3)],
      relationships: [],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    const ctx = makeContext(graph); // no engine → operator path
    const { rn, holder } = makeRuntime(graph, "vf1");
    buildVisual(ctx, rn, rn.graph, holder);
    const vt = rn.vectorTicks!;
    expect(vt.span).toBeCloseTo(3, 5); // no anchors → unchanged
    expect(vt.attribute.array.length).toBe(16 * 6 * 3);
    updateKind(ctx, rn, 0.016);
    // Tick 0 sits at origin (−1.5, 0, −1.5) with the default base vector
    // (0,1,0): shaft base→tip along +y, barbs along ±x at 0.3·len.
    const len = vt.len;
    const tipLen = len * 0.3;
    const a = vt.attribute.array;
    expect(a[0]).toBeCloseTo(-1.5, 5); // base
    expect(a[3]).toBeCloseTo(-1.5, 5); // tip x
    expect(a[4]).toBeCloseTo(len, 5); // tip y
    expect(a[5]).toBeCloseTo(-1.5, 5); // tip z
    expect(a[9]).toBeCloseTo(-1.5 + tipLen, 5); // barb L (perp +x)
    expect(a[10]).toBeCloseTo(len, 5);
    expect(a[15]).toBeCloseTo(-1.5 - tipLen, 5); // barb R (perp −x)
    expect(a[16]).toBeCloseTo(len, 5);
  });

  it("barbs follow the animated vector direction (rotated about x)", () => {
    const graph: SceneGraph = {
      nodes: [node("vf1", "vector_field", { x: 0, y: 0, z: 0 }, 3)],
      relationships: [],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "vf1");
    buildVisual(ctx, rn, rn.graph, holder);
    // Rotate the base vector (0,1,0) about x by 90° → (0,0,1): the tick now
    // points +z, so the in-plane perpendicular is (−1,0,0) (barbs along ±x).
    rn.state.vector = { x: 0, y: 0, z: 1 };
    updateKind(ctx, rn, 0.016);
    const vt = rn.vectorTicks!;
    const a = vt.attribute.array;
    const len = vt.len;
    expect(a[3]).toBeCloseTo(-1.5, 5); // tip x unchanged (vertical-ish sweep)
    expect(a[5]).toBeCloseTo(-1.5 + len, 5); // tip z follows +z
    expect(a[9]).toBeCloseTo(-1.5 - len * 0.3, 5); // barb L along −x
    expect(a[15]).toBeCloseTo(-1.5 + len * 0.3, 5); // barb R along +x
    expect(a[17]).toBeCloseTo(-1.5 + len, 5); // barb R z = tip z
  });
});

describe("trail parenting (F-18)", () => {
  it("parents the trail Line to the SCENE, not the moving holder", () => {
    const graph: SceneGraph = {
      nodes: [node("t", "trail", { x: 0, y: 0, z: 0 }, 1)],
      relationships: [],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    graph.nodes[0].trailPoints = 8;
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "t");
    buildVisual(ctx, rn, rn.graph, holder);
    // The line is a direct child of the scene (world space).
    const sceneLines = ctx.scene!.children.filter((c) => c instanceof THREE.Line);
    expect(sceneLines).toHaveLength(1);
    expect(holder.children.length).toBe(0);
    expect(rn.trail).toBeDefined();
  });
});

describe("line / process_edge endpoint orientation (F-07)", () => {
  it("line renders from the adjacent graph node to itself (local frame)", () => {
    const graph: SceneGraph = {
      nodes: [
        node("n1", "process_node", { x: 2, y: 0, z: 0 }, 1),
        node("c1", "line", { x: 0, y: 0, z: 0 }, 1),
      ],
      relationships: [{ id: "r1", type: "flows_to", from: "n1", to: "c1" }],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "c1");
    buildVisual(ctx, rn, rn.graph, holder);
    const line = holder.children.find((c) => c instanceof THREE.Line) as THREE.Line;
    expect(line).toBeDefined();
    const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    // Local frame: from n1's offset (2,0,0) to the node origin — never the
    // fixed [0,0,0]→[0,0,size] vertical stub.
    expect(pos.getX(0)).toBeCloseTo(2, 5);
    expect(pos.getY(0)).toBeCloseTo(0, 5);
    expect(pos.getZ(0)).toBeCloseTo(0, 5);
    expect(pos.getX(1)).toBeCloseTo(0, 5);
    expect(pos.getZ(1)).toBeCloseTo(0, 5);
  });

  it("process_edge bows as a quadratic curve sampled at CURVE_SAMPLES", () => {
    const graph: SceneGraph = {
      nodes: [
        node("n1", "process_node", { x: 2, y: 0, z: 0 }, 1),
        node("c1", "process_edge", { x: 0, y: 0, z: 0 }, 1),
      ],
      relationships: [{ id: "r1", type: "flows_to", from: "n1", to: "c1" }],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "c1");
    buildVisual(ctx, rn, rn.graph, holder);
    const line = holder.children.find((c) => c instanceof THREE.Line) as THREE.Line;
    const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(pos.count).toBe(CURVE_SAMPLES);
    // The mid-sample bows off the straight chord (y or z ≠ 0).
    const mid = Math.floor(CURVE_SAMPLES / 2);
    const offChord =
      Math.abs(pos.getY(mid)) + Math.abs(pos.getZ(mid));
    expect(offChord).toBeGreaterThan(1e-3);
  });

  it("no endpoint nodes → local-frame fallback + REASON_LINE_NO_ENDPOINTS", () => {
    const graph: SceneGraph = {
      nodes: [node("c1", "line", { x: 0, y: 0, z: 0 }, 1.5)],
      relationships: [],
      animations: [],
      background: "dark",
      limits: LIMITS,
    };
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "c1");
    buildVisual(ctx, rn, rn.graph, holder);
    const line = holder.children.find((c) => c instanceof THREE.Line) as THREE.Line;
    const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    // Documented degenerate case: the local-frame segment scaled by size.
    expect(pos.getX(0)).toBe(0);
    expect(pos.getZ(1)).toBeCloseTo(1.5, 5);
    expect(ctx.reasons).toContain(REASON_LINE_NO_ENDPOINTS);
  });
});
