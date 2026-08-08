/**
 * layout.test.ts — C1 layout engine unit tests (3D Representation Quality
 * Program, Wave 3; design-1 §2/§3/§5/§10.1 tests 8–25). Pure functions only:
 * resolveLayout / derivePacketSlidePath never touch Three.js, DOM or the
 * network, so these tests build plain SceneGraph fixtures by hand (the same
 * determinism contract the 3D renderer and the 2D diagram share).
 *
 * Coverage: determinism (same seed → identical output; collision-free scenes
 * are seed-independent), bounded repulsion (caps + no infinite loop),
 * grid-slot reflow fallback (≥ 8 stuck units), eligibility boundaries (physics
 * showcase bodies never move; non-graph scenes pass through), slidePath
 * semantics (packets stop at the destination envelope, never leave scene
 * bounds), z-plane canonicalization, group rigidity, and the
 * degrade-by-simplification ordering (spread → shorten labels → suppress edge
 * labels → layout_collision_remaining).
 */

import { describe, expect, it } from "vitest";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type {
  SceneGraph,
  SceneGraphAnimation,
  SceneGraphNode,
  SceneGraphRelationship,
} from "@/demonstrations/renderers/primitive-3d/types";
import {
  CANVAS_FIT_CHARS,
  ENVELOPE_CLEARANCE,
  PACKET_SPACING,
  PATH_CLEARANCE,
  envelopeOverlap,
  nodeEnvelope,
} from "@/demonstrations/renderers/primitive-3d/geometry/envelopes";
import {
  GRID_FALLBACK_MIN_UNITS,
  MAX_TOTAL_DISPLACEMENT,
  derivePacketSlidePath,
  resolveLayout,
} from "@/demonstrations/renderers/primitive-3d/layout/resolve-layout";
import {
  isLayoutEligible,
} from "@/demonstrations/renderers/primitive-3d/scene-graph";

// ---------------------------------------------------------------------------
// Fixture builders (plain SceneGraph — pure module under test)
// ---------------------------------------------------------------------------

function node(
  id: string,
  kind: SceneGraphNode["kind"],
  x: number,
  y: number,
  z = 0,
  size = 1,
  label?: string
): SceneGraphNode {
  return {
    id,
    kind,
    position: { x, y, z },
    size,
    color: "#888888",
    children: [],
    trailPoints: 0,
    particleCount: 0,
    depth: 1,
    ...(label !== undefined ? { label } : {}),
  };
}

function graph(
  nodes: SceneGraphNode[],
  relationships: SceneGraphRelationship[] = [],
  animations: SceneGraphAnimation[] = []
): SceneGraph {
  return {
    nodes,
    relationships,
    animations,
    background: "dark",
    limits: {
      maxObjects: 80,
      particleLimit: 1500,
      maxTrailPoints: 140,
      maxLabels: 25,
      maxRelationships: 20,
      maxGroupDepth: 4,
    },
  };
}

/** Two overlapping size-1 spheres (0.5 apart; radii 0.5 + 0.5). */
function overlappingPair(): SceneGraph {
  return graph(
    [
      node("n1", "sphere", 0, 0, 0),
      node("n2", "sphere", 0.5, 0, 0),
    ],
    [{ id: "r1", type: "causes", from: "n1", to: "n2" }]
  );
}

/** Three collinear spheres with one forced overlap (order-preservation case). */
function collinearChain(): SceneGraph {
  return graph(
    [
      node("a", "sphere", 0, 0, 0),
      node("b", "sphere", 0.4, 0, 0), // overlaps a
      node("c", "sphere", 2, 0, 0),
    ],
    [
      { id: "r1", type: "causes", from: "a", to: "b" },
      { id: "r2", type: "causes", from: "b", to: "c" },
    ]
  );
}

/** A fixed obstacle (vector_field) that a movable sphere starts inside. */
function sphereInsideFixedField(): SceneGraph {
  return graph(
    [
      node("wall", "vector_field", 0, 0, 0, 6), // box half 3, fixed
      node("ball", "sphere", 0, 0, 0), // r 0.5, starts at the field center
      node("target", "sphere", 30, 0, 0), // outside the field; graph-likeness
    ],
    [{ id: "r1", type: "causes", from: "ball", to: "target" }]
  );
}

