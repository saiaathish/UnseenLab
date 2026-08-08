/**
 * demo-spec-schema.ts — the strict Zod mirror of DemoSpecV1.
 *
 * Every object level rejects unknown keys (`.strict()`), enums come only from
 * the contract catalogs, numbers are finite and range-bounded, and the hard
 * SPEC_LIMITS caps are enforced. Strings are bounded; URLs and executable
 * code markers are rejected everywhere. Cross-field invariants (declared
 * limits, group nesting depth, control target resolution) live in the root
 * superRefine.
 *
 * This module is validation-only: it never edits the contract
 * (src/demonstrations/spec/demo-spec.ts) and never reads secrets.
 */

import { z } from "zod";
import {
  TRUST_LEVELS,
  VERIFIED_ENGINE_IDS,
  PRIMITIVE_KINDS,
  RELATIONSHIP_OPERATORS,
  ANIMATION_OPERATORS,
  CONTROL_TYPES,
  SPEC_LIMITS,
  RENDERER_KINDS,
  FALLBACK_KINDS,
  ENGINE_CATALOG,
} from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1, PrimitiveObjectSpec, Vec3 } from "@/demonstrations/spec/demo-spec";
import {
  ENVELOPE_CLEARANCE,
  SCENE_POSITION_BOUND,
  SCENE_SIZE_MAX,
  SCENE_SIZE_MIN,
  envelopeOverlap,
  nodeEnvelope,
} from "@/demonstrations/renderers/primitive-3d/geometry/envelopes";
import type { SceneGraphNode } from "@/demonstrations/renderers/primitive-3d/types";

// ---------------------------------------------------------------------------
// Exported policy constants (consumers may tune their own layers with these)
// ---------------------------------------------------------------------------

/** Particle cap for low-power (mobile) renderers; desktop cap is
 * SPEC_LIMITS.maxParticlesDesktop (1500). */
export const MOBILE_MAX_PARTICLES = SPEC_LIMITS.maxParticlesMobile;

/** Maximum nesting depth (objects + arrays) the validator accepts. */
export const MAX_SPEC_DEPTH = 8;

/** Global sanity envelope for any number in the spec. */
export const GLOBAL_NUM_MIN = -1_000_000_000;
export const GLOBAL_NUM_MAX = 1_000_000_000;

/**
 * Object kinds whose envelope overlap / duplicate position / z-collapse is a
 * genuine model defect (design-1 §7.2, §1.2 — the colliding BODY kinds:
 * movable graph-node kinds minus `label`). Decorative / structural kinds —
 * particle_field, orbit_path, ring, plane, wave_surface, graph_surface,
 * vector_field, arrow, line, trail, process_edge, label, camera_marker —
 * legitimately coincide with bodies by construction (a star's glow and orbit
 * ring surround the star; design-2 §5.3 treats field-overlaps-node as
 * informational, and the 2D spread absorbs their projections), so they are
 * NOT rejection subjects: rejecting them would block legitimate scenes (e.g.
 * the orbits showcase's star + glow + ring concentric at the origin) whenever
 * a model reproduces that composition.
 */
const GEOMETRY_SUBJECT_KINDS: ReadonlySet<PrimitiveObjectSpec["kind"]> =
  new Set(["sphere", "process_node", "energy_packet", "box"]);

// ---------------------------------------------------------------------------
// String bounds
// ---------------------------------------------------------------------------

const MAX_ID_CHARS = 64;
const MAX_TITLE_CHARS = 120;
const MAX_OBJECTIVE_CHARS = 400;
/**
 * userQuery mirrors the intent-layer input cap (500 chars, see
 * src/demonstrations/generation/intent/normalize.ts). It must never be
 * smaller than that cap, or every long-but-legal query would produce a
 * self-invalidating spec.
 */
