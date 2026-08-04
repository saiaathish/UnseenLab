/**
 * Firebase environment configuration (browser-safe publishable values only).
 *
 * Reads only publishable web-app config. The service-account JSON and any
 * admin secrets are server-only and never part of this module.
 */
export interface FirebaseConfig {
  apiKey: string | null;
  authDomain: string | null;
  projectId: string | null;
  appId: string | null;
}

export function getFirebaseConfig(): FirebaseConfig {
  const clean = (v: string | undefined) =>
    v && v.trim().length > 0 ? v.trim() : null;
  return {
    apiKey: clean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: clean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: clean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    appId: clean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
}

export function isFirebaseConfigured(): boolean {
  const { apiKey, authDomain, projectId, appId } = getFirebaseConfig();
  return Boolean(apiKey && authDomain && projectId && appId);
}
