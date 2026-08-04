import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import type { PredictionRecord } from "@/domain/evidence";
import { ADAPTATION_PROPOSAL_TYPES } from "@/domain/evidence";
import type { TrialRecord } from "@/domain/experiments";
import { createDefaultPreferences } from "@/domain/learner";
import type { AdaptationInput } from "@/domain/adaptation";
import { MISCONCEPTION_IDS } from "@/adaptation/misconception-taxonomy";
import type { LlmRequestPayload } from "@/adaptation/llm-schema";
import { callLlmModel, type LlmClientConfig } from "@/adaptation/llm-client";
import { StructuredLLMAdaptationProvider } from "@/adaptation/llm-provider";
import { GET } from "@/app/api/adapt/health/route";

/**
 * Reliability tests for the bounded hosted-model path:
 * - llm-client: retry once on transient failures only (429/502/503/504,
 *   network error, hard timeout), with jittered backoff; never retry on
 *   invalid model output, other 4xx, or non-transient 5xx.
 * - llm-provider: per-session circuit breaker — 3 consecutive failures open
 *   the circuit for 30s (deterministic fallback, no network), half-open probe
 *   afterwards, success resets.
 * - /api/adapt/health: offline/degraded/available states without exposing
 *   the API key.
 */

const VALID_LLM_DATA = {
  misconception_id: "LINEAR_VS_NONLINEAR_GROWTH",
  confidence: 0.87,
  evidence: ["The prediction said a slight increase while the trial accelerated."],
  intervention: "compare_trials",
  reason: "A side-by-side comparison isolates the nonlinear response.",
  follow_up_question: "How did the growth rate change over successive steps?",
};

const VALID_CONTENT = JSON.stringify(VALID_LLM_DATA);

