/**
 * SEMANTIC HOVER CONTRACT tests — Wave 1 (red) / Wave 2 (green), TDD.
 *
 * Pins the reproduced identity failures from .superpowers/sdd/orbit-learning/
 * root-cause.md §5:
 *   L2 — non-graph scenes (orbit) never emit a hover identity: hoverPick
 *        early-returns when !graphMode (renderer.ts:1130);
 *   L3 — hover identity must be cleared on pointerleave;
 *   L4 — a click-selected identity persists independent of hover;
 *   L5 — empty-space hover produces nothing (clears, never a phantom id);
 *   L10 — keyboard focus exposes the same semantic name as hover (today the
 *        canvas aria-label is only managed in graph mode — renderer.ts:1288);
 *   L11 — a touch tap exposes the identity (pickAt is graphMode-gated too).
 *
 * Uses the three.js stub + fake rAF pattern of primitive-3d.test.ts (jsdom
 * has no WebGL): raycast hits are programmable via threeStub.raycastHits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PrimitiveSceneRenderer,
  type PrimitiveSceneRendererOptions,
} from "@/demonstrations/renderers/primitive-3d/renderer";
import { buildOrbitsShowcase } from "@/demonstrations/showcases/orbits/build-spec";
import { engineMappingFor } from "@/demonstrations/showcases/coupling";

// ---------------------------------------------------------------------------
// Mock 'three' (hoisted so it applies to renderer.ts + materials.ts imports)
// ---------------------------------------------------------------------------

// The stub deliberately mirrors Three.js constructor signatures, so unused
// parameters (e.g. `_c`, `_w`) are expected here.
const threeStub = vi.hoisted(() => {
  const disposed: string[] = [];

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
    lerp(c: Color, _t: number) {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
      return this;
    }
  }

  class Vector2 {
    x: number;
    y: number;
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
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

  class Quaternion {
    x = 0;
    y = 0;
    z = 0;
    w = 1;
    setFromUnitVectors(_a: Vector3, _b: Vector3) {
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
    quaternion = new Quaternion();
    children: Object3D[] = [];
    name = "";
    up = new Vector3(0, 1, 0);
    parent: Object3D | null = null;
    visible = true;
    add(o: Object3D) {
      o.parent = this;
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
    drawRange = { start: 0, count: 0 };
    setAttribute(name: string, attr: BufferAttribute) {
      this.attributes[name] = attr;
      return this;
    }
    setDrawRange(start: number, count: number) {
      this.drawRange = { start, count };
      return this;
    }
    dispose() {
      disposed.push("BufferGeometry");
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
    left: number;
    right: number;
    top: number;
    bottom: number;
    near: number;
    far: number;
    constructor(
      left: number,
      right: number,
      top: number,
      bottom: number,
      near: number,
      far: number
    ) {
      super();
      this.left = left;
      this.right = right;
      this.top = top;
      this.bottom = bottom;
      this.near = near;
      this.far = far;
    }
    updateProjectionMatrix() {}
  }
  class Raycaster {
    setFromCamera(_ndc: Vector2, _camera: Object3D) {}
    /** Returns the configurable hit list (see threeStub.raycastHits). */
    intersectObjects(_objects: Object3D[], _recursive?: boolean) {
      return raycastHits;
    }
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

  class Geometry extends BufferGeometry {
    constructor(..._args: unknown[]) {
      super();
    }
    dispose() {
      disposed.push("Geometry");
    }
  }

  // Distinct subclasses so tests can identify a mesh's shape by
  // `geometry.constructor.name`.
  class SphereGeometry extends Geometry {}
  class BoxGeometry extends Geometry {}
  class PlaneGeometry extends Geometry {}
  class RingGeometry extends Geometry {}
  class CylinderGeometry extends Geometry {}
  class ConeGeometry extends Geometry {}
  class OctahedronGeometry extends Geometry {}

  class Mesh extends Object3D {
    isMesh = true;
    geometry: BufferGeometry;
    material: Material | Material[];
    constructor(geometry: BufferGeometry, material: Material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }
  class Line extends Mesh {
    isLine = true;
    isMesh = false;
  }
  class LineSegments extends Mesh {
    isLine = true;
    isMesh = false;
  }
  class Points extends Mesh {
    isPoints = true;
    isMesh = false;
  }
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

  // Programmable raycast hits: tests plant objects here and the stub
  // Raycaster returns them (default: no hits).
  const raycastHits: Array<{ object: Object3D; distance: number; point: unknown }> = [];

  const THREE = {
    Color,
    Vector2,
    Vector3,
    Euler,
    Quaternion,
    BufferAttribute,
    BufferGeometry,
    SphereGeometry,
    BoxGeometry,
    PlaneGeometry,
    RingGeometry,
    CylinderGeometry,
    ConeGeometry,
    OctahedronGeometry,
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
    Raycaster,
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
    raycastHits,
    disposed,
    reset: () => {
      disposed.length = 0;
      raycastHits.length = 0;
    },
  };
});

