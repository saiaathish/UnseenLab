import { describe, expect, it } from "vitest";
import { createDefaultParameters } from "@/domain/experiments";
import type { ExperimentParameters } from "@/domain/experiments";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";

/**
 * Adversarial check: the science must be a pure function of the experiment
 * parameters. Learner preferences (animation speed, reduced motion, contrast,
 * text scale, information density) describe HOW the learner views a run —
 * they must never leak into, or alter, the trial record.
 */

const PREFERENCE_KEY_NAMES = [
  "animationSpeed",
  "reducedMotion",
  "highContrast",
  "textScale",
  "informationDensity",
] as const;

function params(overrides: Partial<ExperimentParameters>): ExperimentParameters {
  return { ...createDefaultParameters(), ...overrides };
}

/** A preferences-like object riding along inside the parameters input. */
function taintedParameters(): ExperimentParameters {
  return {
    ...createDefaultParameters(),
    animationSpeed: 2,
    reducedMotion: true,
    highContrast: true,
    textScale: 1.5,
    informationDensity: "full",
  } as ExperimentParameters;
}

describe("learner preferences cannot alter scientific results", () => {
  it("is a pure function of parameters: identical input twice gives an identical trial", () => {
    const p = params({ seed: 42, absorberPosition: 0.2, durationSteps: 10 });
    const a = runSimulation(p);
    const b = runSimulation(p);
    expect(a.trial.snapshots).toEqual(b.trial.snapshots);
    expect(a.stopReason).toBe(b.stopReason);
    expect(a.trial.parameters).toEqual(b.trial.parameters);
  });

  it("never records preference state: the trial record holds only scientific fields", () => {
    const trial = runSimulation(
      params({ seed: 42, absorberPosition: 0.2, durationSteps: 10 }),
    ).trial;

    expect(Object.keys(trial).sort()).toEqual([
      "changedVariables",
      "completedAt",
      "id",
      "parameters",
      "snapshots",
      "startedAt",
    ]);
    expect(Object.keys(trial.parameters).sort()).toEqual([
      "absorberPosition",
      "absorptionProbability",
      "durationSteps",
      "materialDensity",
      "seed",
      "startingNeutrons",
    ]);
    for (const key of PREFERENCE_KEY_NAMES) {
      expect(trial).not.toHaveProperty(key);
      expect(trial.parameters).not.toHaveProperty(key);
    }
  });

  it("preference-like keys smuggled into the parameters input leave the science untouched", () => {
    const clean = runSimulation(params({ seed: 42, durationSteps: 10 }));
    const tainted = runSimulation(taintedParameters());
    // Same seed, same scientific knobs: identical outcome regardless of what
    // preference-shaped noise rides along in the input.
    expect(tainted.trial.snapshots).toEqual(clean.trial.snapshots);
    expect(tainted.stopReason).toBe(clean.stopReason);
  });

  it("science varies with the seed, never with learner state", () => {
    const base = params({ absorberPosition: 0.2, durationSteps: 10 });
    const seeded42 = runSimulation({ ...base, seed: 42 }).trial;
    const seeded43 = runSimulation({ ...base, seed: 43 }).trial;
    const finalFreeNeutronsOf = (trial: { snapshots: { freeNeutrons: number }[] }) =>
      trial.snapshots[trial.snapshots.length - 1].freeNeutrons;

    expect(seeded42.parameters.seed).not.toBe(seeded43.parameters.seed);
    expect(seeded42.snapshots).not.toEqual(seeded43.snapshots);
    // Same knobs, different seed: seed 42 completes with a population of 13,
    // seed 43 dies out. The difference comes from the seed alone — no learner
    // preference is part of the input to the science.
    expect(finalFreeNeutronsOf(seeded42)).toBe(13);
    expect(finalFreeNeutronsOf(seeded43)).toBe(0);
  });
});
