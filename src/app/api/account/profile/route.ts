import { NextResponse } from "next/server";
import { z } from "zod";
import type { WithId } from "mongodb";
import { verifySessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type { ProfileRow } from "@/lib/mongo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Profile updates. Only the provided fields are written; `updated_at` is
 * always bumped. There is no auth trigger in Firebase, so the profile row is
 * created lazily on first write (`$setOnInsert`) — a missing row simply means
 * "onboarding incomplete", which the callback route already handles.
 */

const profilePatchSchema = z.object({
  display_name: z.string().nullable().optional(),
  onboarding_version: z.number().int().min(0).optional(),
  onboarding_completed_at: z.string().nullable().optional(),
});

function stripId(row: WithId<ProfileRow>): ProfileRow {
  const { _id, ...rest } = row;
  return rest;
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getPlatformDb();
  if (!db) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const parsed = profilePatchSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  try {
    await db.collection<ProfileRow>(COLLECTIONS.profiles).updateOne(
      { user_id: user.uid },
      {
        $set: { ...parsed.data, updated_at: updatedAt },
        $setOnInsert: {
          created_at: updatedAt,
          display_name: null,
          avatar_url: null,
          onboarding_version: 0,
          onboarding_completed_at: null,
        },
      },
      { upsert: true }
    );
    const profileDoc = await db
      .collection<ProfileRow>(COLLECTIONS.profiles)
      .findOne({ user_id: user.uid });
    return NextResponse.json({
      data: { profile: profileDoc ? stripId(profileDoc) : null },
    });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
