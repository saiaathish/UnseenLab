/**
 * Validation suite for the demonstration spec pipeline:
 *   - demoSpecSchema (strict Zod mirror of DemoSpecV1)
 *   - validateDemoSpec / sanitizeDemoSpec (repair-aware pipeline)
 *   - sciencePolicy (trust-level + content safety)
 *
 * Covers the full program list: valid specs per trust level, unknown
 * primitives/engines/fields, JS/shader fields, unsafe URLs, count limits,
 * control targets, level mismatches, malformed JSON, prototype pollution,
 * deep recursion, unknown-key rejection, oversize specs, engine/parameter
 * incompatibility, numeric repair, and content safety — including that the
 * fictionalized nuclear chain reaction topic remains accepted.
 */

import { describe, expect, it } from "vitest";
import {
  demoSpecSchema,
  MAX_SPEC_DEPTH,
  measureDepth,
  MOBILE_MAX_PARTICLES,
  sanitizeDemoSpec,
  sciencePolicy,
  validateDemoSpec,
} from "@/demonstrations/validation";
import { firstPassModelCheck } from "@/demonstrations/generation/model/schema";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function baseLimits(
  overrides: Partial<DemoSpecV1["limits"]> = {}
): DemoSpecV1["limits"] {
  return {
    maxObjects: 80,
    maxParticles: 1500,
    maxTimelineEvents: 30,
    maxControls: 6,
    ...overrides,
  };
}

/** Valid Level 1 spec: pendulum engine with catalog-compatible params. */
function verifiedSimulationSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "demo-001",
    generationId: "gen-abc-123",
    userQuery: "How does a pendulum behave?",
    normalizedConcept: "Simple harmonic motion of a pendulum",
    title: "Pendulum Motion",
    learningObjective:
      "Observe how length and amplitude affect the period of a pendulum.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: ["Air resistance is ignored."],
      engineId: "pendulum",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "lumina_2d",
      fallbackKind: "data_table",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    simulation: {
      engineId: "pendulum",
      engineVersion: "1.0.0",
      seed: 42,
      parameters: [
        {
          key: "length",
          label: "Pendulum length",
          min: 0.1,
          max: 5,
          step: 0.1,
          value: 1.2,
          unit: "m",
        },
      ],
      readouts: [{ key: "period", label: "Period", format: "fixed2" }],
    },
    scene3d: {
      objects: [
        { id: "pivot", kind: "box", position: { x: 0, y: 1, z: 0 } },
        {
          id: "bob",
          kind: "sphere",
          position: { x: 0, y: 0, z: 0 },
          size: 0.25,
          color: "#ff8800",
        },
      ],
      relationships: [
        { id: "rod", type: "causes", from: "pivot", to: "bob" },
      ],
      animations: [
        {
          id: "swing",
          target: "bob",
          operator: "oscillate",
          speed: 1,
          axis: "y",
          amplitude: 0.4,
        },
      ],
    },
    controls: [
      {
        id: "length-control",
        type: "slider",
        label: "Length",
        target: { kind: "parameter", ref: "length" },
        min: 0.1,
        max: 5,
        step: 0.1,
      },
    ],
    prediction: {
      prompt: "What happens to the period if the length doubles?",
      options: [
        "It doubles",
        "It stays the same",
        "It increases but not by double",
      ],
      correctIndex: 2,
    },
    observationPrompts: [{ prompt: "Record the period for three lengths." }],
    representations: [
      { id: "rep-stage", kind: "stage_2d", label: "Stage" },
      { id: "rep-table", kind: "table", label: "Data table" },
    ],
    adaptationContext: { allowed: false, oneVariableMode: false },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: baseLimits(),
  };
}

/** Valid Level 2 spec: qualitative, engine-free, with limitations. */
function conceptualDemonstrationSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "demo-002",
    generationId: "gen-def-456",
    userQuery: "How does energy move through a system?",
    normalizedConcept: "Energy transfer through a connected system",
    title: "Energy Transfer",
    learningObjective:
      "Identify the direction of energy flow in a simple system.",
    trust: {
      level: "conceptual_demonstration",
      label: "Conceptual demonstration",
      limitations: ["Qualitative only; no numeric claims."],
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 1.5,
      background: "light",
    },
    scene3d: {
      objects: [
        { id: "source", kind: "process_node", label: "Source" },
        { id: "sink", kind: "process_node", label: "Sink" },
      ],
      relationships: [
        {
          id: "flow",
          type: "flows_to",
          from: "source",
          to: "sink",
          label: "Energy flow",
        },
      ],
      animations: [{ id: "pulse", target: "source", operator: "pulse" }],
    },
    controls: [
      {
        id: "play",
        type: "play_pause",
        label: "Play",
        target: { kind: "scene", ref: "play_pause" },
      },
    ],
    prediction: {
      prompt: "Which direction does energy flow?",
      options: ["From source to sink", "From sink to source"],
    },
    observationPrompts: [{ prompt: "Describe what happens to the energy." }],
    representations: [{ id: "rep-map", kind: "causal_map", label: "Causal map" }],
    adaptationContext: { allowed: true, oneVariableMode: false },
    provenance: {
      source: "template_composition",
      templateIds: ["process_flow"],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: baseLimits(),
  };
}

/** Valid Level 3 spec: narrative timeline, engine-free, no parameter controls. */
function explanatoryAnimationSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "demo-003",
    generationId: "gen-ghi-789",
    userQuery: "What are the stages of the water cycle?",
    normalizedConcept: "Stages of the water cycle",
    title: "The Water Cycle",
    learningObjective: "Order the stages of the water cycle.",
    trust: {
      level: "explanatory_animation",
      label: "Explanatory animation",
      limitations: [],
    },
    renderer: {
      kind: "lumina_2d",
      fallbackKind: "timeline",
      preferredAspectRatio: 1.78,
      background: "dark",
    },
    timeline: {
      events: [
        {
          title: "Evaporation",
          description: "Sunlight warms surface water and it rises as vapor.",
          startMs: 0,
          durationMs: 1000,
        },
        {
          title: "Condensation",
          description: "Vapor cools and gathers into clouds.",
          startMs: 1000,
          durationMs: 1000,
        },
        {
          title: "Precipitation",
          description: "Water falls back to the ground.",
          startMs: 2000,
          durationMs: 1000,
        },
      ],
    },
    scene3d: {
      objects: [{ id: "drop", kind: "energy_packet", label: "Water drop" }],
      relationships: [],
      animations: [
        { id: "fall", target: "drop", operator: "translate", speed: 1 },
      ],
    },
    controls: [],
    prediction: {
      prompt: "Order the stages of the water cycle.",
      options: ["Evaporation first", "Condensation first"],
    },
    observationPrompts: [{ prompt: "List the stages in order." }],
    representations: [{ id: "rep-tl", kind: "timeline", label: "Timeline" }],
    adaptationContext: { allowed: false, oneVariableMode: true },
    provenance: {
      source: "template_composition",
      templateIds: ["timeline_sequence"],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: baseLimits(),
  };
}

