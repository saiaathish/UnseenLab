/**
 * TRAJECTORY CONTRACT tests — Wave 1 (red) / Wave 2 (green), TDD.
 *
 * Pins the reproduced trajectory failures from .superpowers/sdd/orbit-learning/
 * root-cause.md:
 *   1. a sphere carrying trailPoints>0 must build a world-space trail (today
 *      only kind "trail" does — visuals.ts:503), so every sphere-based test
 *      below fails at `rn.trail` being undefined;
 *   2. a re-aim/reset must clear the trail exactly once — today there is no
 *      clear path anywhere (zero resetTrail/clearTrail in the repo);
 *   3. an impossible sample jump must start a NEW segment, never connect —
 *      the ENGINE must emit the signal (EngineVisualState gains a `reaimed`
 *      epoch flag); the renderer breaks the segment when it flips;
 *   4. the trail must survive camera reframes and representation-tab
 *      switches (no clear on those paths);
 *   5. physics honesty: the engine never clamps (pin), the trail is an exact
 *      history, escapes stay open and are disclosed, prompts are truthful at
 *      the defaults, the reduced-motion promise holds.
 *
 * Uses the REAL three.js core (no WebGL touched — jsdom only needs the math
 * classes), matching edges.test.ts / visuals.test.ts.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createElement } from "react";
import { render } from "@testing-library/react";
import type { SceneGraph, SceneGraphNode } from "@/demonstrations/renderers/primitive-3d/types";
import type { RuntimeNode } from "@/demonstrations/renderers/primitive-3d/renderer";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";
import { buildVisual, type VisualContext } from "@/demonstrations/renderers/primitive-3d/visuals";
import { pushTrailPoint } from "@/demonstrations/renderers/primitive-3d/edges";
import { makeNodeState } from "@/demonstrations/renderers/primitive-3d/operators";
import {
  contentAABBFromGraph,
  dynamicExtentFromEngineState,
  maybeReframe,
  type DynamicExtent,
} from "@/demonstrations/renderers/primitive-3d/camera";
import { createOrbits } from "@/demonstrations/renderers/lumina-2d/engines/orbits";
import { VISUAL_STATE_INTERVAL } from "@/demonstrations/renderers/lumina-2d/runner";
import type { EngineVisualState } from "@/demonstrations/renderers/lumina-2d/types";
import type { SimContext } from "@/demonstrations/renderers/lumina-2d/types";
import { buildOrbitsShowcase } from "@/demonstrations/showcases/orbits/build-spec";
import { DemonstrationStage } from "@/components/demonstrations/demonstration-stage";
import { engineMappingFor } from "@/demonstrations/showcases/coupling";

// ---------------------------------------------------------------------------
// Wave-2 API (root-cause seam): export function clearTrail(trail: TrailRuntime): void
// — the single, atomic clear-on-re-aim path (root cause §2: "zero
// resetTrail/clearTrail" today). Loaded dynamically so the rest of this file
// still runs while the export is missing (red = clearTrail undefined).
// ---------------------------------------------------------------------------
type TrailRuntime = NonNullable<RuntimeNode["trail"]>;
let clearTrail: ((trail: TrailRuntime) => void) | undefined;

beforeAll(async () => {
  const edgesModule = (await import("@/demonstrations/renderers/primitive-3d/edges")) as unknown as {
    clearTrail?: (trail: TrailRuntime) => void;
  };
  clearTrail = edgesModule.clearTrail;
});

// P7: the stage contract mocks the renderer barrel (no WebGL needed).
vi.mock("@/demonstrations/renderers/primitive-3d", () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  class MockPrimitiveSceneRenderer {
    constructor() {
      calls.push({ method: "constructor", args: [] });
    }
    setSpec(...args: unknown[]) {
      calls.push({ method: "setSpec", args });
    }
    setEngineState(...args: unknown[]) {
      calls.push({ method: "setEngineState", args });
    }
    setPlaying(...args: unknown[]) {
      calls.push({ method: "setPlaying", args });
    }
    setSpeed(...args: unknown[]) {
      calls.push({ method: "setSpeed", args });
    }
    resetView() {
      calls.push({ method: "resetView", args: [] });
    }
    dispose() {}
    static get calls() {
      return calls;
    }
  }
  return { PrimitiveSceneRenderer: MockPrimitiveSceneRenderer };
});

// ---------------------------------------------------------------------------
// Fixtures (same shape as visuals.test.ts)
// ---------------------------------------------------------------------------

function node(
  id: string,
  kind: SceneGraphNode["kind"],
  position: { x: number; y: number; z: number },
  size = 1,
  trailPoints = 0
): SceneGraphNode {
  return {
    id,
    kind,
    label: undefined,
    position,
    size,
    color: "#5b8def",
    children: [],
    trailPoints,
    particleCount: 0,
    depth: 1,
  };
}

function makeContext(graph: SceneGraph): VisualContext {
  return {
    scene: new THREE.Scene(),
    graph,
    time: 0,
    graphMode: false,
    animationsByTarget: new Map(),
    engineMapping: null,
    engineState: null,
    engineFieldMaxMag: 0,
    trackDisposable: () => {},
    cloneMaterials: () => {},
    reasons: [],
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
    parent: null,
  };
  return { rn, holder };
}

function graphWithNodes(
  nodes: SceneGraphNode[],
  maxTrailPoints = 300
): SceneGraph {
  return {
    nodes,
    relationships: [],
    animations: [],
    background: "dark",
    limits: {
      maxObjects: nodes.length,
      particleLimit: 1500,
      maxTrailPoints,
      maxLabels: 25,
      maxRelationships: 100,
      maxGroupDepth: 4,
    },
  };
}

function sphereGraph(trailPoints: number, maxTrailPoints = 300): SceneGraph {
  return graphWithNodes(
    [
      node("star", "sphere", { x: 0, y: 0, z: 0 }, 2.4),
      node("planet", "sphere", { x: 6, y: 0, z: 0 }, 1, trailPoints),
    ],
    maxTrailPoints
  );
}

/** Move the holder and record the position as the next trail sample. */
function pushTo(rn: RuntimeNode, x: number, y: number, z: number): void {
  rn.group.position.set(x, y, z);
  pushTrailPoint(rn);
}

