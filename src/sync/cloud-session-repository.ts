import type {
  LearningSessionRow,
  LearningSessionStatus,
} from "@/lib/mongo/types";

/**
 * Cloud session repository. All requests go to the session-cookie-protected
 * API routes (/api/cloud/sessions), which derive ownership from the verified
 * cookie — the wire payload never carries a `user_id`, and this module never
 * trusts the caller to filter by user. Network and HTTP failures propagate:
 * the caller (CloudSessionSync / importGuestSession) maps them to "offline".
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

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

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
   * @param userId The verified session-cookie uid. Routes derive ownership
   * from it server-side; it never appears in request bodies (security
   * invariant — the role RLS played in Postgres).
   */
  constructor(
    private readonly userId: string,
    private readonly fetcher: FetchLike = fetch
  ) {}

  /**
   * Issues a request and returns the parsed JSON body. Throws on network
   * failure (fetch rejection), non-2xx status, or a `{ error }` envelope —
   * the caller decides what "offline" means.
   */
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(path, init);
    if (!response.ok) {
      throw new Error(
        `cloud session request failed: ${init.method ?? "GET"} ${path} (${response.status})`
      );
    }
    return (await response.json()) as unknown;
  }

  /** Most recent sessions first; caller must be the row owner (cookie). */
  async list(limit = 20): Promise<SessionSnapshot[]> {
    const body = (await this.request(
      `/api/cloud/sessions?limit=${limit}`
    )) as { data: { sessions: LearningSessionRow[] } };
    return body.data.sessions.map(sessionRowToSnapshot);
  }

  async getById(id: string): Promise<SessionSnapshot | null> {
    const body = (await this.request(
      `/api/cloud/sessions?id=${encodeURIComponent(id)}`
    )) as { data: { session: LearningSessionRow | null } };
    return body.data.session ? sessionRowToSnapshot(body.data.session) : null;
  }

  /** First incomplete session for a lab, newest first. */
  async getIncompleteForLab(
    labSlug: string
  ): Promise<SessionSnapshot | null> {
    const body = (await this.request(
      `/api/cloud/sessions?lab_slug=${encodeURIComponent(labSlug)}&status=active&limit=1`
    )) as { data: { sessions: LearningSessionRow[] } };
    const row = body.data.sessions[0] ?? null;
    return row ? sessionRowToSnapshot(row) : null;
  }

  /**
   * Idempotent upsert keyed on the stable session id — importing twice or
   * saving repeatedly can never create duplicates, and original evidence IDs
   * are preserved (evidence is stored verbatim).
   */
  async upsert(snapshot: SessionSnapshot): Promise<void> {
    await this.request("/api/cloud/sessions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: snapshot.id,
        lab_slug: snapshot.labSlug,
        status: snapshot.status,
        title: snapshot.title.slice(0, MAX_TITLE_LENGTH),
        schema_version: snapshot.schemaVersion,
        evidence: snapshot.evidence,
        workflow: snapshot.workflow,
        completed_at: snapshot.completedAt,
      }),
    });
  }

  async markComplete(id: string): Promise<void> {
    await this.request(
      `/api/cloud/sessions/${encodeURIComponent(id)}/complete`,
      { method: "POST" }
    );
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.request("/api/cloud/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
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
