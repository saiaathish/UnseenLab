import { describe, expect, it } from "vitest";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import type {
  PredictionRecord,
  RepresentationEvent,
  SessionEvidence,
} from "@/domain/evidence";
import type { ExperimentParameters, TrialRecord } from "@/domain/experiments";
import { createDefaultPreferences } from "@/domain/learner";
import type { LearnerPreferences } from "@/domain/learner";
import type { AdaptationInput } from "@/domain/adaptation";
import {
  buildLlmRequest,
  buildSystemPrompt,
  buildUserPrompt,
  interventionChanges,
  parseLlmResponse,
} from "@/adaptation/llm-schema";
import type { LlmResponse } from "@/adaptation/llm-schema";

function cappedTrial(overrides: Partial<TrialRecord> = {}): TrialRecord {
  const run = runSimulation({
    absorberPosition: 0.05,
    absorptionProbability: 0.01,
    materialDensity: 1,
    durationSteps: 120,
    startingNeutrons: 10,
    seed: 42,
  });
  return {
    ...run.trial,
    changedVariables: ["absorberPosition", "absorptionProbability"],
    ...overrides,
  };
}

function trial(parameters: ExperimentParameters): TrialRecord {
  return {
    id: crypto.randomUUID(),
    parameters,
    snapshots: [],
    changedVariables: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
  };
}

function prediction(trialId: string, overrides: Partial<PredictionRecord> = {}): PredictionRecord {
  return {
    id: "prediction-1",
    trialId,
    prompt: "What will happen to the reaction?",
    answer: "It gets slightly faster",
    structuredAnswer: "slightly_faster",
    confidence: 3,
    createdAt: "2026-01-01T00:00:30.000Z",
    ...overrides,
  };
}

function makeInput(
  trials: TrialRecord[],
  predictions: PredictionRecord[],
  representationEvents: RepresentationEvent[] = [],
): AdaptationInput {
  const sessionEvidence: SessionEvidence = {
    predictions,
    trials,
    representationEvents,
    adaptationProposals: [],
    conceptEvidence: [],
    counterfactuals: [],
  };
  return {
    preferences: createDefaultPreferences(),
    predictions,
    trials,
    sessionEvidence,
  };
}