vi.mock("three", () => threeStub.THREE);

// ---------------------------------------------------------------------------
// Harness (fake rAF + WebGL context stub, pattern of primitive-3d.test.ts)
// ---------------------------------------------------------------------------

describe("semantic hover contract (L2-L5, L10-L11)", () => {
  let rafQueue: Array<(t: number) => void> = [];

  class FakeResizeObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  function makeCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
  }

  /** Pretend WebGL is available: getContext returns a non-null stub. */
  function mockWebGL(canvas: HTMLCanvasElement) {
    vi.spyOn(canvas, "getContext").mockReturnValue({} as never);
  }

  /** A pointer move over a named object (the raycast stub returns the
   * planted hit). */
  function hoverOver(canvas: HTMLCanvasElement, name: string) {
    threeStub.raycastHits.length = 0;
    threeStub.raycastHits.push({
      object: { name, parent: null } as never,
      distance: 1,
      point: {},
    });
    canvas.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 120, clientY: 80, bubbles: true })
    );
  }

  function hoverEmpty(canvas: HTMLCanvasElement) {
    threeStub.raycastHits.length = 0;
    canvas.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 120, clientY: 80, bubbles: true })
    );
  }

  function leaveCanvas(canvas: HTMLCanvasElement) {
    canvas.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
  }

  function tapCanvas(canvas: HTMLCanvasElement, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true, pointerType: "touch" })
    );
    canvas.dispatchEvent(
      new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true, pointerType: "touch" })
    );
  }

  function clickCanvas(canvas: HTMLCanvasElement, x = 120, y = 80) {
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true })
    );
    canvas.dispatchEvent(
      new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true })
    );
  }

  beforeEach(() => {
    rafQueue = [];
    threeStub.reset();
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      rafQueue.push(cb);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Build an orbit-stage renderer (verified_simulation + engine mapping →
   * graphMode false). The Wave-2 hover-identity callback is passed through
   * the options seam below. */
  function makeOrbitRenderer(onHoverIdentity: (id: string | null) => void) {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    // Wave-2 API (root-cause seam): PrimitiveSceneRendererOptions gains
    // `onHoverIdentity?: (nodeId: string | null) => void` — the non-graph
    // hover identity surface (root cause §5 "non-graph hover callbacks").
    const options = {
      onHoverIdentity,
    } as unknown as PrimitiveSceneRendererOptions;
    const renderer = new PrimitiveSceneRenderer(canvas, options);
    renderer.setSpec(buildOrbitsShowcase(), { engineMapping: engineMappingFor("orbits") });
    expect(renderer.getGraphMode()).toBe(false);
    return { canvas, renderer };
  }

  it("L2: pointermove over the planet mesh emits a hover identity in a non-graph (orbit) scene", () => {
    const onHoverIdentity = vi.fn();
    const { canvas, renderer } = makeOrbitRenderer(onHoverIdentity);

    hoverOver(canvas, "planet");

    // Root cause §5: hoverPick early-returns when !graphMode — the orbit
    // stage emits ZERO identity today.
    expect(onHoverIdentity).toHaveBeenCalledWith("planet");
    renderer.dispose();
  });

  it("E1 pin: a mesh under the pointer wins identity over a nearer line hit (the orbit ring must not mask the planet)", () => {
    // E1 final-gate regression (measured in real Chromium): three.js Line
    // raycasting uses a 1-world-unit threshold (~55px at the default frame),
    // and the orbit guide ring's FRONT arc sits between the camera and the
    // planet — its hits sorted nearer (21.89) than the planet's sphere
    // (23.54), so first-hit picking resolved the RING while the learner
    // hovered the PLANET (~96% of picks). The identity pick must prefer the
    // nearest MESH hit and fall back to line/other hits only when no mesh
    // resolves (the ring stays hoverable on its empty arc).
    const onHoverIdentity = vi.fn();
    const { canvas, renderer } = makeOrbitRenderer(onHoverIdentity);

    const ring = new threeStub.THREE.Line(
      new threeStub.THREE.BufferGeometry(),
      new threeStub.THREE.LineBasicMaterial(),
    );
    ring.name = "orbit-path-planet"; // the "Default orbit guide" ring node id
    const planet = new threeStub.THREE.Mesh(
      new threeStub.THREE.BufferGeometry(),
      new threeStub.THREE.MeshStandardMaterial(),
    );
    planet.name = "planet";
    threeStub.raycastHits.push(
      { object: ring as never, distance: 21.89, point: {} },
      { object: planet as never, distance: 23.54, point: {} },
    );

    canvas.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 120, clientY: 80, bubbles: true }),
    );

    expect(onHoverIdentity).toHaveBeenCalledWith("planet");
    renderer.dispose();
  });

  it("L3: hover identity is cleared on pointerleave", () => {
    const onHoverIdentity = vi.fn();
    const { canvas, renderer } = makeOrbitRenderer(onHoverIdentity);

    hoverOver(canvas, "planet");
    leaveCanvas(canvas);

    // The identity card must disappear when the pointer leaves the stage.
    const calls = onHoverIdentity.mock.calls.map((c) => c[0]);
    expect(calls[calls.length - 1]).toBeNull();
    renderer.dispose();
  });

  it("L5: empty-space hover produces nothing (clears, never a phantom identity)", () => {
    const onHoverIdentity = vi.fn();
    const { canvas, renderer } = makeOrbitRenderer(onHoverIdentity);

    hoverOver(canvas, "planet");
    hoverEmpty(canvas); // no object under the pointer

    // Empty space: identity must be cleared — never a stale or invented id.
    const calls = onHoverIdentity.mock.calls.map((c) => c[0]);
    expect(calls[calls.length - 1]).toBeNull();
    renderer.dispose();
  });

  it("L4: a click-selected identity persists independent of hover (orbit scenes)", () => {
    const onHoverIdentity = vi.fn();
    const { canvas, renderer } = makeOrbitRenderer(onHoverIdentity);

    threeStub.raycastHits.push({
      object: { name: "planet", parent: null } as never,
      distance: 1,
      point: {},
    });
    clickCanvas(canvas); // tap-selects the planet
    hoverEmpty(canvas); // hover drifts to empty space
    leaveCanvas(canvas); // ...and leaves entirely

    // The identity card state persists: the last emitted identity is still
    // the selected object, not null (hover never erases selection).
    const calls = onHoverIdentity.mock.calls.map((c) => c[0]);
    expect(calls[calls.length - 1]).toBe("planet");
    renderer.dispose();
  });

  it("L10: keyboard focus exposes the same semantic name as hover", () => {
    const { canvas, renderer } = makeOrbitRenderer(() => {});

    canvas.dispatchEvent(new FocusEvent("focus"));

    // Root cause §5: the canvas aria-label is managed only in graph mode
    // (renderer.ts:1288) — for the orbit stage the focused canvas exposes no
    // object identity. The contract: the focused canvas announces the same
    // semantic name hover shows (the canonical object under focus).
    expect(canvas.getAttribute("aria-label") ?? "").toContain("Planet");
    renderer.dispose();
  });

  it("L11: a touch tap on the planet exposes its identity", () => {
    const onHoverIdentity = vi.fn();
    const { canvas, renderer } = makeOrbitRenderer(onHoverIdentity);

    threeStub.raycastHits.push({
      object: { name: "planet", parent: null } as never,
      distance: 1,
      point: {},
    });
    tapCanvas(canvas, 120, 80);

    // Root cause §5: pickAt is graphMode-gated — a touch tap on the orbit
    // planet produces nothing today.
    expect(onHoverIdentity).toHaveBeenCalledWith("planet");
    renderer.dispose();
  });
});
