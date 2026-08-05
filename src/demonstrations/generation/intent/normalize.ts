/**
 * Input normalization and safety screening for the generative demonstration
 * engine. Everything here is deterministic and pure — no I/O, no clocks.
 */

import type { LearnerPreferences } from "@/domain/learner";
import type { NormalizedRequest } from "./types";

/** Hard cap on how much of the raw input we look at (safe for any input). */
export const MAX_QUERY_LENGTH = 500;

// ---------------------------------------------------------------------------
// Script detection
// ---------------------------------------------------------------------------

/**
 * Non-Latin scripts we cannot safely tokenize or route: CJK (Han), Japanese
 * kana, Arabic, Cyrillic, plus a few adjacent blocks. Any of these present in
 * the input → unsupported_language outcome.
 */
const NON_LATIN_RE =
  /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]|[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]|[\u0400-\u04FF\u0500-\u052F]/;

/** True when the (trimmed, lowercased) input contains non-Latin script. */
export function detectUnsupportedLanguage(text: string): boolean {
  return NON_LATIN_RE.test(text);
}

// ---------------------------------------------------------------------------
// Harmful-content filter
// ---------------------------------------------------------------------------
// Categories: weapon construction, explosive synthesis, drug synthesis,
// uranium enrichment, reactor operation instructions, bypassing safety
// systems, dangerous lab instructions. Phrases only — never bare single words
// that could appear in benign educational text ("synthesis" alone is fine:
// "protein synthesis" is a legitimate biology topic).

const HARMFUL_PHRASES: readonly string[] = [
  // weapons
  "weapon",
  "weaponize",
  "homemade weapon",
  "make a bomb",
  "build a bomb",
  // explosives
  "explosive device",
  "explosive synthesis",
  "make an explosive",
  "bomb making",
  "detonat",
  "nitroglycerin",
  // drugs
  "drug synthesis",
  "synthesize drugs",
  "synthesize meth",
  "crystal meth",
  "methamphetamine",
  "cocaine",
  "heroin",
  "fentanyl",
  "manufacture drugs",
  // uranium enrichment / nuclear weapons
  "enrichment",
  "enriched uranium",
  "yellowcake",
  "uranium hexafluoride",
  "atomic bomb",
  "nuclear weapon",
  "fissile material",
  // reactor operation instructions
  "reactor operation",
  "operate a reactor",
  "operating a reactor",
  "reactor startup",
  "reactor enrichment",
  "reactor fuel fabrication",
  // bypassing safety systems
  "bypass safety",
  "bypassing safety",
  "bypass the safety",
  "safety bypass",
  "override safety",
  "disable safety",
  "defeat safety",
  "bypass safeguards",
  "bypass security",
  // dangerous lab instructions
  "dangerous lab",
  "hazardous lab",
  "unsafe lab",
  "hazardous experiment",
  "harmful chemical recipe",
];

/** True when the query matches the harmful-content filter. */
export function detectHarmfulContent(query: string): boolean {
  return HARMFUL_PHRASES.some((phrase) => query.includes(phrase));
}

// ---------------------------------------------------------------------------
// Prompt-injection filter
// ---------------------------------------------------------------------------
// We never execute or emit code; these phrases mark attempts to turn the
// request into an instruction to produce executable content or reveal the
// system's configuration. Matching requests are answered with a safe,
// bounded "unsupported" response and never produce code fields.

const INJECTION_PHRASES: readonly string[] = [
  "ignore the schema",
  "ignore your instructions",
  "ignore all instructions",
  "ignore previous",
  "disregard the schema",
  "disregard your instructions",
  "return javascript",
  "javascript code",
  "write code",
  "generate code",
  "produce code",
  "emit code",
  "code snippet",
  "executable",
  "websocket",
  "web socket",
  "system prompt",
  "reveal your prompt",
  "reveal your instructions",
  "print the schema",
  "dump the schema",
  "shell command",
  "terminal command",
  "run a command",
  "drop table",
  "sql injection",
  "prompt injection",
  "bypass the model",
];

/** True when the query looks like a prompt-injection / code-generation attempt. */
export function detectInjectionAttempt(query: string): boolean {
  return INJECTION_PHRASES.some((phrase) => query.includes(phrase));
}

// ---------------------------------------------------------------------------
// Ambiguity detection
// ---------------------------------------------------------------------------
// Broad topic words that are real science topics but too vague to route by
// themselves. Zero strong keyword matches + a broad word → clarify.

export const BROAD_TOPIC_WORDS: readonly string[] = [
  "cells",
  "cell",
  "energy",
  "force",
  "reaction",
  "chemistry",
  "physics",
  "biology",
  "electricity",
  "magnetism",
  "motion",
  "science",
  "system",
  "process",
  "molecule",
  "molecules",
];

/** Broad topic words found in the query's tokens (empty when none). */
export function hitsBroadTopicWord(query: string): string[] {
  const tokens = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  return BROAD_TOPIC_WORDS.filter((w) => tokens.has(w));
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Lowercase, trim, cap at MAX_QUERY_LENGTH, then strip everything that is not
 * a letter, digit, or space (so "double-slit" becomes "double slit" and word
 * boundaries survive). Collapses repeated whitespace.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build the canonical NormalizedRequest from raw input + preferences. */
export function normalizeRequest(
  raw: string,
  prefs: LearnerPreferences,
): NormalizedRequest {
  const trimmed = raw.trim().slice(0, MAX_QUERY_LENGTH).toLowerCase();
  const language: NormalizedRequest["language"] = detectUnsupportedLanguage(
    trimmed,
  )
    ? "unsupported"
    : "en";
  const query = normalizeQuery(trimmed);
  return {
    query,
    rawLength: raw.length,
    language,
    harmful: detectHarmfulContent(query),
    prefs,
  };
}
