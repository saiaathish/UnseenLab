/**
 * trust-wiring.test.ts — judge-upgrade Round 2, canonical-state architect.
 *
 * ONE trust function used by every path: `resolveTrustIntent(normalizedRequest,
 * verifiedEngineMatch)` (src/demonstrations/generation/intent/route.ts), which
 * delegates to the evaluation-director's decision table
 * (src/demonstrations/generation/trust/decision-table.ts — the single DECISION
 * source). These tests prove identical classification across every call site:
 *
 *   (a) route.ts candidate trust === resolveTrustIntent === pipeline
 *       cross-check outcome, for the 9 decision-table cases + 6 more
 *       (incl. engine queries);
 *   (b) model-output cross-check: a model spec whose trust differs from the
 *       table decision -> trust_mismatch -> deterministic offline fallback
 *       (never a wrong-level spec);
 *   (c) clarification behavior: the table's clarify == the router's clarify;
 *   (d) engine queries: candidate Level 1 ONLY with a real verified engine
 *       match (wording can never fabricate an engine);
 *   (e) offline generation: offline specs carry the table's level where a
 *       curated artifact exists; where the table says Level 3 but only a
 *       Level 2 template exists (predator-prey cycle, photosynthesis
 *       sequence), the offline fallback emits the curated template and the
 *       row is marked for holdout fallback-exclusion — a documented
 *       divergence, never a silent retarget;
 *   (f) rankFocusKeys — the 4-step precedence (explicit learner variable ->
 *       catalog relationship match -> model-suggested valid keys -> curated
 *       default) and the oneVariableMode single-top-key contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences, type LearnerPreferences } from "@/domain/learner";
import {
  interpret,
  resolveTrustIntent,
  markTrustFallbackExclusion,
  type InterpretResult,
} from "@/demonstrations/generation/intent/route";
import { normalizeRequest } from "@/demonstrations/generation/intent/normalize";
import type { IntentSpec } from "@/demonstrations/generation/intent/types";
import { resolveTrustLevel } from "@/demonstrations/generation/trust/decision-table";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import {
  generateDemo,
  resetGenerationCircuit,
  specMatchesIntent,
  type GenerateDemoResult,
  type GenerationData,
} from "@/demonstrations/generation/model/pipeline";
import {
  rankFocusKeys,
  materializeControls,
} from "@/demonstrations/generation/controls/materialize";
import { ENGINE_CONTROL_CATALOG } from "@/demonstrations/generation/controls/catalog";
import {
  ENGINE_CATALOG,
  VERIFIED_ENGINE_IDS,
  type DemoSpecV1,
  type TrustLevel,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import type { TrustResolution } from "@/demonstrations/generation/trust/decision-table";

const prefs: LearnerPreferences = createDefaultPreferences();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Relabel a curated offline spec as model-authored (the shape a validated
 * model spec takes: provenance model_generated_spec, never prediction truth). */
function asModelSpec(spec: DemoSpecV1): DemoSpecV1 {
  return {
    ...spec,
    provenance: { ...spec.provenance, source: "model_generated_spec" },
    prediction: { ...spec.prediction, correctIndex: undefined },
  };
}

/** A validator-clean spec at a given trust level (relabeled curated artifact).
 * For verified_simulation the spec must carry the intent's engine, so the
 * caller passes a query that routes to it. When the base artifact is at a
 * different level, trust.level is forced to the requested level (the
 * cross-check reads spec.trust.level; the escalation pins need the fixture
 * AT the requested level). */
function specAtLevel(level: TrustLevel, queryForEngine?: string): DemoSpecV1 {
  const byLevel: Record<TrustLevel, string> = {
    verified_simulation: queryForEngine ?? "show why planets stay in orbit",
    conceptual_demonstration: "show how predator prey population sizes influence each other",
    explanatory_animation: "show the stages of mitosis",
  };
  const result = generateOfflineDemo(byLevel[level], prefs);
  if (result.status !== "spec" || !result.spec) {
    throw new Error(`offline generator did not produce a ${level} spec`);
  }
  const spec = asModelSpec(result.spec);
  return spec.trust.level === level
    ? spec
    : { ...spec, trust: { ...spec.trust, level } };
}

/** The trust ordering: Level 3 (explanatory) is the least trusted, Level 1
 * (verified) the most — mirroring the pipeline's cross-check (spec may never
 * claim MORE trust than the routed candidate). */
