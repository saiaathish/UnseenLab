import { afterEach, describe, expect, it } from "vitest";
import { createDefaultPreferences } from "@/domain/learner";
import {
  generateGenericConceptDemo,
  normalizeGenericConceptualSpec,
  selectGenericTemplate,
} from "@/demonstrations/generation/generic-fallback";
import { buildConceptualSpec } from "@/demonstrations/generation/offline/template-builder";

afterEach(() => {
  delete process.env.LLM_API_KEY;
});

describe("generic concept fallback", () => {
  it("turns an arbitrary safe topic into an honest conceptual demo offline", async () => {
    delete process.env.LLM_API_KEY;

    const result = await generateGenericConceptDemo(
      "Explain quantum chromodynamics",
      createDefaultPreferences(),
    );

    expect(result.source).toBe("offline");
    expect(result.reason).toBe("generic_no_api_key");
    expect(result.spec.trust.level).toBe("conceptual_demonstration");
    expect(result.spec.simulation).toBeUndefined();
    expect(result.spec.title).toContain("Quantum Chromodynamics");
    expect(result.spec.provenance.source).toBe("template_composition");
  });

  it("chooses the closest qualitative interaction grammar deterministically", () => {
    expect(selectGenericTemplate("explain the carbon cycle")).toBe(
      "cyclic_process",
    );
    expect(selectGenericTemplate("compare two crystal structures")).toBe(
      "before_after_comparison",
    );
    expect(selectGenericTemplate("how heat transfers through a material")).toBe(
      "energy_transfer",
    );
    expect(selectGenericTemplate("why quantum tunneling occurs")).toBe(
      "cause_effect_network",
    );
  });

  it("normalizes a conceptual scene away from the nonexistent Lumina simulation path", () => {
    const base = buildConceptualSpec(
      "cause_effect_network",
      "Social Interaction Dynamics",
      "how do social interactions change group behavior",
      createDefaultPreferences(),
    );
    const impossible = {
      ...base,
      renderer: {
        ...base.renderer,
        kind: "lumina_2d" as const,
      },
      representations: [
        { id: "rep_stage", kind: "stage_2d" as const, label: "2D Stage" },
        { id: "rep_timeline", kind: "timeline" as const, label: "Timeline" },
      ],
    };

    const normalized = normalizeGenericConceptualSpec(impossible);

    expect(normalized).not.toBeNull();
    expect(normalized?.trust.level).toBe("conceptual_demonstration");
    expect(normalized?.simulation).toBeUndefined();
    expect(normalized?.renderer.kind).toBe("primitive_3d");
    expect(normalized?.renderer.fallbackKind).toBe("accessible_diagram");
    expect(normalized?.representations).toEqual([
      {
        id: "rep_interactive_model",
        kind: "stage_3d",
        label: "Interactive model",
      },
      { id: "rep_diagram", kind: "diagram", label: "Diagram" },
      {
        id: "rep_guided_steps",
        kind: "text_sequence",
        label: "Guided steps",
      },
    ]);
  });

  it("rejects hollow conceptual model output with no scene so deterministic fallback can take over", () => {
    const base = buildConceptualSpec(
      "cause_effect_network",
      "Social Interaction Dynamics",
      "how do social interactions change group behavior",
      createDefaultPreferences(),
    );

    const hollow = { ...base, scene3d: undefined };
    expect(normalizeGenericConceptualSpec(hollow)).toBeNull();
  });
});
