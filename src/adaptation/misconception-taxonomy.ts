import type { AdaptationInput } from "@/domain/adaptation";
import type {
  ConceptEvidence,
  PredictionRecord,
} from "@/domain/evidence";
import {
  MAX_POPULATION,
  type ExperimentParameters,
  type TrialRecord,
} from "@/domain/experiments";

/**
 * Deterministic, conservative classification of learner behavior into
 * possible conceptual areas of interest ("misconception taxonomy").
 *
 * This module never infers a diagnosis and never uses judgmental language.
 * It only reports whether learner behavior is consistent with, or in tension
 * with, a scientific idea — expressed as "supported" / "partial" /
 * "uncertain" / "contradicted". Contradiction here means "the prediction and
 * the outcome did not line up", which is a normal part of exploring a model,
 * not a failing on the learner's part.
 *
 * The classification is a bounded set of rules, not advanced AI. Free-text
 * keyword matching is explicitly a conservative fallback for when no
 * structured answer exists.
 */

export const MISCONCEPTION_IDS = [
  "LINEAR_VS_NONLINEAR_GROWTH",
  "ABSORBER_EFFECT",
  "STARTING_POPULATION_EFFECT",
  "RANDOM_EVENT_VS_SYSTEM_PATTERN",
  "MULTIPLE_VARIABLE_CONFOUNDING",
] as const;

export type MisconceptionId = (typeof MISCONCEPTION_IDS)[number];

export interface MisconceptionDefinition {
  id: MisconceptionId;
  /** Short display name, e.g. "Linear vs. nonlinear growth". */
  label: string;
  /** Learner-friendly, non-judgmental explanation. */
  plainExplanation: string;
}

export const MISCONCEPTIONS: Record<MisconceptionId, MisconceptionDefinition> =
  {
    LINEAR_VS_NONLINEAR_GROWTH: {
      id: "LINEAR_VS_NONLINEAR_GROWTH",
      label: "Linear vs. nonlinear growth",
      plainExplanation:
        "Reactions can grow steadily or speed up dramatically once they take " +
        "off. Noticing which one happens helps you predict what comes next.",
    },
    ABSORBER_EFFECT: {
      id: "ABSORBER_EFFECT",
      label: "Absorber effect",
      plainExplanation:
        "Moving the absorber rod in or out changes how fast the reaction " +
        "grows. Tracing that link step by step makes the mechanism clearer.",
    },
    STARTING_POPULATION_EFFECT: {
      id: "STARTING_POPULATION_EFFECT",
      label: "Starting population effect",
      plainExplanation:
        "More starting neutrons can push the reaction to a larger final " +
        "population. Comparing runs shows how big the starting effect is.",
    },
    RANDOM_EVENT_VS_SYSTEM_PATTERN: {
      id: "RANDOM_EVENT_VS_SYSTEM_PATTERN",
      label: "Random events vs. system pattern",
      plainExplanation:
        "Chance influences every run, but a pattern that repeats across " +
        "different random seeds comes from the system, not from luck.",
    },
    MULTIPLE_VARIABLE_CONFOUNDING: {
      id: "MULTIPLE_VARIABLE_CONFOUNDING",
      label: "Multiple variables at once",
      plainExplanation:
        "When several knobs change in the same run, it is harder to tell " +
        "which one caused the result. Changing one thing at a time keeps the " +
        "story clear.",
    },
  };

/**
 * Coarse shape of a trial's population timeline.
 * - "nonlinear": accelerated/super-linear growth (or hit the population ceiling)
 * - "moderate_growth": steady growth between the two thresholds
 * - "declining_or_flat": flat or falling population
 */
export type GrowthClass = "nonlinear" | "moderate_growth" | "declining_or_flat";

/**
 * Heuristic thresholds for shape classification.
 * Ratio = finalFree / max(initial, 1), computed from the free-neutron
 * timeline. Reaching the hard ceiling (MAX_POPULATION) is also treated as
 * nonlinear regardless of ratio, because the run was cut off while still
 * climbing — the curve's tail is hidden.
 */
export const NONLINEAR_GROWTH_RATIO = 8;
export const FLAT_GROWTH_RATIO = 1.5;

/** Conservative keyword fallback for free-text predictions. */
const NONLINEAR_INTENT_KEYWORDS = [
  "nonlinear",
  "accelerat",
  "exponent",
  "grow much",
  "grows fast",
];
const LINEAR_INTENT_KEYWORDS = [
  "slightly",
  "little",
  "bit faster",
  "linearly",
  "linear",
];

