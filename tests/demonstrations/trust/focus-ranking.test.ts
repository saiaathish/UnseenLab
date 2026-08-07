/**
 * focus-ranking.test.ts — FROZEN EVALUATION MANIFEST, Round 2 judge-upgrade
 * (evaluation-director, UNSEENLAB generative-trust-controls).
 *
 * Deterministic focus-key ranking. The judge mandate: "explicit learner
 * variable → catalog relationship match → model-suggested valid keys →
 * curated default. The model should never be the only mechanism deciding
 * whether the learner receives a relevant control."
 *
 * The v3 holdout (docs/holdout-2026-08-06-v3.md, diagnosis 3) records 2
 * control-relevance misses (orbits-comet-speed, resource-exhaustion-3) where
 * the model's chosen focusParameterKeys were the SOLE selection mechanism
 * (model picked eccentricity where the gold implied speed). This manifest
 * pins the deterministic replacement.
 *
 * Two contract surfaces live here, with deliberately different run states:
 *
 *  1. LEARNING_RELATIONSHIPS data contract (src/demonstrations/generation/
 *     controls/relationships.ts) — GREEN NOW. Data owned by the
 *     evaluation-director; membership, coverage, and mandate pins below.
 *  2. rankFocusKeys() precedence contract — RED until the canonical-state
 *     architect implements the function in materialize.ts against
 *     docs/focus-ranking.md. The ranking block imports materialize.ts
 *     DYNAMICALLY so a missing export fails only the ranking tests (clean
 *     TDD red) and never the data tests (which must stay green).
 *
 * Frozen before any implementation. The manifest hash is recorded in
 * docs/focus-ranking.md; the test file is never edited after the freeze —
 * only the data file and materialize.ts implementation may change.
 */

import { describe, expect, it } from "vitest";
import {
  FOCUS_VARIABLE_WORDS,
  LEARNING_RELATIONSHIPS,
  type LearningRelationship,
} from "@/demonstrations/generation/controls/relationships";
import {
  ENGINE_CATALOG,
  VERIFIED_ENGINE_IDS,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";

// ---------------------------------------------------------------------------
// 1. LEARNING_RELATIONSHIPS — deterministic data contract (must pass now)
// ---------------------------------------------------------------------------

function relationshipsOf(id: VerifiedEngineId): LearningRelationship[] {
  const entries = LEARNING_RELATIONSHIPS[id];
  expect(entries, `${id}: relationships defined`).toBeDefined();
  return entries;
}

/** The single entry whose phrases include `phrase` (phrases are unique per engine). */
function relationshipFor(id: VerifiedEngineId, phrase: string): LearningRelationship {
  const entry = relationshipsOf(id).find((r) => r.phrases.includes(phrase));
  expect(entry, `${id}: entry for phrase "${phrase}"`).toBeDefined();
  return entry!;
}

describe("LEARNING_RELATIONSHIPS — coverage and shape", () => {
  it("is a full Record over VERIFIED_ENGINE_IDS (rankFocusKeys iterates every id)", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      expect(LEARNING_RELATIONSHIPS[id], `${id}: defined`).toBeDefined();
    }
  });

  it("every engine has >= 2 relationships (the judge mandate floor)", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      expect(relationshipsOf(id).length, `${id}: >= 2 relationships`).toBeGreaterThanOrEqual(2);
    }
  });

  it("every entry is well-formed: non-empty phrases and keys, positive integer priority, unique per engine", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const priorities = new Set<number>();
      const phrases = new Set<string>();
      for (const entry of relationshipsOf(id)) {
        expect(entry.phrases.length, `${id}: phrases non-empty`).toBeGreaterThan(0);
        expect(entry.keys.length, `${id}: keys non-empty`).toBeGreaterThan(0);
        expect(Number.isInteger(entry.priority), `${id}: priority integer`).toBe(true);
        expect(entry.priority, `${id}: priority positive`).toBeGreaterThanOrEqual(1);
        expect(priorities.has(entry.priority), `${id}: priority unique`).toBe(false);
        priorities.add(entry.priority);
        for (const phrase of entry.phrases) {
          expect(phrase.length, `${id}: phrase non-empty`).toBeGreaterThan(0);
          expect(phrase, `${id}: phrase lowercased`).toBe(phrase.toLowerCase());
          expect(phrases.has(phrase), `${id}: phrase "${phrase}" unique per engine`).toBe(false);
          phrases.add(phrase);
        }
      }
    }
  });

  it("every entry key is a member of ENGINE_CATALOG[engine].parameterKeys", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const params = ENGINE_CATALOG[id].parameterKeys;
      for (const entry of relationshipsOf(id)) {
        for (const key of entry.keys) {
          expect(params, `${id}: relationship key "${key}" in engine parameterKeys`).toContain(key);
        }
      }
    }
  });

  it("full parameter-key coverage: every engine parameter key is reachable by at least one relationship", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const reachable = new Set(relationshipsOf(id).flatMap((r) => r.keys));
      for (const key of ENGINE_CATALOG[id].parameterKeys) {
        expect(reachable.has(key), `${id}: parameter key "${key}" reachable by a relationship`).toBe(true);
      }
    }
  });
});

