/**
 * renderer-coupling tests — canonical-state coupling on the primitive-3d
 * renderer (Gate 3 remediation).
 *
 * Same mocked-'three' + fake-rAF pattern as primitive-3d.test.ts (jsdom has
 * no WebGL rasterizer). The stub's Geometry additionally generates a plane
 * grid so wave_surface vertices are inspectable.
 *
 * What is verified:
 *  - setEngineState moves a mapped object's mesh position by the scale
 *    mapping (engine (x, y) -> world (offsetX + x*scale, baseY, offsetY + y*scale)),
 *  - operator translation/orbit/oscillate/follow_path are SKIPPED for
 *    engine-owned objects while decorative rotation still runs,
 *  - setEngineState(null) restores operator-driven behavior,
 *  - unmapped objects / missing bodies stay operator-driven,
 *  - vector_field arrows are sampled from a fake field grid (direction +
 *    bounded length),
 *  - wave_surface heights are bilinearly sampled from a fake surface grid.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";
import { PrimitiveSceneRenderer } from "@/demonstrations/renderers/primitive-3d/renderer";

// ---------------------------------------------------------------------------
// Mock 'three' (hoisted so it applies to renderer.ts + materials.ts imports)
// ---------------------------------------------------------------------------

// The stub deliberately mirrors Three.js constructor signatures, so unused
// parameters (e.g. `_c`, `_w`) are expected here.
/* eslint-disable @typescript-eslint/no-unused-vars */
const threeStub = vi.hoisted(() => {
  const disposed: string[] = [];
  const groups: Array<{ name: string; children: unknown[]; position: unknown }> = [];

  class Color {
    r = 1;
    g = 1;
    b = 1;
    constructor(_c?: unknown) {}
    set(_c: unknown) {
      return this;
    }
    copy(c: Color) {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
      return this;
    }
  }

  class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    setScalar(s: number) {
      this.x = this.y = this.z = s;
      return this;
    }
    copy(v: Vector3) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    length() {
      return Math.hypot(this.x, this.y, this.z);
    }
    normalize() {
      const l = this.length() || 1;
      this.x /= l;
      this.y /= l;
      this.z /= l;
      return this;
    }
    addScaledVector(v: Vector3, s: number) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    }
  }

  class Euler {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }

  class Object3D {
    position = new Vector3();
    rotation = new Euler();
    scale = new Vector3(1, 1, 1);
    children: Object3D[] = [];
    name = "";
    up = new Vector3(0, 1, 0);
    add(o: Object3D) {
      this.children.push(o);
      return this;
    }
    remove(o: Object3D) {
      this.children = this.children.filter((c) => c !== o);
      return this;
    }
    updateMatrixWorld(_force?: boolean) {}
    getWorldPosition(target: Vector3) {
      return target.copy(this.position);
    }
    lookAt(_t: Vector3) {}
  }

  class BufferAttribute {
    array: Float32Array;
    itemSize: number;
    needsUpdate = false;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array instanceof Float32Array ? array : new Float32Array(array);
      this.itemSize = itemSize;
    }
    setXYZ(index: number, x: number, y: number, z: number) {
      this.array[index * 3] = x;
      this.array[index * 3 + 1] = y;
      this.array[index * 3 + 2] = z;
      return this;
    }
  }

  class BufferGeometry {
    attributes: Record<string, BufferAttribute> = {};
    setAttribute(name: string, attr: BufferAttribute) {
      this.attributes[name] = attr;
      return this;
    }
    setDrawRange(_start: number, _count: number) {
      return this;
    }
    dispose() {
      disposed.push("BufferGeometry");
    }
  }

  /**
   * Plane-like geometry: generates the position grid a real PlaneGeometry
   * would (so wave_surface vertices are real (x, y, 0) points). Other
   * geometry kinds get a harmless grid too — nothing inspects their shape.
   */
  class Geometry extends BufferGeometry {
    constructor(w = 1, h = 1, wSeg = 0, hSeg = 0) {
      super();
      const nx = Math.max(2, Math.round(wSeg) + 1);
      const ny = Math.max(2, Math.round(hSeg) + 1);
      const positions = new Float32Array(nx * ny * 3);
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const i = iy * nx + ix;
          positions[i * 3] = (ix / (nx - 1) - 0.5) * w;
          positions[i * 3 + 1] = (iy / (ny - 1) - 0.5) * h;
          positions[i * 3 + 2] = 0;
        }
      }
      this.setAttribute("position", new BufferAttribute(positions, 3));
    }
    dispose() {
      disposed.push("Geometry");
    }
  }

  class Material {
    color = new Color();
    transparent = false;
    opacity = 1;
    map: unknown = null;
    depthTest = true;
    depthWrite = true;
    size = 1;
    side = 0;
    emissive = new Color();
    emissiveIntensity = 0;
    clone() {
      const c = new (this.constructor as new () => Material)();
      c.color = this.color.copy(new Color());
      c.transparent = this.transparent;
      c.opacity = this.opacity;
      c.map = this.map;
      return c;
    }
    dispose() {
      disposed.push(this.constructor.name);
    }
  }
  class MeshBasicMaterial extends Material {}
  class MeshStandardMaterial extends Material {}
  class LineBasicMaterial extends Material {}
  class PointsMaterial extends Material {}
  class SpriteMaterial extends Material {}

  class CanvasTexture {
    colorSpace = "";
    dispose() {
      disposed.push("CanvasTexture");
    }
  }

  class Group extends Object3D {
    constructor() {
      super();
      groups.push(this as unknown as (typeof groups)[number]);
    }
  }
  class Scene extends Object3D {
    background: unknown = null;
  }
  class PerspectiveCamera extends Object3D {
    fov: number;
    aspect = 1;
    near: number;
    far: number;
    constructor(fov: number, aspect: number, near: number, far: number) {
      super();
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
    }
    updateProjectionMatrix() {}
  }
  class OrthographicCamera extends Object3D {
    left = 0;
    right = 0;
    top = 0;
    bottom = 0;
    near = 0;
    far = 0;
    updateProjectionMatrix() {}
  }
  class AmbientLight extends Object3D {
    constructor(_c?: unknown, _i = 1) {
      super();
    }
  }
  class DirectionalLight extends Object3D {
    constructor(_c?: unknown, _i = 1) {
      super();
    }
  }

  class Mesh extends Object3D {
    geometry: BufferGeometry;
    material: Material | Material[];
    constructor(geometry: BufferGeometry, material: Material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }
  class Line extends Mesh {}
  class LineSegments extends Mesh {}
  class Points extends Mesh {}
  class Sprite extends Object3D {
    material: Material;
    constructor(material: Material) {
      super();
      this.material = material;
    }
  }

  class WebGLRenderer {
    domElement = {};
    outputColorSpace = "";
    constructor(_params?: unknown) {}
    setPixelRatio(_dpr: number) {}
    setSize(_w: number, _h: number, _updateStyle?: boolean) {}
    render(_scene: unknown, _camera: unknown) {}
    dispose() {
      disposed.push("WebGLRenderer");
    }
  }

  const THREE = {
    Color,
    Vector3,
    Euler,
    BufferAttribute,
    BufferGeometry,
    SphereGeometry: Geometry,
    BoxGeometry: Geometry,
    PlaneGeometry: Geometry,
    RingGeometry: Geometry,
    CylinderGeometry: Geometry,
    ConeGeometry: Geometry,
    OctahedronGeometry: Geometry,
    MeshBasicMaterial,
    MeshStandardMaterial,
    LineBasicMaterial,
    PointsMaterial,
    SpriteMaterial,
    CanvasTexture,
    Group,
    Scene,
    PerspectiveCamera,
    OrthographicCamera,
    AmbientLight,
    DirectionalLight,
    Object3D,
    Mesh,
    Line,
    LineSegments,
    Points,
    Sprite,
    WebGLRenderer,
    DoubleSide: 0,
    AdditiveBlending: 1,
    DynamicDrawUsage: 2,
    SRGBColorSpace: "srgb",
  };

  return {
    THREE,
    disposed,
    groups,
    reset: () => {
      disposed.length = 0;
      groups.length = 0;
    },
  };
});

