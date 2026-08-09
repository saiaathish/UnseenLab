/**
 * camera.ts unit tests (C4, Wave 3 — design-2-presentation-gate.md §3, §9 C4).
 *
 * Pure decision-logic tests: no `three` mock needed — camera.ts's framing
 * functions are Three.js-free plain-Vec3 math; the real `three` module only
 * loads (side-effect-free) for frameCamera/applyCamera/clampGraphOrbit, which
 * these tests do not exercise.
 *
 * "Design fixture" tests reproduce the worked checks of design-2 §3.2/§3.3
 * (process_flow 4.30, layered_system 5.68, particle_population ~4.098 with
 * the Wave-4b canonical-coverage override of the old 4 floor, the swing
 * margin) using the design's stated content geometry. The graph-side
 * estimator (contentAABBFromGraph) is tested against real scene graphs
 * through labels.ts's placed plans (the current renderer placement).
 */

import { describe, expect, it } from "vitest";
import {
  canonicalViews,
  computeContentAABB,
  contentAABBFromGraph,
  contentExtentEmpty,
  DEFAULT_FOV_DEG,
  dynamicExtentFromEngineState,
  frameMarginFor,
  graphFrameHalfHeight,
  GRAPH_AZIMUTH_BAND,
  GRAPH_POLAR_BAND,
  inPlaneRadiusMax,
  maybeReframe,
  perspectiveDistance,
  projectOrthoToCSS,
  type ContentExtent,
  type DynamicExtent,
  type Envelope,
} from "@/demonstrations/renderers/primitive-3d/camera";
import type {
  SceneGraph,
  SceneGraphNode,
} from "@/demonstrations/renderers/primitive-3d/types";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";
import type { EngineVisualState } from "@/demonstrations/renderers/lumina-2d/types";
import type { Rect } from "@/demonstrations/renderers/primitive-3d/presentation/constants";

const ASPECT_4_3 = 4 / 3;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function sphereEnv(
  id: string,
  x: number,
  y: number,
  radius: number
): Envelope {
  return {
    id,
    kind: "node",
    shape: "sphere",
    center: { x, y, z: 0 },
    halfExtents: { x: radius, y: radius, z: radius },
    radius,
  };
}

function boxEnv(
  id: string,
  x: number,
  y: number,
  half: number
): Envelope {
  return {
    id,
    kind: "node",
    shape: "box",
    center: { x, y, z: 0 },
    halfExtents: { x: half, y: half, z: half },
  };
}

function labelRect(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): Rect {
  return { cx, cy, cz: 0, halfW, halfH, halfD: 0 };
}

/** Minimal SceneGraphNode for hand-built estimator fixtures. */
function node(
  id: string,
  kind: SceneGraphNode["kind"],
  x: number,
  y: number,
  size: number,
  label?: string,
  children: string[] = []
): SceneGraphNode {
  return {
    id,
    kind,
    label,
    position: { x, y, z: 0 },
    size,
    color: "#fff",
    children,
    trailPoints: 0,
    particleCount: 0,
    depth: 1,
  };
}

