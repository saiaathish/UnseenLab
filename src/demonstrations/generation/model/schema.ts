/**
 * model/schema.ts — FIRST-PASS gate on the model's raw JSON output.
 *
 * The full repair-aware validator (src/demonstrations/validation) is the
 * authority, but it is expensive and its repair pass tolerates out-of-range
 * tuning numbers. This gate runs before it, cheaply rejecting structural
 * garbage: wrong types, unknown keys (strict everywhere), non-catalog enums,
 * non-finite numbers, string overflows, count overflows, URLs, executable-code
 * markers, and hostile nesting depth.
 *
 * Deliberately LOSER than the full validator on scalar tuning numbers (param
 * `value`, `size`, `speed`, `amplitude`, `delayMs`, `startMs`, `durationMs`,
 * `trailPoints`, `particleCount`, `preferredAspectRatio`, control
 * `defaultValue`): those are REPAIRED (clamped) by the sanitizer, and this gate
 * must not reject what the full pipeline can fix. Everything structural (enums,
 * types, string bounds, array counts, seed, steps, control min/max) is enforced
 * here because the full pipeline rejects — never repairs — those.
 *
 * One policy the gate adds: provenance.source MUST be "model_generated_spec".
 * A model-authored document must never masquerade as a curated engine spec.
 *
 * All reasons are SAFE codes — offending content is never echoed.
 */

import { z } from "zod";
import {
  ANIMATION_OPERATORS,
  CONTROL_TYPES,
  FALLBACK_KINDS,
  PRIMITIVE_KINDS,
  RELATIONSHIP_OPERATORS,
  RENDERER_KINDS,
  SPEC_LIMITS,
  TRUST_LEVELS,
  VERIFIED_ENGINE_IDS,
} from "@/demonstrations/spec/demo-spec";
import {
  findUnsafeString,
  isExecutableCodeString,
  isUnsafeUrlString,
  MAX_SPEC_DEPTH,
  measureDepth,
} from "@/demonstrations/validation";

// ---------------------------------------------------------------------------
// Bounds (mirror the full validator's string bounds; strings are never
// repaired, so the gate enforces them at the same values)
// ---------------------------------------------------------------------------

const MAX_ID_CHARS = 64;
const MAX_LABEL_CHARS = 120;
const MAX_TITLE_CHARS = 120;
const MAX_OBJECTIVE_CHARS = 400;
const MAX_LIMITATION_CHARS = 240;
const MAX_EVENT_TITLE_CHARS = 120;
const MAX_ENGINE_VERSION_CHARS = 32;
const MAX_COLOR_CHARS = 32;
const MAX_UNIT_CHARS = 16;
const MAX_GENERATED_AT_CHARS = 64;
const MAX_MODEL_CHARS = 64;
const MAX_OPTION_CHARS = 240;
const MAX_EXPLANATION_CHARS = SPEC_LIMITS.maxExplanationChars;

/** Global sanity envelope for any structural number in the spec. */
const GLOBAL_NUM_MIN = -1_000_000_000;
const GLOBAL_NUM_MAX = 1_000_000_000;

const idString = z.string().min(1).max(MAX_ID_CHARS);
const labelString = z.string().min(1).max(MAX_LABEL_CHARS);
const colorString = z.string().min(1).max(MAX_COLOR_CHARS);
const explanationString = z.string().min(1).max(MAX_EXPLANATION_CHARS);
const engineVersionString = z.string().min(1).max(MAX_ENGINE_VERSION_CHARS);

/** Structural number: finite and inside the global envelope. */
const boundedNumber = z
  .number()
  .finite()
  .min(GLOBAL_NUM_MIN)
  .max(GLOBAL_NUM_MAX);

/** Structural step: finite, positive, sane. */
const positiveStep = z.number().finite().positive().max(GLOBAL_NUM_MAX);

/** Repairable scalar: any finite number. The sanitizer clamps it. */
const wideScalar = z.number().finite();
/** Repairable integer scalar (trailPoints / particleCount). */
const wideIntScalar = z.number().finite().int();

// ---------------------------------------------------------------------------
// Sub-specs (mirror the contract shape; every object level is strict)
// ---------------------------------------------------------------------------

const vec3Schema = z
  .object({ x: boundedNumber, y: boundedNumber, z: boundedNumber })
  .strict();

