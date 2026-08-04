import {
  buildSystemPrompt,
  buildUserPrompt,
  parseLlmResponse,
  type LlmRequestPayload,
  type LlmResponse,
} from "./llm-schema";

/**
 * Thin, server-only OpenAI-compatible chat completion client. Every failure —
 * missing key, network error, timeout, non-200, invalid JSON, schema
 * violation — resolves to null so the caller can fall back to the
 * deterministic rules. This module never sees or returns the API key.
 */

/**
 * Why the LLM path failed. Returned to the caller so the route can report
 * safe telemetry (never the key, never raw model text, never learner data).
 */
export type FallbackReason =
  | "no_api_key"
  | "invalid_input"
  | "provider_error"
  | "timeout"
  | "network_error"
  | "invalid_response";

export interface LlmClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /**
   * When true, send `thinking: { type: "disabled" }` to suppress chain-of-
   * thought. Only providers that support this field should opt in (via
   * LLM_DISABLE_THINKING); standard OpenAI endpoints reject unknown params,
   * so this is off by default.
   */
  disableThinking?: boolean;
}

export const DEFAULT_LLM_CONFIG: Omit<LlmClientConfig, "apiKey"> = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  timeoutMs: 15_000,
};

export type LlmClientResult =
  | { ok: true; data: LlmResponse }
  | { ok: false; reason: FallbackReason };

export async function callLlmModel(
  payload: LlmRequestPayload,
  config: LlmClientConfig,
): Promise<LlmClientResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      // Lowest randomness supported by the OpenAI-compatible endpoints in
      // use, so identical trials yield near-identical interpretations. The
      // interpretation is bounded anyway: output is schema-validated and can
      // never change simulation values.
      temperature: 0,
      max_tokens: 400,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(payload) },
      ],
    };
    if (config.disableThinking) {
      body.thinking = { type: "disabled" };
    }
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: "provider_error" };
    }
    const parsed = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = parsed.choices?.[0]?.message?.content ?? null;
    const data = parseLlmResponse(content);
    if (!data) {
      return { ok: false, reason: "invalid_response" };
    }
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
