import { NextResponse } from "next/server";
import { verifySessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type { ProfileRow } from "@/lib/mongo/types";
import { isSafeRedirectPath } from "@/lib/auth/redirect-safety";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";

export const dynamic = "force-dynamic";

/**
 * Post-sign-in router: the sign-in dialog lands here after minting the
 * session cookie. Redirects to onboarding (when incomplete — checked before
 * any destination hint), the original safe `?next` destination, or the
 * dashboard. Unsafe `next` values are ignored, never followed. Any failure
 * degrades to `/?auth=error`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next");
  const user = await verifySessionUser();

  if (user) {
    let profile: ProfileRow | null = null;
    try {
      const db = await getPlatformDb();
      profile = db
        ? await db
            .collection<ProfileRow>(COLLECTIONS.profiles)
            .findOne({ user_id: user.uid })
        : null;
    } catch {
      // A failed profile read must not 500 the callback; a missing profile
      // means onboarding is incomplete, which is the safe default.
      profile = null;
    }

    // Program rule: signed-in users with incomplete onboarding go to
    // /onboarding — checked before any destination hint.
    const needsOnboarding =
      !profile ||
      (profile.onboarding_version ?? 0) < CURRENT_ONBOARDING_VERSION;
    if (needsOnboarding) {
      return NextResponse.redirect(new URL("/onboarding", origin));
    }

    const safeNext = isSafeRedirectPath(next) ? next : null;
    if (safeNext) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }

    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  return NextResponse.redirect(new URL("/?auth=error", origin));
}