const TRUST_ORDER: TrustLevel[] = [
  "explanatory_animation",
  "conceptual_demonstration",
  "verified_simulation",
];

function moreTrustedThan(level: TrustLevel): TrustLevel | null {
  const idx = TRUST_ORDER.indexOf(level);
  return idx >= 0 && idx < TRUST_ORDER.length - 1 ? TRUST_ORDER[idx + 1] : null;
}

function intentOf(query: string): IntentSpec {
  const result: InterpretResult = interpret(query, prefs);
  if ("status" in result) {
    throw new Error(`interpret returned ${result.status} for "${query}"`);
  }
  return result;
}

function expectData(result: GenerateDemoResult): GenerationData {
  if (!("data" in result)) {
    throw new Error(`expected a data envelope, got ${JSON.stringify(result)}`);
  }
  return result.data;
}

function expectSpecData(
  result: GenerateDemoResult,
): Extract<GenerationData, { outcome: "spec" }> {
  const data = expectData(result);
  if (data.outcome !== "spec") {
    throw new Error(`expected outcome "spec", got ${JSON.stringify(data)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// (a) The corpus: 9 decision-table cases + 6 more (incl. engine queries)
// ---------------------------------------------------------------------------
// [id, query, expected table resolution (null engine match), effective
//  candidate trust, route kind] — the 4th element is TrustResolution because
//  case 9's candidate is the clarify envelope itself.
const CORPUS: Array<[string, string, TrustResolution, TrustResolution, string]> = [
  // --- the 9 decision-table cases (docs/trust-decision-table.md section 2) ---
  ["case1-predator-relationship", "show how predator prey population sizes influence each other", "conceptual_demonstration", "conceptual_demonstration", "template"],
  ["case2-predator-cycle", "walk me through the predator prey cycle over time", "explanatory_animation", "explanatory_animation", "template"],
  ["case3-graphite-diamond", "compare and contrast the structure of graphite and diamond", "conceptual_demonstration", "conceptual_demonstration", "template"],
  ["case4-bond-comparison", "show the difference between a covalent bond and an ionic bond", "conceptual_demonstration", "conceptual_demonstration", "template"],
  ["case5-mitosis-stages", "show the stages of mitosis", "explanatory_animation", "explanatory_animation", "timeline"],
  ["case6-photosynthesis-transfer", "show how photosynthesis transfers energy", "conceptual_demonstration", "conceptual_demonstration", "template"],
  ["case7-photosynthesis-sequence", "walk through the steps of photosynthesis in order", "explanatory_animation", "explanatory_animation", "template"],
  ["case8-neural-network", "walk through how information flows through a neural network from input to output", "explanatory_animation", "explanatory_animation", "unsupported"],
  ["case9-show-cells", "show cells", "clarify", "clarify", "clarify"],
  // --- +6 more, incl. engine queries ---
  ["extra-orbits", "show why planets stay in orbit", "verified_simulation", "verified_simulation", "engine"],
  ["extra-charges-force", "visualize how the electric force between two charges shrinks as they separate", "verified_simulation", "verified_simulation", "engine"],
  ["extra-orbits-compare", "compare the orbits of two planets", "verified_simulation", "verified_simulation", "engine"],
  ["extra-misleading-hydrologic", "build a verified simulation showing water climbing through every stage of the hydrologic cycle", "explanatory_animation", "explanatory_animation", "timeline"],
  ["extra-pendulum-period", "what determines the period of a pendulum", "verified_simulation", "verified_simulation", "engine"],
  // Markerless routed request: the table cannot classify the query's words
  // (no intent marker, no engine) -> "clarify"; the curated artifact's level
  // is the documented sanity fallback (task 3a). Not raw-equal by design.
  ["extra-mitosis-bare", "show me mitosis", "clarify", "explanatory_animation", "timeline"],
];

describe("(a) ONE trust function — identical classification across call sites", () => {
  it.each(CORPUS)(
    "%s: candidate trust === resolveTrustIntent === cross-check outcome",
    (_id, query, _tableResolution, expectedCandidate, kind) => {
      const result: InterpretResult = interpret(query, prefs);
      const req = normalizeRequest(query, prefs);

      if (kind === "unsupported") {
        // No-path topic: the intent layer returns the safe envelope BEFORE any
        // trust decision; the table still pins the policy classification.
        expect(result).toMatchObject({ status: "unsupported" });
        expect(resolveTrustIntent(req, null)).toBe("explanatory_animation");
        return;
      }
      if (kind === "clarify") {
        // Clarify is a category, not a level: both the router and the table
        // agree the request is ambiguous (see (c) for the full pin).
        expect(result).toMatchObject({ status: "clarify" });
        expect(resolveTrustIntent(req, null)).toBe("clarify");
        return;
      }

      // Route.ts candidate trust (what every downstream consumer reads).
      // (Narrowed: the clarify/unsupported kinds returned above; for every
      // remaining row the effective candidate is a real trust level.)
      const expectedLevel = expectedCandidate as TrustLevel;
      const intent = result as IntentSpec;
      expect(intent.candidate_trust_level).toBe(expectedLevel);

      // resolveTrustIntent — the single function, with the engine the runtime
      // actually matched (only real verified engine ids count).
      const engineMatch: VerifiedEngineId | null =
        intent.candidate_engine_ids[0] ?? null;
      const tableDecision = resolveTrustIntent(req, engineMatch);
      if (tableDecision === "clarify") {
        // Documented sanity fallback (extra-mitosis-bare): the query's words
        // carry no marker class, so the table asks for clarification; the
        // curated artifact's own level stands as the candidate.
        expect(expectedLevel).toBe("explanatory_animation");
        expect(intent.timeline_topic).toBeDefined();
      } else {
        expect(tableDecision).toBe(expectedLevel);
      }

      // The pipeline cross-check outcome: a spec AT the candidate level is
      // accepted; a spec claiming MORE trust is rejected (never a wrong-level
      // spec on the hosted path).
      const specAtCandidate = specAtLevel(expectedLevel, query);
      expect(specMatchesIntent(specAtCandidate, intent)).toBe(true);

      const escalated = moreTrustedThan(expectedLevel);
      if (escalated !== null) {
        expect(specMatchesIntent(specAtLevel(escalated), intent)).toBe(false);
      }
      if (expectedLevel === "verified_simulation") {
        // Verified candidates additionally pin the engine: a verified spec on
        // a DIFFERENT engine is rejected.
        const wrongEngine = asModelSpec(specAtLevel("verified_simulation"));
        if (intent.candidate_engine_ids.length > 0 && wrongEngine.simulation) {
          const other = intent.candidate_engine_ids[0] === "orbits" ? "pendulum" : "orbits";
          wrongEngine.simulation = { ...wrongEngine.simulation, engineId: other };
          expect(specMatchesIntent(wrongEngine, intent)).toBe(false);
        }
      }
    },
  );

  it("the table itself agrees with resolveTrustIntent (delegation, no second precedence)", () => {
    // resolveTrustIntent must be a pure adapter over the table's
    // resolveTrustLevel — the same resolution for the same (query, engine).
    for (const [rowId, query, tableResolution, , kind] of CORPUS) {
      void rowId; // corpus row id is part of the conformance record
      if (kind === "unsupported" || kind === "clarify") continue;
      const req = normalizeRequest(query, prefs);
      const intent = intentOf(query);
      const engineMatch: VerifiedEngineId | null =
        intent.candidate_engine_ids[0] ?? null;
      const viaTable = resolveTrustLevel(
        req.query,
        {
          learner_goal: intent.learner_goal,
          requested_relationship: intent.requested_relationship,
          candidate_trust_level: intent.candidate_trust_level,
          candidate_engine_ids: intent.candidate_engine_ids,
          candidate_template_ids: intent.candidate_template_ids,
        },
        engineMatch,
      );
      expect(resolveTrustIntent(req, engineMatch), query).toBe(viaTable);
      expect(viaTable, query).toBe(tableResolution);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) Model-output cross-check: wrong-level model spec -> trust_mismatch ->
//     deterministic offline fallback (never a wrong-level spec)
// ---------------------------------------------------------------------------

describe("(b) model-output cross-check — trust_mismatch falls back deterministically", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LLM_API_KEY = "test-key";
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_DISABLE_THINKING;
    resetGenerationCircuit();
  });

  afterEach(() => {
    delete process.env.LLM_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function chatCompletion(content: string): Response {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("a model Level 2 spec for a table-Level-3 query is rejected and the deterministic offline artifact is returned", async () => {
    // Table decision for the predator-prey cycle walkthrough is Level 3; the
    // model answers with a Level 2 (template-shaped) spec — schema-valid, so
    // only the trust cross-check can catch it.
    const wrongLevel = asModelSpec(
      generateOfflineDemo("show how predator prey population sizes influence each other", prefs).spec!,
    );
    fetchMock.mockResolvedValue(chatCompletion(JSON.stringify(wrongLevel)));

    const result = await generateDemo("walk me through the predator prey cycle over time", prefs);
    const data = expectSpecData(result);
    // Never the wrong-level model spec: deterministic offline fallback.
    expect(data.source).toBe("offline");
    expect(data.reason).toBe("trust_mismatch");
    expect(data.spec.trust.level).toBe("conceptual_demonstration");
    expect(data.spec.provenance.source).toBe("template_composition");
    // The fallback equals the deterministic offline artifact for the query
    // (documented divergence: table L3, curated L2 template — excluded).
    const offline = generateOfflineDemo("walk me through the predator prey cycle over time", prefs);
    if (offline.status !== "spec" || !offline.spec) throw new Error("no offline spec");
    expect(data.spec.id).toBe(offline.spec.id);
    expect(data.spec.trust.level).toBe(offline.spec.trust.level);
  });

  it("a model Level 1 spec for a table-Level-1 query on the WRONG engine is rejected (verified engine pin)", async () => {
    // A validator-clean pendulum spec (parameters/engine/trust all pendulum)
    // answering an orbits query: schema-valid, so only the engine pin inside
    // the trust cross-check can catch it.
    const wrongEngine = asModelSpec(
      generateOfflineDemo("what determines the period of a pendulum", prefs).spec!,
    );
    // Fresh Response per call: a Response body can only be read once, and the
    // repair retry issues a second request.
    fetchMock.mockImplementation(() =>
      Promise.resolve(chatCompletion(JSON.stringify(wrongEngine))),
    );

    const result = await generateDemo("show why planets stay in orbit", prefs);
    const data = expectSpecData(result);
    expect(data.source).toBe("offline");
    expect(data.reason).toBe("trust_mismatch");
    expect(data.spec.simulation!.engineId).toBe("orbits");
  });

  it("a model spec AT the table's level for the same query is accepted (hosted path, no fallback)", async () => {
    const correct = asModelSpec(
      generateOfflineDemo("show the stages of mitosis", prefs).spec!,
    );
    fetchMock.mockResolvedValue(chatCompletion(JSON.stringify(correct)));

    const result = await generateDemo("show the stages of mitosis", prefs);
    const data = expectSpecData(result);
    expect(data.source).toBe("model");
    expect(data.spec.trust.level).toBe("explanatory_animation");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// (c) Clarification behavior: the table's clarify == the router's clarify
// ---------------------------------------------------------------------------

describe("(c) clarification behavior — one function, one clarify", () => {
  it.each([
    "show cells",
    "explain motion",
    "what exactly is a molecule",
  ])("ambiguous query %j: router clarify <-> table clarify", (query) => {
    const result: InterpretResult = interpret(query, prefs);
    expect(result).toMatchObject({ status: "clarify" });
    expect(resolveTrustIntent(normalizeRequest(query, prefs), null)).toBe("clarify");
    // The offline generator asks the SAME question (it routes through
    // interpret, never a second copy of the ambiguity logic).
    const offline = generateOfflineDemo(query, prefs);
    expect(offline.status).toBe("clarify");
    if ("status" in result && result.status === "clarify" && offline.status === "clarify") {
      expect(offline.question).toBe(result.question);
    }
  });

  it("the cells-specific clarification question is the router's single question (never a guessed spec)", () => {
    const result = interpret("show cells", prefs);
    if (!("status" in result) || result.status !== "clarify") {
      throw new Error("expected clarify");
    }
    expect(result.question).toContain("mitosis");
    expect(result.question).toContain("transcription");
    expect(resolveTrustIntent(normalizeRequest("show cells", prefs), null)).toBe("clarify");
  });
});

// ---------------------------------------------------------------------------
// (d) Engine queries: candidate Level 1 only with a real verified engine match
// ---------------------------------------------------------------------------

describe("(d) engine queries — Level 1 only with a real engine match", () => {
  it.each([
    "show why planets stay in orbit",
    "visualize how the electric force between two charges shrinks as they separate",
    "compare the orbits of two planets",
    "what determines the period of a pendulum",
  ])("routes %j to a Level 1 candidate with a verified engine", (query) => {
    const intent = intentOf(query);
    expect(intent.candidate_trust_level).toBe("verified_simulation");
    expect(intent.candidate_engine_ids.length).toBeGreaterThanOrEqual(1);
    expect(
      resolveTrustIntent(normalizeRequest(query, prefs), intent.candidate_engine_ids[0]),
    ).toBe("verified_simulation");
  });

  it("wording alone can never fabricate an engine (escalation guard): 'verified simulation' phrasing without an engine resolves below Level 1", () => {
    const query = "build a verified simulation showing water climbing through every stage of the hydrologic cycle";
    const req = normalizeRequest(query, prefs);
    const intent = intentOf(query);
    expect(intent.candidate_trust_level).toBe("explanatory_animation");
    expect(intent.candidate_engine_ids).toEqual([]);
    expect(resolveTrustIntent(req, null)).toBe("explanatory_animation");
    // Defense in depth: an id outside the verified catalog is never a match.
    expect(
      resolveTrustIntent(req, "not_an_engine" as unknown as VerifiedEngineId),
    ).toBe("explanatory_animation");
  });

  it("candidate Level 1 exactly when the table's engine rule fires — resolveTrustIntent with no engine for an engine-less marker query stays below Level 1", () => {
    const req = normalizeRequest("show the stages of mitosis", prefs);
    expect(resolveTrustIntent(req, null)).toBe("explanatory_animation");
  });
});

// ---------------------------------------------------------------------------
// (e) Offline generation: the table's level where a curated artifact exists;
//     documented divergences are marked, never silently retargeted
// ---------------------------------------------------------------------------

describe("(e) offline generation — table level where a curated artifact exists", () => {
  it.each([
    ["show the stages of mitosis", "explanatory_animation"],
    ["show how photosynthesis transfers energy", "conceptual_demonstration"],
    ["show why planets stay in orbit", "verified_simulation"],
    ["show me mitosis", "explanatory_animation"], // sanity fallback (curated L3 artifact)
  ] as Array<[string, TrustLevel]>)(
    "%j emits a spec carrying the table's level %s",
    (query, expected) => {
      const offline = generateOfflineDemo(query, prefs);
      expect(offline.status).toBe("spec");
      expect(offline.spec!.trust.level).toBe(expected);
      const tableDecision = resolveTrustIntent(normalizeRequest(query, prefs), null);
      if (tableDecision !== "clarify") {
        expect(offline.spec!.trust.level).toBe(tableDecision);
      }
    },
  );

  it("documented divergence (fallback-exclusion): table says Level 3, only a Level 2 template exists — the offline path emits the curated template and marks the row", () => {
    const query = "walk me through the predator prey cycle over time";
    const offline = generateOfflineDemo(query, prefs);
    expect(offline.status).toBe("spec");
    const spec = offline.spec!;
    // The curated artifact is emitted as-is (NOT retargeted to a fake L3):
    expect(spec.trust.level).toBe("conceptual_demonstration");
    expect(spec.provenance.templateIds).toContain("particle_population");
    expect(spec.provenance.source).toBe("template_composition");
    // The row is marked for holdout fallback-exclusion (META
    // hostedPathFallbackExclusions: decision-predator-cycle) — documented,
    // never silent.
    expect(resolveTrustIntent(normalizeRequest(query, prefs), null)).toBe(
      "explanatory_animation",
    );
    expect(markTrustFallbackExclusion(query)).toBe(true);
  });

  it("documented divergence (fallback-exclusion): photosynthesis sequence (table L3, curated L2 energy_transfer template)", () => {
    const query = "walk through the steps of photosynthesis in order";
    const offline = generateOfflineDemo(query, prefs);
    expect(offline.status).toBe("spec");
    expect(offline.spec!.trust.level).toBe("conceptual_demonstration");
    expect(offline.spec!.provenance.templateIds).toContain("energy_transfer");
    expect(resolveTrustIntent(normalizeRequest(query, prefs), null)).toBe(
      "explanatory_animation",
    );
    expect(markTrustFallbackExclusion(query)).toBe(true);
  });

  it("a table-Level-3 row WITH a curated Level 3 artifact is NOT a fallback exclusion", () => {
    expect(markTrustFallbackExclusion("show the stages of mitosis")).toBe(false);
    expect(markTrustFallbackExclusion("show how photosynthesis transfers energy")).toBe(false);
    expect(markTrustFallbackExclusion("show why planets stay in orbit")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (f) rankFocusKeys — the single ranking function, consumed by
//     materializeControls (4-step precedence per docs/focus-ranking.md; the
//     exact per-case pins live in the FROZEN evaluation manifest
//     tests/demonstrations/trust/focus-ranking.test.ts — this block pins the
//     WIRING and the invariants, not the per-case list)
// ---------------------------------------------------------------------------

describe("(f) rankFocusKeys — wiring and invariants", () => {
  const ORBITS_QUERY = "show why planets stay in orbit";

  it("materializeControls consumes rankFocusKeys: learner signals beat the model's focus keys end-to-end", () => {
    const modelSpec = asModelSpec(
      generateOfflineDemo(ORBITS_QUERY, { ...prefs, oneVariableMode: false }).spec!,
    );
    const spec: DemoSpecV1 = {
      ...modelSpec,
      // The curated showcase hardcodes oneVariableMode: true; mirror the
      // learner preference like the pipeline fixture does.
      adaptationContext: { ...modelSpec.adaptationContext, oneVariableMode: false },
      simulation: {
        ...modelSpec.simulation!,
        focusParameterKeys: ["eccentricity"], // the model's (valid) suggestion
      },
    };
    // "speed" is an explicit learner variable AND an orbit relationship
    // phrase: tiers 1-2 lead, the model's key follows (deduped).
    const out = materializeControls(spec, { query: "does speed matter" });
    const refs = out.controls
      .filter((c) => c.target.kind === "parameter")
      .map((c) => c.target.ref);
    expect(refs).toEqual(["speed", "distance", "eccentricity"]);
  });

  it("materializeControls keeps its count guarantee on the curated default (top-up to 2)", () => {
    const modelSpec = asModelSpec(
      generateOfflineDemo(ORBITS_QUERY, { ...prefs, oneVariableMode: false }).spec!,
    );
    const spec: DemoSpecV1 = {
      ...modelSpec,
      adaptationContext: { ...modelSpec.adaptationContext, oneVariableMode: false },
    };
    // No learner signal, no model keys: tier 4 default (top-1) topped up to
    // the two highest-priority catalog entries.
    const out = materializeControls(spec, { query: ORBITS_QUERY });
    const refs = out.controls
      .filter((c) => c.target.kind === "parameter")
      .map((c) => c.target.ref);
    expect(refs).toEqual(ENGINE_CONTROL_CATALOG.orbits.slice(0, 2).map((e) => e.key));
  });

  it("oneVariableMode -> a single top-ranked control through the full materialization", () => {
    const modelSpec = asModelSpec(generateOfflineDemo(ORBITS_QUERY, prefs).spec!);
    const out = materializeControls(modelSpec, { query: "does speed matter" });
    const refs = out.controls
      .filter((c) => c.target.kind === "parameter")
      .map((c) => c.target.ref);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toBe("speed");
  });

  it("rankFocusKeys is never empty and never emits a non-engine key (every engine)", () => {
    for (const engineId of VERIFIED_ENGINE_IDS) {
      const params = ENGINE_CATALOG[engineId].parameterKeys;
      for (const query of ["show me the orbit", "does speed matter", ""]) {
        const ranked = rankFocusKeys(engineId, query, ["bogus_key"]);
        expect(ranked.length, `${engineId}/${query}`).toBeGreaterThanOrEqual(1);
        for (const key of ranked) {
          expect(params, `${engineId}/${query}: ${key}`).toContain(key);
        }
        expect(new Set(ranked).size, `${engineId}/${query}: deduped`).toBe(ranked.length);
      }
    }
  });

  it("tiers combine deterministically: explicit variable, relationship, and model keys all contribute", () => {
    // Tier 1 ("speed") + tier 2 ("speed" phrase -> speed,distance) + tier 3
    // (model "eccentricity") — deduped, learner signals first.
    expect(rankFocusKeys("orbits", "does speed matter", ["eccentricity"])).toEqual([
      "speed",
      "distance",
      "eccentricity",
    ]);
    // oneVariableMode slices to the single top key.
    expect(
      rankFocusKeys("orbits", "does speed matter", ["eccentricity"], {
        oneVariableMode: true,
      }),
    ).toEqual(["speed"]);
  });
});
