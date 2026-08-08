/**
 * SEMANTIC FIELDS tests — Wave 2 (W3, semantic scene architect).
 *
 * Pins the FIX 3 semantic identity contract (orbit-learning root cause §4/§5):
 *   - additive acceptance: `role` / `description` shorthands and the
 *     `semantic` block ({name, type, shortDescription, role, interactive,
 *     relationshipSummary}) validate on PrimitiveObjectSpec without touching
 *     the wire shape — every existing spec stays valid;
 *   - repair, never new rejection: invalid types and empty strings are
 *     STRIPPED, over-length values TRUNCATED (name <= 24, prose <= 160), all
 *     with `repaired:semantic_*` reasons;
 *   - strict field-list discipline: unknown keys INSIDE the semantic block
 *     still reject, and the URL / executable-code scans still cover semantic
 *     strings;
 *   - `geometry:*` behavior untouched: semantic fields never mask duplicate /
 *     z-collapse geometry of model specs;
 *   - scene-graph carry: buildSceneGraph merges the shorthands into
 *     node.semantic (block wins), absent everywhere -> undefined;
 *   - stageGuideForSpec generalization: learner-facing semantic entities for
 *     EVERY scene type (verified_simulation/hybrid included), uncapped where
 *     semantic metadata exists (5/4 caps only for the auto-derived fallback
 *     when no semantic fields are present), relationship labels as summaries.
 */

import { describe, expect, it } from "vitest";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import {
  MAX_SEMANTIC_DESC_CHARS,
  MAX_SEMANTIC_NAME_CHARS,
} from "@/demonstrations/validation/demo-spec-schema";
import { sanitizeDemoSpec, validateDemoSpec } from "@/demonstrations/validation/sanitize";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import { stageGuideForSpec } from "@/demonstrations/renderers/primitive-3d/presentation";
import { buildOrbitsShowcase } from "@/demonstrations/showcases/orbits/build-spec";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A minimal valid verified-simulation spec (mirrors validation.test.ts). */
function baseSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "semantic-fields-demo",
    generationId: "gen-semantic-fields",
    userQuery: "semantic identity fields",
    normalizedConcept: "gravity and orbits",
    title: "Semantic Identity Fields",
    learningObjective: "Verify additive semantic metadata.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: ["Idealized two-body gravity."],
      engineId: "orbits",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "hybrid",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 16 / 9,
      background: "dark",
    },
    simulation: {
      engineId: "orbits",
      engineVersion: "1.0.0",
      seed: 1,
      parameters: [
        { key: "speed", label: "Launch speed", min: 0.5, max: 2, step: 0.1, value: 1 },
      ],
      readouts: [{ key: "period", label: "Period", format: "fixed2" }],
    },
    scene3d: {
      objects: [
        {
          id: "star",
          kind: "sphere",
          label: "Star",
          position: { x: 0, y: 0, z: 0 },
          size: 2,
          color: "#ffd166",
          semantic: {
            name: "Star",
            type: "star",
            shortDescription: "Central massive body.",
            role: "central body",
            interactive: false,
            relationshipSummary: "Gravity pulls the planet toward it.",
          },
        },
        {
          id: "planet",
          kind: "sphere",
          label: "Planet",
          position: { x: 6, y: 0, z: 0 },
          size: 1,
          color: "#67e8f9",
          role: "orbiter",
          description: "A body in orbit around the star.",
        },
      ],
      relationships: [
        {
          id: "r1",
          type: "orbits",
          from: "planet",
          to: "star",
          label: "The planet orbits the star",
        },
      ],
      animations: [],
    },
    controls: [
      {
        id: "c-speed",
        type: "slider",
        label: "Launch speed",
        target: { kind: "parameter", ref: "speed" },
        min: 0.5,
        max: 2,
        step: 0.1,
      },
    ],
    prediction: {
      prompt: "What happens when the launch speed rises?",
      options: ["Wider orbit", "Spiral inward"],
      correctIndex: 0,
    },
    observationPrompts: [],
    representations: [{ id: "rep-3d", kind: "stage_3d", label: "3D Model" }],
    adaptationContext: { allowed: false, oneVariableMode: false },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-08T00:00:00.000Z",
    },
    limits: {
      maxObjects: 2,
      maxParticles: 0,
      maxTimelineEvents: 0,
      maxControls: 1,
    },
  };
}

/** Deep clone as an untyped tree so tests can inject malformed values. */
function rawSpec(spec: DemoSpecV1 = baseSpec()): Record<string, unknown> {
  return JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;
}

