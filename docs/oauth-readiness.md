> **SUPERSEDED — historical record.** This document describes the Supabase +
> Postgres RLS platform layer, which was replaced by Firebase Auth + MongoDB
> (see `docs/firebase-mongodb-setup.md`, `docs/backend-verification.md`,
> `docs/security.md`). Kept for audit history; its claims do not describe the
> current runtime.

# OAuth Readiness Audit (AGENT OATH-01)

Audit date: 2026-08-03. Scope: prove the app is ready to work the moment real
Google OAuth credentials are configured — or find the gaps. Read-only audit of
the working tree (`0ab636a` + uncommitted doc/test tweaks, none auth-related).
Every claim is tied to a `file:line` or to upstream source in `node_modules`
(verified against the installed versions: `@supabase/ssr` 0.12.4,
`@supabase/supabase-js` 2.112.0, and gotrue `supabase/auth` master).

Method note: this fork of `@supabase/ssr`/`auth-js` is customized (per-flow PKCE
verifier slots, ring eviction, dual-write legacy key). The audit reads the
installed source, not upstream assumptions.

---

## Verdict summary

| # | Chain | Verdict |
|---|-------|---------|
| 1 | Env contract | READY |
| 2 | Sign-in chain | READY |
| 3 | Callback chain (PKCE) | READY (one live-verification step) |
| 4 | Proxy chain (cookies) | READY |
| 5 | Google Console / Supabase config checklist | GAP (doc-level, 3 items) |
| 6 | Failure paths | READY (2 copy/UX nits) |
| 7 | Concrete gaps | 0 code-level blockers; 5 doc/ops items |

**Final verdict: the app is ready the moment real credentials exist — the
sign-in chain is fully wired end-to-end and there are zero code-level
blockers. Two configuration-checklist conditions apply (Chain 5): Supabase
Redirect URLs must be entered with the `/**` wildcard (or Site URL set to the
app origin), and the Vercel preview redirect URI must be registered exactly in
Google Cloud before a preview deployment can sign in.**

---

## Chain 1 — Env contract: READY

- `src/lib/supabase/config.ts:13-27` reads exactly `NEXT_PUBLIC_SUPABASE_URL`
  and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with fallback
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Values are trimmed; empty → `null`;
  `isSupabaseConfigured()` gates everything downstream.
- Grep of `process.env` across `src/` confirms **no other code reads
  Supabase env names** — the only other consumers are `LLM_*`
  (`src/app/api/adapt/route.ts:48-84`, `src/adaptation/llm-provider.ts:111`),
  which are a separate subsystem.
- `.env.example` (Supabase block) and `docs/supabase-setup.md` §3 list the
  same two names + legacy anon comment. Exact match with `config.ts`.
- Secrets hygiene: `.env*` is gitignored except `.env.example`
  (`.gitignore:34-35`); only `.env.example` is tracked. The working-tree
  `.env` carries an LLM key only — irrelevant to OAuth and not committed.

## Chain 2 — Sign-in chain: READY

- `src/components/auth/sign-in-dialog.tsx:58-70` (`handleGoogle`):
  `redirectTo = \`${window.location.origin}/auth/callback\`` plus
  `?next=${encodeURIComponent(next)}` only when
  `isSafeRedirectPath(next)` passes.
  - Shape check: `window.location.origin` has no trailing slash, so the
    result is exactly `http://localhost:3000/auth/callback` — no double
    slashes, no trailing slash, matches the Google redirect URI format
    byte-for-byte. When `next` is null/empty/unsafe the query is omitted
    entirely.
  - `next` with its own query string (e.g. `/lab/nuclear-chain-reaction?topic=x`)
    is preserved: `encodeURIComponent` wraps the whole path+query into one
    `next` param, and the callback's `URLSearchParams.get("next")` decodes it
    back to the full string; `isSafeRedirectPath` allows it and
    `new URL(safeNext, origin)` (`src/app/auth/callback/route.ts:39`) keeps
    the query. Verified by construction and by
    `tests/components/sign-in-dialog.test.tsx` (all 19 auth unit tests pass).
- `src/lib/supabase/auth.ts:11-39`: `isSafeRedirectPath` rejects `//evil.com`,
  `/\evil.com`, control characters (<0x20), and any URL that resolves off
  same-origin; `signInWithGoogle` maps an unconfigured Supabase to a
  non-throwing error the dialog renders.
