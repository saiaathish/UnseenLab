# Supabase + Google OAuth setup (exact external checklist)

The platform layer is implemented and covered by unit/component tests with
mocked clients, but it has **not** been smoke-tested against a real Supabase
project or Google OAuth — no credentials exist in this environment
(`NOT_RUN_EXTERNAL_CREDENTIALS`). This document is the exact checklist to
finish that gate. The app degrades gracefully to guest-only mode until then.

## 1. Supabase project

1. Create a project (any US region) named `unseen-lab`.
2. Settings → API: copy `Project URL` and the **publishable key**
   (legacy projects: anon key). Never copy the service-role key.
3. Apply the schema migration:
   - `supabase/migrations/20260803193000_platform_schema.sql`
   - via `supabase db push` (CLI v2.79+), the SQL editor, or `supabase db query -f supabase/migrations/20260803193000_platform_schema.sql`.
4. Verify with the RLS isolation suite:
   - `supabase db query -f supabase/tests/rls-isolation.sql`
   - For full conclusiveness of tests 5/6 (cross-user insert, user_id
     reassignment), replace the placeholder user ids at the top of the file
     with two **real** `auth.users` ids. The suite prints
     `RLS ISOLATION SUITE: ALL CHECKS PASSED` when green.
5. Run database advisors (`supabase db advisors`, CLI v2.81.3+) and confirm
   zero issues before enabling auth.
6. If the project's Data API settings do not auto-expose new tables, the
   explicit `GRANT ... TO authenticated` statements in the migration already
   cover access; RLS is enforced independently.

## 2. Google OAuth (Supabase Auth → Providers → Google)

1. Google Cloud Console → Credentials → Create OAuth client (Web application).
2. Authorized redirect URIs (Supabase callback, one per environment):
   - Local: `http://localhost:3000/auth/callback`
   - Preview: `https://<preview>.vercel.app/auth/callback`
   - Production: `https://unseen-lab.vercel.app/auth/callback`
   - Supabase side (Auth → URL Configuration → Redirect URLs) must include the
     same `.../auth/callback` URLs.
3. Authorized JavaScript origins: the app origins (no path).
4. Paste the Google Client ID + Secret into Supabase Auth → Providers → Google.
5. The app's OAuth entry (`src/components/auth/sign-in-dialog.tsx`) uses
   PKCE (`signInWithOAuth`) with `redirectTo = <origin>/auth/callback`;
   the callback (`src/app/auth/callback/route.ts`) exchanges the code,
   rejects unsafe `next` values, and routes by onboarding state.

## 3. Environment variables (names only)

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# legacy: NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Never add `SUPABASE_SERVICE_ROLE_KEY`, database passwords, or Google client
secrets to browser-consumed env files.

## 4. Post-configuration smoke checks

- Guest flow unchanged: homepage → lab → trials → export, no account.
- Flow B (new user): sign in → callback → onboarding (4 steps) → dashboard →
  lab with saved preferences → cloud "Saved" status → reload → resume.
- Flow C (guest conversion): guest trial → sign in → import dialog
  ("Save your current learning session?") → Not now (no cloud row) → explicit
  "Save this session to your account" → exactly one cloud row; re-import
  creates no duplicates.
- Flow F (isolation): two accounts; each sees only its own dashboard rows;
  direct API calls across users are denied (RLS).
- Run the RLS isolation suite again after any policy change.

## 5. Known state

- Real OAuth smoke: `NOT_RUN_EXTERNAL_CREDENTIALS` (honest, not faked).
- `npm audit`: 3 high findings in `sharp` (transitive via Next.js image
  optimization; unused by the app). Fix: `next@16.3.0` (out of pinned range,
  deferred).
