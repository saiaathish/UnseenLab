import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import { createDefaultPreferences } from "@/domain/learner";
import type { PredictionRecord, SessionEvidence } from "@/domain/evidence";
import type { TrialRecord } from "@/domain/experiments";
import { POST } from "@/app/api/adapt/route";

/**
 * Guard tests for the /api/adapt bridge: body-size cap, bounded arrays, and
 * the per-IP rate limit. The route is intentionally unauthenticated
 * (guest-first), so these bounds are the cost-control; the model is never
 * called in any of these tests (each guard fires before `callLlmModel`).
 */

function validBody(predictionCount: number): {
  preferences: ReturnType<typeof createDefaultPreferences>;
  predictions: PredictionRecord[];
  trials: TrialRecord[];
  sessionEvidence: SessionEvidence;
} {
  const run = runSimulation({
    absorberPosition: 0.05,
    absorptionProbability: 0.01,
    materialDensity: 1,
    durationSteps: 120,
    startingNeutrons: 10,
    seed: 42,
  });
  const trial: TrialRecord = {
    ...run.trial,
    changedVariables: ["absorberPosition"],
  };
  const predictions: PredictionRecord[] = Array.from(
    { length: predictionCount },
    (_, index) => ({
      id: `prediction-${index}`,
      trialId: trial.id,
      prompt: "What will happen to the reaction?",
      answer: "It gets slightly faster",
      structuredAnswer: "slightly_faster",
      confidence: 3,
      createdAt: "2026-01-01T00:00:30.000Z",
    })
  );
  return {
    preferences: createDefaultPreferences(),
    predictions,
    trials: [trial],
    sessionEvidence: {
      predictions,
      trials: [trial],
      representationEvents: [],
      adaptationProposals: [],
      conceptEvidence: [],
      counterfactuals: [],
    },
  };
}

function post(body: unknown, ip = "127.0.0.1"): Promise<Response> {
  return POST(
    new Request("http://localhost:3100/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("POST /api/adapt guards", () => {
  beforeEach(() => {
    process.env.LLM_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.LLM_API_KEY;
  });

  it("falls back without a key (never calls the model)", async () => {
    delete process.env.LLM_API_KEY;
    const response = await post(validBody(1));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      fallback: true,
      reason: "no_api_key",
    });
  });

  it("rejects a body over the 256KB cap with 413", async () => {
    const body = validBody(1);
    body.predictions[0].answer = "x".repeat(300 * 1024);
    const response = await post(body);
    expect(response.status).toBe(413);
  });

  it("rejects more than 50 predictions as invalid input (no model call)", async () => {
    const response = await post(validBody(51));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      fallback: true,
      reason: "invalid_input",
    });
  });

  it("rejects free-text fields over 4000 chars as invalid input", async () => {
    const body = validBody(1);
    body.predictions[0].answer = "y".repeat(4001);
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      fallback: true,
      reason: "invalid_input",
    });
  });

  it("rate-limits a single IP after 100 calls (429), other IPs unaffected", async () => {
    // Build once: the simulation + schema parse is the slow part, and the
    // guard fires before any model call.
    const body = validBody(1);
    let last: Response | null = null;
    for (let index = 0; index < 101; index += 1) {
      last = await post(body, "203.0.113.9");
    }
    expect(last?.status).toBe(429);

    const other = await post(body, "203.0.113.10");
    expect(other.status).not.toBe(429);
  }, 15_000);

  it("rejects malformed JSON as invalid input", async () => {
    const response = await post("{not json", "203.0.113.11");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      fallback: true,
      reason: "invalid_input",
    });
  });
});