- Redirect flow, not popup: `signInWithOAuth` without `popup: true` calls
  `window.location.assign(url)` — verified in the installed auth-js
  (`node_modules/@supabase/auth-js/src/GoTrueClient.ts:4806-4813`). Full-page
  navigation; no popup-blocker exposure.
- Query-string tolerance on Supabase's allowlist (see Chain 5): with no
  `?next=` today, the redirectTo matches an exact allowlist entry. The
  `?next=` path is currently dormant — no UI link in `src/` generates one
  (grep: only `sign-in-dialog.tsx:62` references it).

## Chain 3 — Callback chain: READY

`src/app/auth/callback/route.ts:13-48` — exchange → onboarding gate →
safe-next → `/dashboard`; any failure → `/?auth=error`.

- **State param: not required.** `exchangeCodeForSession` in the installed
  auth-js performs no OAuth `state` validation at all — the PKCE verifier is
  the CSRF protection
  (`GoTrueClient.ts:1997-2075` `_exchangeCodeForSession`; the only lookup is
  `retrievePKCEVerifier`). Nothing more is needed in the callback.
- **PKCE verifier persistence (browser → server)**: the browser client
  (`createBrowserClient` with no custom options,
  `src/lib/supabase/browser-client.ts:17`) uses cookie storage
  (`@supabase/ssr/src/cookies.ts`, `document.cookie` path). On sign-in,
  `storePKCEVerifier` writes three cookies under the storage key
  `sb-<ref>-auth-token` (`auth-js/src/lib/helpers.ts:339-391`):
  1. `sb-<ref>-auth-token-flow-<flowId>-code-verifier` (slot)
  2. `sb-<ref>-auth-token-flows-code-verifier` (index)
  3. `sb-<ref>-auth-token-code-verifier` (legacy fixed key — dual-written
     every flow)
  The server callback calls `exchangeCodeForSession(code)` with no flowId
  (server runtime ⇒ no `sb_flow_id` read) and `retrievePKCEVerifier` falls
  back to the fixed legacy key (`helpers.ts:397-407`) — the dual write is
  precisely what makes the server exchange succeed. Cookie defaults
  (`@supabase/ssr/src/utils/constants.ts:3-10`: `path=/`, `sameSite=lax`,
  `httpOnly=false`, maxAge 400 days) keep the verifier cookie alive across
  the Google round-trip — it is sent on the top-level GET navigation back to
  `/auth/callback` (SameSite=Lax covers top-level navigations).
- `experimental.appendPkceFlowIdToRedirects` defaults **off**
  (`GoTrueClient.ts:432`, gate at `:5709`), so no extra `sb_flow_id` query
  param is appended to redirectTo — nothing can disturb Google's exact
  redirect-URI match or Supabase's allowlist match.
- Session cookies from the exchange are flushed by `createServerClient`'s
  storage application on `SIGNED_IN`/`TOKEN_REFRESHED`
  (`@supabase/ssr/src/createServerClient.ts:173-195`) through the
  route-handler `cookies()` API; the returned `NextResponse.redirect` is the
  canonical supabase-ssr callback pattern. This is the one link never
  exercised live (see Gap G5).
- Onboarding gate: the `handle_new_user` trigger
  (`supabase/migrations/20260803193000_platform_schema.sql:186` —
  `after insert on auth.users`) creates the profile row with
  `onboarding_version = 0 < CURRENT_ONBOARDING_VERSION = 1`
  (`src/personalization/onboarding-schema.ts:9`), so new users go to
  `/onboarding`; existing users to `safeNext`/`/dashboard`
  (`route.ts:30-42`). RLS lets the user read only their own row; a missing
  row (trigger not applied) degrades to onboarding, not a crash.

## Chain 4 — Proxy chain: READY

- Cookie name derivation (`@supabase/supabase-js/src/SupabaseClient.ts:329`):
  `defaultStorageKey = \`sb-${baseUrl.hostname.split('.')[0]}-auth-token\``
  — derived from the **Supabase project URL's** hostname, not the app's
  domain. Local CLI stack ⇒ `sb-localhost-auth-token`; hosted project
  `https://<ref>.supabase.co` ⇒ `sb-<ref>-auth-token` on every app domain
  (localhost, preview, production) as long as the same env URL is baked.
