"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Singleton browser Supabase client. Returns null when Supabase is not
 * configured so the app degrades gracefully to guest-only mode.
 */
export function getBrowserClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  if (!cached) {
    cached = createBrowserClient<Database>(url, key);
  }
  return cached;
}
