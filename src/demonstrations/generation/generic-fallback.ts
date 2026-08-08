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
 * - Generic model specs are normalized to a first-class interactive primitive
 *   stage. A conceptual spec may never declare the Lumina simulation renderer
 *   when it has no simulation payload.
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

/**
 * Canonical rendering contract for arbitrary-topic conceptual demos.
 *
 * Hosted model output is allowed to author the qualitative scene, but it does
 * not own the runtime surface. A Level-2 spec has no simulation payload, so a
 * model-declared `lumina_2d` renderer is structurally impossible to execute
 * and previously produced the learner-facing "simulation could not be
 * started" fallback card.
 *
 * We deterministically normalize a renderable scene to the primitive stage:
 * - no scientific fields or relationships are changed;
 * - no trust escalation occurs;
 * - the primary tab becomes an interactive model backed by the approved
 *   primitive renderer;
 * - diagram + guided-steps views remain available without WebGL.
 *
 * A model spec with no scene is rejected here and replaced by the curated
 * deterministic conceptual template rather than shipping a hollow lab.
 */
export function normalizeGenericConceptualSpec(
  spec: DemoSpecV1,
): DemoSpecV1 | null {
  if (
    spec.trust.level !== "conceptual_demonstration" ||
    spec.simulation !== undefined ||
    !spec.scene3d ||
    spec.scene3d.objects.length === 0
  ) {
    return null;
  }

  return {
    ...spec,
    renderer: {
      ...spec.renderer,
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 4 / 3,
    },
    representations: [
      {
        id: "rep_interactive_model",
        kind: "stage_3d",
        label: "Interactive model",
      },
      {
        id: "rep_diagram",
        kind: "diagram",
        label: "Diagram",
      },
      {
        id: "rep_guided_steps",
        kind: "text_sequence",
        label: "Guided steps",
      },
    ],
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

/** One bounded model round: build the chat request, fetch, parse, first-pass
 * gate and sanitize. Returns the sanitizer outcome or null on transport
 * failure / unparseable output (caller decides the fallback reason). */
async function runModelRound(
  systemPrompt: string,
  userMessage: string,
  model: string,
  baseUrl: string,
  apiKey: string,
  controller: AbortController,
): Promise<
  | { kind: "spec"; outcome: ReturnType<typeof sanitizeDemoSpec> }
  | { kind: "failure"; reason: string }
> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: GENERIC_MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
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
    return { kind: "failure", reason: `generic_provider_${response.status}` };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return { kind: "failure", reason: "generic_empty_response" };
  }

  const parsed = parseJson(content);
  if (parsed === null) {
    return { kind: "failure", reason: "generic_invalid_json" };
  }

  const firstPass = firstPassModelCheck(parsed);
  if (!firstPass.ok) {
    return { kind: "failure", reason: "generic_schema_rejected" };
  }

  return { kind: "spec", outcome: sanitizeDemoSpec(firstPass.value) };
}

/** True when every rejection code is a model-fixable geometry code
 * (design-1 §7.2): the model can spread/reposition its own objects, so the
 * pipeline gives it ONE bounded repair retry with a safe directive. */
function isGeometryOnlyRejection(outcome: {
  status: string;
  reasons: string[];
}): boolean {
  if (outcome.status !== "rejected" || outcome.reasons.length === 0) return false;
  return outcome.reasons.every((r) => r.startsWith("geometry:"));
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
    const userMessage = JSON.stringify({
      query: normalizedQuery,
      preferences: {
        reducedMotion: prefs.reducedMotion,
        oneVariableMode: prefs.oneVariableMode,
        preferredRepresentations: prefs.preferredRepresentations,
      },
    });

    const attempt1 = await runModelRound(
      systemPrompt,
      userMessage,
      model,
      baseUrl,
      apiKey,
      controller,
    );
    if (attempt1.kind === "failure") {
      return offlineGeneric(normalizedQuery, prefs, attempt1.reason);
    }
    let sanitized = attempt1.outcome;

    // ONE bounded repair retry when the model alone can fix the geometry
    // (design-1 §7.2 rejections, §11.6): the directive echoes only safe
    // codes. Structural/policy rejections are never retried.
    if (isGeometryOnlyRejection(sanitized)) {
      const directive = `Your previous response was rejected (safe codes: ${sanitized.reasons.join(", ")}). Fix every violation — separate overlapping objects, remove duplicate positions, and resend ONE complete corrected spec.`;
      const attempt2 = await runModelRound(
        systemPrompt,
        `${userMessage}\n\n${directive}`,
        model,
        baseUrl,
        apiKey,
        controller,
      );
      if (attempt2.kind === "spec") sanitized = attempt2.outcome;
    }

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

    const normalizedSpec = normalizeGenericConceptualSpec(sanitized.spec);
    if (!normalizedSpec) {
      return offlineGeneric(normalizedQuery, prefs, "generic_unrenderable_scene");
    }

    console.info("[generation] generic_fallback", {
      outcome: "spec",
      source: "model",
      repaired: sanitized.status === "repaired",
      renderer: normalizedSpec.renderer.kind,
    });

    return {
      spec: normalizedSpec,
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
