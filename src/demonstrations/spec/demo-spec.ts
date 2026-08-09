/**
 * DemoSpecV1 — the bounded contract every generated demonstration satisfies.
 *
 * The AI is NEVER asked to write code. It is asked to emit a JSON document of
 * this exact shape; a runtime validator (src/demonstrations/validation) then
 * rejects, repairs, or accepts it. Deterministic renderers are the ONLY thing
 * allowed to build the experience.
 *
 * Versioned: future breaking changes bump `schemaVersion` and introduce a new
 * interface rather than mutating this one.
 */

// ---------------------------------------------------------------------------
// Trust levels
// ---------------------------------------------------------------------------

export const TRUST_LEVELS = [
  "verified_simulation",
  "conceptual_demonstration",
  "explanatory_animation",
] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const TRUST_LABELS: Record<TrustLevel, string> = {
  verified_simulation: "Verified simulation",
  conceptual_demonstration: "Conceptual demonstration",
  explanatory_animation: "Explanatory animation",
};

/** The only engines curated code may implement. */
export const VERIFIED_ENGINE_IDS = [
  "pendulum",
  "orbits",
  "projectile",
  "gas",
  "charges",
  "waves",
  "reaction_diffusion",
  "cellular_automaton",
  "rc_circuit",
  "newton_second_law",
  "nuclear_chain_reaction",
] as const;

export type VerifiedEngineId = (typeof VERIFIED_ENGINE_IDS)[number];

// ---------------------------------------------------------------------------
// Approved primitive catalog (3D and 2D-stage objects)
// ---------------------------------------------------------------------------

export const PRIMITIVE_KINDS = [
  "sphere",
  "box",
  "plane",
  "ring",
  "arrow",
  "line",
  "trail",
  "label",
  "particle_field",
  "vector_field",
  "orbit_path",
  "wave_surface",
  "graph_surface",
  "process_node",
  "process_edge",
  "energy_packet",
  "camera_marker",
  "group",
] as const;

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

/** Approved relationship operators between scene objects. */
export const RELATIONSHIP_OPERATORS = [
  "attracts",
  "repels",
  "orbits",
  "collides_with",
  "flows_to",
  "transfers_to",
  "oscillates_with",
  "causes",
  "inhibits",
  "activates",
  "contains",
  "transforms_into",
] as const;

export type RelationshipOperator = (typeof RELATIONSHIP_OPERATORS)[number];

/** Approved animation operators. */
export const ANIMATION_OPERATORS = [
  "rotate",
  "orbit",
  "translate",
  "oscillate",
  "pulse",
  "follow_path",
  "emit",
  "fade",
  "reveal",
  "scale",
  "change_color",
  "update_vector",
] as const;

export type AnimationOperator = (typeof ANIMATION_OPERATORS)[number];

/** Approved learner-facing control types. */
export const CONTROL_TYPES = [
  "slider",
  "toggle",
  "segmented_control",
  "button",
  "drag_handle",
  "play_pause",
  "speed_control",
  "reset",
] as const;

export type ControlType = (typeof CONTROL_TYPES)[number];

// ---------------------------------------------------------------------------
// Hard resource limits (validated by the sanitizer; never exceeded)
// ---------------------------------------------------------------------------

export const SPEC_LIMITS = {
  maxObjects: 80,
  maxParticlesDesktop: 1500,
  maxParticlesMobile: 500,
  maxTimelineEvents: 30,
  maxControls: 6,
  maxLabels: 25,
  maxRelationships: 100,
  maxTrailPoints: 300,
  maxGroupDepth: 4,
  maxSpecBytes: 256 * 1024, // 256 KB
  maxGenerationMs: 12_000,
  maxExplanationChars: 800,
  maxPredictionOptions: 4,
  maxObservationPrompts: 6,
  maxRepresentations: 5,
} as const;

// ---------------------------------------------------------------------------
// Renderer kinds
// ---------------------------------------------------------------------------

export const RENDERER_KINDS = ["lumina_2d", "primitive_3d", "hybrid"] as const;
export type RendererKind = (typeof RENDERER_KINDS)[number];

export const FALLBACK_KINDS = [
  "accessible_diagram",
  "timeline",
  "data_table",
] as const;
export type FallbackKind = (typeof FALLBACK_KINDS)[number];

// ---------------------------------------------------------------------------
// Sub-specs
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface EngineParameterSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}

export interface ReadoutSpec {
  key: string;
  label: string;
  /** How the number should be formatted, e.g. "fixed2" | "percent" | "raw". */
  format: "fixed2" | "fixed3" | "percent" | "raw";
}

