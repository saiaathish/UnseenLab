/**
 * generation/controls/catalog.ts — EngineControlCatalog (PHASE 2B,
 * evaluation-director, UNSEENLAB PHASE 1-2 CLOSURE).
 *
 * Single source of truth for engine parameter controls. The hosted model
 * never authors controls: it selects ONLY simulation.focusParameterKeys
 * (1-4 engine-owned keys, validated by the Phase 2C boundary with reason
 * `invalid_engine_key`); the deterministic materializer
 * (src/demonstrations/generation/controls/materialize.ts) reads THIS catalog
 * and builds the full ControlSpec[] — bounds, labels, steps, defaults.
 * Catalog values always win over anything the model emits; unknown keys are
 * dropped, never retargeted; curated defaults apply when focus keys are
 * omitted; >= 1 control is guaranteed (>= 2 for comparison objectives);
 * one-variable mode materializes at most one parameter control.
 *
 * SOURCING (honest labels, cited per entry):
 *   - orbits, waves, charges: the curated showcase PARAMETERS blocks
 *     (src/demonstrations/showcases/<engine>/build-spec.ts) are the canonical
 *     min/max/step/default/label source per the evaluation-director mandate.
 *     For these three engines the showcase blocks agree with the lumina-2d
 *     engine META bounds EXCEPT charges fieldScale default (showcase 10 vs
 *     engine META 1 — the showcase is canonical here).
 *   - projectile, gas, pendulum, rc_circuit, reaction_diffusion,
 *     cellular_automaton: lumina-2d engine META bounds + defaults
 *     (src/demonstrations/renderers/lumina-2d/engines/<id>.ts) — the engine
 *     is the owner of its parameter space; labels come from the curated
 *     offline parameter blocks (src/demonstrations/generation/offline/
 *     engine-builder.ts:42) where the key matches, steps are authored to fit
 *     the engine's own bounds.
 *   - nuclear_chain_reaction: the curated offline parameter block
 *     (engine-builder.ts:42) is the only curated source — no lumina-2d module
 *     is registered for it yet (flagged in docs/trust-decision-table.md).
 *
 * CONTRACT consumed by materialize.ts (fail-loud at runtime):
 *   - Record<VerifiedEngineId, EngineControlDefinition[]> for EVERY id in
 *     VERIFIED_ENGINE_IDS (materializeControls throws on any missing engine),
 *   - array order = priority order (every entry carries a numeric `priority`;
 *     the materializer sorts ascending when all entries have one),
 *   - entry.key MUST be a member of ENGINE_CATALOG[engineId].parameterKeys,
 *   - min/max finite, min <= max, step > 0, default within [min, max],
 *   - at most SPEC_LIMITS.maxControls entries per engine,
 *   - no duplicate keys per engine.
 */

import type { VerifiedEngineId } from "@/demonstrations/spec/demo-spec";

/**
 * One curated engine parameter control definition.
 *
 * min/max/step are REQUIRED here (not optional): the materializer
 * (materialize.ts) consumes every entry with a fail-loud runtime check that
 * throws when min/max/step are missing or invalid, and its type contract
 * requires them. Optionality in this exported type would let a catalog entry
 * silently lack the bounds the whole Phase 2B contract exists to guarantee.
 */
export type EngineControlDefinition = {
  /** Engine-owned parameter key — must be in ENGINE_CATALOG[engine].parameterKeys. */
  key: string;
  /** Canonical learner-facing label (showcase or curated source, cited). */
  label: string;
  /** One-sentence description of what the control drives. */
  description: string;
  /** How the control is rendered; slider matches every curated showcase. */
  controlType: "slider" | "toggle" | "segmented_control";
  /** Control range lower bound (engine-owned). */
  min: number;
  /** Control range upper bound (engine-owned). */
  max: number;
  /** Control step (showcase step where canonical, else authored to the engine's bounds). */
  step: number;
  /** Curated default value, always within [min, max]. */
  defaultValue: number;
  /** Physical unit where the engine's parameter space makes it unambiguous. */
  unit?: string;
  /** Concept keywords this control supports learning about (from ENGINE_CATALOG keywords and readouts). */
  learningRelationships: string[];
  /** Ordering within the engine: lower = higher priority. Showcase control
   * order first, then the engine's remaining canonical parameters. */
  priority: number;
};

/**
 * The full catalog. Keyed by EVERY VerifiedEngineId — the materializer's
 * fail-loud contract check iterates VERIFIED_ENGINE_IDS and throws on any
 * missing engine, so the catalog must be complete, not partial.
 */
