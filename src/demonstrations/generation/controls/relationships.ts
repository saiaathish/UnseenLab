/**
 * generation/controls/relationships.ts — LEARNING_RELATIONSHIPS data
 * (Round 2 judge-upgrade, evaluation-director, UNSEENLAB generative-trust-
 * controls).
 *
 * Deterministic focus-key ranking data. The judge mandate: "explicit learner
 * variable → catalog relationship match → model-suggested valid keys →
 * curated default. The model should never be the only mechanism deciding
 * whether the learner receives a relevant control."
 *
 * The v3 holdout (docs/holdout-2026-08-06-v3.md, diagnosis 3) recorded 2
 * control-relevance misses (orbits-comet-speed, resource-exhaustion-3) where
 * the model's focusParameterKeys were the SOLE selection mechanism. This
 * module supplies the second precedence tier (catalog relationship match)
 * and the explicit-learner-variable table for tier 1. rankFocusKeys() — the
 * 4-step resolver — is implemented by the canonical-state architect in
 * materialize.ts against the frozen contract in docs/focus-ranking.md; this
 * file is its DATA, owned here.
 *
 * CONTRACT (pinned by tests/demonstrations/trust/focus-ranking.test.ts):
 *   - Record<VerifiedEngineId, LearningRelationship[]> for EVERY id in
 *     VERIFIED_ENGINE_IDS,
 *   - >= 2 relationships per engine,
 *   - every entry.key member of ENGINE_CATALOG[engineId].parameterKeys, and
 *     every engine parameter key reachable by at least one relationship,
 *   - phrases lowercased, non-empty, unique within an engine (a phrase maps
 *     to exactly one entry; the highest-priority entry wins that phrase),
 *   - priority: positive integer, unique per engine, ascending = higher
 *     priority (rankFocusKeys consumes entries in ascending priority order).
 *
 * MATCH SEMANTICS (rankFocusKeys): a relationship matches when the
 * normalized (lowercased) query CONTAINS any of its phrases as a substring.
 * The keys of every matching entry are appended in ascending priority order,
 * deduped. Keys are ordered for the learner's usage order (primary driver
 * first), grounded in the engine's physics.
 *
 * GROUNDING (per engine, cited):
 *   - orbits: Kepler/energy physics — period ↔ speed + distance (third law);
 *     orbit widening ↔ speed + eccentricity; gravity ↔ g; mass ↔ bodyMass.
 *   - projectile: range ↔ angle + speed; drag ↔ drag; gravity ↔ gravity;
 *     height ↔ angle + speed.
 *   - charges: Coulomb force ↔ q1,q2; field falloff ↔ separation;
 *     field drawing ↔ fieldScale; dipole ↔ q1,q2.
 *   - waves: wavefronts ↔ frequency; fringe spacing ↔ wavelength + source
 *     separation; brightness ↔ amplitude; band swap ↔ phase; interference
 *     pattern ↔ separation + wavelength.
 *   - gas: kinetic theory — temperature ↔ temperature; molecular motion
 *     visibility ↔ speedScale; quantity ↔ particles; pressure/collisions
 *     ↔ particles + temperature; stratification ↔ gravity.
 *   - pendulum: period ↔ length + gravity (T = 2π√(L/g)); release angle
 *     ↔ amplitude; energy loss ↔ damping.
 *   - rc_circuit: time constant ↔ resistance + capacitance (τ = RC);
 *     current ↔ voltage + resistance.
 *   - reaction_diffusion: Gray-Scott — feed/kill drive pattern type;
 *     diffusion contrast drives pattern wavelength.
 *   - cellular_automaton: generation rate ↔ speed; seed population ↔ density;
 *     emergent structure ↔ density + speed.
 *   - nuclear_chain_reaction: control ↔ absorber; growth ↔ multiplication;
 *     seeding ↔ initialNeutrons; criticality ↔ multiplication + absorber.
 *
 * FOCUS_VARIABLE_WORDS mirrors the intent layer's explicit-learner-variable
 * parser (src/demonstrations/generation/intent/route.ts VARIABLE_WORDS, lines
 * 57-75) VERBATIM: route.ts is frozen (judge-upgrade round) and does not
 * export the table, so tier 1 of the ranking reuses the same mapping here.
 * The mirror is pinned by test (route.ts drift fails loudly). Values that map
 * to no engine key (e.g. "mass") are inert by construction: tier 1
 * intersects with ENGINE_CATALOG[engineId].parameterKeys.
 */

import type { VerifiedEngineId } from "@/demonstrations/spec/demo-spec";

/**
 * One phrase -> engine-key mapping for the catalog relationship tier (tier 2
 * of the focus-key ranking). `phrases` are learner-facing words a query must
 * contain to trigger this relationship; `keys` are engine-owned parameter
 * keys (ordered for learner usage); `priority` orders entries within an
 * engine (ascending = higher priority, matching the catalog convention).
 */
