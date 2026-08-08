/**
 * labels.test.ts — C2 label pipeline unit tests (3D Representation Quality
 * Program, Wave 3). Pure geometry/text tests never touch Three.js objects;
 * only the runtime-overlay lifecycle test passes structural fakes (a group
 * with getWorldPosition and a sprite with position.set), exactly as design-2
 * §0 requires ("unit tests never mock three for geometry").
 *
 * Evidence: all 39 measured strings come from
 * .superpowers/sdd/3d-quality/evidence/audit3-label-geometry.json.
 */

import { describe, expect, it } from "vitest";
import {
  SPEC_LIMITS,
  type DemoSpecV1,
  type PrimitiveObjectSpec,
  type RelationshipSpec,
} from "@/demonstrations/spec/demo-spec";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  GLYPH_HALF_D,
  LABEL_REPLACE_THRESHOLD,
  REASON_LABEL_ANCHOR_FALLBACK,
  inflateEnvelope,
  labelRectCollides,
  nodeEnvelope,
  placeEdgeLabel,
  placeLabelItems,
  planNodeLabels,
  rectsOverlap,
  updateLabelOverlays,
  type LabelContext,
  type LabelEnvelope,
  type LabelOverlay,
  type LabelItem,
  type NodeLabelPlan,
  type RoutedEdge,
} from "@/demonstrations/renderers/primitive-3d/labels";
import {
  EDGE_PX_PER_UNIT,
  GLYPH_HALF_H_EDGE,
  GLYPH_HALF_H_NODE,
  LABEL_EDGE_CLEAR,
  LABEL_ENV_CLEAR,
  LABEL_LABEL_CLEAR,
  LABEL_MAX_CHARS,
  NODE_ANCHOR_ORDER,
  NODE_PX_PER_UNIT,
  REASON_EDGE_LABEL_DENSE,
  REASON_EDGE_LABEL_SKIPPED,
  REASON_LABEL_ELLIPSIZED,
  TEXT_BUDGET_PX,
  TEXT_SAFETY_PX,
  edgeLabelSpriteScale,
  estimateTextWidthPx,
  nodeLabelSpriteScale,
  resolveLabelText,
  type Rect,
} from "@/demonstrations/renderers/primitive-3d/presentation/constants";
import type { Vec3 } from "@/demonstrations/spec/demo-spec";

// ---------------------------------------------------------------------------
// Spec factory (same shape as primitive-3d.test.ts)
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

function obj(
  id: string,
  kind: string,
  label: string | undefined,
  position: Vec3,
  size = 1
): PrimitiveObjectSpec {
  return {
    id,
    kind: kind as PrimitiveObjectSpec["kind"],
    ...(label !== undefined ? { label } : {}),
    position,
    size,
  };
}

