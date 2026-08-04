import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import type { PredictionRecord } from "@/domain/evidence";
import type { TrialRecord } from "@/domain/experiments";
import { createDefaultPreferences } from "@/domain/learner";
import type { AdaptationInput } from "@/domain/adaptation";
import { StructuredLLMAdaptationProvider } from "@/adaptation/llm-provider";

const VALID_LLM_DATA = {
  misconception_id: "LINEAR_VS_NONLINEAR_GROWTH",
  confidence: 0.87,
  evidence: ["The prediction said a slight increase while the trial accelerated."],
  intervention: "compare_trials",
  reason: "A side-by-side comparison isolates the nonlinear response.",
  follow_up_question: "How did the growth rate change over successive steps?",
};

function cappedTrial(): TrialRecord {
  const run = runSimulation({
    absorberPosition: 0.05,
    absorptionProbability: 0.01,
    materialDensity: 1,
    durationSteps: 120,
    startingNeutrons: 10,
    seed: 42,
  });
  return run.trial;
}

function linkedPrediction(trial: TrialRecord): PredictionRecord {
  return {
    id: "prediction-1",
    trialId: trial.id,
    prompt: "What will happen to the reaction?",
    answer: "It gets slightly faster",
    structuredAnswer: "slightly_faster",
    confidence: 3,
    createdAt: "2026-01-01T00:00:30.000Z",
  };
}

function makeInput(): AdaptationInput {
  const trial = cappedTrial();
  const prediction = linkedPrediction(trial);
  return {
    preferences: createDefaultPreferences(),
    predictions: [prediction],
    trials: [trial],
    sessionEvidence: {
      predictions: [prediction],
      trials: [trial],
      representationEvents: [],
      adaptationProposals: [],
      conceptEvidence: [],
      counterfactuals: [],
    },
  };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

describe("StructuredLLMAdaptationProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a single llm proposal when the server responds with valid data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: VALID_LLM_DATA }));

    const trial = cappedTrial();
    const prediction = linkedPrediction(trial);
    const input: AdaptationInput = {
      preferences: createDefaultPreferences(),
      predictions: [prediction],
      trials: [trial],
      sessionEvidence: {
        predictions: [prediction],
        trials: [trial],
        representationEvents: [],
        adaptationProposals: [],
        conceptEvidence: [],
        counterfactuals: [],
      },
    };
    const provider = new StructuredLLMAdaptationProvider();
    const proposals = await provider.propose(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/adapt",
      expect.objectContaining({ method: "POST" }),
    );
    expect(proposals).toHaveLength(1);

    const proposal = proposals[0];
    expect(proposal.type).toBe("compare_trials");
    expect(proposal.source).toBe("llm");
    expect(proposal.followUpQuestion).toBe(
      "How did the growth rate change over successive steps?",
    );
    expect(proposal.decision).toBe("pending");
    expect(proposal.decidedAt).toBeNull();
    expect(proposal.proposedChanges).toEqual({});
    expect(proposal.evidenceIds.length).toBeGreaterThanOrEqual(1);
    expect(proposal.evidenceIds).toContain(prediction.id);
    expect(proposal.evidenceIds).toContain(trial.id);
  });

  it("falls back to deterministic rules on HTTP 500", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Response);

    const provider = new StructuredLLMAdaptationProvider();
    const proposals = await provider.propose(makeInput());

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every((p) => p.source === "rules")).toBe(true);
    expect(proposals.map((p) => p.type)).toEqual(
      expect.arrayContaining(["show_graph", "compare_trials", "reduce_density"]),
    );
  });

  it("falls back to deterministic rules when the body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    } as unknown as Response);

    const provider = new StructuredLLMAdaptationProvider();
    const proposals = await provider.propose(makeInput());

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every((p) => p.source === "rules")).toBe(true);
  });

  it("falls back to deterministic rules when the body has no data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    const provider = new StructuredLLMAdaptationProvider();
    const proposals = await provider.propose(makeInput());

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every((p) => p.source === "rules")).toBe(true);
  });

  it("falls back to deterministic rules when the server sets the fallback flag", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ fallback: true, data: VALID_LLM_DATA }),
    );

    const provider = new StructuredLLMAdaptationProvider();
    const proposals = await provider.propose(makeInput());

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every((p) => p.source === "rules")).toBe(true);
  });

  it("falls back to deterministic rules on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    const provider = new StructuredLLMAdaptationProvider();
    const proposals = await provider.propose(makeInput());

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every((p) => p.source === "rules")).toBe(true);
  });

  it("LLM path returns exactly one proposal while the fallback can return several", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: VALID_LLM_DATA }));

    const provider = new StructuredLLMAdaptationProvider();
    const llmProposals = await provider.propose(makeInput());
    expect(llmProposals).toHaveLength(1);
    expect(llmProposals[0].source).toBe("llm");

    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as unknown as Response);
    const fallbackProposals = await provider.propose(makeInput());
    expect(fallbackProposals.length).toBeGreaterThan(1);
    expect(fallbackProposals.every((p) => p.source === "rules")).toBe(true);
  });
});
