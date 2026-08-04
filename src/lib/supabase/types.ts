/**
 * Hand-written Supabase Database types for the platform schema.
 * Matches supabase/migrations/20260803193000_platform_schema.sql exactly.
 * Regenerate with `supabase gen types` once a project is linked.
 */

/**
 * Rows are type aliases (not interfaces) so they carry the implicit index
 * signature postgrest-js's GenericTable constraint requires.
 */

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
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { user_id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      learner_preferences: {
        Row: LearnerPreferencesRow;
        Insert: Partial<LearnerPreferencesRow> & { user_id: string };
        Update: Partial<LearnerPreferencesRow>;
        Relationships: [];
      };
      learning_sessions: {
        Row: LearningSessionRow;
        Insert: Partial<LearningSessionRow> & {
          user_id: string;
          lab_slug: string;
          title: string;
        };
        Update: Partial<LearningSessionRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
