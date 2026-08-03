import { describe, expect, it } from "vitest";
import { createDefaultParameters } from "@/domain/experiments";
import { MAX_POPULATION } from "@/domain/experiments";
import type {
  SimulationSnapshot,
  TrialRecord,
} from "@/domain/experiments";
import type { PredictionRecord } from "@/domain/evidence";import { createDefaultPreferences } from "@/domain/learner";
import type { AdaptationInput } from "@/domain/adaptation";
import {
  classifyConceptEvidence,
  growthClassOf,
} from "@/adaptation/misconception-taxonomy";

function snap(step: number, free: number): SimulationSnapshot {
  return {
    step,
    freeNeutrons: free,
    absorbedNeutrons: 0,
    escapedNeutrons: 0,
    reactionEvents: 0,
    cumulativeEnergyUnits: 0,
  };
}

function makeTrial(overrides: Partial<TrialRecord> = {}): TrialRecord {
  const parameters = createDefaultParameters();
  return {
    id: "trial-1",
    parameters,
    snapshots: [],
    changedVariables: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

function makePrediction(
  trialId: string,
  structuredAnswer: string | null,
  answer = "",
): PredictionRecord {
  return {
    id: "prediction-1",
    trialId,
    prompt: "What will happen to the reaction?",
    answer: answer || structuredAnswer || "",
    structuredAnswer,
    confidence: 3,
    createdAt: "2026-01-01T00:00:30.000Z",
  };
}

function makeInput(
  trials: TrialRecord[],
  predictions: PredictionRecord[],
): AdaptationInput {
  return {
    preferences: createDefaultPreferences(),
    predictions,
    trials,
    sessionEvidence: {
      predictions,
      trials,
      representationEvents: [],
      adaptationProposals: [],
      conceptEvidence: [],
    },
  };
}

const LINEAR_NONLINEAR = "LINEAR_VS_NONLINEAR_GROWTH";
const ABSORBER_EFFECT = "ABSORBER_EFFECT";
const RANDOM_PATTERN = "RANDOM_EVENT_VS_SYSTEM_PATTERN";
const CONFOUNDING = "MULTIPLE_VARIABLE_CONFOUNDING";

function nonlinearTrial(overrides: Partial<TrialRecord> = {}): TrialRecord {
  return makeTrial({
    snapshots: [snap(0, 1), snap(30, 40), snap(60, MAX_POPULATION)],
    ...overrides,
  });
}

function moderateTrial(overrides: Partial<TrialRecord> = {}): TrialRecord {
  return makeTrial({
    snapshots: [snap(0, 3), snap(30, 6), snap(60, 9)],
    ...overrides,
  });
}

describe("growthClassOf", () => {
  it("classifies a ceiling-hitting run as nonlinear", () => {
    expect(
      growthClassOf([1, 2, 3, MAX_POPULATION], 1),
    ).toBe("nonlinear");
  });

  it("classifies super-linear growth (ratio > 8) as nonlinear", () => {
    expect(growthClassOf([1, 2, 4, 8, 16, 32, 64, 100], 1)).toBe(
      "nonlinear",
    );
  });

  it("classifies flat or declining timelines as declining_or_flat", () => {
    expect(growthClassOf([5, 5, 4, 2], 5)).toBe("declining_or_flat");
  });

  it("classifies steady growth as moderate_growth", () => {
    expect(growthClassOf([3, 5, 7, 9], 3)).toBe("moderate_growth");
  });
});

describe("classifyConceptEvidence: LINEAR_VS_NONLINEAR_GROWTH", () => {
  it("reports contradicted when a slight-growth prediction meets nonlinear growth", () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", "slightly_faster");

    const result = classifyConceptEvidence(makeInput([trial], [prediction]));
    const entry = result.find((c) => c.conceptId === LINEAR_NONLINEAR);

    expect(entry?.status).toBe("contradicted");
    expect(entry?.evidenceIds).toContain("trial-a");
    expect(entry?.evidenceIds).toContain(prediction.id);
  });

  it("reports supported when a nonlinear prediction meets nonlinear growth", () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", "much_faster_nonlinear");

    const result = classifyConceptEvidence(makeInput([trial], [prediction]));
    const entry = result.find((c) => c.conceptId === LINEAR_NONLINEAR);

    expect(entry?.status).toBe("supported");
    expect(entry?.evidenceIds).toEqual([prediction.id, "trial-a"]);
  });

  it("omits the concept when no prediction matches the latest trial", () => {
    const trial = nonlinearTrial({ id: "trial-a" });

    const result = classifyConceptEvidence(makeInput([trial], []));

    expect(result.find((c) => c.conceptId === LINEAR_NONLINEAR)).toBeUndefined();
  });

  it("omits the concept when there is no trial at all", () => {
    const result = classifyConceptEvidence(makeInput([], []));
    expect(result).toEqual([]);
  });

  it("keyword fallback: nonlinear free text matches nonlinear growth", () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", null, "it will grow nonlinearly");

    const result = classifyConceptEvidence(makeInput([trial], [prediction]));
    const entry = result.find((c) => c.conceptId === LINEAR_NONLINEAR);

    expect(entry?.status).toBe("supported");
  });

  it("keyword fallback: linear free text matches steady growth", () => {
    const trial = moderateTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", null, "slightly faster");

    const result = classifyConceptEvidence(makeInput([trial], [prediction]));
    const entry = result.find((c) => c.conceptId === LINEAR_NONLINEAR);

    expect(entry?.status).toBe("supported");
  });

  it("keyword fallback: linear intent contradicted by nonlinear growth", () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", null, "slightly faster");

    const result = classifyConceptEvidence(makeInput([trial], [prediction]));
    const entry = result.find((c) => c.conceptId === LINEAR_NONLINEAR);

    expect(entry?.status).toBe("contradicted");
  });

  it("keyword fallback: no keyword hit yields uncertain with empty evidence", () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", null, "I am not sure");

    const result = classifyConceptEvidence(makeInput([trial], [prediction]));
    const entry = result.find((c) => c.conceptId === LINEAR_NONLINEAR);

    expect(entry?.status).toBe("uncertain");
    expect(entry?.evidenceIds).toEqual([]);
  });
});

