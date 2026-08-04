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
 * `id` is the only idempotency key: re-saving or re-importing a session can
 * never create a duplicate.
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

  const now = new Date().toISOString();
  try {
    await db.collection<LearningSessionRow>(COLLECTIONS.learningSessions).updateOne(
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
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true }
    );
    const sessionDoc = await db
      .collection<LearningSessionRow>(COLLECTIONS.learningSessions)
      .findOne({ id: parsed.data.id, user_id: user.uid });
    return NextResponse.json({
      data: { session: sessionDoc ? stripId(sessionDoc) : null },
    });
  } catch {
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