- `src/lib/supabase/proxy-client.ts:17-18` reads `request.cookies.getAll()`
  — all cookies, name-agnostic — and both browser and proxy/server clients
  derive the identical storageKey from the identical `getSupabaseConfig()`
  values, so chunked cookie reads (`sb-<ref>-auth-token`, `.0`, `.1`, …)
  line up. Refresh writes go to both `request.cookies` and
  `response.cookies` (`proxy-client.ts:20-27`) — the canonical swap, so
  refreshed tokens reach the browser.
- `src/proxy.ts:12-39`: protected prefixes `/dashboard`, `/onboarding`,
  `/settings`; lab stays public; unconfigured Supabase degrades to
  `/?auth=open`. `getUser()` refreshes the session on the way through.

## Chain 5 — Google Console / Supabase prerequisites: GAP (doc-level)

The production URL in the docs is consistent with reality:
`.vercel/project.json` has `projectName: "unseen-lab"` ⇒ production domain
`https://unseen-lab.vercel.app`. The docs' preview entry is a placeholder.

### Exact entries (must be entered verbatim)

Google Cloud → Credentials → OAuth client (Web application):

| Purpose | Authorized redirect URIs (Google) | Authorized JavaScript origins |
|---|---|---|
| Local | `http://localhost:3000/auth/callback` | `http://localhost:3000` |
| Preview (Vercel) | `https://<preview>.vercel.app/auth/callback` — **placeholder, must be replaced** with the real preview domain (e.g. `https://unseen-lab-git-<branch>-<org>.vercel.app/auth/callback`) | `https://<preview>.vercel.app` |
| Production | `https://unseen-lab.vercel.app/auth/callback` | `https://unseen-lab.vercel.app` |

Notes:
- **Google does not allow wildcards** in redirect URIs. Every Vercel preview
  deployment gets a unique URL, so each preview that must sign in needs its
  URI registered (or a stable preview alias). This is the hardest external
  constraint; production and local are unaffected.
- JavaScript origins are not strictly required for this flow — Supabase
  exchanges the code server-to-server; the browser never talks to Google
  directly. Adding them (per the docs) is harmless.
- Source: `docs/supabase-setup.md:36-44`.

Supabase → Auth → URL Configuration:

| Field | Required value | Status |
|---|---|---|
| Site URL | App origin (`http://localhost:3000`, `https://unseen-lab.vercel.app`) | **Missing from docs** — G1 |
| Redirect URLs | `http://localhost:3000/**`, `https://unseen-lab.vercel.app/**`, plus preview hosts with `/**` | **Doc guidance must change** — G1 |
| Providers → Google | Google Client ID + Secret | n/a (external) |

**Domain-change flag**: if the production domain ever differs from
`unseen-lab.vercel.app` (custom domain), **four** places must change
together: Google redirect URIs, Google JS origins, Supabase Site URL,
Supabase Redirect URLs. `docs/supabase-setup.md` never names Site URL and
does not enumerate the JS origins, so a domain change has no single checklist
to follow (G2/G3).

## Chain 6 — Failure paths when credentials are WRONG

| Failure | What the user sees | Handled gracefully? |
|---|---|---|
| Redirect URI not registered in Google (`redirect_uri_mismatch`) | Google's own error page on accounts.google.com; the app callback never fires; no session | Partially. Returning to the app shows the homepage with the dialog closed and no message — there is no way for the app to know. Not fixable in-app (Google controls the page). |
| Wrong client ID/secret (or provider disabled) in Supabase | Supabase `/authorize` returns an error to the SDK → `signInWithGoogle` returns it → dialog shows inline "We couldn't sign you in with Google. Please try again." (`sign-in-dialog.tsx:107-113`); user can retry or continue as guest | Yes |
| Supabase redirect allowlist rejects redirectTo | gotrue silently falls back to Site URL/referrer (`supabase/auth` `internal/utilities/request.go` `GetReferrer`) — user lands on the Supabase site URL instead of the app | **No** — this is why Chain 5's wildcard/Site-URL fix matters; exact entries + any query param trigger it silently. |
| User cancels at Google | Google redirects back with `error=access_denied`; the callback has no `code` → `/?auth=error` → dialog shows "We couldn't sign you in with Google" (`route.ts:47`, `sign-in-dialog.tsx:56`) | Yes, but copy is misleading for a deliberate cancel (G4). |
| Stale/consumed code, missing verifier, callback URL revisited | Exchange fails → `/?auth=error` → dialog with error; stays signed out; guest mode intact | Yes |

