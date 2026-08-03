import { z } from "zod";

/**
 * The nuclear chain reaction module is a conceptual, fictionalized educational
 * model. Values are dimensionless and abstract. It does NOT model any real
 * reactor, material, or facility, and it must never be used for real-world
 * engineering or safety decisions.
 */

export const NUCLEAR_CHAIN_REACTION_LAB_ID = "nuclear-chain-reaction";

export const simulationDisclaimer =
  "This is a conceptual, simplified simulation with fictionalized values. " +
  "It teaches causal principles only. It is not a real reactor model and must " +
  "not be used for any real-world engineering or safety decision.";

/** Hard ceiling on the free-neutron population. The run stops when reached. */
export const MAX_POPULATION = 500;
export const MAX_STEPS = 120;
export const MIN_STEPS = 10;
export const MAX_STARTING_NEUTRONS = 10;

export interface ExperimentParameters {
  /**
   * Fraction of absorber inserted: 1 = fully inserted (absorbs more),
   * 0 = fully withdrawn. Lowering this number "withdraws" the absorber.
   */
  absorberPosition: number;
  startingNeutrons: number;
  /** Abstract material density in [0,1]. Higher density -> more collisions. */
  materialDensity: number;
  /** Base per-neutron absorption probability in [0,1], scaled by absorber position. */
  absorptionProbability: number;
  durationSteps: number;
  /** Seeded PRNG seed. Same seed + parameters => identical result. */
  seed: number;
}

export const DEFAULT_EXPERIMENT_PARAMETERS: ExperimentParameters = {
  absorberPosition: 0.9,
  startingNeutrons: 3,
  materialDensity: 0.9,
  absorptionProbability: 0.25,
  durationSteps: 60,
  seed: 42,
};

export const experimentParametersSchema = z.object({
  absorberPosition: z.number().min(0).max(1),
  startingNeutrons: z.number().int().min(1).max(MAX_STARTING_NEUTRONS),
  materialDensity: z.number().min(0.1).max(1),
  absorptionProbability: z.number().min(0.01).max(0.6),
  durationSteps: z.number().int().min(MIN_STEPS).max(MAX_STEPS),
  seed: z.number().int().min(0).max(1_000_000_000),
});

export type ExperimentParameterKey = keyof ExperimentParameters;

export interface ExperimentParameterSpec {
  key: ExperimentParameterKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  plainExplanation: string;
}

export const NUCLEAR_PARAMETER_SPECS: ExperimentParameterSpec[] = [
  {
    key: "absorberPosition",
    label: "Absorber position",
    min: 0,
    max: 1,
    step: 0.1,
    unit: "inserted",
    plainExplanation:
      "How far the absorber rod is pushed in. More inserted means more neutrons get absorbed.",
  },
  {
    key: "startingNeutrons",
    label: "Starting neutrons",
    min: 1,
    max: MAX_STARTING_NEUTRONS,
    step: 1,
    unit: "neutrons",
    plainExplanation:
      "How many free neutrons the simulation starts with.",
  },
  {
    key: "materialDensity",
    label: "Material density",
    min: 0.1,
    max: 1,
    step: 0.1,
    unit: "abstract",
    plainExplanation:
      "Abstract density of the material. Higher density means neutrons collide more often.",
  },
  {
    key: "absorptionProbability",
    label: "Neutron absorption chance",
    min: 0.01,
    max: 0.6,
    step: 0.01,
    unit: "per step",
    plainExplanation:
      "Base chance a free neutron gets absorbed each step. Absorber position scales this chance.",
  },
  {
    key: "durationSteps",
    label: "Duration",
    min: MIN_STEPS,
    max: MAX_STEPS,
    step: 5,
    unit: "steps",
    plainExplanation: "How many steps the simulation runs before stopping.",
  },
  {
    key: "seed",
    label: "Random seed",
    min: 0,
    max: 1_000_000_000,
    step: 1,
    unit: "",
    plainExplanation:
      "A number that fixes the random events. The same seed always gives the same result.",
  },
];

export interface SimulationSnapshot {
  step: number;
  freeNeutrons: number;
  absorbedNeutrons: number;
  escapedNeutrons: number;
  reactionEvents: number;
  cumulativeEnergyUnits: number;
}

