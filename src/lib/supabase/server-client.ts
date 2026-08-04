import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

/**
 * Server Supabase client for route handlers, server components, and server
 * actions. Cookie mutations are best-effort: `cookies().set` throws when
 * called from a server component render, so refresh failures there must not
 * crash the request.
 */
export async function createClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component; safe to ignore when refreshing.
        }
      },
    },
  });
}
