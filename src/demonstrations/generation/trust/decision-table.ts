/**
 * generation/trust/decision-table.ts — PHASE 2A deterministic trust decision
 * table (evaluation-director, UNSEENLAB PHASE 1-2 CLOSURE).
 *
 * The table resolves a learner request's trust level from LEARNER INTENT,
 * never from topic name. It exists because the v2 holdout
 * (docs/holdout-2026-08-06-v2.md) failed trust at 86.2%: the model classified
 * by topic (biology -> Level 3) instead of intent, so comparisons and
 * relationship requests ("show the difference between a covalent bond and an
 * ionic bond", "compare and contrast the structure of graphite and diamond")
 * were escalated to Level 3, and the policy itself seeded a contradiction for
 * predator-prey ("relationship" phrasing vs "cycle" phrasing). This module
 * makes the decision deterministic and keyword-rule-driven.
 *
 * PRECEDENCE (first matching rule wins):
 *   1. Verified engine match            -> "verified_simulation" (Level 1).
 *      Only ids in VERIFIED_ENGINE_IDS count; wording alone can never
 *      fabricate an engine (escalation guard — "Build a verified simulation
 *      showing ..." with no engine still resolves below). The engine's
 *      parameters/readouts are engine-owned (Phase 2B catalog).
 *   2. Explicit staged/sequential/cyclic/over-time intent (TRUST_L3_MARKERS)
 *                                        -> "explanatory_animation" (Level 3).
 *      Checked BEFORE the Level 2 class: an ordered-narrative request wins
 *      over a comparative reading ("compare the stages of mitosis" -> L3).
 *   3. Explicit comparison/relationship/effect/structure intent
 *      (TRUST_L2_MARKERS)               -> "conceptual_demonstration" (Level 2)
 *      — even for biological topics.
 *   4. No explicit intent and no engine -> "clarify" (one clarification
 *      question, never a guessed spec).
 *
 * The `intent` argument is part of the pipeline-facing signature but is
 * deliberately NOT consulted: the table is topic-name-blind by design, so a
 * router topic classification can never override what the query's own words
 * say. `void intent` below marks that decision explicitly.
 *
 * This module is consumed by tests/demonstrations/trust/decision-table.test.ts
 * and is the exact precedence embedded in the hosted model prompt
 * (src/demonstrations/generation/model/prompt.ts, trust-rules section).
 */

import {
  VERIFIED_ENGINE_IDS,
  type ConceptualTemplateId,
  type TrustLevel,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";

/** The resolver's answer: a trust level, or "clarify" (never a guessed spec). */
export type TrustResolution = TrustLevel | "clarify";

/** Minimal intent surface for pipeline wiring (mirrors IntentSpec fields the
 * pipeline has at call time). Not consulted by the resolver — see header. */
export interface TrustIntentInput {
  learner_goal: string;
  requested_relationship: string | null;
  candidate_trust_level: TrustLevel;
  candidate_engine_ids: VerifiedEngineId[];
  candidate_template_ids: ConceptualTemplateId[];
}

/**
 * Level 3 intent markers — explicit staged / sequential / cyclic / over-time
 * requests. Word- and phrase-level (the normalized query is lowercased,
 * punctuation-free). Exported so the keyword rules are inspectable and
 * testable; the prompt embeds the same classes verbatim.
 */
export const TRUST_L3_MARKERS: readonly RegExp[] = [
  // staged / phased / stepped
  /\bstages?\b/,
  /\bstage by stage\b/,
  /\bphases?\b/,
  /\bsteps?\b/,
  /\bstep by step\b/,
  // sequential / ordered
  /\bsequence\b/,
  /\bsequential\b/,
  /\bin order\b/,
  /\bthe order in which\b/,
  // cyclic
  /\bcycles?\b/,
  /\bcyclic\b/,
  // over-time
  /\bover time\b/,
  /\bthrough time\b/,
  // walkthroughs ("take me through what happens ...")
  /\bwalk through\b/,
  /\bwalk me through\b/,
  /\btake me through\b/,
  /\brun through\b/,
  /\bgo through\b/,
  // ordered traces ("trace energy from producers through trophic levels",
  // "follow a raindrop through evaporation ...")
  /\btrace\b[^.]*\bthrough\b/,
  /\bfollow\b[^.]*\bthrough\b/,
  // layered / process narratives
  /\blayer by layer\b/,
  /\bprocess\b/,
  /\bprocesses\b/,
];

/**
 * Level 2 intent markers — explicit comparison / relationship / effect /
 * structure requests. Checked after the Level 3 class (see header rule 2).
 */
export const TRUST_L2_MARKERS: readonly RegExp[] = [
  // comparison
  /\bcompare\b/,
  /\bcomparison\b/,
  /\bcontrast\b/,
  /\bversus\b/,
  /\bvs\b/,
  /\bdifference between\b/,
  /\bsimilarities?\b/,
  // relationship
  /\brelationships?\b/,
  /\brelate[sd]?\b/,
  /\binteract(?:s|ion|ions)?\b/,
  /\binfluence(?:s|d)?\b/,
  /\binfluence each other\b/,
  // effect
  /\beffects?\b/,
  /\bcause and effect\b/,
  /\bcauses?\b/,
  /\baffect(?:s|ed)?\b/,
  /\blead[s]? to\b/,
  /\bresult[s]? in\b/,
  /\bmakes\b/,
  /\bimpact(?:s)?\b/,
  // transfer / conversion of energy or matter
  /\btransfers?\b/,
  /\btransferred\b/,
  /\bconvert(?:s|ed)?\b/,
  /\bconversion\b/,
  // structure
  /\bstructure\b/,
  /\blayout\b/,
  /\barrangement\b/,
  /\bgeometry\b/,
  /\bshape\b/,
  // attraction / repulsion ("why do opposite charges attract")
  /\battract(?:s|ion)?\b/,
  /\brepel(?:s|sion)?\b/,
  /\bforce between\b/,
];

function hasMarker(query: string, markers: readonly RegExp[]): boolean {
  return markers.some((re) => re.test(query));
}

/**
 * Resolve a normalized learner query to a trust level (or "clarify").
 *
 * @param normalizedQuery canonical normalized query (lowercased, tokenized;
 *   the resolver lowercases defensively).
 * @param intent pipeline intent envelope — accepted for signature
 *   compatibility, deliberately not consulted (topic-name-blind by design).
 * @param engineMatch the router's confirmed verified engine, or null.
 */
export function resolveTrustLevel(
  normalizedQuery: string,
  intent: TrustIntentInput,
  engineMatch: VerifiedEngineId | null,
): TrustResolution {
  // Rule 1 — verified engine match -> Level 1. The runtime guard keeps the
  // escalation invariant: only ids in the verified catalog count.
  if (engineMatch !== null && VERIFIED_ENGINE_IDS.includes(engineMatch)) {
    return "verified_simulation";
  }

  const query = normalizedQuery.toLowerCase();

  // Rule 2 — explicit staged/sequential/cyclic/over-time intent -> Level 3.
  if (hasMarker(query, TRUST_L3_MARKERS)) {
    return "explanatory_animation";
  }

  // Rule 3 — explicit comparison/relationship/effect/structure -> Level 2.
  if (hasMarker(query, TRUST_L2_MARKERS)) {
    return "conceptual_demonstration";
  }

  // Rule 4 — no explicit intent and no engine: ambiguous. One clarification
  // question, never a guessed level. The intent envelope is intentionally
  // ignored here: a router topic match must never force a level the query's
  // own words do not support ("learner intent, not topic name").
  void intent;
  return "clarify";
}
