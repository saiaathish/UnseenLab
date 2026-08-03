import type { AdaptationInput, AdaptationProvider } from "@/domain/adaptation";
import type { AdaptationProposal } from "@/domain/evidence";
import type { TrialRecord } from "@/domain/experiments";
import {
  buildLlmRequest,
  interventionChanges,
  type LlmResponse,
} from "./llm-schema";
import { DeterministicAdaptationProvider } from "./deterministic-provider";

/**
 * Structured LLM adaptation provider. It POSTs a typed, bounded payload to the
 * server bridge (/api/adapt), which calls a hosted model and returns a typed,
 * schema-validated answer. On ANY failure (no key, timeout, invalid JSON,
 * schema violation, network error, model refusal) it delegates to the
 * deterministic offline rules. The model can only pick from allowed enums; it
 * can never change equations, parameters, or outcomes.
 *
 * The source of every proposal is recorded ("llm" vs "rules") and shown in
 * the UI, so the learner can always tell AI interpretation apart from the
 * simulation result.
 */
export class StructuredLLMAdaptationProvider implements AdaptationProvider {
  private readonly fallback: AdaptationProvider;

  constructor(fallback: AdaptationProvider = new DeterministicAdaptationProvider()) {
    this.fallback = fallback;
  }

  async propose(input: AdaptationInput): Promise<AdaptationProposal[]> {
    const answer = await this.requestInterpretation(input);
    if (!answer) {
      return this.fallback.propose(input);
    }

    const trialId = input.trials.length > 0
      ? input.trials[input.trials.length - 1].id
      : null;
    const evidenceIds = [
      ...(answer.predictionId ? [answer.predictionId] : []),
      ...(trialId ? [trialId] : []),
    ];

    const proposal: AdaptationProposal = {
      id: crypto.randomUUID(),
      type: answer.intervention,
      reason: answer.reason,
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : [trialId ?? "session"],
      proposedChanges: interventionChanges(
        answer.intervention,
        input.preferences,
      ),
      decision: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
      source: "llm",
      followUpQuestion: answer.follow_up_question,
    };
    return [proposal];
  }

  private async requestInterpretation(
    input: AdaptationInput,
  ): Promise<(LlmResponse & { predictionId: string | null }) | null> {
    const payload = buildLlmRequest(input);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const response = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, request: payload }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) return null;
      const body = (await response.json()) as {
        data?: LlmResponse;
        fallback?: boolean;
      };
      if (body.fallback || !body.data) return null;
      return { ...body.data, predictionId: payload.prediction_id };
    } catch {
      return null;
    }
  }
}

/**
 * Factory used by the UI. The LLM path is only enabled at build time via
 * NEXT_PUBLIC_LLM_ENABLED=1 (plus a server-side LLM_API_KEY). Without it, the
 * app is fully offline and uses the deterministic rules only.
 */
export function createAdaptationProvider(): AdaptationProvider {
  if (process.env.NEXT_PUBLIC_LLM_ENABLED === "1") {
    return new StructuredLLMAdaptationProvider(
      new DeterministicAdaptationProvider(),
    );
  }
  return new DeterministicAdaptationProvider();
}
