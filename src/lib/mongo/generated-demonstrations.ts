import type { Db, WithId } from "mongodb";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type { GeneratedDemonstrationRow } from "@/lib/mongo/types";

/**
 * Repository for persisted generated demonstrations. ALL ownership scoping
 * lives here: every query and write carries a `uid` (the verified
 * session-cookie uid) and matches on `firebaseUid` — a route can never pass
 * another user's rows, and a body can never name an owner. `uid` is always
 * derived by the route from the verified session cookie.
 *
 * Concurrency + idempotency mirror `/api/cloud/sessions` exactly:
 *  - a write repeating the `mutationId` of the last accepted write is a
 *    `replay`: the stored row is returned without writing;
 *  - a write carrying a stale `expectedRevision` is a `conflict` carrying the
 *    current row so the caller can adopt it;
 *  - otherwise the row is upserted on (firebaseUid, demonstrationId) and
 *    `revision` advances by exactly one (`$setOnInsert` creates at 1).
 */

/** Thrown when MongoDB is unconfigured (guest mode); routes map it to 503. */
export class DemonstrationsDbUnavailableError extends Error {
  constructor() {
    super("generated_demonstrations database is not configured");
    this.name = "DemonstrationsDbUnavailableError";
  }
}

/**
 * Client-derived row fields. `revision`, `createdAt`, `updatedAt` and
 * `lastClientMutationId` are server-managed and never accepted from callers.
 */
export type DemonstrationUpsertInput = Omit<
  GeneratedDemonstrationRow,
  "revision" | "createdAt" | "updatedAt" | "lastClientMutationId"
>;

export interface ListDemonstrationsOptions {
  /** 1..50; the route enforces the bounds. */
  limit: number;
  /** Rows to skip, for limit+skip pagination. Defaults to 0. */
  skip?: number;
}

export interface UpsertDemonstrationOptions {
  /** The revision the caller observed; stale values conflict (409). */
  expectedRevision?: number;
  /** Idempotency key for this client attempt (max 64 chars). */
  mutationId?: string;
}

export type UpsertDemonstrationResult =
  | {
      status: "ok" | "replay" | "not_found_created";
      row: GeneratedDemonstrationRow;
    }
  | {
      /**
       * `row` is the current stored row when the conflict is a stale
       * expected_revision; it is null when the conflict comes from a duplicate
       * key (unique index violation) — in that case the other row must never
       * leak to the caller.
       */
      status: "conflict";
      row: GeneratedDemonstrationRow | null;
    };

async function requireDb(): Promise<Db> {
  const db = await getPlatformDb();
  if (!db) throw new DemonstrationsDbUnavailableError();
  return db;
}

