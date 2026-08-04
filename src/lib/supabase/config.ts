/**
 * Supabase environment configuration.
 *
 * Reads only publishable values. The browser may never receive the service
 * role key; server-only secrets are not part of this module.
 */
export interface SupabaseConfig {
  url: string | null;
  /** Current publishable key name; legacy anon key accepted as fallback. */
  key: string | null;
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    url: url && url.trim().length > 0 ? url.trim() : null,
    key: key && key.trim().length > 0 ? key.trim() : null,
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}
