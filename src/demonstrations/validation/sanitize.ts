/**
 * sanitize.ts — the repair-aware validation pipeline for DemoSpecV1.
 *
 * Philosophy:
 *  - Tuning numbers whose meaning survives clamping (engine parameter values,
 *    particle counts, speeds, delays, sizes) are REPAIRED to their bounds.
 *  - Anything whose meaning would change (incompatible engine, level-2
 *    numerical claims, missing mandatory fields, structural overages such as
 *    too many objects) is REJECTED with safe reason codes.
 *  - Input that is not JSON at all yields "fallback".
 *
 * Reasons are SAFE codes only — offending content is never echoed.
 */

import { z } from "zod";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import {
  SCENE_POSITION_BOUND,
  SCENE_SIZE_MAX,
  SCENE_SIZE_MIN,
} from "@/demonstrations/renderers/primitive-3d/geometry/envelopes";
import {
  demoSpecSchema,
  findUnsafeString,
  hasPollutionKey,
  isExecutableCodeString,
  isUnsafeUrlString,
  MAX_SPEC_DEPTH,
  measureDepth,
  MOBILE_MAX_PARTICLES,
} from "./demo-spec-schema";
import { sciencePolicy } from "./science-policy";
import {
  controlReferenceContextForSpec,
  filterUnavailableControlPrompts,
} from "./control-references";

export type SanitizeStatus = "valid" | "repaired" | "rejected" | "fallback";

/** Discriminated on `status`: valid/repaired always carry a spec; rejected
 * and fallback never do. */
export type SanitizeOutcome =
  | { status: "valid" | "repaired"; spec: DemoSpecV1; reasons: string[] }
  | { status: "rejected" | "fallback"; spec?: DemoSpecV1; reasons: string[] };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.min(max, Math.max(min, value));
}

function dedupe(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

/** True when the node looks like an engine-parameter or control tuning block
 * (numeric min/max/step/value present). */
function isTuningBlock(node: Record<string, unknown>): boolean {
  return (
    typeof node.min === "number" &&
    typeof node.max === "number" &&
    typeof node.step === "number" &&
    typeof node.value === "number"
  );
}

/** Per-field clamp targets for scalar tuning numbers. Keys are field names in
 * the spec; snake_case codes are produced on repair. particleCount is handled
 * specially (declared-limit aware) and is therefore not listed here. */
const FIELD_CLAMP_MIN: Record<string, number> = {
  size: 0.001,
  trailPoints: 0,
  speed: 0.001,
  amplitude: 0.001,
  delayMs: 0,
  startMs: 0,
  durationMs: 0,
  preferredAspectRatio: 0.1,
  x: -SCENE_POSITION_BOUND,
  y: -SCENE_POSITION_BOUND,
  z: -SCENE_POSITION_BOUND,
};

const FIELD_CLAMP_MAX: Record<string, number> = {
  size: SCENE_SIZE_MAX,
  trailPoints: SPEC_LIMITS.maxTrailPoints,
  speed: 100,
  amplitude: 1_000_000,
  delayMs: 3_600_000,
  startMs: 3_600_000,
  durationMs: 3_600_000,
  preferredAspectRatio: 10,
  x: SCENE_POSITION_BOUND,
  y: SCENE_POSITION_BOUND,
  z: SCENE_POSITION_BOUND,
};

function fieldCode(field: string): string {
  return field.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// Repair walk
// ---------------------------------------------------------------------------

interface RepairContext {
  /** Declared limits.maxParticles from the raw spec, if it is a sane number;
   * particleCount is clamped to the smaller of the desktop cap and this. */
  declaredMaxParticles: number;
}

/**
 * Deep-clones the raw tree, clamping tuning numbers that are out of range.
 * Structural fields (seed, count-bearing arrays) are never touched — those
 * are rejected by the schema when invalid. Returns the clone and the list of
 * repair reason codes.
 */
function repairTree(
  node: unknown,
  ctx: RepairContext,
  repairs: string[]
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => repairTree(item, ctx, repairs));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const record = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    let next: unknown = value;

    if (key === "unit" && value === "") {
      // Empty display unit on an engine parameter: display-only, drop it.
      repairs.push("repaired:empty_unit");
      continue;
    }
    if (
      value === null &&
      (key === "scene3d" || key === "timeline")
    ) {
      // Models emit null for an optional object field meaning "absent" — the
      // contract types these fields optional, not nullable. A null scene3d is
      // semantically identical to no 3D scene (the 2D engine remains
      // canonical); a null timeline on a Level 3 spec is later rejected by the
      // science policy for missing its timeline. Strip with a repair reason.
      repairs.push(`repaired:null_${key}`);
      continue;
    }
    if (key === "size" && typeof value !== "number") {
      // Non-numeric size (models emit strings like "medium", or null): visual
      // tuning only, the renderer has defaults. Drop rather than reject —
      // meaning is preserved (size is never physics).
      repairs.push("repaired:non_numeric_size");
      continue;
    }
    if (typeof value === "number" && isTuningBlock(record) && key === "value") {
      // Engine-parameter value: clamp into its own [min, max].
      const min = record.min as number;
      const max = record.max as number;
      if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
        const clamped = clampNumber(value, min, max);
        if (clamped !== value) {
          repairs.push("repaired:param_value");
          next = clamped;
        }
      }
    } else if (key === "defaultValue" && typeof value === "number") {
      const defaultValueClamped = clampControlDefault(record, value, repairs);
      if (defaultValueClamped !== null) {
        next = defaultValueClamped;
      }
    } else if (typeof value === "number") {
      const clamped: number | null = clampField(key, value, ctx, repairs);
      if (clamped !== null) {
        next = clamped;
      }
    } else if (value !== null && typeof value === "object") {
      next = repairTree(value, ctx, repairs);
    }

    out[key] = next;
  }
  return out;
}

