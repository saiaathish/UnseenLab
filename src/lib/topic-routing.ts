import { NUCLEAR_CHAIN_REACTION_EXPERIMENT } from "@/domain/experiments";

export type TopicRoute =
  | {
      status: "supported";
      labSlug: string;
      labTitle: string;
      normalizedTopic: string;
    }
  | { status: "unsupported"; normalizedTopic: string }
  | { status: "empty" };

export const SUPPORTED_LAB_SLUG = "nuclear-chain-reaction";

/**
 * Exact phrases (already lowercase) matched as substrings of the normalized
 * input. Substring matching naturally covers plurals and inflections, e.g.
 * "absorbers" contains "absorber" and "control rods" contains "control rod".
 */
const SUPPORTED_PHRASES = [
  "nuclear chain reaction",
  "chain reaction",
  "nuclear physics",
  "neutron",
  "fission",
  "absorber",
  "control rod",
  "nonlinear reaction growth",
];

/** Hard cap on how much input we will look at, so any input is safe to route. */
const MAX_INPUT_LENGTH = 1000;

/** Lowercase, trim, collapse repeated whitespace, strip punctuation (keep letters/digits/spaces). */
export function normalizeTopic(raw: string): string {
  return raw
    .slice(0, MAX_INPUT_LENGTH)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns "empty" when normalized input is empty; "supported" when it matches; else "unsupported". */
export function routeTopic(raw: string): TopicRoute {
  const normalizedTopic = normalizeTopic(raw);

  if (normalizedTopic.length === 0) {
    return { status: "empty" };
  }

  if (SUPPORTED_PHRASES.some((phrase) => normalizedTopic.includes(phrase))) {
    return {
      status: "supported",
      labSlug: NUCLEAR_CHAIN_REACTION_EXPERIMENT.slug,
      labTitle: NUCLEAR_CHAIN_REACTION_EXPERIMENT.title,
      normalizedTopic,
    };
  }

  return { status: "unsupported", normalizedTopic };
}
