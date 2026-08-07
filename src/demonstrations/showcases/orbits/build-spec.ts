/**
 * orbits — curated "Gravity & Orbits" showcase (Level 1, hybrid renderer).
 *
 * The 3D stage is a stylized star + planet (+ illustrative moon) scene rendered
 * by the primitive-3d renderer; every readout and the graded prediction couple
 * to the verified lumina-2d "orbits" engine
 * (src/demonstrations/renderers/lumina-2d/engines/orbits.ts), which integrates
 * the true two-body inverse-square problem with RK4.
 *
 * Physics behind the graded prediction (raise the Launch speed control from
 * 1 to ~1.15, all other parameters at the curated defaults; verified against
 * the engine on 2026-08-04):
 *   - the planet's instantaneous speed readout rises (8.2 -> 9.4 engine units),
 *   - the launch point becomes the closest approach of an ellipse, so the
 *     planet swings outward from radius 150 to an apoapsis of ~292 units
 *     (measured max distance 150.0 -> 292.5).
 * Lowering the speed below 1 dips the planet inward instead. The period is NOT
 * asserted to shrink: for a bound orbit a higher launch speed widens the
 * orbit, and Kepler's third law (T ~ a^(3/2)) then lengthens the period.
 *
 * The reducedMotion variant drops every continuous animation: the stage is
 * introduced with discrete reveal steps and only gentle scaling remains.
 */
import { TRUST_LABELS } from "@/demonstrations/spec/demo-spec";
import type {
  AnimationSpec,
  DemoSpecV1,
  EngineParameterSpec,
  PrimitiveObjectSpec,
  ReadoutSpec,
} from "@/demonstrations/spec/demo-spec";
import type { ShowcasePrefs } from "../index";

export const ORBITS_SHOWCASE_ID = "showcase-orbits";
export const ORBITS_SHOWCASE_QUERY = "Show why planets stay in orbit.";

/** Fixed seed: the engine is deterministic, so the seed pins the fixture. */
const SEED = 20260804;
const ENGINE_VERSION = "1.0.0";
const GENERATED_AT = "2026-08-04T00:00:00.000Z";

const PARAMETERS: EngineParameterSpec[] = [
  { key: "g", label: "Gravity strength", min: 0.5, max: 200, step: 0.5, value: 10 },
  { key: "speed", label: "Launch speed", min: 0.05, max: 3, step: 0.05, value: 1 },
  { key: "bodyMass", label: "Body mass", min: 0.1, max: 100, step: 0.1, value: 1 },
  { key: "eccentricity", label: "Orbit eccentricity", min: 0, max: 0.95, step: 0.05, value: 0 },
  { key: "distance", label: "Orbit distance", min: 20, max: 2000, step: 10, value: 150 },
];

const READOUTS: ReadoutSpec[] = [
  { key: "period", label: "Period", format: "fixed2" },
  { key: "speed", label: "Speed", format: "fixed2" },
  { key: "distance", label: "Distance", format: "fixed2" },
];

function sceneObjects(mobile: boolean): PrimitiveObjectSpec[] {
  return [
    {
      id: "star",
      kind: "sphere",
      label: "Star",
      position: { x: 0, y: 0, z: 0 },
      size: 2.4,
      color: "#ffd166",
    },
    {
      id: "star-glow",
      kind: "particle_field",
      position: { x: 0, y: 0, z: 0 },
      size: 5,
      color: "#ffb703",
      particleCount: mobile ? 200 : 240,
    },
    {
      id: "orbit-path-planet",
      kind: "orbit_path",
      label: "Planet orbit",
      position: { x: 0, y: 0, z: 0 },
      size: 12,
      color: "#64748b",
    },
    {
      id: "planet-system",
      kind: "group",
      position: { x: 6, y: 0, z: 0 },
      children: ["planet", "moon"],
    },
    {
      id: "planet",
      kind: "sphere",
      label: "Planet",
      position: { x: 6, y: 0, z: 0 },
      size: 1,
      color: "#67e8f9",
      trailPoints: 140,
    },
    {
      id: "moon",
      kind: "sphere",
      label: "Moon (illustrative)",
      position: { x: 7.4, y: 0, z: 0 },
      size: 0.35,
      color: "#d6d3d1",
      trailPoints: 80,
    },
    {
      id: "camera-marker",
      kind: "camera_marker",
      label: "Camera view",
      position: { x: 11, y: 7, z: 12 },
      size: 0.8,
      color: "#a78bfa",
    },
  ];
}

