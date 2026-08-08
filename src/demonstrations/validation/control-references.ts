/**
 * control-references.ts — the lesson-action contract for observation prompts.
 *
 * Every observation prompt that asks the learner to manipulate something must
 * resolve to a control the spec actually exposes. Two mechanisms:
 *
 *  1. Explicit binding: a prompt may carry `controlId` naming a control in the
 *     spec's controls array. Prompts whose controlId is not an available
 *     control are DROPPED (never silently remapped to something else).
 *
 *  2. Defensive legacy-text check: prompts WITHOUT controlId (free text from
 *     the model or a legacy author) are scanned for manipulation intent —
 *     an imperative verb (try/increase/decrease/lower/raise/change/move/turn/
 *     adjust/set) followed by a "the ..." noun phrase. When the noun phrase
 *     matches a KNOWN control vocabulary label/key (the curated engine
 *     control catalog — a valid "known control" vocabulary even when the
 *     materializer dropped the control at budget) that is NOT available in
 *     this spec, the prompt is dropped. The check is deliberately narrow and
 *     exact: purely observational prompts (watch/notice/describe/follow,
 *     no control noun) are always kept, and a prompt whose noun phrase
 *     resolves to an available control is never dropped.
 *
 * The filter is pure and shared by the validation boundary (sanitize.ts,
 * both server and client) and the render-side defense (deriveLessonPlan).
 */

