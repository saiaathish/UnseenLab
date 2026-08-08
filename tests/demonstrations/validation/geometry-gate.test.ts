/**
 * geometry-gate.test.ts — unit tests for the pure geometry gate (C5, Wave 3;
 * design-2 §7, §9 C5 tests 5–12). Every invariant checker is tested against
 * passing AND violating fixtures; informational checkers never flip `ok`.
 */

import { describe, expect, it } from "vitest";

import {
  checkArrowAnchoring,
  checkEdgeCrossings,
  checkEdgeEdgeCrossings,
  checkEnvelopeIntersections,
  checkLabelOverlaps,
  checkRelationshipVisibility,
  checkScene,
  checkViewportCoverage,
  REASON_ARROW_HEAD_IN_SOURCE,
  REASON_ARROW_HEAD_LENGTH,
  REASON_ARROW_HEAD_PENETRATES_TARGET,
  REASON_ARROW_TIP_OFF_SURFACE,
  REASON_EDGE_CROSSES_NODE,
  REASON_ENVELOPE_OVERLAP,
  REASON_FIELD_OVERLAPS_NODE,
  REASON_LABEL_OVERLAP,
  REASON_SHAFT_INSIDE_SOURCE,
  REASON_VIEWPORT_OUT_OF_FRAME,
  pointSegmentDistance,
  segmentBoxDistance,
  type CameraGeom,
  type EdgeGeom,
  type Envelope,
  type GateScene,
  type LabelGeom,
} from "@/demonstrations/renderers/primitive-3d/geometry-gate";
import {
  HEAD_LEN_MAX,
  HEAD_LEN_MIN,
  REASON_RELATIONSHIP_INVISIBLE_BOTH,
  SHAFT_GAP,
  arrowHead,
  type Rect,
} from "@/demonstrations/renderers/primitive-3d/presentation/constants";
import { STRESS_CORPUS } from "../renderer/presentation-gate.corpus";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z = 0) => ({ x, y, z });

function sphereEnv(id: string, x: number, y: number, z: number, r: number): Envelope {
  return {
    id,
    kind: "node",
    shape: "sphere",
    center: V(x, y, z),
    halfExtents: V(0, 0, 0),
    radius: r,
  };
}

function boxEnv(id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number): Envelope {
  return {
    id,
    kind: "node",
    shape: "box",
    center: V(x, y, z),
    halfExtents: V(hx, hy, hz),
  };
}

function fieldEnv(id: string, x: number, y: number, z: number, hx: number, hy: number): Envelope {
  return {
    id,
    kind: "field",
    shape: "rect",
    center: V(x, y, z),
    halfExtents: V(hx, hy, 0.1),
  };
}

/** Straight a→b edge placed with the design-2 §2.3 shaft math (I4-correct). */
function straightEdge(
  id: string,
  fromId: string,
  toId: string,
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  rSource: number,
  rTarget: number,
  opts: Partial<EdgeGeom> = {}
): EdgeGeom {
  const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const u = { x: (to.x - from.x) / len, y: (to.y - from.y) / len, z: (to.z - from.z) / len };
  const head = arrowHead(rTarget);
  const start = {
    x: from.x + u.x * (rSource + SHAFT_GAP),
    y: from.y + u.y * (rSource + SHAFT_GAP),
    z: from.z + u.z * (rSource + SHAFT_GAP),
  };
  const base = {
    x: to.x - u.x * (rTarget + head.len),
    y: to.y - u.y * (rTarget + head.len),
    z: to.z - u.z * (rTarget + head.len),
  };
  return {
    id,
    fromId,
    toId,
    inhibits: false,
    pts: [start, base],
    headLen: head.len,
    targetRadius: rTarget,
    ...opts,
  };
}

function labelGeom(id: string, rect: Rect, truncated = false): LabelGeom {
  return { id, kind: "node", rect, text: truncated ? "abc…" : "abc", truncated };
}

const rectAt = (cx: number, cy: number, cz = 0, halfW = 0.5, halfH = 0.3, halfD = 0.05): Rect => ({
  cx, cy, cz, halfW, halfH, halfD,
});

function orthoCamera(halfH = 5, center = V(0, 0, 0)): CameraGeom {
  return {
    mode: "ortho",
    center,
    halfH,
    halfW: halfH * (4 / 3),
    aspect: 4 / 3,
    distance: 12,
    fovDeg: 50,
    canonicalViews: [
      { name: "front", azimuth: 0, polar: 0, distance: 12 },
      { name: "worst", azimuth: 0.45, polar: 0.18, distance: 12 },
    ],
  };
}