const MAX_QUERY_CHARS = 500;
const MAX_LIMITATION_CHARS = 240;
const MAX_LABEL_CHARS = 120;
const MAX_EVENT_TITLE_CHARS = 120;
const MAX_ENGINE_VERSION_CHARS = 32;
const MAX_COLOR_CHARS = 32;
const MAX_UNIT_CHARS = 16;
const MAX_GENERATED_AT_CHARS = 64;
const MAX_MODEL_CHARS = 64;
const MAX_OPTION_CHARS = 240;

/**
 * FIX 3 semantic identity bounds (additive): `name` (and the `role` label,
 * a short phrase) cap at 24 chars; learner-facing prose
 * (shortDescription / type / relationshipSummary / the top-level
 * `description` shorthand) caps at 160 chars. The sanitizer TRUNCATES
 * over-length values with a repair reason rather than rejecting, so a model
 * spec carrying verbose semantic prose still validates (additive-only
 * discipline — no new rejection classes for existing specs).
 */
export const MAX_SEMANTIC_NAME_CHARS = 24;
export const MAX_SEMANTIC_DESC_CHARS = 160;

/** Long-form "explanation blocks": timeline event descriptions and
 * prediction/observation prompts are capped at SPEC_LIMITS.maxExplanationChars
 * (800). */
const MAX_EXPLANATION_CHARS = SPEC_LIMITS.maxExplanationChars;

const idString = z.string().min(1).max(MAX_ID_CHARS);
const labelString = z.string().min(1).max(MAX_LABEL_CHARS);
const colorString = z.string().min(1).max(MAX_COLOR_CHARS);
const explanationString = z.string().min(1).max(MAX_EXPLANATION_CHARS);
const engineVersionString = z.string().min(1).max(MAX_ENGINE_VERSION_CHARS);
/** FIX 3 short semantic name / role label (24-char cap, see above). */
const semanticNameString = z.string().min(1).max(MAX_SEMANTIC_NAME_CHARS);
/** FIX 3 learner-facing semantic prose (160-char cap, see above). */
const semanticDescString = z.string().min(1).max(MAX_SEMANTIC_DESC_CHARS);

/**
 * FIX 3 semantic identity block (additive, strict field-list discipline):
 * { name, type, shortDescription, role, interactive, relationshipSummary }.
 * Every field optional; unknown keys inside the block are rejected exactly
 * like every other strict object level in the contract. Strings are bounded
 * here as a backstop — the sanitizer truncates/strips first, so the repair
 * pipeline never rejects on these bounds (additive-only discipline).
 */