export interface VerifiedSimulationSpec {
  engineId: VerifiedEngineId;
  engineVersion: string;
  seed: number;
  parameters: EngineParameterSpec[];
  readouts: ReadoutSpec[];
  /**
   * Phase 2C: the model's bounded, engine-owned control selection. The hosted
   * model may emit ONLY this field for verified engines — every entry must be
   * a key in ENGINE_CATALOG[engineId].parameterKeys (validator reason
   * `invalid_engine_key`), 1-4 entries. Deterministic code (the controls
   * materializer) builds the full ControlSpec[] from this selection and the
   * EngineControlCatalog; the model never invents controls. Optional so every
   * existing curated spec (explicit controls, no focus selection) validates
   * unchanged.
   */
  focusParameterKeys?: string[];
}

/**
 * FIX 3 semantic identity (orbit-learning root cause §4/§5): learner-facing
 * metadata an author may attach to a scene object so hover cards, legends,
 * and relationship guides can explain WHAT the object is, WHAT it does, and
 * whether the learner can interact with it — for every scene type, not just
 * conceptual graphs. All fields optional; when absent, presentation layers
 * auto-derive a fallback from id/label/kind/relationships (existing
 * behavior, byte-identical). Additive-only: no wire-shape change, no new
 * rejection for specs that omit it.
 */
export interface SceneSemanticSpec {
  /** Canonical display name (e.g. "Star"); capped at 24 chars. */
  name?: string;
  /** Object category, e.g. "star" | "planet" | "orbit guide". */
  type?: string;
  /** One-sentence learner-facing description of what the object is. */
  shortDescription?: string;
  /** Short role label, e.g. "central body" | "orbiter" | "satellite". */
  role?: string;
  /** Whether the learner can directly interact with this object. */
  interactive?: boolean;
  /** One-sentence summary of how this object relates to the scene, e.g.
   * "Gravity pulls the planet toward it." When absent, presentation layers
   * derive one from the scene's relationships. */
  relationshipSummary?: string;
}

export interface PrimitiveObjectSpec {
  id: string;
  kind: PrimitiveKind;
  label?: string;
  position?: Vec3;
  /** Size hint in world units; clamped by the renderer. */
  size?: number;
  color?: string;
  /** Trail only meaningful for moving objects; points clamped by the renderer. */
  trailPoints?: number;
  /** particle_field only: how many particles to show. */
  particleCount?: number;
  /** group only: child object ids (depth clamped). */
  children?: string[];
  /**
   * FIX 3 shorthand (additive): the object's learner-facing role, e.g.
   * "central body". Merged into `semantic.role` by the scene-graph and
   * presentation layers when `semantic.role` is absent.
   */
  role?: string;
  /**
   * FIX 3 shorthand (additive): a short learner-facing description of what
   * the object is (capped at 160 chars). Merged into
   * `semantic.shortDescription` by the scene-graph and presentation layers
   * when `semantic.shortDescription` is absent.
   */
  description?: string;
  /**
   * FIX 3 semantic identity block (additive): rich learner-facing metadata
   * for hover cards, legends, and relationship guides, for every scene type
   * (conceptual AND verified_simulation/hybrid). All fields optional; the
   * union is the canonical shape { name, type, shortDescription, role,
   * interactive, relationshipSummary } keyed by the object's own `id`.
   */
  semantic?: SceneSemanticSpec;
}

export interface RelationshipSpec {
  id: string;
  type: RelationshipOperator;
  from: string;
  to: string;
  label?: string;
}

export interface AnimationSpec {
  id: string;
  target: string;
  operator: AnimationOperator;
  /** Speed multiplier; renderer clamps. */
  speed?: number;
  /** Delay before the operator starts (ms). */
  delayMs?: number;
  /** Where the operator acts (e.g. "y" axis for rotate/oscillate). */
  axis?: "x" | "y" | "z";
  /** Amplitude for oscillate/pulse/translate operators. */
  amplitude?: number;
}

export interface TimelineEventSpec {
  title: string;
  description: string;
  /** Start time in ms; renderer normalizes. */
  startMs: number;
  durationMs: number;
}

export interface TimelineSpec {
  events: TimelineEventSpec[];
}

export interface ControlSpec {
  id: string;
  type: ControlType;
  label: string;
  /**
   * What the control drives.
   * - engine parameter: { kind: "parameter", ref: <EngineParameterSpec.key> }
   * - animation operator: { kind: "animation", ref: <AnimationSpec.id> }
   * - scene state: { kind: "scene", ref: "speed" | "paused" | "reset" | "play_pause" }
   */
  target:
    | { kind: "parameter"; ref: string }
    | { kind: "animation"; ref: string }
    | { kind: "scene"; ref: "speed" | "paused" | "reset" | "play_pause" };
  min?: number;
  max?: number;
  step?: number;
  /** segmented_control only. */
  options?: string[];
  defaultValue?: string | number;
}

