"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirebaseConfig, isFirebaseConfigured } from "@/lib/firebase/config";

let cachedAuth: Auth | null = null;

/**
 * Singleton Firebase Auth client for the browser. Returns null when Firebase
 * is not configured so the app degrades gracefully to guest-only mode (the
 * same null-client convention the Supabase layer used).
 */
export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  if (!cachedAuth) {
    const { apiKey, authDomain, projectId, appId } = getFirebaseConfig();
    if (!apiKey || !authDomain || !projectId || !appId) return null;
    const app: FirebaseApp =
      getApps().length > 0
        ? getApp()
        : initializeApp({ apiKey, authDomain, projectId, appId });
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}
