/**
 * Renderer performance + lifecycle hardening tests (Agent 13).
 *
 * jsdom cannot rasterize (no WebGL, no 2D canvas backing store) and has no
 * real rAF/ResizeObserver, so:
 *  - frame-time instrumentation is verified mathematically (fake timestamps)
 *    and structurally (sampler only exists when onFps is provided);
 *  - the 3D renderer is driven with a mocked 'three' module (recording
 *    dispose()/setPixelRatio() calls) and a fake rAF queue with browser
 *    cancel semantics (cancelling removes the pending callback);
 *  - the 2D runner drives the same fake rAF queue and a Proxy canvas context.
 *
 * Everything asserted here is structural/math-only; browser-level FPS
 * verification is the ED's Phase 9 browser gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  clampDt,
  computeDpr,
  DPR_CAP,
  DPR_CAP_MOBILE,
  isCanvasOwned as is2dCanvasOwned,
  isMobileViewport,
  MOBILE_VIEWPORT_PX,
  SimRunner,
} from "@/demonstrations/renderers/lumina-2d/runner";
import type { Readout } from "@/demonstrations/renderers/lumina-2d/types";
import {
  isCanvasOwned as is3dCanvasOwned,
  PrimitiveSceneRenderer,
} from "@/demonstrations/renderers/primitive-3d";
import {
  DEFAULT_ALPHA,
  ema,
  FrameStatsSampler,
  MAX_FRAME_DT,
  type FrameSample,
} from "@/demonstrations/performance/frame-stats";

// ---------------------------------------------------------------------------
// Mock 'three' (hoisted so it applies to renderer.ts + materials.ts imports)
// ---------------------------------------------------------------------------

// The stub deliberately mirrors the Three.js constructor signatures actually
// used by the renderer; unused parameters are expected here.
/* eslint-disable @typescript-eslint/no-unused-vars */
const threeStub = vi.hoisted(() => {
  const disposed: string[] = [];
  const pixelRatios: number[] = [];
  const created: string[] = [];

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
      this.array =
        array instanceof Float32Array ? array : new Float32Array(array);
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

  class Geometry extends BufferGeometry {
    constructor(..._args: unknown[]) {
      super();
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

  class Group extends Object3D {}
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
    constructor(_params?: unknown) {
      created.push("WebGLRenderer");
    }
    setPixelRatio(dpr: number) {
      pixelRatios.push(dpr);
    }
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
    pixelRatios,
    created,
    reset: () => {
      disposed.length = 0;
      pixelRatios.length = 0;
      created.length = 0;
    },
  };
});

vi.mock("three", () => threeStub.THREE);
/* eslint-enable @typescript-eslint/no-unused-vars */

// ---------------------------------------------------------------------------
// Fake browser primitives (rAF with real cancel semantics, RO capture, …)
// ---------------------------------------------------------------------------

/** Map<rafId, callback> — cancel removes the pending callback, exactly like
 * the browser, so a cancelled loop never fires again. */
let rafCallbacks = new Map<number, (t: number) => void>();
let cancelledRafIds: number[] = [];
let rafIdCounter = 0;

function scheduleRaf(cb: (t: number) => void): number {
  rafCallbacks.set(++rafIdCounter, cb);
  return rafIdCounter;
}

function cancelRaf(id: number): void {
  cancelledRafIds.push(id);
  rafCallbacks.delete(id);
}

function fireFrame(now: number): void {
  const next = rafCallbacks.entries().next().value as
    | [number, (t: number) => void]
    | undefined;
  if (!next) return;
  rafCallbacks.delete(next[0]);
  next[1](now);
}

/** Captures the ResizeObserver callback so tests can trigger a resize. */
class CapturingResizeObserver {
  static instance: CapturingResizeObserver | null = null;
  private cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
    CapturingResizeObserver.instance = this;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  trigger() {
    this.cb();
  }
}

let documentHidden = false;
function setDocumentHidden(v: boolean): void {
  documentHidden = v;
  try {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => documentHidden,
    });
  } catch {
    /* jsdom may already expose hidden */
  }
}

