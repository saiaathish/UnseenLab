"use client";

import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * Client-side auth state via Firebase `onAuthStateChanged`. Returns a
 * platform-neutral `AppUser` (no Firebase types leak into components) and
 * never throws: an unconfigured app reports `{ user: null, loading: false }`
 * — pure guest mode, the same null-client convention Supabase used.
 */
export interface AppUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** e.g. "google.com" — first identity provider on the account. */
  provider: string | null;
}

export interface SessionState {
  user: AppUser | null;
  loading: boolean;
}

function toAppUser(firebaseUser: FirebaseUser): AppUser {
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email ?? null,
    displayName: firebaseUser.displayName ?? null,
    avatarUrl: firebaseUser.photoURL ?? null,
    provider: firebaseUser.providerData[0]?.providerId ?? null,
  };
}

// Mint the keepalive session cookie at most once per signed-in user per page
// session, even though several components subscribe to auth state.
let keepaliveMintedForUid: string | null = null;

export function useSession(): SessionState {
  const auth = useMemo(() => getFirebaseAuth(), []);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(() => (auth === null ? false : true));

  useEffect(() => {
    if (!auth) return;

    let active = true;

    // After full-page navigations the browser restores the Firebase user;
    // re-mint the server session cookie so the server gate never lags the
    // client. Idempotent and cheap (one admin verify per signed-in mount).
    const refreshSessionCookie = (firebaseUser: FirebaseUser) => {
      if (keepaliveMintedForUid === firebaseUser.uid) return;
      keepaliveMintedForUid = firebaseUser.uid;
      void firebaseUser
        .getIdToken()
        .then((idToken) => {
          if (!active) return;
          return fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
        })
        .catch(() => {
          // Best-effort keepalive; the sign-in path also mints the cookie.
        });
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!active) return;
      if (firebaseUser) {
        // Local Firebase session is the freshest source of truth.
        setUser(toAppUser(firebaseUser));
        setLoading(false);
        refreshSessionCookie(firebaseUser);
        return;
      }
      // No local Firebase session — check the httpOnly server cookie
      // (injected sessions, or a cleared client store while the 14-day
      // cookie persists). The cookie is signed-out when this 401s.
      void fetch("/api/auth/me")
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (!active) return;
          const serverUser = body?.data?.user as
            | {
                uid: string;
                email: string | null;
                displayName: string | null;
                avatarUrl: string | null;
                provider: string | null;
              }
            | undefined;
          setUser(
            serverUser
              ? {
                  id: serverUser.uid,
                  email: serverUser.email,
                  displayName: serverUser.displayName,
                  avatarUrl: serverUser.avatarUrl,
                  provider: serverUser.provider,
                }
              : null
          );
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setUser(null);
          setLoading(false);
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  return { user, loading };
}