function clampField(
  field: string,
  value: number,
  ctx: RepairContext,
  repairs: string[]
): number | null {
  if (!Number.isFinite(value)) return null; // schema rejects; not repairable
  let min = FIELD_CLAMP_MIN[field];
  let max = FIELD_CLAMP_MAX[field];
  if (field === "maxParticles") {
    // Over-declared particle budgets clamp to the desktop cap (1500); mobile
    // adaptation (500) happens at render time. Zero is a valid budget ("no
    // particles used").
    const clamped = clampNumber(value, 0, SPEC_LIMITS.maxParticlesDesktop);
    if (clamped !== value) {
      repairs.push("repaired:maxParticles");
      return Math.round(clamped);
    }
    return null;
  }
  if (field === "maxObjects") {
    // Over-declared object budgets clamp to the hard cap (80); the renderer
    // enforces the same cap. Zero is a valid budget ("no objects").
    const clamped = clampNumber(value, 0, SPEC_LIMITS.maxObjects);
    if (clamped !== value) {
      repairs.push("repaired:maxObjects");
      return Math.round(clamped);
    }
    return null;
  }
  if (field === "maxTimelineEvents") {
    // Over-declared timeline budgets clamp to the hard cap; zero is valid.
    const clamped = clampNumber(value, 0, SPEC_LIMITS.maxTimelineEvents);
    if (clamped !== value) {
      repairs.push("repaired:maxTimelineEvents");
      return Math.round(clamped);
    }
    return null;
  }
  if (field === "maxControls") {
    // Over-declared control budgets clamp to the hard cap; zero is valid.
    const clamped = clampNumber(value, 0, SPEC_LIMITS.maxControls);
    if (clamped !== value) {
      repairs.push("repaired:maxControls");
      return Math.round(clamped);
    }
    return null;
  }
  if (field === "particleCount") {
    min = 0;
    max = Math.min(
      SPEC_LIMITS.maxParticlesDesktop,
      Math.max(0, ctx.declaredMaxParticles)
    );
    if (!Number.isFinite(value)) return null;
    const clamped = clampNumber(value, min, max);
    if (clamped !== value) {
      repairs.push("repaired:particle_count");
      return Math.round(clamped);
    }
    return null;
  }
  if (min === undefined || max === undefined) return null;
  const clamped = clampNumber(value, min, max);
  if (field === "trailPoints" && clamped !== value) {
    repairs.push("repaired:trail_points");
    return Math.round(clamped);
  }
  if (clamped === value) return null;
  repairs.push(`repaired:${fieldCode(field)}`);
  return clamped;
}