const semanticSchema = z
  .object({
    name: semanticNameString.optional(),
    type: semanticDescString.optional(),
    shortDescription: semanticDescString.optional(),
    role: semanticNameString.optional(),
    interactive: z.boolean().optional(),
    relationshipSummary: semanticDescString.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const boundedNumber = z
  .number()
  .finite()
  .min(GLOBAL_NUM_MIN)
  .max(GLOBAL_NUM_MAX);

/** step must be finite, positive and sane. */
const positiveStep = z.number().finite().positive().max(GLOBAL_NUM_MAX);

/** Position axes are bounded to the renderer's world clamp (design-1 §7.1):
 * accepted ⇒ renderable on BOTH surfaces (the 2D diagram reads raw spec
 * positions, which are now guaranteed bounded). */
const vec3Schema = z
  .object({
    x: z.number().finite().min(-SCENE_POSITION_BOUND).max(SCENE_POSITION_BOUND),
    y: z.number().finite().min(-SCENE_POSITION_BOUND).max(SCENE_POSITION_BOUND),
    z: z.number().finite().min(-SCENE_POSITION_BOUND).max(SCENE_POSITION_BOUND),
  })
  .strict();

// ---------------------------------------------------------------------------
// Sub-specs
// ---------------------------------------------------------------------------

const engineParameterSchema = z
  .object({
    key: idString,
    label: labelString,
    min: boundedNumber,
    max: boundedNumber,
    step: positiveStep,
    value: boundedNumber,
    unit: z.string().min(1).max(MAX_UNIT_CHARS).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.min > p.max) {
      ctx.addIssue({ code: "custom", message: "unsafe_value:param" });
    }
    if (p.value < p.min || p.value > p.max) {
      ctx.addIssue({ code: "custom", message: "unsafe_value:param" });
    }
  });

const readoutSchema = z
  .object({
    key: idString,
    label: labelString,
    format: z.enum(["fixed2", "fixed3", "percent", "raw"]),
  })
  .strict();

/** Model's bounded engine-owned control selection: 1-4 keys, each bounded to
 * the contract's identifier length. Membership against the engine catalog is
 * enforced by the superRefine below (reason `invalid_engine_key`). */
const focusParameterKeysSchema = z
  .array(z.string().min(1).max(MAX_ID_CHARS))
  .min(1)
  .max(4)
  .optional();

const simulationSchema = z
  .object({
    engineId: z.enum(VERIFIED_ENGINE_IDS),
    engineVersion: engineVersionString,
    seed: z.number().finite().int().min(0).max(2 ** 32 - 1),
    parameters: z.array(engineParameterSchema).min(1).max(20),
    readouts: z.array(readoutSchema).min(1).max(20),
    focusParameterKeys: focusParameterKeysSchema,
  })
  .strict()
  .superRefine((sim, ctx) => {
    // Phase 2C engine-owned membership: the model may only select parameter
    // keys the VERIFIED engine itself owns. Mirrors the two existing
    // parameter-key validations: the root superRefine builds a `parameterKeys`
    // set from simulation.parameters for control-target resolution
    // (`invalid_control_target`), and science-policy checks parameter/readout
    // keys against ENGINE_CATALOG[engineId].parameterKeys / .readoutKeys
    // (`incompatible_engine`). Here the catalog check happens in the schema so
    // demoSpecSchema direct consumers get it too. engineId is a verified-enum,
    // so ENGINE_CATALOG[sim.engineId] always exists.
    if (sim.focusParameterKeys !== undefined) {
      const capability = ENGINE_CATALOG[sim.engineId];
      for (const key of sim.focusParameterKeys) {
        if (!capability.parameterKeys.includes(key)) {
          ctx.addIssue({ code: "custom", message: "invalid_engine_key" });
        }
      }
    }
  });

const primitiveObjectSchema = z
  .object({
    id: idString,
    kind: z.enum(PRIMITIVE_KINDS),
    label: labelString.optional(),
    position: vec3Schema.optional(),
    size: z
      .number()
      .finite()
      .min(SCENE_SIZE_MIN)
      .max(SCENE_SIZE_MAX)
      .optional(),
    color: colorString.optional(),
    trailPoints: z
      .number()
      .finite()
      .int()
      .min(0)
      .max(SPEC_LIMITS.maxTrailPoints)
      .optional(),
    particleCount: z
      .number()
      .finite()
      .int()
      .min(0)
      .max(SPEC_LIMITS.maxParticlesDesktop)
      .optional(),
    children: z.array(idString).min(1).max(SPEC_LIMITS.maxObjects).optional(),
    // FIX 3 semantic identity (additive; see SceneSemanticSpec in the spec).
    role: semanticNameString.optional(),
    description: semanticDescString.optional(),
    semantic: semanticSchema.optional(),
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
    speed: z.number().finite().min(0.001).max(100).optional(),
    delayMs: z.number().finite().min(0).max(3_600_000).optional(),
    axis: z.enum(["x", "y", "z"]).optional(),
    amplitude: z.number().finite().min(0.001).max(1_000_000).optional(),
  })
  .strict();

const timelineEventSchema = z
  .object({
    title: z.string().min(1).max(MAX_EVENT_TITLE_CHARS),
    description: explanationString,
    startMs: z.number().finite().min(0).max(3_600_000),
    durationMs: z.number().finite().min(0).max(3_600_000),
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
  z
    .object({ kind: z.literal("parameter"), ref: idString })
    .strict(),
  z
    .object({ kind: z.literal("animation"), ref: idString })
    .strict(),
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
    defaultValue: z.union([labelString, boundedNumber]).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (
      c.min !== undefined &&
      c.max !== undefined &&
      c.min > c.max
    ) {
      ctx.addIssue({ code: "custom", message: "unsafe_value:control" });
    }
    if (c.min !== undefined && c.max !== undefined && c.step !== undefined) {
      // A step that cannot be reached from min with at most 10k increments
      // suggests a malformed control; the renderer would loop forever.
      if ((c.max - c.min) / c.step > 10_000) {
        ctx.addIssue({ code: "custom", message: "unsafe_value:control" });
      }
    }
  });

const predictionSchema = z
  .object({
    prompt: explanationString,
    options: z
      .array(z.string().min(1).max(MAX_OPTION_CHARS))
      .min(1)
      .max(SPEC_LIMITS.maxPredictionOptions),
    correctIndex: z
      .number()
      .int()
      .min(0)
      .max(SPEC_LIMITS.maxPredictionOptions - 1)
      .optional(),
  })
  .strict();

const observationPromptSchema = z
  .object({
    prompt: explanationString,
    // Optional binding to a real control; the repair pass drops prompts
    // whose controlId does not resolve to an available control.
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
  .object({
    allowed: z.boolean(),
    oneVariableMode: z.boolean(),
  })
  .strict();

const provenanceSchema = z
  .object({
    source: z.enum([
      "curated_engine",
      "template_composition",
      "model_generated_spec",
    ]),
    templateIds: z.array(idString).max(10),
    generatedAt: z.string().min(1).max(MAX_GENERATED_AT_CHARS),
    model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
  })
  .strict();

const scene3dSchema = z
  .object({
    objects: z.array(primitiveObjectSchema).max(SPEC_LIMITS.maxObjects),
    relationships: z
      .array(relationshipSchema)
      .max(SPEC_LIMITS.maxRelationships),
    // Local bound (no SPEC_LIMITS entry): animations are capped at 100 and
    // the whole spec is capped at 256 KB anyway.
    animations: z.array(animationSchema).max(100),
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
    preferredAspectRatio: z.number().finite().min(0.1).max(10),
    background: z.enum(["dark", "light"]),
  })
  .strict();

const limitsSchema = z
  .object({
    // All four budgets may be 0: a spec with no objects/particles/timeline/
    // controls legitimately declares a zero budget (the model does this).
    // The sanitizer raises declared limits to actual usage when inconsistent,
    // and clamps over-declared budgets to the hard caps.
    maxObjects: z.number().finite().int().min(0).max(SPEC_LIMITS.maxObjects),
    maxParticles: z
      .number()
      .finite()
      .int()
      .min(0)
      .max(SPEC_LIMITS.maxParticlesDesktop),
    maxTimelineEvents: z
      .number()
      .finite()
      .int()
      .min(0)
      .max(SPEC_LIMITS.maxTimelineEvents),
    maxControls: z
      .number()
      .finite()
      .int()
      .min(0)
      .max(SPEC_LIMITS.maxControls),
  })
  .strict();

// ---------------------------------------------------------------------------
// URL / executable-code scan helpers (also used by sanitize + science policy)
// ---------------------------------------------------------------------------

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** True if the string looks like it carries a URL: known dangerous schemes,
 * "www.", a scheme:// prefix, or a protocol-relative "//" prefix. */
export function isUnsafeUrlString(value: string): boolean {
  const lower = value.toLowerCase();
  if (
    lower.includes("http://") ||
    lower.includes("https://") ||
    lower.includes("data:") ||
    lower.includes("javascript:") ||
    lower.includes("www.")
  ) {
    return true;
  }
  if (URL_SCHEME_RE.test(lower)) return true;
  if (lower.startsWith("//")) return true;
  return false;
}

/**
 * Model-authored executable code markers. Matching is case- and
 * whitespace-insensitive, with word boundaries so legitimate words
 * ("evaluate(", "functionality") never false-positive. Also covers event
 * handler attributes, inline scripts and innerHTML sinks — anything that
 * would be executable if it ever reached a DOM sink.
 */
export function isExecutableCodeString(value: string): boolean {
  const compact = value.replace(/\s+/g, " ");
  const patterns: RegExp[] = [
    /\beval\s*\(/i,
    /\bnew\s+Function\s*\(/i,
    /\bonclick\s*=/i,
    /\bonerror\s*=/i,
    /\bonload\s*=/i,
    /\bonmouseover\s*=/i,
    /<script/i,
    /\bsrcdoc\s*=/i,
    /dangerouslySetInnerHTML/i,
  ];
  return patterns.some((re) => re.test(compact));
}

/** Returns the first string (in DFS order) matching the predicate, or null. */
export function findUnsafeString(
  node: unknown,
  predicate: (s: string) => boolean
): string | null {
  if (typeof node === "string") {
    return predicate(node) ? node : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findUnsafeString(item, predicate);
      if (found !== null) return found;
    }
    return null;
  }
  if (node !== null && typeof node === "object") {
    for (const key of Object.keys(node)) {
      const found = findUnsafeString(
        (node as Record<string, unknown>)[key],
        predicate
      );
      if (found !== null) return found;
    }
  }
  return null;
}

/** True if any own key anywhere is a prototype-pollution vector. */
export function hasPollutionKey(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((item) => hasPollutionKey(item));
  }
  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return true;
      }
      if (hasPollutionKey(record[key])) return true;
    }
  }
  return false;
}