describe("LEARNING_RELATIONSHIPS — judge-mandate pins (phrase -> keys, verbatim from the mandate)", () => {
  it("orbits: period|slower|faster|speed -> [speed, distance]; wider|elliptical|eccentric -> [speed, eccentricity]", () => {
    expect(relationshipFor("orbits", "period").keys).toEqual(["speed", "distance"]);
    expect(relationshipFor("orbits", "wider").keys).toEqual(["speed", "eccentricity"]);
  });

  it("charges: force|attract|repel -> [q1, q2]; weaker|farther -> [separation]", () => {
    expect(relationshipFor("charges", "attract").keys).toEqual(["q1", "q2"]);
    expect(relationshipFor("charges", "weaker").keys).toEqual(["separation"]);
  });

  it("waves: frequency|pitch -> [frequency]; spacing|pattern -> [wavelength, separation]", () => {
    expect(relationshipFor("waves", "frequency").keys).toEqual(["frequency"]);
    expect(relationshipFor("waves", "spacing").keys).toEqual(["wavelength", "separation"]);
  });

  it("gas: temperature|hot -> [temperature]; speed|fast -> [speedScale]", () => {
    expect(relationshipFor("gas", "hot").keys).toEqual(["temperature"]);
    expect(relationshipFor("gas", "fast").keys).toEqual(["speedScale"]);
  });
});

// ---------------------------------------------------------------------------
// 2. FOCUS_VARIABLE_WORDS — mirror of the intent layer's explicit-learner-
//    variable parser (route.ts VARIABLE_WORDS, lines 57-75). route.ts is
//    frozen and does not export the table, so the ranking layer mirrors it
//    here; this test pins the mirror to the frozen source verbatim so a
//    future drift fails loudly instead of silently diverging.
// ---------------------------------------------------------------------------

describe("FOCUS_VARIABLE_WORDS — explicit-learner-variable mirror", () => {
  it("mirrors route.ts VARIABLE_WORDS verbatim (the frozen intent parser)", () => {
    expect(FOCUS_VARIABLE_WORDS).toEqual({
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
    });
  });
});

// ---------------------------------------------------------------------------
// 3. rankFocusKeys — the 4-step precedence contract (RED until the canonical-
//    state architect exports it from materialize.ts per docs/focus-ranking.md)
//
// Contract (verbatim, docs/focus-ranking.md):
//   rankFocusKeys(engineId, normalizedQuery, modelFocusKeys, opts?) -> string[]
//   1. explicit learner variable: FOCUS_VARIABLE_WORDS phrase mentioned in the
//      query, key filtered to ENGINE_CATALOG[engineId].parameterKeys (declaration
//      order of FOCUS_VARIABLE_WORDS);
//   2. catalog relationship match: every LEARNING_RELATIONSHIPS[engineId] entry
//      (ascending priority) whose any phrase is contained in the query, its
//      keys appended (deduped);
//   3. model-suggested valid keys: modelFocusKeys filtered to the engine's
//      parameterKeys, in model order, deduped;
//   4. curated default: when the result is empty, the top-priority
//      ENGINE_CONTROL_CATALOG entry key.
//   opts.oneVariableMode -> result.slice(0, 1).
// ---------------------------------------------------------------------------

type RankOptions = { oneVariableMode?: boolean };

type RankFocusKeysFn = (
  engineId: VerifiedEngineId,
  normalizedQuery: string,
  modelFocusKeys: string[],
  opts?: RankOptions,
) => string[];

