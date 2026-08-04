"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser-client";

/**
 * Client-side auth state via `onAuthStateChange`. Returns the Supabase
 * client (or null when unconfigured) so callers can degrade to guest mode.
 */
export interface SessionState {
  user: User | null;
  loading: boolean;
  /** Browser Supabase client, or null when Supabase is not configured. */
  client: ReturnType<typeof getBrowserClient>;
}

export function useSession(): SessionState {
  // The client is configuration-determined and stable for the session.
  const client = useMemo(() => getBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => client === null ? false : true);

  useEffect(() => {
    if (!client) return;

    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  return { user, loading, client };
}