function emptyScene(partial: Partial<GateScene> = {}): GateScene {
  return {
    envelopes: [],
    edges: [],
    labels: [],
    camera: orthoCamera(),
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers (shared with labels.ts/edges.ts consumers)
// ---------------------------------------------------------------------------

describe("pointSegmentDistance / segmentBoxDistance", () => {
  it("computes point-segment distance including endpoints and beyond", () => {
    const a = V(0, 0, 0);
    const b = V(4, 0, 0);
    expect(pointSegmentDistance(V(2, 3, 0), a, b)).toBeCloseTo(3, 6);
    expect(pointSegmentDistance(V(-1, 0, 0), a, b)).toBeCloseTo(1, 6);
    expect(pointSegmentDistance(V(2, 0, 0), a, b)).toBeCloseTo(0, 6);
  });

  it("computes segment-AABB distance (0 when intersecting)", () => {
    const box = { min: V(1, 1, 0), max: V(2, 2, 0) };
    expect(segmentBoxDistance(V(0, 1.5, 0), V(3, 1.5, 0), box.min, box.max)).toBeCloseTo(0, 4);
    expect(segmentBoxDistance(V(0, 0, 0), V(3, 0, 0), box.min, box.max)).toBeCloseTo(1, 4);
  });
});

// ---------------------------------------------------------------------------
// I1 — envelope intersections
// ---------------------------------------------------------------------------

describe("checkEnvelopeIntersections (I1)", () => {
  it("passes disjoint node envelopes", () => {
    const scene = emptyScene({
      envelopes: [
        sphereEnv("a", 0, 0, 0, 0.5),
        sphereEnv("b", 3, 0, 0, 0.5),
        boxEnv("c", 0, 3, 0, 0.5, 0.5, 0.5),
      ],
    });
    const result = checkEnvelopeIntersections(scene);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("flags overlapping spheres (EPS = 1e-4)", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), sphereEnv("b", 0.8, 0, 0, 0.5)],
    });
    const result = checkEnvelopeIntersections(scene);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      id: "a",
      invariant: "I1",
      severity: "major",
      reason: REASON_ENVELOPE_OVERLAP,
      detail: { with: "b" },
    });
  });

  it("flags box-box and sphere-box overlaps", () => {
    const boxBox = emptyScene({
      envelopes: [boxEnv("a", 0, 0, 0, 0.5, 0.5, 0.5), boxEnv("b", 0.9, 0, 0, 0.5, 0.5, 0.5)],
    });
    expect(checkEnvelopeIntersections(boxBox).ok).toBe(false);

    const sphereBox = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), boxEnv("b", 0.7, 0, 0, 0.5, 0.5, 0.5)],
    });
    expect(checkEnvelopeIntersections(sphereBox).ok).toBe(false);
  });

  it("reports field/particle overlaps as INFO only (never flips ok)", () => {
    const scene = emptyScene({
      envelopes: [
        sphereEnv("node1", 0, 0, 0, 0.5),
        fieldEnv("vf1", 0, 0, 0, 1, 1),
      ],
    });
    const result = checkEnvelopeIntersections(scene);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      invariant: "INFO",
      severity: "info",
      reason: REASON_FIELD_OVERLAPS_NODE,
      detail: { with: "node1" },
    });
  });
});

// ---------------------------------------------------------------------------
// I2 — edge crossings
// ---------------------------------------------------------------------------