function defineWindowNumber(
  key: "devicePixelRatio" | "innerWidth",
  value: number
): void {
  Object.defineProperty(window, key, {
    configurable: true,
    get: () => value,
  });
}

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

/** Pretend WebGL is available: getContext returns a non-null stub. */
function mockWebGL(canvas: HTMLCanvasElement): void {
  vi.spyOn(canvas, "getContext").mockReturnValue({} as never);
}

function rect100(): DOMRect {
  return {
    width: 100,
    height: 100,
    top: 0,
    left: 0,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function readoutValue(readouts: Readout[], label: string): number {
  const hit = readouts.find((r) => r.label === label);
  if (!hit) throw new Error(`no readout labelled ${label}`);
  return parseFloat(hit.value);
}

function countDisposed(name: string): number {
  return threeStub.disposed.filter((d) => d === name).length;
}

/** Mesh geometries record "Geometry"; BufferGeometry-built kinds (trail,
 * particles, edges) record "BufferGeometry" — count both as geometry. */
function countDisposedGeometries(): number {
  return countDisposed("Geometry") + countDisposed("BufferGeometry");
}

// ---------------------------------------------------------------------------
// Spec factory
// ---------------------------------------------------------------------------

function makeSpec(scene?: Partial<NonNullable<DemoSpecV1["scene3d"]>> | null): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "perf-spec",
    generationId: "g-1",
    userQuery: "perf",
    normalizedConcept: "perf",
    title: "Perf",
    learningObjective: "Perf",
    trust: {
      level: "conceptual_demonstration",
      label: "Conceptual demonstration",
      limitations: [],
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    scene3d: scene
      ? {
          objects: scene.objects ?? [],
          relationships: scene.relationships ?? [],
          animations: scene.animations ?? [],
        }
      : undefined,
    controls: [],
    prediction: { prompt: "?", options: ["a", "b"] },
    observationPrompts: [],
    representations: [],
    adaptationContext: { allowed: false, oneVariableMode: true },
    provenance: {
      source: "template_composition",
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

/** A moderately rich scene exercising meshes, labels, trails, particles and
 * relationship edges — used by the disposal-cycle tests. */
function richSpec(): DemoSpecV1 {
  return makeSpec({
    objects: [
      { id: "a", kind: "sphere", label: "Source", position: { x: -2, y: 0, z: 0 } },
      { id: "b", kind: "box", position: { x: 2, y: 0, z: 0 } },
      { id: "t", kind: "trail", trailPoints: 40, position: { x: 0, y: 2, z: 0 } },
      { id: "p", kind: "particle_field", particleCount: 200, position: { x: 0, y: -2, z: 0 } },
    ],
    relationships: [{ id: "r1", type: "flows_to", from: "a", to: "b" }],
    animations: [
      { id: "m1", target: "a", operator: "oscillate", amplitude: 1, axis: "y" },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. DPR caps
// ---------------------------------------------------------------------------

describe("DPR adaptation", () => {
  beforeEach(() => {
    defineWindowNumber("devicePixelRatio", 1);
    defineWindowNumber("innerWidth", 1280);
  });

  it("computeDpr caps at 2 desktop / 1.5 mobile and floors broken inputs", () => {
    expect(DPR_CAP).toBe(2);
    expect(DPR_CAP_MOBILE).toBe(1.5);
    expect(computeDpr(3, false)).toBe(2);
    expect(computeDpr(3, true)).toBe(1.5);
    expect(computeDpr(1.25, true)).toBe(1.25);
    expect(computeDpr(1.25, false)).toBe(1.25);
    expect(computeDpr(0, false)).toBe(1); // headless / broken dpr
    expect(computeDpr(NaN, false)).toBe(1);
  });

  it("2D runner: backing store scales with the active DPR cap on resize", () => {
    const canvas = makeCanvas();
    const parent = document.createElement("div");
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue(rect100());
    parent.appendChild(canvas);

    defineWindowNumber("devicePixelRatio", 3);
    defineWindowNumber("innerWidth", 375); // mobile viewport
    const runner = new SimRunner(canvas);
    expect(canvas.width).toBe(100 * DPR_CAP_MOBILE); // 150: 100 CSS px × 1.5

    defineWindowNumber("innerWidth", 1280); // desktop viewport
    CapturingResizeObserver.instance?.trigger();
    expect(canvas.width).toBe(100 * DPR_CAP); // 200

    defineWindowNumber("devicePixelRatio", 1);
    CapturingResizeObserver.instance?.trigger();
    expect(canvas.width).toBe(100); // 1×
    runner.dispose();
  });

  it("3D renderer: setPixelRatio honors the mobile flag (2 vs 1.5)", () => {
    defineWindowNumber("devicePixelRatio", 3);

    const canvas = makeCanvas();
    const parent = document.createElement("div");
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue(rect100());
    parent.appendChild(canvas);
    mockWebGL(canvas);
    const desktop = new PrimitiveSceneRenderer(canvas, {});
    expect(canvas.width).toBe(100 * DPR_CAP);
    expect(threeStub.pixelRatios).toEqual([DPR_CAP]);
    desktop.dispose();

    const mobileCanvas = makeCanvas();
    const mobileParent = document.createElement("div");
    vi.spyOn(mobileParent, "getBoundingClientRect").mockReturnValue(rect100());
    mobileParent.appendChild(mobileCanvas);
    mockWebGL(mobileCanvas);
    const mobile = new PrimitiveSceneRenderer(mobileCanvas, { mobile: true });
    expect(mobileCanvas.width).toBe(100 * DPR_CAP_MOBILE);
    expect(threeStub.pixelRatios).toEqual([DPR_CAP, DPR_CAP_MOBILE]);
    mobile.dispose();
  });
});

// ---------------------------------------------------------------------------
// 2. Mobile particle budget
// ---------------------------------------------------------------------------

describe("mobile particle budget", () => {
  it("clamps particleCount to 1500 desktop / 500 mobile in the scene graph", () => {
    const spec = makeSpec({
      objects: [{ id: "p", kind: "particle_field", particleCount: 50_000 }],
    });
    const desktop = buildSceneGraph(spec);
    expect(desktop.graph.nodes[0].particleCount).toBe(
      SPEC_LIMITS.maxParticlesDesktop
    );
    expect(desktop.graph.limits.particleLimit).toBe(
      SPEC_LIMITS.maxParticlesDesktop
    );

    const mobile = buildSceneGraph(spec, { mobile: true });
    expect(mobile.graph.nodes[0].particleCount).toBe(
      SPEC_LIMITS.maxParticlesMobile
    );
    expect(mobile.graph.limits.particleLimit).toBe(
      SPEC_LIMITS.maxParticlesMobile
    );
    expect(mobile.reasons).toContain("particle_count_clamped");
  });
});

// ---------------------------------------------------------------------------
// 3. Hidden-tab pause (2D runner)
// ---------------------------------------------------------------------------

describe("hidden-tab pause", () => {
  it("2D runner stops advancing time while the document is hidden", () => {
    const canvas = makeCanvas();
    const runner = new SimRunner(canvas);
    let last: Readout[] = [];
    runner.onReadouts = (r) => {
      last = r;
    };
    runner.setScene({
      engineId: "rc_circuit",
      parameters: { resistance: 1000, capacitance: 100e-6, voltage: 5 },
      seed: 1,
    });

    setDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    fireFrame(1000);
    fireFrame(1050);
    fireFrame(1100);
    fireFrame(1150);
    expect(readoutValue(last, "Voltage")).toBe(0); // paused: no advance

    runner.setPlaying(true);
    fireFrame(1200); // clock re-establish
    fireFrame(1250);
    fireFrame(1300);
    fireFrame(1350);
    expect(readoutValue(last, "Voltage")).toBeGreaterThan(3.0);
    runner.dispose();
  });
});

// ---------------------------------------------------------------------------
// 4. Context-loss recovery (3D renderer)
// ---------------------------------------------------------------------------

describe("3D context-loss recovery", () => {
  it("pauses on webglcontextlost and fully rebuilds on webglcontextrestored", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    renderer.setSpec(richSpec());
    expect(renderer.getStatus()).toBe("ready");
    threeStub.reset();

    fireFrame(1000);
    fireFrame(1016);
    expect(rafCallbacks.size).toBe(1); // loop is live

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true); // browser must not kill the canvas
    expect(renderer.getStatus()).toBe("context_lost");
    expect(cancelledRafIds.length).toBeGreaterThan(0);
    expect(rafCallbacks.size).toBe(0); // loop stopped
    expect(countDisposed("WebGLRenderer")).toBe(1); // old renderer disposed
    expect(countDisposed("Geometry")).toBeGreaterThan(0); // scene torn down

    fireFrame(2000); // stale frames must not restart the loop
    expect(rafCallbacks.size).toBe(0);

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(renderer.getStatus()).toBe("ready");
    expect(rafCallbacks.size).toBe(1); // loop restarted
    expect(countDisposed("WebGLRenderer")).toBe(1); // nothing extra disposed
    // since reset(), exactly one renderer was built — the restore rebuilt it
    expect(threeStub.created.filter((c) => c === "WebGLRenderer")).toHaveLength(1);
    expect(renderer.getSceneGraph()).not.toBeNull(); // scene rebuilt

    fireFrame(3000); // clock re-establish
    fireFrame(3016);
    expect(renderer.getSimTime()).toBeGreaterThan(0); // animating again
    renderer.dispose();
    expect(is3dCanvasOwned(canvas)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5 + 6. Disposal, canvas ownership, mount/unmount cycles
// ---------------------------------------------------------------------------

describe("disposal + canvas ownership", () => {
  it("both runners refuse a second owner for one canvas and release it on dispose", () => {
    const c2d = makeCanvas();
    const r2d = new SimRunner(c2d);
    expect(() => new SimRunner(c2d)).toThrow(/already owned/);
    expect(is2dCanvasOwned(c2d)).toBe(true);
    r2d.dispose();
    expect(is2dCanvasOwned(c2d)).toBe(false);

    const c3d = makeCanvas();
    mockWebGL(c3d);
    const r3d = new PrimitiveSceneRenderer(c3d);
    expect(() => new PrimitiveSceneRenderer(c3d)).toThrow(/already owned/);
    expect(is3dCanvasOwned(c3d)).toBe(true);
    r3d.dispose();
    expect(is3dCanvasOwned(c3d)).toBe(false);
  });

  it("setSpec disposes the previous scene's geometries before building the next", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    threeStub.reset();
    renderer.setSpec(richSpec());
    expect(renderer.getSceneGraph()?.nodes).toHaveLength(4);
    expect(countDisposed("Geometry")).toBe(0);

    renderer.setSpec(makeSpec({ objects: [{ id: "x", kind: "sphere" }] }));
    expect(renderer.getSceneGraph()?.nodes).toHaveLength(1);
    expect(countDisposedGeometries()).toBeGreaterThanOrEqual(5); // scene A torn down
    renderer.dispose();
  });

  it("10 mount/unmount cycles of the 2D runner leave zero live owners", () => {
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < 10; i++) {
      const canvas = makeCanvas();
      const runner = new SimRunner(canvas);
      runner.setScene({ engineId: "pendulum" });
      fireFrame(1000 + i);
      expect(rafCallbacks.size).toBe(1); // loop live while mounted
      runner.dispose();
      expect(is2dCanvasOwned(canvas)).toBe(false);
      expect(rafCallbacks.size).toBe(0); // loop cancelled, nothing reschedules
      canvases.push(canvas);
    }
    // every canvas is re-ownable: the ownership registry is empty
    for (const canvas of canvases) {
      const again = new SimRunner(canvas);
      expect(is2dCanvasOwned(canvas)).toBe(true);
      again.dispose();
      expect(is2dCanvasOwned(canvas)).toBe(false);
    }
  });

  it("10 mount/unmount cycles of the 3D renderer dispose everything and release canvases", () => {
    const canvases: HTMLCanvasElement[] = [];
    threeStub.reset();
    for (let i = 0; i < 10; i++) {
      const canvas = makeCanvas();
      mockWebGL(canvas);
      const renderer = new PrimitiveSceneRenderer(canvas, { mobile: i % 2 === 0 });
      renderer.setSpec(richSpec());
      fireFrame(1000 + i * 16);
      expect(rafCallbacks.size).toBe(1);
      renderer.dispose();
      expect(is3dCanvasOwned(canvas)).toBe(false);
      expect(rafCallbacks.size).toBe(0);
      canvases.push(canvas);
    }
    expect(countDisposed("WebGLRenderer")).toBe(10);
    expect(countDisposedGeometries()).toBeGreaterThanOrEqual(50); // 5 per cycle
    expect(countDisposed("CanvasTexture")).toBeGreaterThanOrEqual(10); // labels
    expect(countDisposed("MeshStandardMaterial")).toBeGreaterThanOrEqual(20); // shared cache cleared per cycle
    for (const canvas of canvases) {
      const again = new PrimitiveSceneRenderer(canvas);
      expect(is3dCanvasOwned(canvas)).toBe(true);
      again.dispose();
      expect(is3dCanvasOwned(canvas)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Frame-time instrumentation (EMA math + optional wiring)
// ---------------------------------------------------------------------------

describe("frame-stats EMA math", () => {
  it("ema() blends the previous value toward the sample", () => {
    expect(ema(0, 16, 0.1)).toBeCloseTo(1.6, 12);
    expect(ema(10, 10, 0.5)).toBe(10); // steady state
    expect(ema(10, 0, 1)).toBe(0); // alpha=1 snaps to the sample
    expect(ema(10, 0, 0)).toBe(10); // alpha=0 ignores the sample
  });

  it("the first sample only establishes the clock", () => {
    const s = new FrameStatsSampler();
    const first = s.sample(1000);
    expect(first.frames).toBe(1);
    expect(first.avgDt).toBe(0);
    expect(first.lastDt).toBe(0);
    expect(first.fps).toBe(0);
  });

  it("converges to the true frame time at a constant 16 ms cadence", () => {
    const s = new FrameStatsSampler();
    expect(s.read().frames).toBe(0);
    let last: FrameSample = s.read();
    for (let i = 1; i <= 500; i++) last = s.sample(1000 + i * 16);
    expect(last.frames).toBe(500); // 1 clock frame + 499 dt frames
    expect(last.avgDt).toBeCloseTo(0.016, 4);
    expect(last.fps).toBeCloseTo(62.5, 1);
  });

  it("alpha=1 tracks the instantaneous dt exactly", () => {
    const s = new FrameStatsSampler(1);
    s.sample(1000);
    const x = s.sample(1033);
    expect(x.lastDt).toBeCloseTo(0.033, 12);
    expect(x.avgDt).toBeCloseTo(0.033, 12);
    expect(x.fps).toBeCloseTo(1000 / 33, 5);
  });

  it("clamps backward clocks and stalls to MAX_FRAME_DT", () => {
    const s = new FrameStatsSampler(1);
    s.sample(1000);
    expect(s.sample(900).lastDt).toBe(0); // clock went backwards
    expect(s.sample(5100).lastDt).toBe(MAX_FRAME_DT); // 4.1 s gap capped
  });

  it("reset() forgets all history", () => {
    const s = new FrameStatsSampler(1);
    s.sample(1000);
    s.sample(1016);
    expect(s.read().fps).toBeCloseTo(62.5, 5);
    s.reset();
    const r = s.sample(2000);
    expect(r.frames).toBe(1);
    expect(r.avgDt).toBe(0);
    expect(r.fps).toBe(0);
  });

  it("never yields NaN or Infinity for pathological timestamps", () => {
    const s = new FrameStatsSampler();
    for (const t of [0, 1e9, -5, NaN, Infinity, 123, NaN]) {
      const r = s.sample(t);
      expect(Number.isFinite(r.avgDt)).toBe(true);
      expect(Number.isFinite(r.lastDt)).toBe(true);
      expect(Number.isFinite(r.fps)).toBe(true);
    }
    expect(DEFAULT_ALPHA).toBeGreaterThan(0);
    expect(DEFAULT_ALPHA).toBeLessThanOrEqual(1);
  });
});

describe("3D renderer onFps wiring (optional)", () => {
  it("emits EMA-smoothed FPS on the existing onFps callback", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const onFps = vi.fn();
    const renderer = new PrimitiveSceneRenderer(canvas, { onFps });
    renderer.setSpec(makeSpec({ objects: [{ id: "a", kind: "sphere" }] }));

    for (let i = 1; i <= 100; i++) fireFrame(1000 + i * 16);
    expect(onFps).toHaveBeenCalled();
    const values = onFps.mock.calls.map((c) => c[0] as number);
    for (const fps of values) {
      expect(fps).toBeGreaterThan(30);
      expect(fps).toBeLessThan(120);
    }
    // EMA at 16 ms converges to ~62.5 fps; the last emission is fully warmed
    const last = values[values.length - 1];
    expect(last).toBeGreaterThan(50);
    expect(last).toBeLessThan(75);
    renderer.dispose();
  });

  it("runs identically with no onFps (sampler never exists)", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    renderer.setSpec(makeSpec({ objects: [{ id: "a", kind: "sphere" }] }));
    for (let i = 1; i <= 100; i++) fireFrame(1000 + i * 16);
    expect(renderer.getSimTime()).toBeGreaterThan(1); // loop behaved normally
    renderer.dispose();
  });
});

describe("regression guards", () => {
  it("the 2D runner still clamps dt", () => {
    expect(clampDt(1e9)).toBe(0.05);
    expect(clampDt(-1)).toBe(0);
  });

  it("mobile viewport detection matches the shell heuristic", () => {
    defineWindowNumber("innerWidth", 375);
    expect(isMobileViewport()).toBe(true);
    defineWindowNumber("innerWidth", MOBILE_VIEWPORT_PX - 1);
    expect(isMobileViewport()).toBe(true);
    defineWindowNumber("innerWidth", MOBILE_VIEWPORT_PX);
    expect(isMobileViewport()).toBe(false);
    defineWindowNumber("innerWidth", 1280);
    expect(isMobileViewport()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

beforeEach(() => {
  rafCallbacks = new Map();
  cancelledRafIds = [];
  rafIdCounter = 0;
  documentHidden = false;
  setDocumentHidden(false);
  threeStub.reset();
  CapturingResizeObserver.instance = null;
  vi.stubGlobal("requestAnimationFrame", scheduleRaf);
  vi.stubGlobal("cancelAnimationFrame", cancelRaf);
  vi.stubGlobal("ResizeObserver", CapturingResizeObserver);
});

afterEach(() => {
  rafCallbacks = new Map();
  cancelledRafIds = [];
  setDocumentHidden(false);
  defineWindowNumber("devicePixelRatio", 1);
  defineWindowNumber("innerWidth", 1024);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
