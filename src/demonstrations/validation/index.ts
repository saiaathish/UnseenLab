/**
 * validation — public surface for the demonstration spec validator.
 *
 *   validateDemoSpec(raw)   -> valid | repaired | rejected (never fallback)
 *   sanitizeDemoSpec(raw)   -> valid | repaired | rejected | fallback
 *   sciencePolicy(spec)     -> { ok, reasons } for a parsed DemoSpecV1
 *   demoSpecSchema          -> the strict Zod schema (no repair pass)
 *
 * All reasons are SAFE codes; offending content is never echoed.
 */

import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

export {
  demoSpecSchema,
  findUnsafeString,
  hasPollutionKey,
  isExecutableCodeString,
  isUnsafeUrlString,
  MAX_SPEC_DEPTH,
  measureDepth,
  MOBILE_MAX_PARTICLES,
} from "./demo-spec-schema";

export {
  containsOperationalDanger,
  OPERATIONAL_DANGER_KEYWORDS,
  sciencePolicy,
} from "./science-policy";
import type { SciencePolicyResult } from "./science-policy";

export { sanitizeDemoSpec, validateDemoSpec } from "./sanitize";
import type { SanitizeOutcome, SanitizeStatus } from "./sanitize";

export { SPEC_LIMITS };

export type { DemoSpecV1 };
export type { SciencePolicyResult };
export type { SanitizeOutcome, SanitizeStatus };
