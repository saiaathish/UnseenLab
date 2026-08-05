import { NextResponse } from "next/server";
import { DEFAULT_LLM_CONFIG } from "@/adaptation/llm-client";
import { generationCircuitState } from "@/demonstrations/generation/model/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/demonstrations/health — lightweight connectivity probe for the
 * hosted demonstration-spec path, mirroring /api/adapt/health:
 *
 * - provider "offline"    — no LLM_API_KEY configured; the model path is
 *   disabled and generation always falls back to the deterministic offline
 *   layer.
 * - provider "unavailable" — key configured but the provider is unreachable,
 *   rate limited, or failing (3s timeout, HTTP 429/5xx, network error).
 * - provider "ok"          — the provider's models endpoint answered.
 *
 * ok is true exactly when provider === "ok" (the hosted model path is
 * usable right now). `circuit` reports the generation pipeline's cross-request
 * circuit breaker state. The API key is used only in the Authorization header
 * and is never returned or logged. No learner data is involved: this route
 * performs no generation work and takes no input.
 */
export async function GET(): Promise<NextResponse> {
  const circuit = generationCircuitState();
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, provider: "offline", circuit });
  }

  const baseUrl = process.env.LLM_API_BASE_URL ?? DEFAULT_LLM_CONFIG.baseUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (response.status === 429 || response.status >= 500) {
      return NextResponse.json({ ok: false, provider: "unavailable", circuit });
    }
    return NextResponse.json({ ok: true, provider: "ok", circuit });
  } catch {
    return NextResponse.json({ ok: false, provider: "unavailable", circuit });
  } finally {
    clearTimeout(timer);
  }
}
