/**
 * model/pipeline.ts — hosted-model demonstration generation pipeline.
 *
 * generateDemo(query, prefs) orchestrates the full path:
 *
 *   a. intent first: interpret() decides unsafe / clarify / unsupported
 *      deterministically — those outcomes never touch the model.
 *   b. no LLM_API_KEY -> deterministic offline generation (source "offline",
 *      reason "no_api_key").
 *   c. model path: build the bounded system prompt -> request the spec ->
 *      parse strict JSON -> first-pass gate (model/schema.ts) -> full
 *      repair-aware validator (sanitizeDemoSpec, which also runs the science
 *      policy). Valid -> source "model". Repaired -> source "model" with the
 *      repair codes attached. Rejected -> ONE bounded repair retry with a
 *      repair directive; still rejected -> offline fallback, reason
 *      "schema_rejected".
 *   d. model failure (timeout / network / provider error / invalid JSON) ->
 *      offline fallback, reason passed through. Invalid output is never
 *      retried.
 *
 * Reliability notes (verified against src/adaptation/llm-client.ts):
 *   - llm-client HAS a retry (maxRetries default 1, transient only) — but it
 *     is hard-wired to the adaptation schema: it builds its own system prompt
 *     from llm-schema's buildSystemPrompt() and parses the answer against the
 *     adaptation response schema, so it cannot carry the generation prompt or
 *     return a DemoSpecV1. The generation path therefore uses its own small
 *     bounded requester (requestModelSpec) that mirrors the client's exact
 *     reliability policy: one transient retry (429/502/503/504, network
 *     error, hard timeout) with jittered backoff; never retry invalid output.
 *   - Cross-request circuit breaker (module-level, mirroring the adaptation
 *     provider's design): 3 consecutive model-path failures open the circuit
 *     for 30s; calls fast-fail to the offline path without touching the
 *     network; after the window a half-open probe is allowed; success resets.
 *   - In-flight dedup: identical (normalized query, preferences) concurrently
 *     share one promise, so duplicate submissions cannot burn two model calls.
 *
 * Telemetry: one safe line per attempt — { outcome, source, reason, model,
 * elapsedMs }. No key, no payload, no learner text, no raw model output.
 */

import {
  createDefaultPreferences,
  type LearnerPreferences,
} from "@/domain/learner";
import {
  ENGINE_CATALOG,
  type DemoSpecV1,
  type EngineCapability,
  type TrustLevel,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import {
  DEFAULT_LLM_CONFIG,
  type FallbackReason,
} from "@/adaptation/llm-client";
import {
  interpret,
  type InterpretResult,
} from "@/demonstrations/generation/intent/route";
import { normalizeQuery } from "@/demonstrations/generation/intent/normalize";
import type { IntentSpec } from "@/demonstrations/generation/intent/types";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { hashString } from "@/demonstrations/generation/offline/engine-builder";
import { sanitizeDemoSpec } from "@/demonstrations/validation";
import { buildGenerationPrompt } from "./prompt";
import { firstPassModelCheck } from "./schema";

// ---------------------------------------------------------------------------
// Public result types (mirror the API envelope)
// ---------------------------------------------------------------------------

export type GenerationData =
  | {
      outcome: "spec";
      spec: DemoSpecV1;
      source: "model" | "offline";
      /** Safe codes only: offline fallback reason, or repair codes. */
      reason?: string;
    }
  | { outcome: "clarify"; question: string; source: "offline" }
  | { outcome: "unsafe"; reason: string; source: "offline" }
  | { outcome: "unsupported"; reason: string; source: "offline" };

export type GenerateDemoResult =
  | { data: GenerationData }
  | { fallback: true; reason: FallbackReason | "schema_rejected" };

// ---------------------------------------------------------------------------
// Bounded model request (generation-specific; mirrors llm-client's policy)
// ---------------------------------------------------------------------------

export interface GenerationModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  disableThinking?: boolean;
}

/** Generation-specific failure reasons: FallbackReason plus empty_response
 * (a 200 whose content was consumed by reasoning). */
