/**
 * GRAPH HOVER CONTRACT tests — Wave 3 (FIX 17/18), TDD.
 *
 * Pins the CAUSE/EFFECT graph hover identity surface built on Wave 2's
 * semantic presentation system:
 *
 *   G1 — graph-mode NODE hover emits the existing W5 identity callback
 *        (onHoverIdentity(nodeId)) through the SAME pickAt resolution path
 *        (pickTargets + resolveNodePick) — graph nodes are identity-pickable.
 *   G2 — graph EDGE hover emits the new additive onEdgeHover(edgeId), and
 *        node/edge are mutually exclusive per pointer position.
 *   G3 — hover is VISUAL-ONLY: onNodeSelect / onNodeManipulate / onEdgeSelect
 *        are never fired from hover (frozen selection contract), while
 *        Enter/Space select+manipulate exactly as before.
 *   G4 — pointerleave clears BOTH hover surfaces (identity + edge readout).
 *   G5 — empty-space hover emits null for both (never a phantom id/edge).
 *   G6 — emissions are change-only (dedupe): repeated hovers over the same
 *        object/edge fire the callback once.
 *   G7 — the edge tooltip content resolver (resolveGraphEdgeContent) renders
 *        the 2D-parity readout ("Cause A → Effect B" / "Effect C ┤ Inhibited
 *        D") plus the plain-word sentence ("activates" / "inhibits"), with
 *        the relationship label as fallback.
 *   G8 — edge hover anchors (getEdgeAnchor) resolve to canvas CSS px (the
 *        tooltip anchor seam), like the node anchor (getIdentityAnchor).
 *   G9 — a spec swap clears both hover surfaces (resetSelection emits nulls,
 *        never a stale tooltip across scenes).
 *
 * Uses the three.js stub + fake rAF pattern of primitive-3d.test.ts (jsdom
 * has no WebGL): raycast hits are programmable via threeStub.raycastHits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PrimitiveSceneRenderer,
  type PrimitiveSceneRendererOptions,
} from "@/demonstrations/renderers/primitive-3d/renderer";
import {
  resolveGraphEdgeContent,
  GRAPH_EDGE_VERBS,
} from "@/demonstrations/renderers/primitive-3d/presentation/tooltip-controller";
import type { GraphEdgePlan } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

type Scene3D = NonNullable<DemoSpecV1["scene3d"]>;

// ---------------------------------------------------------------------------
// Mock 'three' (hoisted so it applies to renderer.ts + materials.ts imports)
// ---------------------------------------------------------------------------

const threeStub = vi.hoisted(() => {
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
    add(v: Vector3) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
    multiplyScalar(s: number) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    /** Anchor projections: identity under the stub camera (finite NDC). */
    project(_camera: unknown) {
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
    drawRange = { start: 0, count: 0 };
    setAttribute(name: string, attr: BufferAttribute) {
      this.attributes[name] = attr;
      return this;
    }
    setDrawRange(start: number, count: number) {
      this.drawRange = { start, count };
      return this;
    }
    dispose() {}
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
    dispose() {}
  }
  class MeshBasicMaterial extends Material {}
  class MeshStandardMaterial extends Material {}
  class LineBasicMaterial extends Material {}
  class PointsMaterial extends Material {}
  class SpriteMaterial extends Material {}

  class CanvasTexture {
    colorSpace = "";
    dispose() {}
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
    dispose() {}
  }

  class SphereGeometry extends Geometry {}
  class BoxGeometry extends Geometry {}
  class PlaneGeometry extends Geometry {}
  class RingGeometry extends Geometry {}
  class CylinderGeometry extends Geometry {}
  class ConeGeometry extends Geometry {}
  class OctahedronGeometry extends Geometry {}

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
    dispose() {}
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
    reset: () => {
      raycastHits.length = 0;
    },
  };
});

vi.mock("three", () => threeStub.THREE);

// ---------------------------------------------------------------------------
// Spec factory (mirrors primitive-3d.test.ts)
// ---------------------------------------------------------------------------

function makeSpec(scene?: Partial<Scene3D> | null): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "test-spec",
    generationId: "g-1",
    userQuery: "test",
    normalizedConcept: "test",
    title: "Test",
    learningObjective: "Test",
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

// ---------------------------------------------------------------------------
// Harness (fake rAF + WebGL context stub, pattern of primitive-3d.test.ts)
// ---------------------------------------------------------------------------