Flow shape: redirect (no popup) — full-page navigation to Google and back
(Chain 2). The popup path is never used.

## Chain 7 — Concrete gaps (severity, evidence, fix)

- **G1 — HIGH (docs/config).** `docs/supabase-setup.md:41-42` tells the
  operator to add "the same `.../auth/callback` URLs" to Supabase's Redirect
  URLs. gotrue validates redirect URLs by glob-matching the **full URL
  including the query string** (only the fragment is stripped —
  `supabase/auth` `internal/utilities/request.go` `IsRedirectURLValid`), with
  patterns compiled on `.` `/` separators. Evidence from gotrue's own tests
  (`internal/utilities/request_test.go`, cases `"* respects parameters"` and
  `"* respects separator"`): an exact entry like `http://localhost:3000/auth/callback`
  does **not** match `.../auth/callback?next=%2F…`, while
  `http://localhost:3000/*` (or `/**`) does. The app's `?next=` redirectTo
  (`sign-in-dialog.tsx:62-63`) therefore silently fails against exact
  entries in production (localhost still passes via gotrue's RFC 8252
  loopback port exemption). Today `next` is never set by any UI (dormant),
  so nothing breaks yet — but the tested path exists and any future
  `?next=` link flips this on. **Fix:** document Redirect URLs in wildcard
  form (`http://localhost:3000/**`, `https://unseen-lab.vercel.app/**`,
  preview hosts likewise) and/or set Site URL to the app origin (the
  same-origin shortcut then accepts any path+query) — and add Site URL to
  the doc entirely.
- **G2 — MEDIUM (docs/ops).** Preview redirect URI is a placeholder
  (`docs/supabase-setup.md:39`) and Google forbids wildcards, so per-deploy
  registration or a stable preview alias is required for preview sign-in.
  **Fix:** document the exact preview-domain pattern and the per-deployment
  registration step (or use a fixed preview alias).
- **G3 — LOW (docs).** Authorized JavaScript origins are described but not
  enumerated (`docs/supabase-setup.md:43`). **Fix:** list the three exact
  origins (table above).
- **G4 — LOW (copy).** A user-initiated Google cancel surfaces
  `/?auth=error` → "We couldn't sign you in with Google. Please try again."
  (`route.ts:47`, `sign-in-dialog.tsx:56,110`). Works, but the wording
  implies a failure. **Fix (optional):** treat `error=access_denied` in the
  callback as a neutral close (`/?auth=open` or no param) instead of
  `?auth=error`.
- **G5 — LOW (ops/verification).** No real-credential smoke run
  (`NOT_RUN_EXTERNAL_CREDENTIALS`, `docs/supabase-setup.md:76`). The one
  link never exercised live is the route-handler cookie write flowing
  through `NextResponse.redirect` in `src/app/auth/callback/route.ts` —
  canonical supabase-ssr pattern, typechecked and unit-tested with mocked
  clients, but not proven against Next 16.2.12 with a real exchange.
  **Fix:** on first credential setup, run the documented Flow B smoke
  (`docs/supabase-setup.md:64-65`) and confirm the session cookie is present
  after the callback redirect.
- **G6 — INFO.** `next` is currently never generated by any UI link; the
  `?next=` redirectTo path is dormant but tested
  (`tests/components/sign-in-dialog.test.tsx:116-148`).

## Verification performed

- Typecheck (`tsc --noEmit`): clean. Auth unit tests: 19/19 pass
  (`sign-in-dialog`, `auth-callback`).
- Installed-source inspection: auth-js PKCE storage/retrieval, ssr cookie
  storage + server storage application, storage-key derivation, provider
  sign-in redirect; gotrue (upstream master) `IsRedirectURLValid` and its
  tests for allowlist/query-string semantics.
- No credentials were used; nothing was modified outside this document.

## Bottom line

Sign-in is wired end-to-end and correct at code level: PKCE verifier survives
the Google round-trip in cookies, the server exchange needs no state
handling, the callback routes by onboarding state, the proxy refreshes the
same cookie set, and every failure path degrades gracefully. **"Ready the
moment credentials exist"** — provided the operator follows the corrected
Chain 5 checklist (wildcard Redirect URLs or Site URL = app origin; exact
preview redirect URI) and runs the Flow B smoke test once.