export interface PredictionSpec {
  prompt: string;
  options: string[];
  /**
   * For curated engines only: the index of the physically correct option,
   * verified by the engine itself (never asserted by the model). Undefined
   * for conceptual demonstrations and explanatory animations — those record
   * the learner's reasoning without grading it.
   */
  correctIndex?: number;
}

export interface ObservationPrompt {
  prompt: string;
  /**
   * For prompts that instruct the learner to manipulate a control: the exact
   * id of that control in the spec's controls array. Purely observational
   * prompts (watch/notice/describe only) omit it. Validators and the lesson
   * rail drop prompts whose controlId does not resolve to an available
   * control — an instruction the learner cannot perform is never shown.
   */
  controlId?: string;
}

export interface RepresentationSpec {
  id: string;
  kind:
    | "stage_2d"
    | "stage_3d"
    | "diagram"
    | "graph"
    | "table"
    | "timeline"
    | "text_sequence"
    | "causal_map";
  label: string;
}

export interface AdaptationContextSpec {
  /** Whether a bounded AI adaptation is offered at all. */
  allowed: boolean;
  /** One-variable mode: freeze all but the selected control. */
  oneVariableMode: boolean;
}

// ---------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------

export interface DemoSpecV1 {
  schemaVersion: 1;
  id: string;
  generationId: string;
  userQuery: string;
  normalizedConcept: string;
  title: string;
  learningObjective: string;

  trust: {
    level: TrustLevel;
    label: string;
    limitations: string[];
    engineId?: VerifiedEngineId;
    engineVersion?: string;
  };

  renderer: {
    kind: RendererKind;
    fallbackKind: FallbackKind;
    preferredAspectRatio: number;
    background: "dark" | "light";
  };

  simulation?: VerifiedSimulationSpec;
  scene3d?: {
    objects: PrimitiveObjectSpec[];
    relationships: RelationshipSpec[];
    animations: AnimationSpec[];
  };
  timeline?: TimelineSpec;

  controls: ControlSpec[];
  prediction: PredictionSpec;
  observationPrompts: ObservationPrompt[];
  representations: RepresentationSpec[];
  adaptationContext: AdaptationContextSpec;

  provenance: {
    source: "curated_engine" | "template_composition" | "model_generated_spec";
    templateIds: string[];
    generatedAt: string;
    model?: string;
  };

  limits: {
    maxObjects: number;
    maxParticles: number;
    maxTimelineEvents: number;
    maxControls: number;
  };
}

// ---------------------------------------------------------------------------
// Engine capability catalog — the source of truth both the offline router and
// the hosted model prompt consume. Curated in code; never model-authored.
// ---------------------------------------------------------------------------

export interface EngineCapability {
  id: VerifiedEngineId;
  title: string;
  domain:
    | "mechanics"
    | "gravity"
    | "electricity"
    | "waves"
    | "thermodynamics"
    | "chemistry"
    | "biology"
    | "networks"
    | "process_systems";
  keywords: string[];
  /** Canonical parameter keys the engine understands. */
  parameterKeys: string[];
  readoutKeys: string[];
  supports3D: boolean;
  supports2D: boolean;
}