const RELATIONSHIPS = [
  {
    id: "rel-planet-orbits-star",
    type: "orbits" as const,
    from: "planet-system",
    to: "star",
    label: "The planet orbits the star",
  },
  {
    id: "rel-moon-orbits-planet",
    type: "orbits" as const,
    from: "moon",
    to: "planet",
    label: "The moon orbits the planet",
  },
  {
    id: "rel-star-attracts-planet",
    type: "attracts" as const,
    from: "star",
    to: "planet-system",
    label: "Gravity pulls the planet toward the star",
  },
];

/** Full-motion stage: orbit + rotate + soft glow. */
const ANIMATIONS: AnimationSpec[] = [
  { id: "anim-orbit-planet", target: "planet-system", operator: "orbit", speed: 1, axis: "y" },
  { id: "anim-orbit-moon", target: "moon", operator: "orbit", speed: 2.6, axis: "y" },
  { id: "anim-rotate-star", target: "star", operator: "rotate", speed: 0.35, axis: "y" },
  { id: "anim-star-glow", target: "star-glow", operator: "pulse", speed: 0.8, amplitude: 0.15 },
];

/**
 * Reduced-motion stage: no orbit/rotate/pulse/vector animations. The scene is
 * revealed in discrete steps and only gentle scaling remains, so nothing
 * continuously moves.
 */
const REDUCED_ANIMATIONS: AnimationSpec[] = [
  { id: "anim-reveal-star", target: "star", operator: "reveal", speed: 1, delayMs: 0 },
  { id: "anim-reveal-orbit", target: "orbit-path-planet", operator: "reveal", speed: 1, delayMs: 150 },
  { id: "anim-reveal-planet", target: "planet", operator: "reveal", speed: 1, delayMs: 350 },
  { id: "anim-reveal-moon", target: "moon", operator: "reveal", speed: 1, delayMs: 600 },
  { id: "anim-scale-star", target: "star", operator: "scale", speed: 0.25, amplitude: 0.06 },
];

function controls(reducedMotion: boolean): DemoSpecV1["controls"] {
  const base: DemoSpecV1["controls"] = [
    {
      id: "ctl-speed",
      type: "slider",
      label: "Launch speed",
      target: { kind: "parameter", ref: "speed" },
      min: 0.6,
      max: 1.2,
      step: 0.05,
      defaultValue: 1,
    },
    {
      id: "ctl-g",
      type: "slider",
      label: "Gravity strength",
      target: { kind: "parameter", ref: "g" },
      min: 2,
      max: 60,
      step: 1,
      defaultValue: 10,
    },
    {
      id: "ctl-play",
      type: "play_pause",
      label: "Play / Pause",
      target: { kind: "scene", ref: "play_pause" },
    },
    {
      id: "ctl-reset",
      type: "reset",
      label: "Reset",
      target: { kind: "scene", ref: "reset" },
    },
  ];
  if (reducedMotion) return base;
  return [
    base[0],
    base[1],
    base[2],
    {
      id: "ctl-speed-adj",
      type: "speed_control",
      label: "Simulation speed",
      target: { kind: "scene", ref: "speed" },
      min: 0.25,
      max: 2,
      step: 0.05,
      defaultValue: 1,
    },
    base[3],
  ];
}

const PREDICTION = {
  prompt:
    "While the orbit plays, raise the Launch speed control. What happens to the planet's motion?",
  options: [
    "It speeds up and swings outward into a wider, more elliptical orbit",
    "It slows down and spirals into the star",
    "It stays on the same circular path, just faster",
    "It is instantly flung out of the system",
  ],
  correctIndex: 0,
};

