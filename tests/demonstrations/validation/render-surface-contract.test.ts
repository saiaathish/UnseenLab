import { describe, expect, it } from "vitest";
import { createDefaultPreferences } from "@/domain/learner";
import { buildConceptualSpec } from "@/demonstrations/generation/offline/template-builder";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { sanitizeDemoSpec, sciencePolicy } from "@/demonstrations/validation";

function makeConceptual(): DemoSpecV1 {
  return buildConceptualSpec(
    "cause_effect_network",
    "Generic Concept",
    "Explain a generic concept",
    createDefaultPreferences(),
  );
}

describe("render surface validation", () => {
  it("rejects stage_2d without a simulation payload for every renderer kind", () => {
    const kinds: DemoSpecV1["renderer"]["kind"][] = ["lumina_2d", "primitive_3d", "hybrid"];
    for (const kind of kinds) {
      const base = makeConceptual();
      const spec: DemoSpecV1 = {
        ...base,
        renderer: { ...base.renderer, kind },
        representations: [
          { id: "stage", kind: "stage_2d", label: "2D Stage" },
          { id: "diagram", kind: "diagram", label: "Diagram" },
        ],
      };
      const policy = sciencePolicy(spec);
      expect(policy.ok).toBe(false);
      expect(policy.reasons).toContain("science_policy:stage2d_requires_simulation");
      expect(sanitizeDemoSpec(spec).status).toBe("rejected");
    }
  });

  it("rejects any executable stage when lumina_2d has no simulation", () => {
    const base = makeConceptual();
    const spec: DemoSpecV1 = {
      ...base,
      renderer: { ...base.renderer, kind: "lumina_2d" },
      representations: [{ id: "stage", kind: "stage_3d", label: "Interactive stage" }],
    };
    const policy = sciencePolicy(spec);
    expect(policy.ok).toBe(false);
    expect(policy.reasons).toContain("science_policy:lumina_stage_requires_simulation");
    expect(sanitizeDemoSpec(spec).status).toBe("rejected");
  });

  it("allows lumina metadata when only non-stage qualitative views are exposed", () => {
    const base = makeConceptual();
    const spec: DemoSpecV1 = {
      ...base,
      renderer: { ...base.renderer, kind: "lumina_2d" },
      representations: [
        { id: "diagram", kind: "diagram", label: "Diagram" },
        { id: "steps", kind: "text_sequence", label: "Guided steps" },
      ],
    };
    const policy = sciencePolicy(spec);
    expect(policy.ok).toBe(true);
    expect(["valid", "repaired"]).toContain(sanitizeDemoSpec(spec).status);
  });
});
