import { describe, expect, it, vi } from "vitest";
import { POST, DELETE } from "@/app/api/auth/session/route";

/**
 * Session mint/clear route (test plan §E1): POST exchanges a Firebase ID
 * token for an httpOnly session cookie behind a same-origin (CSRF) guard and
 * an in-memory per-IP failure rate limit; DELETE clears the cookie.
 *
 * The rate limiter is module-level, so every test mints with a FRESH source
 * IP (`x-forwarded-for`) — the route itself is not modified for testability.
 */

const mocks = vi.hoisted(() => ({
  getAdminAuth: vi.fn(),
  createSessionCookie: vi.fn(),
}));

vi.mock("@/lib/firebase/server", () => ({
  getAdminAuth: mocks.getAdminAuth,
  createSessionCookie: mocks.createSessionCookie,
  SESSION_COOKIE_NAME: "unseenlab.session",
  SESSION_COOKIE_MAX_AGE_MS: 14 * 24 * 60 * 60 * 1000,
}));

const SESSION_URL = "http://localhost:3100/api/auth/session";
const COOKIE_NAME = "unseenlab.session";
const COOKIE_MAX_AGE_S = 14 * 24 * 60 * 60; // 1209600
const AUTH = { fake: "admin auth" };

/** Unique source IP per call so rate-limit state never leaks across tests. */
let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

interface MintOptions {
  origin?: string | null;
  host?: string;
  ip?: string;
  body?: string | null;
}

/** POST /api/auth/session as the route sees it (headers must be explicit). */
function mintRequest({
  origin = "http://localhost:3100",
  host = "localhost:3100",
  ip,
  body = JSON.stringify({ idToken: "id-token-123" }),
}: MintOptions = {}): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  headers.set("host", host);
  if (ip) headers.set("x-forwarded-for", ip);
  if (body !== null) headers.set("content-type", "application/json");
  return new Request(SESSION_URL, {
    method: "POST",
    headers,
    body: body === null ? undefined : body,
  });
}

describe("POST /api/auth/session", () => {
  it("returns 503 not_configured when Firebase admin auth is absent", async () => {
    mocks.getAdminAuth.mockReturnValue(null);
    const res = await POST(mintRequest());
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "not_configured" });
    expect(mocks.createSessionCookie).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST (CSRF guard) with 403", async () => {
    mocks.getAdminAuth.mockReturnValue(AUTH);
    const res = await POST(mintRequest({ origin: "http://evil.example" }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "forbidden" });
    expect(mocks.createSessionCookie).not.toHaveBeenCalled();
  });

  it("mints the httpOnly session cookie for a same-origin valid request", async () => {
    mocks.getAdminAuth.mockReturnValue(AUTH);
    mocks.createSessionCookie.mockResolvedValue("cookie-value-abc");

    const res = await POST(mintRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const cookie = res.cookies.get(COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe("cookie-value-abc");
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("lax");
    expect(cookie!.path).toBe("/");
    expect(cookie!.maxAge).toBe(COOKIE_MAX_AGE_S); // 14 days
    expect(mocks.createSessionCookie).toHaveBeenCalledWith("id-token-123");
  });

  it("returns 400 invalid_input when the idToken is missing", async () => {
    mocks.getAdminAuth.mockReturnValue(AUTH);
    const res = await POST(mintRequest({ body: "{}", ip: freshIp() }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_input" });
  });

  it("returns 400 invalid_input on a non-JSON body", async () => {
    mocks.getAdminAuth.mockReturnValue(AUTH);
    const res = await POST(mintRequest({ body: "not json", ip: freshIp() }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_input" });
  });

  it("returns 401 invalid_token when token exchange fails", async () => {
    mocks.getAdminAuth.mockReturnValue(AUTH);
    mocks.createSessionCookie.mockResolvedValue(null);
    const res = await POST(mintRequest({ ip: freshIp() }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid_token" });
  });

  it("rate limits the 21st failed mint from one IP but not another IP", async () => {
    mocks.getAdminAuth.mockReturnValue(AUTH);
    const attackerIp = freshIp();
    for (let i = 0; i < 20; i += 1) {
      const res = await POST(
        mintRequest({ body: "{}", ip: attackerIp })
      );
      expect(res.status).toBe(400); // each failure counts against the limit
    }
    const limited = await POST(mintRequest({ body: "{}", ip: attackerIp }));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: "rate_limited" });

    // A different IP is unaffected by the attacker's failures.
    const other = await POST(mintRequest({ body: "{}", ip: freshIp() }));
    expect(other.status).toBe(400);
  });

  it("does not count a successful mint against the rate limit", async () => {
    mocks.getAdminAuth.mockReturnValue(AUTH);
    mocks.createSessionCookie.mockResolvedValue("cookie-value-abc");
    const ip = freshIp();
    // Fail once, then succeed from the same IP: the failure is recorded but
    // the successful mint is not a failure, so the next failure is still the
    // 2nd (well under the 20-attempt limit).
    await POST(mintRequest({ body: "{}", ip }));
    const ok = await POST(mintRequest({ ip }));
    expect(ok.status).toBe(200);
    const again = await POST(mintRequest({ body: "{}", ip }));
    expect(again.status).toBe(400); // still 400, not 429
  });
});

describe("DELETE /api/auth/session", () => {
  it("clears the session cookie (maxAge 0)", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const cookie = res.cookies.get(COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe("");
    expect(cookie!.maxAge).toBe(0);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.path).toBe("/");
  });
});