type ModelRequestReason = FallbackReason | "empty_response";

type ModelRequestResult =
  | { ok: true; content: string }
  | { ok: false; reason: ModelRequestReason; status?: number };

/** HTTP statuses treated as transient provider-side failures. */
const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);
/** One transient retry (2 attempts total), mirroring llm-client's default. */
const MAX_ATTEMPTS = 2;
/** Jittered backoff base: 300ms ± 50% => 150–450ms between attempts. */
const RETRY_BACKOFF_BASE_MS = 300;
/**
 * Token budget: a full DemoSpecV1 is far larger than an adaptation answer,
 * and reasoning models (deepseek-v4-flash) spend tokens on thinking before
 * emitting the spec. 3000 tokens was consumed entirely by reasoning, yielding
 * empty content; 12000 leaves room for the ~2-4k-token spec. Still bounded:
 * a single generation can never exceed this budget.
 */
const MAX_OUTPUT_TOKENS = 12000;
/**
 * Generation timeout per attempt: reasoning + a full spec regularly takes
 * 20-40s, far beyond the 15s adaptation timeout. Bounded at 90s per attempt
 * (2 attempts max => ~180s worst case, then honest offline fallback).
 */
const GENERATION_TIMEOUT_MS = 90_000;

function isTransientFailure(result: ModelRequestResult): boolean {
  if (result.ok) return false;
  if (
    result.reason === "timeout" ||
    result.reason === "network_error" ||
    // A 200 with empty content means the model spent its whole budget on
    // reasoning; a retry gives it a fresh chance within the same bound.
    result.reason === "empty_response"
  ) {
    return true;
  }
  if (result.reason === "provider_error") {
    return (
      result.status !== undefined && TRANSIENT_STATUS_CODES.has(result.status)
    );
  }
  // invalid_response is never retried.
  return false;
}

