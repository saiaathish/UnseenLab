/**
 * science-policy.ts — trust-level and content-safety policy for DemoSpecV1.
 *
 * Three trust levels, each with hard MUST/MUST-NOT rules:
 *   Level 1 (verified_simulation):     engine-backed, numerically trustworthy.
 *   Level 2 (conceptual_demonstration): qualitative only — no engine, no
 *     graded prediction, at least one stated limitation.
 *   Level 3 (explanatory_animation):   timeline-driven narrative — no engine,
 *     no parameter-driven controls.
 *
 * Content safety rejects operational-danger instruction language in spec-level
 * text (title / learning objective / limitations / normalized concept) while
 * leaving benign fictionalized topics (e.g. a dimensionless nuclear chain
 * reaction demo) untouched. Every reason is a SAFE code — offending text is
 * never echoed.
 */

import {
  ENGINE_CATALOG,
  VERIFIED_ENGINE_IDS,
} from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import {
  findUnsafeString,
  isExecutableCodeString,
} from "./demo-spec-schema";

export interface SciencePolicyResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Operational-danger keywords. Substring match on spec-level text, so
 * "detonate", "enrichment", "weaponize" etc. are all caught. Deliberately
 * phrase-level for synthesis ("explosive synthesis", "drug synthesis") so
 * benign mentions like "chemical reactions" pass.
 */
export const OPERATIONAL_DANGER_KEYWORDS = [
  "weapon",
  "explosive synthesis",
  "synthesis of explosive",
  "detonate",
  "enrich",
  "reactor operation",
  "drug synthesis",
  "controlled substance",
  "biological weapon",
] as const;

export function containsOperationalDanger(text: string): boolean {
  const lower = text.toLowerCase();
  return OPERATIONAL_DANGER_KEYWORDS.some((keyword) =>
    lower.includes(keyword)
  );
}

/**
 * Trust and safety evaluation for a fully parsed DemoSpecV1.
 *
 * Note: Level 1 engine/parameter compatibility is enforced here (it needs the
 * engine catalog), and the schema already guarantees enum membership, finite
 * numbers and bounds — this function re-checks what matters for policy so it
 * is safe to call standalone on any parsed spec.
 */
export function sciencePolicy(spec: DemoSpecV1): SciencePolicyResult {
  const reasons: string[] = [];

  // --- content safety: spec-level text (never echo the offending text) ---
  const specLevelText = [
    spec.title,
    spec.learningObjective,
    spec.normalizedConcept,
    ...spec.trust.limitations,
  ];
  if (specLevelText.some((t) => containsOperationalDanger(t))) {
    reasons.push("science_policy:operational_danger");
  }

  // --- model-authored executable code markers anywhere ---
  if (findUnsafeString(spec as unknown, isExecutableCodeString) !== null) {
    reasons.push("unsafe_value:code");
  }

  // --- prediction truth is curated-only: a model-generated spec can never
  // assert a correctIndex. Only curated engine code may grade a prediction. ---
  if (
    spec.provenance.source === "model_generated_spec" &&
    spec.prediction.correctIndex !== undefined
  ) {
    reasons.push("science_policy:model_graded_prediction");
  }

  // --- executable-stage contract ---
  // A stage_2d tab is the Lumina simulation surface. It is structurally
  // impossible to execute without a simulation payload. Likewise, a spec
  // whose renderer is lumina_2d must not expose *any* stage tab unless a
  // simulation exists. Timeline-only Level-3 specs may still declare
  // renderer.kind=lumina_2d because DemonstrationStage is never mounted for
  // them; the invariant is specifically about executable stage surfaces.
  const hasStage2D = spec.representations.some((rep) => rep.kind === "stage_2d");
  const hasAnyStage = spec.representations.some(
    (rep) => rep.kind === "stage_2d" || rep.kind === "stage_3d"
  );
  if (!spec.simulation && hasStage2D) {
    reasons.push("science_policy:stage2d_requires_simulation");
  }
  if (!spec.simulation && spec.renderer.kind === "lumina_2d" && hasAnyStage) {
    reasons.push("science_policy:lumina_stage_requires_simulation");
  }

  const level = spec.trust.level;

  // --- Level 1: verified simulation ---
  if (level === "verified_simulation") {
    if (!spec.simulation) {
      reasons.push("science_policy:level1_simulation");
    } else {
      if (!VERIFIED_ENGINE_IDS.includes(spec.simulation.engineId)) {
        reasons.push("science_policy:level1_engine");
      }
      if (!spec.simulation.engineVersion.trim()) {
        reasons.push("science_policy:level1_engine_version");
      }
      if (
        !Number.isInteger(spec.simulation.seed) ||
        spec.simulation.seed < 0
      ) {
        reasons.push("unsafe_value:seed");
      }
      const capability = ENGINE_CATALOG[spec.simulation.engineId];
      if (capability) {
        const hasForeignParameter = spec.simulation.parameters.some(
          (p) => !capability.parameterKeys.includes(p.key)
        );
        const hasForeignReadout = spec.simulation.readouts.some(
          (r) => !capability.readoutKeys.includes(r.key)
        );
        if (hasForeignParameter || hasForeignReadout) {
          reasons.push("incompatible_engine");
        }
      }
      if (
        spec.trust.engineId !== undefined &&
        spec.trust.engineId !== spec.simulation.engineId
      ) {
        reasons.push("inconsistent_engine");
      }
      if (
        spec.trust.engineVersion !== undefined &&
        spec.trust.engineVersion !== spec.simulation.engineVersion
      ) {
        reasons.push("inconsistent_engine");
      }
    }
  }

  // --- Level 2: conceptual demonstration (qualitative only) ---
  if (level === "conceptual_demonstration") {
    if (spec.simulation) {
      reasons.push("science_policy:level2_simulation");
    }
    if (spec.prediction.correctIndex !== undefined) {
      reasons.push("science_policy:level2_prediction");
    }
    if (spec.trust.limitations.length < 1) {
      reasons.push("science_policy:level2_limitations");
    }
    if (spec.controls.some((c) => c.target.kind === "parameter")) {
      reasons.push("science_policy:level2_parameter_control");
    }
  }

  // --- Level 3: explanatory animation (narrative, never quantitative) ---
  if (level === "explanatory_animation") {
    if (spec.simulation) {
      reasons.push("science_policy:level3_simulation");
    }
    if (!spec.timeline || spec.timeline.events.length < 1) {
      reasons.push("science_policy:level3_timeline");
    }
    if (spec.controls.some((c) => c.target.kind === "parameter")) {
      reasons.push("science_policy:level3_parameter_control");
    }
    if (spec.prediction.correctIndex !== undefined) {
      reasons.push("science_policy:level3_prediction");
    }
  }

  return { ok: reasons.length === 0, reasons };
}