const engineParameterSchema = z
  .object({
    key: idString,
    label: labelString,
    min: boundedNumber,
    max: boundedNumber,
    step: positiveStep,
    // value is REPAIRED into [min, max] by the sanitizer — accept any finite.
    value: wideScalar,
    // Empty units are repaired (dropped) by the sanitizer — accept any length
    // here so the repair runs instead of a first-pass rejection.
    unit: z.string().max(MAX_UNIT_CHARS).optional(),
  })
  .strict();

const readoutSchema = z
  .object({
    key: idString,
    label: labelString,
    format: z.enum(["fixed2", "fixed3", "percent", "raw"]),
  })
  .strict();

const simulationSchema = z
  .object({
    engineId: z.enum(VERIFIED_ENGINE_IDS),
    engineVersion: engineVersionString,
    seed: z.number().finite().int().min(0).max(2 ** 32 - 1),
    parameters: z.array(engineParameterSchema).min(1).max(20),
    readouts: z.array(readoutSchema).min(1).max(20),
    // Phase 2C: the model's raw output may carry the bounded engine-owned
    // control selection. Admitted here with the same shape/bounds as the full
    // validator (demo-spec-schema simulationSchema) so the gate never rejects
    // what the pipeline can validate. Engine-catalog membership is a cross-
    // field invariant (needs ENGINE_CATALOG) and is enforced by the full
    // validator, not repeated here — a spec that passes this gate may still be
    // rejected downstream (invalid_engine_key).
    focusParameterKeys: z
      .array(z.string().min(1).max(MAX_ID_CHARS))
      .min(1)
      .max(4)
      .optional(),
  })
  .strict();

const primitiveObjectSchema = z
  .object({
    id: idString,
    kind: z.enum(PRIMITIVE_KINDS),
    label: labelString.optional(),
    position: vec3Schema.optional(),
    // size/trailPoints/particleCount are REPAIRED (clamped or dropped) — accept
    // wide values here; models sometimes emit non-numeric size ("medium"),
    // which the sanitizer strips (renderer defaults apply).
    size: z.unknown().optional(),
    color: colorString.optional(),
    trailPoints: wideIntScalar.optional(),
    particleCount: wideIntScalar.optional(),
    children: z.array(idString).min(1).max(SPEC_LIMITS.maxObjects).optional(),
    // FIX 3 semantic identity (additive, W3): accepted wide like `size` — the
    // downstream sanitizer strips invalid types/empties and truncates
    // over-length values with repair reasons (never a new rejection class).
    role: z.unknown().optional(),
    description: z.unknown().optional(),
    semantic: z.unknown().optional(),
  })
  .strict();

const relationshipSchema = z
  .object({
    id: idString,
    type: z.enum(RELATIONSHIP_OPERATORS),
    from: idString,
    to: idString,
    label: labelString.optional(),
  })
  .strict();

const animationSchema = z
  .object({
    id: idString,
    target: idString,
    operator: z.enum(ANIMATION_OPERATORS),
    // speed/delayMs/amplitude are REPAIRED (clamped) — accept wide.
    speed: wideScalar.optional(),
    delayMs: wideScalar.optional(),
    axis: z.enum(["x", "y", "z"]).optional(),
    amplitude: wideScalar.optional(),
  })
  .strict();

const timelineEventSchema = z
  .object({
    title: z.string().min(1).max(MAX_EVENT_TITLE_CHARS),
    description: explanationString,
    // startMs/durationMs are REPAIRED (clamped) — accept wide.
    startMs: wideScalar,
    durationMs: wideScalar,
  })
  .strict();

const timelineSchema = z
  .object({
    events: z
      .array(timelineEventSchema)
      .min(1)
      .max(SPEC_LIMITS.maxTimelineEvents),
  })
  .strict();

const controlTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("parameter"), ref: idString }).strict(),
  z.object({ kind: z.literal("animation"), ref: idString }).strict(),
  z
    .object({
      kind: z.literal("scene"),
      ref: z.enum(["speed", "paused", "reset", "play_pause"]),
    })
    .strict(),
]);

const controlSchema = z
  .object({
    id: idString,
    type: z.enum(CONTROL_TYPES),
    label: labelString,
    target: controlTargetSchema,
    min: boundedNumber.optional(),
    max: boundedNumber.optional(),
    step: positiveStep.optional(),
    options: z.array(labelString).min(1).max(8).optional(),
    // defaultValue numeric is REPAIRED (clamped) — accept any finite number.
    defaultValue: z.union([labelString, wideScalar]).optional(),
  })
  .strict();