/** Level 1 spec for the nuclear chain reaction engine (dimensionless). */
function nuclearChainReactionSpec(): DemoSpecV1 {
  const spec = verifiedSimulationSpec();
  spec.id = "demo-nuclear";
  spec.generationId = "gen-nuc-000";
  spec.userQuery = "How does a chain reaction sustain itself?";
  spec.normalizedConcept =
    "A simplified model of a self-sustaining nuclear chain reaction";
  spec.title = "Nuclear Chain Reaction";
  spec.learningObjective =
    "Explore how absorber rods control a chain reaction.";
  spec.trust.engineId = "nuclear_chain_reaction";
  spec.trust.engineVersion = "1.0.0";
  spec.simulation = {
    engineId: "nuclear_chain_reaction",
    engineVersion: "1.0.0",
    seed: 7,
    parameters: [
      {
        key: "initialNeutrons",
        label: "Initial neutrons",
        min: 1,
        max: 1000,
        step: 1,
        value: 50,
      },
      {
        key: "absorber",
        label: "Absorber",
        min: 0,
        max: 1,
        step: 0.05,
        value: 0.3,
      },
      {
        key: "multiplication",
        label: "Multiplication",
        min: 1,
        max: 3,
        step: 0.1,
        value: 2,
      },
    ],
    readouts: [
      { key: "neutronCount", label: "Neutron count", format: "raw" },
      { key: "generation", label: "Generation", format: "raw" },
    ],
  };
  spec.trust.limitations = [
    "Dimensionless model; not a real reactor.",
    "Numbers are illustrative, not physical.",
  ];
  spec.prediction = {
    prompt: "What happens when the absorber is removed?",
    options: ["The count rises", "The count stays the same"],
    correctIndex: 0,
  };
  spec.controls = [
    {
      id: "absorber-control",
      type: "slider",
      label: "Absorber",
      target: { kind: "parameter", ref: "absorber" },
      min: 0,
      max: 1,
      step: 0.05,
    },
  ];
  return spec;
}

function toJson(spec: DemoSpecV1): string {
  return JSON.stringify(spec);
}

// ---------------------------------------------------------------------------
// Accepted specs
// ---------------------------------------------------------------------------

describe("validateDemoSpec — accepted specs", () => {
  it("accepts a valid verified simulation", () => {
    const result = validateDemoSpec(toJson(verifiedSimulationSpec()));
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    expect(result.spec?.trust.level).toBe("verified_simulation");
  });

  it("accepts a valid conceptual demonstration", () => {
    const result = validateDemoSpec(toJson(conceptualDemonstrationSpec()));
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    expect(result.spec?.trust.level).toBe("conceptual_demonstration");
  });

  it("accepts a valid explanatory animation", () => {
    const result = validateDemoSpec(toJson(explanatoryAnimationSpec()));
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    expect(result.spec?.trust.level).toBe("explanatory_animation");
  });

  it("still accepts the fictionalized nuclear chain reaction topic", () => {
    const result = validateDemoSpec(toJson(nuclearChainReactionSpec()));
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Schema rejections
// ---------------------------------------------------------------------------

describe("validateDemoSpec — schema rejections", () => {
  it("rejects an unknown primitive kind", () => {
    const spec = verifiedSimulationSpec();
    (spec.scene3d!.objects[0] as { kind: string }).kind = "dodecahedron";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("invalid_enum"))).toBe(true);
  });

  it("rejects an unknown engine id", () => {
    const spec = verifiedSimulationSpec();
    (spec.simulation as { engineId: string }).engineId = "quantum_field";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_enum:simulation.engineId");
  });

  it("rejects arbitrary JavaScript fields (onclick / code keys)", () => {
    const spec = verifiedSimulationSpec();
    (spec as unknown as Record<string, unknown>)["onclick"] = "alert(1)";
    (spec as unknown as Record<string, unknown>)["code"] = "evil()";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unknown_key:onclick");
    expect(result.reasons).toContain("unknown_key:code");
  });

  it("rejects shader fields (glsl / fragmentShader keys)", () => {
    const spec = verifiedSimulationSpec();
    (spec.scene3d as unknown as Record<string, unknown>)["fragmentShader"] =
      "void main() {}";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    // Reason codes slug keys to safe lowercase (never echo raw attacker text).
    expect(result.reasons).toContain("unknown_key:fragmentshader");

    const spec2 = verifiedSimulationSpec();
    (spec2.renderer as unknown as Record<string, unknown>)["glsl"] =
      "uniform float t;";
    const result2 = validateDemoSpec(toJson(spec2));
    expect(result2.status).toBe("rejected");
    expect(result2.reasons).toContain("unknown_key:glsl");
  });

  it("rejects unknown keys at the top level", () => {
    const spec = verifiedSimulationSpec();
    (spec as unknown as Record<string, unknown>)["extra_field"] = "x";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unknown_key:extra_field");
  });

  it("rejects an unknown readout format", () => {
    const spec = verifiedSimulationSpec();
    (spec.simulation!.readouts[0] as { format: string }).format = "scientific";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("invalid_enum"))).toBe(true);
  });

  it("rejects a non-positive engine parameter step (step sanity)", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].step = 0;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("range_exceeded:step");
  });

  it("rejects a negative seed and a non-integer seed", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.seed = -1;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("range_exceeded:seed");

    const spec2 = verifiedSimulationSpec();
    spec2.simulation!.seed = 2.5;
    const result2 = validateDemoSpec(toJson(spec2));
    expect(result2.status).toBe("rejected");
    expect(result2.reasons).toContain("invalid_type:simulation.seed");
  });
});

// ---------------------------------------------------------------------------
// URLs and executable code
// ---------------------------------------------------------------------------

describe("validateDemoSpec — URLs and executable code", () => {
  it("rejects an https URL in spec-level text", () => {
    const spec = verifiedSimulationSpec();
    spec.title = "Watch https://evil.example/launch now";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unsafe_value:url");
    expect(result.reasons.join(" ")).not.toContain("evil.example");
  });

  it("rejects a data: URI and a javascript: URI anywhere", () => {
    const spec = verifiedSimulationSpec();
    spec.normalizedConcept = "diagram data:text/html;base64,AAAA";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unsafe_value:url");

    const spec2 = verifiedSimulationSpec();
    spec2.learningObjective = "run javascript:fetch(location)";
    const result2 = validateDemoSpec(toJson(spec2));
    expect(result2.status).toBe("rejected");
    expect(result2.reasons).toContain("unsafe_value:url");
  });

  it("rejects www. and protocol-relative URLs", () => {
    const spec = verifiedSimulationSpec();
    spec.observationPrompts[0].prompt = "See www.malicious.example";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unsafe_value:url");

    const spec2 = verifiedSimulationSpec();
    spec2.title = "//evil.example/now";
    const result2 = validateDemoSpec(toJson(spec2));
    expect(result2.status).toBe("rejected");
    expect(result2.reasons).toContain("unsafe_value:url");
  });

  it("rejects strings carrying eval( or new Function", () => {
    const spec = verifiedSimulationSpec();
    spec.userQuery = "run eval(alert) here";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unsafe_value:code");

    const spec2 = verifiedSimulationSpec();
    spec2.normalizedConcept = "call new Function('x')";
    const result2 = validateDemoSpec(toJson(spec2));
    expect(result2.status).toBe("rejected");
    expect(result2.reasons).toContain("unsafe_value:code");
  });
});

