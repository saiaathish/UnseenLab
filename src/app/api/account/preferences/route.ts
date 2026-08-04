import { NextResponse } from "next/server";
import { z } from "zod";
import type { WithId } from "mongodb";
import { verifySessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type { LearnerPreferencesRow } from "@/lib/mongo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replaces the user's learner preferences (full-row PUT). Enums mirror
 * `src/lib/mongo/types.ts`; numeric bounds mirror the old Postgres check
 * constraints. The row is upserted by `user_id` — which comes only from the
 * verified session cookie, never from the body.
 */

const preferencesSchema = z.object({
  learning_goal: z.enum([
    "understand_concept",
    "prepare_for_class",
    "explore_experiments",
  ]),
  preferred_representation: z.enum([
    "animation",
    "graph",
    "equation",
    "causal",
    "plain_language",
  ]),
  explanation_style: z.enum(["visual_first", "step_by_step", "concise"]),
  learning_pace: z.enum(["calm", "balanced", "quick"]),
  animation_speed: z.number().min(0.25).max(2),
  information_density: z.enum(["low", "medium", "full"]),
  reduced_motion: z.boolean(),
  high_contrast: z.boolean(),
  text_scale: z.number().min(1).max(1.5),
  one_variable_mode: z.boolean(),
  topic_interests: z.array(z.string()).max(12),
  schema_version: z.number().int().min(1),
});

function stripId(row: WithId<LearnerPreferencesRow>): LearnerPreferencesRow {
  const { _id, ...rest } = row;
  return rest;
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

  const parsed = preferencesSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  try {
    await db
      .collection<LearnerPreferencesRow>(COLLECTIONS.learnerPreferences)
      .updateOne(
        { user_id: user.uid },
        {
          $set: { ...parsed.data, user_id: user.uid, updated_at: updatedAt },
          $setOnInsert: { created_at: updatedAt },
        },
        { upsert: true }
      );
    const preferencesDoc = await db
      .collection<LearnerPreferencesRow>(COLLECTIONS.learnerPreferences)
      .findOne({ user_id: user.uid });
    return NextResponse.json({
      data: { preferences: preferencesDoc ? stripId(preferencesDoc) : null },
    });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
