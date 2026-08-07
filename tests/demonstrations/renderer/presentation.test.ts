import { describe, expect, it } from "vitest";

import {
  presentationSpecForStage,
  stageGuideForSpec,
} from "@/demonstrations/renderers/primitive-3d/presentation";
import {
  SPEC_LIMITS,
  type DemoSpecV1,
} from "@/demonstrations/spec/demo-spec";

function conceptualSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "social-demo",
    generationId: "gen-social",
    userQuery: "social interaction dynamics",
    normalizedConcept: "social interaction dynamics",
    title: "Social Interaction Dynamics",
    learningObjective: "Explore qualitative social interactions.",
    trust: {
      level: "conceptual_demonstration",
      label: "Conceptual demonstration",
      limitations: ["Qualitative only."],
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 4 / 3,
      background: "dark",
    },
    scene3d: {
      objects: [
        {
          id: "person_a",
          kind: "sphere",
          position: { x: -2, y: 0, z: 0 },
          color: "#42b7aa",
          size: 0.7,
        },
        {
          id: "group_center",
          kind: "process_node",
          label: "Group",
          position: { x: 0, y: 0, z: 0 },
          color: "#d7ad38",
        },
        {
          id: "person_b",
          kind: "sphere",
          label: "Person B",
          position: { x: 2, y: 0, z: 0 },
          color: "#d45b5b",
        },
      ],
      relationships: [
        {
          id: "r1",
          type: "attracts",
          from: "person_a",
          to: "group_center",
        },
        {
          id: "r2",
          type: "inhibits",
          from: "person_b",
          to: "group_center",
          label: "reduces cohesion",
        },
      ],
      animations: [],
    },
    controls: [],
    prediction: {
      prompt: "What pattern will emerge?",
      options: ["Cluster", "Spread"],
    },
    observationPrompts: [],
    representations: [
      { id: "rep_model", kind: "stage_3d", label: "Interactive model" },
    ],
    adaptationContext: { allowed: true, oneVariableMode: true },
    provenance: {
      source: "model_generated_spec",
      templateIds: [],
      generatedAt: "2026-08-07T00:00:00Z",
    },
    limits: {
      maxObjects: SPEC_LIMITS.maxObjects,
      maxParticles: SPEC_LIMITS.maxParticlesMobile,
      maxTimelineEvents: SPEC_LIMITS.maxTimelineEvents,
      maxControls: SPEC_LIMITS.maxControls,
    },
  };
}

describe("conceptual stage presentation", () => {
  it("makes qualitative relationships visible only in the renderer copy", () => {
    const source = conceptualSpec();
    const presented = presentationSpecForStage(source);

    expect(presented).not.toBe(source);
    expect(presented.scene3d?.relationships.map((r) => r.type)).toEqual([
      "flows_to",
      "flows_to",
    ]);
    expect(source.scene3d?.relationships.map((r) => r.type)).toEqual([
      "attracts",
      "inhibits",
    ]);
    expect(presented.trust).toEqual(source.trust);
    expect(presented.renderer).toEqual(source.renderer);
  });

  it("adds readable labels and a minimum visual size without mutating source", () => {
    const source = conceptualSpec();
    const presented = presentationSpecForStage(source);
    const personA = presented.scene3d?.objects.find((o) => o.id === "person_a");

    expect(personA?.label).toBe("Person A");
    expect(personA?.size).toBe(1.2);
    expect(source.scene3d?.objects[0].label).toBeUndefined();
    expect(source.scene3d?.objects[0].size).toBe(0.7);
  });

  it("keeps verified simulations byte-for-byte by identity", () => {
    const source = conceptualSpec();
    const verified: DemoSpecV1 = {
      ...source,
      trust: {
        level: "verified_simulation",
        label: "Verified simulation",
        limitations: [],
      },
      simulation: {
        engineId: "orbits",
        engineVersion: "1.0.0",
        seed: 1,
        parameters: [],
        readouts: [],
      },
    };

    expect(presentationSpecForStage(verified)).toBe(verified);
  });

  it("builds a human-readable guide from original relationship semantics", () => {
    const guide = stageGuideForSpec(conceptualSpec());

    expect(guide.entities).toEqual([
      { id: "person_a", label: "Person A", color: "#42b7aa" },
      { id: "group_center", label: "Group", color: "#d7ad38" },
      { id: "person_b", label: "Person B", color: "#d45b5b" },
    ]);
    expect(guide.relationships).toEqual([
      {
        id: "r1",
        from: "Person A",
        to: "Group",
        label: "attracts",
      },
      {
        id: "r2",
        from: "Person B",
        to: "Group",
        label: "reduces cohesion",
      },
    ]);
  });
});