// ---------------------------------------------------------------------------
// Count limits
// ---------------------------------------------------------------------------

describe("validateDemoSpec — count limits", () => {
  it("rejects excessive objects (90 > 80)", () => {
    const spec = verifiedSimulationSpec();
    for (let i = 0; i < 88; i += 1) {
      spec.scene3d!.objects.push({ id: `extra-${i}`, kind: "box" });
    }
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("count_exceeded:objects");
  });

  it("rejects excessive timeline events (35 > 30)", () => {
    const spec = explanatoryAnimationSpec();
    for (let i = 0; i < 32; i += 1) {
      spec.timeline!.events.push({
        title: `Event ${i}`,
        description: "A step in the cycle.",
        startMs: i * 1000,
        durationMs: 500,
      });
    }
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("count_exceeded:timeline_events");
  });

  it("rejects excessive controls (7 > 6)", () => {
    const spec = verifiedSimulationSpec();
    for (let i = 0; i < 6; i += 1) {
      spec.controls.push({
        id: `extra-control-${i}`,
        type: "button",
        label: "Button",
        target: { kind: "scene", ref: "reset" },
      });
    }
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("count_exceeded:controls");
  });

  it("rejects excessive label objects (26 > 25)", () => {
    const spec = verifiedSimulationSpec();
    for (let i = 0; i < 26; i += 1) {
      spec.scene3d!.objects.push({ id: `label-${i}`, kind: "label" });
    }
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("count_exceeded:labels");
  });

  it("repairs declared limits that exceed the hard caps", () => {
    // Declared budgets are resource promises, not physics: an over-declared
    // maxObjects is clamped to the enforceable cap with a repair reason.
    const spec = verifiedSimulationSpec();
    spec.limits.maxObjects = 500;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:maxObjects");
    expect(result.spec!.limits.maxObjects).toBe(SPEC_LIMITS.maxObjects);
  });

  it("raises declared limits that lie below actual counts", () => {
    // Declared limits are a promise: under-declared budgets are raised to
    // the real usage with a repair reason (zero budgets are valid).
    const spec = verifiedSimulationSpec();
    spec.limits.maxObjects = 1; // only 1 object allowed, we ship 2
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:maxObjects");
    expect(result.spec!.limits.maxObjects).toBeGreaterThanOrEqual(2);
  });

  it("repairs excessive particles by clamping to the desktop cap", () => {
    const spec = verifiedSimulationSpec();
    spec.scene3d!.objects.push({
      id: "dust",
      kind: "particle_field",
      particleCount: 5000,
    });
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:particle_count");
    const dust = result.spec!.scene3d!.objects.find((o) => o.id === "dust");
    expect(dust?.particleCount).toBe(SPEC_LIMITS.maxParticlesDesktop);
  });

  it("clamps particles to a smaller declared mobile cap", () => {
    const spec = verifiedSimulationSpec();
    spec.limits.maxParticles = MOBILE_MAX_PARTICLES;
    spec.scene3d!.objects.push({
      id: "dust",
      kind: "particle_field",
      particleCount: 1200,
    });
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    const dust = result.spec!.scene3d!.objects.find((o) => o.id === "dust");
    expect(dust?.particleCount).toBe(MOBILE_MAX_PARTICLES);
  });

  it("repairs an over-declared maxParticles budget to the desktop cap", () => {
    const spec = verifiedSimulationSpec();
    spec.limits.maxParticles = 2000;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:maxParticles");
    expect(result.spec!.limits.maxParticles).toBe(
      SPEC_LIMITS.maxParticlesDesktop
    );
  });
});

// ---------------------------------------------------------------------------
// Structure and cross-references
// ---------------------------------------------------------------------------

describe("validateDemoSpec — structure and cross-references", () => {
  it("rejects a control target that does not resolve", () => {
    const spec = verifiedSimulationSpec();
    spec.controls[0].target = { kind: "parameter", ref: "nonexistent_param" };
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_control_target");
  });

  it("rejects an animation control target that does not resolve", () => {
    const spec = verifiedSimulationSpec();
    spec.controls[0].target = { kind: "animation", ref: "no-such-anim" };
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_control_target");
  });

  it("rejects an unknown scene control ref", () => {
    const spec = verifiedSimulationSpec();
    (spec.controls[0] as { target: { kind: string; ref: string } }).target = {
      kind: "scene",
      ref: "bogus",
    };
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("invalid_enum"))).toBe(true);
  });

  it("rejects a correctIndex outside the option list", () => {
    const spec = verifiedSimulationSpec();
    spec.prediction.options = ["A", "B"];
    spec.prediction.correctIndex = 2;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_prediction_index");
  });

  it("rejects group nesting deeper than 4", () => {
    const spec = verifiedSimulationSpec();
    spec.scene3d!.objects = [
      { id: "g1", kind: "group", children: ["g2"] },
      { id: "g2", kind: "group", children: ["g3"] },
      { id: "g3", kind: "group", children: ["g4"] },
      { id: "g4", kind: "group", children: ["g5"] },
      { id: "g5", kind: "group" },
    ];
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("count_exceeded:group_depth");
  });

  it("rejects a trust block that contradicts the simulation engine", () => {
    const spec = verifiedSimulationSpec();
    spec.trust.engineId = "waves";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("inconsistent_engine");
  });
});

// ---------------------------------------------------------------------------
// Trust-level science policy
// ---------------------------------------------------------------------------

