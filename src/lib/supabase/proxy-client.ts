import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

/**
 * Supabase client for the `proxy.ts` file (Next 16 convention; the
 * `middleware.ts` file convention is deprecated). Uses the canonical
 * request/response cookie swap so refreshed tokens reach the browser.
 */
export function createProxyClient(request: NextRequest, response: NextResponse) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });
}
