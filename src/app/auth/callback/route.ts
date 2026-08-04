import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";
import { isSafeRedirectPath } from "@/lib/supabase/auth";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";

export const dynamic = "force-dynamic";

/**
 * OAuth callback: exchanges the authorization code for a session, then
 * redirects to the original safe destination, onboarding (when incomplete),
 * or the dashboard. Unsafe `next` values are ignored, never followed.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_version")
          .maybeSingle();

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
    }
  }

  return NextResponse.redirect(new URL("/?auth=error", origin));
}
