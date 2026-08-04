import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  LearningSessionRow,
  LearningSessionStatus,
} from "@/lib/supabase/types";

/**
 * Cloud session repository. All access goes through the authenticated client,
 * so RLS enforces row ownership server-side; this module never trusts the
 * caller to filter by user.
 */

export interface SessionSnapshot {
  id: string;
  labSlug: string;
  status: LearningSessionStatus;
  title: string;
  schemaVersion: number;
  evidence: Record<string, unknown>;
  workflow: Record<string, unknown>;
  completedAt: string | null;
}

export const SESSION_SCHEMA_VERSION = 1;
const SESSION_LAB_SLUG = "nuclear-chain-reaction";
export const MAX_TITLE_LENGTH = 120;

export function sessionRowToSnapshot(row: LearningSessionRow): SessionSnapshot {
  return {
    id: row.id,
    labSlug: row.lab_slug,
    status: row.status,
    title: row.title,
    schemaVersion: row.schema_version,
    evidence: row.evidence,
    workflow: row.workflow,
    completedAt: row.completed_at,
  };
}

export class CloudSessionRepository {
  /**
   * @param userId The authenticated user's id. Every write carries it, and
   * RLS `with check` guarantees it can only ever be the caller's own id.
   */
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string
  ) {}

  /** Most recent sessions first; caller must be the row owner (RLS). */
  async list(limit = 20): Promise<SessionSnapshot[]> {
    const { data, error } = await this.client
      .from("learning_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(sessionRowToSnapshot);
  }

  async getById(id: string): Promise<SessionSnapshot | null> {
    const { data, error } = await this.client
      .from("learning_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? sessionRowToSnapshot(data) : null;
  }

  /** First incomplete session for a lab, newest first. */
  async getIncompleteForLab(
    labSlug: string
  ): Promise<SessionSnapshot | null> {
    const { data, error } = await this.client
      .from("learning_sessions")
      .select("*")
      .eq("lab_slug", labSlug)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? sessionRowToSnapshot(data) : null;
  }

  /**
   * Idempotent upsert keyed on the stable session id — importing twice or
   * saving repeatedly can never create duplicates, and original evidence IDs
   * are preserved (evidence is stored verbatim).
   */
  async upsert(snapshot: SessionSnapshot): Promise<void> {
    const { error } = await this.client.from("learning_sessions").upsert(
      {
        id: snapshot.id,
        user_id: this.userId,
        lab_slug: snapshot.labSlug,
        status: snapshot.status,
        title: snapshot.title.slice(0, MAX_TITLE_LENGTH),
        schema_version: snapshot.schemaVersion,
        evidence: snapshot.evidence,
        workflow: snapshot.workflow,
        completed_at: snapshot.completedAt,
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  async markComplete(id: string): Promise<void> {
    const { error } = await this.client
      .from("learning_sessions")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.client
      .from("learning_sessions")
      .delete()
      .in("id", ids);
    if (error) throw error;
  }
}

/** Canonical snapshot builder from a local session. */
export function snapshotFromLocal(
  id: string,
  title: string,
  evidence: Record<string, unknown>,
  workflow: Record<string, unknown>,
  status: LearningSessionStatus = "active",
  completedAt: string | null = null
): SessionSnapshot {
  return {
    id,
    labSlug: SESSION_LAB_SLUG,
    status,
    title,
    schemaVersion: SESSION_SCHEMA_VERSION,
    evidence,
    workflow,
    completedAt,
  };
}
