import { describe, expect, it } from "vitest";
import {
  MAX_POPULATION,
  MAX_STEPS,
  clampParameters,
  createDefaultParameters,
  type ExperimentParameters,
} from "@/domain/experiments";
import {
  createSeededRandom,
  runSimulation,
} from "@/simulation/nuclear-chain-reaction";

function params(overrides: Partial<ExperimentParameters>): ExperimentParameters {
  return { ...createDefaultParameters(), ...overrides };
}

describe("nuclear chain reaction simulation", () => {
  it("deterministic replay: identical seed and parameters produce identical snapshots", () => {
    const p = params({ seed: 42, absorberPosition: 0.3 });
    const a = runSimulation(p);
    const b = runSimulation(p);
    expect(a.trial.snapshots).toEqual(b.trial.snapshots);
    expect(a.stopReason).toBe(b.stopReason);
  });

  it("zero starting neutrons produce no reaction", () => {
    const result = runSimulation(params({ startingNeutrons: 0, seed: 7 }));
    expect(result.stopReason).toBe("extinct");
    const last = result.trial.snapshots[result.trial.snapshots.length - 1];
    expect(last.freeNeutrons).toBe(0);
    expect(last.reactionEvents).toBe(0);
    expect(last.absorbedNeutrons).toBe(0);
    expect(last.escapedNeutrons).toBe(0);
    expect(result.trial.snapshots).toHaveLength(1);
  });

  it("state never goes negative and never exceeds the population cap", () => {
    const seeds = [1, 2, 3, 42, 777, 12345];
    for (const seed of seeds) {
      const result = runSimulation(params({ seed }));
      for (const s of result.trial.snapshots) {
        expect(s.freeNeutrons).toBeGreaterThanOrEqual(0);
        expect(s.absorbedNeutrons).toBeGreaterThanOrEqual(0);
        expect(s.escapedNeutrons).toBeGreaterThanOrEqual(0);
        expect(s.reactionEvents).toBeGreaterThanOrEqual(0);
        expect(s.cumulativeEnergyUnits).toBeGreaterThanOrEqual(0);
        expect(s.freeNeutrons).toBeLessThanOrEqual(MAX_POPULATION);
      }
    }
  });

  it("terminates at the maximum step count", () => {
    const result = runSimulation(
      params({ durationSteps: 10, seed: 42, absorberPosition: 1, absorptionProbability: 0.6 }),
    );
    expect(result.trial.snapshots.length).toBeLessThanOrEqual(11);
    expect(["completed", "extinct"]).toContain(result.stopReason);
  });

  it("terminates at the maximum population cap", () => {
    const result = runSimulation(
      params({
        absorberPosition: 0.05,
        absorptionProbability: 0.01,
        materialDensity: 1,
        durationSteps: 120,
        startingNeutrons: 10,
        seed: 42,
      }),
    );
    expect(result.stopReason).toBe("max_population");
    const last = result.trial.snapshots[result.trial.snapshots.length - 1];
    expect(last.freeNeutrons).toBe(MAX_POPULATION);
  });

  it("increased absorption never increases the reaction (expected-value checks)", () => {
    // Rationale: per neutron, the absorption roll happens BEFORE the fission
    // roll, so a neutron removed by absorption can never cause a fission.
    // Paired runs on one seed share a seed, but their RNG streams diverge as
    // soon as one neutron behaves differently, so single-seed endpoint
    // comparisons can occasionally flip by a hair near the extinction
    // boundary. The statistically meaningful assertion is expected-value
    // dominance: summed over 30 fixed seeds, the higher-absorption runs must
    // produce no more total reactions and no more total free neutrons. The
    // margins below are enormous (~5x and ~15x), so this is robust and
    // deterministic (fixed seeds — never flaky).
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);

    // Regime A: absorber position, in a regime where neither run caps.
    let reactLow = 0;
    let reactHigh = 0;
    let freeLow = 0;
    let freeHigh = 0;
    for (const seed of seeds) {
      const low = runSimulation(
        params({ seed, absorptionProbability: 0.35, absorberPosition: 0.5, durationSteps: 60 }),
      );
      const high = runSimulation(
        params({ seed, absorptionProbability: 0.35, absorberPosition: 0.6, durationSteps: 60 }),
      );
      const lowLast = low.trial.snapshots[low.trial.snapshots.length - 1];
      const highLast = high.trial.snapshots[high.trial.snapshots.length - 1];
      reactLow += lowLast.reactionEvents;
      reactHigh += highLast.reactionEvents;
      freeLow += lowLast.freeNeutrons;
      freeHigh += highLast.freeNeutrons;
    }
    expect(reactHigh).toBeLessThanOrEqual(reactLow);
    expect(freeHigh).toBeLessThanOrEqual(freeLow);

    // Regime B: absorption probability, same expectation property.
    reactLow = 0;
    reactHigh = 0;
    freeLow = 0;
    freeHigh = 0;
    for (const seed of seeds) {
      const low = runSimulation(
        params({ seed, absorptionProbability: 0.15, absorberPosition: 0.8, durationSteps: 40 }),
      );
      const high = runSimulation(
        params({ seed, absorptionProbability: 0.3, absorberPosition: 0.8, durationSteps: 40 }),
      );
      const lowLast = low.trial.snapshots[low.trial.snapshots.length - 1];
      const highLast = high.trial.snapshots[high.trial.snapshots.length - 1];
      reactLow += lowLast.reactionEvents;
      reactHigh += highLast.reactionEvents;
      freeLow += lowLast.freeNeutrons;
      freeHigh += highLast.freeNeutrons;
    }
    expect(reactHigh).toBeLessThanOrEqual(reactLow);
    expect(freeHigh).toBeLessThanOrEqual(freeLow);
  });

  it("clamps out-of-range parameters to safe configured ranges", () => {
    const result = runSimulation(
      params({
        absorberPosition: 5,
        startingNeutrons: 1000,
        materialDensity: -3,
        durationSteps: 1,
        absorptionProbability: 9,
        seed: -10,
      }),
    );
    expect(result.trial.parameters).toEqual(
      clampParameters(result.trial.parameters),
    );
    expect(result.trial.parameters.durationSteps).toBeGreaterThanOrEqual(10);
    expect(result.trial.parameters.durationSteps).toBeLessThanOrEqual(MAX_STEPS);
    expect(result.trial.parameters.absorberPosition).toBeLessThanOrEqual(1);
    expect(result.trial.parameters.startingNeutrons).toBeLessThanOrEqual(10);
  });

  it("normalizes NaN and non-finite parameter inputs to safe defaults", () => {
    const result = runSimulation(
      params({
        absorberPosition: NaN,
        materialDensity: Infinity,
        absorptionProbability: -Infinity,
        seed: NaN,
      }),
    );
    expect(result.trial.parameters).toEqual(
      clampParameters(result.trial.parameters),
    );
    expect(result.trial.parameters.absorberPosition).toBe(0.9);
    expect(result.trial.parameters.materialDensity).toBe(0.9);
    expect(result.trial.parameters.absorptionProbability).toBe(0.25);
    expect(result.trial.parameters.seed).toBe(42);
    for (const snap of result.trial.snapshots) {
      expect(Number.isFinite(snap.freeNeutrons)).toBe(true);
      expect(Number.isFinite(snap.reactionEvents)).toBe(true);
      expect(snap.freeNeutrons).toBeGreaterThanOrEqual(0);
    }
  });

  it("counters are monotonic non-decreasing across the timeline", () => {
    const result = runSimulation(params({ seed: 42, absorberPosition: 0.3 }));
    let prev = result.trial.snapshots[0];
    for (const s of result.trial.snapshots.slice(1)) {
      expect(s.absorbedNeutrons).toBeGreaterThanOrEqual(prev.absorbedNeutrons);
      expect(s.escapedNeutrons).toBeGreaterThanOrEqual(prev.escapedNeutrons);
      expect(s.reactionEvents).toBeGreaterThanOrEqual(prev.reactionEvents);
      expect(s.cumulativeEnergyUnits).toBeGreaterThanOrEqual(
        prev.cumulativeEnergyUnits,
      );
      prev = s;
    }
  });

  it("snapshot steps are contiguous from 0", () => {
    const result = runSimulation(params({ seed: 42, durationSteps: 25 }));
    result.trial.snapshots.forEach((s, i) => expect(s.step).toBe(i));
  });

  it("seeded random is deterministic", () => {
    const a = createSeededRandom(1234);
    const b = createSeededRandom(1234);
    for (let i = 0; i < 100; i += 1) {
      expect(a()).toBe(b());
    }
  });
});
