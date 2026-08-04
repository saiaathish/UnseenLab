import { NextResponse, type NextRequest } from "next/server";
import { createProxyClient } from "@/lib/supabase/proxy-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Route protection via proxy (Next 16 convention; middleware.ts is
 * deprecated). The lab stays public: unauthenticated learners are never
 * redirected away from an active lab.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/settings"];

export async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;

  if (!PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  if (!isSupabaseConfigured()) {
    // Graceful degradation: without Supabase there is no session concept.
    return NextResponse.redirect(new URL("/?auth=open", origin));
  }

  const response = NextResponse.next({ request });
  const supabase = createProxyClient(request, response);
  if (!supabase) {
    return NextResponse.redirect(new URL("/?auth=open", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/?auth=open", origin));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/settings/:path*"],
};
