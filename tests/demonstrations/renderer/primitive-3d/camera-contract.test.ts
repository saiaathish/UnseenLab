/**
 * CAMERA CONTRACT tests — Wave 1 (red) / Wave 2 (green), TDD.
 *
 * Pins the reproduced camera failures from .superpowers/sdd/orbit-learning/
 * root-cause.md §3:
 *   C1/C2 — the default orbit frame is inflated by the camera-marker +
 *           ring's 12^3 box envelope: the orbit disc fills only ~6% of the
 *           screen (>94% dead space) and the planet is a sub-percent dot;
 *   C3     — `trailBounds` has NO producer: dynamicExtentFromEngineState
 *           never emits trail extents, so a live trajectory is not part of
 *           the frame decision and gets clipped by stale bounds;
 *   C4     — an escape must produce a controlled reframe that covers the
 *           escape trajectory (same missing producer);
 *   C5     — resize recomputes bounds (PIN — passes today, guards regression);
 *   C6     — the Reset-view button is not rendered for orbits at all (the
 *           stage gates the whole chrome behind `conceptual`), so the
 *           permanent userControlled latch can never be cleared (UI
 *           contract level).
 *
 * Pure decision-logic tests use camera.ts's Three.js-free functions; the C6
 * UI contract mocks the renderer barrel (no WebGL needed).
 */

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import {
  contentAABBFromGraph,
  contentExtentCenter,
  DEFAULT_FOV_DEG,
  dynamicExtentFromEngineState,
  maybeReframe,
  perspectiveDistance,
  type DynamicExtent,
} from "@/demonstrations/renderers/primitive-3d/camera";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";
import type { EngineVisualState } from "@/demonstrations/renderers/lumina-2d/types";
import { buildOrbitsShowcase } from "@/demonstrations/showcases/orbits/build-spec";
import { DemonstrationStage } from "@/components/demonstrations/demonstration-stage";
import { engineMappingFor } from "@/demonstrations/showcases/coupling";

// ---------------------------------------------------------------------------
// Orbit scene facts (showcase/orbits/build-spec.ts + coupling.ts)
// ---------------------------------------------------------------------------
const ORBIT_RADIUS = 6; // the engine orbit maps to world radius 6 (ring size 12)
const ORBITS_SCALE = 0.04; // 6 world units / 150 engine units
const ORBITS_ASPECT = 16 / 9;
const ORBIT_DISC_FRACTION_MIN = 0.2; // contract: the orbit disc fills >= 20% of the frame
const PLANET_FRAME_HEIGHT_MIN = 0.08; // contract: planet diameter >= 8% of frame height
const DEFAULT_ORBIT_POLAR = Math.PI / 3; // renderer orbit default (renderer.ts:295)

const ORBITS_MAPPING: EngineMapping = {
  star: { body: "star", scale: ORBITS_SCALE, offsetX: 0, offsetY: 0 },
  "planet-system": { body: "planet", scale: ORBITS_SCALE, offsetX: -6, offsetY: 0 },
};

function orbitGraph() {
  return buildSceneGraph(buildOrbitsShowcase()).graph;
}

/** The default orbit frame (front view, distance from the content AABB). */
function defaultOrbitFrame() {
  const graph = orbitGraph();
  const aabb = contentAABBFromGraph(graph, { graphMode: false });
  const distance = perspectiveDistance(aabb, DEFAULT_FOV_DEG, ORBITS_ASPECT);
  const halfH = distance * Math.tan((DEFAULT_FOV_DEG * Math.PI) / 360);
  return { graph, aabb, distance, halfH, center: contentExtentCenter(aabb) };
}

/**
 * Projected area fraction of the orbit disc (circle radius 6 in the x-z
 * plane) in the frame. The disc is seen at polar = DEFAULT_ORBIT_POLAR, so
 * the image-plane ellipse is 6 x 6*cos(polar); the frame is 2*halfH x
 * 2*halfH*aspect.
 */
