import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/server";

export const dynamic = "force-dynamic";

/**
 * Clears the session cookie. Client-side sign-out already cleared Firebase
 * local state; this keeps the server gate honest.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}
