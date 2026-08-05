/**
 * Word-aware deterministic router for the offline generative demonstration
 * engine.
 *
 * Matching rules (all deterministic, no randomness, no LLM):
 *   1. Phrase-first: a multi-word phrase matches only when its words appear
 *      CONSECUTIVELY in the query's token stream ("nuclear chain reaction").
 *   2. Word boundaries: every match is whole-token equality, so "car" never
 *      matches "circuit" and "orbit" never matches "orbital".
 *   3. Token overlap scoring: multi-word phrase hits weigh 2, single-word
 *      keyword hits weigh 1. Ties break by kind priority (verified engine >
 *      explanatory timeline > conceptual template), then lexicographic id.
 *   4. Ambiguity: zero strong matches + a broad topic word ("cells",
 *      "energy") → ambiguous, so the caller can ask for clarification instead
 *      of guessing.
 */

import {
  CONCEPTUAL_TEMPLATE_IDS,
  ENGINE_CATALOG,
  VERIFIED_ENGINE_IDS,
  type ConceptualTemplateId,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import { hitsBroadTopicWord } from "../intent/normalize";
import type { TimelineTopic } from "../intent/types";

export type RouteKind = "engine" | "template" | "timeline";

export interface ScoreEntry {
  kind: RouteKind;
  id: string;
  /** Higher is a better match. Zero means no keyword hit. */
  score: number;
  /** Length in chars of the longest matched phrase (specificity tie-break). */
  longestPhrase: number;
  /** The phrases (in original spelling) that matched. */
  matchedPhrases: string[];
}

export interface RouteBest {
  kind: RouteKind;
  id: string;
  score: number;
}

export interface OfflineRouteResult {
  /** Highest-scoring candidate, or null when nothing matched. */
  best: RouteBest | null;
  /** All candidates with score > 0, best first (deterministic order). */
  scores: ScoreEntry[];
  /** True when nothing matched strongly but a broad topic word was present. */
  ambiguous: boolean;
  /** Every phrase that matched, in query order. */
  matchedPhrases: string[];
}

interface RouteCandidate {
  kind: RouteKind;
  id: string;
  /** Tokenized phrases; a multi-word phrase matches only consecutively. */
  phrases: string[][];
  /** Tie-break: 0 = verified engine, 1 = timeline, 2 = conceptual template. */
  priority: number;
}

// ---------------------------------------------------------------------------
// Tokenization — whole-token matching guarantees word boundaries
// ---------------------------------------------------------------------------

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function normalizePhrase(phrase: string): string[] {
  return tokenize(phrase);
}

function containsPhrase(tokens: string[], phrase: string[]): boolean {
  if (phrase.length === 1) {
    return tokens.includes(phrase[0]);
  }
  outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j] !== phrase[j]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

/**
 * Single-word catalog keywords that are too generic or polysemous to route by
 * themselves ("chemistry" → reaction-diffusion? "resistance" → RC circuit when
 * the user means air resistance? "field" → charges?). They only contribute
 * when another phrase from the same candidate matches; alone they produce no
 * route, so the intent layer can clarify instead of guessing.
 */
const WEAK_SINGLE_WORDS = new Set([
  "chemistry",
  "field",
  "resistance",
  "space",
  "heat",
  "pressure",
  "complexity",
  "emergence",
  "young",
  "period",
]);

function isWeakSingleWord(phraseTokens: string[]): boolean {
  return phraseTokens.length === 1 && WEAK_SINGLE_WORDS.has(phraseTokens[0]);
}

// ---------------------------------------------------------------------------
// Curated keyword tables (router-owned, complementing the ED-owned catalog)
// ---------------------------------------------------------------------------

/** Router-level alias phrases that map onto catalog engines. */
const ENGINE_ALIAS_PHRASES: Record<VerifiedEngineId, readonly string[]> = {
  orbits: ["solar system orbit"],
  projectile: [],
  charges: [],
  waves: [],
  gas: ["particles", "gas particles", "kinetic theory"],
  pendulum: [],
  rc_circuit: [],
  reaction_diffusion: [],
  cellular_automaton: [],
  nuclear_chain_reaction: ["control rods", "neutron absorbers"],
};

export const TEMPLATE_KEYWORDS: Record<ConceptualTemplateId, readonly string[]> = {
  process_flow: [
    "process flow",
    "process sequence",
    "production process",
    "reaction pathway",
    "assembly line",
    "workflow",
    "step by step process",
  ],
  energy_transfer: [
    "energy transfer",
    "energy flow",
    "transfer energy",
    "flow of energy",
    "photosynthesis",
    "cellular respiration",
    "respiration",
    "energy transformation",
    "food chain",
    "food web",
  ],
  cause_effect_network: [
    "cause and effect",
    "cause effect",
    "causal",
    "consequence",
    "domino effect",
    "feedback loop",
    "knock on effect",
  ],
  particle_population: [
    "population dynamics",
    "population growth",
    "predator prey",
    "birth rate",
    "death rate",
    "carrying capacity",
    "exponential growth",
    "logistic growth",
    "bacteria growth",
  ],
  layered_system: [
    "layered system",
    "earth layers",
    "atmosphere layers",
    "soil layers",
    "osi model",
    "layers of the earth",
    "stack of layers",
  ],
  cyclic_process: [
    "carbon cycle",
    "nitrogen cycle",
    "rock cycle",
    "nutrient cycle",
    "cyclic process",
    "seasonal cycle",
    "circular process",
  ],
  before_after_comparison: [
    "before and after",
    "before after",
    "compare and contrast",
    "comparison",
    "difference between",
    "contrast",
  ],
  field_relationship: [
    "magnetic field",
    "gravitational field",
    "force field",
    "field relationship",
    "magnet",
    "magnetism",
    "bar magnet",
  ],
  transport_network: [
    "transport network",
    "network flow",
    "flow network",
    "supply chain",
    "distribution network",
    "traffic flow",
    "pipe network",
    "blood flow",
  ],
  timeline_sequence: [
    "sequence of events",
    "chronological order",
    "timeline sequence",
    "history of",
    "order of events",
  ],
};

export const TIMELINE_KEYWORDS: Record<TimelineTopic, readonly string[]> = {
  mitosis: [
    "mitosis",
    "mitotic",
    "cell division",
    "chromosome",
    "chromosomes",
    "prophase",
    "prometaphase",
    "metaphase",
    "anaphase",
    "telophase",
    "cytokinesis",
  ],
  dna_transcription: [
    "transcription",
    "dna transcription",
    "rna polymerase",
    "mrna",
    "messenger rna",
    "gene expression",
  ],
  water_cycle: [
    "water cycle",
    "hydrologic cycle",
    "hydrological cycle",
    "evaporation",
    "condensation",
    "precipitation",
    "evapotranspiration",
  ],
  immune_response: [
    "immune response",
    "immune system",
    "immunity",
    "antibody",
    "antibodies",
    "antigen",
    "vaccine",
    "vaccination",
    "lymphocyte",
    "white blood cell",
  ],
};

export const TIMELINE_TOPIC_IDS: readonly TimelineTopic[] = [
  "mitosis",
  "dna_transcription",
  "water_cycle",
  "immune_response",
];

// ---------------------------------------------------------------------------
// Candidate table (built once, deterministically, from the ED-owned catalog)
// ---------------------------------------------------------------------------

const CANDIDATES: RouteCandidate[] = [
  ...VERIFIED_ENGINE_IDS.map((id) => {
    const capability = ENGINE_CATALOG[id];
    const phrases = [
      ...capability.keywords,
      ...ENGINE_ALIAS_PHRASES[id],
    ].map(normalizePhrase);
    return { kind: "engine" as const, id, phrases, priority: 0 };
  }),
  ...TIMELINE_TOPIC_IDS.map((id) => ({
    kind: "timeline" as const,
    id,
    phrases: TIMELINE_KEYWORDS[id].map(normalizePhrase),
    priority: 1,
  })),
  ...CONCEPTUAL_TEMPLATE_IDS.map((id) => ({
    kind: "template" as const,
    id,
    phrases: TEMPLATE_KEYWORDS[id].map(normalizePhrase),
    priority: 2,
  })),
];

function compareCandidates(a: RouteCandidate, b: RouteCandidate): number {
  // Callers sort by score first; this handles ties deterministically.
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Tie-break for ScoreEntry: kind priority first, then how SPECIFIC the best
 * matched phrase was (longer keyword = more precise), then id. Specificity
 * fixes the ambiguous-token traps: "capacitor charge" must route to rc_circuit
 * (keyword "capacitor" is more specific than "charge"), and "pendulum on the
 * moon" must route to pendulum ("moon" is a weak orbit hint next to a precise
 * pendulum keyword).
 */
function tieBreakEntries(a: ScoreEntry, b: ScoreEntry): number {
  const priority: Record<RouteKind, number> = { engine: 0, timeline: 1, template: 2 };
  if (priority[a.kind] !== priority[b.kind]) return priority[a.kind] - priority[b.kind];
  if (a.longestPhrase !== b.longestPhrase) return b.longestPhrase - a.longestPhrase;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Score every candidate against the query. Returns entries with score > 0,
 * sorted by score (desc), then kind priority, then longest matched phrase,
 * then id (deterministic order).
 */
export function scoreCandidates(query: string): ScoreEntry[] {
  const tokens = tokenize(query);
  const entries: ScoreEntry[] = [];
  for (const candidate of CANDIDATES) {
    let score = 0;
    let longestPhrase = 0;
    const matched: string[] = [];
    for (const phraseTokens of candidate.phrases) {
      if (containsPhrase(tokens, phraseTokens) && !isWeakSingleWord(phraseTokens)) {
        score += phraseTokens.length >= 2 ? 2 : 1;
        const phrase = phraseTokens.join(" ");
        longestPhrase = Math.max(longestPhrase, phrase.length);
        matched.push(phrase);
      }
    }
    if (score > 0) {
      entries.push({ kind: candidate.kind, id: candidate.id, score, longestPhrase, matchedPhrases: matched });
    }
  }
  entries.sort((a, b) => b.score - a.score || tieBreakEntries(a, b));
  return entries;
}

/** Route a normalized query. Deterministic for identical input. */
export function routeQuery(query: string): OfflineRouteResult {
  const scores = scoreCandidates(query);
  const best: RouteBest | null =
    scores.length > 0
      ? { kind: scores[0].kind, id: scores[0].id, score: scores[0].score }
      : null;
  const matchedPhrases = scores.flatMap((s) => s.matchedPhrases);
  const ambiguous = best === null && hitsBroadTopicWord(query).length > 0;
  return { best, scores, ambiguous, matchedPhrases };
}

/**
 * Debug-mode explanation: one line per candidate with its final score.
 * Deterministic ordering (score desc, kind priority, id).
 */
export function explainScore(query: string): string[] {
  const tokens = tokenize(query);
  const lines: string[] = [];
  const ranked: Array<{
    candidate: RouteCandidate;
    score: number;
    longest: number;
    matched: string[];
  }> = [];
  for (const candidate of CANDIDATES) {
    let score = 0;
    let longest = 0;
    const matched: string[] = [];
    for (const phraseTokens of candidate.phrases) {
      if (containsPhrase(tokens, phraseTokens) && !isWeakSingleWord(phraseTokens)) {
        score += phraseTokens.length >= 2 ? 2 : 1;
        const phrase = phraseTokens.join(" ");
        longest = Math.max(longest, phrase.length);
        matched.push(phrase);
      }
    }
    ranked.push({ candidate, score, longest, matched });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.longest - a.longest ||
      compareCandidates(a.candidate, b.candidate)
  );
  for (const { candidate, score, matched } of ranked) {
    const suffix = matched.length > 0 ? ` [${matched.join(", ")}]` : "";
    lines.push(`${candidate.kind}:${candidate.id} = ${score}${suffix}`);
  }
  return lines;
}

/** Alias for explainScore (debug mode entry point). */
export function exposeScore(query: string): string[] {
  return explainScore(query);
}