describe("validateDemoSpec — trust-level science policy", () => {
  it("rejects a Level 1 spec without an engine (no simulation block)", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation = undefined;
    spec.controls = [
      {
        id: "play",
        type: "play_pause",
        label: "Play",
        target: { kind: "scene", ref: "play_pause" },
      },
    ];
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level1_simulation");
  });

  it("rejects a Level 2 spec with a numerical prediction (correctIndex)", () => {
    const spec = conceptualDemonstrationSpec();
    spec.prediction.correctIndex = 0;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level2_prediction");
  });

  it("rejects a Level 2 spec that carries a simulation", () => {
    const spec = conceptualDemonstrationSpec();
    spec.simulation = verifiedSimulationSpec().simulation;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level2_simulation");
  });

  it("rejects a Level 2 spec without any limitation", () => {
    const spec = conceptualDemonstrationSpec();
    spec.trust.limitations = [];
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level2_limitations");
  });

  it("rejects a Level 3 spec with a readout/parameter control", () => {
    const spec = explanatoryAnimationSpec();
    spec.simulation = verifiedSimulationSpec().simulation;
    spec.controls = [
      {
        id: "length-control",
        type: "slider",
        label: "Length",
        target: { kind: "parameter", ref: "length" },
        min: 0.1,
        max: 5,
        step: 0.1,
      },
    ];
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level3_simulation");
    expect(result.reasons).toContain("science_policy:level3_parameter_control");
  });

  it("rejects a Level 3 spec without a timeline", () => {
    const spec = explanatoryAnimationSpec();
    spec.timeline = undefined;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level3_timeline");
  });

  it("rejects a Level 3 spec with a graded prediction", () => {
    const spec = explanatoryAnimationSpec();
    spec.prediction.correctIndex = 0;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level3_prediction");
  });

  it("rejects engine/parameter incompatibility (unknown parameter key)", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].key = "frequency";
    spec.controls[0].target = { kind: "parameter", ref: "frequency" };
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("incompatible_engine");
  });

  it("rejects engine/readout incompatibility (unknown readout key)", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.readouts[0].key = "voltage";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("incompatible_engine");
  });
});

// ---------------------------------------------------------------------------
// Hardening
// ---------------------------------------------------------------------------

describe("validateDemoSpec — hardening", () => {
  it("falls back when the input is not JSON at all", () => {
    const outcome = sanitizeDemoSpec("{ definitely not json");
    expect(outcome.status).toBe("fallback");
    expect(outcome.reasons).toContain("malformed_json");
    expect(outcome.spec).toBeUndefined();

    const result = validateDemoSpec("{ definitely not json");
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("malformed_json");
  });

  it("rejects JSON that is not an object document", () => {
    const result = validateDemoSpec("42");
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("malformed_json");
  });

  it("rejects prototype-pollution keys (__proto__)", () => {
    const raw =
      '{"__proto__":{"polluted":true},"schemaVersion":1,"id":"x","generationId":"g","userQuery":"q","normalizedConcept":"c","title":"t","learningObjective":"o","trust":{"level":"conceptual_demonstration","label":"l","limitations":["lim"]},"renderer":{"kind":"lumina_2d","fallbackKind":"data_table","preferredAspectRatio":1.5,"background":"dark"},"controls":[],"prediction":{"prompt":"p","options":["a","b"]},"observationPrompts":[],"representations":[],"adaptationContext":{"allowed":false,"oneVariableMode":false},"provenance":{"source":"template_composition","templateIds":[],"generatedAt":"2026-08-04T00:00:00.000Z"},"limits":{"maxObjects":80,"maxParticles":1500,"maxTimelineEvents":30,"maxControls":6}}';
    const result = validateDemoSpec(raw);
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("prototype_pollution");
  });

  it("rejects constructor and prototype keys anywhere", () => {
    const spec = verifiedSimulationSpec();
    (spec.scene3d!.objects[0] as unknown as Record<string, unknown>)["constructor"] = 1;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("prototype_pollution");

    const spec2 = verifiedSimulationSpec();
    (spec2.scene3d!.objects[0] as unknown as Record<string, unknown>)["prototype"] = { x: 1 };
    const result2 = validateDemoSpec(toJson(spec2));
    expect(result2.status).toBe("rejected");
    expect(result2.reasons).toContain("prototype_pollution");
  });

  it("rejects deep recursion beyond the max spec depth", () => {
    let deep: unknown = { leaf: "x" };
    for (let i = 0; i < MAX_SPEC_DEPTH + 1; i += 1) {
      deep = { nested: deep };
    }
    const result = validateDemoSpec(deep);
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("deep_recursion");
  });

  it("accepts nesting at exactly the max spec depth (guard boundary)", () => {
    // The depth guard runs on the raw tree before schema validation, so the
    // boundary is exercised through measureDepth directly (a strict spec
    // cannot carry arbitrary extra nesting anywhere).
    let deep: unknown = { leaf: "x" };
    for (let i = 0; i < MAX_SPEC_DEPTH - 1; i += 1) {
      deep = { nested: deep };
    }
    expect(measureDepth(deep, MAX_SPEC_DEPTH + 1)).toBe(MAX_SPEC_DEPTH);

    deep = { nested: deep };
    expect(measureDepth(deep, MAX_SPEC_DEPTH + 1)).toBe(MAX_SPEC_DEPTH + 1);
  });

  it("rejects specs larger than 256 KB", () => {
    const spec = verifiedSimulationSpec();
    spec.userQuery = "a".repeat(300_000);
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("too_large");
  });
});

// ---------------------------------------------------------------------------
// Content safety
// ---------------------------------------------------------------------------

describe("validateDemoSpec — content safety", () => {
  it("rejects operational-danger instruction language", () => {
    const spec = verifiedSimulationSpec();
    spec.title = "Synthesis of controlled substances";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:operational_danger");
    expect(result.reasons.join(" ")).not.toContain("Synthesis");
  });

  it("rejects detonate / weapon / enrich language in spec-level text", () => {
    const spec = verifiedSimulationSpec();
    spec.trust.limitations = ["How to detonate a device."];
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:operational_danger");

    const spec2 = verifiedSimulationSpec();
    spec2.normalizedConcept = "Build a biological weapon";
    const result2 = validateDemoSpec(toJson(spec2));
    expect(result2.status).toBe("rejected");
    expect(result2.reasons).toContain("science_policy:operational_danger");

    const spec3 = verifiedSimulationSpec();
    spec3.learningObjective = "Enrich uranium for reactor fuel.";
    const result3 = validateDemoSpec(toJson(spec3));
    expect(result3.status).toBe("rejected");
    expect(result3.reasons).toContain("science_policy:operational_danger");
  });
});

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

