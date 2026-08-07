/**
 * Offline demo generator — ties the intent layer and the offline router and
 * builders together into the single public entry point of the offline path.
 *
 * Returns a safe bounded result: a full DemoSpecV1, a clarification question,
 * a safe rejection, or an honest "unsupported" with a reason. Never produces
 * executable code or operational content.
 */

import {
  createDefaultPreferences,
  type LearnerPreferences,
} from "@/domain/learner";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { interpret, type InterpretResult } from "../intent/route";
import { normalizeQuery } from "../intent/normalize";
import type { IntentSpec } from "../intent/types";
import { buildEngineSpec } from "./engine-builder";
import { buildConceptualSpec, buildTimelineSpec } from "./template-builder";
import {
  showcaseById,
  type ShowcaseId,
} from "@/demonstrations/showcases";
import type { VerifiedEngineId } from "@/demonstrations/spec/demo-spec";

/**
 * The three showcase families are the immersive entry point for their
 * engines: orbits, charges and waves route to the curated hybrid 3D/2D
 * showcases (Level 1, engine-coupled, with 2D stage + table + timeline +
 * text-sequence alternatives). Every other engine uses the generic 2D
 * builder, which stays fully accessible without a 3D stage.
 */
const ENGINE_TO_SHOWCASE: Partial<Record<VerifiedEngineId, ShowcaseId>> = {
  orbits: "orbits",
  charges: "electric-fields",
  waves: "wave-interference",
};

export interface OfflineDemoResult {
  status: "spec" | "clarify" | "unsafe" | "unsupported";
  /** Present when status === "spec". */
  spec?: DemoSpecV1;
  /** Present when status === "clarify". */
  question?: string;
  /** Present for unsafe/unsupported: the safe learner-facing message. */
  reason?: string;
  source: "offline";
}

function buildSpecFromIntent(
  intent: IntentSpec,
  query: string,
  prefs: LearnerPreferences,
): DemoSpecV1 {
  if (intent.timeline_topic) {
    return buildTimelineSpec(intent.timeline_topic, query, prefs);
  }
  if (intent.candidate_engine_ids.length > 0) {
    const engineId = intent.candidate_engine_ids[0];
    const showcaseId = ENGINE_TO_SHOWCASE[engineId];
    if (showcaseId) {
      const showcase = showcaseById(showcaseId);
      if (showcase) {
        return showcase.build({ reducedMotion: prefs.reducedMotion });
      }
    }
    return buildEngineSpec(engineId, query, prefs);
  }
  if (intent.candidate_template_ids.length > 0) {
    return buildConceptualSpec(
      intent.candidate_template_ids[0],
      intent.concept,
      query,
      prefs,
    );
  }
  // Unreachable: interpret only returns IntentSpec when a candidate exists.
  throw new Error("intent carried no route candidates");
}

function toResult(intentResult: InterpretResult, query: string, prefs: LearnerPreferences): OfflineDemoResult {
  if ("status" in intentResult) {
    switch (intentResult.status) {
      case "unsafe":
        return {
          status: "unsafe",
          reason: intentResult.reason ?? "That request is outside what I can help with.",
          source: "offline",
        };
      case "clarify":
        return { status: "clarify", question: intentResult.question, source: "offline" };
      case "unsupported":
        return {
          status: "unsupported",
          reason: intentResult.reason ?? "I don't have a demonstration for that topic yet.",
          source: "offline",
        };
    }
  }
  return {
    status: "spec",
    spec: buildSpecFromIntent(intentResult, query, prefs),
    source: "offline",
  };
}

/**
 * Generate a demonstration offline (no model, no network).
 *
 * - unsafe: request matched the harmful-content filter → safe message, no spec.
 * - clarify: request was too ambiguous → a single short question.
 * - unsupported: unknown language, injection attempt, or no matching route.
 * - spec: a complete DemoSpecV1 (verified engine, conceptual template, or
 *   explanatory timeline).
 *
 * The query is normalized ONCE here so the emitted spec's userQuery always
 * respects the 500-char input cap (a raw over-long query must never produce a
 * self-invalidating spec). Deterministic for identical (query, prefs) except
 * provenance.generatedAt, which is the wall-clock time of generation by
 * contract.
 */
export function generateOfflineDemo(
  query: string,
  prefs: LearnerPreferences = createDefaultPreferences(),
): OfflineDemoResult {
  const normalized = normalizeQuery(query);
  const intentResult = interpret(normalized, prefs);
  return toResult(intentResult, normalized, prefs);
}