function bufferTriples(t: TrailRuntime): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < t.written; i++) {
    out.push([t.buffer[i * 3], t.buffer[i * 3 + 1], t.buffer[i * 3 + 2]]);
  }
  return out;
}

const ORBITS_MAPPING: EngineMapping = {
  star: { body: "star", scale: 0.04, offsetX: 0, offsetY: 0 },
  "planet-system": { body: "planet", scale: 0.04, offsetX: -6, offsetY: 0 },
};

const ORBITS_SPEC = buildOrbitsShowcase();

// ---------------------------------------------------------------------------
// TRAJECTORY contracts
// ---------------------------------------------------------------------------

describe("trajectory contract (T1-T12)", () => {
  it("T1: a sphere with trailPoints>0 builds a world-space trail; recorded order is preserved", () => {
    const graph = sphereGraph(4);
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);

    // The failing core (root cause §1): only kind "trail" builds trail state
    // today — a sphere with trailPoints>0 must build one (capacity = trailPoints).
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    expect(t.capacity).toBe(4);
    // F-18: the trail Line lives in the SCENE (world space), not the holder.
    expect(t.line.parent).toBe(ctx.scene);

    pushTo(rn, 1, 0, 0);
    pushTo(rn, 2, 0, 0);
    pushTo(rn, 3, 0, 0);
    expect(t.written).toBe(3);
    expect(bufferTriples(t)).toEqual([
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
  });

  it("T2: a re-aim/reset clears the trail exactly once (clearTrail exists and empties it)", () => {
    // A kind-"trail" node builds trail state TODAY — so this test isolates
    // the clear seam: the red is the MISSING clearTrail export (root
    // cause §2: "zero resetTrail/clearTrail" in the repo).
    const graph = graphWithNodes(
      [node("t", "trail", { x: 0, y: 0, z: 0 }, 1, 8)],
      300
    );
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "t");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    pushTo(rn, 1, 0, 0);
    pushTo(rn, 2, 0, 0);
    expect(t.written).toBe(2);

    // The intended API clears the ring buffer once per re-aim/reset signal
    // so the next push starts a fresh polyline (no old-last -> new-start
    // connector).
    expect(typeof clearTrail).toBe("function"); // Wave-2 API: clearTrail(trail)
    clearTrail!(t);
    expect(t.written).toBe(0);
    expect(t.last).toBeNull();
    // A cleared trail must not draw anything until the next sample.
    expect(t.geometry.drawRange.count).toBe(0);
  });

  it("T3: the trail survives a camera reframe (never cleared on the camera path)", () => {
    const graph = sphereGraph(8);
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    pushTo(rn, 1, 0, 0);
    pushTo(rn, 2, 0, 0);
    const before = Float32Array.from(t.buffer);

    // A grow-only reframe driven by engine extents must not touch the trail.
    const content = contentAABBFromGraph(graph, { graphMode: false });
    const result = maybeReframe({
      graphMode: false,
      aspect: 16 / 9,
      fovDeg: 50,
      orbit: { userControlled: false, distance: 10 },
      orthoBaseHalf: 5,
      content,
      dynamic: {
        engineBodies: [{ center: { x: 0, y: 0, z: 12 }, radius: 0.5 }],
      } satisfies DynamicExtent,
    });
    expect(result).not.toBeNull();
    expect(result!.distance).toBeGreaterThan(10);
    // The recorded history is untouched by the reframe.
    expect(t.written).toBe(2);
    expect(Array.from(t.buffer)).toEqual(Array.from(before));
  });

  it("T4: the trail survives a representation-tab switch / non-re-aim state push", () => {
    const graph = sphereGraph(8);
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    pushTo(rn, 1, 0, 0);
    pushTo(rn, 2, 0, 0);

    // A tab switch re-pushes the same engine state (no re-aim): the extent
    // machinery must NOT clear the history.
    const state: EngineVisualState = {
      bodies: { star: { x: 0, y: 0 }, planet: { x: 150, y: 40 } },
    };
    dynamicExtentFromEngineState(ORBITS_MAPPING, state, graph);
    expect(t.written).toBe(2);
    expect(t.line.parent).toBe(ctx.scene);
  });

  it("T5: the ENGINE emits a reaimed/epoch flag when a re-aim teleports the body", () => {
    const module = createOrbits();
    const ctx: SimContext = { width: 800, height: 600, dpr: 1, time: 0 };
    module.init(ctx);
    for (let i = 0; i < 30; i++) module.step(1 / 60);

    // Wave-2 API (root-cause seam): EngineVisualState gains a `reaimed`
    // boolean (or an epoch counter) set by the engine whenever placeBodies()
    // teleports the body (setParameter of any non-g key, reset, drag release).
    type ReaimedVisualState = EngineVisualState & { reaimed?: boolean };
    const before = module.getVisualState!() as ReaimedVisualState;
    expect(before.reaimed).toBeFalsy(); // steady-state frames carry no flag

    // Any non-g parameter change re-aims (placeBodies — orbits.ts:263): the
    // visual state emitted right after MUST flag the discontinuity so the
    // renderer can start a new segment instead of connecting.
    module.setParameter("speed", 1.2);
    const after = module.getVisualState!() as ReaimedVisualState;
    expect(after.reaimed).toBe(true);
  });

  it("T6: trail capacity respects the maxTrailPoints budget (capacity cap)", () => {
    const graph = graphWithNodes(
      [node("t", "trail", { x: 0, y: 0, z: 0 }, 1, 500)],
      300 // maxTrailPoints
    );
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "t");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    // Capacity must never exceed the scene's trail budget.
    expect(rn.trail!.capacity).toBeLessThanOrEqual(300);
  });

  it("T7: downsampling (ring wrap) preserves the endpoints", () => {
    const graph = sphereGraph(4); // capacity 4
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    for (let x = 1; x <= 7; x++) pushTo(rn, x, 0, 0);
    // After the wrap the OLDEST retained point and the NEWEST point survive:
    // the polyline keeps the first retained sample (x=4) and the newest (x=7).
    const pts = bufferTriples(t);
    expect(pts[0]).toEqual([4, 0, 0]);
    expect(pts[pts.length - 1]).toEqual([7, 0, 0]);
  });

  it("T8: no accidental last->first closure after a re-aim (segment break)", () => {
    // A kind-"trail" node builds trail state TODAY — the red is the MISSING
    // clearTrail export (the segment-break seam), not the sphere-trail core.
    const graph = graphWithNodes(
      [node("t", "trail", { x: 0, y: 0, z: 0 }, 1, 8)],
      300
    );
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "t");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    pushTo(rn, 1, 0, 0);
    pushTo(rn, 2, 0, 0);
    pushTo(rn, 3, 0, 0);

    // A re-aim teleports the body (e.g. to x=20): the clear must drop the
    // pre-jump last point so the next push cannot draw a straight connector
    // (the "teleport connector" — root cause §2 primary mechanism).
    expect(typeof clearTrail).toBe("function"); // Wave-2 API: clearTrail(trail)
    clearTrail!(t);
    expect(t.written).toBe(0);
    expect(t.last).toBeNull();
    pushTo(rn, 20, 0, 0);
    expect(t.written).toBe(1);
    expect(bufferTriples(t)).toEqual([[20, 0, 0]]);
  });

  it("T9: an escape trajectory remains open (never closes back to the star)", () => {
    const graph = sphereGraph(16);
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    // Escape samples: radius grows monotonically 6 -> 21.3.
    for (const [x, z] of [
      [6, 0],
      [7, 2],
      [9, 5],
      [12, 9],
      [16, 14],
    ]) {
      pushTo(rn, x, 0, z);
    }
    const pts = bufferTriples(t);
    const radius = (p: [number, number, number]) => Math.hypot(p[0], p[2]);
    const first = radius(pts[0]);
    const last = radius(pts[pts.length - 1]);
    // The escape path must stay open: the newest sample is the farthest out,
    // and no later sample swings back inside the first sample's radius.
    expect(last).toBeGreaterThan(first);
    const maxR = Math.max(...pts.map(radius));
    expect(radius(pts[pts.length - 1])).toBe(maxR);
  });

  it("T10: a bound orbit is not force-closed (no closing segment)", () => {
    const graph = sphereGraph(8);
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    for (const [x, z] of [
      [6, 0],
      [0, 6],
      [-6, 0],
      [0, -6],
    ]) {
      pushTo(rn, x, 0, z);
    }
    // Exactly the four sampled points: the polyline must NOT append a
    // duplicate of the first point to close the ring (truthful history).
    expect(t.written).toBe(4);
    expect(bufferTriples(t)).toEqual([
      [6, 0, 0],
      [0, 0, 6],
      [-6, 0, 0],
      [0, 0, -6],
    ]);
  });

  it("T11: engine body positions are never clamped (clamp path unreachable for engine-owned nodes)", () => {
    // PIN (passes today — the invariant already holds; guards the regression):
    // (a) the extent mapper maps engine units 1:1 with no world-boundary
    // clamp — an extreme escape body (y=4000) lands exactly at z=160.
    const graph = sphereGraph(0);
    const state: EngineVisualState = {
      bodies: { star: { x: 0, y: 0 }, planet: { x: 150, y: 4000 } },
    };
    const dyn = dynamicExtentFromEngineState(ORBITS_MAPPING, state, graph);
    expect(dyn).not.toBeNull();
    const body = dyn!.engineBodies!.find((b) => b.center.z > 100)!;
    expect(body.center.x).toBe(-6 + 150 * 0.04);
    expect(body.center.z).toBe(4000 * 0.04);
    // (b) the engine itself never clamps an escaping body back inside the
    // world: at speed 3.0 the body distance keeps growing past 150.
    const module = createOrbits();
    const ctx: SimContext = { width: 800, height: 600, dpr: 1, time: 0 };
    module.init(ctx);
    module.setParameter("speed", 3);
    let maxDist = 0;
    for (let i = 0; i < 600; i++) {
      module.step(1 / 60);
      const s = module.getVisualState!()!;
      const p = s.bodies!.planet;
      maxDist = Math.max(maxDist, Math.hypot(p.x, p.y));
    }
    expect(maxDist).toBeGreaterThan(150);
  });

  it("T12: the renderer receives the same position as the engine snapshot (trail endpoint agrees)", () => {
    const graph = sphereGraph(8);
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    // Engine snapshot at (150, 90) maps to world (-6+150*0.04, 0, 90*0.04).
    const mapped = { x: -6 + 150 * 0.04, y: 0, z: 90 * 0.04 };
    pushTo(rn, mapped.x, mapped.y, mapped.z);
    // The trail's last sample must equal the mapped snapshot exactly — the
    // renderer and the trail agree on the engine position (no lag/offset).
    expect(bufferTriples(t)[0]).toEqual([mapped.x, mapped.y, mapped.z]);
  });
});

