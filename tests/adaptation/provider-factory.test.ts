import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import type { PredictionRecord } from "@/domain/evidence";
import type { TrialRecord } from "@/domain/experiments";
import { createDefaultPreferences } from "@/domain/learner";
import type { AdaptationInput } from "@/domain/adaptation";
import { createAdaptationProvider } from "@/adaptation/llm-provider";

const VALID_LLM_DATA = {
  misconception_id: "LINEAR_VS_NONLINEAR_GROWTH",
  confidence: 0.87,
  evidence: ["The prediction said a slight increase while the trial accelerated."],
  intervention: "compare_trials",
  reason: "A side-by-side comparison isolates the nonlinear response.",
  follow_up_question: "How did the growth rate change over successive steps?",
};

function fallbackInput(): AdaptationInput {
  const run = runSimulation({
    absorberPosition: 0.05,
    absorptionProbability: 0.01,
    materialDensity: 1,
    durationSteps: 120,
    startingNeutrons: 10,
    seed: 42,
  });
  const trial: TrialRecord = run.trial;
  const prediction: PredictionRecord = {
    id: "prediction-1",
    trialId: trial.id,
    prompt: "What will happen to the reaction?",
    answer: "It gets slightly faster",
    structuredAnswer: "slightly_faster",
    confidence: 3,
    createdAt: "2026-01-01T00:00:30.000Z",
  };
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

describe("createAdaptationProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_LLM_ENABLED;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_LLM_ENABLED;
    vi.unstubAllGlobals();
  });

  it("returns the deterministic provider when LLM is not enabled", async () => {
    const provider = createAdaptationProvider();
    const proposals = await provider.propose(fallbackInput());

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every((p) => p.source === "rules")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an llm provider when NEXT_PUBLIC_LLM_ENABLED=1 and the server answers", async () => {
    process.env.NEXT_PUBLIC_LLM_ENABLED = "1";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: VALID_LLM_DATA }),
    } as unknown as Response);

    const provider = createAdaptationProvider();
    const proposals = await provider.propose(fallbackInput());

    expect(proposals).toHaveLength(1);
    expect(proposals[0].source).toBe("llm");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to rules when the llm server requests fallback", async () => {
    process.env.NEXT_PUBLIC_LLM_ENABLED = "1";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ fallback: true }),
    } as unknown as Response);

    const provider = createAdaptationProvider();
    const proposals = await provider.propose(fallbackInput());

    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every((p) => p.source === "rules")).toBe(true);
  });
});
