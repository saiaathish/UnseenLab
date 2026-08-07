/**
 * Intent layer types for the generative demonstration engine.
 *
 * A NormalizedRequest is the safe, canonical form of a learner prompt that the
 * rest of the pipeline consumes. An IntentSpec is the machine-readable
 * interpretation produced by `interpret()` in route.ts.
 */

import type { LearnerPreferences } from "@/domain/learner";
import type {
  ConceptualTemplateId,
  TrustLevel,
  VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";

/** A timeline topic backed by a curated explanatory animation (Level 3). */
export type TimelineTopic =
  | "mitosis"
  | "dna_transcription"
  | "water_cycle"
  | "immune_response";

/** Canonical, safely-normalized form of a raw learner prompt. */
export interface NormalizedRequest {
  /** Lowercased, trimmed, capped at 500 chars, stripped to [a-z0-9 ] tokens. */
  query: string;
  /** Length of the raw (pre-normalization) input in characters. */
  rawLength: number;
  /** "unsupported" when the input is written in a non-Latin script. */
  language: "en" | "unsupported";
  /** True when the request matches the harmful-content filter. */
  harmful: boolean;
  /** The learner preferences in force for this request. */
  prefs: LearnerPreferences;
}

/** Machine-readable interpretation of a learner request. */
export interface IntentSpec {
  /** Canonical concept name, e.g. "Gravity & Orbits". */
  concept: string;
  /** Domain of the matched demonstration (catalog domain, or a curated domain). */
  domain: string;
  /** Inferred learning goal, e.g. "predict behavior" | "compare scenarios". */
  learner_goal: string;
  /** Relationship the learner asked about, if any (e.g. "attraction"). */
  requested_relationship: string | null;
  /** Variable names mentioned in the query (from the matched engine's parameters). */
  requested_variables: string[];
  /** Inferred interaction style: "observe" | "simulate" | "explore". */
  desired_interaction: string;
  /** Trust level implied by the matched route. */
  candidate_trust_level: TrustLevel;
  /** Verified engine candidates, best first. Empty for templates/timelines. */
  candidate_engine_ids: VerifiedEngineId[];
  /** Conceptual template candidates, best first. Empty for engines/timelines. */
  candidate_template_ids: ConceptualTemplateId[];
  /** Non-null when the route is an explanatory timeline (Level 3). */
  timeline_topic?: TimelineTopic;
  /** Always false when returned; the clarify case is a separate envelope. */
  clarification_required: boolean;
  /** Always null when returned; the clarify case is a separate envelope. */
  clarification_question: string | null;
}
