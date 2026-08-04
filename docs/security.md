# Security Model

Auth hardening notes for the Firebase session layer. The contract: **the
browser never carries a credential more powerful than an httpOnly session
cookie, and the server never trusts a value the client could forge.**

Related: `docs/architecture.md` (layer overview), `docs/shared-device-privacy.md`
(multi-user device policy), `docs/test-plan-platform.md` (test plan §E1/E2).

---

## 1. Session cookie properties

Minted by `POST /api/auth/session`
(`src/app/api/auth/session/route.ts`) via firebase-admin
`createSessionCookie` (`src/lib/firebase/server.ts`):

| Property    | Value                                  | Why |
| ----------- | -------------------------------------- | --- |
| Name        | `unseenlab.session`                    | Distinct from Firebase's client-side `__session` |
| HttpOnly    | `true`                                 | `document.cookie` cannot read it; XSS cannot exfiltrate it |
| Secure      | `true` in production (`NODE_ENV` gate) | Never sent over plain http in prod; local `next dev` stays usable |
| SameSite    | `Lax`                                  | Blocks cross-site sends on top-of-page navigations (defense in depth with the Origin check) |
| Path        | `/`                                    | Sent on every request, so the proxy and route gates can verify it |
| Max-Age     | 14 days (`SESSION_COOKIE_MAX_AGE_MS`)  | Firebase's recommended session-cookie lifetime |

`DELETE /api/auth/session` (and `POST /api/auth/logout`) clears it with
`maxAge: 0`.

## 2. CSRF defense — same-origin check

Minting a session cookie is a state-changing POST, so a cross-site browser
must not be able to trigger it. Browsers always send an `Origin` header on
POST; the route accepts a request only when:

```
origin === (x-forwarded-proto || "http") + "://" + host
```

- **No `Origin` header** → accepted, but the request still requires a valid
  Firebase ID token, which a CSRF attacker cannot obtain. This keeps our
  non-browser tooling (Node seed/e2e clients) working.
- **Mismatched `Origin`** → `403 forbidden`, no token exchange attempted.
- **Rationale vs. cookies-only defenses:** SameSite=Lax is good, but an
  explicit Origin check pins the accepted origin exactly and does not depend
  on browser heuristics. Tests: `tests/app/auth-session-route.test.ts`
  (cross-origin POST → 403; same-origin valid POST → 200).

## 3. Failure rate limiting

`POST /api/auth/session` keeps a bounded in-memory failure ledger: **20
failed mint attempts per source IP per 15 minutes** (400 invalid input, 401
invalid token — successful mints do not count). The 21st attempt gets
`429 rate_limited`.

**Honest limitation:** the counter is per server instance, not global. With a
single deployment instance this is a real brake on brute-forcing; with
multiple instances an attacker gets one budget per instance. It is a
deterrent against spray attempts, not a substitute for Firebase's own token
validation. Also note it counts *failures only* — a distributed attack across
many IPs is bounded by nothing here (rate limiting by IP is inherently
evadable; the ID token itself is the real gate).

## 4. Open-redirect allowlist

`src/lib/auth/redirect-safety.ts` (`isSafeRedirectPath`) gates every
`?next=` destination in `GET /api/auth/callback`:

- Only same-origin, absolute-path targets are safe.
- Rejects `//evil.com`, `/\evil.com`, `javascript:`, absolute URLs, and
  control-character injection (`/%09/…`, `/%0a/…`) — control chars are
  stripped by URL parsing *before* authority detection, so they are checked
  explicitly.
- An unsafe `next` is ignored (never followed): the learner lands on
  `/dashboard` or `/onboarding`, never on an attacker-controlled URL.

## 5. Ownership invariant

**`user_id` is always derived from the verified session cookie — never from
a request body, query string, or header.** Route handlers resolve the user
through `verifySessionUser()`/`requireSessionUser()`
(`src/lib/firebase/server.ts`), which verifies the httpOnly cookie with
`auth.verifySessionCookie(value, true)` (checkRevoked = true) and returns the
UID from the decoded token. The callback route demonstrates the rule: the
profile lookup key is `{ user_id: user.uid }` where `uid` comes from the
verified cookie, not from any client-supplied parameter
(`tests/app/auth-callback.test.ts`).

## 6. Client-bundle secret scan

`scripts/bundle-secret-scan.mjs` runs in CI after `next build`
(`.github/workflows/ci.yml`, build job) and scans the shipped JS:

- **Client chunks (`.next/static`)** must contain **zero** occurrences of:
  `-----BEGIN PRIVATE KEY-----`, `FIREBASE_SERVICE_ACCOUNT`, `MONGODB_URI`,
  `mongodb+srv://`, `LLM_API_KEY`, OpenAI-style `sk-` + 20 chars (count
  reported), `supabase` (case-insensitive), `firebase-adminsdk`.
- **Server chunks (`.next/server`)** are expected to reference
  `FIREBASE_SERVICE_ACCOUNT`/`MONGODB_URI` — those are runtime `process.env`
  reads, so the *names* legitimately appear server-side. The critical
  assertion is client-chunk **absence**; server-side absence of the env
  reads is also flagged.
- Output is `CLEAN | LEAK <pattern> — <count> in <file>` per pattern; exit
  code 1 on any client leak (exit 2 if no build output exists). Source maps
  are excluded.

**The rule:** anything in a client bundle is public. The service-account
private key, `MONGODB_URI`, `LLM_API_KEY` and friends exist only as server
environment variables; client code must never import, inline, or reference
them. Only `NEXT_PUBLIC_*` values (the Firebase web API key is public by
design) belong in browser code. `src/lib/firebase/server.ts` stays
server-only via Next's server-runtime module graph, and this scan enforces
that the *output* never regresses.
