import { afterEach, describe, expect, it } from "vitest";
import { createDefaultPreferences } from "@/domain/learner";
import {
  generateGenericConceptDemo,
  selectGenericTemplate,
} from "@/demonstrations/generation/generic-fallback";

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
});