const predictionSchema = z
  .object({
    prompt: explanationString,
    options: z
      .array(z.string().min(1).max(MAX_OPTION_CHARS))
      .min(1)
      .max(SPEC_LIMITS.maxPredictionOptions),
    // NOTE: correctIndex is deliberately ABSENT here. Model-generated specs
    // are never graded — the field is stripped in firstPassModelCheck before
    // this schema runs, and if it ever survives to this point the strict
    // object rejects it (unknown key). Only curated engine code may assert
    // prediction truth.
  })
  .strict();

const observationPromptSchema = z
  .object({
    prompt: explanationString,
    // The model may bind an action prompt to a real control id from its own
    // controls list; unresolvable ids are repaired away by the sanitizer.
    controlId: idString.optional(),
  })
  .strict();

const representationSchema = z
  .object({
    id: idString,
    kind: z.enum([
      "stage_2d",
      "stage_3d",
      "diagram",
      "graph",
      "table",
      "timeline",
      "text_sequence",
      "causal_map",
    ]),
    label: labelString,
  })
  .strict();

const adaptationContextSchema = z
  .object({ allowed: z.boolean(), oneVariableMode: z.boolean() })
  .strict();

const provenanceSchema = z
  .object({
    // Policy: a model-authored document must declare itself. The offline
    // builders use the other two sources; the model may never claim them.
    source: z.literal("model_generated_spec"),
    templateIds: z.array(idString).max(10),
    generatedAt: z.string().min(1).max(MAX_GENERATED_AT_CHARS),
    model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  })
  .strict();

const trustSchema = z
  .object({
    level: z.enum(TRUST_LEVELS),
    label: labelString,
    limitations: z
      .array(z.string().min(1).max(MAX_LIMITATION_CHARS))
      .max(4),
    engineId: z.enum(VERIFIED_ENGINE_IDS).optional(),
    engineVersion: engineVersionString.optional(),
  })
  .strict();

const rendererSchema = z
  .object({
    kind: z.enum(RENDERER_KINDS),
    fallbackKind: z.enum(FALLBACK_KINDS),
    // preferredAspectRatio is REPAIRED (clamped 0.1..10) — accept any finite.
    preferredAspectRatio: wideScalar,
    background: z.enum(["dark", "light"]),
  })
  .strict();

const limitsSchema = z
  .object({
    // Deliberately wide (and min 0: a spec with no particle/object content
    // legitimately declares a zero budget; the sanitizer raises declared
    // limits to actual usage when inconsistent). Rejecting here would burn a
    // repair retry on values the sanitizer can fix — models sometimes emit
    // absurd budgets (1e6, 1e9, 1e12) or zero.
    maxObjects: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),
    maxParticles: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),
    // Same policy for timeline/control budgets: over-declared caps are
    // clamped by the sanitizer, so the gate must not reject them.
    maxTimelineEvents: z
      .number()
      .finite()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER),
    maxControls: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

// ---------------------------------------------------------------------------
// The gate schema
// ---------------------------------------------------------------------------

/** Strict mirror of the model's raw output document. Cross-field invariants
 * (control target resolution, declared-limits agreement, trust/simulation
 * consistency, group depth) are the full validator's job and are not repeated
 * here — a spec that passes this gate may still be rejected downstream. */