// ---------------------------------------------------------------------------
// PHYSICS HONESTY contracts (unit-testable subset)
// ---------------------------------------------------------------------------

describe("physics honesty contract (P1-P7)", () => {
  it("P1: the trail is an exact history — no interpolated or predicted points", () => {
    const graph = sphereGraph(8);
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    pushTo(rn, 0, 0, 0);
    pushTo(rn, 5, 0, 0);
    // A 5-unit jump between samples must record exactly two points — the
    // trail shows where the body WAS, never a faked/filled connector.
    expect(t.written).toBe(2);
    expect(bufferTriples(t)).toEqual([
      [0, 0, 0],
      [5, 0, 0],
    ]);
  });

  it("P2: escape is real at the engine level — never faked into a bound orbit (PIN)", () => {
    // PIN (passes today — engine physics are verified): launch speed >= sqrt(2)
    // is a TRUE escape; the body distance grows well past the launch radius.
    const module = createOrbits();
    const ctx: SimContext = { width: 800, height: 600, dpr: 1, time: 0 };
    module.init(ctx);
    module.setParameter("speed", 2);
    const distances: number[] = [];
    for (let i = 0; i < 1200; i++) {
      module.step(1 / 60);
      if (i % 120 === 0) {
        const p = module.getVisualState!()!.bodies!.planet;
        distances.push(Math.hypot(p.x, p.y));
      }
    }
    // Escaped: strictly beyond the 150-unit launch radius and still growing.
    expect(Math.max(...distances)).toBeGreaterThan(250);
    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0]);
  });

  it("P3: the escape regime is disclosed in the spec's trust limitations", () => {
    // The curated UI caps Launch speed at 1.2, but the adapted/offline path
    // exposes up to 3.0 (engine-builder.ts:45) — above sqrt(2), a real escape.
    // Honesty: the learner-facing limitations must disclose it (root cause §2
    // "Must be LABELED, never faked").
    const limitations = ORBITS_SPEC.trust.limitations.join(" ");
    expect(limitations).toMatch(/escape|flung|leave the system/i);
  });

  it("P5: the 3D trail capacity covers a full orbital period at the emission interval", () => {
    // Engine period at the curated defaults is 3.85 s (root cause §3); the
    // renderer receives a canonical snapshot every VISUAL_STATE_INTERVAL.
    // 140 samples must therefore cover >= one full revolution.
    const graph = sphereGraph(140);
    const ctx = makeContext(graph);
    const { rn, holder } = makeRuntime(graph, "planet");
    buildVisual(ctx, rn, rn.graph, holder);
    expect(rn.trail).toBeDefined();
    const t = rn.trail!;
    const historyS = t.capacity * VISUAL_STATE_INTERVAL;
    expect(historyS).toBeGreaterThanOrEqual(3.85);
  });

  it("P6: observation prompts are truthful at the default parameters", () => {
    // At the curated defaults (eccentricity 0) the orbit is CIRCULAR, so the
    // planet's speed is constant — prompt 1's "fastest at closest approach"
    // is false at defaults (root cause §6, misinformation flag A13).
    const prompt = ORBITS_SPEC.observationPrompts[0]?.prompt ?? "";
    expect(prompt).not.toMatch(/fastest at closest approach/i);
  });

  it("P7: the reduced-motion promise holds — the stage pauses continuous motion", async () => {
    const module = (await import("@/demonstrations/renderers/primitive-3d")) as unknown as {
      PrimitiveSceneRenderer: { calls: Array<{ method: string; args: unknown[] }> };
    };
    module.PrimitiveSceneRenderer.calls.length = 0;
    render(
      createElement(DemonstrationStage, {
        spec: ORBITS_SPEC,
        parameters: {},
        playing: true, // the page forces playing=true unconditionally (page:235)
        speed: 1,
        resetSignal: 0,
        reducedMotion: true, // ...but the learner asked for reduced motion
        readouts: [],
        onReadouts: () => {},
        visualState: {
          bodies: { star: { x: 0, y: 0 }, planet: { x: 150, y: 0 } },
        },
        engineMapping: engineMappingFor("orbits"),
      })
    );
    const setPlaying = module.PrimitiveSceneRenderer.calls.filter(
      (c) => c.method === "setPlaying"
    );
    expect(setPlaying.length).toBeGreaterThan(0);
    // Root cause §6: "Reduced-motion promise is FALSE (playing=true
    // unconditional)". The stage must not keep the coupled 3D scene moving.
    expect(setPlaying[setPlaying.length - 1].args[0]).toBe(false);
  });
});