/** Whether a trial's population timeline looks linear-ish vs nonlinear. */
export function growthClassOf(
  snapshotFreeNeutrons: number[],
  startingNeutrons: number,
): GrowthClass {
  if (snapshotFreeNeutrons.length === 0) return "declining_or_flat";
  const initial = Math.max(snapshotFreeNeutrons[0] ?? startingNeutrons, 1);
  const final = snapshotFreeNeutrons[snapshotFreeNeutrons.length - 1];
  if (final >= MAX_POPULATION) return "nonlinear";
  const ratio = final / initial;
  if (ratio > NONLINEAR_GROWTH_RATIO) return "nonlinear";
  if (ratio <= FLAT_GROWTH_RATIO) return "declining_or_flat";
  return "moderate_growth";
}

/** Final free-neutron count of a trial (0 when it has no snapshots). */
export function finalFreeNeutronsOf(trial: TrialRecord): number {
  const last = trial.snapshots[trial.snapshots.length - 1];
  return last ? last.freeNeutrons : 0;
}

/** Most recent prediction attached to a trial, if any. */
export function findPredictionFor(
  trialId: string,
  predictions: PredictionRecord[],
): PredictionRecord | null {
  for (let i = predictions.length - 1; i >= 0; i--) {
    if (predictions[i].trialId === trialId) return predictions[i];
  }
  return null;
}

/** Deep equality of experiment parameters (including seed). */
export function parametersEqual(
  a: ExperimentParameters,
  b: ExperimentParameters,
): boolean {
  return PARAMETER_KEYS.every((key) => a[key] === b[key]);
}

/** Equality of experiment parameters ignoring the random seed. */
function parametersEqualIgnoringSeed(
  a: ExperimentParameters,
  b: ExperimentParameters,
): boolean {
  return PARAMETER_KEYS.filter((key) => key !== "seed").every(
    (key) => a[key] === b[key],
  );
}

const PARAMETER_KEYS: (keyof ExperimentParameters)[] = [
  "absorberPosition",
  "startingNeutrons",
  "materialDensity",
  "absorptionProbability",
  "durationSteps",
  "seed",
];

function trialGrowthClass(trial: TrialRecord): GrowthClass {
  return growthClassOf(
    trial.snapshots.map((snapshot) => snapshot.freeNeutrons),
    trial.parameters.startingNeutrons,
  );
}

function lastTrialOf(trials: TrialRecord[]): TrialRecord | null {
  return trials.length > 0 ? trials[trials.length - 1] : null;
}

/** Which direction a structured answer predicts: "faster" | "slower" | null. */
function predictedDirectionOf(
  structuredAnswer: string | null,
): "faster" | "slower" | null {
  if (
    structuredAnswer === "slightly_faster" ||
    structuredAnswer === "much_faster_nonlinear"
  ) {
    return "faster";
  }
  if (structuredAnswer === "slower" || structuredAnswer === "stops") {
    return "slower";
  }
  return null;
}

/**
 * Classifies learner behavior against each concept. Only entries that carry
 * signal are emitted; a concept is omitted when there is nothing to say.
 */
