/**
 * electric-fields — curated "Electric Fields" showcase (Level 1, hybrid
 * renderer).
 *
 * The 3D stage shows two draggable charges, a vector-field plane, and a
 * midpoint marker; every readout and the graded prediction couple to the
 * verified lumina-2d "charges" engine
 * (src/demonstrations/renderers/lumina-2d/engines/charges.ts), which computes
 * the Coulomb field and potential of the two live charge positions (softened
 * point charges on a 2D slice).
 *
 * Physics behind the graded prediction (curated defaults q1=+1, q2=-1,
 * separation=140, fieldScale=10; verified against the engine on 2026-08-04):
 *   - potential readout at the midpoint between equal-and-opposite charges is
 *     exactly 0.000 (the contributions cancel: 1/(r+7) - 1/(r+7) = 0),
 *   - the field readout there is non-zero (0.004 with fieldScale=10),
 *   - with both charges positive the midpoint field is exactly zero — a true
 *     null point — while the potential readout rises to 0.026,
 *   - doubling the separation (140 -> 280) drops the midpoint field readout
 *     from 0.004 to 0.001.
 *
 * The q2 slider sets the second charge directly (default -1 with q1=+1:
 * dipole, potential null at the midpoint; set q2=+1 for the same-sign
 * configuration, field null at the midpoint).
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

export const ELECTRIC_FIELDS_SHOWCASE_ID = "showcase-electric-fields";
export const ELECTRIC_FIELDS_SHOWCASE_QUERY = "Why do opposite charges attract?";

/** Fixed seed: the engine is deterministic, so the seed pins the fixture. */
const SEED = 20260804;
const ENGINE_VERSION = "1.0.0";
const GENERATED_AT = "2026-08-04T00:00:00.000Z";

const PARAMETERS: EngineParameterSpec[] = [
  { key: "q1", label: "Charge 1", min: -10, max: 10, step: 0.5, value: 1 },
  { key: "q2", label: "Charge 2", min: -10, max: 10, step: 0.5, value: -1 },
  { key: "separation", label: "Separation", min: 10, max: 900, step: 10, value: 140 },
  { key: "fieldScale", label: "Field arrows", min: 0.05, max: 20, step: 0.1, value: 10 },
];

const READOUTS: ReadoutSpec[] = [
  { key: "fieldStrength", label: "Field strength", format: "fixed3" },
  { key: "potential", label: "Potential", format: "fixed3" },
];

const OBJECTS: PrimitiveObjectSpec[] = [
  {
    id: "charge-positive",
    kind: "sphere",
    label: "Charge +1",
    position: { x: -3, y: 0, z: 0 },
    size: 1,
    color: "#ef4444",
  },
  {
    id: "charge-negative",
    kind: "sphere",
    label: "Charge -1",
    position: { x: 3, y: 0, z: 0 },
    size: 1,
    color: "#3b82f6",
  },
  {
    id: "field-vectors",
    kind: "vector_field",
    label: "Electric field",
    position: { x: 0, y: 0, z: 0 },
    size: 9,
    color: "#38bdf8",
  },
  {
    id: "midpoint-marker",
    kind: "sphere",
    label: "Midpoint",
    position: { x: 0, y: 0, z: 0 },
    size: 0.18,
    color: "#facc15",
  },
  {
    id: "camera-marker",
    kind: "camera_marker",
    label: "Camera view",
    position: { x: 6, y: 3, z: 7 },
    size: 0.8,
    color: "#a78bfa",
  },
];

const RELATIONSHIPS = [
  {
    id: "rel-positive-attracts-negative",
    type: "attracts" as const,
    from: "charge-positive",
    to: "charge-negative",
    label: "Opposite charges attract",
  },
];

/**
 * Drag-handle channels: the shell renders a drag_handle as a note, and the
 * engine stage owns the actual pointer drags. The translate operators give the
 * 3D stage a channel for the same gesture; the speeds are kept near zero so
 * the charges never drift on their own.
 */
const ANIMATIONS: AnimationSpec[] = [
  {
    id: "anim-translate-charge-positive",
    target: "charge-positive",
    operator: "translate",
    speed: 0.1,
    axis: "x",
    amplitude: 1,
  },
  {
    id: "anim-translate-charge-negative",
    target: "charge-negative",
    operator: "translate",
    speed: 0.1,
    axis: "x",
    amplitude: 1,
  },
  {
    id: "anim-midpoint-highlight",
    target: "midpoint-marker",
    operator: "pulse",
    speed: 1.2,
    amplitude: 0.4,
  },
];

