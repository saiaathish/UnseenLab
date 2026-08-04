import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
  createSessionCookie,
  getAdminAuth,
} from "@/lib/firebase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  idToken: z.string().min(1),
});

/**
 * Exchanges a Firebase ID token for an httpOnly session cookie. Called at
 * sign-in and as a keepalive on signed-in mounts. The cookie is the only
 * auth credential on navigations; the ID token never touches storage.
 */
export async function POST(request: Request) {
  if (!getAdminAuth()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const cookieValue = await createSessionCookie(parsed.data.idToken);
  if (!cookieValue) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    // Local dev (`next dev`) runs over http; production is always https.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_MS / 1000,
  });
  return response;
}
