/**
 * presentation-gate.corpus.ts — stress-corpus spec fixtures (C5, Wave 3;
 * design-2 §7.3). Single source consumed by the unit tests (Wave 3) and by
 * D2's e2e gate run (Wave 4).
 *
 * Each case is a real DemoSpecV1. `expect` mirrors design-2 §7.3: the counts
 * describe the FULL pipeline outcome (buildSceneGraph → resolvePresentation →
 * checkScene), which D2 asserts in e2e once C1–C4 land. The Wave-3 unit tests
 * (geometry-gate.test.ts) assert the GATE-level behavior on scenes derived
 * from these fixtures (I1 envelope math, I2 raw-segment crossings, I4 head
 * geometry) — the presentation pipeline itself is C1–C4's deliverable.
 */

import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1, PrimitiveObjectSpec } from "@/demonstrations/spec/demo-spec";

type Scene3D = NonNullable<DemoSpecV1["scene3d"]>;

export interface StressCorpusCase {
  id: string;
  spec: DemoSpecV1;
  expect: {
    critical: number;
    major: number;
    minor: number;
    reasons: string[];
  };
}

/** Minimal valid spec shell (pattern shared with the accessible-diagram tests). */
export function makeSpec(
  id: string,
  objects: PrimitiveObjectSpec[],
  relationships: Scene3D["relationships"] = [],
  animations: Scene3D["animations"] = []
): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id,
    generationId: `gen-${id}`,
    userQuery: `stress corpus: ${id}`,
    normalizedConcept: `stress corpus: ${id}`,
    title: `Stress corpus: ${id}`,
    learningObjective: "Exercise the geometry gate.",
    trust: {
      level: "conceptual_demonstration",
      label: "Conceptual demonstration",
      limitations: [],
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 4 / 3,
      background: "dark",
    },
    scene3d: { objects, relationships, animations },
    controls: [],
    prediction: { prompt: "?", options: ["a", "b"] },
    observationPrompts: [],
    representations: [],
    adaptationContext: { allowed: false, oneVariableMode: true },
    provenance: {
      source: "template_composition",
      templateIds: [],
      generatedAt: "2026-08-08T00:00:00Z",
    },
    limits: {
      maxObjects: SPEC_LIMITS.maxObjects,
      maxParticles: SPEC_LIMITS.maxParticlesDesktop,
      maxTimelineEvents: SPEC_LIMITS.maxTimelineEvents,
      maxControls: SPEC_LIMITS.maxControls,
    },
  };
}

const sphere = (
  id: string,
  x: number,
  y: number,
  z = 0,
  size = 1,
  label?: string
): PrimitiveObjectSpec => ({
  id,
  kind: "sphere",
  position: { x, y, z },
  size,
  ...(label ? { label } : {}),
});

/** 80 nodes at 0.25u lattice in a 2.25×1.75 box (audit4 proven case: 70 pairs < 52px). */
function denseLattice(): PrimitiveObjectSpec[] {
  const objects: PrimitiveObjectSpec[] = [];
  for (let i = 0; i < 80; i++) {
    objects.push(
      sphere(`n${i}`, (i % 10) * 0.25, Math.floor(i / 10) * 0.25, 0, 1)
    );
  }
  return objects;
}

const LONG_PROSE =
  "photosynthesis converts light energy into chemical energy stored in glucose";

