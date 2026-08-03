import { NextResponse } from "next/server";
import {
  buildLlmRequest,
  type LlmRequestPayload,
} from "@/adaptation/llm-schema";
import {
  callLlmModel,
  DEFAULT_LLM_CONFIG,
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
 * bounded schema, and returns either { data } or { fallback: true }. It never
 * exposes the key and never returns raw model text.
 */

const inputSchema = z.object({
  preferences: learnerPreferencesSchema,
  predictions: z.array(predictionRecordSchema),
  trials: z.array(trialRecordSchema),
  sessionEvidence: sessionEvidenceSchema,
});

export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ fallback: true });
  }

  let input: AdaptationInput;
  try {
    const raw = (await request.json()) as unknown;
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ fallback: true });
    }
    input = parsed.data as unknown as AdaptationInput;
  } catch {
    return NextResponse.json({ fallback: true });
  }

  const payload: LlmRequestPayload = buildLlmRequest(input);
  const answer = await callLlmModel(payload, {
    apiKey,
    baseUrl: process.env.LLM_API_BASE_URL ?? DEFAULT_LLM_CONFIG.baseUrl,
    model: process.env.LLM_MODEL ?? DEFAULT_LLM_CONFIG.model,
    timeoutMs: DEFAULT_LLM_CONFIG.timeoutMs,
  });

  if (!answer) {
    return NextResponse.json({ fallback: true });
  }
  return NextResponse.json({ data: answer });
}
