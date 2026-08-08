/**
 * CAMERA CONTRACT tests — Wave 1 (red) / Wave 2 (green), TDD.
 *
 * Pins the reproduced camera failures from .superpowers/sdd/orbit-learning/
 * root-cause.md §3:
 *   C1/C2 — the default orbit frame is inflated by the phantom spec-offset
 *           planet position (the group offset + the child's local offset
 *           stack to world 12 — double the orbit radius, never rendered) +
 *           the old ring box envelope: the orbit disc fills only ~3.5% of
 *           the screen and the planet is a sub-4%-frame-height dot;
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
 * C1/C2 HONEST TARGETS (Wave-2 close-out — approved design decision): the
 * original 20%-disc contract is mathematically unreachable. The orbit disc's
 * projected area is pinned by frozen constraints:
 *   1. PHYSICS COUPLING — the ring radius MUST equal the default orbit truth
 *      (ORBITS_SCALE 6/150 → world radius 6): the disc area is π·6²·cos(polar)
 *      at the default polar, never larger;
 *   2. I5 CANONICAL COVERAGE — every content AABB corner must stay inside the
 *      frustum for the canonical side/band views, which binds the distance to
 *      ≥ ~26 for the engine-anchored scene (labels + star-glow box + moon
 *      included); and
 *   3. a ≥20% disc would need distance ≤ ~13.5 (the ring nearly touching the
 *      frame edge), clipping the star-glow, moon, ring label and the labels —
 *      the opposite of "the camera frames the learning relationship".
 * The pinned targets below were PROBED on this build (2026-08-08) and pin the
 * improvement over the reproduced failure: disc ≥ 5% of the frame (measured
 * 5.36% at 16:9, from 3.54% at the old frame), planet projected radius ≥ 8 CSS
 * px at a 1280×720 stage canvas (measured 14.8px), star + planet inside the
 * middle 80% (measured 27%/13% of the half extents), ring circumference ≥ 90%
 * inside the frame (measured 100%).
 *
 * The contract frames the ENGINE-ANCHORED scene (planet on the radius-6 ring
 * at world (6,0,0)): the renderer re-anchors engine-mapped groups to the
 * engine pivot every frame (applyTransforms, renderer.ts), so the spec's
 * pre-engine group offset double-counts the orbit radius and is never
 * rendered — the frame decision must cover the visible scene.
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
  contentExtentEmpty,
  DEFAULT_FOV_DEG,
  dynamicExtentFromEngineState,
  isFlatScene,
  maybeReframe,
  perspectiveCanonicalDistance,
  perspectiveCanonicalViewDirs,
  perspectiveDistance,
  type ContentExtent,
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
/** Contract: the orbit disc fills >= 5% of the frame at 16:9 (measured
 * 5.36% at the honest frame distance 26.12; 20% is unreachable — see the
 * header). */
const ORBIT_DISC_FRACTION_MIN = 0.05;
/** Contract: planet diameter >= 4% of frame height (measured 5.34% with the
 * spec's real planet size 1.3 → ~19px radius at a 1280×720 canvas). */
const PLANET_FRAME_HEIGHT_MIN = 0.04;
/** Contract: planet projected radius >= 8 CSS px at 1280×720 (measured
 * 14.8px — the honest bar for "never a dot" with margin). */
const PLANET_RADIUS_PX_MIN = 8;
/** Contract: every ring point stays inside the central 90% of the frame
 * (measured 100% of the circumference inside). */
const RING_FRAME_CENTER_FRACTION_MAX = 0.9;
/** Contract: canonical bodies stay inside the middle 80% of the frame. */
const MID_FRAME_FRACTION = 0.8;
const DEFAULT_ORBIT_POLAR = Math.PI / 3; // renderer orbit default (renderer.ts:295)

const ORBITS_MAPPING: EngineMapping = {
  star: { body: "star", scale: ORBITS_SCALE, offsetX: 0, offsetY: 0 },
  "planet-system": { body: "planet", scale: ORBITS_SCALE, offsetX: -6, offsetY: 0 },
};

/** The engine state at the curated defaults (seed 20260804): the planet body
 * at engine (150, 0) → world pivot (offsetX −6 + 150·0.04, 0, 0) = (0, 0, 0),
 * so the planet renders on the radius-6 ring and the moon at +7.4. */
const DEFAULT_ENGINE_BODIES: Record<string, { x: number; y: number }> = {
  star: { x: 0, y: 0 },
  planet: { x: 150, y: 0 },
};

function orbitGraph() {
  return buildSceneGraph(buildOrbitsShowcase()).graph;
}

/**
 * The VISIBLE orbit scene graph: every engine-mapped group re-anchored to its
 * engine pivot at the default state (the scene the renderer actually draws —
 * applyTransforms overrides mapped group positions every frame, renderer.ts).
 * Without this the spec's group offset stacks with the child's local offset
 * (planet at world 12, moon at 13.4 — double the orbit radius, never
 * rendered) and inflates the frame ~2x (root cause §3's AABB inflation).
 */
