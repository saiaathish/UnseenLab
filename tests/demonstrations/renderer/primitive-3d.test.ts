/**
 * primitive-3d renderer tests — jsdom-safe.
 *
 * jsdom has no WebGL rasterizer and no rAF/ResizeObserver, so:
 *  - scene-graph + operator tests are pure (no Three.js at all),
 *  - renderer tests mock 'three' with a minimal stub (recording dispose()
 *    calls) and drive a fake requestAnimationFrame queue, exactly like the
 *    lumina-2d runner tests. No rasterization is ever verified — the WebGL
 *    guard, lifecycle and math are what is exercised here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANIMATION_OPERATORS,
  PRIMITIVE_KINDS,
  RELATIONSHIP_OPERATORS,
  SPEC_LIMITS,
} from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import {
  buildSceneGraph,
  cascadeOrder,
  DEFAULT_COLOR,
  deriveGraphEdges,
  edgeCausalPath,
  isGraphLikeScene,
  isSafeColor,
} from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  CHANGE_COLOR_PALETTE,
  makeNodeState,
  OPERATOR_SHAPES,
  OP_CLAMPS,
  stepOperator,
  validateOperatorParams,
} from "@/demonstrations/renderers/primitive-3d/operators";
import {
  clampDt,
  isCanvasOwned,
  KIND_GEOMETRY_PLAN,
  MAX_DT,
  PrimitiveSceneRenderer,
} from "@/demonstrations/renderers/primitive-3d/renderer";

// ---------------------------------------------------------------------------
// Mock 'three' (hoisted so it applies to renderer.ts + materials.ts imports)
// ---------------------------------------------------------------------------

// The stub deliberately mirrors Three.js constructor signatures, so unused
// parameters (e.g. `_c`, `_w`) are expected here.
/* eslint-disable @typescript-eslint/no-unused-vars */
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
/* eslint-enable @typescript-eslint/no-unused-vars */

// ---------------------------------------------------------------------------
// Spec factory
// ---------------------------------------------------------------------------

type Scene3D = NonNullable<DemoSpecV1["scene3d"]>;

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
// buildSceneGraph (pure)
// ---------------------------------------------------------------------------