async function rankFocusKeys(
  engineId: VerifiedEngineId,
  normalizedQuery: string,
  modelFocusKeys: string[],
  opts?: RankOptions,
): Promise<string[]> {
  // Dynamic import: the ranking block must fail RED in isolation while the
  // data contract above stays GREEN. Once materialize.ts exports the
  // function, the import resolves and these tests run.
  const mod = (await import(
    "@/demonstrations/generation/controls/materialize"
  )) as Record<string, unknown>;
  const fn = mod.rankFocusKeys as RankFocusKeysFn | undefined;
  expect(
    fn,
    "rankFocusKeys not yet exported by materialize.ts — pending canonical-state-architect implementation per docs/focus-ranking.md",
  ).toBeTypeOf("function");
  return fn!(engineId, normalizedQuery, modelFocusKeys, opts);
}

describe("rankFocusKeys — precedence contract (4-step deterministic ranking)", () => {
  it("step 2: period-implied query maps to the orbit relationship keys [speed, distance]", async () => {
    const keys = await rankFocusKeys("orbits", "what changes the period of the orbit", []);
    expect(keys).toEqual(["speed", "distance"]);
  });

  it("step 2: 'make the orbit wider' maps to [speed, eccentricity]", async () => {
    const keys = await rankFocusKeys("orbits", "make the orbit wider", []);
    expect(keys).toEqual(["speed", "eccentricity"]);
  });

  it("step 2: 'how does frequency change the pattern' -> [frequency, wavelength, separation] (every matching entry, priority order)", async () => {
    const keys = await rankFocusKeys("waves", "how does frequency change the pattern", []);
    expect(keys).toEqual(["frequency", "wavelength", "separation"]);
  });

  it("step 2: charges attraction query maps to [q1, q2]", async () => {
    const keys = await rankFocusKeys("charges", "why do opposite charges attract", []);
    expect(keys).toEqual(["q1", "q2"]);
  });

  it("step 1 before step 3: explicit learner variable outranks model-suggested keys", async () => {
    const keys = await rankFocusKeys("orbits", "does speed matter", ["eccentricity"]);
    expect(keys[0]).toBe("speed");
    expect(keys).toEqual(["speed", "distance", "eccentricity"]);
  });

  it("step 1 before step 2: explicit 'length' leads, relationship 'period' keys follow deduped", async () => {
    const keys = await rankFocusKeys("pendulum", "does length change the period", []);
    expect(keys).toEqual(["length", "gravity"]);
  });

  it("step 2 fallback for a variable word that is not an engine key: pendulum 'angle' maps to [amplitude]", async () => {
    const keys = await rankFocusKeys("pendulum", "does the angle matter", []);
    expect(keys).toEqual(["amplitude"]);
  });

  it("step 2 fallback for a variable word that is not an engine key: gas 'faster' maps to [speedScale]", async () => {
    const keys = await rankFocusKeys("gas", "make the gas faster", []);
    expect(keys).toEqual(["speedScale"]);
  });

  it("step 3: invalid model keys are dropped, valid ones kept in model order", async () => {
    const keys = await rankFocusKeys("orbits", "show me the orbit", ["bogus_key", "eccentricity"]);
    expect(keys).toEqual(["eccentricity"]);
  });

  it("step 3: model keys are deduped", async () => {
    const keys = await rankFocusKeys("orbits", "does speed matter", ["speed", "speed", "eccentricity"]);
    expect(keys).toEqual(["speed", "distance", "eccentricity"]);
  });

  it("steps 3-4: only invalid model keys -> curated default (top-priority catalog entry)", async () => {
    const keys = await rankFocusKeys("orbits", "show me the orbit", ["bogus1", "bogus2"]);
    expect(keys).toEqual(["speed"]);
  });

  it("step 4: empty query + empty model keys -> curated default (top-priority catalog entry)", async () => {
    const keys = await rankFocusKeys("orbits", "", []);
    expect(keys).toEqual(["speed"]);
  });

  it("oneVariableMode: single top key from the ranked list", async () => {
    const keys = await rankFocusKeys("orbits", "make the orbit wider", [], { oneVariableMode: true });
    expect(keys).toEqual(["speed"]);
  });

  it("oneVariableMode: single top key even with a matching explicit variable and model keys", async () => {
    const keys = await rankFocusKeys("orbits", "does speed matter", ["eccentricity"], {
      oneVariableMode: true,
    });
    expect(keys).toEqual(["speed"]);
  });
});