export type LearningRelationship = {
  phrases: string[];
  keys: string[];
  priority: number;
};

/**
 * Explicit learner variables — VERBATIM mirror of the intent layer's
 * VARIABLE_WORDS (route.ts:57-75). Tier 1 of rankFocusKeys intersects these
 * with the engine's parameterKeys.
 */
export const FOCUS_VARIABLE_WORDS: Record<string, string> = {
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

/**
 * The full relationship data. Keyed by EVERY VerifiedEngineId (the ranking
 * contract iterates all ids); every key is engine-owned (parameterKeys) and
 * the per-engine union of keys covers the engine's full parameter space.
 */
export const LEARNING_RELATIONSHIPS: Record<
  VerifiedEngineId,
  LearningRelationship[]
> = {
  // -------------------------------------------------------------------------
  // orbits — Kepler third law (period ↔ speed, distance) and energy
  // (widening ↔ speed, eccentricity).
  // -------------------------------------------------------------------------
  orbits: [
    {
      phrases: ["period", "slower", "faster", "speed"],
      keys: ["speed", "distance"],
      priority: 1,
    },
    {
      phrases: ["wider", "elliptical", "eccentric", "stretch"],
      keys: ["speed", "eccentricity"],
      priority: 2,
    },
    {
      phrases: ["gravity", "stronger pull", "heavier star", "pull"],
      keys: ["g"],
      priority: 3,
    },
    {
      phrases: ["mass", "heavier body", "lighter body", "bigger planet"],
      keys: ["bodyMass"],
      priority: 4,
    },
    {
      phrases: ["farther", "closer", "distance from", "further"],
      keys: ["distance"],
      priority: 5,
    },
  ],

  // -------------------------------------------------------------------------
  // projectile — range ↔ angle + speed; drag shortens range; gravity pulls
  // the arc down; height ↔ angle + speed.
  // -------------------------------------------------------------------------
  projectile: [
    {
      phrases: ["range", "farthest", "far", "reach"],
      keys: ["angle", "speed"],
      priority: 1,
    },
    {
      phrases: ["drag", "air resistance", "wind"],
      keys: ["drag"],
      priority: 2,
    },
    {
      phrases: ["gravity", "arc", "curve", "fall"],
      keys: ["gravity"],
      priority: 3,
    },
    {
      phrases: ["height", "peak", "high", "max height"],
      keys: ["angle", "speed"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // charges — Coulomb force ↔ q1,q2; field falloff ↔ separation; field
  // drawing ↔ fieldScale; dipole ↔ q1,q2.
  // -------------------------------------------------------------------------
  charges: [
    {
      phrases: ["force", "attract", "attraction", "repel", "repulsion", "pull together"],
      keys: ["q1", "q2"],
      priority: 1,
    },
    {
      phrases: ["weaker", "farther", "closer", "distance between"],
      keys: ["separation"],
      priority: 2,
    },
    {
      phrases: ["field lines", "field strength", "arrows", "vector field"],
      keys: ["fieldScale"],
      priority: 3,
    },
    {
      phrases: ["dipole", "opposite charge", "like charges", "midpoint"],
      keys: ["q1", "q2"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // waves — wavefronts ↔ frequency; fringe spacing ↔ wavelength + source
  // separation; brightness ↔ amplitude; band swap ↔ phase; interference
  // pattern ↔ separation + wavelength.
  // -------------------------------------------------------------------------
  waves: [
    {
      phrases: ["frequency", "pitch", "higher tone", "lower tone"],
      keys: ["frequency"],
      priority: 1,
    },
    {
      phrases: ["spacing", "pattern", "fringes", "bands"],
      keys: ["wavelength", "separation"],
      priority: 2,
    },
    {
      phrases: ["amplitude", "louder", "brighter", "intensity"],
      keys: ["amplitude"],
      priority: 3,
    },
    {
      phrases: ["phase", "shift", "out of sync"],
      keys: ["phase"],
      priority: 4,
    },
    {
      phrases: ["interference", "double slit", "diffraction", "ripple"],
      keys: ["separation", "wavelength"],
      priority: 5,
    },
  ],

  // -------------------------------------------------------------------------
  // gas — kinetic theory: temperature ↔ temperature; motion visibility
  // ↔ speedScale; quantity ↔ particles; pressure/collisions ↔ particles +
  // temperature; stratification ↔ gravity.
  // -------------------------------------------------------------------------
  gas: [
    {
      phrases: ["temperature", "hot", "hotter", "cold", "cooler", "heat"],
      keys: ["temperature"],
      priority: 1,
    },
    {
      phrases: ["speed", "fast", "faster", "slow", "slower", "move around"],
      keys: ["speedScale"],
      priority: 2,
    },
    {
      phrases: ["particles", "molecules", "more gas", "fewer"],
      keys: ["particles"],
      priority: 3,
    },
    {
      phrases: ["pressure", "collisions", "hits", "bounce"],
      keys: ["particles", "temperature"],
      priority: 4,
    },
    {
      phrases: ["gravity", "sink", "fall", "settle"],
      keys: ["gravity"],
      priority: 5,
    },
  ],

  // -------------------------------------------------------------------------
  // pendulum — period ↔ length + gravity (T = 2π√(L/g)); release angle
  // ↔ amplitude; energy loss ↔ damping.
  // -------------------------------------------------------------------------
  pendulum: [
    {
      phrases: ["period", "swing time", "faster swing", "slower swing"],
      keys: ["length", "gravity"],
      priority: 1,
    },
    {
      phrases: ["angle", "release angle", "start angle", "amplitude"],
      keys: ["amplitude"],
      priority: 2,
    },
    {
      phrases: ["damping", "slow down", "decay", "energy loss", "air resistance"],
      keys: ["damping"],
      priority: 3,
    },
    {
      phrases: ["gravity", "stronger pull"],
      keys: ["gravity"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // rc_circuit — time constant ↔ resistance + capacitance (τ = RC);
  // charging voltage ↔ voltage; current ↔ voltage + resistance.
  // -------------------------------------------------------------------------
  rc_circuit: [
    {
      phrases: ["resistance", "resistor", "ohm"],
      keys: ["resistance"],
      priority: 1,
    },
    {
      phrases: ["capacitance", "capacitor", "store charge"],
      keys: ["capacitance"],
      priority: 2,
    },
    {
      phrases: ["voltage", "battery", "power"],
      keys: ["voltage"],
      priority: 3,
    },
    {
      phrases: ["time constant", "charge up", "charge slowly", "discharge", "faster charge"],
      keys: ["resistance", "capacitance"],
      priority: 4,
    },
    {
      phrases: ["current", "amps", "flow of charge"],
      keys: ["voltage", "resistance"],
      priority: 5,
    },
  ],

  // -------------------------------------------------------------------------
  // reaction_diffusion — Gray-Scott: feed/kill drive pattern type; diffusion
  // contrast drives pattern wavelength.
  // -------------------------------------------------------------------------
  reaction_diffusion: [
    {
      phrases: ["feed", "more chemical", "food"],
      keys: ["feed"],
      priority: 1,
    },
    {
      phrases: ["kill", "death rate", "less chemical"],
      keys: ["kill"],
      priority: 2,
    },
    {
      phrases: ["diffusion", "spread", "mix", "smear"],
      keys: ["diffusionU", "diffusionV"],
      priority: 3,
    },
    {
      phrases: ["pattern", "turing", "morphogenesis", "stripes", "spots"],
      keys: ["feed", "kill"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // cellular_automaton — generation rate ↔ speed; seed population ↔ density;
  // emergent structure ↔ density + speed.
  // -------------------------------------------------------------------------
  cellular_automaton: [
    {
      phrases: ["speed", "faster", "slower", "generations"],
      keys: ["speed"],
      priority: 1,
    },
    {
      phrases: ["density", "crowded", "sparse", "few cells", "more cells"],
      keys: ["density"],
      priority: 2,
    },
    {
      phrases: ["glider", "emerge", "complexity", "life"],
      keys: ["density", "speed"],
      priority: 3,
    },
    {
      phrases: ["chaos", "unpredictable", "random"],
      keys: ["density", "speed"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // nuclear_chain_reaction — control ↔ absorber; growth ↔ multiplication;
  // seeding ↔ initialNeutrons; criticality ↔ multiplication + absorber.
  // -------------------------------------------------------------------------
  nuclear_chain_reaction: [
    {
      phrases: ["absorber", "control rod", "slow the chain", "stop the reaction"],
      keys: ["absorber"],
      priority: 1,
    },
    {
      phrases: ["multiplication", "grow", "more neutrons", "k factor"],
      keys: ["multiplication"],
      priority: 2,
    },
    {
      phrases: ["initial", "start", "seed", "begin"],
      keys: ["initialNeutrons"],
      priority: 3,
    },
    {
      phrases: ["critical", "sustain", "fizzle out", "runaway"],
      keys: ["multiplication", "absorber"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // newton_second_law — force ↔ acceleration; mass ↔ acceleration (inverse).
  // -------------------------------------------------------------------------
  newton_second_law: [
    {
      phrases: ["force", "push", "pull", "applied force", "net force", "stronger push"],
      keys: ["force"],
      priority: 1,
    },
    {
      phrases: ["mass", "heavier", "lighter", "heavy", "inertia"],
      keys: ["mass"],
      priority: 2,
    },
    {
      phrases: ["accelerate", "acceleration", "speed up", "f = ma", "second law"],
      keys: ["force", "mass"],
      priority: 3,
    },
  ],
};