describe("graph hover contract (G1–G9, FIX 17/18)", () => {
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
    // A real viewport so pointer picking produces valid NDC coordinates.
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  /** The frozen cause/effect template (a→b causes, b→c activates,
   * c→d inhibits) — the same scene the e2e graph journeys pin. */
  const GRAPH_SCENE: Scene3D = {
    objects: [
      { id: "a", kind: "process_node", label: "Cause A", position: { x: -3, y: 1, z: 0 } },
      { id: "b", kind: "process_node", label: "Effect B", position: { x: 0, y: 1, z: 0 } },
      { id: "c", kind: "process_node", label: "Effect C", position: { x: 0, y: -1, z: 0 } },
      { id: "d", kind: "process_node", label: "Inhibited D", position: { x: 3, y: -1, z: 0 } },
    ],
    relationships: [
      { id: "r1", type: "causes", from: "a", to: "b" },
      { id: "r2", type: "activates", from: "b", to: "c" },
      { id: "r3", type: "inhibits", from: "c", to: "d" },
    ],
    animations: [],
  };

  const NODE_LABELS: Record<string, string> = {
    a: "Cause A",
    b: "Effect B",
    c: "Effect C",
    d: "Inhibited D",
  };

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
    rafQueue = [];
    vi.unstubAllGlobals();
  });

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

  function pressKey(canvas: HTMLCanvasElement, key: string) {
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }

  function makeGraphRenderer(options: Partial<PrimitiveSceneRendererOptions>) {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas, options);
    renderer.setSpec(makeSpec(GRAPH_SCENE));
    expect(renderer.getGraphMode()).toBe(true);
    return { canvas, renderer };
  }

  // -------------------------------------------------------------------------
  // G1 — graph node hover identity (W5's callback, same pickAt resolution)
  // -------------------------------------------------------------------------

  it("G1: node hover emits the existing onHoverIdentity callback (graph nodes are identity-pickable)", () => {
    const onHoverIdentity = vi.fn();
    const onEdgeHover = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({ onHoverIdentity, onEdgeHover });

    hoverOver(canvas, "b");

    expect(onHoverIdentity).toHaveBeenCalledWith("b");
    // A node under the pointer is never an edge: the edge surface stays quiet
    // (already null — change-only emission).
    expect(onEdgeHover).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it("G1b: a raycast hit on an unregistered mesh never fabricates an identity", () => {
    const onHoverIdentity = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({ onHoverIdentity });

    // A decorative/unregistered object under the pointer resolves to nothing
    // — the identity surface stays quiet (already null; change-only, so no
    // phantom null-emission either).
    threeStub.raycastHits.push({
      object: { name: "not-a-node-name", parent: null } as never,
      distance: 1,
      point: {},
    });
    canvas.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 120, clientY: 80, bubbles: true })
    );
    expect(onHoverIdentity).not.toHaveBeenCalled();
    renderer.dispose();
  });

  // -------------------------------------------------------------------------
  // G2 — graph edge hover (additive onEdgeHover)
  // -------------------------------------------------------------------------

  it("G2: edge hover emits onEdgeHover with the edge id; node identity is null", () => {
    const onHoverIdentity = vi.fn();
    const onEdgeHover = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({ onHoverIdentity, onEdgeHover });

    hoverOver(canvas, "edge:r1");

    expect(onEdgeHover).toHaveBeenCalledWith("r1");
    // The same pointer position carries no node identity (already null —
    // change-only emission, so the identity callback stays quiet).
    expect(onHoverIdentity).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it("G2b: node and edge hover are mutually exclusive across a move (no stale readout)", () => {
    const onHoverIdentity = vi.fn();
    const onEdgeHover = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({ onHoverIdentity, onEdgeHover });

    hoverOver(canvas, "b"); // node
    hoverOver(canvas, "edge:r1"); // edge
    hoverOver(canvas, "c"); // node

    const identityCalls = onHoverIdentity.mock.calls.map((c) => c[0]);
    const edgeCalls = onEdgeHover.mock.calls.map((c) => c[0]);
    expect(identityCalls[identityCalls.length - 1]).toBe("c");
    expect(edgeCalls[edgeCalls.length - 1]).toBeNull();
    expect(edgeCalls).toContain("r1");
    renderer.dispose();
  });

  // -------------------------------------------------------------------------
  // G3 — hover is visual-only (frozen selection/manipulation contract)
  // -------------------------------------------------------------------------

  it("G3: hover never fires selection or manipulation; Enter/Space select+manipulate unchanged", () => {
    const onNodeSelect = vi.fn();
    const onNodeManipulate = vi.fn();
    const onEdgeSelect = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({
      onNodeSelect,
      onNodeManipulate,
      onEdgeSelect,
    });

    // Hovering nodes and edges must not select, manipulate or clear anything.
    hoverOver(canvas, "b");
    hoverOver(canvas, "edge:r1");
    hoverOver(canvas, "edge:r3");
    hoverEmpty(canvas);
    leaveCanvas(canvas);
    expect(onNodeSelect).not.toHaveBeenCalled();
    expect(onNodeManipulate).not.toHaveBeenCalled();
    expect(onEdgeSelect).not.toHaveBeenCalled();

    // Keyboard activation is untouched: focus + Enter selects AND manipulates.
    canvas.dispatchEvent(new FocusEvent("focus"));
    pressKey(canvas, "Enter");
    expect(onNodeSelect).toHaveBeenLastCalledWith("a");
    expect(onNodeManipulate).toHaveBeenLastCalledWith("a");

    // Space is the same single activation surface.
    pressKey(canvas, " ");
    expect(onNodeSelect).toHaveBeenLastCalledWith("a");
    expect(onNodeManipulate).toHaveBeenLastCalledWith("a");
    renderer.dispose();
  });

  // -------------------------------------------------------------------------
  // G4/G5 — pointerleave + empty space clear both hover surfaces
  // -------------------------------------------------------------------------

  it("G4: pointerleave clears both the node identity and the edge readout", () => {
    const onHoverIdentity = vi.fn();
    const onEdgeHover = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({ onHoverIdentity, onEdgeHover });

    hoverOver(canvas, "b"); // node identity emitted
    hoverOver(canvas, "edge:r1"); // edge readout emitted, identity cleared
    leaveCanvas(canvas);

    const identityCalls = onHoverIdentity.mock.calls.map((c) => c[0]);
    const edgeCalls = onEdgeHover.mock.calls.map((c) => c[0]);
    expect(identityCalls[identityCalls.length - 1]).toBeNull();
    expect(edgeCalls[edgeCalls.length - 1]).toBeNull();
    renderer.dispose();
  });

  it("G5: empty-space hover produces nothing (clears, never a phantom id or edge)", () => {
    const onHoverIdentity = vi.fn();
    const onEdgeHover = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({ onHoverIdentity, onEdgeHover });

    hoverOver(canvas, "b");
    hoverOver(canvas, "edge:r2");
    hoverEmpty(canvas);

    const identityCalls = onHoverIdentity.mock.calls.map((c) => c[0]);
    const edgeCalls = onEdgeHover.mock.calls.map((c) => c[0]);
    expect(identityCalls[identityCalls.length - 1]).toBeNull();
    expect(edgeCalls[edgeCalls.length - 1]).toBeNull();
    renderer.dispose();
  });

  // -------------------------------------------------------------------------
  // G6 — change-only emissions (dedupe, never per-frame)
  // -------------------------------------------------------------------------

  it("G6: repeated hovers over the same node/edge emit once; a change emits again", () => {
    const onHoverIdentity = vi.fn();
    const onEdgeHover = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({ onHoverIdentity, onEdgeHover });

    hoverOver(canvas, "b");
    hoverOver(canvas, "b");
    expect(onHoverIdentity).toHaveBeenCalledTimes(1);
    expect(onHoverIdentity).toHaveBeenCalledWith("b");

    hoverOver(canvas, "edge:r1");
    hoverOver(canvas, "edge:r1");
    expect(onEdgeHover).toHaveBeenCalledTimes(1);
    expect(onEdgeHover).toHaveBeenCalledWith("r1");

    hoverOver(canvas, "edge:r2");
    hoverOver(canvas, "edge:r2");
    expect(onEdgeHover).toHaveBeenCalledTimes(2);
    expect(onEdgeHover).toHaveBeenLastCalledWith("r2");
    renderer.dispose();
  });

  // -------------------------------------------------------------------------
  // G7 — edge content resolver (FIX 17/18 learner-friendly wording)
  // -------------------------------------------------------------------------

  function edgePlan(overrides: Partial<GraphEdgePlan>): GraphEdgePlan {
    return {
      id: "r1",
      type: "causes",
      label: "causes",
      fromId: "a",
      toId: "b",
      from: { x: -3, y: 1, z: 0 },
      to: { x: 0, y: 1, z: 0 },
      inhibits: false,
      ...overrides,
    };
  }

  it("G7: causes edges resolve to the 2D-parity readout + 'activates' sentence", () => {
    const content = resolveGraphEdgeContent(edgePlan({}), NODE_LABELS);
    // The title is exactly what the 2D surface renders (red-team finding 3:
    // "Cause A → Effect B" — the 3D stage must say the same thing).
    expect(content.title).toBe("Cause A → Effect B");
    // The body maps the operator to a plain word in a complete sentence.
    expect(content.body).toBe("Cause A activates Effect B.");
    expect(GRAPH_EDGE_VERBS.causes).toBe("activates");
  });

  it("G7b: inhibits edges use the ┤ glyph and the 'inhibits' sentence", () => {
    const content = resolveGraphEdgeContent(
      edgePlan({
        id: "r3",
        type: "inhibits",
        label: "inhibits",
        fromId: "c",
        toId: "d",
        inhibits: true,
      }),
      NODE_LABELS
    );
    expect(content.title).toBe("Effect C ┤ Inhibited D");
    expect(content.body).toBe("Effect C inhibits Inhibited D.");
    expect(GRAPH_EDGE_VERBS.inhibits).toBe("inhibits");
  });

  it("G7c: missing node labels fall back to the raw ids; labelled relationship label is the fallback for unmapped operators", () => {
    // Unknown endpoint labels → raw ids, never an invented name.
    expect(resolveGraphEdgeContent(edgePlan({}), {}).title).toBe("a → b");

    // An operator with no plain-word mapping falls back to the relationship
    // label when one was carried.
    const labelled = resolveGraphEdgeContent(
      {
        ...edgePlan({ label: "sparks a reaction" }),
        type: "custom_op",
      } as unknown as GraphEdgePlan,
      NODE_LABELS
    );
    expect(labelled.title).toBe("Cause A → Effect B");
    expect(labelled.body).toBe("sparks a reaction");
  });

  // -------------------------------------------------------------------------
  // G8 — edge tooltip anchor (getEdgeAnchor), node anchor (getIdentityAnchor)
  // -------------------------------------------------------------------------

  it("G8: getEdgeAnchor projects the edge midpoint to canvas CSS px; unknown ids yield null", () => {
    const { renderer } = makeGraphRenderer({});

    const anchor = renderer.getEdgeAnchor("r1");
    expect(anchor).not.toBeNull();
    expect(Number.isFinite(anchor!.x)).toBe(true);
    expect(Number.isFinite(anchor!.y)).toBe(true);
    // An edge id is never a node anchor and vice versa.
    expect(renderer.getEdgeAnchor("ghost-edge")).toBeNull();
    expect(renderer.getIdentityAnchor("a")).not.toBeNull();
    expect(renderer.getIdentityAnchor("r1")).toBeNull();
    renderer.dispose();
  });

  // -------------------------------------------------------------------------
  // G9 — spec swap clears both hover surfaces (no stale tooltip across scenes)
  // -------------------------------------------------------------------------

  it("G9: setSpec clears an emitted edge/identity hover (resetSelection emits nulls)", () => {
    const onHoverIdentity = vi.fn();
    const onEdgeHover = vi.fn();
    const { canvas, renderer } = makeGraphRenderer({ onHoverIdentity, onEdgeHover });

    // Node hover last: the identity surface must clear on the spec swap.
    hoverOver(canvas, "edge:r3");
    hoverOver(canvas, "b");
    onHoverIdentity.mockClear();
    onEdgeHover.mockClear();
    renderer.setSpec(makeSpec(GRAPH_SCENE));
    expect(onHoverIdentity).toHaveBeenCalledWith(null);

    // Edge hover last: the edge readout must clear on the spec swap too.
    hoverOver(canvas, "edge:r1");
    onHoverIdentity.mockClear();
    onEdgeHover.mockClear();
    renderer.setSpec(makeSpec(GRAPH_SCENE));
    expect(onEdgeHover).toHaveBeenCalledWith(null);
    renderer.dispose();
  });
});