vi.mock("three", () => threeStub.THREE);
/* eslint-enable @typescript-eslint/no-unused-vars */

// ---------------------------------------------------------------------------
// Spec factory + harness
// ---------------------------------------------------------------------------

type Scene3D = NonNullable<DemoSpecV1["scene3d"]>;

function makeSpec(scene: Scene3D): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "test-spec",
    generationId: "g-1",
    userQuery: "test",
    normalizedConcept: "test",
    title: "Test",
    learningObjective: "Test",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: [],
      engineId: "orbits",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "hybrid",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    simulation: {
      engineId: "orbits",
      engineVersion: "1.0.0",
      seed: 1,
      parameters: [],
      readouts: [],
    },
    scene3d: scene,
    controls: [],
    prediction: { prompt: "?", options: ["a", "b"] },
    observationPrompts: [],
    representations: [],
    adaptationContext: { allowed: false, oneVariableMode: true },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T00:00:00Z",
    },
    limits: {
      maxObjects: SPEC_LIMITS.maxObjects,
      maxParticles: SPEC_LIMITS.maxParticlesDesktop,
      maxTimelineEvents: SPEC_LIMITS.maxTimelineEvents,
      maxControls: SPEC_LIMITS.maxControls,
    },
  };
}

describe("primitive renderer canonical-state coupling", () => {
  let rafQueue: Array<(t: number) => void> = [];
  let rafIdCounter = 0;

  class FakeResizeObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  function fireFrame(now: number) {
    const cb = rafQueue.shift();
    if (cb) cb(now);
  }

  function makeCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
  }

  /** Pretend WebGL is available: getContext returns a non-null stub. */
  function mockWebGL(canvas: HTMLCanvasElement) {
    vi.spyOn(canvas, "getContext").mockReturnValue({} as never);
  }

  /** Find the runtime group for a node id (holder.name is set to the id). */
  function groupOf(id: string) {
    const g = threeStub.groups.find((g) => g.name === id);
    if (!g) throw new Error(`no group named ${id}`);
    return g;
  }

  function positionOf(id: string): { x: number; y: number; z: number } {
    const pos = groupOf(id).position as { x: number; y: number; z: number };
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  function attributeOf(id: string): Float32Array {
    const holder = groupOf(id) as unknown as { children: Array<{ geometry?: { attributes: Record<string, { array: Float32Array }> } }> };
    const child = holder.children[0];
    const attr = child?.geometry?.attributes?.position;
    if (!attr) throw new Error(`no position attribute under ${id}`);
    return attr.array;
  }

  beforeEach(() => {
    rafQueue = [];
    rafIdCounter = 0;
    threeStub.reset();
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      rafQueue.push(cb);
      return ++rafIdCounter;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    rafQueue = [];
    vi.unstubAllGlobals();
  });

  it("setEngineState moves a mapped object's mesh position by the scale mapping", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    const mapping: EngineMapping = {
      p: { body: "planet", scale: 0.5, offsetX: 1, offsetY: -2 },
    };
    renderer.setSpec(
      makeSpec({
        objects: [{ id: "p", kind: "sphere", position: { x: 2, y: 0, z: 1 } }],
        relationships: [],
        animations: [],
      }),
      { engineMapping: mapping }
    );
    renderer.setEngineState({ bodies: { planet: { x: 4, y: 6 } } });

    fireFrame(1000); // establishes the clock
    fireFrame(1100); // updateScene runs
    // world = (offsetX + x*scale, baseY, offsetY + y*scale) = (1+2, 0, -2+3)
    expect(positionOf("p")).toEqual({ x: 3, y: 0, z: 1 });
    renderer.dispose();
  });

  it("operator translation is skipped for engine-owned objects while decorative rotation still runs", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    const mapping: EngineMapping = {
      p: { body: "planet", scale: 1, offsetX: 0, offsetY: 0 },
    };
    renderer.setSpec(
      makeSpec({
        objects: [{ id: "p", kind: "sphere", position: { x: 0, y: 0, z: 0 } }],
        relationships: [],
        animations: [
          { id: "a1", target: "p", operator: "translate", speed: 2, axis: "x", amplitude: 1 },
          { id: "a2", target: "p", operator: "rotate", speed: 3, axis: "y" },
        ],
      }),
      { engineMapping: mapping }
    );
    renderer.setEngineState({ bodies: { planet: { x: 3, y: 0 } } });

    fireFrame(1000); // clock
    fireFrame(1100); // +0.05 s
    fireFrame(1150); // +0.05 s (time 0.1)

    // translate would have drifted x by 2*0.1 = 0.2 — the engine position (3)
    // is authoritative instead.
    expect(positionOf("p").x).toBeCloseTo(3, 6);
    // rotation is decorative and keeps running: 3 rad/s * 0.1 s.
    const rotation = (groupOf("p") as unknown as { rotation: { y: number } })
      .rotation;
    expect(rotation.y).toBeCloseTo(0.3, 6);
    renderer.dispose();
  });

  it("setEngineState(null) restores operator-driven behavior", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    const mapping: EngineMapping = {
      p: { body: "planet", scale: 1, offsetX: 0, offsetY: 0 },
    };
    renderer.setSpec(
      makeSpec({
        objects: [{ id: "p", kind: "sphere", position: { x: 0, y: 0, z: 0 } }],
        relationships: [],
        animations: [
          { id: "a1", target: "p", operator: "translate", speed: 2, axis: "x", amplitude: 1 },
        ],
      }),
      { engineMapping: mapping }
    );
    renderer.setEngineState({ bodies: { planet: { x: 3, y: 0 } } });
    fireFrame(1000);
    fireFrame(1100); // time 0.05 → engine-owned: x stays 3
    expect(positionOf("p").x).toBeCloseTo(3, 6);

    renderer.setEngineState(null);
    fireFrame(1150); // time 0.1 → operator-driven: x = 2 * 0.1 = 0.2
    expect(positionOf("p").x).toBeCloseTo(0.2, 6);
    renderer.dispose();
  });

  it("objects without a mapping or without a body stay operator-driven", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    const mapping: EngineMapping = {
      mapped: { body: "ghost", scale: 1, offsetX: 0, offsetY: 0 },
    };
    renderer.setSpec(
      makeSpec({
        objects: [
          { id: "mapped", kind: "sphere", position: { x: 1, y: 0, z: 0 } },
          { id: "unmapped", kind: "sphere", position: { x: 5, y: 0, z: 0 } },
        ],
        relationships: [],
        animations: [
          { id: "a1", target: "unmapped", operator: "translate", speed: 2, axis: "x", amplitude: 1 },
        ],
      }),
      { engineMapping: mapping }
    );
    // "ghost" is not in the state's bodies → mapped is NOT engine-owned.
    renderer.setEngineState({ bodies: { planet: { x: 99, y: 0 } } });
    fireFrame(1000);
    fireFrame(1100);
    fireFrame(1150); // time 0.1
    expect(positionOf("mapped").x).toBeCloseTo(1, 6);
    // unmapped object keeps its operator animation.
    expect(positionOf("unmapped").x).toBeCloseTo(5 + 0.2, 6);
    renderer.dispose();
  });

  it("vector_field arrows are updated from a fake field grid (direction + bounded length)", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    // Mirrors the electric-fields mapping (scale 3/70, span 2*sep at sep 140).
    const mapping: EngineMapping = {
      vf: { body: "@field", scale: 3 / 70, offsetX: 0, offsetY: 0 },
    };
    renderer.setSpec(
      makeSpec({
        objects: [{ id: "vf", kind: "vector_field", size: 9, position: { x: 0, y: 0, z: 0 } }],
        relationships: [],
        animations: [],
      }),
      { engineMapping: mapping }
    );
    const attr = attributeOf("vf");
    const base = new Float32Array(attr);
    // Default ticks point straight up (0, len, 0).
    expect(base[4]).toBeGreaterThan(0);

    // Fake grid: uniform field pointing +x with magnitude 1 everywhere.
    const N = 15;
    const vectors = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        vectors.push({ x: 0, y: 0, ex: 1, ey: 0, magnitude: 1 });
      }
    }
    renderer.setEngineState({
      field: { vectors, width: N, height: N, span: 280 },
    });
    fireFrame(1000);
    fireFrame(1100);

    // 4x4 grid of arrows: each now points along +x with the max length
    // (vt.len = size * 0.22 = 1.98 at magnitude/maxMagnitude = 1), and each
    // tick carries two arrowhead barbs perpendicular to its direction
    // (design-2 §5.3, F-17 — 6 points per tick, barb length = 0.3·len).
    const len = 9 * 0.22;
    for (let k = 0; k < 16; k++) {
      const o = k * 18;
      const ox = attr[o];
      const oz = attr[o + 2];
      expect(attr[o + 3]).toBeCloseTo(ox + len, 4); // x tip
      expect(attr[o + 4]).toBeCloseTo(0, 4); // in-plane
      expect(attr[o + 5]).toBeCloseTo(oz, 4); // z unchanged (ey = 0)
      // barbs perpendicular (±z for a +x direction) at TICK_TIP_RATIO.
      expect(attr[o + 11]).toBeCloseTo(oz + len * 0.3, 4);
      expect(attr[o + 17]).toBeCloseTo(oz - len * 0.3, 4);
    }
    renderer.dispose();
  });

  it("setEngineState never mutates the canonical state object (one state shared by all surfaces)", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    const mapping: EngineMapping = {
      p: { body: "planet", scale: 1, offsetX: 0, offsetY: 0 },
      vf: { body: "@field", scale: 3 / 70, offsetX: 0, offsetY: 0 },
      ws: { body: "@surface", scale: 10, offsetX: 0, offsetY: 0 },
    };
    renderer.setSpec(
      makeSpec({
        objects: [
          { id: "p", kind: "sphere", position: { x: 0, y: 0, z: 0 } },
          { id: "vf", kind: "vector_field", size: 9, position: { x: 0, y: 0, z: 0 } },
          { id: "ws", kind: "wave_surface", size: 10, position: { x: 0, y: 0, z: 0 } },
        ],
        relationships: [],
        animations: [],
      }),
      { engineMapping: mapping }
    );
    const state = {
      bodies: { planet: { x: 3, y: 2 } },
      field: {
        vectors: Array.from({ length: 16 }, () => ({ x: 0, y: 0, ex: 1, ey: 0, magnitude: 1 })),
        width: 4,
        height: 4,
        span: 280,
      },
      surface: { values: new Array<number>(200 * 120).fill(0.5), width: 200, height: 120 },
    };
    const snapshot = JSON.stringify(state);
    renderer.setEngineState(state);
    fireFrame(1000);
    fireFrame(1100);
    fireFrame(1200);
    // The page lifts ONE canonical state object to every surface; the 3D
    // renderer must consume it read-only, or the 2D view / readouts / replay
    // would diverge from what the 3D stage saw.
    expect(JSON.stringify(state)).toBe(snapshot);
    renderer.dispose();
  });

  it("wave_surface heights are bilinearly sampled from a fake surface grid", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    const mapping: EngineMapping = {
      ws: { body: "@surface", scale: 10, offsetX: 0, offsetY: 0 },
    };
    renderer.setSpec(
      makeSpec({
        objects: [{ id: "ws", kind: "wave_surface", size: 10, position: { x: 0, y: 0, z: 0 } }],
        relationships: [],
        animations: [],
      }),
      { engineMapping: mapping }
    );
    const attr = attributeOf("ws");
    const base = new Float32Array(attr);

    // Uniform surface value 0.5: every vertex lifts by clamp(0.5)*size*0.15.
    const GW = 200;
    const GH = 120;
    const values = new Array<number>(GW * GH).fill(0.5);
    renderer.setEngineState({ surface: { values, width: GW, height: GH } });
    fireFrame(1000);
    fireFrame(1100);

    const lift = 0.5 * 10 * 0.15; // 0.75
    // Vertices at different positions (x = -5 vs x = 0) get the SAME additive
    // lift — proving the engine grid drives the heights (the operator-driven
    // ripple would vary with x and time).
    const idxA = 0; // vertex at local (-5, -5)
    const idxB = 12 * 25 + 12; // vertex near local (0, 0)
    expect(attr[idxA * 3 + 1]).toBeCloseTo(base[idxA * 3 + 1] + lift, 6);
    expect(attr[idxB * 3 + 1]).toBeCloseTo(base[idxB * 3 + 1] + lift, 6);
    // The base in-plane coordinate is preserved (additive, not replaced).
    expect(attr[idxA * 3]).toBeCloseTo(base[idxA * 3], 6);
    renderer.dispose();
  });
});
