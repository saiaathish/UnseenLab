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
 * The route is intentionally unauthenticated (guest-first: signed-out
 * learners use the hosted model too), so it is hardened by bounds instead:
 * a body-size cap, bounded arrays/strings, and a per-IP rate limit — a
 * live paid key must not be burnable by a hostile caller.
 *
 * Telemetry: on every outcome the route logs one safe line (model, outcome,
 * reason, elapsed ms). No key, no payload, no learner data, no raw model
 * text — so logs can never leak anything sensitive.
 */

// Bounded route-local schema: the shared domain schemas stay permissive so
// localStorage round-trips never reject, but the paid model call only ever
// sees bounded input.
const MAX_PREDICTIONS = 50;
const MAX_TRIALS = 100;
const MAX_FIELD_CHARS = 4000;
const MAX_BODY_BYTES = 256 * 1024;

const inputSchema = z.object({
  preferences: learnerPreferencesSchema,
  predictions: z
    .array(
      predictionRecordSchema.extend({
        prompt: z.string().max(MAX_FIELD_CHARS),
        answer: z.string().max(MAX_FIELD_CHARS),
      })
    )
    .max(MAX_PREDICTIONS),
  trials: z.array(trialRecordSchema).max(MAX_TRIALS),
  sessionEvidence: sessionEvidenceSchema,
});

/**
 * Bounded in-memory per-IP rate limit: 100 calls per 5 minutes. Honest
 * limitation: per server instance, not global — documented in
 * docs/security.md. A real learner runs at most one adaptation per trial
 * (~2.5s+ each), so this is far above legitimate use.
 */
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 100;
const calls = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string | null): boolean {
  if (!ip) return false;
  const now = Date.now();
  const entry = calls.get(ip);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= RATE_LIMIT_MAX;
}

function recordCall(ip: string | null) {
  if (!ip) return;
  const now = Date.now();
  const entry = calls.get(ip);
  if (!entry || entry.resetAt <= now) {
    calls.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")
  );
}

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

  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    // A real status code: the client treats non-ok as null and falls back
    // to the deterministic provider.
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  recordCall(ip);

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    raw = JSON.parse(text);
  } catch {
    console.warn("[adapt] llm_fallback", {
      reason: "invalid_input",
      elapsedMs: Date.now() - startedAt,
    });
    return fallback("invalid_input");
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[adapt] llm_fallback", {
      reason: "invalid_input",
      elapsedMs: Date.now() - startedAt,
    });
    return fallback("invalid_input");
  }
  const input = parsed.data as unknown as AdaptationInput;

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
