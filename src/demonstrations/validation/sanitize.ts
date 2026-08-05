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
  x: -1_000_000_000,
  y: -1_000_000_000,
  z: -1_000_000_000,
};

const FIELD_CLAMP_MAX: Record<string, number> = {
  size: 1_000_000_000,
  trailPoints: SPEC_LIMITS.maxTrailPoints,
  speed: 100,
  amplitude: 1_000_000,
  delayMs: 3_600_000,
  startMs: 3_600_000,
  durationMs: 3_600_000,
  preferredAspectRatio: 10,
  x: 1_000_000_000,
  y: 1_000_000_000,
  z: 1_000_000_000,
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

  // Numeric repair pass.
  const repairs: string[] = [];
  const declaredMaxParticles =
    typeof declaredLimits.maxParticles === "number" &&
    Number.isFinite(declaredLimits.maxParticles)
      ? declaredLimits.maxParticles
      : SPEC_LIMITS.maxParticlesDesktop;
  const repaired = repairTree(node, { declaredMaxParticles }, repairs);

  const parsedSpec = demoSpecSchema.safeParse(repaired);
  if (!parsedSpec.success) {
    return {
      status: "rejected",
      reasons: dedupe(parsedSpec.error.issues.flatMap(describeIssue)),
    };
  }

  const policy = sciencePolicy(parsedSpec.data);
  if (!policy.ok) {
    return { status: "rejected", reasons: dedupe(policy.reasons) };
  }

  return {
    status: repairs.length > 0 ? "repaired" : "valid",
    spec: parsedSpec.data,
    reasons: dedupe(repairs),
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