export const STRESS_CORPUS: StressCorpusCase[] = [
  {
    id: "dense_80_lattice",
    spec: makeSpec("dense_80_lattice", denseLattice()),
    expect: {
      critical: 0,
      major: 80, // I1 mass violation — many envelopes intersect
      minor: 0,
      reasons: ["envelope_intersection"],
    },
  },
  {
    id: "size5_1u_spacing",
    spec: makeSpec(
      "size5_1u_spacing",
      [
        sphere("s1", 0, 0, 0, 5),
        sphere("s2", 1, 0, 0, 5),
        sphere("s3", 2, 0, 0, 5),
        sphere("s4", 0, 1, 0, 5),
        sphere("s5", 1, 1, 0, 5),
        sphere("s6", 2, 1, 0, 5),
      ],
      [{ id: "r1", type: "causes", from: "s1", to: "s2" }]
    ),
    expect: {
      critical: 0,
      major: 12, // I1 (envelopes overlap by 1.5u) + I5 impossible to frame
      minor: 0,
      reasons: ["envelope_intersection", "content_outside_viewport"],
    },
  },
  {
    id: "long_labels_25",
    spec: makeSpec(
      "long_labels_25",
      Array.from({ length: 25 }, (_, i) =>
        sphere(`n${i}`, (i % 5) * 2, Math.floor(i / 5) * 2, 0, 1, LONG_PROSE)
      )
    ),
    expect: {
      critical: 0,
      major: 0,
      minor: 0,
      reasons: ["label_truncated_ellipsis"],
    },
  },
  {
    id: "duplicates",
    spec: makeSpec(
      "duplicates",
      [
        { id: "pn1", kind: "process_node", position: { x: -3, y: 0, z: 0 } },
        { id: "ep1", kind: "energy_packet", position: { x: -3, y: 0, z: 0 } },
        sphere("pn2", 0, 0, 0),
        sphere("pn3", 3, 0, 0),
      ],
      [
        { id: "f1", type: "flows_to", from: "pn1", to: "pn2" },
        { id: "f2", type: "flows_to", from: "pn2", to: "pn3" },
      ]
    ),
    expect: {
      critical: 0,
      major: 1, // 3D gate: envelope intersection (duplicate world position)
      minor: 0,
      reasons: ["envelope_intersection"],
    },
  },
  {
    id: "z_only_pair",
    spec: makeSpec("z_only_pair", [
      sphere("a", 0, 1, 0),
      sphere("b", 0, 1, 5),
    ]),
    expect: {
      critical: 0,
      major: 0, // 3D clean (z separates); 2D spread rule applies (P3 parity)
      minor: 0,
      reasons: [],
    },
  },
  {
    id: "deep_groups",
    spec: makeSpec(
      "deep_groups",
      [
        { id: "g1", kind: "group", children: ["g2", "leaf1"] },
        { id: "g2", kind: "group", children: ["g3", "leaf2"] },
        { id: "g3", kind: "group", children: ["g4", "leaf3"] },
        { id: "g4", kind: "group", children: ["leaf4"] },
        sphere("leaf1", -2, 0, 0),
        sphere("leaf2", -1, 0, 0),
        sphere("leaf3", 1, 0, 0),
        sphere("leaf4", 2, 0, 0),
      ] as PrimitiveObjectSpec[],
      [{ id: "c1", type: "contains", from: "g1", to: "leaf1" }]
    ),
    expect: {
      critical: 0,
      major: 0,
      minor: 0,
      reasons: [],
    },
  },
  {
    id: "hub_8_branches",
    spec: makeSpec(
      "hub_8_branches",
      [
        sphere("hub", 0, 0, 0, 1.2),
        ...Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return sphere(`b${i}`, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0, 1);
        }),
      ],
      Array.from({ length: 8 }, (_, i) => ({
        id: `r${i}`,
        type: "activates" as const,
        from: "hub",
        to: `b${i}`,
      }))
    ),
    expect: {
      critical: 0,
      major: 0, // edge-label density: ≥ 5 skipped → edge_label_suppressed_density
      minor: 0,
      reasons: ["edge_label_suppressed_density"],
    },
  },
  {
    id: "short_edges",
    spec: makeSpec(
      "short_edges",
      [sphere("a", 0, 0, 0), sphere("b", 0.6, 0, 0), sphere("c", 1.4, 0, 0)],
      [
        { id: "r1", type: "causes", from: "a", to: "b" }, // 0.6u — head embeds source
        { id: "r2", type: "causes", from: "b", to: "c" }, // 0.8u — head embeds source
      ]
    ),
    expect: {
      critical: 0,
      major: 2, // I4: L < r_s + r_t + len on both edges
      minor: 0,
      reasons: ["arrow_head_inside_source"],
    },
  },
  {
    id: "edge_on_node",
    spec: makeSpec(
      "edge_on_node",
      [
        sphere("a", -3, 1, 0),
        sphere("b", 0, 1, 0),
        sphere("mid", -1.5, 1, 0), // sits ON the a→b segment (audit3 F-06 repro)
      ],
      [{ id: "r1", type: "causes", from: "a", to: "b" }]
    ),
    expect: {
      critical: 0,
      major: 0, // routed detour → I2 clean (raw straight segment would violate)
      minor: 0,
      reasons: [],
    },
  },
  {
    id: "outlier_crush",
    spec: makeSpec(
      "outlier_crush",
      [
        ...Array.from({ length: 20 }, (_, i) =>
          sphere(`n${i}`, (i % 5) - 2, Math.floor(i / 5) - 2, 0, 1)
        ),
        sphere("outlier", 400, 0, 0, 1),
      ]
    ),
    expect: {
      critical: 0,
      major: 0, // 2D projection spreads; 3D I5 fine after camera margin clamp
      minor: 0,
      reasons: [],
    },
  },
];