function rel(id: string, from: string, to: string, type = "contains"): RelationshipSpec {
  return { id, type: type as RelationshipSpec["type"], from, to };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The audit3 measured widths (all 39 strings) — the model must never
 * under-estimate one of these (design-2 §1.1: verified 0/39). */
const AUDIT_MEASURED_PX: Array<[string, number]> = [
  ["Step 1", 81], ["Step 2", 87], ["Step 3", 87], ["Source", 96], ["Sink", 59],
  ["Cause A", 114], ["Effect B", 105], ["Effect C", 107], ["Inhibited D", 146],
  ["Branch A", 123], ["Branch B", 121], ["Branch C", 123], ["Hub", 55],
  ["Layer 1", 92], ["Layer 2", 98], ["Layer 3", 98], ["Layer 4", 100],
  ["Object A", 118], ["Object B", 116], ["First", 59], ["Second", 103],
  ["Third", 69], ["Fourth", 88], ["Stage A", 106], ["Stage B", 104],
  ["Stage C", 107], ["Stage D", 106], ["Before", 87], ["After", 68],
  ["Before state", 163], ["After state", 143], ["flows_to", 117],
  ["transfers_to", 166], ["attracts", 106], ["contains", 116], ["causes", 96],
  ["activates", 124], ["inhibits", 99], ["transforms_into", 217],
];

function item(
  id: string,
  kind: LabelItem["kind"],
  label: string,
  position: Vec3,
  size = 1
): LabelItem {
  return { id, kind, label, position, size };
}

function env(id: string, position: Vec3, size = 1): LabelEnvelope {
  return nodeEnvelope({ id, kind: "box", position, size });
}

/** All plan rects must clear every OTHER node's inflated envelope (I3's
 * envelope part). The node's own envelope is excluded — the anchor math
 * places the rect exactly LABEL_ENV_CLEAR from it by construction (a float
 * knife-edge that the placement itself treats as guaranteed). */
function expectPlansClearEnvelopes(plans: NodeLabelPlan[], envelopes: LabelEnvelope[]) {
  const inflated = envelopes.map((e) => inflateEnvelope(e, LABEL_ENV_CLEAR));
  for (const plan of plans) {
    for (const e of inflated) {
      if (e.id === plan.nodeId) continue;
      expect(
        rectsOverlap(plan.rect, {
          cx: e.center.x,
          cy: e.center.y,
          cz: e.center.z,
          halfW: e.halfExtents.x,
          halfH: e.halfExtents.y,
          halfD: e.halfExtents.z,
        }),
        `${plan.nodeId} rect must clear envelope ${e.id}`
      ).toBe(false);
    }
  }
}

/** Plan rects must be pairwise clear by at least LABEL_LABEL_CLEAR. */
function expectPlansPairwiseClear(plans: NodeLabelPlan[]) {
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      expect(
        rectsOverlap(plans[i].rect, plans[j].rect, LABEL_LABEL_CLEAR),
        `${plans[i].nodeId} and ${plans[j].nodeId} label rects must be clear`
      ).toBe(false);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Shared text model (char widths + truncation)
// ---------------------------------------------------------------------------

describe("label text model (presentation/constants)", () => {
  it("never under-estimates any of the 39 audit3 measurements", () => {
    // The model's invariant (design-2 §1.1): with the +1 safety term applied
    // (TEXT_SAFETY_PX) the estimate never under-measures a browser measurement.
    for (const [text, measured] of AUDIT_MEASURED_PX) {
      expect(
        estimateTextWidthPx(text) + TEXT_SAFETY_PX,
        `est("${text}") + safety must be >= ${measured}px (audit3)`
      ).toBeGreaterThanOrEqual(measured);
    }
  });

  it("reproduces the documented worst-case strings", () => {
    // design-2 §1.1: "transforms_into" (14 lowercase + 1 underscore) is the
    // widest measured string; the model must cover it (14·16 + 16 = 240 ≥ 217).
    expect(estimateTextWidthPx("transforms_into")).toBe(14 * 16 + 16);
    expect(estimateTextWidthPx("transforms_into")).toBeGreaterThanOrEqual(217);
    expect(estimateTextWidthPx("Hub") + TEXT_SAFETY_PX).toBeGreaterThanOrEqual(55);
  });

  it("resolveLabelText ellipsizes 40-char prose to the 288px budget", () => {
    const prose =
      "The citric acid cycle releases carbon dioxide during aerobic respiration";
    const resolved = resolveLabelText(prose);
    expect(resolved.truncated).toBe(true);
    expect(resolved.text.endsWith("…")).toBe(true);
    // 40-char hard cap maintained (prefix + ellipsis).
    expect(resolved.text.length).toBeLessThanOrEqual(LABEL_MAX_CHARS);
    // The glyph prefix (without the ellipsis) fits the budget exactly.
    const prefix = resolved.text.slice(0, -1);
    expect(estimateTextWidthPx(prefix)).toBeLessThanOrEqual(TEXT_BUDGET_PX);
  });

  it("keeps the display under the 40-char schema bound for over-long labels", () => {
    // LABEL_MAX_CHARS is the schema-level cap (sanitize enforces it); the
    // display budget ellipsizes first — 45 'x' resolves to a 16-char prefix +
    // ellipsis, still well under the cap. Design-2 §1.1: "the visible budget
    // is set by the texture, not the slice".
    const resolved = resolveLabelText("x".repeat(45));
    expect(resolved.truncated).toBe(true);
    expect(resolved.text.length).toBeLessThanOrEqual(LABEL_MAX_CHARS);
    expect(resolved.text).toBe("x".repeat(16) + "…");
  });

  it("leaves short labels untouched", () => {
    expect(resolveLabelText("Hub")).toEqual({ text: "Hub", truncated: false });
    expect(resolveLabelText("transforms_into")).toEqual({
      text: "transforms_into",
      truncated: false,
    });
  });

  it("is deterministic (3D/2D parity — same resolver, same string)", () => {
    const a = resolveLabelText("A very long label that certainly exceeds the budget");
    const b = resolveLabelText("A very long label that certainly exceeds the budget");
    expect(a).toEqual(b);
    expect(a.truncated).toBe(true);
  });

  it("exposes the documented truncation reason code", () => {
    expect(REASON_LABEL_ELLIPSIZED).toBe("label_truncated_ellipsis");
  });
});

// ---------------------------------------------------------------------------
// 2. Sprite scale (design-2 §1.2)
// ---------------------------------------------------------------------------

describe("label sprite scale", () => {
  it('"Hub" (55px) renders a ~0.39u sprite, not the fixed 2.2u box (F-02)', () => {
    const scale = nodeLabelSpriteScale(1, estimateTextWidthPx("Hub"));
    expect(scale.w).toBeCloseTo((estimateTextWidthPx("Hub") + 1) / NODE_PX_PER_UNIT, 4);
    expect(scale.w).toBeLessThan(0.4);
    expect(scale.h).toBe(0.5);
  });

  it("caps at exactly 2.2u for 320px text", () => {
    expect(nodeLabelSpriteScale(1, 320).w).toBe(2.2);
    expect(nodeLabelSpriteScale(1, 400).w).toBe(2.2);
  });

  it("label-kind nodes share the node-label scale rule (F-23 regression)", () => {
    // Old label-kind path: size*2.2 × size*0.5 uncapped → 11×2.5 at s=5.
    const scale = nodeLabelSpriteScale(5, estimateTextWidthPx("Hub"));
    expect(scale.h).toBe(1.0); // 0.5 * min(5, 2) — never 2.5
    expect(scale.w).toBeCloseTo(
      Math.min(2.2, (estimateTextWidthPx("Hub") + 1) / NODE_PX_PER_UNIT) * 2,
      4
    );
    expect(scale.w).toBeLessThan(11);
  });

  it("edge-label sprites are text-measured and cap at 1.9u", () => {
    const scale = edgeLabelSpriteScale(estimateTextWidthPx("flows_to"));
    expect(scale.w).toBeCloseTo(
      (estimateTextWidthPx("flows_to") + 1) / EDGE_PX_PER_UNIT,
      4
    );
    expect(scale.w).toBeLessThan(1.9);
    expect(scale.h).toBe(0.42);
    expect(edgeLabelSpriteScale(400).w).toBe(1.9);
  });
});

// ---------------------------------------------------------------------------
// 3. Node-label anchor selection (design-2 §1.3)
// ---------------------------------------------------------------------------

describe("node label anchor selection", () => {
  it("layered_system: l1 above, l2–l4 right — no label on a wrong box (F-03)", () => {
    const spec = makeSpec({
      objects: [
        obj("root", "group", undefined, { x: 0, y: 0, z: 0 }),
        obj("l1", "box", "Layer 1", { x: 0, y: 1.5, z: 0 }, 1),
        obj("l2", "box", "Layer 2", { x: 0, y: 0.5, z: 0 }, 1),
        obj("l3", "box", "Layer 3", { x: 0, y: -0.5, z: 0 }, 1),
        obj("l4", "box", "Layer 4", { x: 0, y: -1.5, z: 0 }, 1),
      ],
      relationships: [
        rel("r1", "root", "l1"),
        rel("r2", "root", "l2"),
        rel("r3", "root", "l3"),
        rel("r4", "root", "l4"),
      ],
    });
    const { graph, reasons } = buildSceneGraph(spec);
    expect(reasons).toEqual([]);
    const { plans, reasons: labelReasons } = planNodeLabels(graph);
    expect(labelReasons).toEqual([]);

    const byId = new Map(plans.map((p) => [p.nodeId, p]));
    expect(byId.size).toBe(4);
    expect(byId.get("l1")?.anchor).toBe("above");
    expect(byId.get("l2")?.anchor).toBe("right");
    expect(byId.get("l3")?.anchor).toBe("right");
    expect(byId.get("l4")?.anchor).toBe("right");

    // Exact placed centers (design-2 §1.3 formulas, deterministic).
    const halfW = nodeLabelSpriteScale(1, estimateTextWidthPx("Layer 2")).w / 2;
    expect(byId.get("l1")?.rect.cy).toBeCloseTo(1.5 + 0.5 + GLYPH_HALF_H_NODE + LABEL_ENV_CLEAR, 6);
    expect(byId.get("l2")?.rect.cx).toBeCloseTo(0.5 + halfW + LABEL_ENV_CLEAR, 6);
    expect(byId.get("l2")?.rect.cy).toBeCloseTo(0.5, 6);
    expect(byId.get("l3")?.rect.cx).toBeCloseTo(0.5 + halfW + LABEL_ENV_CLEAR, 6);
    expect(byId.get("l3")?.rect.cy).toBeCloseTo(-0.5, 6);
    expect(byId.get("l4")?.rect.cx).toBeCloseTo(0.5 + halfW + LABEL_ENV_CLEAR, 6);
    expect(byId.get("l4")?.rect.cy).toBeCloseTo(-1.5, 6);

    // No label rect may intersect any envelope, and labels must be pairwise
    // clear (I3): the F-03 wrong-box placement is geometrically impossible now.
    const envelopes = graph.nodes
      .filter((n) => n.kind !== "group")
      .map((n) => nodeEnvelope(n));
    expectPlansClearEnvelopes(plans, envelopes);
    expectPlansPairwiseClear(plans);
  });

  it("falls back through the anchor order above → right → left → below", () => {
    // Lone node: above.
    let plans = placeLabelItems(
      {
        items: [item("a", "box", "Hub", { x: 0, y: 0, z: 0 })],
        envelopes: [env("a", { x: 0, y: 0, z: 0 })],
        edgePolylines: [],
      },
      []
    );
    expect(plans[0].anchor).toBe("above");

    // Blocker above → right.
    plans = placeLabelItems(
      {
        items: [item("a", "box", "Hub", { x: 0, y: 0, z: 0 })],
        envelopes: [
          env("a", { x: 0, y: 0, z: 0 }),
          env("b", { x: 0, y: 1.2, z: 0 }),
        ],
        edgePolylines: [],
      },
      []
    );
    expect(plans[0].anchor).toBe("right");

    // Blockers above + right → left.
    plans = placeLabelItems(
      {
        items: [item("a", "box", "Hub", { x: 0, y: 0, z: 0 })],
        envelopes: [
          env("a", { x: 0, y: 0, z: 0 }),
          env("b", { x: 0, y: 1.2, z: 0 }),
          env("c", { x: 1.5, y: 0, z: 0 }),
        ],
        edgePolylines: [],
      },
      []
    );
    expect(plans[0].anchor).toBe("left");

    // Blockers above + right + left → below.
    plans = placeLabelItems(
      {
        items: [item("a", "box", "Hub", { x: 0, y: 0, z: 0 })],
        envelopes: [
          env("a", { x: 0, y: 0, z: 0 }),
          env("b", { x: 0, y: 1.2, z: 0 }),
          env("c", { x: 1.5, y: 0, z: 0 }),
          env("d", { x: -1.5, y: 0, z: 0 }),
        ],
        edgePolylines: [],
      },
      []
    );
    expect(plans[0].anchor).toBe("below");
    expect(NODE_ANCHOR_ORDER).toEqual(["above", "right", "left", "below"]);
  });

  it("uses the glyph rect, not the transparent sprite box, for collisions", () => {
    // A(0,0) with B(0,1.6): the glyph rect (halfH 0.096) clears B's inflated
    // envelope, while the 0.5-tall sprite box would overlap it. The glyph
    // model accepts "above".
    const envelopes = [env("a", { x: 0, y: 0, z: 0 }), env("b", { x: 0, y: 1.6, z: 0 })];
    const plans = placeLabelItems(
      { items: [item("a", "box", "Hub", { x: 0, y: 0, z: 0 })], envelopes, edgePolylines: [] },
      []
    );
    expect(plans[0].anchor).toBe("above");
    const inflatedB = inflateEnvelope(env("b", { x: 0, y: 1.6, z: 0 }), LABEL_ENV_CLEAR);
    const spriteBoxHalfH = plans[0].spriteH / 2; // 0.25 — the old collision model
    expect(plans[0].rect.cy + spriteBoxHalfH).toBeGreaterThan(
      inflatedB.center.y - inflatedB.halfExtents.y
    );
  });

  it("is deterministic: same graph + seed → identical plans", () => {
    const spec = makeSpec({
      objects: [
        obj("a", "sphere", "Object A", { x: -3, y: 1, z: 0 }, 1),
        obj("b", "sphere", "Effect B", { x: 0, y: 1, z: 0 }, 1),
        obj("c", "sphere", "Effect C", { x: 0, y: -1, z: 0 }, 1),
        obj("d", "sphere", "Inhibited D", { x: 3, y: -1, z: 0 }, 1),
      ],
      relationships: [rel("r1", "a", "b", "activates")],
    });
    const { graph } = buildSceneGraph(spec);
    const first = planNodeLabels(graph);
    const second = planNodeLabels(graph);
    expect(second.plans).toEqual(first.plans);
    expect(second.reasons).toEqual(first.reasons);
  });

  it("places a dense 3×3 cluster collision-free without fallbacks", () => {
    // Tightest spacing (1.3) where every node's anchors can resolve: the
    // above-anchor needs 2·(envHalf + CLEAR + halfH) ≈ 1.2536u between centers.
    const size = 0.8;
    const spacing = 1.3;
    const items: LabelItem[] = [];
    const envelopes: LabelEnvelope[] = [];
    const ids = "ABCDEFGHI".split("");
    let k = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const id = ids[k++];
        const position = { x: col * spacing, y: row * spacing, z: 0 };
        items.push(item(id, "sphere", `Node ${id}`, position, size));
        envelopes.push(env(id, position, size));
      }
    }
    const reasons: string[] = [];
    const plans = placeLabelItems({ items, envelopes, edgePolylines: [] }, reasons);
    expect(plans).toHaveLength(9);
    expect(reasons).not.toContain(REASON_LABEL_ANCHOR_FALLBACK);
    expectPlansClearEnvelopes(plans, envelopes);
    expectPlansPairwiseClear(plans);
  });

  it("never drops a label: impossible clusters fall back loudly", () => {
    // 3×3 grid at 0.6 spacing, size 1 — the center node's four anchors all
    // collide; its label must still exist and the reason must surface.
    const spacing = 0.6;
    const items: LabelItem[] = [];
    const envelopes: LabelEnvelope[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const id = `n${row}${col}`;
        const position = { x: col * spacing, y: row * spacing, z: 0 };
        items.push(item(id, "box", `Node ${row}${col}`, position, 1));
        envelopes.push(env(id, position, 1));
      }
    }
    const reasons: string[] = [];
    const plans = placeLabelItems({ items, envelopes, edgePolylines: [] }, reasons);
    expect(plans).toHaveLength(9);
    expect(reasons).toContain(REASON_LABEL_ANCHOR_FALLBACK);
    const center = plans.find((p) => p.nodeId === "n11");
    expect(center).toBeDefined();
    expect(center!.anchor).toBe("above"); // fallback anchor
    expect(center!.text).toBe("Node 11");
  });

  it("reports truncation reasons per ellipsized label", () => {
    const items = [
      item("a", "box", "x".repeat(40), { x: 0, y: 0, z: 0 }),
      item("b", "box", "Hub", { x: 2, y: 0, z: 0 }),
    ];
    const reasons: string[] = [];
    const plans = placeLabelItems(
      {
        items,
        envelopes: [env("a", { x: 0, y: 0, z: 0 }), env("b", { x: 2, y: 0, z: 0 })],
        edgePolylines: [],
      },
      reasons
    );
    expect(reasons).toEqual([REASON_LABEL_ELLIPSIZED]);
    expect(plans[0].truncated).toBe(true);
    expect(plans[1].truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Edge-label placement (design-2 §1.4)
// ---------------------------------------------------------------------------

describe("edge label placement", () => {
  it("cause_effect_network r2 (activates) clears node B and Effect C's label", () => {
    const nodes = [
      item("a", "sphere", "Cause A", { x: -3, y: 1, z: 0 }),
      item("b", "sphere", "Effect B", { x: 0, y: 1, z: 0 }),
      item("c", "sphere", "Effect C", { x: 0, y: -1, z: 0 }),
      item("d", "sphere", "Inhibited D", { x: 3, y: -1, z: 0 }),
    ];
    const envelopes = nodes.map((n) => env(n.id, n.position));
    const plans = placeLabelItems({ items: nodes, envelopes, edgePolylines: [] }, []);

    const edge: RoutedEdge = {
      id: "r2",
      fromId: "a",
      toId: "b",
      from: { x: -3, y: 1, z: 0 },
      to: { x: 0, y: 1, z: 0 },
      label: "activates",
    };
    const plan = placeEdgeLabel(edge, envelopes, plans.map((p) => p.rect));
    expect(plan).not.toBeNull();
    // First candidate wins: t = 0.5, d = +1 → 0.299 above the midpoint.
    expect(plan!.position.x).toBeCloseTo(-1.5, 6);
    expect(plan!.position.y).toBeCloseTo(1 + GLYPH_HALF_H_EDGE + 0.22, 6);
    expect(plan!.position.z).toBeCloseTo(0, 6);
    // The accepted rect must be collision-free under the full context.
    const ctx = {
      nodeEnvelopes: envelopes.map((e) => inflateEnvelope(e, LABEL_ENV_CLEAR)),
      edgePolylines: [{ id: edge.id, pts: [{ ...edge.from }, { ...edge.to }] }],
      placedRects: plans.map((p) => p.rect),
    };
    expect(labelRectCollides(plan!.rect, ctx)).toBe(false);
  });

  it("returns null with no safe spot on a 0.6u edge (F-04)", () => {
    const envelopes = [
      env("a", { x: -0.3, y: 0, z: 0 }),
      env("b", { x: 0.3, y: 0, z: 0 }),
    ];
    const edge: RoutedEdge = {
      id: "r1",
      fromId: "a",
      toId: "b",
      from: { x: -0.3, y: 0, z: 0 },
      to: { x: 0.3, y: 0, z: 0 },
      label: "activates",
    };
    const plan = placeEdgeLabel(edge, envelopes, []);
    expect(plan).toBeNull();
  });

  it("places labels on long edges (timeline-style, size 0.9, L=2)", () => {
    // timeline_sequence's shortest edge: two size-0.9 spheres at ±1.
    const envelopes = [
      env("t3", { x: -1, y: 0, z: 0 }, 0.9),
      env("t4", { x: 1, y: 0, z: 0 }, 0.9),
    ];
    const edge: RoutedEdge = {
      id: "r3",
      fromId: "t3",
      toId: "t4",
      from: { x: -1, y: 0, z: 0 },
      to: { x: 1, y: 0, z: 0 },
      label: "flows_to",
    };
    const plan = placeEdgeLabel(edge, envelopes, []);
    expect(plan).not.toBeNull();
    // First candidate (t = 0.5, d = +1) is collision-free here.
    expect(plan!.position.x).toBeCloseTo(0, 6);
    expect(plan!.position.y).toBeCloseTo(GLYPH_HALF_H_EDGE + 0.22, 6);
  });

  it("skips labels on 45° edges whose corner crosses the shaft (cyclic-style)", () => {
    // cyclic_process r1 (0,2)→(2,0): at the design §1.4 offset
    // (0.079 + 0.22 = 0.299 perpendicular), a rect with halfW + halfH > 0.12/√2
    // ≈ 0.17 has a corner dipping into the LABEL_EDGE_CLEAR band around the
    // shaft. "flows_to" (halfW 0.386) AND "flows" (halfW 0.24) both exceed it,
    // so every candidate fails the own-shaft check for BOTH sides and all five
    // t-values — the honest outcome is a skip (the pipeline emits
    // edge_label_skipped_no_space). The Stage labels are never overlapped.
    const nodes = [
      item("sa", "sphere", "Stage A", { x: 0, y: 2, z: 0 }),
      item("sb", "sphere", "Stage B", { x: 2, y: 0, z: 0 }),
      item("sc", "sphere", "Stage C", { x: 0, y: -2, z: 0 }),
      item("sd", "sphere", "Stage D", { x: -2, y: 0, z: 0 }),
    ];
    const envelopes = nodes.map((n) => env(n.id, n.position));
    const plans = placeLabelItems({ items: nodes, envelopes, edgePolylines: [] }, []);
    const edge: RoutedEdge = {
      id: "r1",
      fromId: "sa",
      toId: "sb",
      from: { x: 0, y: 2, z: 0 },
      to: { x: 2, y: 0, z: 0 },
      label: "flows_to",
    };
    expect(placeEdgeLabel(edge, envelopes, plans.map((p) => p.rect))).toBeNull();
    // A narrower label on the same edge still cannot clear its own shaft.
    expect(
      placeEdgeLabel(
        { ...edge, label: "flows" },
        envelopes,
        plans.map((p) => p.rect)
      )
    ).toBeNull();
  });

  it("exposes the skip/density reason codes for the pipeline", () => {
    expect(REASON_EDGE_LABEL_SKIPPED).toBe("edge_label_skipped_no_space");
    expect(REASON_EDGE_LABEL_DENSE).toBe("edge_label_suppressed_density");
  });
});

// ---------------------------------------------------------------------------
// 5. Runtime overlay (design-2 §1.6): world-space labels follow the node
// ---------------------------------------------------------------------------

describe("label runtime overlay (world space)", () => {
  function fakeGroup(position: Vec3, rotationApplied = false) {
    return {
      position: { ...position },
      rotation: { x: 0, y: 0, z: 0 },
      getWorldPosition(target: { set(x: number, y: number, z: number): unknown }) {
        // The fake has no matrix math: the world position IS the group's
        // position (read live so tests can translate the holder). Rotation is
        // a no-op on the world position — labels are scene children, so the
        // F-24 semantic under test is that rotation cannot rotate the offset.
        void rotationApplied;
        return target.set(
          this.position.x,
          this.position.y,
          this.position.z
        );
      },
    };
  }

  function makeCtx(
    graph: ReturnType<typeof buildSceneGraph>["graph"],
    overlays: LabelOverlay[],
    runtime: Map<string, { group: unknown }>
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

  it("keeps the label at node world position + placed offset (follows translation)", () => {
    const spec = makeSpec({
      objects: [obj("a", "box", "Layer 1", { x: 0, y: 1.5, z: 0 }, 1)],
      relationships: [],
    });
    const { graph } = buildSceneGraph(spec);
    const { plans } = planNodeLabels(graph);
    expect(plans).toHaveLength(1);
    const plan = plans[0];

    const group = fakeGroup({ x: 0, y: 1.5, z: 0 });
    const recorded: Array<[number, number, number]> = [];
    const overlay: LabelOverlay = {
      nodeId: "a",
      rn: { group } as unknown as LabelOverlay["rn"],
      sprite: {
        position: { set: (x: number, y: number, z: number) => void recorded.push([x, y, z]) },
      } as unknown as LabelOverlay["sprite"],
      material: null as unknown as LabelOverlay["material"],
      texture: null as unknown as LabelOverlay["texture"],
      plan: null,
      base: { x: 0, y: 1.5, z: 0 },
    };
    const ctx = makeCtx(graph, [overlay], new Map([["a", { group }]]));

    updateLabelOverlays(ctx, 0);
    expect(overlay.plan).not.toBeNull();
    expect(recorded[recorded.length - 1]).toEqual([
      plan.offset.x,
      1.5 + plan.offset.y,
      plan.offset.z,
    ]);

    // Translate the node: the label must follow in world space.
    (group as { position: Vec3 }).position = { x: 5, y: 1.5, z: 0 };
    updateLabelOverlays(ctx, 0);
    expect(recorded[recorded.length - 1]).toEqual([
      5 + plan.offset.x,
      1.5 + plan.offset.y,
      plan.offset.z,
    ]);
    // The movement triggered a lazy re-placement; base tracks the new world
    // position so the next frame is stable.
    expect(overlay.base.x).toBe(5);
  });

  it("rotation does not rotate the label offset (F-24 regression)", () => {
    const spec = makeSpec({
      objects: [obj("a", "box", "Layer 1", { x: 0, y: 1.5, z: 0 }, 1)],
      relationships: [],
    });
    const { graph } = buildSceneGraph(spec);
    const { plans } = planNodeLabels(graph);

    const group = fakeGroup({ x: 0, y: 1.5, z: 0 });
    const recorded: Array<[number, number, number]> = [];
    const overlay: LabelOverlay = {
      nodeId: "a",
      rn: { group } as unknown as LabelOverlay["rn"],
      sprite: {
        position: { set: (x: number, y: number, z: number) => void recorded.push([x, y, z]) },
      } as unknown as LabelOverlay["sprite"],
      material: null as unknown as LabelOverlay["material"],
      texture: null as unknown as LabelOverlay["texture"],
      plan: null,
      base: { x: 0, y: 1.5, z: 0 },
    };
    const ctx = makeCtx(graph, [overlay], new Map([["a", { group }]]));
    updateLabelOverlays(ctx, 0);
    expect(recorded[recorded.length - 1]).toEqual([
      plans[0].offset.x,
      1.5 + plans[0].offset.y,
      plans[0].offset.z,
    ]);

    // "Rotate" the holder (180° about z): the label offset is world-axis
    // aligned — the sprite position must NOT flip to the opposite side.
    (group as { rotation: { z: number } }).rotation.z = Math.PI;
    updateLabelOverlays(ctx, 0);
    expect(recorded[recorded.length - 1][1]).toBeCloseTo(1.5 + plans[0].offset.y, 6);
    expect(recorded[recorded.length - 1][0]).toBeCloseTo(plans[0].offset.x, 6);
  });

  it("only re-places when a labeled node moved beyond the threshold", () => {
    const spec = makeSpec({
      objects: [obj("a", "box", "Layer 1", { x: 0, y: 1.5, z: 0 }, 1)],
      relationships: [],
    });
    const { graph } = buildSceneGraph(spec);
    const group = fakeGroup({ x: 0, y: 1.5, z: 0 });
    const recorded: Array<[number, number, number]> = [];
    const overlay: LabelOverlay = {
      nodeId: "a",
      rn: { group } as unknown as LabelOverlay["rn"],
      sprite: {
        position: { set: (x: number, y: number, z: number) => void recorded.push([x, y, z]) },
      } as unknown as LabelOverlay["sprite"],
      material: null as unknown as LabelOverlay["material"],
      texture: null as unknown as LabelOverlay["texture"],
      plan: null,
      base: { x: 0, y: 1.5, z: 0 },
    };
    const ctx = makeCtx(graph, [overlay], new Map([["a", { group }]]));
    updateLabelOverlays(ctx, 0);
    const planAfterFirst = overlay.plan;
    const baseAfterFirst = { ...overlay.base };

    // Sub-threshold jitter: no re-plan (plan object identity preserved).
    (group as { position: Vec3 }).position = {
      x: LABEL_REPLACE_THRESHOLD / 2,
      y: 1.5,
      z: 0,
    };
    updateLabelOverlays(ctx, 0);
    expect(overlay.plan).toBe(planAfterFirst);
    expect(overlay.base).toEqual(baseAfterFirst);
    expect(recorded[recorded.length - 1][0]).toBeCloseTo(
      LABEL_REPLACE_THRESHOLD / 2 + planAfterFirst!.offset.x,
      6
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Collision geometry sanity (segment vs label rect)
// ---------------------------------------------------------------------------

describe("label collision primitives", () => {
  it("labelRectCollides detects an edge passing through a rect", () => {
    const rect: Rect = { cx: 0, cy: 0.2, cz: 0, halfW: 0.4, halfH: 0.1, halfD: GLYPH_HALF_D };
    const ctx = {
      nodeEnvelopes: [],
      edgePolylines: [{ id: "e", pts: [{ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }] }],
      placedRects: [],
    };
    // Edge at y=0 is 0.1 below the rect bottom (0.1): inside the 0.12 band.
    expect(labelRectCollides(rect, ctx)).toBe(true);
    // A rect far above the edge is clear.
    const far: Rect = { ...rect, cy: 2 };
    expect(labelRectCollides(far, ctx)).toBe(false);
    // Edge crossing the rect entirely.
    const crossing: Rect = { ...rect, cy: 0 };
    expect(labelRectCollides(crossing, ctx)).toBe(true);
    // Clearance boundary: exactly LABEL_EDGE_CLEAR away → no collision.
    const boundary: Rect = {
      cx: 0, cy: LABEL_EDGE_CLEAR + 0.2, cz: 0,
      halfW: 0.4, halfH: 0.2, halfD: GLYPH_HALF_D,
    };
    expect(labelRectCollides(boundary, ctx)).toBe(false);
  });
});