/** Reduced motion keeps the drag channels (translate) and drops the pulse. */
const REDUCED_ANIMATIONS: AnimationSpec[] = ANIMATIONS.filter(
  (a) => a.operator !== "pulse"
);

const CONTROLS: DemoSpecV1["controls"] = [
  {
    id: "ctl-drag-1",
    type: "drag_handle",
    label: "Drag the positive charge on the stage",
    target: { kind: "animation", ref: "anim-translate-charge-positive" },
  },
  {
    id: "ctl-drag-2",
    type: "drag_handle",
    label: "Drag the negative charge on the stage",
    target: { kind: "animation", ref: "anim-translate-charge-negative" },
  },
  {
    id: "ctl-q2",
    type: "slider",
    label: "Charge 2 (q2)",
    target: { kind: "parameter", ref: "q2" },
    min: -10,
    max: 10,
    step: 0.5,
    defaultValue: -1,
  },
  {
    id: "ctl-q1",
    type: "slider",
    label: "Charge 1 (q1)",
    target: { kind: "parameter", ref: "q1" },
    min: -10,
    max: 10,
    step: 0.5,
    defaultValue: 1,
  },
  {
    id: "ctl-separation",
    type: "slider",
    label: "Separation",
    target: { kind: "parameter", ref: "separation" },
    min: 20,
    max: 400,
    step: 10,
    defaultValue: 140,
  },
  {
    id: "ctl-field-scale",
    type: "slider",
    label: "Field arrow scale",
    target: { kind: "parameter", ref: "fieldScale" },
    min: 1,
    max: 20,
    step: 1,
    defaultValue: 10,
  },
];

const PREDICTION = {
  prompt:
    "With the Dipole preset on (charges +1 and -1), what is the electric potential exactly halfway between the two charges?",
  options: [
    "It is zero: the equal and opposite contributions cancel",
    "It is at its largest positive value",
    "It is negative, because the negative charge dominates",
    "It is half of the positive charge's value alone",
  ],
  correctIndex: 0,
};

const OBSERVATION_PROMPTS = [
  {
    prompt:
      "With both charges positive, watch the Field strength readout at the midpoint: it reads zero — the two fields cancel there (a null point).",
  },
  {
    prompt:
      "Set Charge 1 and Charge 2 to opposite signs and watch the Potential readout drop to zero at the midpoint while the Field strength readout rises above zero.",
  },
  {
    prompt:
      "Increase the Separation and watch the Field strength readout fall as the charges move apart.",
  },
];

const REPRESENTATIONS: DemoSpecV1["representations"] = [
  { id: "rep-stage-3d", kind: "stage_3d", label: "3D Model" },
  { id: "rep-diagram", kind: "diagram", label: "Diagram" },
  { id: "rep-table", kind: "table", label: "Table" },
  { id: "rep-text", kind: "text_sequence", label: "Text sequence" },
];

export function buildElectricFieldShowcase(prefs?: ShowcasePrefs): DemoSpecV1 {
  const reducedMotion = !!prefs?.reducedMotion;
  const mobile = !!prefs?.mobile;

  const limitations: string[] = [
    "Point charges on a 2D slice; fields and potentials are sampled at the midpoint between the live charge positions.",
    "The 3D stage is stylized; the engine's vector field and readouts are the quantitative source.",
  ];
  if (reducedMotion) {
    limitations.push(
      "Reduced-motion variant: the midpoint highlight is disabled; charges can still be dragged."
    );
  }
  if (mobile) {
    limitations.push("Mobile variant: simplified rendering on small screens.");
  }

  return {
    schemaVersion: 1,
    id: ELECTRIC_FIELDS_SHOWCASE_ID,
    generationId: "showcase-gen-electric-fields",
    userQuery: ELECTRIC_FIELDS_SHOWCASE_QUERY,
    normalizedConcept: "electric fields",
    title: "Electric Fields: Why Opposite Charges Attract",
    learningObjective:
      "See how electric field strength and potential arise from two point charges, and locate the null points of the field and of the potential.",

    trust: {
      level: "verified_simulation",
      label: TRUST_LABELS.verified_simulation,
      limitations,
      engineId: "charges",
      engineVersion: ENGINE_VERSION,
    },

    renderer: {
      kind: "hybrid",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 16 / 9,
      background: "dark",
    },

    simulation: {
      engineId: "charges",
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

    controls: CONTROLS.map((c) => ({ ...c })),
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
      maxTimelineEvents: 1,
      maxControls: CONTROLS.length,
    },
  };
}