function chatCompletionJson(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

function llmPayload(): LlmRequestPayload {
  return {
    experiment: "nuclear_chain_reaction",
    learner_prediction: "It gets slightly faster",
    structured_answer: "slightly_faster",
    prediction_confidence: 3,
    prediction_id: "prediction-1",
    trial_summary: {
      trial_id: "trial-1",
      changed_variables: [],
      observed_growth_pattern: "accelerating (nonlinear growth)",
      final_free_neutrons: 500,
      final_reactions: 12,
      stopped_at_safety_ceiling: true,
      representations_used: ["animation"],
      replay_count: 1,
    },
    allowed_misconceptions: [...MISCONCEPTION_IDS],
    allowed_interventions: [...ADAPTATION_PROPOSAL_TYPES],
  };
}

function clientConfig(overrides: Partial<LlmClientConfig> = {}): LlmClientConfig {
  return {
    apiKey: "test-key",
    baseUrl: "https://llm.example.test/v1",
    model: "test-model",
    timeoutMs: 15_000,
    ...overrides,
  };
}

describe("callLlmModel retry behavior", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries once on a transient HTTP 503 then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(chatCompletionJson(VALID_CONTENT), { status: 200 }),
      );

    const pending = callLlmModel(llmPayload(), clientConfig());
    await vi.advanceTimersByTimeAsync(500); // covers jittered backoff max 450ms
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a network error then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(
        new Response(chatCompletionJson(VALID_CONTENT), { status: 200 }),
      );

    const pending = callLlmModel(llmPayload(), clientConfig());
    await vi.advanceTimersByTimeAsync(500);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a hard timeout then succeeds", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      attempts += 1;
      if (attempts === 1) {
        // First attempt hangs until the hard-timeout abort fires.
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        });
      }
      return Promise.resolve(
        new Response(chatCompletionJson(VALID_CONTENT), { status: 200 }),
      );
    });

    const pending = callLlmModel(llmPayload(), clientConfig({ timeoutMs: 15_000 }));
    await vi.advanceTimersByTimeAsync(16_000); // hard timeout fires
    await vi.advanceTimersByTimeAsync(500); // backoff
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a non-transient HTTP 400", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));

    const result = await callLlmModel(llmPayload(), clientConfig());

    expect(result).toEqual({
      ok: false,
      reason: "provider_error",
      status: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry on a non-transient HTTP 500", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));

    const result = await callLlmModel(llmPayload(), clientConfig());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("provider_error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry on invalid model output (schema violation)", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        chatCompletionJson('{"misconception_id": "NOT_A_REAL_CONCEPT"}'),
        { status: 200 },
      ),
    );

    const result = await callLlmModel(llmPayload(), clientConfig());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("StructuredLLMAdaptationProvider circuit breaker", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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

  it("opens the circuit after 3 failures, fast-fails without the network, probes half-open after 30s, and resets on success", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValue(new TypeError("Network request failed"));
      const provider = new StructuredLLMAdaptationProvider();

      for (let i = 0; i < 3; i++) {
        const proposals = await provider.propose(makeInput());
        expect(proposals.every((p) => p.source === "rules")).toBe(true);
      }
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Circuit is open: the next call must NOT touch the network.
      const fastFail = await provider.propose(makeInput());
      expect(fastFail.every((p) => p.source === "rules")).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Still inside the 30s open window.
      await vi.advanceTimersByTimeAsync(29_000);
      const stillOpen = await provider.propose(makeInput());
      expect(stillOpen.every((p) => p.source === "rules")).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Past the window: the next call is a half-open probe.
      await vi.advanceTimersByTimeAsync(2_000);
      fetchMock.mockResolvedValue(jsonResponse({ data: VALID_LLM_DATA }));
      const probe = await provider.propose(makeInput());
      expect(probe[0].source).toBe("llm");
      expect(fetchMock).toHaveBeenCalledTimes(4);

      // Success reset the circuit: a failure now is failure #1, not an open.
      fetchMock.mockRejectedValue(new TypeError("Network request failed"));
      const afterFailure = await provider.propose(makeInput());
      expect(afterFailure.every((p) => p.source === "rules")).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(5);

      // And the next call still goes to the network (circuit stayed closed).
      fetchMock.mockResolvedValue(jsonResponse({ data: VALID_LLM_DATA }));
      const next = await provider.propose(makeInput());
      expect(next[0].source).toBe("llm");
      expect(fetchMock).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reopens the circuit when a half-open probe fails", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValue(new TypeError("Network request failed"));
      const provider = new StructuredLLMAdaptationProvider();

      for (let i = 0; i < 3; i++) {
        await provider.propose(makeInput());
      }
      await vi.advanceTimersByTimeAsync(31_000); // window expires

      // Half-open probe fails -> circuit reopens for a fresh 30s.
      const probe = await provider.propose(makeInput());
      expect(probe.every((p) => p.source === "rules")).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      await vi.advanceTimersByTimeAsync(10_000);
      const withinNewWindow = await provider.propose(makeInput());
      expect(withinNewWindow.every((p) => p.source === "rules")).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(4); // no network while open
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GET /api/adapt/health", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it("reports offline when no API key is configured and never calls the network", async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ status: "offline" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports available when the provider responds", async () => {
    process.env.LLM_API_KEY = "test-key";
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await GET();
    expect(await response.json()).toEqual({ status: "available" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports degraded on HTTP 429", async () => {
    process.env.LLM_API_KEY = "test-key";
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));

    const response = await GET();
    expect(await response.json()).toEqual({ status: "degraded" });
  });

  it("reports degraded on HTTP 5xx", async () => {
    process.env.LLM_API_KEY = "test-key";
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));

    const response = await GET();
    expect(await response.json()).toEqual({ status: "degraded" });
  });

  it("reports degraded on a network error", async () => {
    process.env.LLM_API_KEY = "test-key";
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    const response = await GET();
    expect(await response.json()).toEqual({ status: "degraded" });
  });

  it("never includes the API key in the response body", async () => {
    process.env.LLM_API_KEY = "super-secret-key-value";
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await GET();
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("super-secret-key-value");
  });
});
