import {
  MAX_POPULATION,
  clampParameters,
  type ExperimentParameters,
  type SimulationRunResult,
  type SimulationSnapshot,
  type SimulationStopReason,
  type TrialRecord,
} from "@/domain/experiments";

/**
 * CONCEPTUAL, FICTIONALIZED educational model — NOT a real reactor model.
 * Values are dimensionless and abstract. This engine is deterministic and
 * seeded: the same parameters and seed always produce the same result.
 * It must never be used for real-world engineering or safety decisions.
 */

export const ESCAPE_PROBABILITY = 0.12;
export const FISSION_CHANCE = 0.5;
export const ENERGY_PER_REACTION = 2;

/**
 * Mulberry32 seeded PRNG. Deterministic across runs and environments.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initialSnapshot(startingNeutrons: number): SimulationSnapshot {
  return {
    step: 0,
    freeNeutrons: startingNeutrons,
    absorbedNeutrons: 0,
    escapedNeutrons: 0,
    reactionEvents: 0,
    cumulativeEnergyUnits: 0,
  };
}

/**
 * One simulation step is one round of collisions ("a generation"): the
 * neutrons present at the start of the step are each rolled for escape,
 * absorption, then fission. Neutrons released by fission take part in the
 * NEXT step. This keeps growth visible and animation-friendly.
 */
export function runSimulation(
  rawParams: ExperimentParameters,
): SimulationRunResult {
  const params = clampParameters(rawParams);
  const snapshots: SimulationSnapshot[] = [];
  const rand = createSeededRandom(params.seed);

  let freeNeutrons = Math.max(0, Math.round(params.startingNeutrons));
  let absorbed = 0;
  let escaped = 0;
  let reactions = 0;
  let energy = 0;
  let stopReason: SimulationStopReason;

  snapshots.push(initialSnapshot(freeNeutrons));
  if (freeNeutrons <= 0) {
    stopReason = "extinct";
    return buildResult(params, snapshots, stopReason);
  }

  for (let step = 1; step <= params.durationSteps; step += 1) {
    const populationThisStep = freeNeutrons;
    let escapedThisStep = 0;
    let absorbedThisStep = 0;
    let released = 0;

    for (let i = 0; i < populationThisStep; i += 1) {
      if (rand() < ESCAPE_PROBABILITY) {
        escaped += 1;
        escapedThisStep += 1;
        continue;
      }
      if (rand() < params.absorptionProbability * params.absorberPosition) {
        absorbed += 1;
        absorbedThisStep += 1;
        continue;
      }
      if (rand() < params.materialDensity * FISSION_CHANCE) {
        reactions += 1;
        energy += ENERGY_PER_REACTION;
        released += 1; // each fissioning neutron releases one extra net neutron
        continue;
      }
      // Neutron survives.
    }

    freeNeutrons = freeNeutrons - escapedThisStep - absorbedThisStep + released;

    if (freeNeutrons >= MAX_POPULATION) {
      freeNeutrons = MAX_POPULATION;
      snapshots.push(snapshot(step, freeNeutrons, absorbed, escaped, reactions, energy));
      stopReason = "max_population";
      return buildResult(params, snapshots, stopReason);
    }
    if (freeNeutrons <= 0) {
      snapshots.push(snapshot(step, 0, absorbed, escaped, reactions, energy));
      stopReason = "extinct";
      return buildResult(params, snapshots, stopReason);
    }

    snapshots.push(snapshot(step, freeNeutrons, absorbed, escaped, reactions, energy));
  }

  stopReason = "completed";
  return buildResult(params, snapshots, stopReason);
}

function snapshot(
  step: number,
  freeNeutrons: number,
  absorbedNeutrons: number,
  escapedNeutrons: number,
  reactionEvents: number,
  cumulativeEnergyUnits: number,
): SimulationSnapshot {
  return {
    step,
    freeNeutrons,
    absorbedNeutrons,
    escapedNeutrons,
    reactionEvents,
    cumulativeEnergyUnits,
  };
}

function buildResult(
  params: ExperimentParameters,
  snapshots: SimulationSnapshot[],
  stopReason: SimulationStopReason,
): SimulationRunResult {
  const now = new Date().toISOString();
  const trial: TrialRecord = {
    id: crypto.randomUUID(),
    parameters: { ...params },
    snapshots,
    changedVariables: [],
    startedAt: now,
    completedAt: now,
  };
  return { trial, stopReason };
}