describe("checkEdgeCrossings (I2)", () => {
  const base = emptyScene({
    envelopes: [
      sphereEnv("a", 0, 0, 0, 0.5),
      sphereEnv("b", 4, 0, 0, 0.5),
      sphereEnv("mid", 2, 2, 0, 0.5),
    ],
  });

  it("passes an edge that clears non-endpoint envelopes", () => {
    const scene = {
      ...base,
      edges: [straightEdge("r1", "a", "b", V(0, 0, 0), V(4, 0, 0), 0.5, 0.5)],
    };
    const result = checkEdgeCrossings(scene);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("flags an edge whose polyline crosses a non-endpoint node envelope (clearance 0.02)", () => {
    const scene = {
      ...base,
      envelopes: [
        sphereEnv("a", 0, 0, 0, 0.5),
        sphereEnv("b", 4, 0, 0, 0.5),
        sphereEnv("mid", 2, 0, 0, 0.5), // ON the a→b segment
      ],
      edges: [straightEdge("r1", "a", "b", V(0, 0, 0), V(4, 0, 0), 0.5, 0.5)],
    };
    const result = checkEdgeCrossings(scene);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.reason === REASON_EDGE_CROSSES_NODE)).toBe(true);
    expect(result.violations[0]).toMatchObject({ id: "r1", invariant: "I2", severity: "major" });
  });

  it("ignores the edge's own endpoint envelopes", () => {
    const scene = {
      ...base,
      envelopes: [
        sphereEnv("a", 0, 0, 0, 0.5),
        sphereEnv("b", 1.4, 0, 0, 0.5), // close pair — the shaft passes its own source
      ],
      edges: [straightEdge("r1", "a", "b", V(0, 0, 0), V(1.4, 0, 0), 0.5, 0.5)],
    };
    expect(checkEdgeCrossings(scene).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// I3 — label overlaps
// ---------------------------------------------------------------------------

describe("checkLabelOverlaps (I3)", () => {
  it("passes a label clear of envelopes, edges and other labels", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5)],
      edges: [straightEdge("r1", "a", "b", V(0, 0, 0), V(4, 0, 0), 0.5, 0.5)],
      labels: [labelGeom("l1", rectAt(0, 3, 0))],
    });
    expect(checkLabelOverlaps(scene).ok).toBe(true);
  });

  it("flags a label rect overlapping a node envelope (clearance 0.15)", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5)],
      labels: [labelGeom("l1", rectAt(0, 0.4, 0))],
    });
    const result = checkLabelOverlaps(scene);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatchObject({
      id: "l1",
      invariant: "I3",
      severity: "major",
      reason: REASON_LABEL_OVERLAP,
      detail: { with: "envelope:a" },
    });
  });

  it("flags a label rect within 0.12 of an edge polyline", () => {
    const scene = emptyScene({
      edges: [straightEdge("r1", "a", "b", V(-2, 0, 0), V(2, 0, 0), 0.5, 0.5)],
      labels: [labelGeom("l1", rectAt(0, 0.1, 0))],
    });
    const result = checkLabelOverlaps(scene);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.detail?.with === "edge:r1")).toBe(true);
  });

  it("flags two label rects within 0.05 of each other", () => {
    const scene = emptyScene({
      labels: [labelGeom("l1", rectAt(0, 0, 0)), labelGeom("l2", rectAt(0.1, 0, 0))],
    });
    const result = checkLabelOverlaps(scene);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.detail?.with === "label:l2")).toBe(true);
  });

  it("reports ellipsized labels as INFO only (never flips ok)", () => {
    const scene = emptyScene({
      labels: [labelGeom("l1", rectAt(0, 0, 0), true)],
    });
    const result = checkLabelOverlaps(scene);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      id: "l1",
      invariant: "INFO",
      severity: "info",
    });
  });
});

// ---------------------------------------------------------------------------
// I4 — arrowhead anchoring
// ---------------------------------------------------------------------------

