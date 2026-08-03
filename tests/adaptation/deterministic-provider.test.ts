import { describe, expect, it } from "vitest";
import { createDefaultParameters } from "@/domain/experiments";
import { MAX_POPULATION } from "@/domain/experiments";
import type {
  SimulationSnapshot,
  TrialRecord,
} from "@/domain/experiments";
import type {
  AdaptationProposal,
  PredictionRecord,
  SessionEvidence,
} from "@/domain/evidence";
import { createDefaultPreferences } from "@/domain/learner";
import type { LearnerPreferences } from "@/domain/learner";
import { applyProposedChanges } from "@/domain/adaptation";
import type { AdaptationInput } from "@/domain/adaptation";
import { DeterministicAdaptationProvider } from "@/adaptation/deterministic-provider";
import { classifyConceptEvidence } from "@/adaptation/misconception-taxonomy";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";

const provider = new DeterministicAdaptationProvider();

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
): PredictionRecord {
  return {
    id: "prediction-1",
    trialId,
    prompt: "What will happen to the reaction?",
    answer: structuredAnswer ?? "",
    structuredAnswer,
    confidence: 3,
    createdAt: "2026-01-01T00:00:30.000Z",
  };
}

function makeInput(
  trials: TrialRecord[],
  predictions: PredictionRecord[],
  overrides: Partial<{
    preferences: Partial<LearnerPreferences>;
    sessionEvidence: Partial<SessionEvidence>;
  }> = {},
): AdaptationInput {
  return {
    preferences: {
      ...createDefaultPreferences(),
      ...overrides.preferences,
    },
    predictions,
    trials,
    sessionEvidence: {
      predictions,
      trials,
      representationEvents: [],
      adaptationProposals: [],
      conceptEvidence: [],
      counterfactuals: [],
      ...overrides.sessionEvidence,
    },
  };
}

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

function typesOf(proposals: AdaptationProposal[]): string[] {
  return proposals.map((p) => p.type);
}