const OBSERVATION_PROMPTS = [
  {
    prompt:
      "Watch the Speed readout as the planet swings around: it is fastest at closest approach to the star.",
  },
  {
    prompt:
      "Raise the Launch speed above 1 and watch the planet swing outward; lower it below 1 and watch it dip inward instead.",
  },
];

const REPRESENTATIONS: DemoSpecV1["representations"] = [
  { id: "rep-stage-3d", kind: "stage_3d", label: "3D orbital stage" },
  { id: "rep-stage-2d", kind: "stage_2d", label: "2D engine view" },
  { id: "rep-table", kind: "table", label: "Readout table" },
  { id: "rep-timeline", kind: "timeline", label: "What to watch" },
  { id: "rep-text", kind: "text_sequence", label: "Step-by-step explanation" },
];

const TIMELINE = {
  events: [
    {
      title: "Circular orbit",
      description:
        "With the curated defaults (launch speed 1), the planet traces a circular orbit and the speed and distance readouts stay steady.",
      startMs: 0,
      durationMs: 2000,
    },
    {
      title: "Raise the speed",
      description:
        "Increase the Launch speed: the planet speeds up and swings outward on an ellipse — the launch point becomes the closest approach.",
      startMs: 2500,
      durationMs: 2500,
    },
    {
      title: "Wider orbits take longer",
      description:
        "Kepler's third law: the orbital period grows with orbit size to the power 3/2, so a wider orbit always takes longer.",
      startMs: 5500,
      durationMs: 2500,
    },
  ],
};

export function buildOrbitsShowcase(prefs?: ShowcasePrefs): DemoSpecV1 {
  const reducedMotion = !!prefs?.reducedMotion;
  const mobile = !!prefs?.mobile;
  const objects = sceneObjects(mobile);
  const controlList = controls(reducedMotion);

  const limitations: string[] = [
    "Idealized point-mass gravity; the engine simulates exactly one star and one planet (RK4 two-body).",
    "The moon and the 3D orbit ring are illustrative stage guides (the ring marks the default orbit); the engine's live path, readouts, and table are the quantitative source.",
  ];
  if (reducedMotion) {
    limitations.push(
      "Reduced-motion variant: the 3D stage stays still; motion is limited to discrete reveal steps and gentle scaling."
    );
  }
  if (mobile) {
    limitations.push("Mobile variant: reduced particle budget for the star glow.");
  }

  return {
    schemaVersion: 1,
    id: ORBITS_SHOWCASE_ID,
    generationId: "showcase-gen-orbits",
    userQuery: ORBITS_SHOWCASE_QUERY,
    normalizedConcept: "gravity and orbits",
    title: "Gravity & Orbits: Why Planets Stay in Orbit",
    learningObjective:
      "See how gravity and launch speed set the shape, size, and period of an orbit, and predict what happens when launch speed changes.",

    trust: {
      level: "verified_simulation",
      label: TRUST_LABELS.verified_simulation,
      limitations,
      engineId: "orbits",
      engineVersion: ENGINE_VERSION,
    },

    renderer: {
      kind: "hybrid",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 16 / 9,
      background: "dark",
    },

    simulation: {
      engineId: "orbits",
      engineVersion: ENGINE_VERSION,
      seed: SEED,
      parameters: PARAMETERS.map((p) => ({ ...p })),
      readouts: READOUTS.map((r) => ({ ...r })),
    },

    scene3d: {
      objects,
      relationships: RELATIONSHIPS.map((r) => ({ ...r })),
      animations: (reducedMotion ? REDUCED_ANIMATIONS : ANIMATIONS).map((a) => ({ ...a })),
    },

    timeline: TIMELINE,

    controls: controlList,
    prediction: { ...PREDICTION, options: [...PREDICTION.options] },
    observationPrompts: OBSERVATION_PROMPTS.map((o) => ({ ...o })),
    representations: REPRESENTATIONS.map((r) => ({ ...r })),
    adaptationContext: { allowed: true, oneVariableMode: true },

    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: GENERATED_AT,
    },

    limits: {
      maxObjects: objects.length,
      maxParticles: mobile ? 200 : 240,
      maxTimelineEvents: TIMELINE.events.length,
      maxControls: controlList.length,
    },
  };
}
