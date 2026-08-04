import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import { cookies } from "next/headers";

/**
 * Firebase Admin (server-only) session handling.
 *
 * The session cookie is the only auth credential the browser carries on
 * navigations; ID tokens live in memory client-side and are exchanged for a
 * cookie at sign-in and on each signed-in mount (keepalive). All cookie
 * reads/writes go through this module — never accept a `user_id` from a
 * request body; derive it from the verified cookie UID.
 */
export const SESSION_COOKIE_NAME = "unseenlab.session";

/** Session cookie lifetime: 14 days, Firebase's recommended default. */
export const SESSION_COOKIE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

let cachedAuth: Auth | null | undefined;

/**
 * Lazy admin Auth singleton from `FIREBASE_SERVICE_ACCOUNT` (JSON string).
 * Returns null when the service account is absent or malformed — the server
 * equivalent of "not configured", so every caller degrades to guest mode.
 */
export function getAdminAuth(): Auth | null {
  if (cachedAuth !== undefined) return cachedAuth;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    cachedAuth = null;
    return null;
  }
  let sa: ServiceAccountJson;
  try {
    sa = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    cachedAuth = null;
    return null;
  }
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    cachedAuth = null;
    return null;
  }

  const app: App =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert({
            projectId: sa.project_id,
            clientEmail: sa.client_email,
            privateKey: sa.private_key,
          }),
          projectId: sa.project_id,
        });
  cachedAuth = getAuth(app);
  return cachedAuth;
}

/** Platform-neutral view of a verified session, consumed by pages and routes. */
export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** e.g. "google.com" — from the token's `firebase.sign_in_provider`. */
  provider: string | null;
}

function toSessionUser(decoded: DecodedIdToken): SessionUser {
  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    displayName: decoded.name ?? null,
    avatarUrl: decoded.picture ?? null,
    provider: decoded.firebase?.sign_in_provider ?? null,
  };
}

/**
 * Verifies a session-cookie value (e.g. from the proxy's request cookies).
 * Returns null when unconfigured, the cookie is absent, or verification
 * fails — callers treat null as signed-out.
 */
export async function verifySessionCookieValue(
  cookieValue: string | null | undefined
): Promise<SessionUser | null> {
  const auth = getAdminAuth();
  if (!auth || !cookieValue) return null;
  try {
    const decoded = await auth.verifySessionCookie(cookieValue, true);
    return toSessionUser(decoded);
  } catch {
    return null;
  }
}

/**
 * Verifies the session cookie from the current request (route handlers,
 * server components, server actions). Reads are allowed in server-component
 * renders; only route handlers set cookies.
 */
export async function verifySessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  return verifySessionCookieValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * Canonical "require authenticated user" helper for protected data routes.
 * Returns the verified session user, or null when unconfigured / no valid
 * cookie — callers must treat null as 401. Never accepts client-supplied
 * ownership.
 */
export async function requireSessionUser(): Promise<SessionUser | null> {
  return verifySessionUser();
}

/**
 * Exchanges a fresh ID token for a session cookie value. Returns null when
 * unconfigured or the token is invalid.
 */
export async function createSessionCookie(
  idToken: string
): Promise<string | null> {
  const auth = getAdminAuth();
  if (!auth) return null;
  try {
    return await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });
  } catch {
    return null;
  }
}
