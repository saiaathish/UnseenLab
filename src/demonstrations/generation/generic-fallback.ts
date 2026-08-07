/**
 * Generic concept fallback for safe, non-routed learner requests.
 *
 * The primary pipeline is intentionally conservative: when the deterministic
 * router has no curated engine/template/timeline match it returns
 * `unsupported` before the model is called. This module closes that breadth
 * gap without weakening the trust boundary:
 *
 * - Known topics still use the normal pipeline and verified engines.
 * - Unknown safe topics may use the hosted model, but are HARD-CAPPED at
 *   `conceptual_demonstration` trust: no simulation and no quantitative claim.
 * - If the provider is missing/fails/returns an invalid spec, a deterministic
 *   conceptual template is emitted instead of a dead-end unsupported card.
 * - Safety, prompt-injection, non-English, and empty-input decisions remain in
 *   the primary intent layer and never reach this fallback.
 */

import {
  createDefaultPreferences,
  type LearnerPreferences,
} from "@/domain/learner";
import { DEFAULT_LLM_CONFIG } from "@/adaptation/llm-client";
import {
  type ConceptualTemplateId,
  type DemoSpecV1,
} from "@/demonstrations/spec/demo-spec";
import { normalizeQuery } from "@/demonstrations/generation/intent/normalize";
import { buildConceptualSpec } from "@/demonstrations/generation/offline/template-builder";
import { buildGenerationPrompt } from "@/demonstrations/generation/model/prompt";
import { firstPassModelCheck } from "@/demonstrations/generation/model/schema";
import { sanitizeDemoSpec } from "@/demonstrations/validation";

const GENERIC_TIMEOUT_MS = 60_000;
const GENERIC_MAX_OUTPUT_TOKENS = 12_000;

export interface GenericConceptResult {
  spec: DemoSpecV1;
  source: "model" | "offline";
  /** Safe machine-readable reason; never learner text or model output. */
  reason?: string;
}

/**
 * Select a deterministic visual grammar for the no-provider path. This does
 * NOT claim scientific fidelity; it only chooses the closest qualitative
 * interaction shape. The spec remains explicitly conceptual.
 */
export function selectGenericTemplate(
  normalizedQuery: string,
): ConceptualTemplateId {
  if (/\b(cycle|cyclic|loop|repeats?|recurs?)\b/.test(normalizedQuery)) {
    return "cyclic_process";
  }
  if (
    /\b(compare|contrast|versus|difference|before and after|changes? from)\b/.test(
      normalizedQuery,
    )
  ) {
    return "before_after_comparison";
  }
  if (/\b(layer|layers|layered|structure|anatomy|component|components)\b/.test(normalizedQuery)) {
    return "layered_system";
  }
  if (/\b(field|force|gradient|potential|attract|repel)\b/.test(normalizedQuery)) {
    return "field_relationship";
  }
  if (
    /\b(transport|circulation|network|pathway|signal|signals|route|routes)\b/.test(
      normalizedQuery,
    )
  ) {
    return "transport_network";
  }
  if (/\b(energy|heat|thermal|power|metabolism|transfer)\b/.test(normalizedQuery)) {
    return "energy_transfer";
  }
  if (/\b(population|ecosystem|growth|spread|epidemic|predator|prey)\b/.test(normalizedQuery)) {
    return "particle_population";
  }
  if (/\b(step|steps|stage|stages|phase|phases|sequence|process|path)\b/.test(normalizedQuery)) {
    return "process_flow";
  }
  return "cause_effect_network";
}

function conceptLabel(normalizedQuery: string): string {
  const stripped = normalizedQuery
    .replace(
      /^(please\s+)?(show|explain|visualize|demonstrate|teach|help me understand|tell me about)\s+/,
      "",
    )
    .replace(/^(how|why|what)\s+(does|do|is|are|can|would|will)\s+/, "")
    .trim();

  const source = stripped || normalizedQuery || "Concept";
  const capped = source.slice(0, 72);
  return capped.replace(/\b\w/g, (char) => char.toUpperCase());
}

function offlineGeneric(
  normalizedQuery: string,
  prefs: LearnerPreferences,
  reason: string,
): GenericConceptResult {
  const templateId = selectGenericTemplate(normalizedQuery);
  return {
    spec: buildConceptualSpec(
      templateId,
      conceptLabel(normalizedQuery),
      normalizedQuery,
      prefs,
    ),
    source: "offline",
    reason,
  };
}

function parseJson(content: string): unknown | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Generate a qualitative demonstration for a safe request that had no curated
 * route. The model is never allowed to upgrade this fallback into a verified
 * simulation; deterministic validation enforces that ceiling.
 */
export async function generateGenericConceptDemo(
  query: string,
  prefs: LearnerPreferences = createDefaultPreferences(),
): Promise<GenericConceptResult> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return offlineGeneric("concept", prefs, "generic_empty_guard");
  }

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return offlineGeneric(normalizedQuery, prefs, "generic_no_api_key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERIC_TIMEOUT_MS);

  try {
    const model = process.env.LLM_MODEL ?? DEFAULT_LLM_CONFIG.model;
    const baseUrl =
      process.env.LLM_API_BASE_URL ?? DEFAULT_LLM_CONFIG.baseUrl;
    const systemPrompt = buildGenerationPrompt(
      normalizedQuery,
      prefs,
      {},
      "conceptual_demonstration",
    );
    const body: Record<string, unknown> = {
      model,
      temperature: 0,
      max_tokens: GENERIC_MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            query: normalizedQuery,
            preferences: {
              reducedMotion: prefs.reducedMotion,
              oneVariableMode: prefs.oneVariableMode,
              preferredRepresentations: prefs.preferredRepresentations,
            },
          }),
        },
      ],
    };
    if (process.env.LLM_DISABLE_THINKING === "1") {
      body.thinking = { type: "disabled" };
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return offlineGeneric(
        normalizedQuery,
        prefs,
        `generic_provider_${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return offlineGeneric(normalizedQuery, prefs, "generic_empty_response");
    }

    const parsed = parseJson(content);
    if (parsed === null) {
      return offlineGeneric(normalizedQuery, prefs, "generic_invalid_json");
    }

    const firstPass = firstPassModelCheck(parsed);
    if (!firstPass.ok) {
      return offlineGeneric(normalizedQuery, prefs, "generic_schema_rejected");
    }

    const sanitized = sanitizeDemoSpec(firstPass.value);
    if (
      (sanitized.status !== "valid" && sanitized.status !== "repaired") ||
      !sanitized.spec
    ) {
      return offlineGeneric(normalizedQuery, prefs, "generic_policy_rejected");
    }

    // Hard trust ceiling for the universal fallback: qualitative only.
    if (
      sanitized.spec.trust.level !== "conceptual_demonstration" ||
      sanitized.spec.simulation !== undefined
    ) {
      return offlineGeneric(normalizedQuery, prefs, "generic_trust_mismatch");
    }

    console.info("[generation] generic_fallback", {
      outcome: "spec",
      source: "model",
      repaired: sanitized.status === "repaired",
    });

    return {
      spec: sanitized.spec,
      source: "model",
      reason:
        sanitized.status === "repaired"
          ? "generic_model_repaired"
          : "generic_model",
    };
  } catch (error) {
    const reason =
      error !== null &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
        ? "generic_timeout"
        : "generic_network_error";
    return offlineGeneric(normalizedQuery, prefs, reason);
  } finally {
    clearTimeout(timer);
  }
}