describe("buildLlmRequest", () => {
  it("builds the bounded payload for the capped trial", () => {
    const t = cappedTrial();
    const p = prediction(t.id);
    const events: RepresentationEvent[] = [
      { mode: "animation", openedAt: "2026-01-01T00:00:10.000Z" },
      { mode: "graph", openedAt: "2026-01-01T00:00:50.000Z" },
    ];

    const payload = buildLlmRequest(makeInput([t], [p], events));

    expect(payload.experiment).toBe("nuclear_chain_reaction");
    expect(payload.learner_prediction).toBe(p.answer);
    expect(payload.structured_answer).toBe(p.structuredAnswer);
    expect(payload.prediction_confidence).toBe(p.confidence);
    expect(payload.prediction_id).toBe(p.id);
    expect(payload.trial_summary.trial_id).toBe(t.id);
    expect(payload.trial_summary.changed_variables).toEqual([
      "absorberPosition",
      "absorptionProbability",
    ]);
    expect(payload.trial_summary.observed_growth_pattern).toBe(
      "accelerating (nonlinear growth)",
    );
    expect(payload.trial_summary.final_free_neutrons).toBe(500);
    expect(payload.trial_summary.stopped_at_safety_ceiling).toBe(true);
    expect(payload.trial_summary.representations_used).toEqual([
      "animation",
      "graph",
    ]);
    expect(payload.allowed_misconceptions).toContain("LINEAR_VS_NONLINEAR_GROWTH");
    expect(payload.allowed_interventions).toContain("compare_trials");
  });

  it("uses the latest prediction linked to the latest trial", () => {
    const t = cappedTrial();
    const earlier = prediction(t.id, {
      id: "prediction-early",
      createdAt: "2026-01-01T00:00:20.000Z",
      structuredAnswer: "slower",
    });
    const latestPrediction = prediction(t.id, {
      id: "prediction-late",
      createdAt: "2026-01-01T00:00:40.000Z",
      structuredAnswer: "much_faster_nonlinear",
    });

    const payload = buildLlmRequest(
      makeInput([t], [earlier, latestPrediction]),
    );

    expect(payload.prediction_id).toBe("prediction-late");
    expect(payload.structured_answer).toBe("much_faster_nonlinear");
  });

  it("reports a moderate growth pattern for a gentle run", () => {
    const t = trial({
      absorberPosition: 0.9,
      startingNeutrons: 3,
      materialDensity: 0.9,
      absorptionProbability: 0.25,
      durationSteps: 60,
      seed: 7,
    });

    const payload = buildLlmRequest(makeInput([t], []));

    expect(payload.trial_summary.observed_growth_pattern).toBe("moderate growth");
    expect(payload.trial_summary.stopped_at_safety_ceiling).toBe(false);
  });

  it("counts replay runs by identical seed and absorber position", () => {
    const parameters: ExperimentParameters = {
      absorberPosition: 0.05,
      startingNeutrons: 10,
      materialDensity: 1,
      absorptionProbability: 0.01,
      durationSteps: 120,
      seed: 42,
    };
    const replayA = trial({ ...parameters });
    const replayB = trial({ ...parameters });
    const replayC = trial({ ...parameters });
    const differentSeed = trial({ ...parameters, seed: 99 });
    const differentAbsorber = trial({ ...parameters, absorberPosition: 0.5 });

    const payload = buildLlmRequest(
      makeInput(
        [differentSeed, differentAbsorber, replayA, replayB, replayC],
        [],
      ),
    );

    expect(payload.trial_summary.replay_count).toBe(3);
  });

  it("handles an empty session without throwing", () => {
    const payload = buildLlmRequest(makeInput([], []));

    expect(payload.trial_summary.trial_id).toBeNull();
    expect(payload.prediction_id).toBeNull();
    expect(payload.trial_summary.changed_variables).toEqual([]);
    expect(payload.trial_summary.final_free_neutrons).toBe(0);
    expect(payload.trial_summary.replay_count).toBe(0);
  });
});

describe("buildSystemPrompt / buildUserPrompt", () => {
  it("bans intervention switching inside the system prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("choose ONE");
    expect(prompt).toContain("valid JSON");
    expect(prompt).not.toContain("destroy_reactor");
  });

  it("embeds the typed payload as data in the user prompt", () => {
    const t = cappedTrial();
    const payload = buildLlmRequest(makeInput([t], []));
    const prompt = buildUserPrompt(payload);
    expect(prompt).toContain("nuclear_chain_reaction");
    expect(prompt).toContain(JSON.stringify(payload, null, 2));
  });
});