import type {
  ControlSpec,
  DemoSpecV1,
  ObservationPrompt,
  VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import { ENGINE_CONTROL_CATALOG } from "@/demonstrations/generation/controls/catalog";

export interface ControlReferenceContext {
  /**
   * Known control vocabulary (catalog labels + keys for the spec's engine),
   * used only by the legacy-text check on prompts without controlId.
   */
  knownControlVocabulary?: string[];
  /**
   * Engine parameter labels by parameter key (spec.simulation.parameters),
   * folded into the resolvable set for parameter-targeted controls.
   */
  parameterLabels?: Record<string, string>;
}

/** Imperative verbs that signal an instruction to manipulate a control. */
const MANIPULATION_VERBS = [
  "try",
  "increase",
  "decrease",
  "lower",
  "raise",
  "change",
  "move",
  "turn",
  "adjust",
  "set",
];

/** Words that end a captured noun phrase ("Increase the speed and watch…"). */
const PHRASE_STOP_WORDS = new Set([
  "and",
  "or",
  "as",
  "when",
  "while",
  "then",
  "if",
  "to",
  "with",
  "until",
  "but",
  "so",
]);

/** Normalize a label/key/id for matching: lowercase, letters+digits only,
 * single spaces. */
function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bidirectional containment: term matches the phrase when one normalized
 * string contains the other. "launch speed" matches "the launch speed
 * slider"; "separation" matches the available label "Source separation".
 * Terms shorter than 2 characters are ignored so single-letter keys ("g")
 * never produce noise matches.
 */
function termMatchesPhrase(term: string, phrase: string): boolean {
  if (term.length < 2 || phrase.length < 2) return false;
  return term === phrase || phrase.includes(term) || term.includes(phrase);
}

/**
 * Noun phrases following manipulation verbs, e.g. "Increase the Launch speed
 * and watch…" -> ["launch speed"]. Sentence punctuation ends the window; the
 * phrase is capped at 5 words and stops at conjunction/relative words so
 * trailing clauses ("…and observe the orbit shape") never pollute it.
 */
export function extractManipulationNounPhrases(prompt: string): string[] {
  const phrases: string[] = [];
  for (const verb of MANIPULATION_VERBS) {
    const verbRe = new RegExp(`\\b${verb}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = verbRe.exec(prompt)) !== null) {
      const rest = prompt.slice(match.index + match[0].length);
      const sentenceEnd = rest.search(/[.,;:!?—\n]/);
      const window = (sentenceEnd === -1 ? rest : rest.slice(0, sentenceEnd)).slice(
        0,
        80
      );
      const article =
        /(?:^|\s)(?:the|a|an)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,4})/i.exec(window);
      if (article) {
        const words = article[1].split(/\s+/);
        const phrase: string[] = [];
        for (const word of words) {
          if (PHRASE_STOP_WORDS.has(word.toLowerCase())) break;
          phrase.push(word);
        }
        if (phrase.length > 0) phrases.push(normalizeTerm(phrase.join(" ")));
      } else {
        const words = window.match(/[a-z0-9-]+/gi) ?? [];
        if (words.length > 0) {
          phrases.push(normalizeTerm(words.slice(0, 3).join(" ")));
        }
      }
      // Resume scanning after this verb occurrence (no infinite loop when
      // the regex can match a zero-width position).
      verbRe.lastIndex = match.index + Math.max(1, match[0].length);
    }
  }
  return phrases;
}

/** The full set of terms this spec's controls resolve to: control id, control
 * label, the target ref, and the engine parameter label of a parameter ref. */
export function availableControlTerms(
  controls: ControlSpec[],
  parameterLabels?: Record<string, string>
): string[] {
  const terms = new Set<string>();
  for (const control of controls) {
    terms.add(normalizeTerm(control.id));
    terms.add(normalizeTerm(control.label));
    if (control.target.kind === "parameter") {
      terms.add(normalizeTerm(control.target.ref));
      const parameterLabel = parameterLabels?.[control.target.ref];
      if (parameterLabel) terms.add(normalizeTerm(parameterLabel));
    } else {
      terms.add(normalizeTerm(control.target.ref));
    }
  }
  return [...terms].filter((term) => term.length >= 2);
}

/**
 * The curated engine control catalog is a valid "known control vocabulary":
 * labels and keys are the exact vocabulary the author (model or curated code)
 * would reference, even when the materializer dropped the control at budget.
 */
export function knownControlVocabularyForEngine(
  engineId: VerifiedEngineId | undefined
): string[] {
  if (engineId === undefined) return [];
  const entries = ENGINE_CONTROL_CATALOG[engineId];
  if (!entries) return [];
  return entries
    .flatMap((entry) => [entry.label, entry.key])
    .filter((term) => term.length >= 2);
}

/** Build the filter context straight from a spec (validation + rail use). */
export function controlReferenceContextForSpec(
  spec: Pick<DemoSpecV1, "simulation">
): ControlReferenceContext {
  const parameterLabels: Record<string, string> = {};
  for (const parameter of spec.simulation?.parameters ?? []) {
    parameterLabels[parameter.key] = parameter.label;
  }
  return {
    knownControlVocabulary: knownControlVocabularyForEngine(
      spec.simulation?.engineId
    ),
    parameterLabels,
  };
}

/**
 * Drop observation prompts that instruct the learner to manipulate a control
 * the spec does not expose. Never remaps; purely observational prompts are
 * always kept.
 */
export function filterUnavailableControlPrompts(
  prompts: ObservationPrompt[],
  controls: ControlSpec[],
  context?: ControlReferenceContext
): ObservationPrompt[] {
  const available = availableControlTerms(controls, context?.parameterLabels);
  const availableIds = new Set(controls.map((c) => normalizeTerm(c.id)));
  const vocabulary = new Set(
    (context?.knownControlVocabulary ?? []).map(normalizeTerm)
  );

  const kept: ObservationPrompt[] = [];
  for (const prompt of prompts) {
    // Explicit binding is authoritative and EXACT: controlId must name a
    // control id in the spec's controls array (never fuzzy-matched, never
    // remapped). Purely observational prompts omit controlId.
    if (prompt.controlId !== undefined) {
      if (availableIds.has(normalizeTerm(prompt.controlId))) {
        kept.push(prompt);
      }
      continue;
    }

    const phrases = extractManipulationNounPhrases(prompt.prompt);
    if (phrases.length === 0) {
      kept.push(prompt); // purely observational
      continue;
    }

    let vocabMatch = false;
    let availableMatch = false;
    for (const phrase of phrases) {
      const phraseMatch = [...vocabulary].some((term) =>
        termMatchesPhrase(term, phrase)
      );
      const resolves = available.some((term) =>
        termMatchesPhrase(term, phrase)
      );
      if (phraseMatch) vocabMatch = true;
      if (resolves) availableMatch = true;
    }
    // Drop only when manipulation intent names a known control that is NOT
    // available; a prompt that resolves to an available control is kept.
    if (vocabMatch && !availableMatch) continue;
    kept.push(prompt);
  }
  return kept;
}