export function classifyConceptEvidence(input: AdaptationInput): ConceptEvidence[] {
  const { predictions, trials } = input;
  const out: ConceptEvidence[] = [];
  const latest = lastTrialOf(trials);

  for (const conceptId of MISCONCEPTION_IDS) {
    switch (conceptId) {
      case "LINEAR_VS_NONLINEAR_GROWTH": {
        if (!latest) break;
        const prediction = findPredictionFor(latest.id, predictions);
        if (!prediction) break;
        const growth = trialGrowthClass(latest);

        if (prediction.structuredAnswer) {
          const structured = prediction.structuredAnswer;
          const predictedGrowthNonlinear =
            structured === "slightly_faster" || structured === "stays_the_same";
          const predictedMuchFasterNonlinear =
            structured === "much_faster_nonlinear";
          if (predictedGrowthNonlinear && growth === "nonlinear") {
            out.push({
              conceptId,
              status: "contradicted",
              evidenceIds: [prediction.id, latest.id],
            });
          } else if (predictedMuchFasterNonlinear && growth === "nonlinear") {
            out.push({
              conceptId,
              status: "supported",
              evidenceIds: [prediction.id, latest.id],
            });
          }
          // Other structured answers (e.g. "slower" vs flat runs) are left
          // unclassified: the rule set only claims the cases above.
        } else {
          // Free-text fallback: keyword matching is a coarse approximation,
          // never an attempt at real language understanding.
          const intent = freeTextGrowthIntent(prediction.answer);
          if (intent === "nonlinear") {
            if (growth === "nonlinear") {
              out.push({
                conceptId,
                status: "supported",
                evidenceIds: [prediction.id, latest.id],
              });
            } else if (growth === "declining_or_flat") {
              out.push({
                conceptId,
                status: "contradicted",
                evidenceIds: [prediction.id, latest.id],
              });
            } else {
              out.push({
                conceptId,
                status: "uncertain",
                evidenceIds: [prediction.id, latest.id],
              });
            }
          } else if (intent === "linear") {
            if (growth === "nonlinear") {
              out.push({
                conceptId,
                status: "contradicted",
                evidenceIds: [prediction.id, latest.id],
              });
            } else {
              out.push({
                conceptId,
                status: "supported",
                evidenceIds: [prediction.id, latest.id],
              });
            }
          } else {
            out.push({ conceptId, status: "uncertain", evidenceIds: [] });
          }
        }
        break;
      }

      case "ABSORBER_EFFECT": {
        if (trials.length < 2) break;
        const previous = trials[trials.length - 2];
        const last = trials[trials.length - 1];
        if (
          last.parameters.absorberPosition ===
          previous.parameters.absorberPosition
        ) {
          break;
        }
        const prediction = findPredictionFor(last.id, predictions);
        if (!prediction) break;
        const predictedDirection = predictedDirectionOf(
          prediction.structuredAnswer,
        );
        if (!predictedDirection) break;
        const absorberWithdrawn =
          last.parameters.absorberPosition < previous.parameters.absorberPosition;
        // Withdrawing the absorber frees more neutrons (faster); inserting it
        // absorbs more (slower).
        const actualDirection = absorberWithdrawn ? "faster" : "slower";
        out.push({
          conceptId,
          status:
            predictedDirection === actualDirection ? "supported" : "contradicted",
          evidenceIds: [previous.id, last.id, prediction.id],
        });
        break;
      }

      case "STARTING_POPULATION_EFFECT": {
        if (trials.length < 2) break;
        const previous = trials[trials.length - 2];
        const last = trials[trials.length - 1];
        const startDelta =
          last.parameters.startingNeutrons - previous.parameters.startingNeutrons;
        if (startDelta === 0) break;
        if (previous.snapshots.length === 0 || last.snapshots.length === 0) break;
        const finalDelta = finalFreeNeutronsOf(last) - finalFreeNeutronsOf(previous);
        if (finalDelta === 0) break;
        out.push({
          conceptId,
          status:
            Math.sign(startDelta) === Math.sign(finalDelta)
              ? "supported"
              : "contradicted",
          evidenceIds: [previous.id, last.id],
        });
        break;
      }

      case "RANDOM_EVENT_VS_SYSTEM_PATTERN": {
        // Latest pair (j maximal, then i maximal) whose parameters match
        // exactly except for the seed.
        let best: [TrialRecord, TrialRecord] | null = null;
        for (let j = trials.length - 1; j >= 1 && best === null; j--) {
          for (let i = j - 1; i >= 0; i--) {
            if (
              parametersEqualIgnoringSeed(
                trials[i].parameters,
                trials[j].parameters,
              ) &&
              trials[i].parameters.seed !== trials[j].parameters.seed
            ) {
              best = [trials[i], trials[j]];
              break;
            }
          }
        }
        if (!best) break;
        const [trialA, trialB] = best;
        out.push({
          conceptId,
          status:
            trialGrowthClass(trialA) === trialGrowthClass(trialB)
              ? "partial"
              : "uncertain",
          evidenceIds: [trialA.id, trialB.id],
        });
        break;
      }

      case "MULTIPLE_VARIABLE_CONFOUNDING": {
        if (!latest) break;
        const changedCount = latest.changedVariables.length;
        if (changedCount >= 3) {
          out.push({ conceptId, status: "contradicted", evidenceIds: [latest.id] });
        } else if (changedCount === 2) {
          out.push({ conceptId, status: "partial", evidenceIds: [latest.id] });
        }
        break;
      }
    }
  }

  return out;
}

function freeTextGrowthIntent(answer: string): "nonlinear" | "linear" | null {
  const text = answer.toLowerCase();
  // Check nonlinear intent first: "nonlinear" contains the substring
  // "linear", so the more specific reading must win.
  if (NONLINEAR_INTENT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "nonlinear";
  }
  if (LINEAR_INTENT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "linear";
  }
  return null;
}