export const modelOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idString,
    generationId: idString,
    userQuery: z.string().min(1).max(MAX_OBJECTIVE_CHARS),
    normalizedConcept: z.string().min(1).max(MAX_EXPLANATION_CHARS),
    title: z.string().min(1).max(MAX_TITLE_CHARS),
    learningObjective: z.string().min(1).max(MAX_OBJECTIVE_CHARS),
    trust: trustSchema,
    renderer: rendererSchema,
    simulation: simulationSchema.optional(),
    scene3d: z
      .object({
        objects: z.array(primitiveObjectSchema).max(SPEC_LIMITS.maxObjects),
        relationships: z
          .array(relationshipSchema)
          .max(SPEC_LIMITS.maxRelationships),
        animations: z.array(animationSchema).max(100),
      })
      .strict()
      // nullish: models sometimes emit null for an optional object field
      // meaning "absent". The sanitizer strips null scene3d/timeline; the gate
      // must not reject what the repair pass can fix.
      .nullish(),
    timeline: timelineSchema.nullish(),
    controls: z.array(controlSchema).max(SPEC_LIMITS.maxControls),
    prediction: predictionSchema,
    observationPrompts: z
      .array(observationPromptSchema)
      .max(SPEC_LIMITS.maxObservationPrompts),
    representations: z
      .array(representationSchema)
      .max(SPEC_LIMITS.maxRepresentations),
    adaptationContext: adaptationContextSchema,
    provenance: provenanceSchema,
    limits: limitsSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Safe issue -> reason-code mapping (mirrors the sanitizer's mapping)
// ---------------------------------------------------------------------------

function dedupe(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function fieldName(path: PropertyKey[]): string {
  const last = path.length > 0 ? String(path[path.length - 1]) : "field";
  if (last === "events") return "timeline_events";
  if (last === "options") return "prediction_options";
  return last;
}

function describeIssue(issue: z.ZodIssue): string[] {
  const path = issue.path;
  const field = fieldName(path);
  const atPath = path.length > 0 ? path.join(".") : "root";
  switch (issue.code) {
    case "custom":
      return [issue.message];
    case "unrecognized_keys":
      return issue.keys.map((key) => `unknown_key:${key}`);
    case "invalid_value":
      // z.enum / z.literal failures surface as invalid_value in Zod 4.4.
      return [`invalid_enum:${path.length > 0 ? path.join(".") : "value"}`];
    case "too_big":
      if (issue.origin === "array") return [`count_exceeded:${field}`];
      if (issue.origin === "string") return [`text_exceeded:${field}`];
      return [`range_exceeded:${field}`];
    case "too_small":
      if (issue.origin === "array") return [`count_required:${field}`];
      if (issue.origin === "string") return [`empty_field:${field}`];
      return [`range_exceeded:${field}`];
    case "invalid_type":
      return [`invalid_type:${atPath}`];
    case "invalid_format":
      return [`invalid_format:${field}`];
    case "not_multiple_of":
      return [`not_multiple_of:${field}`];
    case "invalid_union":
      return [`invalid_union:${field}`];
    default:
      return [`schema_invalid:${atPath}`];
  }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export type FirstPassResult =
  | { ok: true; value: unknown; repairs?: string[] }
  | { ok: false; reasons: string[] };

/**
 * Cheap structural gate over the model's raw output. Runs before the full
 * repair-aware validator: hostile depth, URL/code strings, and structural
 * violations are rejected here with safe codes; anything that passes is
 * handed to sanitizeDemoSpec for repair + full validation.
 */
export function firstPassModelCheck(raw: unknown): FirstPassResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reasons: ["malformed_json"] };
  }

  // Deep recursion guard: runs before any other recursive walk so hostile
  // nesting cannot overflow the stack (mirrors the sanitizer's order).
  if (measureDepth(raw, MAX_SPEC_DEPTH + 1) > MAX_SPEC_DEPTH) {
    return { ok: false, reasons: ["deep_recursion"] };
  }

  if (findUnsafeString(raw, isUnsafeUrlString) !== null) {
    return { ok: false, reasons: ["unsafe_value:url"] };
  }

  if (findUnsafeString(raw, isExecutableCodeString) !== null) {
    return { ok: false, reasons: ["unsafe_value:code"] };
  }

  // Model-generated specs can never carry prediction truth. The model is
  // instructed to omit correctIndex, but when it includes one anyway it is
  // stripped here (recorded as a repair) rather than rejected — the value is
  // meaningless for model specs and the science policy would reject it
  // downstream regardless. The first-pass schema no longer declares the
  // field, so a spec that survives to parsing without the strip is rejected
  // as an unknown key.
  let repairs: string[] = [];
  const prediction = (raw as Record<string, unknown>)
    .prediction as Record<string, unknown> | null | undefined;
  if (
    prediction !== null &&
    prediction !== undefined &&
    typeof prediction === "object" &&
    "correctIndex" in prediction
  ) {
    delete prediction.correctIndex;
    repairs = ["repaired:model_graded_prediction"];
  }

  const result = modelOutputSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      reasons: dedupe(result.error.issues.flatMap(describeIssue)),
    };
  }
  return { ok: true, value: raw, repairs };
}