describe("validateDemoSpec — safe numeric repair", () => {
  it("clamps an engine parameter value above max", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].value = 150;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:param_value");
    expect(result.spec!.simulation!.parameters[0].value).toBe(5);
  });

  it("clamps an engine parameter value below min", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].value = -3;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.spec!.simulation!.parameters[0].value).toBe(0.1);
  });

  it("clamps scene tuning numbers (speed, trail points)", () => {
    const spec = verifiedSimulationSpec();
    spec.scene3d!.animations[0].speed = 10_000;
    spec.scene3d!.objects[0].trailPoints = 9000;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:speed");
    expect(result.reasons).toContain("repaired:trail_points");
    expect(result.spec!.scene3d!.animations[0].speed).toBe(100);
    expect(result.spec!.scene3d!.objects[0].trailPoints).toBe(
      SPEC_LIMITS.maxTrailPoints
    );
  });

  it("clamps a numeric control default into the control range", () => {
    const spec = verifiedSimulationSpec();
    spec.controls[0].defaultValue = 99;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.spec!.controls[0].defaultValue).toBe(5);
  });

  it("does not repair a seed (rejected instead)", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.seed = -5;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// Repair: model-shaped nulls and non-numeric visual scalars
// ---------------------------------------------------------------------------

describe("validateDemoSpec — model-shaped repairs (null optional objects, non-numeric size)", () => {
  it("strips scene3d: null as absent (2D engine remains canonical)", () => {
    const spec = verifiedSimulationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    raw.scene3d = null;
    const result = validateDemoSpec(JSON.stringify(raw));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:null_scene3d");
    expect(result.spec!.scene3d).toBeUndefined();
    // The verified engine itself is untouched — trust boundary intact.
    expect(result.spec!.trust.level).toBe("verified_simulation");
    expect(result.spec!.simulation!.engineId).toBe("pendulum");
  });

  it("strips timeline: null as absent", () => {
    const spec = conceptualDemonstrationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    raw.timeline = null;
    const result = validateDemoSpec(JSON.stringify(raw));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:null_timeline");
    expect(result.spec!.timeline).toBeUndefined();
  });

  it("drops a non-numeric size on a scene3d object (renderer default applies)", () => {
    const spec = verifiedSimulationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    (raw.scene3d as { objects: Array<Record<string, unknown>> }).objects[1].size =
      "medium";
    const result = validateDemoSpec(JSON.stringify(raw));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:non_numeric_size");
    const objects = result.spec!.scene3d!.objects;
    expect("size" in objects[1]).toBe(false);
    // Other objects' numeric sizes survive untouched.
    expect("size" in objects[0]).toBe(false); // fixture object 0 has no size
  });

  it("keeps a numeric size intact (no repair)", () => {
    const spec = verifiedSimulationSpec();
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    expect(result.spec!.scene3d!.objects[1].size).toBe(0.25);
  });

  it("still rejects a Level 3 spec whose timeline was null (science policy)", () => {
    const spec = explanatoryAnimationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    raw.timeline = null;
    const result = validateDemoSpec(JSON.stringify(raw));
    // Stripped to absent, then the science policy demands a timeline.
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level3_timeline");
  });

  it("clamps an over-declared maxTimelineEvents budget", () => {
    const spec = conceptualDemonstrationSpec();
    spec.limits.maxTimelineEvents = 999;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:maxTimelineEvents");
    expect(result.spec!.limits.maxTimelineEvents).toBe(
      SPEC_LIMITS.maxTimelineEvents
    );
  });

  it("clamps an over-declared maxControls budget", () => {
    const spec = verifiedSimulationSpec();
    spec.limits.maxControls = 999;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:maxControls");
    expect(result.spec!.limits.maxControls).toBe(SPEC_LIMITS.maxControls);
  });

  it("raises an under-declared timeline budget to actual event usage", () => {
    const spec = explanatoryAnimationSpec();
    spec.limits.maxTimelineEvents = 1;
    const events = spec.timeline!.events.length;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:maxTimelineEvents");
    expect(result.spec!.limits.maxTimelineEvents).toBe(events);
  });

  it("raises an under-declared controls budget to actual control usage", () => {
    const spec = verifiedSimulationSpec();
    spec.limits.maxControls = 0;
    const controls = spec.controls.length;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:maxControls");
    expect(result.spec!.limits.maxControls).toBe(controls);
  });

  it("accepts a zero timeline/controls budget when nothing is used", () => {
    const spec = conceptualDemonstrationSpec();
    spec.limits.maxTimelineEvents = 0;
    spec.limits.maxControls = 0;
    spec.controls = [];
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
  });
});

// ---------------------------------------------------------------------------
// sciencePolicy unit
// ---------------------------------------------------------------------------

describe("sciencePolicy — unit", () => {
  it("passes all three valid trust levels", () => {
    expect(
      sciencePolicy(verifiedSimulationSpec()).ok
    ).toBe(true);
    expect(
      sciencePolicy(conceptualDemonstrationSpec()).ok
    ).toBe(true);
    expect(
      sciencePolicy(explanatoryAnimationSpec()).ok
    ).toBe(true);
  });

  it("rejects Level 2 with a simulation and a graded prediction", () => {
    const spec = conceptualDemonstrationSpec();
    spec.simulation = verifiedSimulationSpec().simulation;
    spec.prediction.correctIndex = 1;
    const policy = sciencePolicy(spec);
    expect(policy.ok).toBe(false);
    expect(policy.reasons).toContain("science_policy:level2_simulation");
    expect(policy.reasons).toContain("science_policy:level2_prediction");
  });

  it("rejects Level 3 with a graded prediction", () => {
    const spec = explanatoryAnimationSpec();
    spec.prediction.correctIndex = 1;
    const policy = sciencePolicy(spec);
    expect(policy.ok).toBe(false);
    expect(policy.reasons).toContain("science_policy:level3_prediction");
  });

  it("rejects Level 1 with a foreign parameter key", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].key = "frequency";
    const policy = sciencePolicy(spec);
    expect(policy.ok).toBe(false);
    expect(policy.reasons).toContain("incompatible_engine");
  });

  it("reports only safe codes, never offending text", () => {
    const spec = verifiedSimulationSpec();
    spec.title = "Synthesis of controlled substances";
    const policy = sciencePolicy(spec);
    expect(policy.ok).toBe(false);
    expect(policy.reasons).toContain("science_policy:operational_danger");
    expect(policy.reasons.join(" ")).not.toContain("substances");
  });
});

// ---------------------------------------------------------------------------
// demoSpecSchema direct + constants
// ---------------------------------------------------------------------------

describe("demoSpecSchema — direct use", () => {
  it("parses a valid spec", () => {
    const parsed = demoSpecSchema.parse(verifiedSimulationSpec());
    expect(parsed.trust.level).toBe("verified_simulation");
  });

  it("rejects unknown keys strictly", () => {
    const spec = verifiedSimulationSpec() as unknown as Record<string, unknown>;
    spec["mystery"] = true;
    expect(() => demoSpecSchema.parse(spec)).toThrow();
  });
});

