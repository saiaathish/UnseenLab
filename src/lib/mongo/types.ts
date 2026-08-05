/**
 * Hand-written MongoDB document types for the platform schema.
 * Mirrors supabase/migrations/20260803193000_platform_schema.sql, which the
 * migration replaced (collections + indexes live in scripts/mongo-setup.mjs).
 *
 * `_id` is driver-managed and never part of the row contract: reads must
 * not leak it to clients, and writes must never accept it.
 */

import type {
  DemoSpecV1,
  RendererKind,
  TrustLevel,
} from "@/demonstrations/spec/demo-spec";

export type LearningGoal =
  | "understand_concept"
  | "prepare_for_class"
  | "explore_experiments";

export type PreferredRepresentation =
  | "animation"
  | "graph"
  | "equation"
  | "causal"
  | "plain_language";

export type ExplanationStyle = "visual_first" | "step_by_step" | "concise";

export type LearningPace = "calm" | "balanced" | "quick";

export type InformationDensity = "low" | "medium" | "full";

export type ProfileRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_version: number;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LearnerPreferencesRow = {
  user_id: string;
  learning_goal: LearningGoal;
  preferred_representation: PreferredRepresentation;
  explanation_style: ExplanationStyle;
  learning_pace: LearningPace;
  animation_speed: number;
  information_density: InformationDensity;
  reduced_motion: boolean;
  high_contrast: boolean;
  text_scale: number;
  one_variable_mode: boolean;
  topic_interests: string[];
  schema_version: number;
  created_at: string;
  updated_at: string;
};

export type LearningSessionStatus = "active" | "complete";

export type LearningSessionRow = {
  id: string;
  user_id: string;
  lab_slug: string;
  status: LearningSessionStatus;
  title: string;
  schema_version: number;
  evidence: Record<string, unknown>;
  workflow: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Server-incremented optimistic-concurrency counter; bumped on every write. */
  revision: number;
  /**
   * Idempotency key of the last accepted client write. A PUT repeating this
   * mutation id is an acknowledged replay and is served without writing.
   */
  last_client_mutation_id: string | null;
};

/**
 * A persisted generated demonstration. One row per (firebaseUid,
 * demonstrationId) — the unique index `{ firebaseUid: 1, demonstrationId: 1 }`
 * is the upsert key, and `demonstrationId` is the stable id the spec itself
 * declares. All queries and writes are owner-scoped on `firebaseUid`, derived
 * exclusively from the verified session cookie (never from a request body).
 *
 * The derived columns (title, normalizedConcept, trustLevel, rendererKind,
 * schemaVersion, source) denormalize the validated spec so list views and
 * dashboards can be served without parsing every stored spec. `spec` is the
 * sanitized, validated DemoSpecV1 — the exact document a renderer consumes.
 */
export type GeneratedDemonstrationRow = {
  demonstrationId: string;
  firebaseUid: string;
  title: string;
  normalizedConcept: string;
  trustLevel: TrustLevel;
  rendererKind: RendererKind;
  schemaVersion: number;
  spec: DemoSpecV1;
  /** Server-incremented optimistic-concurrency counter; bumped on every write. */
  revision: number;
  source: DemoSpecV1["provenance"]["source"];
  createdAt: string;
  updatedAt: string;
  /**
   * Idempotency key of the last accepted client write. A PUT repeating this
   * mutation id is an acknowledged replay and is served without writing.
   * Mirrors `learning_sessions.last_client_mutation_id`.
   */
  lastClientMutationId: string | null;
};