describe("checkArrowAnchoring (I4)", () => {
  it("passes a correctly anchored head (tip on surface, band [r_t, r_t+len], len in bounds)", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), sphereEnv("b", 3, 0, 0, 0.5)],
      edges: [straightEdge("r1", "a", "b", V(0, 0, 0), V(3, 0, 0), 0.5, 0.5)],
    });
    const result = checkArrowAnchoring(scene);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("flags head length out of bounds [0.18, 0.5]", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), sphereEnv("b", 3, 0, 0, 0.5)],
      edges: [
        straightEdge("r1", "a", "b", V(0, 0, 0), V(3, 0, 0), 0.5, 0.5, { headLen: 0.1 }),
        straightEdge("r2", "a", "b", V(0, 0, 0), V(3, 0, 0), 0.5, 0.5, { headLen: 0.6 }),
      ],
    });
    const result = checkArrowAnchoring(scene);
    expect(result.violations.filter((v) => v.reason === REASON_ARROW_HEAD_LENGTH)).toHaveLength(2);
    expect(HEAD_LEN_MIN).toBe(0.18);
    expect(HEAD_LEN_MAX).toBe(0.5);
  });

  it("flags a tip that does not land on the target surface", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), sphereEnv("b", 3, 0, 0, 0.5)],
      edges: [
        straightEdge("r1", "a", "b", V(0, 0, 0), V(3, 0, 0), 0.5, 0.5, {
          pts: [V(0.52, 0, 0), V(2.0, 0, 0)], // base too close → tip 0.14 off the surface
        }),
      ],
    });
    const result = checkArrowAnchoring(scene);
    expect(result.violations.some((v) => v.reason === REASON_ARROW_TIP_OFF_SURFACE)).toBe(true);
    expect(result.violations.some((v) => v.reason === REASON_ARROW_HEAD_PENETRATES_TARGET)).toBe(true);
  });

  it("flags a head embedded in the source on short edges (L < r_s + r_t + len)", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), sphereEnv("b", 0.6, 0, 0, 0.5)],
      edges: [straightEdge("r1", "a", "b", V(0, 0, 0), V(0.6, 0, 0), 0.5, 0.5)],
    });
    const result = checkArrowAnchoring(scene);
    expect(result.ok).toBe(false);
    // L < r_s + r_t + len → head inside the source (the inverted fixture
    // polyline additionally flags the tip as off-surface — both are I4).
    const sourceBreaches = result.violations.filter(
      (v) => v.reason === REASON_ARROW_HEAD_IN_SOURCE
    );
    expect(sourceBreaches.length).toBeGreaterThanOrEqual(2);
  });

  it("flags a shaft that starts inside the source envelope", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), sphereEnv("b", 3, 0, 0, 0.5)],
      edges: [
        straightEdge("r1", "a", "b", V(0, 0, 0), V(3, 0, 0), 0.5, 0.5, {
          pts: [V(0.2, 0, 0), V(2.14, 0, 0)],
        }),
      ],
    });
    const result = checkArrowAnchoring(scene);
    expect(result.violations.some((v) => v.reason === REASON_SHAFT_INSIDE_SOURCE)).toBe(true);
    expect(SHAFT_GAP).toBe(0.02);
  });

  it("accepts a head on a box target (surface-anchored, not radial)", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), boxEnv("b", 3, 0, 0, 0.5, 0.5, 0.5)],
      edges: [
        straightEdge("r1", "a", "b", V(0, 0, 0), V(3, 0, 0), 0.5, 0.5, {
          pts: [V(0.52, 0, 0), V(3 - 0.86, 0, 0)], // base 0.36 beyond the b face at x=2.5
        }),
      ],
    });
    // Tip at (2.5−0.36+0.36, 0) = (2.5, 0) — exactly on the box face.
    const result = checkArrowAnchoring(scene);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// I5 — viewport coverage
// ---------------------------------------------------------------------------

