import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type { LearningSessionRow } from "@/lib/mongo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marks a cloud session complete. Scoped to the verified session-cookie uid,
 * so it can only ever touch the caller's own row. Returns ok even when no row
 * matched (a completed/never-synced id is not an error for the caller).
 */

const idSchema = z.string().min(1);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getPlatformDb();
  if (!db) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const now = new Date().toISOString();
  try {
    await db.collection<LearningSessionRow>(COLLECTIONS.learningSessions).updateOne(
      { id, user_id: user.uid },
      {
        $set: {
          status: "complete",
          completed_at: now,
          updated_at: now,
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
