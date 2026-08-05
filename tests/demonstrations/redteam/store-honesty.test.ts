/**
 * RED-TEAM — demo-store honesty: what gets graded, and what never does.
 *
 * The contract (demo-store.ts:186-197): predictionTruth returns graded ONLY
 * for verified_simulation specs that carry a correctIndex. Level 2/3 specs are
 * never graded, and the schema+policy layers forbid correctIndex outside
 * Level 1. The model path is asserted against the same function so the audit
 * can document exactly what a learner sees.
 */

import { describe, expect, it } from "vitest";
import { predictionTruth } from "@/demonstrations/state/demo-store";
import { validateDemoSpec } from "@/demonstrations/validation";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { createDefaultPreferences } from "@/domain/learner";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

const prefs = createDefaultPreferences();

function level1Spec(): DemoSpecV1 {
  const r = generateOfflineDemo("Show why planets stay in orbit.", prefs);
  if (r.status !== "spec" || !r.spec) throw new Error("no spec");
  return JSON.parse(JSON.stringify(r.spec)) as DemoSpecV1;
}

describe("RED-TEAM: predictionTruth honesty", () => {
  it("grades a verified_simulation spec that carries correctIndex", () => {
    const spec = level1Spec();
    const truth = predictionTruth(spec);
    expect(truth.graded).toBe(true);
    expect(truth.correctIndex).toBe(spec.prediction.correctIndex);
  });

  it("does NOT grade a verified_simulation spec without correctIndex", () => {
    const spec = level1Spec();
    delete spec.prediction.correctIndex;
    expect(predictionTruth(spec)).toEqual({ graded: false });
  });

  it("never grades a conceptual demonstration (Level 2)", () => {
    const r = generateOfflineDemo("Explain cause and effect", prefs);
    if (r.status !== "spec" || !r.spec) throw new Error("no spec");
    expect(predictionTruth(r.spec)).toEqual({ graded: false });
  });

  it("never grades an explanatory animation (Level 3)", () => {
    const r = generateOfflineDemo("Show me mitosis", prefs);
    if (r.status !== "spec" || !r.spec) throw new Error("no spec");
    expect(predictionTruth(r.spec)).toEqual({ graded: false });
  });

  it("a correctIndex smuggled into a Level 2 spec cannot even validate", () => {
    const r = generateOfflineDemo("Explain cause and effect", prefs);
    if (r.status !== "spec" || !r.spec) throw new Error("no spec");
    const spec = JSON.parse(JSON.stringify(r.spec)) as DemoSpecV1;
    spec.prediction.correctIndex = 0;
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("science_policy:level2_prediction");
  });

  it("FIXED (P1): a model-authored Level 1 spec with correctIndex is never graded and cannot validate", () => {
    // predictionTruth now keys on provenance.source too: only curated engine
    // code may grade. A model output carrying correctIndex is rejected by the
    // science policy (model_graded_prediction) before it can ever reach the
    // UI — and even if it did, the store refuses to grade it.
    const spec = level1Spec();
    spec.provenance = { ...spec.provenance, source: "model_generated_spec" };
    const truth = predictionTruth(spec);
    expect(truth.graded).toBe(false);
    // The validator rejects the model-graded spec outright.
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("science_policy:model_graded_prediction");
  });
});

describe("RED-TEAM: curated engines ship correctIndex; templates/timelines never do", () => {
  it("every verified engine spec from the offline generator is graded", () => {
    const queries = [
      "Show why planets stay in orbit.",
      "Show me a pendulum",
      "Show me projectile motion",
      "Show me gas particles moving.",
      "Show me electric charges",
      "Show me wave interference",
      "Show me an RC circuit",
      "Show me reaction diffusion patterns",
      "Show me Conway's game of life",
      "Show me a nuclear chain reaction",
    ];
    for (const query of queries) {
      const r = generateOfflineDemo(query, prefs);
      if (r.status !== "spec" || !r.spec) throw new Error(`no spec for ${query}`);
      const truth = predictionTruth(r.spec);
      expect(truth.graded).toBe(true);
      expect(truth.correctIndex).toBeGreaterThanOrEqual(0);
      expect(r.spec.prediction.correctIndex).toBeLessThan(r.spec.prediction.options.length);
    }
  });

  it("every conceptual template and timeline spec is ungraded", () => {
    const queries = [
      "Explain cause and effect",
      "Explain the carbon cycle",
      "Explain the food chain",
      "Show me predator prey population dynamics",
      "Show me the layers of the earth",
      "Explain a supply chain network",
      "Show me mitosis",
      "Explain DNA transcription",
      "Show me the water cycle",
      "Explain antibodies",
    ];
    for (const query of queries) {
      const r = generateOfflineDemo(query, prefs);
      if (r.status !== "spec" || !r.spec) throw new Error(`no spec for ${query}`);
      expect(predictionTruth(r.spec)).toEqual({ graded: false });
      expect(r.spec.prediction.correctIndex).toBeUndefined();
    }
  });
});