describe("classifyConceptEvidence: ABSORBER_EFFECT", () => {
  function absorberScenario(predictionAnswer: string) {
    const first = makeTrial({
      id: "trial-a",
      parameters: {
        ...createDefaultParameters(),
        absorberPosition: 0.9,
        seed: 1,
      },
      snapshots: [snap(0, 3), snap(60, 6)],
      changedVariables: [],
    });
    const second = makeTrial({
      id: "trial-b",
      parameters: {
        ...createDefaultParameters(),
        absorberPosition: 0.3,
        seed: 2,
      },
      snapshots: [snap(0, 3), snap(60, 30)],
      changedVariables: ["absorberPosition"],
      startedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:03:00.000Z",
    });
    const prediction = makePrediction("trial-b", predictionAnswer);
    return makeInput([first, second], [prediction]);
  }

  it("supports a faster prediction after withdrawing the absorber", () => {
    const entry = classifyConceptEvidence(
      absorberScenario("slightly_faster"),
    ).find((c) => c.conceptId === ABSORBER_EFFECT);

    expect(entry?.status).toBe("supported");
    expect(entry?.evidenceIds).toEqual([
      "trial-a",
      "trial-b",
      "prediction-1",
    ]);
  });

  it("contradicts a slower prediction after withdrawing the absorber", () => {
    const entry = classifyConceptEvidence(
      absorberScenario("slower"),
    ).find((c) => c.conceptId === ABSORBER_EFFECT);

    expect(entry?.status).toBe("contradicted");
  });

  it("omits the concept when the absorber did not change", () => {
    const first = moderateTrial({ id: "trial-a", parameters: createDefaultParameters() });
    const second = moderateTrial({
      id: "trial-b",
      parameters: createDefaultParameters(),
    });
    const prediction = makePrediction("trial-b", "slightly_faster");

    const result = classifyConceptEvidence(
      makeInput([first, second], [prediction]),
    );

    expect(result.find((c) => c.conceptId === ABSORBER_EFFECT)).toBeUndefined();
  });
});

describe("classifyConceptEvidence: MULTIPLE_VARIABLE_CONFOUNDING", () => {
  it("reports partial when two variables changed in the latest trial", () => {
    const trial = moderateTrial({
      id: "trial-a",
      changedVariables: ["absorberPosition", "materialDensity"],
    });

    const entry = classifyConceptEvidence(makeInput([trial], [])).find(
      (c) => c.conceptId === CONFOUNDING,
    );

    expect(entry?.status).toBe("partial");
    expect(entry?.evidenceIds).toEqual(["trial-a"]);
  });

  it("reports contradicted when three or more variables changed", () => {
    const trial = moderateTrial({
      id: "trial-a",
      changedVariables: [
        "absorberPosition",
        "materialDensity",
        "startingNeutrons",
      ],
    });

    const entry = classifyConceptEvidence(makeInput([trial], [])).find(
      (c) => c.conceptId === CONFOUNDING,
    );

    expect(entry?.status).toBe("contradicted");
  });
});

describe("classifyConceptEvidence: RANDOM_EVENT_VS_SYSTEM_PATTERN", () => {
  it("reports partial when identical runs with different seeds share a shape", () => {
    const parameters = { ...createDefaultParameters(), seed: 1 };
    const first = makeTrial({
      id: "trial-a",
      parameters,
      snapshots: [snap(0, 3), snap(60, 9)],
    });
    const second = makeTrial({
      id: "trial-b",
      parameters: { ...parameters, seed: 2 },
      snapshots: [snap(0, 3), snap(60, 8)],
      startedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:03:00.000Z",
    });

    const entry = classifyConceptEvidence(makeInput([first, second], [])).find(
      (c) => c.conceptId === RANDOM_PATTERN,
    );

    expect(entry?.status).toBe("partial");
    expect(entry?.evidenceIds).toEqual(["trial-a", "trial-b"]);
  });

  it("omits the concept when no seed-varied pair exists", () => {
    const parameters = createDefaultParameters();
    const first = makeTrial({ id: "trial-a", parameters });
    const second = makeTrial({
      id: "trial-b",
      parameters,
      snapshots: [snap(0, 3), snap(60, 9)],
    });

    const result = classifyConceptEvidence(makeInput([first, second], []));

    expect(result.find((c) => c.conceptId === RANDOM_PATTERN)).toBeUndefined();
  });
});