/** GRID_FALLBACK_MIN_UNITS coincident spheres inside a giant fixed box. */
function stuckCluster(count = GRID_FALLBACK_MIN_UNITS): SceneGraph {
  const nodes: SceneGraphNode[] = [];
  for (let i = 1; i <= count; i++) {
    nodes.push(node(`n${i}`, "sphere", 0, 0, 0));
  }
  nodes.push(node("box", "graph_surface", 0, 0, 0, 40)); // fixed, half 20
  return graph(
    nodes,
    [{ id: "r1", type: "causes", from: "n1", to: "n2" }]
  );
}

/** process_flow-shaped scene: pn1/ep1 duplicate + full flow chain. */
function processFlowGraph(): SceneGraph {
  return graph(
    [
      node("pn1", "process_node", -3, 0, 0),
      node("pn2", "process_node", 0, 0, 0),
      node("pn3", "process_node", 3, 0, 0),
      node("ep1", "energy_packet", -3, 0, 0, 0.3), // duplicate of pn1
    ],
    [
      { id: "f1", type: "flows_to", from: "pn1", to: "pn2" },
      { id: "f2", type: "flows_to", from: "pn2", to: "pn3" },
    ],
    [
      {
        id: "a1",
        target: "ep1",
        operator: "translate",
        speed: 1.5,
        delayMs: 0,
        amplitude: 1,
      },
    ]
  );
}

/** energy_transfer-shaped scene: two co-slotted packets from one source. */
function energyTransferGraph(): SceneGraph {
  return graph(
    [
      node("src", "process_node", -3, 0, 0),
      node("sink", "process_node", 3, 0, 0),
      node("ep1", "energy_packet", -3, 0, 0, 0.3),
      node("ep2", "energy_packet", -3, 0, 0, 0.3),
    ],
    [{ id: "t1", type: "transfers_to", from: "src", to: "sink" }],
    [
      {
        id: "a1",
        target: "ep1",
        operator: "translate",
        speed: 1.2,
        delayMs: 0,
        amplitude: 1,
      },
      {
        id: "a2",
        target: "ep2",
        operator: "translate",
        speed: 1.2,
        delayMs: 200,
        amplitude: 1,
      },
    ]
  );
}

function posById(out: ReturnType<typeof resolveLayout>, id: string) {
  const n = out.graph.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`missing node ${id}`);
  return n.position;
}

function movedIds(out: ReturnType<typeof resolveLayout>): string[] {
  return out.layout.moved.map((m) => m.id).sort();
}

// ---------------------------------------------------------------------------
// Determinism (design-1 §2.1, §10.1 test 8)
// ---------------------------------------------------------------------------

