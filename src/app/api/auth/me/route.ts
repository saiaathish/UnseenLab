import { NextResponse } from "next/server";
import { getAdminAuth, verifySessionUser } from "@/lib/firebase/server";

export const dynamic = "force-dynamic";

/**
 * Returns the session-cookie user (or null). The browser can't read the
 * httpOnly session cookie directly, so client components ask this route to
 * learn whether the server considers them signed in (e.g. after a full-page
 * navigation, or when Firebase's local store was cleared while the 14-day
 * cookie persisted).
 *
 * Signed-out is a valid answer, not an error: a 200 with `user: null` keeps
 * the route console-clean (no 401 noise on every page load for guests).
 */
export async function GET() {
  if (!getAdminAuth()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const user = await verifySessionUser();
  return NextResponse.json({ data: { user } });
}