describe("exported constants", () => {
  it("exposes the mobile particle cap and depth guard", () => {
    expect(MOBILE_MAX_PARTICLES).toBe(SPEC_LIMITS.maxParticlesMobile);
    expect(MOBILE_MAX_PARTICLES).toBe(500);
    expect(MAX_SPEC_DEPTH).toBe(8);
    expect(SPEC_LIMITS.maxParticlesDesktop).toBe(1500);
    expect(SPEC_LIMITS.maxObjects).toBe(80);
    expect(SPEC_LIMITS.maxTimelineEvents).toBe(30);
    expect(SPEC_LIMITS.maxControls).toBe(6);
    expect(SPEC_LIMITS.maxRelationships).toBe(100);
    expect(SPEC_LIMITS.maxLabels).toBe(25);
    expect(SPEC_LIMITS.maxPredictionOptions).toBe(4);
    expect(SPEC_LIMITS.maxObservationPrompts).toBe(6);
    expect(SPEC_LIMITS.maxRepresentations).toBe(5);
    expect(SPEC_LIMITS.maxExplanationChars).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// Scientific-field boundary: the sanitizer must REJECT (never repair) any
// malformation touching a scientifically meaningful field. Documented in
// docs/sanitizer-repair-policy.md. Repair is a closed allowlist; everything
// else rejects through the strict schema or the science policy.
// ---------------------------------------------------------------------------

describe("sanitizer scientific-field boundary", () => {
  it("rejects a trust escalation to verified without a simulation block", () => {
    const spec = conceptualDemonstrationSpec();
    spec.trust.level = "verified_simulation";
    spec.trust.label = "Verified simulation";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.spec).toBeUndefined();
    expect(result.reasons).toContain("science_policy:level1_simulation");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("rejects a trust escalation that adds an engineId without a simulation block", () => {
    const spec = conceptualDemonstrationSpec();
    spec.trust.level = "verified_simulation";
    spec.trust.label = "Verified simulation";
    spec.trust.engineId = "pendulum";
    spec.trust.engineVersion = "1.0.0";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level1_simulation");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("rejects an engine substitution to a different engine (no repair)", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.engineId = "waves";
    spec.simulation!.engineVersion = "1.0.0";
    spec.trust.engineId = "waves";
    spec.trust.engineVersion = "1.0.0";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.spec).toBeUndefined();
    // The pendulum parameter/readout keys are foreign to the waves engine.
    expect(result.reasons).toContain("incompatible_engine");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("rejects a control retargeted to a foreign parameter (never repaired)", () => {
    const spec = verifiedSimulationSpec();
    spec.controls[0].target = { kind: "parameter", ref: "frequency" };
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_control_target");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("rejects a fabricated correctIndex on a model-generated spec (never stripped)", () => {
    const spec = verifiedSimulationSpec();
    spec.provenance.source = "model_generated_spec";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.spec).toBeUndefined();
    expect(result.reasons).toContain(
      "science_policy:model_graded_prediction"
    );
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("rejects a correctIndex added to a conceptual spec (curated-only truth)", () => {
    const spec = conceptualDemonstrationSpec();
    spec.prediction.correctIndex = 0;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level2_prediction");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("never repairs a relationship operator mutated to another valid operator", () => {
    const spec = verifiedSimulationSpec();
    spec.scene3d!.relationships[0].type = "inhibits"; // was "causes"
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    expect(result.spec!.scene3d!.relationships[0].type).toBe("inhibits");
  });

  it("rejects an unknown relationship operator", () => {
    const spec = verifiedSimulationSpec();
    (spec.scene3d!.relationships[0] as { type: string }).type =
      "causally_drives";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("invalid_enum"))).toBe(true);
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("never repairs a parameter unit mutated to a scientifically different unit", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].unit = "kg"; // pendulum length in kilograms
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    expect(result.spec!.simulation!.parameters[0].unit).toBe("kg");
  });

  it("rejects a unit string beyond the schema bound (never repaired)", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].unit = "kilogram-force-seconds";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("text_exceeded:unit");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("rejects formula content carrying an executable marker in a scientific text field", () => {
    const spec = verifiedSimulationSpec();
    spec.normalizedConcept = "a = F/m, fallback eval(0)";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unsafe_value:code");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("never repairs plain formula text in a scientific field (verbatim pass-through)", () => {
    const spec = verifiedSimulationSpec();
    spec.normalizedConcept = "Newton's second law: F = m × a";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    expect(result.spec!.normalizedConcept).toBe(
      "Newton's second law: F = m × a"
    );
  });

  it("rejects an explanatory animation claiming verified status", () => {
    const spec = explanatoryAnimationSpec();
    spec.trust.level = "verified_simulation";
    spec.trust.label = "Verified simulation";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level1_simulation");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("still strips a null scene3d (allowed representational repair)", () => {
    const spec = verifiedSimulationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    raw.scene3d = null;
    const result = validateDemoSpec(JSON.stringify(raw));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:null_scene3d");
    expect(result.spec!.scene3d).toBeUndefined();
    // The verified engine itself is untouched — trust boundary intact.
    expect(result.spec!.simulation!.engineId).toBe("pendulum");
  });

  it("still clamps an over-declared maxControls budget (allowed repair)", () => {
    const spec = verifiedSimulationSpec();
    spec.limits.maxControls = 999;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:maxControls");
    expect(result.spec!.limits.maxControls).toBe(SPEC_LIMITS.maxControls);
  });

  it("still drops an empty unit string (display-only repair)", () => {
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].unit = "";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:empty_unit");
    expect(result.spec!.simulation!.parameters[0].unit).toBeUndefined();
  });

  it("rejects an unknown malformation: non-numeric engine parameter value", () => {
    const spec = verifiedSimulationSpec();
    (spec.simulation!.parameters[0] as { value: unknown }).value = "fast";
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("invalid_type"))).toBe(true);
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 2C — focusParameterKeys boundary (engine-owned controls selection)
//
// The Phase 2B architecture change (evaluation-director) lets the hosted model
// emit ONLY `focusParameterKeys: string[]` for verified engines; deterministic
// code materializes the full controls from the EngineControlCatalog. The
// validation layer must accept and enforce the bounded field:
//   - inside the simulation object only (strict schema),
//   - 1..4 engine-owned keys (catalog membership, reason invalid_engine_key),
//   - verified (Level 1) specs only,
//   - never repaired — a foreign key REJECTS (no repair class exists, and none
//     may be added without a documented repair-class decision).
// ---------------------------------------------------------------------------

/** Serializes the fixture, then injects focusParameterKeys into its
 * simulation block — the shape of the model's raw output under Phase 2B. */
function withFocusKeys(spec: DemoSpecV1, keys: unknown): string {
  const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
  (raw.simulation as Record<string, unknown>).focusParameterKeys = keys;
  return JSON.stringify(raw);
}

/** Reads focusParameterKeys back from a validated spec (raw-JSON transport). */
function readFocusKeys(spec: DemoSpecV1): unknown {
  return (spec.simulation as unknown as { focusParameterKeys?: unknown })
    .focusParameterKeys;
}

describe("focusParameterKeys boundary", () => {
  it("accepts a verified spec whose focusParameterKeys are engine-owned keys", () => {
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), ["length"])
    );
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
    expect(readFocusKeys(result.spec!)).toEqual(["length"]);
  });

  it("accepts up to 4 engine-owned keys (pendulum catalog has exactly 4)", () => {
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), [
        "length",
        "gravity",
        "amplitude",
        "damping",
      ])
    );
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
  });

  it("accepts engine-owned keys for a second engine (nuclear chain reaction)", () => {
    const result = validateDemoSpec(
      withFocusKeys(nuclearChainReactionSpec(), ["absorber", "multiplication"])
    );
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
  });

  it("rejects a focusParameterKeys entry that is not an engine-owned key", () => {
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), ["temperature"])
    );
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_engine_key");
  });

  it("rejects a focusParameterKeys entry owned by a different engine", () => {
    // "frequency" is a waves-engine key, not a pendulum key.
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), ["frequency"])
    );
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_engine_key");
  });

  it("rejects a focusParameterKeys entry that is not in the engine catalog at all", () => {
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), ["length", "fakeParam"])
    );
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_engine_key");
  });

  it("rejects more than 4 focusParameterKeys (bounded)", () => {
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), [
        "length",
        "gravity",
        "amplitude",
        "damping",
        "speed",
      ])
    );
    expect(result.status).toBe("rejected");
    expect(
      result.reasons.some((r) => r.startsWith("count_exceeded"))
    ).toBe(true);
  });

  it("rejects a non-array focusParameterKeys (bounded)", () => {
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), "length")
    );
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("invalid_type"))).toBe(true);
  });

  it("rejects an empty focusParameterKeys array (min 1)", () => {
    const result = validateDemoSpec(withFocusKeys(verifiedSimulationSpec(), []));
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("count_required"))).toBe(
      true
    );
  });

  it("rejects a non-string focusParameterKeys entry", () => {
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), ["length", 42])
    );
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("invalid_type"))).toBe(true);
  });

  it("rejects an oversized focusParameterKeys entry (element bound, never repaired)", () => {
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), ["l".repeat(200)])
    );
    expect(result.status).toBe("rejected");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
  });

  it("rejects focusParameterKeys on a Level 2 spec (verified-only field)", () => {
    const spec = conceptualDemonstrationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    raw.simulation = JSON.parse(toJson(verifiedSimulationSpec()))
      .simulation as Record<string, unknown>;
    (raw.simulation as Record<string, unknown>).focusParameterKeys = ["length"];
    const result = validateDemoSpec(JSON.stringify(raw));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level2_simulation");
  });

  it("rejects focusParameterKeys on a Level 3 spec (verified-only field)", () => {
    const spec = explanatoryAnimationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    raw.simulation = JSON.parse(toJson(verifiedSimulationSpec()))
      .simulation as Record<string, unknown>;
    (raw.simulation as Record<string, unknown>).focusParameterKeys = ["length"];
    const result = validateDemoSpec(JSON.stringify(raw));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("science_policy:level3_simulation");
  });

  it("rejects focusParameterKeys with no simulation block", () => {
    // The field only exists inside the simulation object: anywhere else in the
    // document is an unknown key (strict schema) — never silently dropped.
    const spec = conceptualDemonstrationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    raw.focusParameterKeys = ["length"];
    const result = validateDemoSpec(JSON.stringify(raw));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("unknown_key:focusparameterkeys");
  });

  it("never repairs a foreign focusParameterKeys entry (no repair path)", () => {
    // A foreign key must REJECT — the repair allowlist has no focusParameterKeys
    // class and must never gain one (unknown repair -> reject remains).
    const result = validateDemoSpec(
      withFocusKeys(verifiedSimulationSpec(), ["temperature"])
    );
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("invalid_engine_key");
    expect(result.reasons.some((r) => r.startsWith("repaired:"))).toBe(false);
    expect(result.spec).toBeUndefined();
  });

  it("preserves engine-owned focusParameterKeys verbatim through a numeric repair", () => {
    // The field itself is never touched by the repair walk: a repairable
    // numeric issue elsewhere repairs, focusParameterKeys passes through.
    const spec = verifiedSimulationSpec();
    spec.simulation!.parameters[0].value = 150; // clamps to max (5)
    const result = validateDemoSpec(withFocusKeys(spec, ["length"]));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain("repaired:param_value");
    expect(result.reasons.some((r) => r.includes("focus"))).toBe(false);
    expect(readFocusKeys(result.spec!)).toEqual(["length"]);
    expect(result.spec!.simulation!.parameters[0].value).toBe(5);
  });

  it("backward compatible: explicit-controls specs without focusParameterKeys still validate", () => {
    // Phase 2C must not disturb the curated showcases or any existing spec:
    // the field is optional and only ever augments.
    const result = validateDemoSpec(toJson(verifiedSimulationSpec()));
    expect(result.status).toBe("valid");
    expect(result.reasons).toEqual([]);
  });

  it("demoSpecSchema (direct use) enforces the same boundary", () => {
    const spec = verifiedSimulationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    (raw.simulation as Record<string, unknown>).focusParameterKeys = [
      "length",
    ];
    const parsed = demoSpecSchema.parse(raw);
    expect(
      (parsed.simulation as unknown as { focusParameterKeys?: string[] })
        .focusParameterKeys
    ).toEqual(["length"]);

    const bad = JSON.parse(toJson(spec)) as Record<string, unknown>;
    (bad.simulation as Record<string, unknown>).focusParameterKeys = [
      "temperature",
    ];
    expect(() => demoSpecSchema.parse(bad)).toThrow();
  });

  it("first-pass gate admits the field so the model output reaches the validator", () => {
    // Phase 2B pipeline: raw model output -> first-pass gate -> sanitizer.
    // The gate must not reject the field as an unknown key (the full validator
    // is the authority on membership and bounds it already enforces).
    const spec = verifiedSimulationSpec();
    const raw = JSON.parse(toJson(spec)) as Record<string, unknown>;
    (raw.simulation as Record<string, unknown>).focusParameterKeys = [
      "length",
    ];
    // The gate requires the model to declare itself (provenance policy).
    (raw.provenance as Record<string, unknown>).source = "model_generated_spec";
    const gate = firstPassModelCheck(raw);
    expect(gate.ok).toBe(true);
    if (!gate.ok) throw new Error("first-pass gate rejected the model-shaped spec");
    // The full validator still enforces membership on what the gate admitted
    // (the pipeline passes gate.value — model correctIndex already stripped).
    const result = validateDemoSpec(gate.value);
    expect(result.status).toBe("valid");
    expect(readFocusKeys(result.spec!)).toEqual(["length"]);
  });
});

