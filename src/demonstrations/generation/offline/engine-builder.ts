/**
 * Curated verified-engine spec builder (Level 1 — verified_simulation).
 *
 * Produces a complete DemoSpecV1 for one of the VERIFIED_ENGINE_IDS using the
 * ED-owned ENGINE_CATALOG (parameterKeys, readoutKeys, supports3D) plus this
 * module's curated defaults. Every prediction's correctIndex is a physical
 * fact that holds for the curated default parameter set — never guessed.
 */

import type { LearnerPreferences } from "@/domain/learner";
import {
  ENGINE_CATALOG,
  SPEC_LIMITS,
  TRUST_LABELS,
  type DemoSpecV1,
  type EngineParameterSpec,
  type ReadoutSpec,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import { normalizeQuery } from "../intent/normalize";

// ---------------------------------------------------------------------------
// Deterministic hashing (seed source)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash — deterministic across runs and platforms. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Curated parameter defaults (one entry per catalog parameterKey)
// ---------------------------------------------------------------------------

type CuratedParameter = Omit<EngineParameterSpec, "key"> & { key: string };

const ENGINE_PARAMETERS: Record<VerifiedEngineId, CuratedParameter[]> = {
  orbits: [
    { key: "g", label: "Gravity strength", min: 0.2, max: 3, step: 0.1, value: 1 },
    { key: "speed", label: "Launch speed", min: 0.3, max: 2.2, step: 0.05, value: 1 },
    { key: "bodyMass", label: "Body mass", min: 0.5, max: 5, step: 0.1, value: 1 },
    { key: "eccentricity", label: "Orbit eccentricity", min: 0, max: 0.9, step: 0.05, value: 0 },
    { key: "distance", label: "Orbit distance", min: 0.5, max: 2, step: 0.05, value: 1 },
  ],
  projectile: [
    { key: "angle", label: "Launch angle", min: 0, max: 90, step: 1, value: 45, unit: "°" },
    { key: "speed", label: "Launch speed", min: 5, max: 60, step: 1, value: 25, unit: "m/s" },
    { key: "drag", label: "Air resistance", min: 0, max: 1, step: 0.01, value: 0 },
    { key: "gravity", label: "Gravity", min: 1, max: 25, step: 0.5, value: 9.8, unit: "m/s²" },
  ],
  charges: [
    { key: "q1", label: "Charge 1", min: -5, max: 5, step: 0.1, value: 1 },
    { key: "q2", label: "Charge 2", min: -5, max: 5, step: 0.1, value: -1 },
    { key: "separation", label: "Separation", min: 1, max: 8, step: 0.1, value: 3 },
    { key: "fieldScale", label: "Field arrows", min: 0.5, max: 3, step: 0.1, value: 1 },
  ],
  waves: [
    { key: "frequency", label: "Frequency", min: 0.5, max: 5, step: 0.1, value: 2, unit: "Hz" },
    { key: "wavelength", label: "Wavelength", min: 0.5, max: 4, step: 0.1, value: 1, unit: "m" },
    { key: "amplitude", label: "Amplitude", min: 0.2, max: 2, step: 0.1, value: 1 },
    { key: "separation", label: "Source separation", min: 0.5, max: 6, step: 0.1, value: 3 },
    { key: "phase", label: "Phase difference", min: 0, max: 360, step: 5, value: 0, unit: "°" },
  ],
  gas: [
    { key: "temperature", label: "Temperature", min: 100, max: 800, step: 10, value: 300, unit: "K" },
    { key: "particles", label: "Number of particles", min: 20, max: 400, step: 10, value: 150 },
    { key: "gravity", label: "Gravity", min: 0, max: 2, step: 0.1, value: 0 },
    { key: "speedScale", label: "Speed scale", min: 0.5, max: 2, step: 0.1, value: 1 },
  ],
  pendulum: [
    { key: "length", label: "Pendulum length", min: 0.2, max: 2.5, step: 0.05, value: 1, unit: "m" },
    { key: "gravity", label: "Gravity", min: 1, max: 25, step: 0.5, value: 9.8, unit: "m/s²" },
    { key: "amplitude", label: "Starting angle", min: 5, max: 90, step: 1, value: 30, unit: "°" },
    { key: "damping", label: "Damping", min: 0, max: 1, step: 0.01, value: 0 },
  ],
  rc_circuit: [
    { key: "resistance", label: "Resistance", min: 100, max: 10000, step: 100, value: 1000, unit: "Ω" },
    { key: "capacitance", label: "Capacitance", min: 10, max: 1000, step: 10, value: 100, unit: "µF" },
    { key: "voltage", label: "Battery voltage", min: 1, max: 12, step: 0.5, value: 5, unit: "V" },
  ],
  reaction_diffusion: [
    { key: "feed", label: "Feed rate", min: 0.01, max: 0.1, step: 0.001, value: 0.055 },
    { key: "kill", label: "Kill rate", min: 0.02, max: 0.09, step: 0.001, value: 0.062 },
    { key: "diffusionU", label: "Diffusion of U", min: 0, max: 2, step: 0.1, value: 1 },
    { key: "diffusionV", label: "Diffusion of V", min: 0, max: 1, step: 0.05, value: 0.5 },
  ],
  cellular_automaton: [
    { key: "speed", label: "Generations per second", min: 1, max: 60, step: 1, value: 10 },
    { key: "density", label: "Initial density", min: 0.1, max: 0.9, step: 0.05, value: 0.4 },
  ],
  nuclear_chain_reaction: [
    { key: "initialNeutrons", label: "Initial neutrons", min: 1, max: 50, step: 1, value: 10 },
    { key: "absorber", label: "Absorber (control rod)", min: 0, max: 1, step: 0.01, value: 0.3 },
    { key: "multiplication", label: "Multiplication factor", min: 1, max: 2, step: 0.05, value: 1.5 },
  ],
};

/**
 * Which parameter keys the learner gets sliders for (2–3 per engine). The rest
 * stay at curated defaults. Controls are then: sliders + play_pause +
 * speed_control (unless reducedMotion) + reset — always ≤ 6.
 */
const CONTROL_PARAMETER_KEYS: Record<VerifiedEngineId, string[]> = {
  orbits: ["speed", "bodyMass"],
  projectile: ["angle", "drag"],
  charges: ["q1", "q2", "separation"],
  waves: ["frequency", "separation", "phase"],
  gas: ["temperature", "particles"],
  pendulum: ["length", "amplitude"],
  rc_circuit: ["resistance", "capacitance"],
  reaction_diffusion: ["feed", "kill"],
  cellular_automaton: ["speed", "density"],
  nuclear_chain_reaction: ["absorber", "multiplication"],
};

// ---------------------------------------------------------------------------
// Readouts (labels/formats for each catalog readoutKey)
// ---------------------------------------------------------------------------

const READOUTS: Record<VerifiedEngineId, ReadoutSpec[]> = {
  orbits: [
    { key: "period", label: "Orbital period", format: "fixed2" },
    { key: "speed", label: "Orbital speed", format: "fixed2" },
    { key: "distance", label: "Orbit distance", format: "fixed2" },
  ],
  projectile: [
    { key: "range", label: "Range", format: "fixed2" },
    { key: "maxHeight", label: "Max height", format: "fixed2" },
    { key: "timeOfFlight", label: "Time of flight", format: "fixed2" },
  ],
  charges: [
    { key: "fieldStrength", label: "Field strength", format: "fixed2" },
    { key: "potential", label: "Electric potential", format: "fixed2" },
  ],
  waves: [
    { key: "intensity", label: "Intensity", format: "fixed2" },
    { key: "wavelength", label: "Wavelength", format: "fixed2" },
  ],
  gas: [
    { key: "avgSpeed", label: "Average speed", format: "fixed2" },
    { key: "collisions", label: "Collisions", format: "raw" },
    { key: "temperature", label: "Temperature", format: "fixed2" },
  ],
  pendulum: [
    { key: "period", label: "Period", format: "fixed2" },
    { key: "angle", label: "Angle", format: "fixed2" },
  ],
  rc_circuit: [
    { key: "voltage", label: "Capacitor voltage", format: "fixed2" },
    { key: "current", label: "Current", format: "fixed2" },
    { key: "charge", label: "Charge", format: "fixed2" },
  ],
  reaction_diffusion: [{ key: "pattern", label: "Pattern type", format: "raw" }],
  cellular_automaton: [
    { key: "population", label: "Living cells", format: "raw" },
    { key: "generation", label: "Generation", format: "raw" },
  ],
  nuclear_chain_reaction: [
    { key: "neutronCount", label: "Neutron count", format: "raw" },
    { key: "generation", label: "Generation", format: "raw" },
  ],
};

// ---------------------------------------------------------------------------
// Predictions — correctIndex is a physical fact for the curated defaults
// ---------------------------------------------------------------------------

interface CuratedPrediction {
  prompt: string;
  options: string[];
  correctIndex: number;
}

const PREDICTIONS: Record<VerifiedEngineId, CuratedPrediction> = {
  orbits: {
    prompt: "What will happen to the orbiting body if you increase its launch speed?",
    options: [
      "It will move into a wider orbit",
      "It will spiral inward and crash",
      "It will stop moving",
      "It will shrink to a point",
    ],
    correctIndex: 0,
  },
  projectile: {
    prompt: "What will happen to the projectile's landing point if you increase air resistance (drag)?",
    options: [
      "It will land closer to the launch point",
      "It will land farther away",
      "It will stop in mid-air",
      "It will loop back to the launcher",
    ],
    correctIndex: 0,
  },
  pendulum: {
    prompt: "What will happen to the time for one complete swing (the period) if you make the pendulum longer?",
    options: [
      "The period will increase",
      "The period will decrease",
      "The period will stay the same",
      "The pendulum will stop swinging",
    ],
    correctIndex: 0,
  },
  gas: {
    prompt: "What will happen to the average speed of the particles if you raise the temperature?",
    options: [
      "The average speed will increase",
      "The average speed will decrease",
      "The average speed will stay the same",
      "The particles will freeze in place",
    ],
    correctIndex: 0,
  },
  charges: {
    prompt: "What will happen with one positive charge and one negative charge nearby?",
    options: [
      "They will attract each other",
      "They will repel each other",
      "They will not interact",
      "They will merge into one charge",
    ],
    correctIndex: 0,
  },
  waves: {
    prompt: "What will happen to the interference pattern if you increase the separation between the two wave sources?",
    options: [
      "The pattern will show more, narrower interference lobes",
      "The pattern will show fewer, wider lobes",
      "The pattern will disappear",
      "The waves will stop traveling",
    ],
    correctIndex: 0,
  },
  rc_circuit: {
    prompt: "What will happen to the time it takes to charge the capacitor if you increase the resistance?",
    options: [
      "It will take longer to charge",
      "It will charge faster",
      "The charging time will not change",
      "The capacitor will not charge at all",
    ],
    correctIndex: 0,
  },
  reaction_diffusion: {
    prompt: "What will happen to the pattern if you raise the feed rate very high?",
    options: [
      "The pattern will become uniform and fade",
      "More spots will appear",
      "Stripes will become sharper",
      "The pattern will never change",
    ],
    correctIndex: 0,
  },
  cellular_automaton: {
    prompt: "What will happen to a glider pattern in Conway's Game of Life?",
    options: [
      "It will glide diagonally across the grid",
      "It will stay frozen in place",
      "It will instantly fill the whole grid",
      "It will disappear after one step",
    ],
    correctIndex: 0,
  },
  nuclear_chain_reaction: {
    prompt: "What will happen to the number of neutrons over time if you increase the absorber (control rod) setting?",
    options: [
      "The growth will slow down",
      "The growth will speed up",
      "The neutron count will stay constant",
      "All neutrons will disappear instantly",
    ],
    correctIndex: 0,
  },
};

// ---------------------------------------------------------------------------
// Curated content per engine
// ---------------------------------------------------------------------------

const LEARNING_OBJECTIVES: Record<VerifiedEngineId, string> = {
  orbits: "See how gravity and launch speed determine the shape, size, and period of an orbit.",
  projectile: "Explore how launch angle, speed, and air resistance shape a projectile's trajectory.",
  charges: "See how electric field strength and direction arise from point charges.",
  waves: "Watch how overlapping waves create constructive and destructive interference.",
  gas: "Explore how temperature and particle motion relate in the kinetic theory of gases.",
  pendulum: "Discover how length and gravity set a pendulum's period of oscillation.",
  rc_circuit: "Watch a capacitor charge through a resistor and see how the time constant works.",
  reaction_diffusion: "See how simple reaction and diffusion rules grow visible patterns.",
  cellular_automaton: "Explore how simple local rules produce complex emergent behavior.",
  nuclear_chain_reaction: "See how a single fission can trigger a growing chain of reactions — as a safe model, not real radiation.",
};

const LIMITATIONS: Record<VerifiedEngineId, string[]> = {
  orbits: [
    "Idealized point-mass gravity; no planet sizes or collisions are modeled.",
    "No general-relativistic effects are included.",
  ],
  projectile: [
    "Point-mass projectile; spin, lift, and a real atmosphere are not modeled.",
  ],
  charges: [
    "Point charges only; fields are drawn in 2D slices.",
  ],
  waves: [
    "Idealized point sources; reflections and damping are not modeled.",
  ],
  gas: [
    "2D ideal-gas-like particles; collisions and pressure are simplified.",
  ],
  pendulum: [
    "Idealized pivot and rod; friction only through the damping setting.",
  ],
  rc_circuit: [
    "Ideal resistor and capacitor; no internal battery resistance.",
  ],
  reaction_diffusion: [
    "Discretized Gray–Scott model on a grid; not a quantitative chemistry simulation.",
  ],
  cellular_automaton: [
    "Two-state cells on a finite grid; boundary effects are possible.",
  ],
  nuclear_chain_reaction: [
    "Statistical averages with simplified neutron physics; no real radiation or reactor hardware.",
  ],
};

const OBSERVATION_PROMPTS: Record<VerifiedEngineId, string[]> = {
  orbits: [
    "Watch how the body's speed changes as it moves closer to and farther from the central mass.",
    "Try lowering the launch speed and describe how the orbit changes.",
  ],
  projectile: [
    "Watch the height and the landing point of the projectile over time.",
    "Change the launch angle and note which angle sends the projectile farthest.",
  ],
  charges: [
    "Observe how the field arrows point near a positive charge versus a negative charge.",
    "Move the charges apart and watch how the field strength readout changes.",
  ],
  waves: [
    "Watch where the pattern is brightest and where it is dark.",
    "Change the separation and count the bright lobes you see.",
  ],
  gas: [
    "Watch how particle speeds change when you raise the temperature.",
    "Describe what happens to the collision rate as particles move faster.",
  ],
  pendulum: [
    "Watch the bob swing; notice whether the period changes as the swing slows.",
    "Lengthen the pendulum and observe the new period.",
  ],
  rc_circuit: [
    "Watch the capacitor voltage climb toward the battery voltage.",
    "Change the resistance and watch how the charging curve changes.",
  ],
  reaction_diffusion: [
    "Watch how tiny random differences grow into a visible pattern.",
    "Raise the feed rate and describe how the pattern changes.",
  ],
  cellular_automaton: [
    "Watch how simple rules create complex, moving structures.",
    "Start with a different density and compare what structures appear.",
  ],
  nuclear_chain_reaction: [
    "Watch how one fission can trigger more fissions.",
    "Raise the absorber and observe how the neutron count changes.",
  ],
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildEngineSpec(
  engineId: VerifiedEngineId,
  query: string,
  prefs: LearnerPreferences,
): DemoSpecV1 {
  const catalog = ENGINE_CATALOG[engineId];
  const normalized = normalizeQuery(query);
  const seed = hashString(normalized);
  const hash36 = seed.toString(36);

  const parameters: EngineParameterSpec[] = ENGINE_PARAMETERS[engineId].map((p) => ({
    key: p.key,
    label: p.label,
    min: p.min,
    max: p.max,
    step: p.step,
    value: p.value,
    ...(p.unit !== undefined ? { unit: p.unit } : {}),
  }));

  const readouts: ReadoutSpec[] = READOUTS[engineId].map((r) => ({ ...r }));

  const sliderKeys = CONTROL_PARAMETER_KEYS[engineId];
  const controls: DemoSpecV1["controls"] = [];
  for (const key of sliderKeys) {
    const p = ENGINE_PARAMETERS[engineId].find((c) => c.key === key);
    if (!p) continue;
    controls.push({
      id: `param_${key}`,
      type: "slider",
      label: p.label,
      target: { kind: "parameter", ref: key },
      min: p.min,
      max: p.max,
      step: p.step,
      defaultValue: p.value,
    });
  }
  controls.push({
    id: "play_pause",
    type: "play_pause",
    label: "Play / Pause",
    target: { kind: "scene", ref: "play_pause" },
  });
  if (!prefs.reducedMotion) {
    controls.push({
      id: "speed_control",
      type: "speed_control",
      label: "Speed",
      target: { kind: "scene", ref: "speed" },
      min: 0.25,
      max: 2,
      step: 0.05,
      defaultValue: prefs.animationSpeed,
    });
  }
  controls.push({
    id: "reset",
    type: "reset",
    label: "Reset",
    target: { kind: "scene", ref: "reset" },
  });

  const supports3D = catalog.supports3D;
  // The offline engine builder emits a 2D engine spec with NO scene3d, so it
  // only advertises representations it can actually render: the 2D stage, a
  // data table of parameters + readouts, and a text sequence. A stage_3d or
  // diagram tab without scene3d content would be a dead end.
  const representations: DemoSpecV1["representations"] = [
    { id: "rep_stage_2d", kind: "stage_2d", label: "2D stage" },
    { id: "rep_table", kind: "table", label: "Table" },
    { id: "rep_text", kind: "text_sequence", label: "Text sequence" },
  ];

  const prediction = PREDICTIONS[engineId];
  const limitations = [
    ...LIMITATIONS[engineId],
    ...(prefs.reducedMotion ? ["Motion reduced for comfort."] : []),
  ];

  return {
    schemaVersion: 1,
    id: `demo-${engineId}-${hash36}`,
    generationId: `gen-${engineId}-${hash36}`,
    userQuery: query,
    normalizedConcept: catalog.title.toLowerCase(),
    title: catalog.title,
    learningObjective: LEARNING_OBJECTIVES[engineId],

    trust: {
      level: "verified_simulation",
      label: TRUST_LABELS.verified_simulation,
      limitations,
      engineId,
      engineVersion: "1.0.0",
    },

    renderer: {
      kind: "lumina_2d",
      fallbackKind: "data_table",
      preferredAspectRatio: supports3D ? 16 / 9 : 4 / 3,
      background: "dark",
    },

    simulation: {
      engineId,
      engineVersion: "1.0.0",
      seed,
      parameters,
      readouts,
    },

    controls,
    prediction: {
      prompt: prediction.prompt,
      options: [...prediction.options],
      correctIndex: prediction.correctIndex,
    },
    observationPrompts: OBSERVATION_PROMPTS[engineId].map((prompt) => ({ prompt })),
    representations,
    adaptationContext: {
      allowed: true,
      oneVariableMode: prefs.oneVariableMode,
    },

    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: new Date().toISOString(),
    },

    limits: {
      maxObjects: SPEC_LIMITS.maxObjects,
      maxParticles: SPEC_LIMITS.maxParticlesMobile,
      maxTimelineEvents: SPEC_LIMITS.maxTimelineEvents,
      maxControls: SPEC_LIMITS.maxControls,
    },
  };
}
