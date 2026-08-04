import { NextResponse, type NextRequest } from "next/server";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import {
  SESSION_COOKIE_NAME,
  verifySessionCookieValue,
} from "@/lib/firebase/server";

/**
 * Route protection via proxy (Next 16 convention; middleware.ts is
 * deprecated). The lab stays public: unauthenticated learners are never
 * redirected away from an active lab.
 *
 * The proxy runs on the Node.js runtime, so the firebase-admin session-cookie
 * verification is a real check (not a cookie-presence guess). Every
 * protected page re-checks server-side anyway (defense in depth).
 */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/settings"];

export async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;

  if (
    !PROTECTED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return NextResponse.next();
  }

  if (!isFirebaseConfigured()) {
    // Graceful degradation: without Firebase there is no session concept.
    return NextResponse.redirect(new URL("/?auth=open", origin));
  }

  const user = await verifySessionCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value
  );
  if (!user) {
    return NextResponse.redirect(new URL("/?auth=open", origin));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/settings/:path*"],
};