describe("DeterministicAdaptationProvider", () => {
  it("proposes freeze_variables when the latest trial changed two variables", async () => {
    const trial = moderateTrial({
      id: "trial-a",
      changedVariables: ["absorberPosition", "materialDensity"],
    });
    const prediction = makePrediction("trial-a", "slightly_faster");

    const proposals = await provider.propose(
      makeInput([trial], [prediction], {
        preferences: { oneVariableMode: false },
      }),
    );
    const freeze = proposals.find((p) => p.type === "freeze_variables");

    expect(freeze).toBeDefined();
    expect(freeze?.evidenceIds).toContain("trial-a");
    expect(freeze?.decision).toBe("pending");
    expect(freeze?.decidedAt).toBeNull();
    expect(freeze?.proposedChanges).toEqual({ oneVariableMode: true });
    for (const proposal of proposals) {
      expect(proposal.evidenceIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("skips freeze_variables when oneVariableMode is already enabled", async () => {
    const trial = moderateTrial({
      id: "trial-a",
      changedVariables: ["absorberPosition", "materialDensity"],
    });

    const proposals = await provider.propose(
      makeInput([trial], [], { preferences: { oneVariableMode: true } }),
    );

    expect(typesOf(proposals)).not.toContain("freeze_variables");
  });

  it("proposes show_graph when a contradicted prediction has no graph opened", async () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", "slightly_faster");

    const proposals = await provider.propose(makeInput([trial], [prediction]));
    const showGraph = proposals.find((p) => p.type === "show_graph");

    expect(showGraph).toBeDefined();
    expect(showGraph?.evidenceIds).toEqual(["prediction-1", "trial-a"]);
    expect(showGraph?.proposedChanges).toEqual({
      preferredRepresentations: ["animation", "graph"],
    });
  });

  it("skips show_graph when a graph was opened after the trial started", async () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", "slightly_faster");

    const proposals = await provider.propose(
      makeInput([trial], [prediction], {
        sessionEvidence: {
          representationEvents: [
            { mode: "graph", openedAt: "2026-01-01T00:00:40.000Z" },
          ],
        },
      }),
    );

    expect(typesOf(proposals)).not.toContain("show_graph");
  });

  it("proposes slow_animation for a replayed trial pattern", async () => {
    const parameters = createDefaultParameters();
    const first = makeTrial({ id: "trial-a", parameters });
    const second = makeTrial({
      id: "trial-b",
      parameters,
      startedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:03:00.000Z",
    });

    const proposals = await provider.propose(makeInput([first, second], []));
    const slow = proposals.find((p) => p.type === "slow_animation");

    expect(slow).toBeDefined();
    expect(slow?.proposedChanges).toEqual({ animationSpeed: 0.5 });
    expect(slow?.evidenceIds).toEqual(["trial-a", "trial-b"]);
  });

  it("never proposes slow_animation when reduced motion is enabled", async () => {
    const parameters = createDefaultParameters();
    const first = makeTrial({ id: "trial-a", parameters });
    const second = makeTrial({
      id: "trial-b",
      parameters,
      startedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:03:00.000Z",
    });

    const proposals = await provider.propose(
      makeInput([first, second], [], { preferences: { reducedMotion: true } }),
    );

    expect(typesOf(proposals)).not.toContain("slow_animation");
  });

  it("never re-proposes a previously rejected type", async () => {
    const trial = moderateTrial({
      id: "trial-a",
      changedVariables: ["absorberPosition", "materialDensity"],
    });
    const prediction = makePrediction("trial-a", "slightly_faster");
    const baseInput = makeInput([trial], [prediction], {
      preferences: { oneVariableMode: false },
    });

    const firstRound = await provider.propose(baseInput);
    const freeze = firstRound.find((p) => p.type === "freeze_variables");
    expect(freeze).toBeDefined();

    const rejectedEvidence: SessionEvidence = {
      predictions: [prediction],
      trials: [trial],
      representationEvents: [],
      adaptationProposals: [{ ...freeze!, decision: "rejected" }],
      conceptEvidence: [],
      counterfactuals: [],
    };
    const secondRound = await provider.propose({
      ...baseInput,
      sessionEvidence: rejectedEvidence,
    });

    expect(typesOf(secondRound)).not.toContain("freeze_variables");
  });

  it("proposes ask_prediction_again when the latest trial has no prediction", async () => {
    const trial = moderateTrial({ id: "trial-a" });

    const proposals = await provider.propose(makeInput([trial], []));
    const askAgain = proposals.find((p) => p.type === "ask_prediction_again");

    expect(askAgain).toBeDefined();
    expect(askAgain?.proposedChanges).toEqual({});
    expect(askAgain?.evidenceIds).toEqual(["trial-a"]);
  });

  it("proposes reduce_density when the run hit the population ceiling", async () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", "slightly_faster");

    const proposals = await provider.propose(makeInput([trial], [prediction]));
    const reduce = proposals.find((p) => p.type === "reduce_density");

    expect(reduce).toBeDefined();
    expect(reduce?.proposedChanges).toEqual({ informationDensity: "low" });
  });

  it("skips reduce_density after a proposal was accepted", async () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", "slightly_faster");

    const proposals = await provider.propose(
      makeInput([trial], [prediction], {
        sessionEvidence: {
          adaptationProposals: [
            {
              id: "accepted-1",
              type: "slow_animation",
              reason: "accepted",
              evidenceIds: ["trial-a"],
              proposedChanges: { animationSpeed: 0.5 },
              decision: "accepted",
              createdAt: "2026-01-01T00:00:00.000Z",
              decidedAt: "2026-01-01T00:00:10.000Z",
              source: "rules",
              followUpQuestion: null,
            },
          ],
        },
      }),
    );

    expect(typesOf(proposals)).not.toContain("reduce_density");
  });

  it("proposes show_causal_view when the absorber changed and causal was never opened", async () => {
    const first = makeTrial({
      id: "trial-a",
      parameters: { ...createDefaultParameters(), absorberPosition: 0.9 },
      snapshots: [snap(0, 3), snap(60, 6)],
    });
    const second = makeTrial({
      id: "trial-b",
      parameters: { ...createDefaultParameters(), absorberPosition: 0.4 },
      snapshots: [snap(0, 3), snap(60, 20)],
      changedVariables: ["absorberPosition"],
      startedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:03:00.000Z",
    });

    const proposals = await provider.propose(makeInput([first, second], []));
    const causal = proposals.find((p) => p.type === "show_causal_view");

    expect(causal).toBeDefined();
    expect(causal?.evidenceIds).toEqual(["trial-a", "trial-b"]);
    expect(causal?.proposedChanges).toEqual({
      preferredRepresentations: ["animation", "causal"],
    });
  });

  it("deduplicates preferred representations in proposals", async () => {
    const trial = nonlinearTrial({ id: "trial-a" });
    const prediction = makePrediction("trial-a", "slightly_faster");

    const proposals = await provider.propose(
      makeInput([trial], [prediction], {
        preferences: { preferredRepresentations: ["graph", "animation"] },
      }),
    );
    const showGraph = proposals.find((p) => p.type === "show_graph");

    expect(showGraph?.proposedChanges).toEqual({
      preferredRepresentations: ["graph", "animation"],
    });
  });

  it("caps at 3 proposals even when many rules fire", async () => {
    const first = makeTrial({
      id: "trial-a",
      parameters: { ...createDefaultParameters(), absorberPosition: 0.9, seed: 1 },
      snapshots: [snap(0, 3), snap(60, 6)],
    });
    const replay = makeTrial({
      id: "trial-b",
      parameters: { ...createDefaultParameters(), absorberPosition: 0.9, seed: 1 },
      snapshots: [snap(0, 3), snap(60, 6)],
      startedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:03:00.000Z",
    });
    const latest = nonlinearTrial({
      id: "trial-c",
      parameters: { ...createDefaultParameters(), absorberPosition: 0.5, seed: 2 },
      changedVariables: ["absorberPosition", "materialDensity"],
      startedAt: "2026-01-01T00:04:00.000Z",
      completedAt: "2026-01-01T00:05:00.000Z",
    });
    const prediction = makePrediction("trial-c", "slightly_faster");

    const proposals = await provider.propose(
      makeInput([first, replay, latest], [prediction], {
        preferences: { oneVariableMode: false },
      }),
    );

    expect(proposals.length).toBeLessThanOrEqual(3);
    expect(proposals.map((p) => p.evidenceIds.length).every((n) => n >= 1)).toBe(
      true,
    );
    // Rules fire in fixed order, so the first three are the first three rules.
    expect(proposals[0].type).toBe("freeze_variables");
    expect(proposals[1].type).toBe("show_graph");
    expect(proposals[2].type).toBe("compare_trials");
  });

  it("is deterministic: same input yields the same proposal types in the same order", async () => {
    const first = makeTrial({
      id: "trial-a",
      parameters: { ...createDefaultParameters(), absorberPosition: 0.9, seed: 1 },
      snapshots: [snap(0, 3), snap(60, 6)],
    });
    const latest = nonlinearTrial({
      id: "trial-c",
      parameters: { ...createDefaultParameters(), absorberPosition: 0.5, seed: 2 },
      changedVariables: ["absorberPosition", "materialDensity"],
      startedAt: "2026-01-01T00:04:00.000Z",
      completedAt: "2026-01-01T00:05:00.000Z",
    });
    const prediction = makePrediction("trial-c", "slightly_faster");

    const input = makeInput([first, latest], [prediction]);
    const firstRun = typesOf(await provider.propose(input));
    const secondRun = typesOf(await provider.propose(input));

    expect(secondRun).toEqual(firstRun);
  });

  it("returns no proposals when no rule fires", async () => {
    const trial = moderateTrial({
      id: "trial-a",
      parameters: createDefaultParameters(),
    });
    const prediction = makePrediction("trial-a", "stays_the_same");

    const proposals = await provider.propose(makeInput([trial], [prediction]));

    expect(proposals).toEqual([]);
  });

  it("applies oneVariableMode through applyProposedChanges", async () => {
    const preferences = createDefaultPreferences();
    const applied = applyProposedChanges(preferences, {
      oneVariableMode: true,
    });
    expect(applied.oneVariableMode).toBe(true);

    const proposal = {
      id: "p-1",
      type: "freeze_variables" as const,
      reason: "freeze",
      evidenceIds: ["trial-a"],
      proposedChanges: { oneVariableMode: true },
      decision: "pending" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      decidedAt: null,
    };
    const withChanges = applyProposedChanges(preferences, proposal.proposedChanges);
    expect(withChanges.oneVariableMode).toBe(true);
  });

  it("a correct prediction does not trigger misconception-based proposals", async () => {
    // A capped run with a "much faster than before" prediction: the learner
    // got it right, so show_graph / compare_trials (which both require a
    // CONTRADICTED linear-vs-nonlinear classification) must NOT fire. Only
    // reduce_density may fire — it needs the cap, not a wrong prediction.
    const trial = runSimulation({
      ...createDefaultParameters(),
      seed: 42,
      absorberPosition: 0.2,
      startingNeutrons: 10,
      materialDensity: 1,
      absorptionProbability: 0.01,
      durationSteps: 120,
    }).trial;
    const prediction = {
      ...makePrediction(trial.id, "much_faster_nonlinear"),
      confidence: 4,
    };
    const input = makeInput([trial], [prediction]);

    const proposals = await provider.propose(input);

    expect(typesOf(proposals)).not.toContain("show_graph");
    expect(typesOf(proposals)).not.toContain("compare_trials");
    expect(typesOf(proposals)).toContain("reduce_density");

    const linearNonlinear = classifyConceptEvidence(input).find(
      (concept) => concept.conceptId === "LINEAR_VS_NONLINEAR_GROWTH",
    );
    expect(linearNonlinear?.status).toBe("supported");
  });
});
