import type { AdaptationInput, AdaptationProvider } from "@/domain/adaptation";
import type { AdaptationProposal } from "@/domain/evidence";
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
 * Reliability: a per-provider circuit breaker (one provider instance lives
 * per page session) skips the network after 3 consecutive failures and falls
 * straight back to the deterministic rules for 30s, then allows a half-open
 * probe. A successful probe closes the circuit and resets the counter, so a
 * flaky hosted model can never stall the learner's session.
 *
 * The source of every proposal is recorded ("llm" vs "rules") and shown in
 * the UI, so the learner can always tell AI interpretation apart from the
 * simulation result.
 */
export class StructuredLLMAdaptationProvider implements AdaptationProvider {
  private readonly fallback: AdaptationProvider;

  /** Consecutive LLM-path failures; resets to 0 on success. */
  private consecutiveFailures = 0;
  /** When the circuit opened (ms epoch), or null when closed. */
  private circuitOpenedAt: number | null = null;

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

    // Circuit breaker: after 3 consecutive failures, skip the network and use
    // the offline rules for 30s. The first request after the window is a
    // half-open probe; it reopens the circuit on failure or closes it on
    // success. All state is per-provider (per page session), never shared.
    if (this.isCircuitOpen()) {
      // Safe telemetry: `circuit_open` is a fixed code, never key/learner data.
      console.warn(
        "[adapt] LLM unavailable (circuit_open), using offline rules",
      );
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let failed = false;
    try {
      const response = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, request: payload }),
        signal: controller.signal,
      });
      if (!response.ok) {
        failed = true;
        return null;
      }
      const body = (await response.json()) as {
        data?: LlmResponse;
        fallback?: boolean;
        reason?: string;
      };
      if (body.fallback || !body.data) {
        // Safe telemetry: `reason` is a fixed enum code, never key/learner data.
        if (body.reason) {
          console.warn(
            `[adapt] LLM unavailable (${body.reason}), using offline rules`,
          );
        }
        failed = true;
        return null;
      }
      this.recordSuccess();
      return { ...body.data, predictionId: payload.prediction_id };
    } catch (error) {
      // Safe telemetry: `reason` is a fixed enum code, never key/learner data.
      const reason =
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "network_error";
      console.warn(
        `[adapt] LLM unavailable (${reason}), using offline rules`,
      );
      failed = true;
      return null;
    } finally {
      clearTimeout(timer);
      if (failed) {
        this.recordFailure();
      }
    }
  }

  private isCircuitOpen(): boolean {
    if (this.circuitOpenedAt === null) return false;
    return Date.now() - this.circuitOpenedAt < 30_000;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = null;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 3 || this.circuitOpenedAt !== null) {
      // Either the 3rd consecutive failure, or a failed half-open probe:
      // both (re)open the circuit for a fresh 30s window.
      this.circuitOpenedAt = Date.now();
      this.consecutiveFailures = 0;
      console.warn(
        "[adapt] LLM circuit opened (3 consecutive failures), using offline rules for 30s",
      );
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
