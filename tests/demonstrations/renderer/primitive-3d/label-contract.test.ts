/**
 * LABEL CONTRACT tests — Wave 1 (red) / Wave 2 (green), TDD.
 *
 * Pins the reproduced label failures from .superpowers/sdd/orbit-learning/
 * root-cause.md §4:
 *   L1/L12 — glyphs are 5.6-11.2 CSS px at desktop (moon 2.9px; mobile
 *            1.4-6.9px), 2-8x below the readable floor;
 *   L7      — full label replan EVERY frame (zero hysteresis), must be
 *            time-throttled to <= 4 Hz during continuous motion;
 *   L8      — zero hysteresis -> anchor flips; anchors must be sticky while
 *            the previous anchor remains collision-free;
 *   L9      — deterministic placement (frozen regression pin, passes today);
 *   L6      — a hidden/degraded object must produce no orphan label.
 *
 * Pure-geometry tests never touch Three.js objects; the runtime-overlay
 * tests pass structural fakes (group with getWorldPosition + sprite with
 * position.set), exactly as labels.test.ts does.
 */

import { describe, expect, it } from "vitest";
import type { SceneGraph, SceneGraphNode } from "@/demonstrations/renderers/primitive-3d/types";
import type { RuntimeNode } from "@/demonstrations/renderers/primitive-3d/renderer";
import type { Vec3 } from "@/demonstrations/spec/demo-spec";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  buildLabelSprite,
  planNodeLabels,
  updateLabelOverlays,
  type LabelContext,
  type LabelOverlay,
} from "@/demonstrations/renderers/primitive-3d/labels";
import { GLYPH_HALF_H_NODE } from "@/demonstrations/renderers/primitive-3d/presentation/constants";
import { buildOrbitsShowcase } from "@/demonstrations/showcases/orbits/build-spec";

// ---------------------------------------------------------------------------
// The default orbit frame (mission brief): distance ~35.8, halfH 16.68 —
// the CURRENT (inflated) frame the orbit demo renders at. Label contracts
// are pinned AT this frame so Wave 2 must make glyphs screen-constant
// instead of relying on a tighter camera.
// ---------------------------------------------------------------------------
const DEFAULT_ORBIT_HALF_H = 16.68;
const DESKTOP_VIEWPORT_H = 720; // 1280x720 canvas
const MOBILE_VIEWPORT_W = 320; // smallest supported viewport (320px overflow pin)
const MOBILE_VIEWPORT_H = 180; // 16/9 aspect
const MIN_DESKTOP_GLYPH_PX = 14;
const MIN_MOBILE_GLYPH_PX = 12;

/**
 * Projected CSS px of a label glyph at the orbit frame: the glyph's world
 * height maps through the visible half-height (halfH) to the viewport.
 */
function projectedGlyphPx(glyphWorldH: number, viewportH: number): number {
  return (glyphWorldH / (2 * DEFAULT_ORBIT_HALF_H)) * viewportH;
}

/** Primary labels of the orbit scene (star/planet/moon — the canonical
 * bodies; the ring and the camera-marker are secondary chrome). */
function primaryOrbitLabels(): Array<{ id: string; size: number }> {
  const graph = buildSceneGraph(buildOrbitsShowcase()).graph;
  return graph.nodes
    .filter((n) => n.label !== undefined && ["sphere"].includes(n.kind))
    .map((n) => ({ id: n.id, size: n.size }));
}

// ---------------------------------------------------------------------------
// Runtime-overlay fakes (same shape as labels.test.ts §5)
// ---------------------------------------------------------------------------

function fakeGroup(position: Vec3) {
  return {
    position: { ...position },
    getWorldPosition(target: { set(x: number, y: number, z: number): unknown }) {
      return target.set(this.position.x, this.position.y, this.position.z);
    },
  };
}

function makeOverlay(nodeId: string, position: Vec3): LabelOverlay {
  return {
    nodeId,
    rn: { group: fakeGroup(position) } as unknown as LabelOverlay["rn"],
    sprite: {
      position: {
        set: () => undefined,
      },
    } as unknown as LabelOverlay["sprite"],
    material: null as unknown as LabelOverlay["material"],
    texture: null as unknown as LabelOverlay["texture"],
    plan: null,
    base: { ...position },
  };
}

