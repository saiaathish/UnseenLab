import { NextResponse } from "next/server";
import { z } from "zod";
import type { WithId } from "mongodb";
import { verifySessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type { LearningSessionRow } from "@/lib/mongo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cloud learning-session CRUD. Every query and write is scoped to
 * `user_id: <verified session-cookie uid>` — a body can never name another
 * user's rows, and a session upsert always re-asserts the owner. The stable
 * `id` is the primary idempotency key: re-saving or re-importing a session
 * can never create a duplicate. Writes additionally carry server-enforced
 * optimistic concurrency (`revision`) and a per-attempt `mutation_id` for
 * idempotent replays (see PUT).
 */

const MAX_TITLE_LENGTH = 120;

const listQuerySchema = z.object({
  id: z.string().min(1).optional(),
  lab_slug: z.string().min(1).optional(),
  status: z.enum(["active", "complete"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const sessionWriteSchema = z.object({
  id: z.string().min(1),
  lab_slug: z.string().min(1),
  status: z.enum(["active", "complete"]),
  title: z.string(),
  schema_version: z.number().int(),
  evidence: z.record(z.string(), z.unknown()),
  workflow: z.record(z.string(), z.unknown()),
  completed_at: z.string().nullable(),
  expected_revision: z.number().int().min(0).optional(),
  mutation_id: z.string().max(64).optional(),
});

const deleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

function stripId(row: WithId<LearningSessionRow>): LearningSessionRow {
  const { _id, ...rest } = row;
  return rest;
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getPlatformDb();
  if (!db) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const searchParams = new URL(request.url).searchParams;
  const parsed = listQuerySchema.safeParse({
    id: searchParams.get("id") ?? undefined,
    lab_slug: searchParams.get("lab_slug") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { id, lab_slug, status } = parsed.data;
  const limit = parsed.data.limit ?? 20;

  try {
    const sessions = db.collection<LearningSessionRow>(
      COLLECTIONS.learningSessions
    );
    if (id !== undefined) {
      const sessionDoc = await sessions.findOne({ id, user_id: user.uid });
      return NextResponse.json({
        data: { session: sessionDoc ? stripId(sessionDoc) : null },
      });
    }
    const sessionDocs = await sessions
      .find({
        user_id: user.uid,
        ...(lab_slug !== undefined && { lab_slug }),
        ...(status !== undefined && { status }),
      })
      .sort({ updated_at: -1 })
      .limit(limit)
      .toArray();
    return NextResponse.json({
      data: { sessions: sessionDocs.map(stripId) },
    });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/**
 * PUT /api/cloud/sessions — upsert with server-enforced optimistic
 * concurrency:
 *
 * 1. A PUT repeating the `mutation_id` of the last accepted write is an
 *    idempotent replay: the stored row is returned (200) without writing.
 * 2. A PUT carrying `expected_revision` that no longer matches the stored
 *    row's `revision` is a conflict: 409 with the current row in
 *    `data.session` so the client can adopt it.
 * 3. Otherwise the row is upserted and `revision` advances by exactly one
 *    (`$setOnInsert` creates new rows at revision 1).
 */
export async function PUT(request: Request): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getPlatformDb();
  if (!db) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const parsed = sessionWriteSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { expected_revision, mutation_id } = parsed.data;

  const now = new Date().toISOString();
  const sessions = db.collection<LearningSessionRow>(COLLECTIONS.learningSessions);
  try {
    const existing = await sessions.findOne({
      id: parsed.data.id,
      user_id: user.uid,
    });

    // Idempotent replay: the client re-sent a mutation we already accepted.
    if (
      existing &&
      mutation_id !== undefined &&
      existing.last_client_mutation_id === mutation_id
    ) {
      return NextResponse.json({ data: { session: stripId(existing) } });
    }

    // Optimistic concurrency: the row moved on since the client read it.
    // A legacy row without a revision counts as revision 0 — the first
    // concurrency-aware write may proceed against it.
    if (
      existing &&
      expected_revision !== undefined &&
      (existing.revision ?? 0) !== expected_revision
    ) {
      return NextResponse.json(
        { error: "conflict", data: { session: stripId(existing) } },
        { status: 409 }
      );
    }

    await sessions.updateOne(
      { id: parsed.data.id, user_id: user.uid },
      {
        $set: {
          id: parsed.data.id,
          lab_slug: parsed.data.lab_slug,
          status: parsed.data.status,
          title: parsed.data.title.slice(0, MAX_TITLE_LENGTH),
          schema_version: parsed.data.schema_version,
          evidence: parsed.data.evidence,
          workflow: parsed.data.workflow,
          completed_at: parsed.data.completed_at,
          user_id: user.uid,
          revision: (existing?.revision ?? 0) + 1,
          last_client_mutation_id: mutation_id ?? null,
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true }
    );
    const sessionDoc = await sessions.findOne({
      id: parsed.data.id,
      user_id: user.uid,
    });
    return NextResponse.json({
      data: { session: sessionDoc ? stripId(sessionDoc) : null },
    });
  } catch (error) {
    // A cross-user insert attempt against an existing session id hits the
    // unique `id` index (code 11000). That is a conflict, not a server
    // failure — and the other user's row must not leak into the response.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === 11000
    ) {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getPlatformDb();
  if (!db) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const parsed = deleteSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await db.collection<LearningSessionRow>(COLLECTIONS.learningSessions).deleteMany(
      { id: { $in: parsed.data.ids }, user_id: user.uid }
    );
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