export const ENGINE_CONTROL_CATALOG: Record<
  VerifiedEngineId,
  EngineControlDefinition[]
> = {
  // -------------------------------------------------------------------------
  // orbits — canonical source: showcases/orbits/build-spec.ts PARAMETERS
  // (lines 42-48; control order lines 163-214: speed, g). Matches
  // ORBITS_META bounds (renderers/lumina-2d/engines/orbits.ts:22).
  // -------------------------------------------------------------------------
  orbits: [
    {
      key: "speed",
      label: "Launch speed",
      description: "Sets the planet's initial orbital speed; above 1 the orbit widens into an ellipse, below 1 it dips inward.",
      controlType: "slider",
      min: 0.05,
      max: 3,
      step: 0.05,
      defaultValue: 1,
      learningRelationships: ["orbit", "orbits", "gravity", "kepler", "period", "speed", "ellipse"],
      priority: 1,
    },
    {
      key: "g",
      label: "Gravity strength",
      description: "Scales the star's gravitational pull; stronger gravity binds tighter, faster orbits.",
      controlType: "slider",
      min: 0.5,
      max: 200,
      step: 0.5,
      defaultValue: 10,
      learningRelationships: ["orbit", "orbits", "gravity", "kepler", "newton", "attraction"],
      priority: 2,
    },
    {
      key: "bodyMass",
      label: "Body mass",
      description: "Sets the orbiting body's mass; heavier bodies respond less to the same pull.",
      controlType: "slider",
      min: 0.1,
      max: 100,
      step: 0.1,
      defaultValue: 1,
      learningRelationships: ["orbit", "gravity", "mass", "kepler"],
      priority: 3,
    },
    {
      key: "eccentricity",
      label: "Orbit eccentricity",
      description: "Shapes the orbit from circular (0) toward a stretched ellipse (up to 0.95).",
      controlType: "slider",
      min: 0,
      max: 0.95,
      step: 0.05,
      defaultValue: 0,
      learningRelationships: ["orbit", "eccentricity", "ellipse", "kepler", "comet"],
      priority: 4,
    },
    {
      key: "distance",
      label: "Orbit distance",
      description: "Sets the orbit's starting radius; farther orbits take longer per Kepler's third law.",
      controlType: "slider",
      min: 20,
      max: 2000,
      step: 10,
      defaultValue: 150,
      learningRelationships: ["orbit", "distance", "kepler", "period", "solar system"],
      priority: 5,
    },
  ],

  // -------------------------------------------------------------------------
  // projectile — canonical source: PROJECTILE_META bounds + defaults
  // (renderers/lumina-2d/engines/projectile.ts:13); labels from the curated
  // offline parameter block (engine-builder.ts:50-55).
  // -------------------------------------------------------------------------
  projectile: [
    {
      key: "angle",
      label: "Launch angle",
      description: "Sets the launch angle from horizontal; 45 degrees reaches farthest with no drag.",
      controlType: "slider",
      min: 1,
      max: 89,
      step: 1,
      defaultValue: 50,
      unit: "deg",
      learningRelationships: ["projectile", "trajectory", "angle", "range", "parabola", "kinematics"],
      priority: 1,
    },
    {
      key: "speed",
      label: "Launch speed",
      description: "Sets the initial launch speed; more speed stretches the trajectory and range.",
      controlType: "slider",
      min: 1,
      max: 200,
      step: 1,
      defaultValue: 30,
      learningRelationships: ["projectile", "trajectory", "speed", "range", "kinematics"],
      priority: 2,
    },
    {
      key: "drag",
      label: "Air resistance",
      description: "Sets aerodynamic drag; higher drag shortens the range and flattens the arc.",
      controlType: "slider",
      min: 0,
      max: 0.5,
      step: 0.001,
      defaultValue: 0.008,
      learningRelationships: ["projectile", "drag", "air resistance", "trajectory", "range"],
      priority: 3,
    },
    {
      key: "gravity",
      label: "Gravity",
      description: "Sets gravitational acceleration; stronger gravity pulls the arc down sooner.",
      controlType: "slider",
      min: 0.1,
      max: 100,
      step: 0.1,
      defaultValue: 9.8,
      learningRelationships: ["projectile", "gravity", "trajectory", "range", "kinematics"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // charges — canonical source: showcases/electric-fields/build-spec.ts
  // PARAMETERS (lines 44-49; control order lines 146-178: q2, q1, separation,
  // fieldScale). fieldScale default 10 is the showcase value (engine META
  // default is 1 — the showcase is canonical).
  // -------------------------------------------------------------------------
  charges: [
    {
      key: "q2",
      label: "Charge 2",
      description: "Sets the second charge's magnitude and sign; opposite sign creates the dipole (potential null at the midpoint).",
      controlType: "slider",
      min: -10,
      max: 10,
      step: 0.5,
      defaultValue: -1,
      learningRelationships: ["charge", "charges", "electric field", "coulomb", "dipole", "attraction", "repulsion"],
      priority: 1,
    },
    {
      key: "q1",
      label: "Charge 1",
      description: "Sets the first charge's magnitude and sign.",
      controlType: "slider",
      min: -10,
      max: 10,
      step: 0.5,
      defaultValue: 1,
      learningRelationships: ["charge", "charges", "electric field", "coulomb", "dipole", "attraction", "repulsion"],
      priority: 2,
    },
    {
      key: "separation",
      label: "Separation",
      description: "Sets the distance between the two charges; field strength and potential scale with distance.",
      controlType: "slider",
      min: 10,
      max: 900,
      step: 10,
      defaultValue: 140,
      learningRelationships: ["charge", "electric field", "coulomb", "force between", "separation"],
      priority: 3,
    },
    {
      key: "fieldScale",
      label: "Field arrows",
      description: "Scales the drawn field vectors so the field direction stays visible at any strength.",
      controlType: "slider",
      min: 0.05,
      max: 20,
      step: 0.1,
      defaultValue: 10,
      learningRelationships: ["electric field", "field lines", "field strength", "vector field"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // waves — canonical source: showcases/wave-interference/build-spec.ts
  // PARAMETERS (lines 46-52; control order lines 137-166: frequency,
  // wavelength, separation). Matches WAVES_META bounds
  // (renderers/lumina-2d/engines/waves.ts:22).
  // -------------------------------------------------------------------------
  waves: [
    {
      key: "frequency",
      label: "Frequency",
      description: "Sets the source oscillation frequency; higher frequency packs more wavefronts.",
      controlType: "slider",
      min: 0.05,
      max: 4,
      step: 0.05,
      defaultValue: 0.5,
      learningRelationships: ["wave", "waves", "frequency", "wavelength", "interference", "sound wave"],
      priority: 1,
    },
    {
      key: "wavelength",
      label: "Wavelength",
      description: "Sets the wave spacing; shorter wavelengths produce narrower interference fringes.",
      controlType: "slider",
      min: 3,
      max: 200,
      step: 1,
      defaultValue: 14,
      learningRelationships: ["wave", "waves", "wavelength", "frequency", "interference", "diffraction"],
      priority: 2,
    },
    {
      key: "separation",
      label: "Source separation",
      description: "Sets the gap between the two sources; more separation packs more bright lobes between them.",
      controlType: "slider",
      min: 4,
      max: 200,
      step: 2,
      defaultValue: 40,
      learningRelationships: ["wave", "waves", "interference", "double slit", "ripple", "diffraction"],
      priority: 3,
    },
    {
      key: "amplitude",
      label: "Amplitude",
      description: "Sets wave height; larger amplitude brightens constructive bands.",
      controlType: "slider",
      min: 0.05,
      max: 2,
      step: 0.05,
      defaultValue: 0.6,
      learningRelationships: ["wave", "waves", "amplitude", "interference", "intensity"],
      priority: 4,
    },
    {
      key: "phase",
      label: "Phase difference",
      description: "Shifts one source relative to the other; a half-cycle shift swaps bright and dark bands.",
      controlType: "slider",
      min: -1,
      max: 1,
      step: 0.05,
      defaultValue: 0,
      learningRelationships: ["wave", "waves", "phase", "interference", "standing wave"],
      priority: 5,
    },
  ],

  // -------------------------------------------------------------------------
  // gas — canonical source: GAS_META bounds + defaults
  // (renderers/lumina-2d/engines/gas.ts:17); labels from the curated offline
  // parameter block (engine-builder.ts:68-73).
  // -------------------------------------------------------------------------
  gas: [
    {
      key: "temperature",
      label: "Temperature",
      description: "Sets the gas temperature; hotter gas moves its molecules faster (kinetic theory).",
      controlType: "slider",
      min: 0.1,
      max: 10,
      step: 0.1,
      defaultValue: 1,
      learningRelationships: ["gas", "temperature", "kinetic", "pressure", "molecules", "maxwell"],
      priority: 1,
    },
    {
      key: "particles",
      label: "Number of particles",
      description: "Sets how many gas molecules are in the jar; more particles raise collision counts.",
      controlType: "slider",
      min: 2,
      max: 400,
      step: 1,
      defaultValue: 140,
      learningRelationships: ["gas", "particles", "molecules", "pressure", "collisions", "diffusion"],
      priority: 2,
    },
    {
      key: "gravity",
      label: "Gravity",
      description: "Pulls the molecules downward; strong gravity stratifies the gas toward the floor.",
      controlType: "slider",
      min: 0,
      max: 400,
      step: 1,
      defaultValue: 0,
      learningRelationships: ["gas", "gravity", "molecules", "brownian"],
      priority: 3,
    },
    {
      key: "speedScale",
      label: "Speed scale",
      description: "Multiplies molecule speeds for visibility without changing the temperature relationship.",
      controlType: "slider",
      min: 0.05,
      max: 20,
      step: 0.05,
      defaultValue: 1,
      learningRelationships: ["gas", "speed", "kinetic", "maxwell", "boltzmann"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // pendulum — canonical source: PENDULUM_META bounds + defaults
  // (renderers/lumina-2d/engines/pendulum.ts:12); labels from the curated
  // offline parameter block (engine-builder.ts:74-79).
  // -------------------------------------------------------------------------
  pendulum: [
    {
      key: "length",
      label: "Pendulum length",
      description: "Sets the pendulum length; longer pendulums swing with a longer period.",
      controlType: "slider",
      min: 0.1,
      max: 10,
      step: 0.05,
      defaultValue: 1.5,
      learningRelationships: ["pendulum", "length", "period", "oscillation", "harmonic"],
      priority: 1,
    },
    {
      key: "gravity",
      label: "Gravity",
      description: "Sets gravitational acceleration; stronger gravity shortens the period.",
      controlType: "slider",
      min: 0.1,
      max: 100,
      step: 0.1,
      defaultValue: 9.8,
      learningRelationships: ["pendulum", "gravity", "period", "oscillation"],
      priority: 2,
    },
    {
      key: "amplitude",
      label: "Starting angle",
      description: "Sets the release angle; large angles show the period's amplitude dependence.",
      controlType: "slider",
      min: 1,
      max: 170,
      step: 1,
      defaultValue: 40,
      unit: "deg",
      learningRelationships: ["pendulum", "amplitude", "angle", "oscillation", "period"],
      priority: 3,
    },
    {
      key: "damping",
      label: "Damping",
      description: "Sets energy loss per swing; higher damping decays the oscillation faster.",
      controlType: "slider",
      min: 0,
      max: 3,
      step: 0.01,
      defaultValue: 0.05,
      learningRelationships: ["pendulum", "damping", "energy", "oscillation", "chaos"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // rc_circuit — canonical source: CIRCUIT_META bounds + defaults
  // (renderers/lumina-2d/engines/circuit.ts:13); labels from the curated
  // offline parameter block (engine-builder.ts:80-84); units match the
  // engine's drawn units (V).
  // -------------------------------------------------------------------------
  rc_circuit: [
    {
      key: "resistance",
      label: "Resistance",
      description: "Sets the resistor; higher resistance slows the capacitor's charge and discharge (bigger time constant).",
      controlType: "slider",
      min: 10,
      max: 1000000,
      step: 10,
      defaultValue: 1000,
      unit: "ohm",
      learningRelationships: ["circuit", "resistor", "resistance", "time constant", "current", "ohm"],
      priority: 1,
    },
    {
      key: "capacitance",
      label: "Capacitance",
      description: "Sets the capacitor; larger capacitance stores more charge and lengthens the time constant.",
      controlType: "slider",
      min: 0.000001,
      max: 0.01,
      step: 0.000001,
      defaultValue: 0.0001,
      unit: "F",
      learningRelationships: ["circuit", "capacitor", "capacitance", "time constant", "charging", "charge"],
      priority: 2,
    },
    {
      key: "voltage",
      label: "Battery voltage",
      description: "Sets the supply voltage the capacitor charges toward (and discharges from).",
      controlType: "slider",
      min: 0.1,
      max: 100,
      step: 0.1,
      defaultValue: 5,
      unit: "V",
      learningRelationships: ["circuit", "voltage", "current", "charging", "discharge"],
      priority: 3,
    },
  ],

  // -------------------------------------------------------------------------
  // reaction_diffusion — canonical source: REACTION_META bounds + defaults
  // (renderers/lumina-2d/engines/reaction-diffusion.ts:15); labels from the
  // curated offline parameter block (engine-builder.ts:85-90).
  // -------------------------------------------------------------------------
  reaction_diffusion: [
    {
      key: "feed",
      label: "Feed rate",
      description: "Sets the U feed rate in the Gray-Scott model; feed and kill together decide which patterns grow.",
      controlType: "slider",
      min: 0.005,
      max: 0.2,
      step: 0.001,
      defaultValue: 0.037,
      learningRelationships: ["reaction diffusion", "turing pattern", "gray scott", "pattern formation", "morphogenesis"],
      priority: 1,
    },
    {
      key: "kill",
      label: "Kill rate",
      description: "Sets the V kill rate in the Gray-Scott model; tuning feed and kill switches between spots and stripes.",
      controlType: "slider",
      min: 0.005,
      max: 0.2,
      step: 0.001,
      defaultValue: 0.06,
      learningRelationships: ["reaction diffusion", "turing pattern", "gray scott", "pattern formation", "stripes", "spots"],
      priority: 2,
    },
    {
      key: "diffusionU",
      label: "Diffusion of U",
      description: "Sets how fast the U species spreads; diffusion contrast drives pattern wavelength.",
      controlType: "slider",
      min: 0.01,
      max: 0.3,
      step: 0.01,
      defaultValue: 0.16,
      learningRelationships: ["reaction diffusion", "diffusion", "turing pattern", "morphogenesis"],
      priority: 3,
    },
    {
      key: "diffusionV",
      label: "Diffusion of V",
      description: "Sets how fast the V species spreads relative to U.",
      controlType: "slider",
      min: 0.01,
      max: 0.3,
      step: 0.01,
      defaultValue: 0.08,
      learningRelationships: ["reaction diffusion", "diffusion", "turing pattern", "morphogenesis"],
      priority: 4,
    },
  ],

  // -------------------------------------------------------------------------
  // cellular_automaton — canonical source: CA_META bounds + defaults
  // (renderers/lumina-2d/engines/cellular-automaton.ts:14); labels from the
  // curated offline parameter block (engine-builder.ts:91-94).
  // -------------------------------------------------------------------------
  cellular_automaton: [
    {
      key: "speed",
      label: "Generations per second",
      description: "Sets how many generations the automaton advances per second.",
      controlType: "slider",
      min: 1,
      max: 30,
      step: 1,
      defaultValue: 12,
      learningRelationships: ["game of life", "conway", "cellular automata", "emergence", "glider", "complexity"],
      priority: 1,
    },
    {
      key: "density",
      label: "Initial density",
      description: "Sets the fraction of live cells in the random starting pattern.",
      controlType: "slider",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.28,
      learningRelationships: ["game of life", "conway", "cellular automata", "emergence", "density", "artificial life"],
      priority: 2,
    },
  ],

  // -------------------------------------------------------------------------
  // nuclear_chain_reaction — the curated offline parameter block
  // (engine-builder.ts:42, nuclear rows) is the ONLY curated source: no
  // lumina-2d module is registered for this engine yet (renderers/lumina-2d/
  // engines/index.ts), so bounds/defaults come from the offline curated
  // definitions, not from an engine META. Flagged in docs/trust-decision-table.md.
  // -------------------------------------------------------------------------
  nuclear_chain_reaction: [
    {
      key: "absorber",
      label: "Absorber (control rod)",
      description: "Sets how many free neutrons get absorbed; raising the absorber slows or halts the chain.",
      controlType: "slider",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.3,
      learningRelationships: ["chain reaction", "fission", "neutron", "absorber", "control rod"],
      priority: 1,
    },
    {
      key: "multiplication",
      label: "Multiplication factor",
      description: "Sets how many new neutrons each fission produces on average; above 1 the chain grows.",
      controlType: "slider",
      min: 1,
      max: 2,
      step: 0.05,
      defaultValue: 1.5,
      learningRelationships: ["chain reaction", "fission", "neutron", "multiplication"],
      priority: 2,
    },
    {
      key: "initialNeutrons",
      label: "Initial neutrons",
      description: "Sets how many free neutrons start the reaction.",
      controlType: "slider",
      min: 1,
      max: 50,
      step: 1,
      defaultValue: 10,
      learningRelationships: ["chain reaction", "fission", "neutron", "initial"],
      priority: 3,
    },
  ],
};
