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

export interface LlmClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export const DEFAULT_LLM_CONFIG: Omit<LlmClientConfig, "apiKey"> = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  timeoutMs: 15_000,
};

export async function callLlmModel(
  payload: LlmRequestPayload,
  config: LlmClientConfig,
): Promise<LlmResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        // Disable chain-of-thought reasoning: this task needs only a bounded
        // JSON answer. Skipping it keeps latency low and avoids aborting on
        // the timeout, since reasoning models (e.g. deepseek) otherwise burn
        // tokens in `reasoning_content` before emitting the final answer.
        thinking: { type: "disabled" },
        max_tokens: 400,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(payload) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content ?? null;
    return parseLlmResponse(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
