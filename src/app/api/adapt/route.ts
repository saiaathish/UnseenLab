import { NextResponse } from "next/server";
import {
  buildLlmRequest,
  type LlmRequestPayload,
} from "@/adaptation/llm-schema";
import {
  callLlmModel,
  DEFAULT_LLM_CONFIG,
  type FallbackReason,
} from "@/adaptation/llm-client";
import { z } from "zod";
import type { AdaptationInput } from "@/domain/adaptation";
import { learnerPreferencesSchema } from "@/domain/learner";
import { trialRecordSchema } from "@/domain/experiments";
import {
  predictionRecordSchema,
  sessionEvidenceSchema,
} from "@/domain/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side bridge for the structured LLM adaptation provider. The API key
 * lives only here (LLM_API_KEY). The route validates its input, calls the
 * model with a hard timeout, validates the typed JSON answer against the
 * bounded schema, and returns either { data } or { fallback: true, reason }.
 * It never exposes the key and never returns raw model text.
 *
 * Telemetry: on every outcome the route logs one safe line (model, outcome,
 * reason, elapsed ms). No key, no payload, no learner data, no raw model
 * text — so logs can never leak anything sensitive.
 */

const inputSchema = z.object({
  preferences: learnerPreferencesSchema,
  predictions: z.array(predictionRecordSchema),
  trials: z.array(trialRecordSchema),
  sessionEvidence: sessionEvidenceSchema,
});

function fallback(reason: FallbackReason): NextResponse {
  return NextResponse.json({ fallback: true, reason });
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.warn("[adapt] llm_fallback", {
      reason: "no_api_key",
      elapsedMs: Date.now() - startedAt,
    });
    return fallback("no_api_key");
  }

  let input: AdaptationInput;
  try {
    const raw = (await request.json()) as unknown;
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[adapt] llm_fallback", {
        reason: "invalid_input",
        elapsedMs: Date.now() - startedAt,
      });
      return fallback("invalid_input");
    }
    input = parsed.data as unknown as AdaptationInput;
  } catch {
    console.warn("[adapt] llm_fallback", {
      reason: "invalid_input",
      elapsedMs: Date.now() - startedAt,
    });
    return fallback("invalid_input");
  }

  const payload: LlmRequestPayload = buildLlmRequest(input);
  const model = process.env.LLM_MODEL ?? DEFAULT_LLM_CONFIG.model;
  const result = await callLlmModel(payload, {
    apiKey,
    baseUrl: process.env.LLM_API_BASE_URL ?? DEFAULT_LLM_CONFIG.baseUrl,
    model,
    timeoutMs: DEFAULT_LLM_CONFIG.timeoutMs,
    disableThinking: process.env.LLM_DISABLE_THINKING === "1",
  });

  if (!result.ok) {
    console.warn("[adapt] llm_fallback", {
      reason: result.reason,
      model,
      elapsedMs: Date.now() - startedAt,
    });
    return fallback(result.reason);
  }

  console.info("[adapt] llm_success", {
    model,
    elapsedMs: Date.now() - startedAt,
  });
  return NextResponse.json({ data: result.data });
}
