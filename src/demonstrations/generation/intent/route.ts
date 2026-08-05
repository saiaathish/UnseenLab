/**
 * Intent interpretation: turns a raw learner prompt into an IntentSpec, or a
 * safe bounded envelope (unsafe / clarify / unsupported).
 *
 * Routing priority (delegated to the word-aware offline router):
 *   verified engine → conceptual template → explanatory timeline →
 *   honest unsupported.
 */

import type { LearnerPreferences } from "@/domain/learner";
import type {
  ConceptualTemplateId,
  TrustLevel,
  VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import { ENGINE_CATALOG } from "@/demonstrations/spec/demo-spec";
import {
  detectInjectionAttempt,
  hitsBroadTopicWord,
  normalizeRequest,
} from "./normalize";
import { routeQuery, type ScoreEntry } from "../offline/router";
import type { IntentSpec, TimelineTopic } from "./types";

// ---------------------------------------------------------------------------
// Learner-facing messages (plain, safe, encouraging — never operational)
// ---------------------------------------------------------------------------

export const UNSUPPORTED_LANGUAGE_NOTICE =
  "Sorry, I can only respond in English right now. Please rephrase your request in English — for example, 'Show me how planets orbit a star.'";

export const UNSAFE_NOTICE =
  "That request is outside what I can help with. I'm here to demonstrate safe physics and biology topics — like orbits, projectiles, pendulums, gas particles, electric fields, waves, circuits, reaction-diffusion patterns, cellular automata, mitosis, and the water cycle.";

export const INJECTION_NOTICE =
  "That looks like a request to produce code or override my instructions, which I can't do. I only generate structured demonstration specs — never executable code.";

export const EMPTY_NOTICE =
  "I couldn't read a topic in that request. Try something like 'Show me how planets orbit a star.'";

export const UNSUPPORTED_NOTICE =
  "I don't have a demonstration for that topic yet. I can help with topics like orbits, projectiles, pendulums, gases, electric fields, waves, circuits, reaction-diffusion patterns, cellular automata, mitosis, DNA transcription, the water cycle, and the immune response.";

export const CLARIFY_NOTICE =
  "Could you narrow your topic? Try something like 'orbit', 'projectile motion', 'wave interference', 'circuit', 'mitosis', or 'energy transfer'.";

export type InterpretResult =
  | IntentSpec
  | { status: "unsafe"; reason?: string }
  | { status: "clarify"; question: string }
  | { status: "unsupported"; reason?: string };

// ---------------------------------------------------------------------------
// Intent inference helpers
// ---------------------------------------------------------------------------

const VARIABLE_WORDS: Record<string, string> = {
  speed: "speed",
  velocity: "speed",
  drag: "drag",
  "air resistance": "drag",
  temperature: "temperature",
  angle: "angle",
  length: "length",
  mass: "mass",
  resistance: "resistance",
  capacitance: "capacitance",
  voltage: "voltage",
  separation: "separation",
  phase: "phase",
  density: "density",
  gravity: "gravity",
  absorber: "absorber",
  feed: "feed",
};

function inferGoal(query: string): string {
  if (/\b(predict|forecast|what if|what happens if)\b/.test(query)) {
    return "predict behavior";
  }
  if (/\b(compare|contrast|difference|versus| vs )\b/.test(query)) {
    return "compare scenarios";
  }
  if (/\bwhy\b/.test(query)) {
    return "understand mechanism";
  }
  return "explore and understand";
}

function inferInteraction(query: string): string {
  if (/\b(simulate|run|what if|predict|experiment)\b/.test(query)) {
    return "simulate";
  }
  if (/\b(show|see|visualize|watch|display)\b/.test(query)) {
    return "observe";
  }
  return "explore";
}

function inferRelationship(query: string): string | null {
  if (/\b(attract|attraction|repel|repulsion)\b/.test(query)) return "attraction/repulsion";
  if (/\b(orbit|orbital motion)\b/.test(query)) return "orbital motion";
  if (/\b(flow|flows|transfer|transfers)\b/.test(query)) return "flow/transfer";
  if (/\b(cause|effect|affect)\b/.test(query)) return "causation";
  if (/\b(contains|inside|within)\b/.test(query)) return "containment";
  return null;
}

function requestedVariables(query: string, engineId: VerifiedEngineId | null): string[] {
  if (!engineId) return [];
  const found = new Set<string>();
  for (const [phrase, key] of Object.entries(VARIABLE_WORDS)) {
    if (query.includes(phrase)) found.add(key);
  }
  const params = ENGINE_CATALOG[engineId].parameterKeys;
  return [...found].filter((k) => params.includes(k)).sort();
}

const TRUST_BY_KIND: Record<"engine" | "template" | "timeline", TrustLevel> = {
  engine: "verified_simulation",
  template: "conceptual_demonstration",
  timeline: "explanatory_animation",
};

const TEMPLATE_DOMAINS: Record<ConceptualTemplateId, string> = {
  process_flow: "process_systems",
  energy_transfer: "biology",
  cause_effect_network: "networks",
  particle_population: "networks",
  layered_system: "process_systems",
  cyclic_process: "process_systems",
  before_after_comparison: "process_systems",
  field_relationship: "electricity",
  transport_network: "networks",
  timeline_sequence: "process_systems",
};

const TIMELINE_DOMAINS: Record<TimelineTopic, string> = {
  mitosis: "biology",
  dna_transcription: "biology",
  water_cycle: "earth_science",
  immune_response: "biology",
};

function buildIntentSpec(query: string, scores: ScoreEntry[], prefs: LearnerPreferences): IntentSpec {
  const best = scores[0];
  const engineIds = scores
    .filter((s) => s.kind === "engine")
    .map((s) => s.id as VerifiedEngineId);
  const templateIds = scores
    .filter((s) => s.kind === "template")
    .map((s) => s.id as ConceptualTemplateId);
  const timeline = scores.find((s) => s.kind === "timeline");

  const bestEngine = engineIds[0] ?? null;
  const bestTemplate = templateIds[0] ?? null;
  const bestTimeline = (timeline?.id ?? null) as TimelineTopic | null;

  let concept: string;
  let domain: string;
  if (bestEngine) {
    concept = ENGINE_CATALOG[bestEngine].title;
    domain = ENGINE_CATALOG[bestEngine].domain;
  } else if (bestTimeline) {
    concept = TIMELINE_CONCEPT_NAMES[bestTimeline];
    domain = TIMELINE_DOMAINS[bestTimeline];
  } else if (bestTemplate) {
    concept = TEMPLATE_CONCEPT_NAMES[bestTemplate];
    domain = TEMPLATE_DOMAINS[bestTemplate];
  } else {
    concept = "unknown";
    domain = "unknown";
  }

  const kind = best.kind;

  return {
    concept,
    domain,
    learner_goal: inferGoal(query),
    requested_relationship: inferRelationship(query),
    requested_variables: requestedVariables(query, bestEngine),
    desired_interaction: inferInteraction(query),
    candidate_trust_level: TRUST_BY_KIND[kind],
    candidate_engine_ids: engineIds,
    candidate_template_ids: templateIds,
    timeline_topic: bestTimeline ?? undefined,
    clarification_required: false,
    clarification_question: null,
  };
}

const TEMPLATE_CONCEPT_NAMES: Record<ConceptualTemplateId, string> = {
  process_flow: "Process flow",
  energy_transfer: "Energy transfer",
  cause_effect_network: "Cause and effect",
  particle_population: "Particle population",
  layered_system: "Layered system",
  cyclic_process: "Cyclic process",
  before_after_comparison: "Before and after",
  field_relationship: "Field relationship",
  transport_network: "Transport network",
  timeline_sequence: "Timeline sequence",
};

const TIMELINE_CONCEPT_NAMES: Record<TimelineTopic, string> = {
  mitosis: "Mitosis",
  dna_transcription: "DNA transcription",
  water_cycle: "Water cycle",
  immune_response: "Immune response",
};

function buildClarificationQuestion(query: string): string {
  const broad = hitsBroadTopicWord(query);
  if (broad.includes("cells") || broad.includes("cell")) {
    return "Which cell topic would you like to explore — mitosis, DNA transcription, or the immune response?";
  }
  return CLARIFY_NOTICE;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Interpret a raw learner prompt. Returns an IntentSpec on success, or a safe
 * bounded envelope: unsafe (harmful request), clarify (ambiguous request),
 * unsupported (unknown language, injection attempt, or no matching route).
 */
export function interpret(
  query: string,
  prefs: LearnerPreferences,
): InterpretResult {
  const req = normalizeRequest(query, prefs);

  if (req.language !== "en") {
    return { status: "unsupported", reason: UNSUPPORTED_LANGUAGE_NOTICE };
  }
  if (req.harmful) {
    return { status: "unsafe", reason: UNSAFE_NOTICE };
  }
  if (detectInjectionAttempt(req.query)) {
    return { status: "unsupported", reason: INJECTION_NOTICE };
  }
  if (req.query.length === 0) {
    return { status: "unsupported", reason: EMPTY_NOTICE };
  }

  const route = routeQuery(req.query);
  if (route.ambiguous) {
    return { status: "clarify", question: buildClarificationQuestion(req.query) };
  }
  if (!route.best) {
    return { status: "unsupported", reason: UNSUPPORTED_NOTICE };
  }

  return buildIntentSpec(req.query, route.scores, req.prefs);
}

/** Convenience: the trust level promised by an intent. */
export function trustLevelOf(intent: IntentSpec): TrustLevel {
  return intent.candidate_trust_level;
}
