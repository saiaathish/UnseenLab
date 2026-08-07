/**
 * decision-table.test.ts — PHASE 2A deterministic trust decision table
 * (evaluation-director, UNSEENLAB PHASE 1-2 CLOSURE).
 *
 * The table resolves the trust level from LEARNER INTENT, not topic name:
 *   1. verified engine match                  -> Level 1 verified_simulation
 *   2. explicit staged/sequential/cyclic/
 *      over-time request (L3 markers)         -> Level 3 explanatory_animation
 *   3. explicit comparison/relationship/
 *      effect/structure request (L2 markers)  -> Level 2 conceptual_demonstration
 *   4. neither, and no engine                 -> "clarify" (one question,
 *                                                 never a guessed spec)
 *
 * The nine required cases below are the frozen spec. Rows 1-9 are the
 * evaluation-director mandate; the "precedence" describe block pins the
 * ordering rules; the "conformance" describe block pins agreement with the
 * UNCHANGED v2 gold corpus (docs/holdout-2026-08-06-v2.md) except the one
 * documented, deliberate divergence (bio-photosynthesis-2, see row comments).
 */

import { describe, expect, it } from "vitest";
import {
  resolveTrustLevel,
  type TrustIntentInput,
  type TrustResolution,
} from "@/demonstrations/generation/trust/decision-table";
import type { VerifiedEngineId } from "@/demonstrations/spec/demo-spec";

/** Neutral intent envelope: no router-committed route, no relationship. */
function intent(overrides: Partial<TrustIntentInput> = {}): TrustIntentInput {
  return {
    learner_goal: "explore and understand",
    requested_relationship: null,
    candidate_trust_level: "conceptual_demonstration",
    candidate_engine_ids: [],
    candidate_template_ids: [],
    ...overrides,
  };
}

/** Resolve with a clean intent and an optional verified engine match. */
function resolve(
  query: string,
  engineMatch: VerifiedEngineId | null = null,
): TrustResolution {
  return resolveTrustLevel(query, intent(), engineMatch);
}

describe("PHASE 2A decision table — the nine required cases", () => {
  it.each([
    // ------------------------------------------------------------------
    // Learner intent -> Level 2 (comparison/relationship/effect/structure)
    // ------------------------------------------------------------------
    [
      "predator-prey relationship",
      "show how predator prey population sizes influence each other",
      null,
      "conceptual_demonstration",
    ],
    [
      "graphite versus diamond",
      "compare and contrast the structure of graphite and diamond",
      null,
      "conceptual_demonstration",
    ],
    [
      "chemical-bond comparison",
      "show the difference between a covalent bond and an ionic bond",
      null,
      "conceptual_demonstration",
    ],
    [
      "photosynthesis energy transfer",
      "show how photosynthesis transfers energy",
      null,
      "conceptual_demonstration",
    ],
    // ------------------------------------------------------------------
    // Learner intent -> Level 3 (staged/sequential/cyclic/over-time)
    // ------------------------------------------------------------------
    [
      "predator-prey cycle walkthrough",
      "walk me through the predator prey cycle over time",
      null,
      "explanatory_animation",
    ],
    [
      "mitosis stages",
      "show the stages of mitosis",
      null,
      "explanatory_animation",
    ],
    [
      "photosynthesis process sequence",
      "walk through the steps of photosynthesis in order",
      null,
      "explanatory_animation",
    ],
  ] as Array<[string, string, VerifiedEngineId | null, TrustResolution]>)(
    "%s -> %s",
    (_id, query, engineMatch, expected) => {
      expect(resolve(query, engineMatch)).toBe(expected);
    },
  );

  // EXCLUDED-from-holdout per approved trust policy §3/§6: neural-network
  // information flow is classified Level 3 (the forward pass is an ordered
  // sequence: input -> hidden layers -> output), but the topic is NO-PATH
  // today — the intent layer returns `unsupported` before the resolver or the
  // model ever runs — so it carries ZERO holdout golds and zero scoring rows.
  // This assertion pins the policy classification as the intent-first table
  // produces it for an ordered-walkthrough wording (which is how any future
  // gold must be worded).
  it("neural-network information flow -> Level 3 (policy §3; EXCLUDED-from-holdout)", () => {
    expect(
      resolve(
        "walk through how information flows through a neural network from input to output",
      ),
    ).toBe("explanatory_animation");
  });

  it("ambiguous 'show cells' -> clarify, never a guessed spec", () => {
    expect(resolve("show cells")).toBe("clarify");
  });
});

