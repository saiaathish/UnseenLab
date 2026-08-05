import { NextResponse } from "next/server";
import { z } from "zod";
import { learnerPreferencesSchema } from "@/domain/learner";
import {
  generateDemo,
  type GenerateDemoResult,
} from "@/demonstrations/generation/model/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/demonstrations/generate — server bridge for the hosted
 * demonstration-spec model, mirroring the /api/adapt hardening pattern.
 *
 * The route is intentionally unauthenticated (guest-first), so it is bounded
 * instead: a 64 KB body cap, a strict input schema, and a per-IP rate limit
 * (30 per 5 minutes — generation is heavier than adaptation).
 *
 * Outcomes:
 * - 200 { data: { outcome: "spec" | "clarify" | "unsafe" | "unsupported",
 *   spec?, question?, reason?, source? } } — success envelope.
 * - 200 { fallback: true, reason } — the model failed AND the deterministic
 *   offline generation also failed (defensive; the offline layer is total).
 * - 400 { error: "invalid_input" }, 413 { error: "too_large" },
 *   429 { error: "rate_limited" } — hard errors.
 *
 * The API key lives only in the pipeline's model config (LLM_API_KEY) and is
 * never returned or logged. No learner text is ever logged.
 */

const MAX_BODY_BYTES = 64 * 1024;
const MAX_QUERY_CHARS = 500;

/** Strict input schema: unknown keys rejected at both levels. */
const generateInputSchema = z
  .object({
    query: z.string().min(1).max(MAX_QUERY_CHARS),
    preferences: learnerPreferencesSchema.strict().optional(),
  })
  .strict();

/**
 * Bounded in-memory per-IP rate limit: 30 calls per 5 minutes. Honest
 * limitation: per server instance, not global. Generation is model-heavy
 * (one call can be ~15s+), so this is far above legitimate use.
 */
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
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

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();

  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    console.warn("[generate] rejected", {
      error: "rate_limited",
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  recordCall(ip);

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      console.warn("[generate] rejected", {
        error: "too_large",
        elapsedMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    raw = JSON.parse(text);
  } catch {
    console.warn("[generate] rejected", {
      error: "invalid_input",
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const parsed = generateInputSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[generate] rejected", {
      error: "invalid_input",
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const result: GenerateDemoResult = await generateDemo(
    parsed.data.query,
    parsed.data.preferences,
  );

  if ("data" in result) {
    console.info("[generate] completed", {
      outcome: result.data.outcome,
      source: result.data.source,
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json({ data: result.data });
  }

  console.warn("[generate] completed", {
    outcome: "fallback",
    reason: result.reason,
    elapsedMs: Date.now() - startedAt,
  });
  return NextResponse.json({ fallback: true, reason: result.reason });
}