describe("checkViewportCoverage (I5)", () => {
  it("passes content fully inside the framed NDC for every canonical view", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", -2, 0, 0, 1), sphereEnv("b", 2, 0, 0, 1)],
      labels: [labelGeom("l1", rectAt(0, 3, 0, 1, 0.3))],
    });
    expect(checkViewportCoverage(scene).ok).toBe(true);
  });

  it("flags a node envelope outside the frame (major) with the 0.02 NDC slack", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 10, 0, 0, 1)],
    });
    const result = checkViewportCoverage(scene);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatchObject({
      id: "a",
      invariant: "I5",
      severity: "major",
      reason: REASON_VIEWPORT_OUT_OF_FRAME,
    });
  });

  it("flags edge points outside the frame as minor", () => {
    const scene = emptyScene({
      edges: [
        {
          id: "r1",
          fromId: "a",
          toId: "b",
          inhibits: false,
          pts: [V(-8, 0, 0), V(0, 0, 0)],
          headLen: 0.36,
          targetRadius: 0.5,
        },
      ],
    });
    const result = checkViewportCoverage(scene);
    expect(result.ok).toBe(false);
    expect(result.violations.every((v) => v.severity === "minor")).toBe(true);
  });

  it("flags points behind the perspective camera", () => {
    const scene: GateScene = {
      envelopes: [],
      edges: [],
      labels: [],
      camera: {
        mode: "perspective",
        center: V(0, 0, 0),
        halfH: 5,
        halfW: 5 * (4 / 3),
        aspect: 4 / 3,
        distance: 10,
        fovDeg: 50,
        canonicalViews: [{ name: "front", azimuth: 0, polar: 0, distance: 10 }],
      },
      dynamic: { points: [V(0, 0, -20)] },
    };
    expect(checkViewportCoverage(scene).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Informational checkers
// ---------------------------------------------------------------------------

describe("informational checkers (never flip ok)", () => {
  it("checkEdgeEdgeCrossings reports crossings as INFO", () => {
    const scene = emptyScene({
      edges: [
        {
          id: "r1", fromId: "a", toId: "b", inhibits: false,
          pts: [V(-2, 0, 0), V(2, 0, 0)], headLen: 0.36, targetRadius: 0.5,
        },
        {
          id: "r2", fromId: "c", toId: "d", inhibits: false,
          pts: [V(0, -2, 0), V(0, 2, 0)], headLen: 0.36, targetRadius: 0.5,
        },
      ],
    });
    const result = checkEdgeEdgeCrossings(scene);
    expect(result.ok).toBe(true);
    expect(result.violations.some((v) => v.invariant === "INFO")).toBe(true);
  });

  it("checkRelationshipVisibility flags declared relationships with no rendered edge", () => {
    const scene = emptyScene({
      edges: [
        {
          id: "r1", fromId: "a", toId: "b", inhibits: false,
          pts: [V(0, 0, 0), V(2, 0, 0)], headLen: 0.36, targetRadius: 0.5,
        },
      ],
      declaredRelationships: [
        { id: "r1", from: "a", to: "b" },
        { id: "r2", from: "g1", to: "b" }, // group endpoint — invisible on both surfaces
      ],
    });
    const result = checkRelationshipVisibility(scene);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      id: "r2",
      invariant: "INFO",
      severity: "info",
      reason: REASON_RELATIONSHIP_INVISIBLE_BOTH,
    });
  });
});

// ---------------------------------------------------------------------------
// Aggregate + corpus
// ---------------------------------------------------------------------------

describe("checkScene (aggregate)", () => {
  it("ok = I1..I5 all ok; violations sorted by invariant then severity", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", 0, 0, 0, 0.5), sphereEnv("b", 0.7, 0, 0, 0.5)],
      labels: [labelGeom("l1", rectAt(5, 5, 0), true)],
    });
    const result = checkScene(scene);
    expect(result.ok).toBe(false);
    const invariants = result.violations.map((v) => v.invariant);
    // I1 violations come before INFO ones.
    expect(invariants.filter((i) => i === "I1").length).toBeGreaterThan(0);
    expect(invariants.lastIndexOf("I1")).toBeLessThan(invariants.indexOf("INFO"));
    expect(result.violations.every((v) => v.severity === "major" || v.severity === "info")).toBe(true);
  });

  it("a fully clean scene passes the aggregate", () => {
    const scene = emptyScene({
      envelopes: [sphereEnv("a", -2, 0, 0, 0.5), sphereEnv("b", 2, 0, 0, 0.5)],
      edges: [straightEdge("r1", "a", "b", V(-2, 0, 0), V(2, 0, 0), 0.5, 0.5)],
      labels: [labelGeom("l1", rectAt(0, 2.5, 0))],
    });
    expect(checkScene(scene).ok).toBe(true);
  });
});

