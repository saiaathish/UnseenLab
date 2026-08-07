/**
 * wave-interference — curated "Waves & Interference" showcase (Level 1,
 * hybrid renderer).
 *
 * The 3D stage shows two point sources and an animated wave surface with
 * constructive/destructive markers; every readout and the graded prediction
 * couple to the verified lumina-2d "waves" engine
 * (src/demonstrations/renderers/lumina-2d/engines/waves.ts), which integrates
 * the 2D wave equation u_tt = c^2 lap(u) on a finite-difference grid with two
 * in-phase point sources.
 *
 * Physics behind the graded prediction (raise Source separation from the
 * curated default of 40 cells; verified against the engine on 2026-08-04):
 * counting the local maxima of |u| along the source column between the two
 * sources (the bright interference lobes) gives, after 4000 steps at 1/60 s:
 *   - separation 40 cells: 2-4 lobes,
 *   - separation 110 cells: 10-15 lobes.
 * So more separation packs more, narrower bright lobes between the sources
 * (fringe spacing scales as wavelength / separation). Shrinking the wavelength
 * has the same effect (lambda 24 -> 8 cells at separation 80 raises the lobe
 * count from 5 to 14).
 *
 * The reducedMotion variant removes all continuous animation: the stage is a
 * static snapshot and the learner uses the 2D engine view, which always
 * animates at the user-controlled rate.
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

export const WAVE_INTERFERENCE_SHOWCASE_ID = "showcase-wave-interference";
export const WAVE_INTERFERENCE_SHOWCASE_QUERY =
  "How do ripples create interference patterns?";

/** Fixed seed: the engine is deterministic, so the seed pins the fixture. */
const SEED = 20260804;
const ENGINE_VERSION = "1.0.0";
const GENERATED_AT = "2026-08-04T00:00:00.000Z";

const PARAMETERS: EngineParameterSpec[] = [
  { key: "frequency", label: "Frequency", min: 0.05, max: 4, step: 0.05, value: 0.5 },
  { key: "wavelength", label: "Wavelength", min: 3, max: 200, step: 1, value: 14 },
  { key: "amplitude", label: "Amplitude", min: 0.05, max: 2, step: 0.05, value: 0.6 },
  { key: "separation", label: "Source separation", min: 4, max: 200, step: 2, value: 40 },
  { key: "phase", label: "Phase difference", min: -1, max: 1, step: 0.05, value: 0 },
];

const READOUTS: ReadoutSpec[] = [
  { key: "intensity", label: "Intensity", format: "fixed3" },
  { key: "wavelength", label: "Wavelength", format: "raw" },
];

const OBJECTS: PrimitiveObjectSpec[] = [
  {
    id: "source-1",
    kind: "sphere",
    label: "Source 1",
    position: { x: -2.5, y: 0, z: 0 },
    size: 0.5,
    color: "#22d3ee",
  },
  {
    id: "source-2",
    kind: "sphere",
    label: "Source 2",
    position: { x: 2.5, y: 0, z: 0 },
    size: 0.5,
    color: "#22d3ee",
  },
  {
    id: "wave-surface",
    kind: "wave_surface",
    label: "Interference surface",
    position: { x: 0, y: 0, z: 0 },
    size: 10,
    color: "#38bdf8",
  },
  {
    id: "constructive-marker",
    kind: "label",
    label: "Constructive (bright)",
    position: { x: 0, y: 1.6, z: 0 },
    color: "#66bb6a",
  },
  {
    id: "destructive-marker",
    kind: "label",
    label: "Destructive (dark)",
    position: { x: 0, y: -1.6, z: 0 },
    color: "#ff5252",
  },
  {
    id: "camera-marker",
    kind: "camera_marker",
    label: "Camera view",
    position: { x: 6, y: 4, z: 8 },
    size: 0.8,
    color: "#a78bfa",
  },
];

const RELATIONSHIPS = [
  {
    id: "rel-source1-oscillates",
    type: "oscillates_with" as const,
    from: "source-1",
    to: "wave-surface",
    label: "Each source radiates a wave that spreads across the surface",
  },
  {
    id: "rel-source2-oscillates",
    type: "oscillates_with" as const,
    from: "source-2",
    to: "wave-surface",
    label: "The two waves overlap and interfere",
  },
];

/** Full-motion stage: the sources pulse and the constructive marker cycles
 * through the highlight palette as the bright bands drift. */
const ANIMATIONS: AnimationSpec[] = [
  { id: "anim-source-1-pulse", target: "source-1", operator: "pulse", speed: 1.5, amplitude: 0.6 },
  { id: "anim-source-2-pulse", target: "source-2", operator: "pulse", speed: 1.5, amplitude: 0.6 },
  { id: "anim-constructive-color", target: "constructive-marker", operator: "change_color", speed: 0.15 },
];

/** Reduced motion: static stage; the 2D engine view still animates. */
const REDUCED_ANIMATIONS: AnimationSpec[] = [];