function clampControlDefault(
  record: Record<string, unknown>,
  value: number,
  repairs: string[]
): number | null {
  const min = record.min;
  const max = record.max;
  if (
    typeof min === "number" &&
    typeof max === "number" &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min <= max
  ) {
    const clamped = clampNumber(value, min, max);
    if (clamped !== value) {
      repairs.push("repaired:control_default");
      return clamped;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

type ParseResult =
  | { kind: "ok"; node: unknown; declaredLimits: Record<string, unknown> }
  | { kind: "fallback"; reasons: string[] }
  | { kind: "rejected"; reasons: string[] };

function parseInput(raw: unknown): ParseResult {
  let node: unknown;
  if (typeof raw === "string") {
    if (byteLength(raw) > SPEC_LIMITS.maxSpecBytes) {
      return { kind: "rejected", reasons: ["too_large"] };
    }
    try {
      node = JSON.parse(raw);
    } catch {
      // Not JSON at all (or unparseable) -> fallback.
      return { kind: "fallback", reasons: ["malformed_json"] };
    }
  } else if (raw !== null && typeof raw === "object") {
    try {
      const serialized = JSON.stringify(raw);
      if (byteLength(serialized) > SPEC_LIMITS.maxSpecBytes) {
        return { kind: "rejected", reasons: ["too_large"] };
      }
    } catch {
      // Circular or otherwise unserializable object.
      return { kind: "fallback", reasons: ["malformed_json"] };
    }
    node = raw;
  } else {
    // Numbers, booleans, null, undefined: not a spec document at all.
    return { kind: "fallback", reasons: ["malformed_json"] };
  }

  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return { kind: "rejected", reasons: ["malformed_json"] };
  }

  const declaredLimits = extractDeclaredLimits(node);
  return { kind: "ok", node, declaredLimits };
}

/** Reads limits.maxParticles if it is a finite number; used for particle
 * clamping. All other declared limits are validated by the schema. */
function extractDeclaredLimits(node: unknown): Record<string, unknown> {
  if (node !== null && typeof node === "object") {
    const limits = (node as Record<string, unknown>).limits;
    if (limits !== null && typeof limits === "object") {
      return limits as Record<string, unknown>;
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// Zod issue -> safe reason code
// ---------------------------------------------------------------------------

function fieldName(path: PropertyKey[]): string {
  const last = path.length > 0 ? String(path[path.length - 1]) : "field";
  if (last === "events") return "timeline_events";
  if (last === "options") return "prediction_options";
  return last;
}

/**
 * Reason codes must never echo attacker-controlled strings verbatim (a key
 * name could smuggle newlines/HTML into log lines). Keep only safe slug
 * characters and cap the length.
 */
function safeReasonSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 24);
  return slug.length > 0 ? slug : "field";
}

function safePath(path: PropertyKey[]): string {
  return path.map((p) => safeReasonSlug(String(p))).join(".") || "root";
}

function describeIssue(issue: z.ZodIssue): string[] {
  const path = issue.path;
  const field = fieldName(path);
  const atPath = safePath(path);
  switch (issue.code) {
    case "custom":
      return [issue.message];
    case "unrecognized_keys":
      return issue.keys.map((key) => `unknown_key:${safeReasonSlug(key)}`);
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
// The pipeline
// ---------------------------------------------------------------------------

/**
 * Full sanitization pipeline: parse -> size/depth/pollution/URL/code gates ->
 * numeric repair -> strict schema validation -> science policy.
 */
export /**
 * Declared limits are a promise about actual usage. When a spec declares a
 * zero (or too-small) budget but actually uses particles/objects, the promise
 * is raised to the real usage — bounded by the hard caps — with a repair
 * reason. Meaning is preserved: a zero budget means "no particles used", and
 * the raised budget matches what the spec ships.
 */
function raiseDeclaredLimits(node: unknown, repairs: string[]): void {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return;
  const record = node as Record<string, unknown>;
  const limits = record.limits as Record<string, unknown> | null | undefined;
  const scene = record.scene3d as Record<string, unknown> | null | undefined;
  if (limits === null || limits === undefined || typeof limits !== "object") {
    return;
  }
  const objects = Array.isArray(scene?.objects) ? scene.objects : [];
  let maxParticlesUsed = 0;
  for (const obj of objects as Array<Record<string, unknown>>) {
    const pc = obj.particleCount;
    if (typeof pc === "number" && Number.isFinite(pc)) {
      maxParticlesUsed = Math.max(maxParticlesUsed, pc);
    }
  }
  const declaredObjects = limits.maxObjects;
  if (typeof declaredObjects === "number" && objects.length > declaredObjects) {
    limits.maxObjects = Math.min(objects.length, SPEC_LIMITS.maxObjects);
    repairs.push("repaired:maxObjects");
  }
  const declaredParticles = limits.maxParticles;
  if (
    typeof declaredParticles === "number" &&
    maxParticlesUsed > declaredParticles
  ) {
    limits.maxParticles = Math.min(
      maxParticlesUsed,
      SPEC_LIMITS.maxParticlesDesktop
    );
    repairs.push("repaired:maxParticles");
  }
  // Timeline and control budgets are the same kind of promise: raised to the
  // actual event/control count when under-declared (bounded by the hard caps).
  const timeline = record.timeline as Record<string, unknown> | null | undefined;
  const events = Array.isArray(timeline?.events) ? timeline.events.length : 0;
  const declaredTimeline = limits.maxTimelineEvents;
  if (typeof declaredTimeline === "number" && events > declaredTimeline) {
    limits.maxTimelineEvents = Math.min(events, SPEC_LIMITS.maxTimelineEvents);
    repairs.push("repaired:maxTimelineEvents");
  }
  const controls = Array.isArray(record.controls) ? record.controls.length : 0;
  const declaredControls = limits.maxControls;
  if (typeof declaredControls === "number" && controls > declaredControls) {
    limits.maxControls = Math.min(controls, SPEC_LIMITS.maxControls);
    repairs.push("repaired:maxControls");
  }
}

export function sanitizeDemoSpec(raw: unknown): SanitizeOutcome {
  const parsed = parseInput(raw);
  if (parsed.kind === "fallback") {
    return { status: "fallback", reasons: dedupe(parsed.reasons) };
  }
  if (parsed.kind === "rejected") {
    return { status: "rejected", reasons: dedupe(parsed.reasons) };
  }

  const { node, declaredLimits } = parsed;

  // Deep recursion guard: rejects beyond MAX_SPEC_DEPTH (8). Runs before any
  // other recursive walk so hostile nesting cannot overflow the stack.
  if (measureDepth(node, MAX_SPEC_DEPTH + 1) > MAX_SPEC_DEPTH) {
    return { status: "rejected", reasons: ["deep_recursion"] };
  }

  if (hasPollutionKey(node)) {
    return { status: "rejected", reasons: ["prototype_pollution"] };
  }

  if (findUnsafeString(node, isUnsafeUrlString) !== null) {
    return { status: "rejected", reasons: ["unsafe_value:url"] };
  }

  if (findUnsafeString(node, isExecutableCodeString) !== null) {
    return { status: "rejected", reasons: ["unsafe_value:code"] };
  }

  // Numeric repair pass. An over-declared particle budget is clamped to the
  // desktop cap (1500) — with a repair reason — and every particleCount clamps
  // against that same enforced cap. Mobile adaptation (500) happens at render
  // time, so the declared budget is a desktop promise. Meaning is preserved:
  // the budget is a resource promise, not physics.
  const repairs: string[] = [];
  const declaredMaxParticles =
    typeof declaredLimits.maxParticles === "number" &&
    Number.isFinite(declaredLimits.maxParticles) &&
    declaredLimits.maxParticles > 0
      ? Math.min(declaredLimits.maxParticles, SPEC_LIMITS.maxParticlesDesktop)
      : SPEC_LIMITS.maxParticlesDesktop;
  const repaired = repairTree(node, { declaredMaxParticles }, repairs);
  // Declared limits are a promise: when a spec declares a zero budget but
  // actually uses particles/objects, the promise is raised to the real usage
  // (bounded by the hard caps) with a repair reason.
  raiseDeclaredLimits(repaired, repairs);

  const parsedSpec = demoSpecSchema.safeParse(repaired);
  if (!parsedSpec.success) {
    return {
      status: "rejected",
      reasons: dedupe(parsedSpec.error.issues.flatMap(describeIssue)),
    };
  }

  // Lesson-action contract: an observation prompt that instructs the learner
  // to manipulate a control must resolve to an available control. Prompts
  // referencing unavailable controls (bad controlId, or legacy free text
  // naming a known control the spec does not expose) are dropped — an
  // instruction the learner cannot perform is never shown. Meaning is
  // preserved for every prompt that stays: nothing is remapped.
  const filteredObservationPrompts = filterUnavailableControlPrompts(
    parsedSpec.data.observationPrompts,
    parsedSpec.data.controls,
    controlReferenceContextForSpec(parsedSpec.data)
  );
  if (filteredObservationPrompts.length !== parsedSpec.data.observationPrompts.length) {
    repairs.push("repaired:observation_prompt_unavailable_control");
    parsedSpec.data.observationPrompts = filteredObservationPrompts;
  }

  const policy = sciencePolicy(parsedSpec.data);
  if (!policy.ok) {
    return { status: "rejected", reasons: dedupe(policy.reasons) };
  }

  // z-collapse warning (design-1 §7.3): objects equal in x,y but separated
  // only in z render as one pixel blob on the 2D surface (z is dropped). Any
  // provenance — surfaced as a reason, never auto-fixed and never flips the
  // status. Non-graph 3D scenes legitimately use z; the warning is the
  // contract's honest record.
  const reasonsOut = dedupe(repairs);
  const objects = parsedSpec.data.scene3d?.objects ?? [];
  const geometryObjects = objects.filter((o) => o.kind !== "group");
  for (let i = 0; i < geometryObjects.length; i++) {
    for (let j = i + 1; j < geometryObjects.length; j++) {
      const a = geometryObjects[i];
      const b = geometryObjects[j];
      const pa = a.position ?? { x: 0, y: 0, z: 0 };
      const pb = b.position ?? { x: 0, y: 0, z: 0 };
      if (
        Math.abs(pa.x - pb.x) < 1e-6 &&
        Math.abs(pa.y - pb.y) < 1e-6 &&
        Math.abs(pa.z - pb.z) >= 1e-6
      ) {
        reasonsOut.push("z_collapse_warning");
        break;
      }
    }
    if (reasonsOut.includes("z_collapse_warning")) break;
  }

  return {
    status: repairs.length > 0 ? "repaired" : "valid",
    spec: parsedSpec.data,
    reasons: reasonsOut,
  };
}

/**
 * Same pipeline as sanitizeDemoSpec, but the "fallback" status (input was not
 * JSON at all) is surfaced as "rejected" so callers only ever see
 * valid/repaired/rejected.
 */
export function validateDemoSpec(raw: unknown): {
  status: "valid" | "repaired" | "rejected";
  spec?: DemoSpecV1;
  reasons: string[];
} {
  const outcome = sanitizeDemoSpec(raw);
  if (outcome.status === "fallback") {
    return { status: "rejected", reasons: ["malformed_json"] };
  }
  return {
    status: outcome.status,
    spec: outcome.spec,
    reasons: outcome.reasons,
  };
}

// Referenced so consumers can tune mobile rendering with the contract value.
export { MOBILE_MAX_PARTICLES };