function orbitDiscFrameFraction(halfH: number, aspect: number): number {
  const discArea = Math.PI * ORBIT_RADIUS * ORBIT_RADIUS * Math.cos(DEFAULT_ORBIT_POLAR);
  const frameArea = 4 * halfH * halfH * aspect;
  return discArea / frameArea;
}

/** Screen-space position of a world point relative to the frame center,
 * projected through the default orbit view basis (azimuth 0, polar pi/3). */
function projectScreenDelta(
  point: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number }
): { sx: number; sy: number } {
  const p = DEFAULT_ORBIT_POLAR;
  const f = { x: 0, y: Math.cos(p), z: Math.sin(p) }; // view dir (az 0)
  const xAxis = { x: 1, y: 0, z: 0 };
  const yAxis = {
    x: f.y * xAxis.z - f.z * xAxis.y,
    y: f.z * xAxis.x - f.x * xAxis.z,
    z: f.x * xAxis.y - f.y * xAxis.x,
  };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;
  return {
    sx: dx * xAxis.x + dy * xAxis.y + dz * xAxis.z,
    sy: dx * yAxis.x + dy * yAxis.y + dz * yAxis.z,
  };
}

// C6: the stage contract mocks the renderer barrel (no WebGL needed).
vi.mock("@/demonstrations/renderers/primitive-3d", () => {
  class MockPrimitiveSceneRenderer {
    constructor() {}
    setSpec() {}
    setEngineState() {}
    setPlaying() {}
    setSpeed() {}
    resetView() {}
    dispose() {}
  }
  return { PrimitiveSceneRenderer: MockPrimitiveSceneRenderer };
});

// ---------------------------------------------------------------------------
// CAMERA contracts
// ---------------------------------------------------------------------------

