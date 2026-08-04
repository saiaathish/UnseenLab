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
 *
 * Reliability: transient failures (HTTP 429/502/503/504, network error, hard
 * timeout) are retried ONCE with jittered backoff. Non-transient failures
 * (invalid model output, other 4xx/5xx) are never retried. The hard timeout
 * is kept per attempt, so the worst case is bounded to
 * `timeoutMs * (maxRetries + 1) + backoff`.
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
  /**
   * How many times a transient failure is retried. Bounded: the default of 1
   * means at most 2 attempts per call. Pass 0 to disable retries.
   */
  maxRetries?: number;
}

export const DEFAULT_LLM_CONFIG: Omit<LlmClientConfig, "apiKey"> = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  timeoutMs: 15_000,
};

/** Default: retry once (2 attempts total). */
const DEFAULT_MAX_RETRIES = 1;
/** Jittered backoff base: 300ms ± 50% => 150–450ms between attempts. */
const RETRY_BACKOFF_BASE_MS = 300;

/** HTTP statuses treated as transient provider-side failures. */
const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

export type LlmClientResult =
  | { ok: true; data: LlmResponse }
  | { ok: false; reason: FallbackReason; status?: number };

export async function callLlmModel(
  payload: LlmRequestPayload,
  config: LlmClientConfig,
): Promise<LlmClientResult> {
  const maxAttempts = Math.max(
    1,
    (config.maxRetries ?? DEFAULT_MAX_RETRIES) + 1,
  );
  let lastResult: LlmClientResult = { ok: false, reason: "network_error" };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    lastResult = await attemptOnce(payload, config);
    if (lastResult.ok || !isTransientFailure(lastResult)) {
      return lastResult;
    }
    if (attempt < maxAttempts - 1) {
      // Safe telemetry: reason is a fixed enum code, never key/learner data.
      console.warn(
        `[llm] transient failure (${lastResult.reason}${lastResult.status !== undefined ? `, status ${lastResult.status}` : ""}), retrying (attempt ${attempt + 1}/${maxAttempts})`,
      );
      await backoff();
    }
  }
  return lastResult;
}

/** One bounded attempt: hard timeout, non-OK mapped to provider_error. */
async function attemptOnce(
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
      return {
        ok: false,
        reason: "provider_error",
        status: response.status,
      };
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
    // The only abort source here is our own hard-timeout timer (no caller
    // signal is plumbed through), so an AbortError IS a timeout: transient,
    // retried. There is no external abort path to accidentally retry.
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** 300ms base with ±50% jitter, so a fleet does not stampede in sync. */
function backoff(): Promise<void> {
  const delayMs = Math.round(RETRY_BACKOFF_BASE_MS * (0.5 + Math.random()));
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isTransientFailure(result: LlmClientResult): boolean {
  if (result.ok) return false;
  if (result.reason === "timeout" || result.reason === "network_error") {
    return true;
  }
  if (result.reason === "provider_error") {
    return (
      result.status !== undefined && TRANSIENT_STATUS_CODES.has(result.status)
    );
  }
  // invalid_response (bad schema/JSON) and other 4xx/5xx are NOT retried.
  return false;
}