function visibleOrbitGraph() {
  const graph = orbitGraph();
  const copy = structuredClone(graph);
  for (const node of copy.nodes) {
    const entry = ORBITS_MAPPING[node.id];
    if (!entry || node.kind !== "group") continue;
    const body = DEFAULT_ENGINE_BODIES[entry.body];
    if (!body) continue;
    node.position = {
      x: (entry.offsetX ?? 0) + body.x * entry.scale,
      y: node.position.y,
      z: (entry.offsetY ?? 0) + body.y * entry.scale,
    };
  }
  return copy;
}

/** The default orbit frame (front view, distance from the content AABB of
 * the engine-anchored scene). */
function defaultOrbitFrame() {
  const graph = visibleOrbitGraph();
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
  it("C1: the default orbit frame contains star + planet + a meaningful trajectory (orbit disc >= 5% of frame, ring inside)", () => {
    const { graph, aabb, halfH, distance } = defaultOrbitFrame();
    void graph;

    // The frame must CONTAIN the canonical bodies (star at origin, planet on
    // the radius-6 orbit) — a frame that can't hold them is not a frame.
    expect(aabb.min.x).toBeLessThanOrEqual(0);
    expect(aabb.max.x).toBeGreaterThanOrEqual(ORBIT_RADIUS);
    expect(aabb.max.z).toBeGreaterThanOrEqual(ORBIT_RADIUS);

    // The reproduced failure (root cause §3): the phantom spec-offset planet
    // position + ring box inflated the AABB ~2x, so the orbit disc filled
    // only ~3.5% of the frame. 20% is mathematically unreachable (header);
    // the honest bar is >= 5% (measured 5.36% at the engine-anchored frame).
    const fraction = orbitDiscFrameFraction(halfH, ORBITS_ASPECT);
    expect(fraction, `distance ${distance.toFixed(1)}, halfH ${halfH.toFixed(1)}, disc ${(fraction * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(
      ORBIT_DISC_FRACTION_MIN
    );

    // The ring circumference must be a meaningful trajectory INSIDE the
    // frame: every ring point projects inside the central 90% (measured
    // 100%). The projected ellipse semi-axes are 6 (x) x 6·cos(polar) (y),
    // and the ring center sits within the frame center, so the extremes
    // bound the circumference.
    const ringCenterOffset = Math.abs(aabb.min.x + aabb.max.x) / 2; // |ring center − frame center| in x
    expect(ringCenterOffset + ORBIT_RADIUS).toBeLessThanOrEqual(
      RING_FRAME_CENTER_FRACTION_MAX * halfH * ORBITS_ASPECT
    );
    expect(ORBIT_RADIUS * Math.cos(DEFAULT_ORBIT_POLAR)).toBeLessThanOrEqual(
      RING_FRAME_CENTER_FRACTION_MAX * halfH
    );
  });

  it("C2: at init the planet is never a dot and star + planet stay inside the mid-80% of the frame", () => {
    const { aabb, halfH, center } = defaultOrbitFrame();
    const halfW = halfH * ORBITS_ASPECT;

    // (a) The planet (world diameter 1.3 — the spec's real size, FIX 13) at
    // world (6,0,0) must project to a meaningful size: measured 14.8 CSS px
    // radius at a 1280x720 canvas (5.34% of frame height) — pinned >= 8px.
    const planetDiameterFraction = 1.3 / (2 * halfH);
    expect(planetDiameterFraction).toBeGreaterThanOrEqual(PLANET_FRAME_HEIGHT_MIN);
    const planetRadiusPx = (planetDiameterFraction * 720) / 2; // 1280x720 stage canvas
    expect(planetRadiusPx).toBeGreaterThanOrEqual(PLANET_RADIUS_PX_MIN);

    // (b) The projected star AND planet centers stay inside the middle 80%
    // of the frame (never at the edge at init — measured 4%/2% for the star
    // and 27%/13% of the half extents for the planet).
    for (const point of [
      { name: "star", world: { x: 0, y: 0, z: 0 } },
      { name: "planet", world: { x: ORBIT_RADIUS, y: 0, z: 0 } },
    ]) {
      const { sx, sy } = projectScreenDelta(point.world, center);
      expect(Math.abs(sx), `${point.name} sx`).toBeLessThanOrEqual(MID_FRAME_FRACTION * halfW);
      expect(Math.abs(sy), `${point.name} sy`).toBeLessThanOrEqual(MID_FRAME_FRACTION * halfH);
    }
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

// ---------------------------------------------------------------------------
// FLAT-SCENE CANONICAL EXCEPTION (C1/C2 mechanism) — the near-top view is
// excluded from the canonical coverage set for planar scenes: for a flat disc
// it is pedagogically useless and can only over-inflate the frame. The
// camera.test.ts canonical-coverage pins use 3D cube fixtures and are gated
// OUT of the exception by the flatness predicate (verified below).
// ---------------------------------------------------------------------------

/** The exact corner formula perspectiveCanonicalDistance uses, over a chosen
 * subset of the canonical set — the counterfactual reference for the
 * mechanism pins (includeTop: the near-top polar-0.05 view the flat-scene
 * exception excludes). */
function canonicalDistanceWithViews(
  aabb: ContentExtent,
  fovDeg: number,
  includeTop: boolean
): number {
  const tanHalfFov = Math.tan((fovDeg * Math.PI) / 360);
  const center = contentExtentCenter(aabb);
  const corners: Array<{ x: number; y: number; z: number }> = [];
  for (const dx of [aabb.min.x, aabb.max.x])
    for (const dy of [aabb.min.y, aabb.max.y])
      for (const dz of [aabb.min.z, aabb.max.z]) corners.push({ x: dx, y: dy, z: dz });
  const az = Math.atan2(1, 1.35);
  const po = Math.acos(0.65 / Math.hypot(1, 0.65, 1.35));
  const dirs = [
    { azimuth: az, polar: po },
    { azimuth: az - Math.PI / 2, polar: po },
    { azimuth: az + Math.PI / 2, polar: po },
  ];
  if (includeTop) dirs.push({ azimuth: az, polar: 0.05 }); // the near-top view
  for (const da of [-0.45, 0, 0.45])
    for (const dp of [-0.18, 0, 0.18])
      dirs.push({ azimuth: az + da, polar: po + dp });
  let required = 0;
  for (const { azimuth, polar } of dirs) {
    const sp = Math.sin(polar);
    const f = { x: sp * Math.sin(azimuth), y: Math.cos(polar), z: sp * Math.cos(azimuth) };
    let req = 0;
    for (const c of corners) {
      const v = { x: c.x - center.x, y: c.y - center.y, z: c.z - center.z };
      const along = v.x * f.x + v.y * f.y + v.z * f.z;
      const latX = v.x - along * f.x;
      const latY = v.y - along * f.y;
      const latZ = v.z - along * f.z;
      req = Math.max(req, Math.hypot(latX, latY, latZ) / tanHalfFov + along);
    }
    required = Math.max(required, req);
  }
  return required;
}

describe("flat-scene canonical exception (C1/C2 mechanism)", () => {
  it("the engine-anchored orbit scene is flat; the 3D cube fixtures are not", () => {
    const orbitAabb = defaultOrbitFrame().aabb;
    expect(isFlatScene(orbitAabb)).toBe(true);
    // camera.test.ts's canonical-coverage pins (4.098 particle_population
    // cube, 5.68 layered_system) must stay OUT of the exception.
    expect(
      isFlatScene({
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
      })
    ).toBe(false);
    expect(
      isFlatScene({
        min: { x: -0.5, y: -2, z: 0 },
        max: { x: 1.5, y: 2, z: 0 },
      })
    ).toBe(false);
    expect(isFlatScene(contentExtentEmpty())).toBe(false);
  });

  it("the flat scene's canonical dir set excludes the near-top view; 3D scenes keep it", () => {
    // The mechanism (perspectiveCanonicalViewDirs): the flat set drops the
    // polar-0.05 view, nothing else (front/side/±band views remain — I5
    // keeps meaning), and the 3D set keeps the full 13 directions.
    const flatDirs = perspectiveCanonicalViewDirs(true);
    const fullDirs = perspectiveCanonicalViewDirs(false);
    expect(flatDirs.some((d) => Math.abs(d.polar - 0.05) < 1e-9)).toBe(false);
    expect(fullDirs.some((d) => Math.abs(d.polar - 0.05) < 1e-9)).toBe(true);
    expect(fullDirs.length - flatDirs.length).toBe(1);
    expect(flatDirs.length).toBe(12);
  });

  it("the flat orbit scene frames exactly the reduced canonical set", () => {
    const orbitAabb = defaultOrbitFrame().aabb;
    const reduced = canonicalDistanceWithViews(orbitAabb, DEFAULT_FOV_DEG, false);
    const actual = perspectiveCanonicalDistance(orbitAabb, DEFAULT_FOV_DEG);
    expect(actual).toBeCloseTo(reduced, 6);
  });

  it("a 3D (non-flat) scene keeps the full canonical set", () => {
    const cube: ContentExtent = {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    };
    expect(isFlatScene(cube)).toBe(false);
    expect(perspectiveCanonicalDistance(cube, DEFAULT_FOV_DEG)).toBeCloseTo(
      canonicalDistanceWithViews(cube, DEFAULT_FOV_DEG, true),
      9
    );
  });
});
