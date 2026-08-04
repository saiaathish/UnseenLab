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
  /**
   * Server-incremented optimistic-concurrency counter of the cloud row this
   * snapshot was read from. Local-only snapshots carry 0. Absent on legacy
   * rows; `sessionRowToSnapshot` normalizes those to 0.
   */
  revision: number;
}

/**
 * The server answered a write with HTTP 409: the cloud row moved on since the
 * client read it (its `revision` no longer matches the client's expected one).
 * `cloudSnapshot` carries the current cloud copy so the caller can adopt it.
 * The sync layer maps this to its existing "cloud newer, keep local" outcome.
 */
export class CloudConflictError extends Error {
  readonly cloudSnapshot: SessionSnapshot | null;

  constructor(cloudSnapshot: SessionSnapshot | null) {
    super(
      "cloud session conflict: the cloud copy is newer (revision mismatch)"
    );
    this.name = "CloudConflictError";
    this.cloudSnapshot = cloudSnapshot;
  }
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
    // Legacy rows written before optimistic concurrency have no revision;
    // treat them as revision 0 so the first concurrency-aware save can land.
    revision: row.revision ?? 0,
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
   * the caller decides what "offline" means. An HTTP 409 (optimistic
   * concurrency conflict) is NOT swallowed: it becomes a `CloudConflictError`
   * carrying the current cloud copy so the caller can adopt it.
   */
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(path, init);
    if (!response.ok) {
      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as {
          data?: { session?: LearningSessionRow };
        } | null;
        const row = body?.data?.session;
        throw new CloudConflictError(
          row ? sessionRowToSnapshot(row) : null
        );
      }
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
   *
   * `opts.mutationId` is a per-attempt idempotency key: a PUT repeating the
   * server's last accepted mutation id is served without writing (the server
   * treats it as an acknowledged replay). `opts.expectedRevision` is the
   * revision the client last read from the cloud row; a mismatch makes the
   * server answer 409 and this method throws `CloudConflictError` (carrying
   * the current cloud copy) instead of overwriting it.
   */
  async upsert(
    snapshot: SessionSnapshot,
    opts?: { expectedRevision?: number; mutationId?: string }
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      id: snapshot.id,
      lab_slug: snapshot.labSlug,
      status: snapshot.status,
      title: snapshot.title.slice(0, MAX_TITLE_LENGTH),
      schema_version: snapshot.schemaVersion,
      evidence: snapshot.evidence,
      workflow: snapshot.workflow,
      completed_at: snapshot.completedAt,
    };
    if (opts?.expectedRevision !== undefined) {
      payload.expected_revision = opts.expectedRevision;
    }
    if (opts?.mutationId !== undefined) {
      payload.mutation_id = opts.mutationId;
    }
    await this.request("/api/cloud/sessions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    // Local-only snapshots have never been written to the cloud.
    revision: 0,
  };
}