describe("camera contract (C1-C6)", () => {
  it("C1: the default orbit frame contains star + planet + a meaningful trajectory (orbit disc >= 20% of frame)", () => {
    const { graph, aabb, halfH, distance } = defaultOrbitFrame();

    // The frame must CONTAIN the canonical bodies (star at origin, planet on
    // the radius-6 orbit) — a frame that can't hold them is not a frame.
    expect(aabb.min.x).toBeLessThanOrEqual(0);
    expect(aabb.max.x).toBeGreaterThanOrEqual(6);
    expect(aabb.max.z).toBeGreaterThanOrEqual(6);

    // The reproduced failure (root cause §3): the camera-marker + ring box
    // inflate the AABB ~2x, so the orbit disc fills only ~6% of the screen.
    const fraction = orbitDiscFrameFraction(halfH, ORBITS_ASPECT);
    expect(fraction, `distance ${distance.toFixed(1)}, halfH ${halfH.toFixed(1)}, disc ${(fraction * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(
      ORBIT_DISC_FRACTION_MIN
    );
    void graph;
  });

  it("C2: at init no canonical body sits at the viewport edge — the planet projects to >= 8% of frame height", () => {
    const { aabb, halfH, center } = defaultOrbitFrame();
    const halfW = halfH * ORBITS_ASPECT;

    // (a) The planet (world diameter 1 at world (6,0,0)) must project to a
    // meaningful size — today it is a ~3% dot (root cause: "planet 0.58
    // degree dot" after grow-only zoom; sub-percent at init).
    const planetDiameterFraction = 1 / (2 * halfH);
    expect(planetDiameterFraction).toBeGreaterThanOrEqual(PLANET_FRAME_HEIGHT_MIN);

    // (b) The projected planet center stays inside the central 70% of the
    // frame (never at the edge at init).
    const { sx, sy } = projectScreenDelta({ x: 6, y: 0, z: 0 }, center);
    expect(Math.abs(sx)).toBeLessThanOrEqual(0.7 * halfW);
    expect(Math.abs(sy)).toBeLessThanOrEqual(0.7 * halfH);
    void aabb;
  });

  it("C3: the dynamic extent includes the trail (trailBounds has a producer)", () => {
    // Root cause §3: "trailBounds has no producer" — the trajectory of a
    // trail-bearing engine body never enters the frame decision, so the
    // path is clipped by stale bounds.
    const graph = orbitGraph();
    const state: EngineVisualState = {
      bodies: { star: { x: 0, y: 0 }, planet: { x: 150, y: 40 } },
    };
    const dyn = dynamicExtentFromEngineState(ORBITS_MAPPING, state, graph);
    expect(dyn).not.toBeNull();
    // Wave-2 seam: the extent must carry the mapped trail bbox of every
    // trail-bearing engine body (planet trailPoints=140, moon 80).
    expect(dyn!.trailBounds).toBeDefined();
    // The trail extent must cover the mapped body position (world z = 40*0.04).
    const covered = (dyn!.trailBounds ?? []).some(
      (b) => b.min.z <= 40 * ORBITS_SCALE && b.max.z >= 40 * ORBITS_SCALE
    );
    expect(covered).toBe(true);
  });

  it("C4: an escape produces a controlled reframe that covers the escape trajectory", () => {
    const graph = orbitGraph();
    const aabb = contentAABBFromGraph(graph, { graphMode: false });
    const initial = perspectiveDistance(aabb, DEFAULT_FOV_DEG, ORBITS_ASPECT);

    // An escaping body (engine y=500 -> world z=20, far beyond the orbit) —
    // the frame must grow to keep the ESCAPE TRAJECTORY in view.
    const state: EngineVisualState = {
      bodies: { star: { x: 0, y: 0 }, planet: { x: 150, y: 500 } },
    };
    const dyn = dynamicExtentFromEngineState(ORBITS_MAPPING, state, graph);
    expect(dyn).not.toBeNull();
    // Wave-2 seam: the escape trail (the path the learner watches) must be
    // part of the dynamic extent — today nothing produces it.
    expect(dyn!.trailBounds).toBeDefined();

    const result = maybeReframe({
      graphMode: false,
      aspect: ORBITS_ASPECT,
      fovDeg: DEFAULT_FOV_DEG,
      orbit: { userControlled: false, distance: initial },
      orthoBaseHalf: 5,
      content: aabb,
      dynamic: dyn,
    });
    // The controlled reframe grows the distance to cover the escape.
    expect(result).not.toBeNull();
    expect(result!.distance).toBeGreaterThan(initial);
  });

  it("C5: resize recomputes the bounds — the frame still covers the content at every aspect (PIN)", () => {
    // PIN (passes today — guards the regression): the frame is a function of
    // the current aspect; after a resize the new distance keeps the whole
    // content inside the frustum.
    const { aabb } = defaultOrbitFrame();
    const halfX = (aabb.max.x - aabb.min.x) / 2;
    const halfY = (aabb.max.y - aabb.min.y) / 2;
    for (const aspect of [16 / 9, 4 / 3, 1]) {
      const distance = perspectiveDistance(aabb, DEFAULT_FOV_DEG, aspect);
      const halfH = distance * Math.tan((DEFAULT_FOV_DEG * Math.PI) / 360);
      expect(halfH, `aspect ${aspect}`).toBeGreaterThanOrEqual(Math.max(halfX / aspect, halfY));
    }
  });

  it("C6: the Reset-view button is rendered for the orbit stage (verified_simulation)", () => {
    // Root cause §3: "the Reset-view button is NOT rendered for orbits
    // (non-conceptual gate)" — the stage gates the whole camera chrome
    // behind `conceptual` (demonstration-stage.tsx:381), so the permanent
    // userControlled latch can never be cleared by the learner. The
    // contract: an orbit stage exposes Reset view like any other stage.
    render(
      createElement(DemonstrationStage, {
        spec: buildOrbitsShowcase(),
        parameters: {},
        playing: true,
        speed: 1,
        resetSignal: 0,
        reducedMotion: false,
        readouts: [],
        onReadouts: () => {},
        visualState: {
          bodies: { star: { x: 0, y: 0 }, planet: { x: 150, y: 0 } },
        },
        engineMapping: engineMappingFor("orbits"),
      })
    );
    expect(
      screen.getByRole("button", { name: "Reset view" })
    ).toBeInTheDocument();
  });
});