function stripId(row: WithId<GeneratedDemonstrationRow>): GeneratedDemonstrationRow {
  const { _id, ...rest } = row;
  return rest;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

/** Newest-first list, sorted { firebaseUid: 1, updatedAt: -1 } (limit+skip). */
export async function listDemonstrations(
  uid: string,
  options: ListDemonstrationsOptions
): Promise<GeneratedDemonstrationRow[]> {
  const { limit, skip = 0 } = options;
  const db = await requireDb();
  const demonstrations = db.collection<GeneratedDemonstrationRow>(
    COLLECTIONS.generatedDemonstrations
  );
  const docs = await demonstrations
    .find({ firebaseUid: uid })
    .sort({ firebaseUid: 1, updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  return docs.map(stripId);
}

/** Owner-scoped single-row read; null when absent or owned by another user. */
export async function findDemonstration(
  uid: string,
  demonstrationId: string
): Promise<GeneratedDemonstrationRow | null> {
  const db = await requireDb();
  const demonstrations = db.collection<GeneratedDemonstrationRow>(
    COLLECTIONS.generatedDemonstrations
  );
  const doc = await demonstrations.findOne({ firebaseUid: uid, demonstrationId });
  return doc ? stripId(doc) : null;
}

/**
 * Owner-scoped upsert with server-enforced optimistic concurrency and
 * idempotent replays (see the module doc). Duplicate-key violations (unique
 * index `{ firebaseUid, demonstrationId }`) resolve to `conflict` with a null
 * row — never a server error, and never a leak of the other row.
 */
export async function upsertDemonstration(
  uid: string,
  row: DemonstrationUpsertInput,
  options: UpsertDemonstrationOptions = {}
): Promise<UpsertDemonstrationResult> {
  const db = await requireDb();
  const demonstrations = db.collection<GeneratedDemonstrationRow>(
    COLLECTIONS.generatedDemonstrations
  );
  const { expectedRevision, mutationId } = options;
  const now = new Date().toISOString();

  try {
    const existing = await demonstrations.findOne({
      firebaseUid: uid,
      demonstrationId: row.demonstrationId,
    });

    // Idempotent replay: the client re-sent a mutation we already accepted.
    if (
      existing &&
      mutationId !== undefined &&
      existing.lastClientMutationId === mutationId
    ) {
      return { status: "replay", row: stripId(existing) };
    }

    if (expectedRevision !== undefined) {
      // Optimistic concurrency, applied ATOMICALLY: the revision is part of
      // the match filter, so two concurrent writers with the same expected
      // revision cannot both advance it. A legacy row without a revision
      // counts as revision 0.
      const revisionMatch =
        expectedRevision === 0
          ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
          : { revision: expectedRevision };
      const updated = await demonstrations.findOneAndUpdate(
        {
          firebaseUid: uid,
          demonstrationId: row.demonstrationId,
          ...revisionMatch,
        },
        {
          $set: {
            ...row,
            firebaseUid: uid,
            lastClientMutationId: mutationId ?? null,
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
        { returnDocument: "after" }
      );
      if (updated) {
        return { status: "ok", row: stripId(updated) };
      }
      // The atomic filter matched nothing: either the row moved on, this very
      // mutation already landed in a race, or no row exists yet.
      const current = await demonstrations.findOne({
        firebaseUid: uid,
        demonstrationId: row.demonstrationId,
      });
      if (current === null) {
        // Nothing to conflict with — create at revision 1. When the caller's
        // expected_revision implied a row existed (> 0), surface the create
        // distinctly so the caller adopts the new row instead of retrying.
        const created = await demonstrations.findOneAndUpdate(
          { firebaseUid: uid, demonstrationId: row.demonstrationId },
          {
            $set: {
              ...row,
              firebaseUid: uid,
              revision: 1,
              lastClientMutationId: mutationId ?? null,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true, returnDocument: "after" }
        );
        const stored: GeneratedDemonstrationRow = created
          ? stripId(created)
          : {
              ...row,
              firebaseUid: uid,
              revision: 1,
              lastClientMutationId: mutationId ?? null,
              createdAt: now,
              updatedAt: now,
            };
        return {
          status: expectedRevision > 0 ? "not_found_created" : "ok",
          row: stored,
        };
      }
      if (
        current &&
        mutationId !== undefined &&
        current.lastClientMutationId === mutationId
      ) {
        return { status: "replay", row: stripId(current) };
      }
      return { status: "conflict", row: stripId(current) };
    }

    // No expected revision (legacy client or first write): create at
    // revision 1, or advance an existing row without a concurrency check.
    const updated = await demonstrations.findOneAndUpdate(
      { firebaseUid: uid, demonstrationId: row.demonstrationId },
      {
        $set: {
          ...row,
          firebaseUid: uid,
          revision: (existing?.revision ?? 0) + 1,
          lastClientMutationId: mutationId ?? null,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after" }
    );
    const stored: GeneratedDemonstrationRow = updated
      ? stripId(updated)
      : {
          ...row,
          firebaseUid: uid,
          revision: (existing?.revision ?? 0) + 1,
          lastClientMutationId: mutationId ?? null,
          createdAt: now,
          updatedAt: now,
        };
    return { status: "ok", row: stored };
  } catch (error) {
    // A unique-index violation is a conflict, not a server failure — and the
    // other row must never leak into the result.
    if (isDuplicateKeyError(error)) {
      return { status: "conflict", row: null };
    }
    throw error;
  }
}

/**
 * Owner-scoped batch delete. Rows owned by other users are never matched,
 * even when the same demonstrationId is requested. Returns the number of
 * rows actually deleted.
 */
export async function deleteDemonstrations(
  uid: string,
  demonstrationIds: string[]
): Promise<number> {
  const db = await requireDb();
  const demonstrations = db.collection<GeneratedDemonstrationRow>(
    COLLECTIONS.generatedDemonstrations
  );
  const result = await demonstrations.deleteMany({
    firebaseUid: uid,
    demonstrationId: { $in: demonstrationIds },
  });
  return result.deletedCount ?? 0;
}
