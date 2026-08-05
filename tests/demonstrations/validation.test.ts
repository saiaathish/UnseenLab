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

  it("rejects declared limits that exceed the hard caps", () => {
    const spec = verifiedSimulationSpec();
    spec.limits.maxObjects = 500;
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("range_exceeded:maxObjects");
  });

  it("rejects counts above the declared limits", () => {
    const spec = verifiedSimulationSpec();
    spec.limits.maxObjects = 1; // only 1 object allowed, we ship 2
    const result = validateDemoSpec(toJson(spec));
    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("count_exceeded:objects");
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