function makeContext(
  graph: SceneGraph,
  overlays: LabelOverlay[],
  runtime: Map<string, { group: ReturnType<typeof fakeGroup> }>
): LabelContext {
  return {
    graph,
    graphMode: false,
    scene: null,
    labels: overlays,
    runtime: runtime as unknown as LabelContext["runtime"],
    edgePlans: [],
    trackDisposable: () => {},
  };
}

// The orbit-family fixture: star + ring guide + planet (id order matches the
// renderer: orbit-path-planet < planet < star).
function orbitFamilyGraph(planetX: number): SceneGraph {
  return {
    nodes: [
      {
        id: "orbit-path-planet",
        kind: "orbit_path",
        label: "Default orbit guide",
        position: { x: 0, y: 0, z: 0 },
        size: 12,
        color: "#64748b",
        children: [],
        trailPoints: 0,
        particleCount: 0,
        depth: 1,
      },
      {
        id: "planet",
        kind: "sphere",
        label: "Planet",
        position: { x: planetX, y: 0, z: 0 },
        size: 1,
        color: "#67e8f9",
        children: [],
        trailPoints: 0,
        particleCount: 0,
        depth: 1,
      },
      {
        id: "star",
        kind: "sphere",
        label: "Star",
        position: { x: 0, y: 0, z: 0 },
        size: 2.4,
        color: "#ffd166",
        children: [],
        trailPoints: 0,
        particleCount: 0,
        depth: 1,
      },
    ],
    relationships: [],
    animations: [],
    background: "dark",
    limits: {
      maxObjects: 3,
      particleLimit: 1500,
      maxTrailPoints: 300,
      maxLabels: 25,
      maxRelationships: 100,
      maxGroupDepth: 4,
    },
  };
}

function overlayRuntime(
  graph: SceneGraph,
  planetPosition: Vec3
): { ctx: LabelContext; planetOverlay: LabelOverlay } {
  // ONE shared underlying group per node: the overlay's rn.group and the
  // runtime-map entry's group must be the same object — updateLabelOverlays
  // reads the overlay's group for the movement check and the runtime's
  // `{ group }` record for the replan positions.
  const shared = new Map<string, ReturnType<typeof fakeGroup>>();
  for (const n of graph.nodes) {
    shared.set(
      n.id,
      fakeGroup(n.id === "planet" ? { ...planetPosition } : { ...n.position })
    );
  }
  const runtime = new Map<string, { group: ReturnType<typeof fakeGroup> }>();
  for (const n of graph.nodes) runtime.set(n.id, { group: shared.get(n.id)! });
  const overlays = graph.nodes
    .filter((n) => n.label !== undefined)
    .map((n) => {
      const overlay = makeOverlay(n.id, { ...n.position });
      overlay.rn = { group: shared.get(n.id)! } as unknown as LabelOverlay["rn"];
      return overlay;
    });
  const ctx = makeContext(graph, overlays, runtime);
  return { ctx, planetOverlay: overlays.find((o) => o.nodeId === "planet")! };
}

// ---------------------------------------------------------------------------
// LABEL contracts
// ---------------------------------------------------------------------------