describe("PHASE 2A decision table — precedence rules", () => {
  it("a verified engine match wins over effect/relationship markers (Level-1 engine rules intact)", () => {
    // v2 engine golds carry effect markers and are Level 1 — the engine match
    // outranks the marker classes.
    expect(
      resolveTrustLevel(
        "visualize how the electric force between two charges shrinks as they separate",
        intent(),
        "charges",
      ),
    ).toBe("verified_simulation");
    expect(
      resolveTrustLevel(
        "demonstrate how raising the frequency squeezes the wavelength of a wave",
        intent(),
        "waves",
      ),
    ).toBe("verified_simulation");
    expect(
      resolveTrustLevel("explain how heating a gas makes its molecules move quicker", intent(), "gas"),
    ).toBe("verified_simulation");
  });

  it("a verified engine match still yields Level 1 for comparison wordings", () => {
    expect(
      resolveTrustLevel("compare the orbits of two planets", intent(), "orbits"),
    ).toBe("verified_simulation");
  });

  it("an explicit staged request beats comparison markers (L3 class is checked first)", () => {
    expect(resolve("compare the stages of mitosis")).toBe("explanatory_animation");
  });

  it("wording alone can never fabricate an engine match (escalation guard)", () => {
    // The misleading-trust v2 gold: "verified simulation" phrasing does not
    // grant Level 1 without a real curated engine; the ordered-narrative
    // intent ("every stage", "cycle") resolves to Level 3.
    expect(
      resolve(
        "build a verified simulation showing water climbing through every stage of the hydrologic cycle",
      ),
    ).toBe("explanatory_animation");
  });

  it("markerless, engine-less queries resolve to clarify — never a guessed level", () => {
    expect(resolve("what exactly is a molecule")).toBe("clarify");
    expect(resolve("explain motion")).toBe("clarify");
  });

  it("rejects engine ids outside the verified catalog at runtime (defense in depth)", () => {
    expect(
      resolveTrustLevel(
        "show orbits",
        intent(),
        "not_an_engine" as unknown as VerifiedEngineId,
      ),
    ).toBe("clarify");
  });
});

describe("PHASE 2A — conformance with the UNCHANGED v2 gold corpus", () => {
  it.each([
    // [id, query, engineMatch, expected]
    // v2 template golds (Level 2)
    ["bio-population-2", "show how predator prey population sizes influence each other", null, "conceptual_demonstration"],
    ["bio-causation-2", "show the cause and effect links between removing a top predator and the plants in a forest", null, "conceptual_demonstration"],
    ["chem-bond-comparison", "show the difference between a covalent bond and an ionic bond", null, "conceptual_demonstration"],
    ["chem-graphite-diamond", "compare and contrast the structure of graphite and diamond", null, "conceptual_demonstration"],
    // v2 timeline + hosted-path golds (Level 3)
    ["timeline-mitosis-2", "take me through what happens to chromosomes from prophase to cytokinesis", null, "explanatory_animation"],
    ["timeline-water-2", "follow a raindrop through evaporation condensation and precipitation until it lands again", null, "explanatory_animation"],
    ["timeline-transcription-2", "show the order in which rna polymerase builds messenger rna from a gene", null, "explanatory_animation"],
    ["timeline-immunity-2", "walk through what happens when an antigen triggers antibody production", null, "explanatory_animation"],
    ["bio-respiration-2", "walk through the stages where cellular respiration turns glucose into usable energy", null, "explanatory_animation"],
    ["bio-foodweb-2", "trace energy from producers through trophic levels in a grassland food web", null, "explanatory_animation"],
    ["chem-nitrogen-2", "show how nitrogen moves from the air into plants and back again in the nitrogen cycle", null, "explanatory_animation"],
    // v2 engine golds (Level 1) — effect markers present; engine match wins
    ["orbits-comet", "why does a comet whip faster as it swings close to its star", "orbits", "verified_simulation"],
    ["charges-force", "visualize how the electric force between two charges shrinks as they separate", "charges", "verified_simulation"],
    ["waves-frequency", "demonstrate how raising the frequency squeezes the wavelength of a wave", "waves", "verified_simulation"],
    ["gas-heat", "explain how heating a gas makes its molecules move quicker", "gas", "verified_simulation"],
    // v2 misleading-trust gold (Level 3 — no engine for the hydrologic cycle)
    ["trust-misleading-hydrologic", "build a verified simulation showing water climbing through every stage of the hydrologic cycle", null, "explanatory_animation"],
  ] as Array<[string, string, VerifiedEngineId | null, TrustResolution]>)(
    "%s agrees with its frozen v2 gold trust level",
    (_id, query, engineMatch, expected) => {
      expect(resolve(query, engineMatch)).toBe(expected);
    },
  );

  it("documented divergence: bio-photosynthesis-2 reads as an energy-transfer (effect) request under the new intent-first table", () => {
    // v2 gold: L3 (frozen, unchanged). New table: "convert sunlight into
    // stored chemical energy" is an energy-transfer/effect request -> L2.
    // The old gold is NOT modified (old holdouts remain unchanged); v3 gold
    // authoring must word photosynthesis process golds as ordered-stage
    // walkthroughs ("walk through the stages of photosynthesis") to earn L3.
    expect(
      resolve("how does photosynthesis convert sunlight into stored chemical energy"),
    ).toBe("conceptual_demonstration");
  });
});