// ---------------------------------------------------------------------------
// Lesson-action contract — legacy free-text control references (alias layer)
//
// An observation prompt WITHOUT controlId that instructs the learner to
// manipulate a control must still resolve to an available control. Free-text
// phrasings that alias a catalog control (e.g. "the gravitational constant"
// for the gravity catalog entries) are resolved through the curated alias
// layer: dropped when the aliased catalog control is unavailable, kept when
// it is available. Purely observational prompts are never touched.
// ---------------------------------------------------------------------------

/** Orbit spec exposing ONLY the Launch speed control (no gravity control). */
function orbitSpecWithLaunchSpeedOnly(
  prompts: DemoSpecV1["observationPrompts"]
): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "demo-orbit-alias",
    generationId: "gen-orbit-alias",
    userQuery: "why do planets stay in orbit?",
    normalizedConcept: "Gravity and orbital motion",
    title: "Orbits",
    learningObjective: "See how launch speed shapes the orbit.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation of gravitational orbits",
      limitations: ["Simplified two-body system."],
      engineId: "orbits",
      engineVersion: "1.0",
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "timeline",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    simulation: {
      engineId: "orbits",
      engineVersion: "1.0",
      seed: 42,
      parameters: [
        {
          key: "g",
          label: "Gravity strength",
          min: 0.5,
          max: 200,
          step: 0.5,
          value: 10,
        },
        {
          key: "speed",
          label: "Launch speed",
          min: 0.05,
          max: 3,
          step: 0.05,
          value: 1,
        },
      ],
      readouts: [
        { key: "period", label: "Orbital period", format: "fixed2" },
        { key: "speed", label: "Current speed", format: "fixed2" },
      ],
    },
    scene3d: {
      objects: [
        {
          id: "star",
          kind: "sphere",
          position: { x: 0, y: 0, z: 0 },
          size: 0.5,
          color: "#ffaa00",
        },
        {
          id: "planet",
          kind: "sphere",
          position: { x: 1, y: 0, z: 0 },
          size: 0.2,
          color: "#4488ff",
        },
      ],
      relationships: [
        { id: "attract", type: "attracts", from: "star", to: "planet" },
      ],
      animations: [
        { id: "orbit", target: "planet", operator: "orbit", speed: 1, axis: "y" },
      ],
    },
    controls: [
      {
        id: "param_speed",
        type: "slider",
        label: "Launch speed",
        target: { kind: "parameter", ref: "speed" },
        min: 0.05,
        max: 3,
        step: 0.05,
        defaultValue: 1,
      },
    ],
    prediction: {
      prompt: "What happens to the orbit if the launch speed increases?",
      options: ["It widens", "It shrinks", "It stays the same"],
      correctIndex: 0,
    },
    observationPrompts: prompts,
    representations: [{ id: "rep-stage", kind: "stage_3d", label: "Stage" }],
    adaptationContext: { allowed: false, oneVariableMode: false },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-07T00:00:00.000Z",
      model: "test-model",
    },
    limits: baseLimits(),
  };
}