describe("label contract (L1-L12)", () => {
  it("L1: every primary label's projected glyph is >= 14 CSS px at the default orbit frame", () => {
    // Root cause §4: glyphs project to 5.6-11.2 px at desktop (moon 2.9 px).
    // The glyph world height is 2 * GLYPH_HALF_H_NODE * min(size, 2).
    for (const { id, size } of primaryOrbitLabels()) {
      const glyphWorldH = 2 * GLYPH_HALF_H_NODE * Math.min(size, 2);
      const px = projectedGlyphPx(glyphWorldH, DESKTOP_VIEWPORT_H);
      expect(px, `label ${id} (size ${size}) projects to ${px.toFixed(1)}px`).toBeGreaterThanOrEqual(
        MIN_DESKTOP_GLYPH_PX
      );
    }
  });

  it("L12: the mobile viewport (320px wide) still keeps glyphs readable (>= 12px)", () => {
    // Root cause §4: mobile glyphs are 1.4-6.9 px. The 320px-wide viewport is
    // a frozen support floor — glyphs must not collapse below readability.
    void MOBILE_VIEWPORT_W; // width is the pinned floor; projection uses height
    for (const { id, size } of primaryOrbitLabels()) {
      const glyphWorldH = 2 * GLYPH_HALF_H_NODE * Math.min(size, 2);
      const px = projectedGlyphPx(glyphWorldH, MOBILE_VIEWPORT_H);
      expect(px, `label ${id} at 320px projects to ${px.toFixed(1)}px`).toBeGreaterThanOrEqual(
        MIN_MOBILE_GLYPH_PX
      );
    }
  });

  it("L6: a hidden object produces no orphan label (no plan, no overlay)", () => {
    // Wave-2 API (root-cause seam): the scene-graph node gains an additive
    // `hidden?: boolean` (visibility contract; spec wire shape additive-only).
    const graph = orbitFamilyGraph(6);
    const hiddenNode = graph.nodes.find((n) => n.id === "planet") as SceneGraphNode;
    Object.assign(hiddenNode, { hidden: true });

    // Placement must not plan a label for the hidden object.
    const { plans } = planNodeLabels(graph);
    expect(plans.some((p) => p.nodeId === "planet")).toBe(false);

    // And the sprite builder must not create an overlay for it (orphan label =
    // a sprite with no plan floating at a stale position).
    const overlays: LabelOverlay[] = [];
    const ctx = makeContext(graph, overlays, new Map());
    const rn = {
      graph: hiddenNode,
      group: { position: { x: 6, y: 0, z: 0 } },
      owned: [],
    } as unknown as RuntimeNode;
    buildLabelSprite(ctx, rn, hiddenNode);
    expect(overlays.some((o) => o.nodeId === "planet")).toBe(false);
  });

  it("L7: during continuous motion, full replans are throttled to <= 4 Hz", () => {
    // Root cause §4: the planet moves 0.163 world/frame — 3.3x the 0.05
    // replace threshold — so today updateLabelOverlays re-plans EVERY frame.
    const graph = orbitFamilyGraph(6);
    const { ctx, planetOverlay } = overlayRuntime(graph, { x: 6, y: 0, z: 0 });
    const planetGroup = (
      ctx.runtime.get("planet") as { group: { position: Vec3 } }
    ).group;

    let replans = 0;
    let lastPlan: NonNullable<LabelOverlay["plan"]> | null = null;
    for (let frame = 0; frame < 60; frame++) {
      planetGroup.position.x += 0.163; // one engine-driven frame of motion
      updateLabelOverlays(ctx, 1 / 60);
      if (planetOverlay.plan !== lastPlan) {
        replans++; // a replan installs a fresh plan object
        lastPlan = planetOverlay.plan;
      }
    }
    // One simulated second of continuous motion: at most 4 full replans
    // (a 4 Hz cap — anything faster flips anchors mid-sentence).
    expect(replans).toBeLessThanOrEqual(4);
  });

  it("L8: anchors are sticky — no flip while the previous anchor remains collision-free", () => {
    // The ring guide's 12^3 envelope blocks the planet's "above" anchor while
    // the planet is inside it (|x| < 6.15), so at x=6.2 the free anchor is
    // "right". At x=6.6 "above" becomes free too — but "right" is STILL
    // collision-free, so the sticky contract keeps "right". Today the replan
    // re-picks from scratch: right -> above (the reproduced ~27px flip).
    const graph = orbitFamilyGraph(6.2);
    const { ctx, planetOverlay } = overlayRuntime(graph, { x: 6.2, y: 0, z: 0 });

    updateLabelOverlays(ctx, 0);
    const firstAnchor = planetOverlay.plan?.anchor;
    expect(firstAnchor).toBeDefined();

    const planetGroup = (
      ctx.runtime.get("planet") as { group: { position: Vec3 } }
    ).group;
    planetGroup.position.x = 6.6; // still continuous motion, still a replan
    updateLabelOverlays(ctx, 0);

    expect(planetOverlay.plan?.anchor).toBe(firstAnchor);
  });

  it("L9: placement is deterministic — identical inputs produce identical plans (PIN)", () => {
    // Frozen regression pin (root-cause regression list: "labels determinism"):
    // planNodeLabels is a pure function of the graph — same input, same plans.
    const graph = orbitFamilyGraph(6);
    const a = planNodeLabels(graph).plans;
    const b = planNodeLabels(graph).plans;
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    for (const plan of a) {
      expect(plan.anchor).toBeTruthy();
    }
  });
});
