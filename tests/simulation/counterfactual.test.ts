import { describe, expect, it } from "vitest";
import { createDefaultParameters, type TrialRecord } from "@/domain/experiments";
import { diffParameters } from "@/domain/evidence";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import {
  COUNTERFACTUAL_VARIABLES,
  runCounterfactual,
} from "@/simulation/counterfactual";

function makeTrial(): TrialRecord {
  const params = {
    ...createDefaultParameters(),
    seed: 42,
    absorberPosition: 0.9,
  };
  return runSimulation(params).trial;
}

describe("counterfactual microscope", () => {
  it("changes exactly one variable for every allowed variable", () => {
    for (const variable of COUNTERFACTUAL_VARIABLES) {
      const original = makeTrial();
      const { counterfactual, changedVariable } = runCounterfactual(
        original,
        variable,
        0.3,
      );
      expect(changedVariable).toBe(variable);
      expect(diffParameters(original.parameters, counterfactual.parameters)).toEqual([
        variable,
      ]);
    }
  });

  it("keeps the original trial immutable (reference identity preserved)", () => {
    const original = makeTrial();
    const before = structuredClone(original.snapshots);
    const result = runCounterfactual(original, "absorberPosition", 0.1);
    expect(result.original).toBe(original);
    expect(original.snapshots).toEqual(before);
  });

  it("keeps the same seed and duration as the original", () => {
    const original = makeTrial();
    const { counterfactual } = runCounterfactual(original, "materialDensity", 0.5);
    expect(counterfactual.parameters.seed).toBe(original.parameters.seed);
    expect(counterfactual.parameters.durationSteps).toBe(
      original.parameters.durationSteps,
    );
    expect(counterfactual.changedVariables).toEqual(["materialDensity"]);
  });

  it("rejects disallowed counterfactual variables", () => {
    const original = makeTrial();
    expect(() => runCounterfactual(original, "seed", 5)).toThrow();
    expect(() => runCounterfactual(original, "durationSteps", 30)).toThrow();
  });

  it("reproduces the original outcome when the value is unchanged", () => {
    const original = makeTrial();
    const { counterfactual } = runCounterfactual(
      original,
      "absorberPosition",
      original.parameters.absorberPosition,
    );
    const fresh = runSimulation(original.parameters).trial;
    const lastCf = counterfactual.snapshots[counterfactual.snapshots.length - 1];
    const lastFresh = fresh.snapshots[fresh.snapshots.length - 1];
    expect(lastCf.freeNeutrons).toBe(lastFresh.freeNeutrons);
    expect(lastCf.reactionEvents).toBe(lastFresh.reactionEvents);
  });
});
