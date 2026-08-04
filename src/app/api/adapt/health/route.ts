import { NextResponse } from "next/server";
import { DEFAULT_LLM_CONFIG } from "@/adaptation/llm-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight connectivity probe for the hosted-model path. It answers
 * `{ status: "available" | "degraded" | "offline" }`:
 * - "offline"  — no LLM_API_KEY configured; the model path is disabled.
 * - "degraded" — key configured but the provider is unreachable or rate
 *                limited (3s timeout, HTTP 429/5xx, network error).
 * - "available" — the provider's models endpoint answered.
 *
 * The API key is used only in the Authorization header and is never returned,
 * logged, or embedded in the response. No learner data is involved: this
 * route performs no adaptation work and takes no input.
 */
export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ status: "offline" });
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
      return NextResponse.json({ status: "degraded" });
    }
    return NextResponse.json({ status: "available" });
  } catch {
    return NextResponse.json({ status: "degraded" });
  } finally {
    clearTimeout(timer);
  }
}
