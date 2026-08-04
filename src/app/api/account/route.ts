import { NextResponse } from "next/server";
import type { WithId } from "mongodb";
import { verifySessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type {
  LearnerPreferencesRow,
  LearningSessionRow,
  ProfileRow,
} from "@/lib/mongo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Account data: the user's profile and learner preferences. Ownership is
 * derived exclusively from the verified session cookie — `user_id` is never
 * accepted from a request (the role RLS played in Postgres).
 */

/** Drops the driver-managed `_id` before any document leaves the server. */
function stripId<T>(row: WithId<T>): T {
  const { _id, ...rest } = row;
  // WithId<T> is T plus the driver's _id, so removing it yields T — TS just
  // cannot prove the identity for generic T.
  return rest as T;
}

export async function GET(): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getPlatformDb();
  if (!db) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const [profileDoc, preferencesDoc] = await Promise.all([
      db
        .collection<ProfileRow>(COLLECTIONS.profiles)
        .findOne({ user_id: user.uid }),
      db
        .collection<LearnerPreferencesRow>(COLLECTIONS.learnerPreferences)
        .findOne({ user_id: user.uid }),
    ]);
    return NextResponse.json({
      data: {
        profile: profileDoc ? stripId(profileDoc) : null,
        preferences: preferencesDoc ? stripId(preferencesDoc) : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/**
 * Privacy wipe: deletes cloud learning sessions and preferences. The profile
 * row is retained (parity with the old privacy wipe) so a later sign-in does
 * not look like a brand-new account.
 */
export async function DELETE(): Promise<NextResponse> {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getPlatformDb();
  if (!db) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    await Promise.all([
      db
        .collection<LearningSessionRow>(COLLECTIONS.learningSessions)
        .deleteMany({ user_id: user.uid }),
      db
        .collection<LearnerPreferencesRow>(COLLECTIONS.learnerPreferences)
        .deleteMany({ user_id: user.uid }),
    ]);
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
