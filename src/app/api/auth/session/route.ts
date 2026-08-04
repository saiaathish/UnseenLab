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
 * CSRF guard: the session mint is a state-changing POST, so cross-site
 * browsers must not be able to trigger it. Browsers always send an `Origin`
 * header on POST; accept only a same-origin one. Non-browser clients (our
 * Node seed/e2e tooling) send no Origin and still require a valid ID token,
 * which a CSRF attacker cannot obtain.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser client; ID token is still required
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("host");
  if (!host) return false;
  return origin === `${forwardedProto}://${host}`;
}

/**
 * Bounded in-memory failure rate limit (per IP): 20 failed mint attempts per
 * 15 minutes. Honest limitation: per server instance, not global — fine for
 * this deployment; documented in docs/security.md.
 */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const failures = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string | null): boolean {
  if (!ip) return false;
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= RATE_LIMIT_MAX;
}

function recordFailure(ip: string | null) {
  if (!ip) return;
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")
  );
}

/**
 * Exchanges a Firebase ID token for an httpOnly session cookie. Called at
 * sign-in and as a keepalive on signed-in mounts. The cookie is the only
 * auth credential on navigations; the ID token never touches storage.
 */
export async function POST(request: Request) {
  if (!getAdminAuth()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    recordFailure(ip);
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const cookieValue = await createSessionCookie(parsed.data.idToken);
  if (!cookieValue) {
    recordFailure(ip);
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

/**
 * Contract-compliant session deletion (clear the cookie). The client also
 * signs out of Firebase locally; this keeps the server gate honest.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}