function graph(nodes: SceneGraphNode[]): SceneGraph {
  return {
    nodes,
    relationships: [],
    animations: [],
    background: "dark",
    limits: {
      maxObjects: 100,
      particleLimit: 2000,
      maxTrailPoints: 200,
      maxLabels: 25,
      maxRelationships: 100,
      maxGroupDepth: 4,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. computeContentAABB — every content class enumerated (design-2 §9 C4 #1)
// ---------------------------------------------------------------------------

describe("computeContentAABB", () => {
  it("unions envelopes, label rects, edge polylines, trails, bodies and field bounds", () => {
    const aabb = computeContentAABB(
      {
        envelopes: [
          sphereEnv("a", 0, 0, 0.5),
          boxEnv("b", 2, 0, 0.5),
          {
            id: "plane",
            kind: "plane",
            shape: "rect",
            center: { x: 0, y: 3, z: 0 },
            halfExtents: { x: 1, y: 0.1, z: 1 },
          },
        ],
        labelRects: [labelRect(0, 4, 0.5, 0.2)],
        edgePolylines: [
          [
            { x: 0, y: 0, z: 0 },
            { x: 5, y: 5, z: 0 },
          ],
        ],
        trailBounds: [
          { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        ],
        engineBodies: [{ center: { x: 10, y: 0, z: 0 }, radius: 0.5 }],
        engineFieldBounds: {
          min: { x: 9, y: 0, z: 9 },
          max: { x: 11, y: 0, z: 11 },
        },
      },
      {
        engineBodies: [{ center: { x: -8, y: 2, z: 0 }, radius: 0.25 }],
      }
    );
    expect(aabb.min).toEqual({ x: -8.25, y: -1, z: -1 });
    expect(aabb.max).toEqual({ x: 11, y: 5, z: 11 }); // y=5: edge polyline tip
  });

  it("covers the dynamic extents alone", () => {
    const dynamic: DynamicExtent = {
      engineBodies: [{ center: { x: 10, y: 0, z: 0 }, radius: 0.5 }],
      engineFieldBounds: {
        min: { x: 9, y: 0, z: 9 },
        max: { x: 11, y: 0, z: 11 },
      },
    };
    const aabb = computeContentAABB({ envelopes: [] }, dynamic);
    expect(aabb.min).toEqual({ x: 9, y: -0.5, z: -0.5 });
    expect(aabb.max).toEqual({ x: 11, y: 0.5, z: 11 });
  });

  it("empty scene yields the zero extent", () => {
    const aabb = computeContentAABB({ envelopes: [] });
    expect(aabb).toEqual(contentExtentEmpty());
  });
});

// ---------------------------------------------------------------------------
// 2. Graph-mode half-height — design-2 §3.2 worked checks (design-2 §9 C4 #2)
// ---------------------------------------------------------------------------

describe("graphFrameHalfHeight", () => {
  it("process_flow fixture → 4.30 (±0.01) at 4:3 (design-2 §3.2)", () => {
    // Design fixture: three s=1 process nodes at x=−3/0/3 with full-width
    // label sprite rects (halfW 1.1 = 2.2/2 cap, halfH 0.25) above the nodes
    // → content x∈[−4.1, 4.1], y∈[−0.5, 1.55] (design-2 §3.2 worked check).
    const aabb: ContentExtent = {
      min: { x: -4.1, y: -0.5, z: 0 },
      max: { x: 4.1, y: 1.55, z: 0 },
    };
    const frame = graphFrameHalfHeight(aabb, ASPECT_4_3);
    expect(frame.margin).toBeCloseTo(1.07, 5);
    expect(frame.halfH).toBeGreaterThanOrEqual(4.29);
    expect(frame.halfH).toBeLessThanOrEqual(4.31);
    expect(frame.halfW).toBeCloseTo(frame.halfH * ASPECT_4_3, 10);
  });

  it("timeline_sequence content → frame covers every label (no clip)", () => {
    // Real timeline_sequence template content: s=0.9 nodes at x=−3/−1/1/3
    // with cap-width label rects (halfW 0.99, halfH 0.225, cy 1.21).
    // NOTE (deviation): design-2 §3.2 states 4.94 for timeline_sequence; that
    // number does not reproduce from the actual template content under the
    // §3.2 pseudocode (content x∈[−3.99, 3.99] → halfH ≈ 4.19; a 4.94 frame
    // would require content reaching ≈ ±4.75). The formula is followed
    // exactly; the F-12 regression (no label clip) is asserted below.
    const aabb: ContentExtent = {
      min: { x: -3.99, y: -0.45, z: 0 },
      max: { x: 3.99, y: 1.435, z: 0 },
    };
    const frame = graphFrameHalfHeight(aabb, ASPECT_4_3);
    expect(frame.halfH).toBeCloseTo(4.186, 2);
    // F-12 regression: all content stays inside the frame with margin.
    const centerY = (aabb.min.y + aabb.max.y) / 2;
    expect(centerY + frame.halfH).toBeGreaterThan(aabb.max.y + 0.3);
    expect(centerY - frame.halfH).toBeLessThan(aabb.min.y - 0.3);
    expect(frame.halfW).toBeGreaterThan(aabb.max.x + 0.3);
  });

  it("lone s=1 node: covers the label top with the floor margin (F-12)", () => {
    // Design fixture: lone s=1 node (r 0.5) with a narrow label rect above
    // (halfW 0.19 — "Hub"-class label), label top 1.55 → halfY = 1.025.
    const aabb: ContentExtent = {
      min: { x: -0.5, y: -0.5, z: 0 },
      max: { x: 0.5, y: 1.55, z: 0 },
    };
    const frame = graphFrameHalfHeight(aabb, ASPECT_4_3);
    // Margin is driven by halfY (1.025 → 0.2·1.025 + 0.25 = 0.455) — the
    // content-proportional margin replaces the old 1.4 hard floor.
    expect(frame.margin).toBeCloseTo(0.455, 5);
    // Formula-exact value (symmetric half-extents + swing; design-2's worked
    // check of 1.90 treated maxY as halfY and omitted the swing — the
    // pseudocode §3.2 is authoritative).
    expect(frame.halfH).toBeCloseTo(1.583, 2);
    // F-12 regression: the old 1.4 floor clipped the 1.55 label top; the new
    // frame must exceed 1.4 and keep the label top inside with the floor
    // margin.
    expect(frame.halfH).toBeGreaterThan(1.4);
    const centerY = (aabb.min.y + aabb.max.y) / 2;
    expect(centerY + frame.halfH - aabb.max.y).toBeGreaterThanOrEqual(0.35);
  });

  it("margin is content-proportional and clamped (design-2 §3.2)", () => {
    expect(frameMarginFor(0.1)).toBeCloseTo(0.35, 10); // floor
    expect(frameMarginFor(0.5)).toBeCloseTo(0.35, 10); // 0.2·0.5+0.25 = 0.35
    expect(frameMarginFor(10)).toBeCloseTo(2.25, 10);
    expect(frameMarginFor(20)).toBeCloseTo(2.5, 10); // cap
  });

  it("empty content falls back to the floor frame", () => {
    const frame = graphFrameHalfHeight(contentExtentEmpty(), ASPECT_4_3);
    expect(frame.halfH).toBeCloseTo(0.35, 10);
  });
});

// ---------------------------------------------------------------------------
// 3. Swing margin — F-14 (design-2 §9 C4 #4)
// ---------------------------------------------------------------------------

describe("swing margin (F-14)", () => {
  const processFlowAabb: ContentExtent = {
    min: { x: -4.1, y: -0.5, z: 0 },
    max: { x: 4.1, y: 1.55, z: 0 },
  };

  it("in-plane radius is the view-plane distance around the AABB center", () => {
    // process_flow corner (4.1, 1.025): the design's worked check uses
    // ρ ≈ 4.23; the exact view-plane projection gives ≈ 4.197.
    expect(inPlaneRadiusMax(processFlowAabb)).toBeCloseTo(4.197, 2);
  });

  it("corner labels stay inside the frustum at max azimuth swing", () => {
    const frame = graphFrameHalfHeight(processFlowAabb, ASPECT_4_3);
    const rho = inPlaneRadiusMax(processFlowAabb);
    // At the ±0.45 rad azimuth band edge, a corner at radius ρ projects to
    // ρ·cos(0.45) on the vertical screen axis — the swing margin must cover it.
    expect(frame.halfH).toBeGreaterThanOrEqual(rho * Math.cos(GRAPH_AZIMUTH_BAND));
    expect(frame.halfH).toBeGreaterThan(rho * 0.95);
  });

  it("band constants match the orbit clamp (design-2 §3.5)", () => {
    expect(GRAPH_AZIMUTH_BAND).toBeCloseTo(0.45, 10);
    expect(GRAPH_POLAR_BAND).toBeCloseTo(0.18, 10);
  });
});

// ---------------------------------------------------------------------------
// 4. Perspective distance — design-2 §3.3 worked checks (design-2 §9 C4 #3)
// ---------------------------------------------------------------------------

describe("perspectiveDistance", () => {
  it("layered_system fixture → 5.68 (±0.01) at fov 50 (design-2 §3.3)", () => {
    // Design fixture: four s=1 boxes stacked y∈[−2, 2] with right-anchored
    // labels keeping x∈[−0.5, 1.5] → half 2.0, margin 0.65,
    // distance = 2.65/tan(25°) = 5.68.
    const aabb: ContentExtent = {
      min: { x: -0.5, y: -2, z: 0 },
      max: { x: 1.5, y: 2, z: 0 },
    };
    const distance = perspectiveDistance(aabb, DEFAULT_FOV_DEG, ASPECT_4_3);
    expect(distance).toBeGreaterThanOrEqual(5.67);
    expect(distance).toBeLessThanOrEqual(5.69);
  });

  it("particle_population fixture → canonical coverage raises distance above the 4 floor", () => {
    // Single field size 2 → half 1.0, margin 0.45, naive 1.45/tan(25°) = 3.11.
    // Wave-4b canonical coverage (perspectiveCanonicalDistance — every AABB
    // corner inside the frustum for front/top/left/right + ±band views, I5)
    // raises this to ≈4.098; the 4 floor remains the lower bound.
    const aabb: ContentExtent = {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    };
    const distance = perspectiveDistance(aabb, DEFAULT_FOV_DEG, ASPECT_4_3);
    expect(distance).toBeGreaterThan(4);
    expect(distance).toBeLessThan(4.2);
  });

  it("P1-1: the [4,120] clamp is the BUILD contract — an explicit clampMax: null lifts it (engine-anchored reframes)", () => {
    // A huge flat scene whose exact canonical requirement exceeds the build
    // cap (an escape's trail span): the BUILD frame binds at 120...
    const huge: ContentExtent = {
      min: { x: -10, y: -2.5, z: -120 },
      max: { x: 10, y: 2.5, z: 120 },
    };
    const capped = perspectiveDistance(huge, DEFAULT_FOV_DEG, ASPECT_4_3);
    expect(capped).toBe(120);
    // ...while an engine-anchored REFRAME (clampMax: null) grows past it —
    // the canonical distance is exact, never a blind zoom-out.
    const uncapped = perspectiveDistance(huge, DEFAULT_FOV_DEG, ASPECT_4_3, {
      clampMax: null,
    });
    expect(uncapped).toBeGreaterThan(120);
    // An explicit numeric cap still binds.
    expect(
      perspectiveDistance(huge, DEFAULT_FOV_DEG, ASPECT_4_3, { clampMax: 200 })
    ).toBe(200);
    // The 4 floor stays for both paths.
    expect(
      perspectiveDistance(contentExtentEmpty(), DEFAULT_FOV_DEG, ASPECT_4_3, {
        clampMax: null,
      })
    ).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 5. Re-framing hysteresis — design-2 §3.4 (design-2 §9 C4 #5, F-13)
// ---------------------------------------------------------------------------

describe("maybeReframe", () => {
  const base = {
    graphMode: true,
    aspect: ASPECT_4_3,
    fovDeg: DEFAULT_FOV_DEG,
    content: {
      min: { x: -4.1, y: -0.5, z: 0 },
      max: { x: 4.1, y: 1.55, z: 0 },
    } satisfies ContentExtent, // required halfH ≈ 4.30
  };

  it("no growth when the current frame already covers the required one", () => {
    const result = maybeReframe({
      ...base,
      orbit: { userControlled: false, distance: 10 },
      orthoBaseHalf: 5,
    });
    expect(result).toBeNull();
  });

  it("grows the ortho base half-height only beyond 5% hysteresis", () => {
    // 4.30 < 4.2·1.05 → no growth.
    expect(
      maybeReframe({
        ...base,
        orbit: { userControlled: false, distance: 10 },
        orthoBaseHalf: 4.2,
      })
    ).toBeNull();
    // 4.30 ≥ 4.0·1.05 → grows.
    const grown = maybeReframe({
      ...base,
      orbit: { userControlled: false, distance: 10 },
      orthoBaseHalf: 4.0,
    });
    expect(grown).not.toBeNull();
    expect(grown!.graphMode).toBe(true);
    expect(grown!.orthoBaseHalf).toBeCloseTo(4.297, 2);
    expect(grown!.distance).toBe(10);
  });

  it("never shrinks under any state push", () => {
    const result = maybeReframe({
      ...base,
      orbit: { userControlled: false, distance: 10 },
      orthoBaseHalf: 12, // way above the required frame
    });
    expect(result).toBeNull();
  });

  it("is a no-op while the orbit is user-controlled", () => {
    const result = maybeReframe({
      ...base,
      orbit: { userControlled: true, distance: 10 },
      orthoBaseHalf: 1.0, // would otherwise grow a lot
    });
    expect(result).toBeNull();
  });

  it("grows the perspective distance with the same hysteresis", () => {
    const input = {
      graphMode: false,
      aspect: ASPECT_4_3,
      fovDeg: DEFAULT_FOV_DEG,
      content: {
        min: { x: -0.5, y: -2, z: 0 },
        max: { x: 1.5, y: 2, z: 0 },
      } satisfies ContentExtent, // required distance ≈ 5.68
      orbit: { userControlled: false, distance: 5.0 },
      orthoBaseHalf: 0,
    };
    const grown = maybeReframe(input);
    expect(grown).not.toBeNull();
    expect(grown!.graphMode).toBe(false);
    expect(grown!.distance).toBeCloseTo(5.68, 2);
    // 5.68 < 5.5·1.05 → hysteresis rejects.
    expect(
      maybeReframe({ ...input, orbit: { userControlled: false, distance: 5.5 } })
    ).toBeNull();
  });

  it("an engine body moving out of the frame triggers growth (F-13)", () => {
    const result = maybeReframe({
      graphMode: false,
      aspect: ASPECT_4_3,
      fovDeg: DEFAULT_FOV_DEG,
      content: {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
      },
      dynamic: {
        engineBodies: [{ center: { x: 20, y: 0, z: 0 }, radius: 0.5 }],
      },
      orbit: { userControlled: false, distance: 4 },
      orthoBaseHalf: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.distance).toBeGreaterThan(4 * 1.05);
  });
});

// ---------------------------------------------------------------------------
// 6. Canonical views — design-2 §3.5 (design-2 §9 C4 #6)
// ---------------------------------------------------------------------------

describe("canonicalViews", () => {
  const az0 = 0;
  const po0 = Math.acos(0.55 / Math.hypot(0.55, 1)); // ≈ 1.0681

  it("enumerates front/top/left/right/worst with the expected orbit params", () => {
    const views = canonicalViews({
      graphMode: true,
      center: { x: 0, y: 0, z: 0 },
      azimuth: az0,
      polar: po0,
      distance: 12,
      halfH: 4.3,
      aspect: ASPECT_4_3,
      content: {
        min: { x: -4.1, y: -0.5, z: 0 },
        max: { x: 4.1, y: 1.55, z: 0 },
      },
    });
    expect(views.map((v) => v.name)).toEqual([
      "front",
      "top",
      "left",
      "right",
      "worst",
    ]);
    const byName = Object.fromEntries(views.map((v) => [v.name, v]));
    expect(byName.front.azimuth).toBeCloseTo(az0, 10);
    expect(byName.front.polar).toBeCloseTo(po0, 10);
    expect(byName.top.polar).toBeCloseTo(0.05, 10);
    expect(byName.left.azimuth).toBeCloseTo(az0 - Math.PI / 2, 10);
    expect(byName.right.azimuth).toBeCloseTo(az0 + Math.PI / 2, 10);
    // Worst for this wide flat content: the azimuth swing tilts the x-extent
    // into the vertical screen axis (span grows by 2·xExtent·cos(polar)·
    // |sin(az)|) — the band-corner azimuth with the shallower polar maximizes
    // the projected bbox area (verified against projectedContentArea).
    expect(byName.worst.azimuth).toBeCloseTo(az0 - GRAPH_AZIMUTH_BAND, 10);
    expect(byName.worst.polar).toBeCloseTo(po0 - GRAPH_POLAR_BAND, 10);
    for (const v of views) expect(v.distance).toBe(12);
  });

  it("worst = argmax projected content area over the 9-combo band", () => {
    const az0 = 0.3;
    const views = canonicalViews({
      graphMode: true,
      center: { x: 0, y: 0, z: 0 },
      azimuth: az0,
      polar: po0,
      distance: 12,
      halfH: 4.3,
      aspect: ASPECT_4_3,
      content: {
        min: { x: -4.1, y: -0.5, z: 0 },
        max: { x: 4.1, y: 1.55, z: 0 },
      },
    });
    const worst = views[4];
    // |sin(0.3 + 0.45)| = 0.68 is the largest azimuth tilt in the band →
    // the (az0 + band) corner wins; the shallower polar amplifies the tilt
    // contribution (2·xExtent·cos(polar)·|sin(az)|).
    expect(worst.azimuth).toBeCloseTo(az0 + GRAPH_AZIMUTH_BAND, 10);
    expect(worst.polar).toBeCloseTo(po0 - GRAPH_POLAR_BAND, 10);
  });
});

// ---------------------------------------------------------------------------
// 7. projectOrthoToCSS — parity with the frozen demo-lesson-rail projectNode
//    (design-2 §9 C4 #7)
// ---------------------------------------------------------------------------

describe("projectOrthoToCSS", () => {
  // The frozen helper math from e2e/demo-lesson-rail.spec.ts (lines 146–178):
  // halfH = max(diagonal·0.72, 1.4) over node bounds; center = bounds center.
  const railNodes = [
    { position: { x: -3, y: 1, z: 0 } },
    { position: { x: 0, y: 1, z: 0 } },
    { position: { x: 0, y: -1, z: 0 } },
    { position: { x: 3, y: -1, z: 0 } },
  ];

  function railProjectNode(
    canvasBox: { x: number; y: number; width: number; height: number },
    world: { x: number; y: number }
  ): { x: number; y: number } {
    const xs = railNodes.map((n) => n.position.x);
    const ys = railNodes.map((n) => n.position.y);
    const zs = railNodes.map((n) => n.position.z ?? 0);
    const diagonal = Math.hypot(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      Math.max(...zs) - Math.min(...zs)
    );
    const halfH = Math.max(diagonal * 0.72, 1.4);
    const halfW = halfH * (canvasBox.width / canvasBox.height);
    const len = Math.hypot(0, 0.55, 1);
    const dz = 1 / len;
    const ndcX = world.x / halfW;
    const ndcY = (dz * world.y) / halfH;
    return {
      x: canvasBox.x + ((ndcX + 1) / 2) * canvasBox.width,
      y: canvasBox.y + ((1 - ndcY) / 2) * canvasBox.height,
    };
  }

  it("matches the frozen projectNode math exactly (z = 0 content)", () => {
    const canvasBox = { x: 40, y: 20, width: 640, height: 480 };
    const xs = railNodes.map((n) => n.position.x);
    const ys = railNodes.map((n) => n.position.y);
    const zs = railNodes.map((n) => n.position.z ?? 0);
    const diagonal = Math.hypot(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      Math.max(...zs) - Math.min(...zs)
    );
    const halfH = Math.max(diagonal * 0.72, 1.4);
    for (const w of [
      { x: -3, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 3, y: -1 },
      { x: -1.5, y: 0.4 },
    ]) {
      const expected = railProjectNode(canvasBox, w);
      const actual = projectOrthoToCSS(
        { x: w.x, y: w.y, z: 0 },
        {
          center: { x: 0, y: 0, z: 0 },
          halfH,
          aspect: canvasBox.width / canvasBox.height,
          canvasBox,
        }
      );
      expect(actual.x).toBeCloseTo(expected.x, 10);
      expect(actual.y).toBeCloseTo(expected.y, 10);
    }
  });

  it("substracts the frame center and flips y into CSS pixels", () => {
    const out = projectOrthoToCSS(
      { x: 2, y: 1, z: 0 },
      {
        center: { x: 1, y: 0.5, z: 0 },
        halfH: 2,
        aspect: 2,
        canvasBox: { x: 0, y: 0, width: 400, height: 200 },
      }
    );
    // d = (1, 0.5); viewX = 1 → ndcX = 1/4 = 0.25.
    expect(out.x).toBeCloseTo(0 + ((0.25 + 1) / 2) * 400, 10);
    // viewY = vz·0.5 with vz = 1/|(0, 0.55, 1)|; ndcY = viewY/2.
    const vz = 1 / Math.hypot(0.55, 1);
    const viewY = vz * 0.5;
    expect(out.y).toBeCloseTo(0 + ((1 - viewY / 2) / 2) * 200, 10);
  });
});

// ---------------------------------------------------------------------------
// 8. Build-time content estimator — real graph shapes (F-12)
// ---------------------------------------------------------------------------

describe("contentAABBFromGraph", () => {
  it("includes node envelopes and the placed label sprite rects", () => {
    const g = graph([
      node("pn1", "process_node", -3, 0, 1, "Step 1"),
      node("pn2", "process_node", 0, 0, 1, "Step 2"),
      node("pn3", "process_node", 3, 0, 1, "Step 3"),
    ]);
    const aabb = contentAABBFromGraph(g);
    // Envelopes: ±3.5 (sphere r 0.5). Labels anchor above (cy = 0.746):
    // sprite box halfH 0.25 → top 0.996 < 1.0; text-measured halfW ≈ 0.33.
    expect(aabb.min.x).toBeCloseTo(-3.5, 5);
    expect(aabb.max.x).toBeCloseTo(3.5, 5);
    expect(aabb.min.y).toBeCloseTo(-0.5, 5);
    expect(aabb.max.y).toBeGreaterThan(0.9); // label sprite top
    expect(aabb.max.y).toBeLessThan(1.0);
    expect(aabb.max.z).toBeCloseTo(0.5, 5);
  });

  it("resolves nested group children to world positions", () => {
    const child = node("child", "sphere", 0, 1, 1);
    const g = graph([node("root", "group", 0, 10, 1, undefined, ["child"]), child]);
    const aabb = contentAABBFromGraph(g);
    expect(aabb.min.y).toBeCloseTo(10.5, 5);
    expect(aabb.max.y).toBeCloseTo(11.5, 5);
  });

  it("graph-mode variant plans against derived edges (no throw, same envelope span)", () => {
    const g: SceneGraph = {
      ...graph([
        node("a", "process_node", -3, 1, 1, "Cause A"),
        node("b", "process_node", 0, 1, 1, "Effect B"),
        node("c", "process_node", 0, -1, 1, "Effect C"),
        node("d", "process_node", 3, -1, 1, "Inhibited D"),
      ]),
      relationships: [
        { id: "r1", type: "causes", from: "a", to: "b" },
        { id: "r2", type: "activates", from: "b", to: "c" },
        { id: "r3", type: "inhibits", from: "c", to: "d" },
      ],
    };
    const aabb = contentAABBFromGraph(g, { graphMode: true });
    // a/d envelopes dominate the x span; the right-anchored c label and the
    // d label sprite extend beyond the node envelopes.
    expect(aabb.min.x).toBeCloseTo(-3.5, 5);
    expect(aabb.max.x).toBeGreaterThan(3.5); // d's above label sprite
    expect(aabb.min.y).toBeCloseTo(-1.5, 5);
    expect(aabb.max.y).toBeGreaterThan(1.5); // a/b label sprites above
  });

  it("empty / null graphs yield the zero extent", () => {
    expect(contentAABBFromGraph(null)).toEqual(contentExtentEmpty());
    expect(contentAABBFromGraph(graph([]))).toEqual(contentExtentEmpty());
  });

  it("P2-1: an engine mapping re-anchors mapped nodes to their mapping pivot (never the phantom spec position)", () => {
    // The orbit pattern: a "planet-system" group at spec (6,0,0) carrying the
    // planet mesh at local (6,0,0). The curated mapping folds the local child
    // offset (offsetX −6), so the anchored group pivot lands at (0,0,0) and
    // the planet at world (6,0,0) — the engine-anchored truth — instead of
    // the never-rendered spec world (12,0,0).
    const g = graph([
      node("planet-system", "group", 6, 0, 1, undefined, ["planet"]),
      node("planet", "sphere", 6, 0, 1.3, "Planet"),
    ]);
    const mapping: EngineMapping = {
      "planet-system": { body: "planet", scale: 0.04, offsetX: -6, offsetY: 0 },
    };
    const spec = contentAABBFromGraph(g);
    const anchored = contentAABBFromGraph(g, { engineMapping: mapping });
    // Spec positions stack the phantom: planet at world 12.
    expect(spec.max.x).toBeGreaterThan(12);
    // The anchored frame covers the engine-anchored planet at world 6.
    expect(anchored.max.x).toBeLessThan(7.5);
    expect(anchored.max.x).toBeGreaterThan(6.5);
    // Without a mapping the frame is unchanged (opt-in only).
    expect(contentAABBFromGraph(g, { engineMapping: null })).toEqual(spec);
  });
});

// ---------------------------------------------------------------------------
// 9. Engine dynamic extents (F-13, design-2 §3.1)
// ---------------------------------------------------------------------------

describe("dynamicExtentFromEngineState", () => {
  const mapping: EngineMapping = {
    planet: { body: "planet", scale: 2, offsetX: 1, offsetY: 3 },
    star: { body: "star", scale: 2 },
    fieldNode: { body: "@field", scale: 0.1, offsetX: -5, offsetY: 7 },
    surf: { body: "@surface", scale: 1 },
  };
  const g = graph([
    node("planet", "sphere", 0, 1.5, 1, "Planet"),
    node("star", "sphere", 0, 0, 2.4),
    node("fieldNode", "vector_field", 0, 0, 3),
  ]);
  const state: EngineVisualState = {
    bodies: {
      planet: { x: 2, y: -1 },
      star: { x: 0, y: 0 },
    },
    field: {
      vectors: [
        { x: 0, y: 0, ex: 0, ey: 5, magnitude: 5 },
        { x: 1, y: 1, ex: 0, ey: 1, magnitude: 1 },
      ],
      width: 4,
      height: 4,
      span: 4,
    },
  };

  it("maps engine bodies to world and inflates by the label reach", () => {
    const dyn = dynamicExtentFromEngineState(mapping, state, g);
    expect(dyn).not.toBeNull();
    const planet = dyn!.engineBodies!.find((b) => b.center.x === 5);
    expect(planet).toBeDefined();
    expect(planet!.center).toEqual({ x: 5, y: 1.5, z: 1 });
    // Body radius 0.5, but the placed "Planet" label (above anchor, sprite
    // halfH 0.25) reaches ≈ 0.996 above the body → the extent must cover it.
    expect(planet!.radius).toBeGreaterThan(0.9);
    const star = dyn!.engineBodies!.find((b) => b.center.x === 0);
    expect(star!.radius).toBeCloseTo(1.2, 10); // size 2.4 / 2, no label
  });

  it("bounds the engine field span (tick origins + max magnitude)", () => {
    const dyn = dynamicExtentFromEngineState(mapping, state, g);
    const fb = dyn!.engineFieldBounds!;
    // half = (span 4 + maxMag 5) · scale 0.1 = 0.9 around (−5, 7).
    expect(fb.min).toEqual({ x: -5.9, y: 0, z: 6.1 });
    expect(fb.max).toEqual({ x: -4.1, y: 0, z: 7.9 });
  });

  it("returns null without a mapping, a state, or any dynamic content", () => {
    expect(dynamicExtentFromEngineState(null, state, g)).toBeNull();
    expect(dynamicExtentFromEngineState(mapping, null, g)).toBeNull();
    expect(
      dynamicExtentFromEngineState({ ghost: { body: "nope", scale: 1 } }, state, g)
    ).toBeNull();
  });
});