/** Maximum object/array nesting depth. Recursion is bounded by
 * `limit` so a hostile deeply-nested input cannot overflow the stack. */
export function measureDepth(node: unknown, limit: number, depth = 0): number {
  if (depth > limit) return depth;
  if (Array.isArray(node)) {
    let max = depth + 1;
    for (const item of node) {
      max = Math.max(max, measureDepth(item, limit, depth + 1));
    }
    return max;
  }
  if (node !== null && typeof node === "object") {
    let max = depth + 1;
    for (const key of Object.keys(node)) {
      max = Math.max(
        max,
        measureDepth((node as Record<string, unknown>)[key], limit, depth + 1)
      );
    }
    return max;
  }
  return depth;
}

// ---------------------------------------------------------------------------
// Root-level cross-field invariants
// ---------------------------------------------------------------------------

function addIssue(
  ctx: z.RefinementCtx,
  message: string,
  path: (string | number)[]
): void {
  ctx.addIssue({ code: "custom", message, path });
}

/** Longest chain of nested "group" objects. Cycles count as infinite. */
function maxGroupDepth(spec: DemoSpecV1): number {
  const objects = spec.scene3d?.objects ?? [];
  const kindById = new Map(objects.map((o) => [o.id, o.kind]));
  const memo = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    if (kindById.get(id) !== "group") return 0;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return Number.POSITIVE_INFINITY; // cycle
    seen.add(id);
    const object = objects.find((o) => o.id === id);
    let maxChild = 0;
    for (const childId of object?.children ?? []) {
      maxChild = Math.max(maxChild, depthOf(childId, seen));
    }
    seen.delete(id);
    memo.set(id, 1 + maxChild);
    return 1 + maxChild;
  };
  let max = 0;
  for (const object of objects) {
    if (object.kind === "group") {
      max = Math.max(max, depthOf(object.id, new Set()));
    }
  }
  return max;
}

const demoSpecBaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idString,
    generationId: idString,
    userQuery: z.string().min(1).max(MAX_QUERY_CHARS),
    normalizedConcept: z.string().min(1).max(MAX_EXPLANATION_CHARS),
    title: z.string().min(1).max(MAX_TITLE_CHARS),
    learningObjective: z.string().min(1).max(MAX_OBJECTIVE_CHARS),

    trust: trustSchema,
    renderer: rendererSchema,

    simulation: simulationSchema.optional(),
    scene3d: scene3dSchema.optional(),
    timeline: timelineSchema.optional(),

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

/** The strict DemoSpecV1 schema. Use sanitizeDemoSpec/validateDemoSpec for
 * the repair-aware pipeline; use this directly only when clamping has
 * already happened. */
export const demoSpecSchema: z.ZodType<DemoSpecV1> = demoSpecBaseSchema
  .superRefine((spec, ctx) => {
    const objectCount = spec.scene3d?.objects.length ?? 0;
    const relationshipCount = spec.scene3d?.relationships.length ?? 0;
    const timelineCount = spec.timeline?.events.length ?? 0;
    const labelCount =
      spec.scene3d?.objects.filter((o) => o.kind === "label").length ?? 0;
    const maxParticleCount = Math.max(
      0,
      ...(spec.scene3d?.objects.map((o) => o.particleCount ?? 0) ?? [0])
    );

    // Declared limits are a promise: actual counts never exceed them, and
    // declared limits never exceed the hard SPEC_LIMITS caps.
    if (objectCount > spec.limits.maxObjects) {
      addIssue(ctx, "count_exceeded:objects", ["scene3d", "objects"]);
    }
    if (timelineCount > spec.limits.maxTimelineEvents) {
      addIssue(ctx, "count_exceeded:timeline_events", ["timeline", "events"]);
    }
    if (spec.controls.length > spec.limits.maxControls) {
      addIssue(ctx, "count_exceeded:controls", ["controls"]);
    }
    if (maxParticleCount > spec.limits.maxParticles) {
      addIssue(ctx, "count_exceeded:particles", ["limits", "maxParticles"]);
    }
    if (labelCount > SPEC_LIMITS.maxLabels) {
      addIssue(ctx, "count_exceeded:labels", ["scene3d", "objects"]);
    }
    if (relationshipCount > SPEC_LIMITS.maxRelationships) {
      addIssue(ctx, "count_exceeded:relationships", [
        "scene3d",
        "relationships",
      ]);
    }

    // Group nesting is capped at SPEC_LIMITS.maxGroupDepth.
    if (maxGroupDepth(spec) > SPEC_LIMITS.maxGroupDepth) {
      addIssue(ctx, "count_exceeded:group_depth", ["scene3d", "objects"]);
    }

    // Control targets must resolve against the spec's own catalogs.
    const parameterKeys = new Set(
      spec.simulation?.parameters.map((p) => p.key) ?? []
    );
    const animationIds = new Set(
      spec.scene3d?.animations.map((a) => a.id) ?? []
    );
    for (const control of spec.controls) {
      if (control.target.kind === "parameter" && !parameterKeys.has(control.target.ref)) {
        addIssue(ctx, "invalid_control_target", ["controls"]);
      }
      if (control.target.kind === "animation" && !animationIds.has(control.target.ref)) {
        addIssue(ctx, "invalid_control_target", ["controls"]);
      }
    }

    // correctIndex must point inside the option list.
    if (
      spec.prediction.correctIndex !== undefined &&
      spec.prediction.correctIndex >= spec.prediction.options.length
    ) {
      addIssue(ctx, "invalid_prediction_index", ["prediction"]);
    }

    // Trust block must agree with the simulation block when both are present.
    if (
      spec.simulation &&
      spec.trust.engineId !== undefined &&
      spec.trust.engineId !== spec.simulation.engineId
    ) {
      addIssue(ctx, "inconsistent_engine", ["trust"]);
    }
    if (
      spec.simulation &&
      spec.trust.engineVersion !== undefined &&
      spec.trust.engineVersion !== spec.simulation.engineVersion
    ) {
      addIssue(ctx, "inconsistent_engine", ["trust"]);
    }

    // Backstop URL / executable-code scan on every string in the parsed spec
    // (the sanitizer also scans the raw tree, so this is defense in depth for
    // direct demoSpecSchema consumers).
    const unsafeUrl = findUnsafeString(spec as unknown, isUnsafeUrlString);
    if (unsafeUrl !== null) {
      addIssue(ctx, "unsafe_value:url", []);
    }
    const unsafeCode = findUnsafeString(spec as unknown, isExecutableCodeString);
    if (unsafeCode !== null) {
      addIssue(ctx, "unsafe_value:code", []);
    }

    // Geometric checks (design-1 §7.2): the model must never emit duplicate /
    // overlapping / z-collapsed geometry — the 2D surface reads raw spec
    // positions and never runs layout, so these classes are rejected at the
    // spec level. Curated specs are exempt: their residual geometry is
    // repaired by the layout engine (provenance template_composition /
    // curated_engine), and a reject would break the live corpus.
    // Subject scope: GEOMETRY_SUBJECT_KINDS only — the colliding bodies whose
    // coincidence is a genuine defect on both surfaces.
    // Overlap threshold (E1, hostile-question 1): the pairwise test uses the
    // layout engine's own minimum clearance (ENVELOPE_CLEARANCE = 0.1 — the
    // layout's collision predicate is OVERLAP_MARGIN = ENVELOPE_CLEARANCE −
    // OVERLAP_EPS), NOT raw penetration. A pair at exactly-touching distance
    // (e.g. the W4 density class: size-1 nodes on a 1-unit grid) is already
    // inside the clearance the layout guarantees, cannot be relied on to
    // repair, and must be rejected up front — the raw-penetration margin
    // (0) let that class through. Any pair within 0.1 world units of
    // touching is `geometry:envelope_overlap`.
    if (spec.provenance.source === "model_generated_spec") {
      const objects = (spec.scene3d?.objects ?? []).filter((o) =>
        GEOMETRY_SUBJECT_KINDS.has(o.kind)
      );
      const objectsWithGeometry = objects.filter((o) => o.kind !== "group");
      const n = objectsWithGeometry.length;
      let duplicateIssue = false;
      let overlapIssue = false;
      let zCollapseIssue = false;
      for (let i = 0; i < n && !(duplicateIssue && overlapIssue && zCollapseIssue); i++) {
        for (let j = i + 1; j < n; j++) {
          const a = objectsWithGeometry[i];
          const b = objectsWithGeometry[j];
          const pa = specPosition(a);
          const pb = specPosition(b);
          const ax = pa.x - pb.x;
          const ay = pa.y - pb.y;
          const az = pa.z - pb.z;
          if (!duplicateIssue && Math.abs(ax) < 1e-6 && Math.abs(ay) < 1e-6 && Math.abs(az) < 1e-6) {
            addIssue(ctx, "geometry:duplicate_position", ["scene3d", "objects"]);
            duplicateIssue = true;
          }
          if (
            !zCollapseIssue &&
            Math.abs(ax) < 1e-6 &&
            Math.abs(ay) < 1e-6 &&
            Math.abs(az) >= 1e-6
          ) {
            addIssue(ctx, "geometry:z_collapse", ["scene3d", "objects"]);
            zCollapseIssue = true;
          }
          if (!overlapIssue && envelopeOverlap(toEnvelope(a, pa), toEnvelope(b, pb), ENVELOPE_CLEARANCE)) {
            addIssue(ctx, "geometry:envelope_overlap", ["scene3d", "objects"]);
            overlapIssue = true;
          }
        }
      }
    }
  });

/** Spec position with the (0,0,0) default the renderer applies. */
function specPosition(o: PrimitiveObjectSpec): Vec3 {
  return o.position ?? { x: 0, y: 0, z: 0 };
}

/** Minimal SceneGraphNode view for nodeEnvelope (only kind/position/size are
 * read). Groups are excluded by the caller before this is reached. */
function toEnvelope(o: PrimitiveObjectSpec, position: Vec3): ReturnType<typeof nodeEnvelope> {
  const node = {
    id: o.id,
    kind: o.kind,
    position,
    size: o.size ?? 1,
  } as unknown as SceneGraphNode;
  return nodeEnvelope(node);
}