describe("sanitizeDemoSpec — lesson-action contract (legacy free-text control references)", () => {
  it("drops a free-text observation prompt that implies a missing control (catalog alias)", () => {
    // The canonical defect phrase: no controlId, and "the gravitational
    // constant" only names gravity catalog controls that are not exposed.
    const spec = orbitSpecWithLaunchSpeedOnly([
      {
        prompt:
          "What happens to the orbit when you increase the gravitational constant?",
      },
    ]);
    const result = sanitizeDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain(
      "repaired:observation_prompt_unavailable_control"
    );
    expect(result.spec!.observationPrompts).toEqual([]);
  });

  it("drops sibling gravity aliases when no gravity control is available", () => {
    const spec = orbitSpecWithLaunchSpeedOnly([
      { prompt: "Try increasing the gravitational pull and watch the orbit." },
      { prompt: "Adjust the gravitational acceleration of the star." },
    ]);
    const result = sanitizeDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.spec!.observationPrompts).toEqual([]);
  });

  it("keeps a purely observational free-text prompt", () => {
    const spec = orbitSpecWithLaunchSpeedOnly([
      {
        prompt:
          "Watch the arrows: how does the direction of the gravity force compare to the direction of motion?",
      },
    ]);
    const result = sanitizeDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    expect(result.spec!.observationPrompts).toHaveLength(1);
  });

  it("keeps a free-text prompt whose control IS available", () => {
    const spec = orbitSpecWithLaunchSpeedOnly([
      { prompt: "Watch how the orbit changes when you adjust the Launch speed." },
    ]);
    const result = sanitizeDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    expect(result.spec!.observationPrompts).toHaveLength(1);
  });

  it("keeps a catalog-alias prompt when the aliased control IS available", () => {
    const spec = orbitSpecWithLaunchSpeedOnly([
      {
        prompt:
          "What happens to the orbit when you increase the gravitational constant?",
      },
    ]);
    spec.controls.push({
      id: "param_g",
      type: "slider",
      label: "Gravity strength",
      target: { kind: "parameter", ref: "g" },
      min: 0.5,
      max: 200,
      step: 0.5,
      defaultValue: 10,
    });
    const result = sanitizeDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    expect(result.spec!.observationPrompts).toHaveLength(1);
  });

  // Red-team P1: free-text filter evasion via verb variants ("boost", "crank
  // up", "reduce") and trailing adverbial words ("gravity down", "pull to
  // zero"). Each probe names a known gravity control that the orbit spec does
  // NOT expose, so each must be dropped; the same probes must be kept the
  // moment a gravity control IS available.
  const EVASION_PROBES = [
    "Turn the gravity down.",
    "Boost the gravitational constant.",
    "Reduce the gravitational pull to zero.",
    "Crank up the gravity.",
  ];
  const WATCH_PROBES = [
    "Watch the arrows: how does the direction of the gravity force compare to the direction of motion?",
    "Watch how the orbit changes when you adjust the Launch speed.",
  ];

  it("drops verb-variant and trailing-word evasion phrasings when no gravity control is available", () => {
    const spec = orbitSpecWithLaunchSpeedOnly([
      ...EVASION_PROBES.map((prompt) => ({ prompt })),
      ...WATCH_PROBES.map((prompt) => ({ prompt })),
    ]);
    const result = sanitizeDemoSpec(toJson(spec));
    expect(result.status).toBe("repaired");
    expect(result.reasons).toContain(
      "repaired:observation_prompt_unavailable_control"
    );
    // All four evasions are dropped; purely observational/watch prompts stay.
    expect(result.spec!.observationPrompts).toEqual(
      WATCH_PROBES.map((prompt) => ({ prompt }))
    );
  });

  it("keeps the same evasion phrasings when a Gravity strength control IS available", () => {
    const spec = orbitSpecWithLaunchSpeedOnly([
      ...EVASION_PROBES.map((prompt) => ({ prompt })),
      ...WATCH_PROBES.map((prompt) => ({ prompt })),
    ]);
    spec.controls.push({
      id: "param_g",
      type: "slider",
      label: "Gravity strength",
      target: { kind: "parameter", ref: "g" },
      min: 0.5,
      max: 200,
      step: 0.5,
      defaultValue: 10,
    });
    const result = sanitizeDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    // Nothing dropped: every probe resolves to an available control.
    expect(result.spec!.observationPrompts).toHaveLength(
      EVASION_PROBES.length + WATCH_PROBES.length
    );
  });

  it("keeps the evasion phrasings when a control label itself contains the phrase", () => {
    // A control literally labeled "Gravitational pull" must keep
    // "Reduce the gravitational pull to zero." — the drop happens ONLY when
    // the underlying control is unavailable.
    const spec = orbitSpecWithLaunchSpeedOnly([
      { prompt: "Reduce the gravitational pull to zero." },
    ]);
    spec.controls.push({
      id: "param_g",
      type: "slider",
      label: "Gravitational pull",
      target: { kind: "parameter", ref: "g" },
      min: 0.5,
      max: 200,
      step: 0.5,
      defaultValue: 10,
    });
    const result = sanitizeDemoSpec(toJson(spec));
    expect(result.status).toBe("valid");
    expect(result.spec!.observationPrompts).toHaveLength(1);
  });
});