function backoff(): Promise<void> {
  const delayMs = Math.round(RETRY_BACKOFF_BASE_MS * (0.5 + Math.random()));
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/** One bounded attempt: hard timeout, raw text returned unparsed. */
async function attemptModelOnce(
  systemPrompt: string,
  userMessage: string,
  config: GenerationModelConfig,
): Promise<ModelRequestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
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
      return { ok: false, reason: "provider_error", status: response.status };
    }
    const parsed = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = parsed.choices?.[0]?.message?.content ?? null;
    if (content === null || content.trim().length === 0) {
      // A 200 with empty content: the reasoning model spent its whole token
      // budget on thinking. Retryable once (isTransientFailure).
      return { ok: false, reason: "empty_response" };
    }
    return { ok: true, content };
  } catch (error) {
    // The only abort source is our own hard-timeout timer. Name-based check:
    // DOMException is not instanceof Error in some environments (jsdom).
    if (
      error !== null &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
    ) {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded request with one transient retry; never retries invalid output. */
async function requestModelSpec(
  systemPrompt: string,
  userMessage: string,
  config: GenerationModelConfig,
): Promise<ModelRequestResult> {
  let lastResult: ModelRequestResult = { ok: false, reason: "network_error" };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    lastResult = await attemptModelOnce(systemPrompt, userMessage, config);
    if (lastResult.ok || !isTransientFailure(lastResult)) {
      return lastResult;
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      // Safe telemetry: fixed enum codes only.
      console.warn(
        `[generation] transient model failure (${lastResult.reason}${lastResult.status !== undefined ? `, status ${lastResult.status}` : ""}), retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
      );
      await backoff();
    }
  }
  return lastResult;
}

/** Tolerates markdown fences; returns null for anything unparseable. */
function parseModelJson(content: string): unknown | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cross-request circuit breaker (module-level, mirrors the adaptation
// provider's design: 3 consecutive failures -> 30s open window -> half-open
// probe)
// ---------------------------------------------------------------------------

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;

interface CircuitState {
  failures: number;
  openUntilMs: number;
}

let circuit: CircuitState = { failures: 0, openUntilMs: 0 };

function circuitOpen(): boolean {
  const now = Date.now();
  if (circuit.openUntilMs !== 0 && now >= circuit.openUntilMs) {
    // Window expired: allow a half-open probe.
    circuit = { failures: 0, openUntilMs: 0 };
  }
  return circuit.failures >= CIRCUIT_FAILURE_THRESHOLD && circuit.openUntilMs !== 0;
}

function recordModelFailure(): void {
  circuit.failures += 1;
  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.openUntilMs = Date.now() + CIRCUIT_OPEN_MS;
  }
}

function recordModelSuccess(): void {
  circuit = { failures: 0, openUntilMs: 0 };
}

/** Observable circuit state for the health route. */
export function generationCircuitState(): {
  state: "open" | "closed";
  failures: number;
} {
  const now = Date.now();
  const open =
    circuit.failures >= CIRCUIT_FAILURE_THRESHOLD &&
    circuit.openUntilMs > now;
  return { state: open ? "open" : "closed", failures: circuit.failures };
}

/** Test/hot-reload utility: clears circuit state. */
export function resetGenerationCircuit(): void {
  circuit = { failures: 0, openUntilMs: 0 };
}

// ---------------------------------------------------------------------------
// In-flight dedup
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<GenerateDemoResult>>();

function dedupKey(query: string, prefs: LearnerPreferences): string {
  return String(
    hashString(`${normalizeQuery(query)}\u0000${JSON.stringify(prefs)}`),
  );
}

// ---------------------------------------------------------------------------
// Offline fallback
// ---------------------------------------------------------------------------

function offlineSpec(
  query: string,
  prefs: LearnerPreferences,
  reason: string,
): GenerateDemoResult {
  const offline = generateOfflineDemo(query, prefs);
  switch (offline.status) {
    case "spec":
      if (offline.spec) {
        return {
          data: { outcome: "spec", spec: offline.spec, source: "offline", reason },
        };
      }
      // Unreachable (interpret above returned an IntentSpec), defensive only.
      return { fallback: true, reason: "invalid_response" };
    case "clarify":
      return {
        data: {
          outcome: "clarify",
          question: offline.question ?? "",
          source: "offline",
        },
      };
    case "unsafe":
      return {
        data: {
          outcome: "unsafe",
          reason: offline.reason ?? "That request is outside what I can help with.",
          source: "offline",
        },
      };
    case "unsupported":
      return {
        data: {
          outcome: "unsupported",
          reason:
            offline.reason ?? "I don't have a demonstration for that topic yet.",
          source: "offline",
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Intent + model orchestration
// ---------------------------------------------------------------------------

function narrowCatalog(intent: IntentSpec): Partial<Record<VerifiedEngineId, EngineCapability>> {
  const catalog: Partial<Record<VerifiedEngineId, EngineCapability>> = {};
  for (const id of intent.candidate_engine_ids) {
    catalog[id] = ENGINE_CATALOG[id];
  }
  return catalog;
}

/** The user message: the normalized query + the structured preference subset.
 * No other learner free-text ever reaches the model. */
function buildUserMessage(
  normalizedQuery: string,
  prefs: LearnerPreferences,
): string {
  return JSON.stringify({
    query: normalizedQuery,
    preferences: {
      reducedMotion: prefs.reducedMotion,
      oneVariableMode: prefs.oneVariableMode,
      preferredRepresentations: prefs.preferredRepresentations,
    },
  });
}

type ModelRoundResult =
  | { kind: "spec"; spec: DemoSpecV1; repairedReasons: string[] }
  | { kind: "rejected"; reasons: string[] }
  | { kind: "transport_failure"; reason: ModelRequestReason };

/** One full model round: request -> parse -> first pass -> full validation.
 * Logs one safe line for the attempt. */
async function runModelRound(
  systemPrompt: string,
  userMessage: string,
  config: GenerationModelConfig,
  startedAt: number,
): Promise<ModelRoundResult> {
  const request = await requestModelSpec(systemPrompt, userMessage, config);
  if (!request.ok) {
    console.warn("[generation] model_failed", {
      outcome: "model_failed",
      source: "offline",
      reason: request.reason,
      model: config.model,
      elapsedMs: Date.now() - startedAt,
    });
    return { kind: "transport_failure", reason: request.reason };
  }

  const parsed = parseModelJson(request.content);
  if (parsed === null) {
    console.warn("[generation] model_failed", {
      outcome: "model_failed",
      source: "offline",
      reason: "invalid_response",
      model: config.model,
      elapsedMs: Date.now() - startedAt,
    });
    return { kind: "transport_failure", reason: "invalid_response" };
  }

  const gate = firstPassModelCheck(parsed);
  if (!gate.ok) {
    console.warn("[generation] model_attempt", {
      outcome: "rejected",
      source: "model",
      reason: gate.reasons.join(","),
      model: config.model,
      elapsedMs: Date.now() - startedAt,
    });
    return { kind: "rejected", reasons: gate.reasons };
  }

  const outcome = sanitizeDemoSpec(gate.value);
  if (outcome.status === "rejected" || outcome.status === "fallback") {
    console.warn("[generation] model_attempt", {
      outcome: "rejected",
      source: "model",
      reason: outcome.reasons.join(","),
      model: config.model,
      elapsedMs: Date.now() - startedAt,
    });
    return { kind: "rejected", reasons: outcome.reasons };
  }
  if (outcome.spec === undefined) {
    // Defensive: valid/repaired always carry a spec by contract.
    return { kind: "rejected", reasons: outcome.reasons };
  }

  // First-pass repairs (e.g. stripped model correctIndex) are folded into the
  // sanitizer's reasons so the source label and repair trail stay truthful.
  const repairedReasons = [
    ...new Set([...(gate.repairs ?? []), ...outcome.reasons]),
  ];

  console.info("[generation] model_attempt", {
    outcome: repairedReasons.length > 0 ? "repaired" : "valid",
    source: "model",
    reason: repairedReasons.length > 0 ? repairedReasons.join(",") : undefined,
    model: config.model,
    elapsedMs: Date.now() - startedAt,
  });
  return {
    kind: "spec",
    spec: outcome.spec,
    repairedReasons,
  };
}

const TRUST_RANK: Record<TrustLevel, number> = {
  explanatory_animation: 1,
  conceptual_demonstration: 2,
  verified_simulation: 3,
};

/**
 * The model may never escalate a topic beyond the trust level the intent
 * layer routed it to (mitosis must not become a "verified" orbits
 * simulation), and verified topics must stay inside the routed engine
 * candidates. Violations are rejected and fall back to the offline path —
 * the intent's deterministic routing is the ceiling, not a suggestion.
 */
function specMatchesIntent(spec: DemoSpecV1, intent: IntentSpec): boolean {
  if (
    TRUST_RANK[spec.trust.level] > TRUST_RANK[intent.candidate_trust_level]
  ) {
    return false;
  }
  if (intent.candidate_trust_level === "verified_simulation") {
    if (spec.trust.level !== "verified_simulation" || !spec.simulation) {
      return false;
    }
    if (
      intent.candidate_engine_ids.length > 0 &&
      !intent.candidate_engine_ids.includes(spec.simulation.engineId)
    ) {
      return false;
    }
  }
  return true;
}

function modelSpecData(
  round: Extract<ModelRoundResult, { kind: "spec" }>,
): GenerationData {
  return {
    outcome: "spec",
    spec: round.spec,
    source: "model",
    reason:
      round.repairedReasons.length > 0
        ? round.repairedReasons.join(",")
        : undefined,
  };
}

async function runGeneration(
  query: string,
  prefs: LearnerPreferences,
): Promise<GenerateDemoResult> {
  const startedAt = Date.now();

  // a. Intent first: deterministic safety/ambiguity decisions, no model call.
  const intentResult: InterpretResult = interpret(query, prefs);
  if ("status" in intentResult) {
    if (intentResult.status === "unsafe") {
      console.info("[generation] result", {
        outcome: "unsafe",
        source: "offline",
        elapsedMs: Date.now() - startedAt,
      });
      return {
        data: {
          outcome: "unsafe",
          reason:
            intentResult.reason ??
            "That request is outside what I can help with.",
          source: "offline",
        },
      };
    }
    if (intentResult.status === "clarify") {
      console.info("[generation] result", {
        outcome: "clarify",
        source: "offline",
        elapsedMs: Date.now() - startedAt,
      });
      return {
        data: {
          outcome: "clarify",
          question: intentResult.question,
          source: "offline",
        },
      };
    }
    console.info("[generation] result", {
      outcome: "unsupported",
      source: "offline",
      elapsedMs: Date.now() - startedAt,
    });
    return {
      data: {
        outcome: "unsupported",
        reason:
          intentResult.reason ??
          "I don't have a demonstration for that topic yet.",
        source: "offline",
      },
    };
  }
  const intent: IntentSpec = intentResult;

  // b. No hosted key: deterministic offline generation.
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.warn("[generation] result", {
      outcome: "spec",
      source: "offline",
      reason: "no_api_key",
      elapsedMs: Date.now() - startedAt,
    });
    return offlineSpec(query, prefs, "no_api_key");
  }

  // Circuit: after repeated failures, fast-fail to offline without the network.
  if (circuitOpen()) {
    console.warn("[generation] result", {
      outcome: "spec",
      source: "offline",
      reason: "provider_error",
      elapsedMs: Date.now() - startedAt,
    });
    return offlineSpec(query, prefs, "provider_error");
  }

  const model = process.env.LLM_MODEL ?? DEFAULT_LLM_CONFIG.model;
  const config: GenerationModelConfig = {
    apiKey,
    baseUrl: process.env.LLM_API_BASE_URL ?? DEFAULT_LLM_CONFIG.baseUrl,
    model,
    timeoutMs: GENERATION_TIMEOUT_MS,
    disableThinking: process.env.LLM_DISABLE_THINKING === "1",
  };
  const normalized = normalizeQuery(query);
  const systemPrompt = buildGenerationPrompt(
    normalized,
    prefs,
    narrowCatalog(intent),
  );
  const userMessage = buildUserMessage(normalized, prefs);

  // c. First model attempt.
  const attempt1 = await runModelRound(systemPrompt, userMessage, config, startedAt);
  if (attempt1.kind === "spec") {
    if (!specMatchesIntent(attempt1.spec, intent)) {
      recordModelFailure();
      return offlineSpec(query, prefs, "trust_mismatch");
    }
    recordModelSuccess();
    return { data: modelSpecData(attempt1) };
  }
  if (attempt1.kind === "transport_failure") {
    recordModelFailure();
    return offlineSpec(query, prefs, attempt1.reason);
  }

  // Rejected: ONE bounded repair retry with a safe repair directive.
  const repairDirective = `Your previous response was rejected (safe codes: ${attempt1.reasons.join(", ")}). Fix every violation and resend ONE complete corrected spec.`;
  const attempt2 = await runModelRound(
    systemPrompt,
    `${userMessage}\n\n${repairDirective}`,
    config,
    startedAt,
  );
  if (attempt2.kind === "spec") {
    if (!specMatchesIntent(attempt2.spec, intent)) {
      recordModelFailure();
      return offlineSpec(query, prefs, "trust_mismatch");
    }
    recordModelSuccess();
    return { data: modelSpecData(attempt2) };
  }
  if (attempt2.kind === "transport_failure") {
    recordModelFailure();
    return offlineSpec(query, prefs, attempt2.reason);
  }

  // Still rejected: never retry schema-rejected output more than once.
  recordModelFailure();
  return offlineSpec(query, prefs, "schema_rejected");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate a demonstration for a learner query.
 *
 * Concurrent identical requests (same normalized query and preferences)
 * coalesce into a single model call: the second caller receives the same
 * promise as the first.
 */
export async function generateDemo(
  query: string,
  prefs?: LearnerPreferences,
): Promise<GenerateDemoResult> {
  const preferences = prefs ?? createDefaultPreferences();
  const key = dedupKey(query, preferences);
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }
  const promise = runGeneration(query, preferences);
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inFlight.get(key) === promise) {
      inFlight.delete(key);
    }
  }
}
