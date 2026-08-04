import { NextResponse } from "next/server";
import { verifySessionUser } from "@/lib/firebase/server";

export const dynamic = "force-dynamic";

/**
 * Returns the session-cookie user (or 401). The browser can't read the
 * httpOnly session cookie directly, so client components ask this route to
 * learn whether the server considers them signed in (e.g. after a full-page
 * navigation, or when Firebase's local store was cleared while the 14-day
 * cookie persisted).
 */
export async function GET() {
  const user = await verifySessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ data: { user } });
}