export const simulationSnapshotSchema = z.object({
  step: z.number().int().min(0),
  freeNeutrons: z.number().int().min(0),
  absorbedNeutrons: z.number().int().min(0),
  escapedNeutrons: z.number().int().min(0),
  reactionEvents: z.number().int().min(0),
  cumulativeEnergyUnits: z.number().int().min(0),
});

export interface TrialRecord {
  id: string;
  parameters: ExperimentParameters;
  snapshots: SimulationSnapshot[];
  /** Parameter keys changed relative to the previous trial in this session. */
  changedVariables: ExperimentParameterKey[];
  startedAt: string;
  completedAt: string;
}

export const trialRecordSchema = z.object({
  id: z.string().min(1),
  parameters: experimentParametersSchema,
  snapshots: z.array(simulationSnapshotSchema),
  changedVariables: z.array(
    z.enum([
      "absorberPosition",
      "startingNeutrons",
      "materialDensity",
      "absorptionProbability",
      "durationSteps",
      "seed",
    ]),
  ),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export type SimulationStopReason = "completed" | "max_population" | "extinct";

export interface SimulationRunResult {
  trial: TrialRecord;
  stopReason: SimulationStopReason;
}

/**
 * Clamps a parameter value into the configured safe range for its spec.
 * Also enforces integer-ness for integer parameters.
 */
export function clampParameter(
  key: ExperimentParameterKey,
  value: number,
): number {
  const spec = NUCLEAR_PARAMETER_SPECS.find((s) => s.key === key);
  if (!spec) return value;
  // Engine safety allows startingNeutrons = 0 (a run with no neutrons must
  // produce no reaction); the UI slider still starts at 1.
  const min = key === "startingNeutrons" ? 0 : spec.min;
  let clamped = Math.min(Math.max(value, min), spec.max);
  if (key === "startingNeutrons" || key === "durationSteps" || key === "seed") {
    clamped = Math.round(clamped);
  }
  return clamped;
}

export function clampParameters(
  params: ExperimentParameters,
): ExperimentParameters {
  const out = { ...params };
  for (const spec of NUCLEAR_PARAMETER_SPECS) {
    out[spec.key] = clampParameter(spec.key, out[spec.key]);
  }
  return out;
}

export function createDefaultParameters(): ExperimentParameters {
  return structuredClone(DEFAULT_EXPERIMENT_PARAMETERS);
}

export interface ExperimentDefinition {
  id: string;
  slug: string;
  title: string;
  pitch: string;
  goal: string;
  status: "ready" | "planned";
  parameterSpecs: ExperimentParameterSpec[];
  defaultParameters: ExperimentParameters;
}

export const NUCLEAR_CHAIN_REACTION_EXPERIMENT: ExperimentDefinition = {
  id: NUCLEAR_CHAIN_REACTION_LAB_ID,
  slug: "nuclear-chain-reaction",
  title: "Nuclear Chain Reaction",
  pitch:
    "Control an invisible chain reaction — see why it can suddenly grow out of proportion.",
  goal: "Find out what happens to the reaction when you withdraw the absorber.",
  status: "ready",
  parameterSpecs: NUCLEAR_PARAMETER_SPECS,
  defaultParameters: DEFAULT_EXPERIMENT_PARAMETERS,
};

export const PLANNED_EXPERIMENTS: ExperimentDefinition[] = [
  {
    id: "high-voltage-circuit-failure",
    slug: "high-voltage-circuit-failure",
    title: "High-Voltage Circuit Failure",
    pitch: "Trace what breaks first when a circuit is pushed past its limits.",
    goal: "Planned lab.",
    status: "planned",
    parameterSpecs: [],
    defaultParameters: DEFAULT_EXPERIMENT_PARAMETERS,
  },
  {
    id: "exothermic-thermal-runaway",
    slug: "exothermic-thermal-runaway",
    title: "Exothermic Thermal Runaway",
    pitch: "Watch a reaction heat itself up faster and faster.",
    goal: "Planned lab.",
    status: "planned",
    parameterSpecs: [],
    defaultParameters: DEFAULT_EXPERIMENT_PARAMETERS,
  },
];

export const EXPERIMENT_REGISTRY: Record<string, ExperimentDefinition> = {
  [NUCLEAR_CHAIN_REACTION_LAB_ID]: NUCLEAR_CHAIN_REACTION_EXPERIMENT,
};