describe("stress corpus — gate-level assertions", () => {
  it("dense_80_lattice: I1 mass violation (70+ pairs under separation)", () => {
    const spec = STRESS_CORPUS.find((c) => c.id === "dense_80_lattice")!.spec;
    const envelopes: Envelope[] = (spec.scene3d?.objects ?? []).map((o) => ({
      id: o.id,
      kind: "node" as const,
      shape: "sphere" as const,
      center: { x: o.position?.x ?? 0, y: o.position?.y ?? 0, z: o.position?.z ?? 0 },
      halfExtents: { x: 0, y: 0, z: 0 },
      radius: (o.size ?? 1) * 0.5,
    }));
    const result = checkEnvelopeIntersections(emptyScene({ envelopes }));
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(70);
  });

  it("size5_1u_spacing: I1 violations (envelopes overlap by 1.5u) and I5 out-of-frame", () => {
    const spec = STRESS_CORPUS.find((c) => c.id === "size5_1u_spacing")!.spec;
    const envelopes: Envelope[] = (spec.scene3d?.objects ?? []).map((o) => ({
      id: o.id,
      kind: "node" as const,
      shape: "sphere" as const,
      center: { x: o.position?.x ?? 0, y: o.position?.y ?? 0, z: o.position?.z ?? 0 },
      halfExtents: { x: 0, y: 0, z: 0 },
      radius: (o.size ?? 1) * 0.5,
    }));
    const i1 = checkEnvelopeIntersections(emptyScene({ envelopes }));
    expect(i1.ok).toBe(false);

    // Content spans ±3.75; a halfH of 3 cannot frame it (I5).
    const i5 = checkViewportCoverage(
      emptyScene({ envelopes, camera: orthoCamera(3) })
    );
    expect(i5.ok).toBe(false);
    expect(i5.violations.some((v) => v.severity === "major")).toBe(true);
  });

  it("duplicates: pn1/ep1 at the same world position → I1 violation", () => {
    const spec = STRESS_CORPUS.find((c) => c.id === "duplicates")!.spec;
    // Both roots become gate envelopes (energy_packet included — the 2D
    // surface draws it, so the 3D pipeline's envelope set covers it too).
    const envelopes: Envelope[] = (spec.scene3d?.objects ?? []).map((o) => ({
      id: o.id,
      kind: "node" as const,
      shape: "sphere" as const,
      center: { x: o.position?.x ?? 0, y: o.position?.y ?? 0, z: o.position?.z ?? 0 },
      halfExtents: { x: 0, y: 0, z: 0 },
      radius: (o.size ?? 1) * 0.5,
    }));
    const result = checkEnvelopeIntersections(emptyScene({ envelopes }));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.detail?.with === "pn1" || v.detail?.with === "ep1")).toBe(true);
  });

  it("short_edges: L < r_s + r_t + len on 0.6u/0.8u edges → I4 head-in-source", () => {
    const spec = STRESS_CORPUS.find((c) => c.id === "short_edges")!.spec;
    const objs = new Map((spec.scene3d?.objects ?? []).map((o) => [o.id, o]));
    const envelopes: Envelope[] = [...objs.values()].map((o) => ({
      id: o.id,
      kind: "node" as const,
      shape: "sphere" as const,
      center: { x: o.position?.x ?? 0, y: o.position?.y ?? 0, z: o.position?.z ?? 0 },
      halfExtents: { x: 0, y: 0, z: 0 },
      radius: (o.size ?? 1) * 0.5,
    }));
    const edges: EdgeGeom[] = (spec.scene3d?.relationships ?? []).map((rel) => {
      const from = objs.get(rel.from)!;
      const to = objs.get(rel.to)!;
      return straightEdge(
        rel.id, rel.from, rel.to,
        from.position ?? V(0, 0, 0), to.position ?? V(0, 0, 0),
        (from.size ?? 1) * 0.5, (to.size ?? 1) * 0.5
      );
    });
    const result = checkArrowAnchoring(emptyScene({ envelopes, edges }));
    expect(result.ok).toBe(false);
    expect(
      result.violations.filter((v) => v.reason === REASON_ARROW_HEAD_IN_SOURCE).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("edge_on_node: the RAW straight edge crosses the on-segment node (routing makes it clean)", () => {
    const spec = STRESS_CORPUS.find((c) => c.id === "edge_on_node")!.spec;
    const objs = new Map((spec.scene3d?.objects ?? []).map((o) => [o.id, o]));
    const envelopes: Envelope[] = [...objs.values()].map((o) => ({
      id: o.id,
      kind: "node" as const,
      shape: "sphere" as const,
      center: { x: o.position?.x ?? 0, y: o.position?.y ?? 0, z: o.position?.z ?? 0 },
      halfExtents: { x: 0, y: 0, z: 0 },
      radius: (o.size ?? 1) * 0.5,
    }));
    const rel = spec.scene3d!.relationships[0];
    const from = objs.get(rel.from)!;
    const to = objs.get(rel.to)!;
    const edge = straightEdge(
      rel.id, rel.from, rel.to,
      from.position ?? V(0, 0, 0), to.position ?? V(0, 0, 0),
      (from.size ?? 1) * 0.5, (to.size ?? 1) * 0.5
    );
    const result = checkEdgeCrossings(emptyScene({ envelopes, edges: [edge] }));
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatchObject({
      id: rel.id,
      invariant: "I2",
      detail: { node: "mid" },
    });
  });

  it("z_only_pair: 3D-clean (z separates) — no I1 in world space", () => {
    const spec = STRESS_CORPUS.find((c) => c.id === "z_only_pair")!.spec;
    const envelopes: Envelope[] = (spec.scene3d?.objects ?? []).map((o) => ({
      id: o.id,
      kind: "node" as const,
      shape: "sphere" as const,
      center: { x: o.position?.x ?? 0, y: o.position?.y ?? 0, z: o.position?.z ?? 0 },
      halfExtents: { x: 0, y: 0, z: 0 },
      radius: (o.size ?? 1) * 0.5,
    }));
    expect(checkEnvelopeIntersections(emptyScene({ envelopes })).ok).toBe(true);
  });
});