function controls(reducedMotion: boolean): DemoSpecV1["controls"] {
  const base: DemoSpecV1["controls"] = [
    {
      id: "ctl-frequency",
      type: "slider",
      label: "Frequency",
      target: { kind: "parameter", ref: "frequency" },
      min: 0.1,
      max: 1.5,
      step: 0.05,
      defaultValue: 0.5,
    },
    {
      id: "ctl-wavelength",
      type: "slider",
      label: "Wavelength",
      target: { kind: "parameter", ref: "wavelength" },
      min: 8,
      max: 28,
      step: 1,
      defaultValue: 14,
    },
    {
      id: "ctl-separation",
      type: "slider",
      label: "Source separation",
      target: { kind: "parameter", ref: "separation" },
      min: 20,
      max: 110,
      step: 5,
      defaultValue: 40,
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
    base[3],
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
    base[4],
  ];
}

const PREDICTION = {
  prompt:
    "If you increase the Source separation control, what happens to the interference pattern between the two sources?",
  options: [
    "More bright lobes appear between the sources, packed closer together",
    "The lobes spread further apart, so fewer fit between the sources",
    "The pattern disappears entirely",
    "Nothing changes — the pattern stays the same",
  ],
  correctIndex: 0,
};

const OBSERVATION_PROMPTS = [
  {
    prompt:
      "Watch the bright and dark bands between the two sources: bright bands are constructive interference, dark bands are destructive.",
  },
  {
    prompt:
      "Raise the Source separation and count the bright lobes between the sources — more appear, packed closer together.",
  },
  {
    prompt:
      "Lower the Wavelength control and watch the lobes grow narrower; raise it and they widen.",
  },
];

const REPRESENTATIONS: DemoSpecV1["representations"] = [
  { id: "rep-stage-3d", kind: "stage_3d", label: "3D Model" },
  { id: "rep-stage-2d", kind: "stage_2d", label: "2D Model" },
  { id: "rep-graph", kind: "graph", label: "Graph" },
  { id: "rep-timeline", kind: "timeline", label: "Timeline" },
  { id: "rep-text", kind: "text_sequence", label: "Text sequence" },
];

const TIMELINE = {
  events: [
    {
      title: "Two sources, one tank",
      description:
        "Two point sources vibrate in phase at the left edge of the tank; overlapping circular ripples travel right.",
      startMs: 0,
      durationMs: 2000,
    },
    {
      title: "Bright and dark bands",
      description:
        "Where two crests meet the surface is bright (constructive); where a crest meets a trough it is dark (destructive).",
      startMs: 2500,
      durationMs: 2500,
    },
    {
      title: "Separation packs the lobes",
      description:
        "Increasing the distance between the sources narrows the fringe spacing, so more bright lobes fit between them.",
      startMs: 5500,
      durationMs: 2500,
    },
  ],
};

export function buildWaveInterferenceShowcase(prefs?: ShowcasePrefs): DemoSpecV1 {
  const reducedMotion = !!prefs?.reducedMotion;
  const mobile = !!prefs?.mobile;
  const controlList = controls(reducedMotion);

  const limitations: string[] = [
    "Idealized point sources on a damped 2D grid; reflections from the tank edges are not modeled.",
    "The intensity readout is the mean squared amplitude over the whole tank; the pattern is the primary evidence.",
  ];
  if (reducedMotion) {
    limitations.push(
      "Reduced-motion variant: the 3D stage is a static snapshot; the 2D engine view still animates at the user-controlled rate."
    );
  }
  if (mobile) {
    limitations.push("Mobile variant: simplified rendering on small screens.");
  }

  return {
    schemaVersion: 1,
    id: WAVE_INTERFERENCE_SHOWCASE_ID,
    generationId: "showcase-gen-wave-interference",
    userQuery: WAVE_INTERFERENCE_SHOWCASE_QUERY,
    normalizedConcept: "waves and interference",
    title: "Waves & Interference: Two Ripples, One Pattern",
    learningObjective:
      "Watch how two overlapping wave sources build constructive and destructive interference, and predict how the pattern changes with source separation.",

    trust: {
      level: "verified_simulation",
      label: TRUST_LABELS.verified_simulation,
      limitations,
      engineId: "waves",
      engineVersion: ENGINE_VERSION,
    },

    renderer: {
      kind: "hybrid",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 16 / 9,
      background: "dark",
    },

    simulation: {
      engineId: "waves",
      engineVersion: ENGINE_VERSION,
      seed: SEED,
      parameters: PARAMETERS.map((p) => ({ ...p })),
      readouts: READOUTS.map((r) => ({ ...r })),
    },

    scene3d: {
      objects: OBJECTS.map((o) => ({ ...o })),
      relationships: RELATIONSHIPS.map((r) => ({ ...r })),
      animations: (reducedMotion ? REDUCED_ANIMATIONS : ANIMATIONS).map((a) => ({
        ...a,
      })),
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
      maxObjects: OBJECTS.length,
      maxParticles: 1,
      maxTimelineEvents: TIMELINE.events.length,
      maxControls: controlList.length,
    },
  };
}
