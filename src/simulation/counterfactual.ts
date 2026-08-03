import {
  clampParameters,
  type ExperimentParameterKey,
  type ExperimentParameters,
  type TrialRecord,
} from "@/domain/experiments";
import { runSimulation } from "./nuclear-chain-reaction";

/**
 * Counterfactual Microscope: change EXACTLY one variable, keep the SAME seed
 * (same randomness), and compare. This is the causal design: any difference in
 * outcome is attributable to the single changed variable. durationSteps and
 * seed are never exposable counterfactual variables.
 */
export const COUNTERFACTUAL_VARIABLES: ExperimentParameterKey[] = [
  "absorberPosition",
  "absorptionProbability",
  "materialDensity",
  "startingNeutrons",
];

export interface CounterfactualResult {
  /** The exact original trial object, unmodified (reference identity). */
  original: TrialRecord;
  counterfactual: TrialRecord;
  changedVariable: ExperimentParameterKey;
}

function deepCloneParameters(params: ExperimentParameters): ExperimentParameters {
  return structuredClone(params);
}

export function runCounterfactual(
  original: TrialRecord,
  variable: ExperimentParameterKey,
  value: number,
): CounterfactualResult {
  if (!COUNTERFACTUAL_VARIABLES.includes(variable)) {
    throw new Error(
      `Variable "${variable}" is not an allowed counterfactual variable.`,
    );
  }

  const changed = deepCloneParameters(original.parameters);
  changed[variable] = value;
  const parameters = clampParameters(changed);

  const result = runSimulation(parameters);
  const now = new Date().toISOString();
  const counterfactual: TrialRecord = {
    ...result.trial,
    id: `cf-${crypto.randomUUID()}`,
    changedVariables: [variable],
    startedAt: now,
    completedAt: now,
  };

  return { original, counterfactual, changedVariable: variable };
}
