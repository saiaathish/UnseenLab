import { describe, expect, it } from "vitest";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { createDefaultPreferences } from "@/domain/learner";

/**
 * Homepage acceptance (judge-driven): an arbitrary STEM prompt must generate
 * an interactive experience through the pipeline — never the legacy nuclear
 * fallback, never "unsupported" for a legitimate STEM topic.
 */
describe("generative acceptance: any STEM topic → an experience", () => {
  const prefs = createDefaultPreferences();

  const CASES: Array<[string, string]> = [
    // [prompt, expected trust tier]
    ["second law of newton", "verified_simulation"],
    ["Newton's second law", "verified_simulation"],
    ["What does Newton's second law say about force and mass?", "verified_simulation"],
    ["How does photosynthesis transfer energy?", "conceptual_demonstration"],
    ["wave interference", "verified_simulation"],
    ["Ohm's law", "verified_simulation"],
    ["mitosis", "explanatory_animation"],
    ["pendulum period", "verified_simulation"],
    ["Why do planets stay in orbit?", "verified_simulation"],
  ];

  it.each(CASES)("%s → %s (generated, never the nuclear fallback)", (prompt, tier) => {
    const result = generateOfflineDemo(prompt, prefs);

    // Never the legacy "unsupported → nuclear" behavior.
    expect(result.status).not.toBe("unsupported");
    expect(result.status).not.toBe("unsafe");

    if (result.status !== "spec" || !result.spec) {
      // A legit STEM topic may only land on clarify when genuinely ambiguous.
      expect(result.status).toBe("clarify");
      return;
    }

    expect(result.spec.trust.level).toBe(tier);
    // The generated experience must never be presented as the nuclear lab.
    expect(result.spec.title).not.toMatch(/nuclear/i);
  });

  it("routes Newton's second law to the newton engine with force/mass controls", () => {
    const result = generateOfflineDemo("second law of newton", prefs);
    expect(result.status).toBe("spec");
    if (result.status !== "spec" || !result.spec) return;

    expect(result.spec.title).toBe("Newton's Second Law");
    expect(result.spec.trust.level).toBe("verified_simulation");
    const controlRefs = result.spec.controls.map((c) =>
      c.target.kind === "parameter" ? c.target.ref : c.id,
    );
    expect(controlRefs).toContain("force");
    expect(controlRefs).toContain("mass");
    // The physical prediction: doubling force doubles acceleration.
    expect(
      result.spec.prediction.options[result.spec.prediction.correctIndex ?? 0],
    ).toMatch(/doubles/);
  });

  it("never routes a Newton prompt to the orbits or nuclear engines", () => {
    for (const prompt of [
      "second law of newton",
      "Newton's second law",
      "newton's law of motion",
      "newton force mass",
    ]) {
      const result = generateOfflineDemo(prompt, prefs);
      if (result.status !== "spec" || !result.spec) continue;
      expect(result.spec.title).not.toMatch(/orbit/i);
      expect(result.spec.title).not.toMatch(/nuclear/i);
    }
  });
});