/** Inject `patch` into scene3d.objects[objectIndex]. */
function patchObject(
  tree: Record<string, unknown>,
  objectIndex: number,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const scene = tree.scene3d as Record<string, unknown>;
  const objects = scene.objects as Array<Record<string, unknown>>;
  objects[objectIndex] = { ...objects[objectIndex], ...patch };
  return tree;
}

// ---------------------------------------------------------------------------
// 1. Additive acceptance — the new fields validate; existing specs unchanged
// ---------------------------------------------------------------------------

describe("semantic fields — additive acceptance", () => {
  it("accepts the full semantic block plus the role/description shorthands", () => {
    const result = validateDemoSpec(baseSpec());
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    const planet = result.spec?.scene3d?.objects.find((o) => o.id === "planet");
    expect(planet?.role).toBe("orbiter");
    expect(planet?.description).toBe("A body in orbit around the star.");
    expect(planet?.semantic).toBeUndefined();
  });

  it("accepts a partial semantic block (name only) on any kind", () => {
    const tree = patchObject(rawSpec(), 0, {
      semantic: { name: "Star" },
    }) as Record<string, unknown>;
    const result = validateDemoSpec(tree);
    expect(result.status).toBe("valid");
    expect(result.spec?.scene3d?.objects[0].semantic).toEqual({ name: "Star" });
  });

  it("keeps every existing curated showcase valid (buildOrbitsShowcase)", () => {
    const result = validateDemoSpec(buildOrbitsShowcase());
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    const star = result.spec?.scene3d?.objects.find((o) => o.id === "star");
    expect(star?.semantic?.name).toBe("Star");
    expect(star?.semantic?.relationshipSummary).toBe(
      "Gravity pulls the planet toward it."
    );
  });

  it("still rejects nothing new on specs without semantic fields", () => {
    const spec = baseSpec();
    spec.scene3d = undefined;
    const result = validateDemoSpec(JSON.parse(JSON.stringify(spec)));
    expect(result.status).toBe("valid");
  });
});

// ---------------------------------------------------------------------------
// 2. Repair — invalid types and empty strings stripped, over-length truncated
// ---------------------------------------------------------------------------