describe("parseLlmResponse", () => {
  const valid: LlmResponse = {
    misconception_id: "LINEAR_VS_NONLINEAR_GROWTH",
    confidence: 0.87,
    evidence: ["The prediction said a slight increase while the trial accelerated."],
    intervention: "compare_trials",
    reason: "A side-by-side comparison isolates the nonlinear response.",
    follow_up_question: "How did the growth rate change over successive steps?",
  };

  it("parses plain JSON", () => {
    expect(parseLlmResponse(JSON.stringify(valid))).toEqual(valid);
  });

  it("parses JSON wrapped in ```json fences", () => {
    const raw = "```json\n" + JSON.stringify(valid, null, 2) + "\n```";
    expect(parseLlmResponse(raw)).toEqual(valid);
  });

  it("parses JSON wrapped in plain ``` fences", () => {
    const raw = "```\n" + JSON.stringify(valid) + "\n```";
    expect(parseLlmResponse(raw)).toEqual(valid);
  });

  it("accepts a null follow_up_question", () => {
    expect(
      parseLlmResponse(JSON.stringify({ ...valid, follow_up_question: null })),
    ).toEqual({ ...valid, follow_up_question: null });
  });

  it("returns null for garbage text", () => {
    expect(parseLlmResponse("definitely not JSON")).toBeNull();
  });

  it("returns null for empty / undefined / null input", () => {
    expect(parseLlmResponse("")).toBeNull();
    expect(parseLlmResponse(null)).toBeNull();
    expect(parseLlmResponse(undefined)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const missingEvidence = { ...valid };
    delete (missingEvidence as { evidence?: string[] }).evidence;
    expect(parseLlmResponse(JSON.stringify(missingEvidence))).toBeNull();
    expect(parseLlmResponse(JSON.stringify({ ...valid, reason: undefined }))).toBeNull();
    expect(parseLlmResponse(JSON.stringify({ ...valid, intervention: undefined }))).toBeNull();
  });

  it("rejects a non-enum misconception id", () => {
    expect(
      parseLlmResponse(JSON.stringify({ ...valid, misconception_id: "ATOMIC_PHYSICS" })),
    ).toBeNull();
  });

  it("rejects a non-enum intervention (prompt-injection guard)", () => {
    expect(
      parseLlmResponse(JSON.stringify({ ...valid, intervention: "change_parameters" })),
    ).toBeNull();
    expect(
      parseLlmResponse(JSON.stringify({ ...valid, intervention: "destroy_reactor" })),
    ).toBeNull();
  });

  it("rejects out-of-range confidence values", () => {
    expect(
      parseLlmResponse(JSON.stringify({ ...valid, confidence: 2.0 })),
    ).toBeNull();
    expect(
      parseLlmResponse(JSON.stringify({ ...valid, confidence: -0.1 })),
    ).toBeNull();
  });

  it("accepts confidence 0.87", () => {
    expect(parseLlmResponse(JSON.stringify(valid))?.confidence).toBe(0.87);
  });

  it("returns null when the only JSON is embedded inside prose", () => {
    const raw = "Here is my answer: " + JSON.stringify(valid);
    expect(parseLlmResponse(raw)).toBeNull();
  });
});

describe("interventionChanges", () => {
  it("freeze_variables enables oneVariableMode", () => {
    expect(
      interventionChanges("freeze_variables", createDefaultPreferences()),
    ).toEqual({ oneVariableMode: true });
  });

  it("slow_animation halves the animation speed", () => {
    expect(
      interventionChanges("slow_animation", createDefaultPreferences()),
    ).toEqual({ animationSpeed: 0.5 });
  });

  it("reduce_density lowers the information density", () => {
    expect(
      interventionChanges("reduce_density", createDefaultPreferences()),
    ).toEqual({ informationDensity: "low" });
  });

  it("show_graph adds graph to preferred representations, deduped", () => {
    const preferences = createDefaultPreferences();
    expect(
      interventionChanges("show_graph", preferences),
    ).toEqual({ preferredRepresentations: ["animation", "graph"] });

    const alreadyGraph: LearnerPreferences = {
      ...preferences,
      preferredRepresentations: ["graph", "animation"],
    };
    expect(interventionChanges("show_graph", alreadyGraph)).toEqual({
      preferredRepresentations: ["graph", "animation"],
    });
  });

  it("show_causal_view adds causal to preferred representations", () => {
    const preferences = createDefaultPreferences();
    expect(
      interventionChanges("show_causal_view", preferences),
    ).toEqual({ preferredRepresentations: ["animation", "causal"] });
  });

  it("compare_trials and ask_prediction_again change nothing", () => {
    const preferences = createDefaultPreferences();
    expect(interventionChanges("compare_trials", preferences)).toEqual({});
    expect(interventionChanges("ask_prediction_again", preferences)).toEqual({});
  });
});