describe("resolveLayout — determinism", () => {
  it("same (graph, seed) → byte-identical positions, bounds, reasons and moved list", () => {
    const g = overlappingPair();
    const first = resolveLayout(g, 42);
    const second = resolveLayout(g, 42);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("collision-free scenes are seed-independent (different seed → identical output)", () => {
    const g = graph(
      [
        node("a", "sphere", 0, 0, 0),
        node("b", "sphere", 2, 0, 0),
        node("c", "process_node", 0, 2, 0),
      ],
      [
        { id: "r1", type: "causes", from: "a", to: "b" },
        { id: "r2", type: "causes", from: "b", to: "c" },
      ]
    );
    const s1 = resolveLayout(g, 1);
    const s2 = resolveLayout(g, 2);
    expect(JSON.stringify(s2)).toBe(JSON.stringify(s1));
    expect(s1.layout.repaired).toBe(false);
    expect(s1.reasons).toEqual([]);
  });

  it("an overlapping pair is separated to exactly the I1 clearance", () => {
    const out = resolveLayout(overlappingPair(), 7);
    const pa = posById(out, "n1");
    const pb = posById(out, "n2");
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
    // radii 0.5 + 0.5 + ENVELOPE_CLEARANCE, within the pass-budget tail
    // (each pass halves the remaining depth; ~1e-15 for a single pair).
    expect(d).toBeGreaterThanOrEqual(1 + ENVELOPE_CLEARANCE - 1e-6);
    expect(out.layout.repaired).toBe(true);
    expect(out.reasons).toContain("layout_repaired");
    // Non-coincident centers → deterministic center-axis separation, no jitter.
    expect(pa.x).toBeLessThan(0);
    expect(pb.x).toBeGreaterThan(0.5);
  });

  it("collinear chains never swap order (sequence semantics survive repair)", () => {
    const out = resolveLayout(collinearChain(), 7);
    const order = ["a", "b", "c"].map((id) => posById(out, id).x);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    // Adjacent pairs end at clearance (within the convergence tail).
    expect(order[1] - order[0]).toBeGreaterThanOrEqual(1 + ENVELOPE_CLEARANCE - 1e-6);
  });
});

// ---------------------------------------------------------------------------
// Bounded repulsion (design-1 §2.4, §5, §10.1 tests 13–14)
// ---------------------------------------------------------------------------

describe("resolveLayout — bounded repulsion", () => {
  it("total displacement per unit never exceeds MAX_TOTAL_DISPLACEMENT", () => {
    // The sphere must travel ~20.5 units to exit the box; the budget stops it
    // at MAX_TOTAL_DISPLACEMENT with a documented residual.
    const out = resolveLayout(sphereInsideFixedField(), 3);
    for (const move of out.layout.moved) {
      const d = Math.hypot(
        move.to.x - move.from.x,
        move.to.y - move.from.y,
        move.to.z - move.from.z
      );
      expect(d).toBeLessThanOrEqual(MAX_TOTAL_DISPLACEMENT + 1e-9);
    }
    expect(out.reasons).toContain("layout_iterations_capped");
    expect(out.reasons).toContain("layout_collision_remaining");
  });

  it("never throws on adversarial dense clusters (bounded, no infinite loop)", () => {
    const g = stuckCluster(12);
    const out = resolveLayout(g, 5);
    expect(out.graph.nodes.length).toBe(13);
    expect(out.layout.bounds.radius).toBeGreaterThan(0);
    expect(Array.isArray(out.reasons)).toBe(true);
    // Deterministic even under exhaustion.
    const again = resolveLayout(g, 5);
    expect(JSON.stringify(again)).toBe(JSON.stringify(out));
  });

  it("fixed obstacles never move; the colliding unit absorbs the correction", () => {
    const out = resolveLayout(sphereInsideFixedField(), 3);
    const wall = posById(out, "wall");
    expect(wall).toEqual({ x: 0, y: 0, z: 0 });
    const ball = posById(out, "ball");
    const d = Math.hypot(ball.x, ball.y, ball.z);
    // field half 3 + sphere r 0.5 + clearance
    expect(d).toBeGreaterThanOrEqual(3 + 0.5 + ENVELOPE_CLEARANCE - 1e-9);
    expect(out.layout.repaired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Grid-slot reflow fallback (design-1 §2.4 Phase C, §10.1 test 15)
// ---------------------------------------------------------------------------

describe("resolveLayout — grid-slot reflow fallback", () => {
  it(`triggers when >= ${GRID_FALLBACK_MIN_UNITS} units are stuck`, () => {
    const out = resolveLayout(stuckCluster(), 11);
    expect(out.reasons).toContain("layout_grid_fallback");
    // Reflow + polish ran and the outcome is deterministic.
    const again = resolveLayout(stuckCluster(), 11);
    expect(JSON.stringify(again)).toBe(JSON.stringify(out));
  });

  it("does NOT trigger below the threshold (repulsion alone suffices)", () => {
    // Three mutually overlapping units on a line: deterministic center-axis
    // repulsion resolves them within the pass budget (coincident centers
    // would need slow jitter-axis convergence — jitter is only a deadlock
    // breaker, not the repair mechanism).
    const g = graph(
      [
        node("n1", "sphere", 0, 0, 0),
        node("n2", "sphere", 0.4, 0, 0),
        node("n3", "sphere", 0.8, 0, 0),
      ],
      [
        { id: "r1", type: "causes", from: "n1", to: "n2" },
        { id: "r2", type: "causes", from: "n2", to: "n3" },
      ]
    );
    const out = resolveLayout(g, 9);
    expect(out.reasons).not.toContain("layout_grid_fallback");
    expect(out.reasons).not.toContain("layout_collision_remaining");
    // All three units were spread apart by Phase B (clearance within the
    // convergence tolerance — outer nodes close the gap geometrically and the
    // loop stops once the residual is below the predicate's OVERLAP_EPS).
    const ps = ["n1", "n2", "n3"].map((id) => posById(out, id));
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
        expect(d).toBeGreaterThanOrEqual(1 + ENVELOPE_CLEARANCE - 1e-4);
      }
    }
    // Sequence semantics survive: n1 < n2 < n3 on x.
    expect(ps[0].x).toBeLessThan(ps[1].x);
    expect(ps[1].x).toBeLessThan(ps[2].x);
  });
});

// ---------------------------------------------------------------------------
// Eligibility boundaries (design-1 §1.2, §10.1 tests 17–19)
// ---------------------------------------------------------------------------

describe("resolveLayout — eligibility and the fixed/movable sets", () => {
  it("physics showcase bodies never move: orbit targets and orbit centers are excluded", () => {
    // sun collocated with the planet: an I1 duplicate — but both are engine
    // coupling subjects (orbits.to center + orbit animation target), so the
    // layout must leave them byte-identical.
    const g = graph(
      [
        node("sun", "sphere", 0, 0, 0, 2),
        node("planet", "sphere", 0, 0, 0, 0.5),
      ],
      [{ id: "rel", type: "orbits", from: "planet", to: "sun" }],
      [
        {
          id: "a1",
          target: "planet",
          operator: "orbit",
          speed: 1,
          delayMs: 0,
          amplitude: 1,
          axis: "y",
        },
      ]
    );
    const out = resolveLayout(g, 4);
    expect(out.layout.repaired).toBe(false);
    expect(posById(out, "sun")).toEqual({ x: 0, y: 0, z: 0 });
    expect(posById(out, "planet")).toEqual({ x: 0, y: 0, z: 0 });
    // Never repaired, never grid-reflowed, never label-shortened.
    for (const forbidden of [
      "layout_repaired",
      "layout_grid_fallback",
      "layout_labels_shortened",
    ]) {
      expect(out.reasons).not.toContain(forbidden);
    }
    // The sun/planet envelope overlap is a FIXED-vs-FIXED I1 residual: the
    // layout is forbidden from moving physics bodies, so it records the
    // residual (and the colliding edge-label rect) honestly — the gate's
    // problem, never a physics-body move.
    expect(out.reasons).toContain("layout_collision_remaining");
    expect(movedIds(out)).toEqual([]);
  });

  it("non-graph scenes pass through with bounds only (identity layout)", () => {
    const g = graph([node("a", "sphere", 0, 0, 0), node("b", "sphere", 2, 0, 0)]);
    const out = resolveLayout(g, 1);
    expect(out.layout.repaired).toBe(false);
    expect(out.layout.units).toEqual([]);
    expect(out.reasons).toEqual([]);
    expect(posById(out, "a")).toEqual({ x: 0, y: 0, z: 0 });
    expect(posById(out, "b")).toEqual({ x: 2, y: 0, z: 0 });
    expect(out.layout.bounds.radius).toBeGreaterThan(0);
  });

  it("group units move rigidly: member local offsets are preserved", () => {
    const g = graph(
      [
        node("g", "group", 0, 0, 0),
        node("m1", "sphere", 0, 0, 0),
        node("m2", "sphere", 1, 0, 0),
        node("wall", "vector_field", 0.5, 0, 0, 6), // fixed obstacle
      ],
      [{ id: "r1", type: "causes", from: "m1", to: "m2" }]
    );
    // Member nodes are inside the group container (children wiring).
    const withChildren: SceneGraph = {
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === "g"
          ? { ...n, children: ["m1", "m2"] }
          : n.id === "m1" || n.id === "m2"
            ? { ...n, depth: 2 }
            : n
      ),
    };
    const out = resolveLayout(withChildren, 8);
    const gPos = posById(out, "g");
    const m1 = posById(out, "m1");
    const m2 = posById(out, "m2");
    expect(gPos).not.toEqual({ x: 0, y: 0, z: 0 });
    // Members keep their LOCAL offsets (positions never change — the root
    // translates the whole unit).
    expect(m1).toEqual({ x: 0, y: 0, z: 0 });
    expect(m2).toEqual({ x: 1, y: 0, z: 0 });
    const unit = out.layout.units.find((u) => u.rootId === "g");
    expect(unit).toBeDefined();
    expect(unit!.rootIsGroup).toBe(true);
    expect(unit!.memberIds).toEqual(["m1", "m2"]);
    // World offset m2 − m1 is unchanged by the rigid move.
    expect(m2.x - m1.x).toBe(1);
  });

  it("isLayoutEligible: verified_simulation specs are never layout-eligible", () => {
    const spec = {
      renderer: { kind: "primitive_3d" },
      trust: { level: "verified_simulation" },
      simulation: { engineId: "orbits" },
      scene3d: { objects: [{ id: "a" }, { id: "b" }] },
    } as unknown as DemoSpecV1;
    const g = graph(
      [node("a", "sphere", 0, 0, 0), node("b", "sphere", 2, 0, 0)],
      [{ id: "r1", type: "causes", from: "a", to: "b" }]
    );
    expect(isLayoutEligible(spec, g)).toBe(false);
  });

  it("isLayoutEligible: conceptual graph-like primitive_3d spec is eligible; non-graph / lumina_2d / empty scenes are not", () => {
    const base = {
      renderer: { kind: "primitive_3d" },
      trust: { level: "conceptual_demonstration" },
      scene3d: { objects: [{ id: "a" }, { id: "b" }] },
    } as unknown as DemoSpecV1;
    const graphLike = graph(
      [node("a", "process_node", 0, 0, 0), node("b", "process_node", 2, 0, 0)],
      [{ id: "r1", type: "causes", from: "a", to: "b" }]
    );
    expect(isLayoutEligible(base, graphLike)).toBe(true);

    // Non-graph scene (no relationships).
    const plain = graph([node("a", "sphere", 0, 0, 0)]);
    expect(isLayoutEligible(base, plain)).toBe(false);

    // lumina_2d renderer.
    const lumina = {
      ...base,
      renderer: { kind: "lumina_2d" },
    } as unknown as DemoSpecV1;
    expect(isLayoutEligible(lumina, graphLike)).toBe(false);

    // No scene3d objects.
    const empty = {
      ...base,
      scene3d: { objects: [] },
    } as unknown as DemoSpecV1;
    expect(isLayoutEligible(empty, graphLike)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// z-plane canonicalization (design-1 §1.1, §10.1 test 20)
// ---------------------------------------------------------------------------

describe("resolveLayout — z-plane canonicalization", () => {
  it("planar scenes canonicalize every movable node to the median z", () => {
    const g = graph(
      [
        node("a", "sphere", 0, 0, 0.1),
        node("b", "sphere", 2, 0, -0.1),
      ],
      [{ id: "r1", type: "causes", from: "a", to: "b" }]
    );
    const out = resolveLayout(g, 2);
    expect(posById(out, "a").z).toBe(0);
    expect(posById(out, "b").z).toBe(0);
    expect(out.layout.repaired).toBe(true);
  });

  it("non-planar scenes keep authored z (depth is opt-in)", () => {
    const g = graph(
      [
        node("a", "sphere", 0, 0, 0),
        node("b", "sphere", 2, 0, 5),
      ],
      [{ id: "r1", type: "causes", from: "a", to: "b" }]
    );
    const out = resolveLayout(g, 2);
    expect(posById(out, "a").z).toBe(0);
    expect(posById(out, "b").z).toBe(5);
    expect(out.layout.repaired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Packet snap + slidePath (design-1 §1.6, §3.1, §10.1 tests 10–11, 23–24)
// ---------------------------------------------------------------------------

describe("resolveLayout — packet snap and slidePath semantics", () => {
  it("a chained packet snaps to the source surface, resolving the pn1/ep1 duplicate", () => {
    const out = resolveLayout(processFlowGraph(), 6);
    const ep1 = posById(out, "ep1");
    // pn1 exit = −3 + (0.5 + 0.15 + PATH_CLEARANCE) = −2.25 on x.
    expect(ep1.x).toBeCloseTo(-2.25, 9);
    expect(ep1.y).toBeCloseTo(0, 9);
    expect(ep1.z).toBeCloseTo(0, 9);
    expect(out.reasons).toContain("layout_repaired");
    // I1 at equality: packet surface touches the source surface with clearance.
    const pn1 = posById(out, "pn1");
    const d = Math.hypot(ep1.x - pn1.x, ep1.y - pn1.y, ep1.z - pn1.z);
    expect(d).toBeCloseTo(0.5 + 0.15 + PATH_CLEARANCE, 9);
  });

  it("co-slotted packets are staggered along the first segment", () => {
    const out = resolveLayout(energyTransferGraph(), 6);
    const ep1 = posById(out, "ep1");
    const ep2 = posById(out, "ep2");
    expect(ep1.x).toBeCloseTo(-2.25, 9);
    expect(ep2.x).toBeCloseTo(-1.75, 9); // −2.25 + (2·0.15 + PACKET_SPACING)
    const sep = Math.abs(ep2.x - ep1.x);
    expect(sep).toBeCloseTo(2 * 0.15 + PACKET_SPACING, 9);
  });

  it("derivePacketSlidePath: process_flow chain → [−2.25, −0.75, 0.75, 2.25]", () => {
    const path = derivePacketSlidePath(processFlowGraph(), "ep1")!;
    expect(path.map((p) => p.x)).toEqual([-2.25, -0.75, 0.75, 2.25]);
    expect(path.every((p) => Math.abs(p.y) < 1e-9 && Math.abs(p.z) < 1e-9)).toBe(true);
  });

  it("derivePacketSlidePath: energy_transfer → [−2.25, 2.25]", () => {
    const path = derivePacketSlidePath(energyTransferGraph(), "ep1")!;
    expect(path.map((p) => p.x)).toEqual([-2.25, 2.25]);
  });

  it("slidePath endpoints sit exactly ON the destination surface — packets never fly past", () => {
    const out = resolveLayout(processFlowGraph(), 6);
    const path = derivePacketSlidePath(out.graph, "ep1")!;
    const last = path[path.length - 1];
    const pn3 = posById(out, "pn3");
    const d = Math.hypot(last.x - pn3.x, last.y - pn3.y, last.z - pn3.z);
    // destEntry = dest.center − û·(r_dest + r_pkt + PATH_CLEARANCE)
    expect(d).toBeCloseTo(0.5 + 0.15 + PATH_CLEARANCE, 9);
    expect(last.x).toBeLessThan(pn3.x); // stops AT the surface, never beyond
  });

  it("slidePath points never leave the scene bounds", () => {
    const out = resolveLayout(processFlowGraph(), 6);
    const path = derivePacketSlidePath(out.graph, "ep1")!;
    const b = out.layout.bounds;
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(b.min.x - 1e-9);
      expect(p.x).toBeLessThanOrEqual(b.max.x + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(b.min.y - 1e-9);
      expect(p.y).toBeLessThanOrEqual(b.max.y + 1e-9);
    }
  });
});

// ---------------------------------------------------------------------------
// Degrade-by-simplification ordering (design-1 §5, §10.1 tests 21, 14)
// ---------------------------------------------------------------------------

describe("resolveLayout — degrade-by-simplification ordering", () => {
  it("spread → shorten labels → suppress edge labels → layout_collision_remaining, in that order", () => {
    const g = stuckCluster();
    const longLabel =
      "photosynthesis converts light energy into chemical energy stored in glucose";
    const withLabel: SceneGraph = {
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === "n1" ? { ...n, label: longLabel } : n
      ),
      relationships: [
        { id: "r1", type: "causes", from: "n1", to: "n2", label: "activation" },
      ],
    };
    const out = resolveLayout(withLabel, 13);

    // Every degrade stage fired.
    expect(out.reasons).toContain("layout_grid_fallback");
    expect(out.reasons).toContain("layout_labels_shortened");
    expect(out.reasons).toContain("layout_edge_labels_suppressed");
    expect(out.reasons).toContain("layout_collision_remaining");

    // The ordering is the design's: spread, then shorten, then suppress, then
    // accept-with-residual.
    const idx = (r: string) => out.reasons.indexOf(r);
    expect(idx("layout_grid_fallback")).toBeLessThan(idx("layout_labels_shortened"));
    expect(idx("layout_labels_shortened")).toBeLessThan(
      idx("layout_edge_labels_suppressed")
    );
    expect(idx("layout_edge_labels_suppressed")).toBeLessThan(
      idx("layout_collision_remaining")
    );

    // The 72-char label was truncated to the canvas-fit budget.
    const n1 = out.graph.nodes.find((n) => n.id === "n1")!;
    expect(n1.label!.length).toBe(CANVAS_FIT_CHARS);
    expect(out.layout.labelShortened).toContain("n1");

    // The edge-label sprite whose rect still collides was suppressed.
    expect(out.layout.suppressedEdgeLabels).toContain("r1");
  });

  it("clean scenes emit no degrade reasons and long labels pass through untouched", () => {
    const g = graph(
      [
        node("a", "sphere", 0, 0, 0, 1, "photosynthesis converts light energy"),
        node("b", "sphere", 2, 0, 0),
      ],
      [{ id: "r1", type: "causes", from: "a", to: "b" }]
    );
    const out = resolveLayout(g, 14);
    expect(out.reasons).toEqual([]);
    expect(out.layout.labelShortened).toEqual([]);
    expect(out.layout.suppressedEdgeLabels).toEqual([]);
    expect(
      out.graph.nodes.find((n) => n.id === "a")!.label
    ).toBe("photosynthesis converts light energy");
  });
});

// ---------------------------------------------------------------------------
// Bounds contract (design-1 §2.1, §10.1 tests 22, 6–7)
// ---------------------------------------------------------------------------

describe("resolveLayout — bounds contract", () => {
  it("bounds are present and deterministic for every scene, repaired or identity", () => {
    for (const g of [
      overlappingPair(),
      graph([node("a", "sphere", 0, 0, 0), node("b", "sphere", 2, 0, 0)]), // non-graph
      processFlowGraph(),
    ]) {
      const out = resolveLayout(g, 3);
      const b = out.layout.bounds;
      expect(b.radius).toBeGreaterThan(0);
      expect(b.center.x).toBeCloseTo((b.min.x + b.max.x) / 2, 9);
      expect(b.max.x).toBeGreaterThan(b.min.x);
      expect(b.max.y).toBeGreaterThanOrEqual(b.min.y);
      const again = resolveLayout(g, 3);
      expect(again.layout.bounds).toEqual(b);
    }
  });

  it("bounds cover the node envelopes plus the scene margin", () => {
    const g = graph(
      [
        node("a", "sphere", 0, 0, 0, 2),
        node("b", "sphere", 4, 0, 0, 2),
      ],
      [{ id: "r1", type: "causes", from: "a", to: "b" }]
    );
    const out = resolveLayout(g, 3);
    const b = out.layout.bounds;
    for (const n of out.graph.nodes) {
      const env = nodeEnvelope(n);
      if (env.kind !== "sphere") continue;
      expect(env.center.x + env.radius).toBeLessThanOrEqual(b.max.x);
      expect(env.center.x - env.radius).toBeGreaterThanOrEqual(b.min.x);
    }
  });

  it("envelope model: sphere radius = size·0.5 (design-1 §1.3)", () => {
    const g = graph([node("a", "sphere", 0, 0, 0, 3)]);
    const env = nodeEnvelope(g.nodes[0]);
    expect(env.kind).toBe("sphere");
    if (env.kind === "sphere") expect(env.radius).toBe(1.5);
  });

  it("a repaired scene reports every moved node with from/to in graph coordinates", () => {
    const out = resolveLayout(overlappingPair(), 15);
    expect(movedIds(out)).toEqual(["n1", "n2"]);
    for (const m of out.layout.moved) {
      expect(m.from).toEqual(
        m.id === "n1" ? { x: 0, y: 0, z: 0 } : { x: 0.5, y: 0, z: 0 }
      );
      expect(m.to.x).not.toBeCloseTo(m.from.x, 9);
    }
  });
});