describe("semantic fields — repair (strip invalid types, cap lengths)", () => {
  it("drops a non-object semantic block with a repair reason", () => {
    const tree = patchObject(rawSpec(), 0, { semantic: "star" });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic");
    expect(result.spec?.scene3d?.objects[0].semantic).toBeUndefined();
  });

  it("drops a null semantic block (models emit null for absent)", () => {
    const tree = patchObject(rawSpec(), 0, { semantic: null });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic");
    expect(result.spec?.scene3d?.objects[0].semantic).toBeUndefined();
  });

  it("strips an invalid-typed semantic.name", () => {
    const tree = patchObject(rawSpec(), 0, { semantic: { name: 42 } });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic_name");
    expect(result.spec?.scene3d?.objects[0].semantic).toEqual({});
  });

  it("strips an invalid-typed interactive flag", () => {
    const tree = patchObject(rawSpec(), 0, { semantic: { interactive: "yes" } });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic_interactive");
    expect(result.spec?.scene3d?.objects[0].semantic).toEqual({});
  });

  it("strips an invalid-typed top-level role", () => {
    const tree = patchObject(rawSpec(), 1, { role: 5 });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic_role");
    expect(result.spec?.scene3d?.objects[1].role).toBeUndefined();
  });

  it("strips empty semantic strings (never an empty_field rejection)", () => {
    const tree = patchObject(rawSpec(), 0, {
      semantic: { name: "", role: "   " },
    });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic_name");
    expect(result.reasons).toContain("repaired:semantic_role");
    expect(result.spec?.scene3d?.objects[0].semantic).toEqual({});
  });

  it(`truncates semantic.name to ${MAX_SEMANTIC_NAME_CHARS} chars`, () => {
    const tree = patchObject(rawSpec(), 0, { semantic: { name: "N".repeat(30) } });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic_name");
    expect(result.spec?.scene3d?.objects[0].semantic?.name).toHaveLength(
      MAX_SEMANTIC_NAME_CHARS
    );
  });

  it(`truncates semantic.relationshipSummary to ${MAX_SEMANTIC_DESC_CHARS} chars`, () => {
    const tree = patchObject(rawSpec(), 0, {
      semantic: { relationshipSummary: "R".repeat(200) },
    });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic_relationship_summary");
    expect(
      result.spec?.scene3d?.objects[0].semantic?.relationshipSummary
    ).toHaveLength(MAX_SEMANTIC_DESC_CHARS);
  });

  it(`truncates the top-level description shorthand to ${MAX_SEMANTIC_DESC_CHARS} chars`, () => {
    const tree = patchObject(rawSpec(), 1, { description: "D".repeat(180) });
    const result = sanitizeDemoSpec(tree);
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:semantic_description");
    expect(result.spec?.scene3d?.objects[1].description).toHaveLength(
      MAX_SEMANTIC_DESC_CHARS
    );
  });

  it("accepts values exactly at the caps without repair", () => {
    const tree = patchObject(rawSpec(), 0, {
      semantic: {
        name: "N".repeat(MAX_SEMANTIC_NAME_CHARS),
        shortDescription: "S".repeat(MAX_SEMANTIC_DESC_CHARS),
      },
    });
    const result = validateDemoSpec(tree);
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
  });

  it("never touches timeline-event descriptions (not semantic shorthands)", () => {
    // Regression pin: the repair walk must scope the `description` shorthand
    // to scene objects only — a timeline event's description is a
    // maxExplanationChars (800) explanation block that must still REJECT
    // when over-long, never be truncated as a 160-char semantic field.
    const tree = rawSpec() as Record<string, unknown>;
    tree.timeline = {
      events: [{ title: "Step", description: "D".repeat(900), startMs: 0, durationMs: 1000 }],
    };
    const result = validateDemoSpec(tree);
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("text_exceeded:"))).toBe(
      true
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Strict field-list discipline — unknown keys and unsafe strings
// ---------------------------------------------------------------------------

describe("semantic fields — strict discipline", () => {
  it("rejects an unknown key inside the semantic block", () => {
    const tree = patchObject(rawSpec(), 0, { semantic: { bogus: "x" } });
    const result = validateDemoSpec(tree);
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("unknown_key:"))).toBe(true);
  });

  it("rejects a URL inside a semantic string", () => {
    const tree = patchObject(rawSpec(), 0, {
      semantic: { shortDescription: "See https://evil.example/x for details" },
    });
    const result = validateDemoSpec(tree);
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unsafe_value:url");
  });

  it("rejects executable-code markers inside semantic strings", () => {
    const tree = patchObject(rawSpec(), 1, { role: "eval(alert(1))" });
    const result = validateDemoSpec(tree);
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unsafe_value:code");
  });
});

// ---------------------------------------------------------------------------
// 4. geometry:* behavior untouched — semantic fields never mask geometry
// ---------------------------------------------------------------------------

describe("semantic fields — geometry checks untouched", () => {
  function modelSpecWithSemantic(): unknown {
    const tree = rawSpec();
    // Model specs may never grade predictions.
    (tree as Record<string, unknown>).prediction = {
      prompt: "What happens?",
      options: ["Wider orbit", "Spiral inward"],
    };
    (tree as Record<string, unknown>).provenance = {
      source: "model_generated_spec",
      templateIds: [],
      generatedAt: "2026-08-08T00:00:00.000Z",
    };
    const scene = (tree as Record<string, unknown>).scene3d as Record<string, unknown>;
    // Two spheres with IDENTICAL positions: a genuine geometry defect.
    scene.objects = [
      { id: "a", kind: "sphere", position: { x: 1, y: 1, z: 1 }, semantic: { name: "A" } },
      { id: "b", kind: "sphere", position: { x: 1, y: 1, z: 1 }, semantic: { name: "B" } },
    ];
    scene.relationships = [];
    return tree;
  }

  it("still rejects duplicate positions when semantic fields are present", () => {
    const result = validateDemoSpec(modelSpecWithSemantic());
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("geometry:duplicate_position");
  });

  it("still emits the z-collapse warning for semantic scenes", () => {
    const tree = modelSpecWithSemantic() as Record<string, unknown>;
    // A curated spec's residual z-collapse is a warning, never a rejection
    // (the geometry:* rejection classes stay model-spec-only, semantic
    // fields or not).
    tree.provenance = {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-08T00:00:00.000Z",
    };
    tree.prediction = {
      prompt: "What happens?",
      options: ["Wider orbit", "Spiral inward"],
      correctIndex: 0,
    };
    const scene = tree.scene3d as Record<string, unknown>;
    scene.objects = [
      { id: "a", kind: "sphere", position: { x: 1, y: 1, z: 1 }, semantic: { name: "A" } },
      { id: "b", kind: "sphere", position: { x: 1, y: 1, z: 5 }, semantic: { name: "B" } },
    ];
    const result = validateDemoSpec(tree);
    expect(result.status).toBe("valid");
    expect(result.reasons).toContain("z_collapse_warning");
  });

  it("still rejects z-collapsed geometry for model specs carrying semantic fields", () => {
    const tree = modelSpecWithSemantic() as Record<string, unknown>;
    const scene = tree.scene3d as Record<string, unknown>;
    scene.objects = [
      { id: "a", kind: "sphere", position: { x: 1, y: 1, z: 1 }, semantic: { name: "A" } },
      { id: "b", kind: "sphere", position: { x: 1, y: 1, z: 5 }, semantic: { name: "B" } },
    ];
    const result = validateDemoSpec(tree);
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("geometry:z_collapse");
  });
});

// ---------------------------------------------------------------------------
// 5. Scene-graph carry — buildSceneGraph normalizes semantic onto nodes
// ---------------------------------------------------------------------------

describe("semantic fields — scene-graph carry", () => {
  it("carries the semantic block and merges the top-level shorthands", () => {
    const { graph } = buildSceneGraph(baseSpec());
    const star = graph.nodes.find((n) => n.id === "star");
    expect(star?.semantic).toEqual({
      name: "Star",
      type: "star",
      shortDescription: "Central massive body.",
      role: "central body",
      interactive: false,
      relationshipSummary: "Gravity pulls the planet toward it.",
    });
    // top-level role/description shorthand -> merged into semantic
    const planet = graph.nodes.find((n) => n.id === "planet");
    expect(planet?.semantic).toEqual({
      role: "orbiter",
      shortDescription: "A body in orbit around the star.",
    });
  });

  it("lets the semantic block win over the top-level shorthand", () => {
    const spec = baseSpec();
    const planet = spec.scene3d!.objects.find((o) => o.id === "planet")!;
    planet.semantic = { role: "dominant" };
    planet.role = "shorthand";
    const { graph } = buildSceneGraph(spec);
    expect(graph.nodes.find((n) => n.id === "planet")?.semantic?.role).toBe(
      "dominant"
    );
  });

  it("leaves semantic undefined when nothing is present", () => {
    const spec = baseSpec();
    spec.scene3d!.objects = spec.scene3d!.objects.map((o) => {
      const { role, description, semantic, ...rest } = o;
      void role;
      void description;
      void semantic;
      return rest;
    });
    const { graph } = buildSceneGraph(spec);
    for (const node of graph.nodes) {
      expect(node.semantic).toBeUndefined();
    }
  });

  it("keeps all existing node derivations byte-identical (position/size/kind)", () => {
    const withSemantic = buildSceneGraph(baseSpec());
    const spec = baseSpec();
    spec.scene3d!.objects = spec.scene3d!.objects.map((o) => {
      const { role, description, semantic, ...rest } = o;
      void role;
      void description;
      void semantic;
      return rest;
    });
    const withoutSemantic = buildSceneGraph(spec);
    expect(withSemantic.graph.nodes.map((n) => ({ id: n.id, kind: n.kind, position: n.position, size: n.size, color: n.color, label: n.label }))).toEqual(
      withoutSemantic.graph.nodes.map((n) => ({ id: n.id, kind: n.kind, position: n.position, size: n.size, color: n.color, label: n.label }))
    );
  });
});

// ---------------------------------------------------------------------------
// 6. stageGuideForSpec generalization — semantic entities for EVERY scene type
// ---------------------------------------------------------------------------

describe("semantic fields — stageGuideForSpec generalization", () => {
  it("produces uncapped semantic entities for the verified_simulation orbit showcase", () => {
    const guide = stageGuideForSpec(buildOrbitsShowcase());
    const star = guide.entities.find((e) => e.id === "star");
    expect(star).toEqual({
      id: "star",
      label: "Star",
      color: "#ffd166",
      name: "Star",
      type: "star",
      shortDescription: "Central massive body.",
      role: "central body",
      interactive: false,
      relationshipSummary: "Gravity pulls the planet toward it.",
    });
    // the decorative orbit ring opts in via explicit semantic metadata
    const ring = guide.entities.find((e) => e.id === "orbit-path-planet");
    expect(ring?.label).toBe("Default orbit guide");
    expect(ring?.type).toBe("orbit guide");
    expect(ring?.interactive).toBe(false);
    // semantic name wins over the visual label ("Moon (illustrative)")
    const moon = guide.entities.find((e) => e.id === "moon");
    expect(moon?.label).toBe("Moon");
    expect(moon?.relationshipSummary).toBe("It orbits the planet.");
    // relationships uncapped; labels ARE the summaries
    expect(guide.relationships.map((r) => r.label)).toEqual([
      "The planet orbits the star",
      "The moon orbits the planet",
      "Gravity pulls the planet toward the star",
    ]);
  });

  it("keeps the 5-entity / 4-relationship caps for the auto-derived fallback", () => {
    const spec = baseSpec();
    // strip every semantic field -> pure fallback mode
    spec.scene3d!.objects = spec.scene3d!.objects.map((o) => {
      const { role, description, semantic, ...rest } = o;
      void role;
      void description;
      void semantic;
      return rest;
    });
    spec.scene3d!.objects = Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      kind: "sphere" as const,
      label: `Node ${i}`,
      position: { x: i, y: 0, z: 0 },
      size: 1,
    }));
    spec.scene3d!.relationships = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      type: "attracts" as const,
      from: "n0",
      to: `n${i + 1}`,
    }));
    const guide = stageGuideForSpec(spec);
    expect(guide.entities).toHaveLength(5);
    expect(guide.relationships).toHaveLength(4);
    // fallback entities carry ONLY the legacy keys
    for (const entity of guide.entities) {
      expect(Object.keys(entity).sort()).toEqual(["color", "id", "label"]);
    }
  });

  it("uncaps semantic entities while fallback entities keep their 5-cap", () => {
    const spec = baseSpec();
    const semanticObjects = Array.from({ length: 7 }, (_, i) => ({
      id: `sem${i}`,
      kind: "sphere" as const,
      label: `Sem ${i}`,
      position: { x: i, y: 0, z: 0 },
      size: 1,
      semantic: { name: `Sem ${i}`, interactive: i === 0 },
    }));
    const fallbackObjects = Array.from({ length: 6 }, (_, i) => ({
      id: `plain${i}`,
      kind: "sphere" as const,
      label: `Plain ${i}`,
      position: { x: i + 20, y: 0, z: 0 },
      size: 1,
    }));
    spec.scene3d!.objects = [...semanticObjects, ...fallbackObjects];
    spec.scene3d!.relationships = [];
    const guide = stageGuideForSpec(spec);
    const semanticIds = guide.entities
      .filter((e) => e.id.startsWith("sem"))
      .map((e) => e.id);
    expect(semanticIds).toHaveLength(7); // uncapped
    const fallbackIds = guide.entities
      .filter((e) => e.id.startsWith("plain"))
      .map((e) => e.id);
    expect(fallbackIds).toHaveLength(5); // auto-derived fallback capped
  });

  it("derives a relationshipSummary from touching relationships when absent", () => {
    const spec = baseSpec();
    const star = spec.scene3d!.objects.find((o) => o.id === "star")!;
    delete star.semantic?.relationshipSummary;
    // star participates in r1 (to) and in a new relationship from its side
    spec.scene3d!.relationships.push({
      id: "r2",
      type: "attracts",
      from: "star",
      to: "planet",
      label: "Gravity pulls the planet toward the star",
    });
    const guide = stageGuideForSpec(spec);
    const entity = guide.entities.find((e) => e.id === "star");
    expect(entity?.relationshipSummary).toBe(
      "The planet orbits the star Gravity pulls the planet toward the star"
    );
  });

  it("derives a summary through the containing group (child of a group endpoint)", () => {
    const spec = baseSpec();
    const planet = spec.scene3d!.objects.find((o) => o.id === "planet")!;
    planet.role = undefined;
    planet.description = undefined;
    planet.semantic = { name: "Planet" };
    spec.scene3d!.objects.push({
      id: "system",
      kind: "group",
      position: { x: 0, y: 0, z: 0 },
      children: ["planet"],
      semantic: { name: "System" },
    });
    spec.scene3d!.relationships = [
      { id: "r1", type: "orbits", from: "system", to: "star", label: "The planet orbits the star" },
    ];
    const guide = stageGuideForSpec(spec);
    const entity = guide.entities.find((e) => e.id === "planet");
    expect(entity?.relationshipSummary).toBe("The planet orbits the star");
  });

  it("produces entities for conceptual scenes with semantic metadata too", () => {
    const spec = baseSpec();
    spec.trust = {
      level: "conceptual_demonstration",
      label: "Conceptual demonstration",
      limitations: ["Qualitative only."],
    };
    spec.simulation = undefined;
    spec.prediction = {
      prompt: "What pattern emerges?",
      options: ["A", "B"],
    };
    const guide = stageGuideForSpec(spec);
    expect(guide.entities.map((e) => e.id)).toContain("star");
    expect(guide.entities.find((e) => e.id === "star")?.role).toBe(
      "central body"
    );
  });
});