export const ENGINE_CATALOG: Record<VerifiedEngineId, EngineCapability> = {
  orbits: {
    id: "orbits",
    title: "Gravity & Orbits",
    domain: "gravity",
    keywords: [
      "orbit", "orbits", "gravity", "gravitational", "planet", "planets",
      "solar system", "kepler", "newton", "star", "moon", "space",
      "astronomy", "satellite", "binary star", "celestial",
    ],
    parameterKeys: ["g", "speed", "bodyMass", "eccentricity", "distance"],
    readoutKeys: ["period", "speed", "distance"],
    supports3D: true,
    supports2D: true,
  },
  projectile: {
    id: "projectile",
    title: "Projectile Motion",
    domain: "mechanics",
    keywords: [
      "projectile", "trajectory", "cannon", "throw", "launch", "parabola",
      "ballistic", "kinematics", "range", "air resistance", "drag",
      "gravity motion", "catapult",
    ],
    parameterKeys: ["angle", "speed", "drag", "gravity"],
    readoutKeys: ["range", "maxHeight", "timeOfFlight"],
    supports3D: false,
    supports2D: true,
  },
  charges: {
    id: "charges",
    title: "Electric Fields",
    domain: "electricity",
    keywords: [
      "charge", "charges", "electric", "electric field", "coulomb",
      "electrostatic", "dipole", "field lines", "voltage", "proton",
      "electron", "field",
    ],
    parameterKeys: ["q1", "q2", "separation", "fieldScale"],
    readoutKeys: ["fieldStrength", "potential"],
    supports3D: true,
    supports2D: true,
  },
  waves: {
    id: "waves",
    title: "Waves & Interference",
    domain: "waves",
    keywords: [
      "wave", "waves", "interference", "diffraction", "double slit",
      "double-slit", "ripple", "sound wave", "light wave", "wavelength",
      "frequency", "standing wave", "young",
    ],
    parameterKeys: ["frequency", "wavelength", "amplitude", "separation", "phase"],
    readoutKeys: ["intensity", "wavelength"],
    supports3D: true,
    supports2D: true,
  },
  gas: {
    id: "gas",
    title: "Kinetic Theory of Gases",
    domain: "thermodynamics",
    keywords: [
      "gas", "gases", "diffusion", "kinetic", "temperature", "pressure",
      "brownian", "maxwell", "boltzmann", "entropy", "molecules",
      "ideal gas", "heat",
    ],
    parameterKeys: ["temperature", "particles", "gravity", "speedScale"],
    readoutKeys: ["avgSpeed", "collisions", "temperature"],
    supports3D: false,
    supports2D: true,
  },
  pendulum: {
    id: "pendulum",
    title: "Pendulum",
    domain: "mechanics",
    keywords: [
      "pendulum", "swing", "oscillation", "harmonic", "period", "chaos",
      "chaotic", "double pendulum",
    ],
    parameterKeys: ["length", "gravity", "amplitude", "damping"],
    readoutKeys: ["period", "angle"],
    supports3D: false,
    supports2D: true,
  },
  rc_circuit: {
    id: "rc_circuit",
    title: "RC Circuit",
    domain: "electricity",
    keywords: [
      "circuit", "rc circuit", "resistor", "capacitor", "capacitance",
      "resistance", "ohm", "voltage", "current", "time constant",
      "charging", "discharge",
    ],
    parameterKeys: ["resistance", "capacitance", "voltage"],
    readoutKeys: ["voltage", "current", "charge"],
    supports3D: false,
    supports2D: true,
  },
  reaction_diffusion: {
    id: "reaction_diffusion",
    title: "Reaction–Diffusion",
    domain: "chemistry",
    keywords: [
      "reaction diffusion", "reaction-diffusion", "turing pattern",
      "turing patterns", "gray scott", "pattern formation", "morphogenesis",
      "chemistry", "stripes", "spots",
    ],
    parameterKeys: ["feed", "kill", "diffusionU", "diffusionV"],
    readoutKeys: ["pattern"],
    supports3D: false,
    supports2D: true,
  },
  cellular_automaton: {
    id: "cellular_automaton",
    title: "Cellular Automata",
    domain: "process_systems",
    keywords: [
      "game of life", "conway", "cellular automata", "cellular automaton",
      "automata", "emergence", "glider", "complexity", "artificial life",
    ],
    parameterKeys: ["speed", "density"],
    readoutKeys: ["population", "generation"],
    supports3D: false,
    supports2D: true,
  },
  nuclear_chain_reaction: {
    id: "nuclear_chain_reaction",
    title: "Nuclear Chain Reaction",
    domain: "process_systems",
    keywords: [
      "nuclear chain reaction", "chain reaction", "fission", "neutron",
      "absorber", "control rod",
    ],
    parameterKeys: ["initialNeutrons", "absorber", "multiplication"],
    readoutKeys: ["neutronCount", "generation"],
    supports3D: false,
    supports2D: true,
  },
  newton_second_law: {
    id: "newton_second_law",
    title: "Newton's Second Law",
    domain: "mechanics",
    keywords: [
      "newton's second law", "second law of newton", "newton second law",
      "f = ma", "force and mass", "force and acceleration", "newtons law",
    ],
    parameterKeys: ["force", "mass"],
    readoutKeys: ["acceleration", "velocity", "distance"],
    supports3D: false,
    supports2D: true,
  },
};

/** Conceptual templates (Level 2) — composition-only, never quantitative. */
export const CONCEPTUAL_TEMPLATE_IDS = [
  "process_flow",
  "energy_transfer",
  "cause_effect_network",
  "particle_population",
  "layered_system",
  "cyclic_process",
  "before_after_comparison",
  "field_relationship",
  "transport_network",
  "timeline_sequence",
] as const;

export type ConceptualTemplateId = (typeof CONCEPTUAL_TEMPLATE_IDS)[number];
