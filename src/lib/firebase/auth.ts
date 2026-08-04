"use client";

import {
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * Google sign-in via popup. On success the fresh ID token is exchanged for
 * an httpOnly session cookie (POST /api/auth/session) so the server gates
 * recognize the session. Returns the error (or null) — never throws.
 *
 * The caller owns post-sign-in navigation (e.g. `/auth/callback?next=…`).
 */
export async function signInWithGoogle(): Promise<Error | null> {
  const auth = getFirebaseAuth();
  if (!auth) return new Error("Authentication is not configured yet.");

  try {
    const credential = await signInWithPopup(auth, new GoogleAuthProvider());
    const idToken = await credential.user.getIdToken();
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
      return new Error("Could not start a server session.");
    }
    return null;
  } catch (error) {
    // auth/popup-closed, auth/network-request-failed, auth/popup-blocked, …
    return error instanceof Error
      ? error
      : new Error("Google sign-in failed.");
  }
}

/**
 * Sign out in the browser: clears Firebase local state and the server
 * session cookie. Preserves local guest evidence by design — localStorage
 * lab data is untouched.
 */
export async function signOut(): Promise<Error | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    return error instanceof Error ? error : new Error("Sign-out failed.");
  }
  // Best-effort cookie clear; a failure still leaves the client signed out
  // and the server gate will catch the stale cookie on the next request.
  try {
    await fetch("/api/auth/session", { method: "DELETE" });
  } catch {
    // ignore
  }
  return null;
}