describe("buildSceneGraph", () => {
  it("accepts all 18 primitive kinds without reasons", () => {
    const spec = makeSpec({
      objects: PRIMITIVE_KINDS.map((kind, i) => ({ id: `o_${i}`, kind })),
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(graph.nodes).toHaveLength(PRIMITIVE_KINDS.length);
    expect(reasons).toEqual([]);
    for (const kind of PRIMITIVE_KINDS) {
      expect(graph.nodes.some((n) => n.kind === kind), kind).toBe(true);
    }
  });

  it("rejects unknown primitive kinds and drops the node", () => {
    const spec = makeSpec({
      objects: [
        { id: "a", kind: "sphere" },
        { id: "b", kind: "dodecahedron" as never },
      ],
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(graph.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(reasons).toContain("unknown_primitive_kind");
  });

  it("caps 200 objects to 80 with a reason", () => {
    const objects = Array.from({ length: 200 }, (_, i) => ({
      id: `o${i}`,
      kind: "sphere" as const,
    }));
    const { graph, reasons } = buildSceneGraph(makeSpec({ objects }));
    expect(graph.nodes).toHaveLength(SPEC_LIMITS.maxObjects);
    expect(reasons).toContain("objects_capped");
  });

  it("flattens group nesting deeper than 4 with a reason", () => {
    const objects = [
      { id: "g1", kind: "group" as const, children: ["g2"] },
      { id: "g2", kind: "group" as const, children: ["g3"] },
      { id: "g3", kind: "group" as const, children: ["g4"] },
      { id: "g4", kind: "group" as const, children: ["g5"] },
      { id: "g5", kind: "group" as const, children: ["leaf"] },
      { id: "leaf", kind: "sphere" as const },
    ];
    const { graph, reasons } = buildSceneGraph(makeSpec({ objects }));
    expect(reasons).toContain("group_depth_flattened");
    const g4 = graph.nodes.find((n) => n.id === "g4")!;
    const g5 = graph.nodes.find((n) => n.id === "g5")!;
    const leaf = graph.nodes.find((n) => n.id === "leaf")!;
    expect(g4.children).toEqual([]); // g5 flattened away
    expect(g5.depth).toBe(1); // g5 and leaf are roots now
    expect(leaf.depth).toBe(1);
  });

  it("drops dangling child refs with a reason", () => {
    const spec = makeSpec({
      objects: [
        { id: "g", kind: "group", children: ["ghost"] },
        { id: "a", kind: "sphere" },
      ],
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(graph.nodes.find((n) => n.id === "g")!.children).toEqual([]);
    expect(reasons).toContain("missing_child_ref");
  });

  it("rejects unsafe colors and keeps a safe allowlist", () => {
    expect(isSafeColor("#0f8")).toBe(true);
    expect(isSafeColor("#a1b2c3")).toBe(true);
    expect(isSafeColor("#A1B2C3FF")).toBe(true);
    expect(isSafeColor("red")).toBe(true);
    expect(isSafeColor("Coral")).toBe(true);
    expect(isSafeColor("url(http://evil/x.png)")).toBe(false);
    expect(isSafeColor("var(--accent)")).toBe(false);
    expect(isSafeColor("linear-gradient(red, blue)")).toBe(false);
    expect(isSafeColor("expression(alert(1))")).toBe(false);

    const spec = makeSpec({
      objects: [
        { id: "a", kind: "sphere", color: "url(javascript:alert(1))" },
        { id: "b", kind: "sphere", color: "#00ff88" },
      ],
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(graph.nodes.find((n) => n.id === "a")!.color).toBe(DEFAULT_COLOR);
    expect(graph.nodes.find((n) => n.id === "b")!.color).toBe("#00ff88");
    expect(reasons).toContain("color_rejected");
  });

  it("drops relationships with missing refs and passes all 12 operators", () => {
    const spec = makeSpec({
      objects: [
        { id: "a", kind: "sphere" },
        { id: "b", kind: "sphere" },
      ],
      relationships: [
        ...RELATIONSHIP_OPERATORS.map((type, i) => ({
          id: `r${i}`,
          type,
          from: "a",
          to: "b",
        })),
        { id: "dangling", type: "attracts", from: "a", to: "ghost" },
        { id: "badtype", type: "gravitates_toward" as never, from: "a", to: "b" },
      ],
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(graph.relationships).toHaveLength(RELATIONSHIP_OPERATORS.length);
    expect(reasons).toContain("relationship_ref_missing");
    expect(reasons).toContain("unknown_relationship_type");
  });

  it("caps relationships at 100 with a reason", () => {
    const relationships = Array.from({ length: 120 }, (_, i) => ({
      id: `r${i}`,
      type: "attracts" as const,
      from: "a",
      to: "b",
    }));
    const { graph, reasons } = buildSceneGraph(
      makeSpec({
        objects: [
          { id: "a", kind: "sphere" },
          { id: "b", kind: "sphere" },
        ],
        relationships,
      })
    );
    expect(graph.relationships).toHaveLength(SPEC_LIMITS.maxRelationships);
    expect(reasons).toContain("relationships_capped");
  });

  it("clamps trailPoints and particleCount (desktop 1500 / mobile 500)", () => {
    const desktop = buildSceneGraph(
      makeSpec({
        objects: [
          { id: "p", kind: "particle_field", particleCount: 100_000 },
          { id: "t", kind: "sphere", trailPoints: 10_000 },
        ],
      })
    );
    expect(desktop.graph.nodes.find((n) => n.id === "p")!.particleCount).toBe(
      SPEC_LIMITS.maxParticlesDesktop
    );
    expect(desktop.graph.nodes.find((n) => n.id === "t")!.trailPoints).toBe(
      SPEC_LIMITS.maxTrailPoints
    );
    expect(desktop.reasons).toContain("particle_count_clamped");
    expect(desktop.reasons).toContain("trail_points_clamped");
    expect(desktop.graph.limits.particleLimit).toBe(
      SPEC_LIMITS.maxParticlesDesktop
    );

    const mobile = buildSceneGraph(
      makeSpec({
        objects: [{ id: "p", kind: "particle_field", particleCount: 100_000 }],
      }),
      { mobile: true }
    );
    expect(mobile.graph.nodes[0].particleCount).toBe(
      SPEC_LIMITS.maxParticlesMobile
    );
    expect(mobile.graph.limits.particleLimit).toBe(SPEC_LIMITS.maxParticlesMobile);
  });

  it("drops labels beyond 25 with a reason but keeps the nodes", () => {
    const objects = Array.from({ length: 30 }, (_, i) => ({
      id: `l${i}`,
      kind: "label" as const,
      label: `Label ${i}`,
    }));
    const { graph, reasons } = buildSceneGraph(makeSpec({ objects }));
    expect(graph.nodes).toHaveLength(30);
    expect(graph.nodes.filter((n) => n.label !== undefined)).toHaveLength(
      SPEC_LIMITS.maxLabels
    );
    expect(reasons).toContain("label_cap_exceeded");
  });

  it("drops animations with missing targets and clamps operator params", () => {
    const spec = makeSpec({
      objects: [{ id: "a", kind: "sphere" }],
      animations: [
        { id: "m1", target: "ghost", operator: "rotate" },
        {
          id: "m2",
          target: "a",
          operator: "oscillate",
          amplitude: 50,
          speed: 99,
          delayMs: 99_999,
        },
      ],
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(graph.animations).toHaveLength(1);
    expect(reasons).toContain("animation_target_missing");
    expect(reasons).toContain("operator_param_clamped");
    const anim = graph.animations[0];
    expect(anim.speed).toBe(OP_CLAMPS.maxSpeed);
    expect(anim.amplitude).toBe(OP_CLAMPS.maxAmplitude);
    expect(anim.delayMs).toBe(OP_CLAMPS.maxDelayMs);
  });

  it("derives orbit centers from orbits relationships and paths for follow_path", () => {
    const spec = makeSpec({
      objects: [
        { id: "sun", kind: "sphere", position: { x: 0, y: 0, z: 0 } },
        { id: "planet", kind: "sphere", position: { x: 5, y: 0, z: 0 } },
        { id: "n1", kind: "process_node", position: { x: 0, y: 0, z: 0 } },
        { id: "n2", kind: "process_node", position: { x: 3, y: 0, z: 0 } },
      ],
      relationships: [
        { id: "r1", type: "orbits", from: "planet", to: "sun" },
        { id: "r2", type: "flows_to", from: "n1", to: "n2" },
      ],
      animations: [
        { id: "a1", target: "planet", operator: "orbit" },
        { id: "a2", target: "n1", operator: "follow_path" },
      ],
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(reasons).toEqual([]);
    const orbit = graph.animations.find((a) => a.id === "a1")!;
    expect(orbit.orbitCenter).toEqual({ x: 0, y: 0, z: 0 });
    expect(orbit.orbitRadius).toBeCloseTo(5, 6);
    const fp = graph.animations.find((a) => a.id === "a2")!;
    expect(fp.path).toHaveLength(3); // [n1, n2, n1] closed loop
  });

  it("drops follow_path animations that have no derivable path", () => {
    const spec = makeSpec({
      objects: [{ id: "a", kind: "sphere" }],
      animations: [{ id: "m1", target: "a", operator: "follow_path" }],
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(graph.animations).toEqual([]);
    expect(reasons).toContain("follow_path_needs_path");
  });

  it("returns an empty graph with a reason when scene3d is absent", () => {
    const { graph, reasons } = buildSceneGraph(makeSpec(null));
    expect(graph.nodes).toEqual([]);
    expect(graph.relationships).toEqual([]);
    expect(graph.animations).toEqual([]);
    expect(reasons).toContain("no_scene3d");
  });
});

// ---------------------------------------------------------------------------
// Canonical graph derivation (semantic mirror — pure)
// ---------------------------------------------------------------------------

describe("canonical graph derivation", () => {
  function graphSpec(
    scene: Partial<Scene3D> | null
  ): ReturnType<typeof buildSceneGraph>["graph"] {
    return buildSceneGraph(makeSpec(scene)).graph;
  }

  it("isGraphLikeScene: node-style objects with typed relationships", () => {
    expect(
      isGraphLikeScene(
        graphSpec({
          objects: [
            { id: "a", kind: "process_node", position: { x: -3, y: 1, z: 0 } },
            { id: "b", kind: "process_node", position: { x: 0, y: 1, z: 0 } },
          ],
          relationships: [{ id: "r1", type: "causes", from: "a", to: "b" }],
        })
      )
    ).toBe(true);
    // spheres connected by a relationship are a graph too (field_relationship)
    expect(
      isGraphLikeScene(
        graphSpec({
          objects: [
            { id: "s1", kind: "sphere" },
            { id: "s2", kind: "sphere" },
          ],
          relationships: [{ id: "r1", type: "attracts", from: "s1", to: "s2" }],
        })
      )
    ).toBe(true);
  });

  it("isGraphLikeScene: containment/structural scenes are not graphs", () => {
    // particle_population / layered_system style: group → particle_field/box
    expect(
      isGraphLikeScene(
        graphSpec({
          objects: [
            { id: "g", kind: "group", children: ["pf"] },
            { id: "pf", kind: "particle_field" },
          ],
          relationships: [{ id: "r1", type: "contains", from: "g", to: "pf" }],
        })
      )
    ).toBe(false);
    expect(
      isGraphLikeScene(
        graphSpec({
          objects: [
            { id: "before", kind: "group", children: ["b1"] },
            { id: "b1", kind: "box" },
          ],
          relationships: [
            { id: "r1", type: "transforms_into", from: "before", to: "after" },
          ],
        })
      )
    ).toBe(false);
    // no relationships at all
    expect(isGraphLikeScene(graphSpec({ objects: [{ id: "a", kind: "sphere" }] }))).toBe(false);
  });

  it("deriveGraphEdges: arrowheads at destination, bar for inhibits", () => {
    const graph = graphSpec({
      objects: [
        { id: "a", kind: "process_node", position: { x: -3, y: 1, z: 0 } },
        { id: "b", kind: "process_node", position: { x: 0, y: 1, z: 0 } },
        { id: "c", kind: "process_node", position: { x: 0, y: -1, z: 0 } },
        { id: "d", kind: "process_node", position: { x: 3, y: -1, z: 0 } },
      ],
      relationships: [
        { id: "r1", type: "causes", from: "a", to: "b" },
        { id: "r2", type: "activates", from: "b", to: "c" },
        { id: "r3", type: "inhibits", from: "c", to: "d", label: "blocks" },
      ],
    });
    const plans = deriveGraphEdges(graph);
    expect(plans.map((p) => p.id)).toEqual(["r1", "r2", "r3"]);
    expect(plans[0].from).toEqual({ x: -3, y: 1, z: 0 });
    expect(plans[0].to).toEqual({ x: 0, y: 1, z: 0 });
    expect(plans[0].inhibits).toBe(false);
    expect(plans[1].inhibits).toBe(false);
    expect(plans[2].inhibits).toBe(true);
    expect(plans[2].label).toBe("blocks");
    // label falls back to the relationship type
    expect(plans[0].label).toBe("causes");
  });

  it("deriveGraphEdges: no plans for non-graph or mixed-endpoint scenes", () => {
    // group→group (before_after_comparison) and group→particle_field
    // (particle_population) must not produce edges: the 2D diagram also
    // drops them, so 3D must not invent an interpretation.
    const groupScene = graphSpec({
      objects: [
        { id: "before", kind: "group", children: ["b1"] },
        { id: "b1", kind: "box" },
        { id: "after", kind: "group", children: ["b2"] },
        { id: "b2", kind: "box" },
      ],
      relationships: [{ id: "r1", type: "transforms_into", from: "before", to: "after" }],
    });
    expect(deriveGraphEdges(groupScene)).toEqual([]);
    // endpoint that is not node-like is skipped
    const mixed = graphSpec({
      objects: [
        { id: "a", kind: "process_node" },
        { id: "pf", kind: "particle_field" },
      ],
      relationships: [{ id: "r1", type: "flows_to", from: "a", to: "pf" }],
    });
    expect(deriveGraphEdges(mixed)).toEqual([]);
  });

  it("cascadeOrder: BFS downstream from the selected node", () => {
    const graph = graphSpec({
      objects: [
        { id: "a", kind: "process_node" },
        { id: "b", kind: "process_node" },
        { id: "c", kind: "process_node" },
        { id: "d", kind: "process_node" },
      ],
      relationships: [
        { id: "r1", type: "causes", from: "a", to: "b" },
        { id: "r2", type: "activates", from: "b", to: "c" },
        { id: "r3", type: "activates", from: "b", to: "d" },
        { id: "r4", type: "inhibits", from: "d", to: "c" },
      ],
    });
    expect(cascadeOrder(graph.relationships, "a")).toEqual(["a", "b", "c", "d"]);
    expect(cascadeOrder(graph.relationships, "b")).toEqual(["b", "c", "d"]);
    expect(cascadeOrder(graph.relationships, "c")).toEqual(["c"]);
  });

  it("edgeCausalPath: edge endpoints + downstream nodes and edges", () => {
    const graph = graphSpec({
      objects: [
        { id: "a", kind: "process_node" },
        { id: "b", kind: "process_node" },
        { id: "c", kind: "process_node" },
        { id: "d", kind: "process_node" },
      ],
      relationships: [
        { id: "r1", type: "causes", from: "a", to: "b" },
        { id: "r2", type: "activates", from: "b", to: "c" },
        { id: "r3", type: "activates", from: "b", to: "d" },
      ],
    });
    const path = edgeCausalPath(graph.relationships, "r1")!;
    expect(path.nodes).toEqual(["a", "b", "c", "d"]);
    expect(path.edges).toEqual(["r1", "r2", "r3"]);
    const sub = edgeCausalPath(graph.relationships, "r2")!;
    expect(sub.nodes).toEqual(["b", "c"]);
    expect(sub.edges).toEqual(["r2"]);
    expect(edgeCausalPath(graph.relationships, "ghost")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Operator validation + step math (pure)
// ---------------------------------------------------------------------------

describe("operator parameter validation", () => {
  it("defines a shape for all 12 animation operators", () => {
    expect(ANIMATION_OPERATORS).toHaveLength(12);
    for (const op of ANIMATION_OPERATORS) {
      expect(OPERATOR_SHAPES[op], op).toBeDefined();
      const v = validateOperatorParams({ operator: op });
      expect(v.ok, op).toBe(true);
    }
  });

  it("clamps amplitude to 2, speed to 5, delayMs to 10000", () => {
    const v = validateOperatorParams({
      operator: "oscillate",
      speed: 50,
      amplitude: 99,
      delayMs: 60_000,
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.params.speed).toBe(OP_CLAMPS.maxSpeed);
      expect(v.params.amplitude).toBe(OP_CLAMPS.maxAmplitude);
      expect(v.params.delayMs).toBe(OP_CLAMPS.maxDelayMs);
      expect(v.reasons).toContain("operator_param_clamped");
    }
  });

  it("rejects unknown operators and invalid axes", () => {
    expect(validateOperatorParams({ operator: "spin" }).ok).toBe(false);
    expect(
      validateOperatorParams({ operator: "rotate", axis: "w" }).ok
    ).toBe(false);
  });

  it("applies per-operator defaults (rotate: y axis, speed 1)", () => {
    const v = validateOperatorParams({ operator: "rotate" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.params.speed).toBe(1);
      expect(v.params.delayMs).toBe(0);
      expect(v.params.axis).toBe("y");
      expect(v.params.amplitude).toBe(1);
    }
    const osc = validateOperatorParams({ operator: "oscillate" });
    if (osc.ok) expect(osc.params.axis).toBe("x");
  });
});

describe("operator step math", () => {
  it("oscillate at t=0.25 with amplitude A offsets by A*sin(2π*0.25)", () => {
    const A = 1.3;
    const state = makeNodeState({ position: { x: 0, y: 0, z: 0 } });
    const out = stepOperator(
      { operator: "oscillate", params: { speed: 1, delayMs: 0, amplitude: A, axis: "x" } },
      state,
      0,
      0.25
    );
    expect(out.position.x).toBeCloseTo(A * Math.sin(2 * Math.PI * 0.25), 6);
    expect(out.position.y).toBe(0);
    expect(out.position.z).toBe(0);
  });

  it("rotate advances the axis angle by speed*dt between frames", () => {
    const state = makeNodeState({});
    const op = {
      operator: "rotate" as const,
      params: { speed: 2, delayMs: 0, axis: "y" as const, amplitude: 1 },
    };
    const t1 = stepOperator(op, state, 0.016, 0.5);
    const t2 = stepOperator(op, state, 0.016, 0.516);
    expect(t2.rotation.y - t1.rotation.y).toBeCloseTo(2 * 0.016, 6);
    expect(t2.rotation.y).toBeCloseTo(2 * 0.516, 6);
  });

  it("respects delayMs before starting", () => {
    const state = makeNodeState({});
    const op = {
      operator: "rotate" as const,
      params: { speed: 1, delayMs: 1000, axis: "y" as const, amplitude: 1 },
    };
    const before = stepOperator(op, state, 0, 0.9);
    const after = stepOperator(op, state, 0, 1.1);
    expect(before.rotation.y).toBe(0);
    expect(after.rotation.y).toBeCloseTo(0.1, 6);
  });

  it("pulse keeps opacity within [0, 1] at all times", () => {
    const state = makeNodeState({});
    const op = {
      operator: "pulse" as const,
      params: { speed: 2, delayMs: 0, amplitude: 2, axis: undefined },
    };
    for (let i = 0; i <= 400; i++) {
      const out = stepOperator(op, state, 0.01, i / 100);
      expect(out.opacity).toBeGreaterThanOrEqual(0);
      expect(out.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("follow_path positions the node along the waypoints and loops", () => {
    const state = makeNodeState({ position: { x: 0, y: 0, z: 0 } });
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 },
    ];
    const op = {
      operator: "follow_path" as const,
      params: { speed: 1, delayMs: 0, amplitude: 1, path },
    };
    const p0 = stepOperator(op, state, 0, 0).position;
    expect(p0.x).toBe(0);
    const q = stepOperator(op, state, 0, 0.25).position; // lerp(p0,p1,0.25)
    expect(q.x).toBeCloseTo(2.5, 6);
    const r = stepOperator(op, state, 0, 1.25).position; // lerp(p1,p2,0.25)
    expect(r.x).toBeCloseTo(10, 6);
    expect(r.z).toBeCloseTo(2.5, 6);
    const s2 = stepOperator(op, state, 0, 2.0).position; // lerp(p2,p0,0) → p2
    expect(s2.x).toBeCloseTo(10, 6);
    expect(s2.z).toBeCloseTo(10, 6);
    const s3 = stepOperator(op, state, 0, 2.5).position; // lerp(p2,p0,0.5)
    expect(s3.x).toBeCloseTo(5, 6);
    expect(s3.z).toBeCloseTo(5, 6);
    const s4 = stepOperator(op, state, 0, 3.0).position; // loops back to p0
    expect(s4.x).toBe(0);
    expect(s4.z).toBe(0);
  });

  it("orbit moves the node around its derived center", () => {
    const state = makeNodeState({ position: { x: 2, y: 0, z: 0 } });
    const op = {
      operator: "orbit" as const,
      params: {
        speed: 1,
        delayMs: 0,
        amplitude: 1,
        axis: "y" as const,
        orbitCenter: { x: 0, y: 0, z: 0 },
        orbitRadius: 2,
      },
    };
    // θ0 = atan2(0, 2) = 0, so after t seconds: x = 2cos(t), z = 2sin(t).
    const q = stepOperator(op, state, 0, 0.25).position;
    expect(q.x).toBeCloseTo(2 * Math.cos(0.25), 6);
    expect(q.z).toBeCloseTo(2 * Math.sin(0.25), 6);
    const quarter = stepOperator(op, state, 0, Math.PI / 2).position;
    expect(quarter.x).toBeCloseTo(0, 5);
    expect(quarter.z).toBeCloseTo(2, 5);
    expect(quarter.y).toBe(0); // y stays at the base height
  });

  it("translate drifts along the axis by speed*amplitude*t", () => {
    const state = makeNodeState({ position: { x: 1, y: 0, z: 0 } });
    const out = stepOperator(
      { operator: "translate", params: { speed: 2, delayMs: 0, amplitude: 0.5, axis: "x" } },
      state,
      0,
      3
    );
    expect(out.position.x).toBeCloseTo(1 + 2 * 0.5 * 3, 6);
  });

  it("change_color cycles the safe palette", () => {
    const state = makeNodeState({ color: "#5b8def" });
    const op = {
      operator: "change_color" as const,
      params: { speed: 1, delayMs: 0, amplitude: 1 },
    };
    const a = stepOperator(op, state, 0, 0.4).color;
    const b = stepOperator(op, state, 0, 1.4).color;
    expect(a).toBe(CHANGE_COLOR_PALETTE[0]);
    expect(b).toBe(CHANGE_COLOR_PALETTE[1]);
    expect(a).not.toBe(state.color);
  });

  it("fade/reveal are continuous normally and discrete under reducedMotion", () => {
    const state = makeNodeState({});
    const fade = {
      operator: "fade" as const,
      params: { speed: 1, delayMs: 0, amplitude: 1 },
    };
    const reveal = {
      operator: "reveal" as const,
      params: { speed: 1, delayMs: 0, amplitude: 1 },
    };
    expect(stepOperator(fade, state, 0, 0.5).opacity).toBeCloseTo(0.5, 6);
    expect(stepOperator(fade, state, 0, 2).opacity).toBe(0);
    expect(stepOperator(reveal, state, 0, 2).opacity).toBe(1);
    // reduced motion: stepped
    expect(stepOperator(fade, state, 0, 0.5, { reducedMotion: true }).opacity).toBe(1);
    expect(stepOperator(fade, state, 0, 2, { reducedMotion: true }).opacity).toBe(0);
    expect(stepOperator(reveal, state, 0, 0.5, { reducedMotion: true }).opacity).toBe(0);
    expect(stepOperator(reveal, state, 0, 2, { reducedMotion: true }).opacity).toBe(1);
  });

  it("reducedMotion freezes oscillate/pulse/emit", () => {
    const state = makeNodeState({ position: { x: 0, y: 0, z: 0 } });
    const osc = stepOperator(
      { operator: "oscillate", params: { speed: 1, delayMs: 0, amplitude: 2, axis: "x" } },
      state,
      0,
      0.25,
      { reducedMotion: true }
    );
    expect(osc.position.x).toBe(0);
    const pulse = stepOperator(
      { operator: "pulse", params: { speed: 1, delayMs: 0, amplitude: 2 } },
      state,
      0,
      0.25,
      { reducedMotion: true }
    );
    expect(pulse.opacity).toBe(1);
    const emit = stepOperator(
      { operator: "emit", params: { speed: 1, delayMs: 0, amplitude: 1 } },
      state,
      0,
      5,
      { reducedMotion: true }
    );
    expect(emit.emitting).toBe(false);
  });

  it("emit turns on once the delay has passed", () => {
    const state = makeNodeState({});
    const op = {
      operator: "emit" as const,
      params: { speed: 1, delayMs: 500, amplitude: 1 },
    };
    expect(stepOperator(op, state, 0, 0.4).emitting).toBe(false);
    expect(stepOperator(op, state, 0, 0.6).emitting).toBe(true);
  });

  it("every operator keeps outputs finite", () => {
    const state = makeNodeState({ position: { x: 1, y: 2, z: 3 } });
    for (const op of ANIMATION_OPERATORS) {
      const v = validateOperatorParams({ operator: op });
      if (!v.ok) continue;
      const out = stepOperator({ operator: op, params: v.params }, state, 0.016, 3.7);
      expect(Number.isFinite(out.position.x), op).toBe(true);
      expect(Number.isFinite(out.position.y), op).toBe(true);
      expect(Number.isFinite(out.position.z), op).toBe(true);
      expect(Number.isFinite(out.scale), op).toBe(true);
      expect(Number.isFinite(out.opacity), op).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Renderer lifecycle (WebGL-free: mocked three, fake rAF)
// ---------------------------------------------------------------------------

describe("primitive renderer lifecycle", () => {
  let rafQueue: Array<(t: number) => void> = [];
  let cancelledRafIds: number[] = [];
  let rafIdCounter = 0;
  let documentHidden = false;

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

  function setDocumentHidden(v: boolean) {
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

  function makeCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
  }

  /** Pretend WebGL is available: getContext returns a non-null stub. */
  function mockWebGL(canvas: HTMLCanvasElement) {
    vi.spyOn(canvas, "getContext").mockReturnValue({} as never);
  }

  beforeEach(() => {
    rafQueue = [];
    cancelledRafIds = [];
    rafIdCounter = 0;
    documentHidden = false;
    threeStub.reset();
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      rafQueue.push(cb);
      return ++rafIdCounter;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelledRafIds.push(id);
    });
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    rafQueue = [];
    cancelledRafIds = [];
    setDocumentHidden(false);
    vi.unstubAllGlobals();
  });

  it("reports webgl_unavailable and never starts a loop when WebGL is missing", () => {
    const canvas = makeCanvas();
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    const onError = vi.fn();
    const renderer = new PrimitiveSceneRenderer(canvas, { onError });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "webgl_unavailable" })
    );
    expect(rafQueue.length).toBe(0); // no loop started
    expect(renderer.getStatus()).toBe("webgl_unavailable");
    // dispose is safe and releases the canvas
    renderer.dispose();
    expect(isCanvasOwned(canvas)).toBe(false);
    const again = new PrimitiveSceneRenderer(canvas, { onError });
    again.dispose();
  });

  it("dispose cancels the loop, disposes the renderer and releases the canvas", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    fireFrame(1000);
    expect(rafQueue.length).toBe(1); // loop rescheduled
    renderer.dispose();
    expect(cancelledRafIds.length).toBeGreaterThan(0);
    fireFrame(2000);
    expect(rafQueue.length).toBe(0); // stale callback must not reschedule
    expect(renderer.getStatus()).toBe("disposed");
    expect(threeStub.disposed).toContain("WebGLRenderer");
    expect(isCanvasOwned(canvas)).toBe(false);
    const again = new PrimitiveSceneRenderer(canvas);
    again.dispose();
  });

  it("pauses time advancement while the document is hidden", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    fireFrame(1000); // clock frame
    fireFrame(1100); // +0.05 (clamped)
    fireFrame(1150); // +0.05
    expect(renderer.getSimTime()).toBeCloseTo(0.1, 6);

    setDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    fireFrame(1200);
    fireFrame(1250);
    fireFrame(1300);
    expect(renderer.getSimTime()).toBeCloseTo(0.1, 6); // paused: no advance

    renderer.setPlaying(true);
    fireFrame(1400); // clock re-establish
    fireFrame(1450); // +0.05
    expect(renderer.getSimTime()).toBeGreaterThan(0.1);
    renderer.dispose();
  });

  it("setSpec builds a scene graph and disposes the previous scene on swap", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    threeStub.reset();

    renderer.setSpec(
      makeSpec({
        objects: [
          { id: "a", kind: "sphere" },
          { id: "b", kind: "box", position: { x: 3, y: 0, z: 0 } },
        ],
      })
    );
    expect(renderer.getSceneGraph()?.nodes).toHaveLength(2);
    expect(renderer.getStatus()).toBe("ready");
    expect(threeStub.disposed).not.toContain("Geometry");

    renderer.setSpec(
      makeSpec({
        objects: [{ id: "c", kind: "box" }],
      })
    );
    expect(renderer.getSceneGraph()?.nodes).toHaveLength(1);
    expect(threeStub.disposed).toContain("Geometry"); // scene A disposed
    renderer.dispose();
    expect(threeStub.disposed).toContain("WebGLRenderer");
  });

  it("advances time and applies operators over frames (smoke, no rasterization)", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    renderer.setSpec(
      makeSpec({
        objects: [{ id: "a", kind: "sphere" }],
        animations: [
          { id: "m1", target: "a", operator: "oscillate", amplitude: 1, axis: "x" },
        ],
      })
    );
    renderer.setSpeed(2);
    fireFrame(1000);
    fireFrame(1100); // dt 0.1 → 0.05, speed 2 → +0.1 s
    fireFrame(1150); // +0.1 s
    expect(renderer.getSimTime()).toBeCloseTo(0.2, 6);
    renderer.dispose();
    expect(threeStub.disposed).toContain("WebGLRenderer");
  });

  it("covers all 18 primitive kinds in the geometry plan", () => {
    expect(Object.keys(KIND_GEOMETRY_PLAN).sort()).toEqual(
      [...PRIMITIVE_KINDS].sort()
    );
  });

  it("clamps dt like the lumina-2d runner", () => {
    expect(clampDt(1e9)).toBe(MAX_DT);
    expect(clampDt(-5)).toBe(0);
    expect(clampDt(NaN)).toBe(0);
    expect(clampDt(0.01)).toBe(0.01);
  });
});

// ---------------------------------------------------------------------------
// Graph interaction surface (graph-like scenes: derived edges + selection)
// ---------------------------------------------------------------------------

describe("graph interaction surface", () => {
  let rafQueue: Array<(t: number) => void> = [];
  let rafIdCounter = 0;

  class FakeResizeObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  function makeCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
  }

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

  beforeEach(() => {
    rafQueue = [];
    rafIdCounter = 0;
    threeStub.reset();
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      rafQueue.push(cb);
      return ++rafIdCounter;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafQueue.length = 0;
      void id;
    });
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    rafQueue = [];
    vi.unstubAllGlobals();
  });

  function clickCanvas(canvas: HTMLCanvasElement, x = 120, y = 80) {
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true })
    );
    canvas.dispatchEvent(
      new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true })
    );
  }

  function pressKey(canvas: HTMLCanvasElement, key: string) {
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }

  it("enters graph mode for node+relationship scenes; engineMapping opts out", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const renderer = new PrimitiveSceneRenderer(canvas);
    renderer.setSpec(makeSpec(GRAPH_SCENE));
    expect(renderer.getGraphMode()).toBe(true);
    renderer.dispose();

    // Engine-coupled hybrid showcase (orbits-style): NOT a graph.
    const canvas2 = makeCanvas();
    mockWebGL(canvas2);
    const hybrid = new PrimitiveSceneRenderer(canvas2);
    hybrid.setSpec(
      makeSpec({
        objects: [
          { id: "star", kind: "sphere" },
          { id: "planet", kind: "sphere" },
        ],
        relationships: [{ id: "r1", type: "orbits", from: "planet", to: "star" }],
      }),
      { engineMapping: { planet: { body: "planet", scale: 1 } } }
    );
    expect(hybrid.getGraphMode()).toBe(false);
    hybrid.dispose();

    // Containment scene (particle_population style): not a graph.
    const canvas3 = makeCanvas();
    mockWebGL(canvas3);
    const containment = new PrimitiveSceneRenderer(canvas3);
    containment.setSpec(
      makeSpec({
        objects: [
          { id: "g1", kind: "group", children: ["pf1"] },
          { id: "pf1", kind: "particle_field", particleCount: 4 },
        ],
        relationships: [{ id: "r1", type: "contains", from: "g1", to: "pf1" }],
      })
    );
    expect(containment.getGraphMode()).toBe(false);
    containment.dispose();
  });

  it("keyboard: canvas focus + arrow keys move node focus, Enter selects and manipulates, Escape clears", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const onNodeSelect = vi.fn();
    const onNodeManipulate = vi.fn();
    const onEdgeSelect = vi.fn();
    const renderer = new PrimitiveSceneRenderer(canvas, {
      onNodeSelect,
      onNodeManipulate,
      onEdgeSelect,
    });
    renderer.setSpec(makeSpec(GRAPH_SCENE));
    expect(renderer.getGraphMode()).toBe(true);
    expect(canvas.tabIndex).toBe(0);

    canvas.dispatchEvent(new FocusEvent("focus"));
    pressKey(canvas, "Enter");
    expect(onNodeSelect).toHaveBeenLastCalledWith("a");
    expect(onNodeManipulate).toHaveBeenLastCalledWith("a");
    // The focused node is announced in the canvas's accessible name.
    expect(canvas.getAttribute("aria-label")).toContain("Cause A");

    pressKey(canvas, "ArrowRight");
    pressKey(canvas, "Enter");
    expect(onNodeSelect).toHaveBeenLastCalledWith("b");
    expect(onNodeManipulate).toHaveBeenLastCalledWith("b");

    pressKey(canvas, "Escape");
    expect(onNodeSelect).toHaveBeenLastCalledWith(null);
    expect(onEdgeSelect).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it("pointer: clicking a node selects + manipulates it, empty click clears", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const onNodeSelect = vi.fn();
    const onNodeManipulate = vi.fn();
    const renderer = new PrimitiveSceneRenderer(canvas, {
      onNodeSelect,
      onNodeManipulate,
    });
    renderer.setSpec(makeSpec(GRAPH_SCENE));

    // Hit node "b" (name fallback resolves the node id).
    threeStub.raycastHits.push({
      object: { name: "b", parent: null } as never,
      distance: 1,
      point: {},
    });
    clickCanvas(canvas);
    expect(onNodeSelect).toHaveBeenCalledWith("b");
    expect(onNodeManipulate).toHaveBeenCalledWith("b");

    // Empty click clears the selection.
    threeStub.raycastHits.length = 0;
    clickCanvas(canvas);
    expect(onNodeSelect).toHaveBeenLastCalledWith(null);
    renderer.dispose();
  });

  it("pointer: clicking an edge selects it (edge-path dim) and clears node selection", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const onNodeSelect = vi.fn();
    const onEdgeSelect = vi.fn();
    const renderer = new PrimitiveSceneRenderer(canvas, {
      onNodeSelect,
      onEdgeSelect,
    });
    renderer.setSpec(makeSpec(GRAPH_SCENE));

    threeStub.raycastHits.push({
      object: { name: "edge:r3", parent: null } as never,
      distance: 1,
      point: {},
    });
    clickCanvas(canvas);
    expect(onEdgeSelect).toHaveBeenCalledWith("r3");
    expect(onNodeSelect).not.toHaveBeenCalled();

    // Re-click the same edge: no duplicate callback.
    clickCanvas(canvas);
    expect(onEdgeSelect).toHaveBeenCalledTimes(1);

    threeStub.raycastHits.length = 0;
    clickCanvas(canvas);
    expect(onEdgeSelect).toHaveBeenLastCalledWith(null);
    renderer.dispose();
  });

  it("non-graph scenes ignore pointer picks and keyboard selection", () => {
    const canvas = makeCanvas();
    mockWebGL(canvas);
    const onNodeSelect = vi.fn();
    const onEdgeSelect = vi.fn();
    const onNodeManipulate = vi.fn();
    const renderer = new PrimitiveSceneRenderer(canvas, {
      onNodeSelect,
      onEdgeSelect,
      onNodeManipulate,
    });
    renderer.setSpec(
      makeSpec({
        objects: [{ id: "a", kind: "box" }],
        relationships: [],
        animations: [],
      })
    );
    expect(renderer.getGraphMode()).toBe(false);
    threeStub.raycastHits.push({
      object: { name: "a", parent: null } as never,
      distance: 1,
      point: {},
    });
    clickCanvas(canvas);
    pressKey(canvas, "Enter");
    expect(onNodeSelect).not.toHaveBeenCalled();
    expect(onEdgeSelect).not.toHaveBeenCalled();
    expect(onNodeManipulate).not.toHaveBeenCalled();
    renderer.dispose();
  });
});
