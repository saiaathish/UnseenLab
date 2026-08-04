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
   - `docker exec -i supabase_db_UnseenLab psql -U postgres -d postgres < supabase/tests/rls-isolation.sql`
     (runs the suite inside the local stack; confirm the DB container name
     with `docker ps` — local stacks name it `supabase_db_<project-id>`).
   - For full conclusiveness of tests 5/6 (cross-user insert, user_id
     reassignment), replace the two placeholder uuids in the file with two
     **real** `auth.users` ids first, e.g.:
     `sed -e 's/00000000-0000-4000-8000-00000000000a/<real-id-a>/g' -e 's/00000000-0000-4000-8000-00000000000b/<real-id-b>/g' supabase/tests/rls-isolation.sql > /tmp/rls-run.sql`
     then pipe `/tmp/rls-run.sql` through the psql command above. The suite
     prints `RLS ISOLATION SUITE: ALL CHECKS PASSED` and exits 0 when green;
     it exits nonzero if any check fails.
5. Run database advisors (`supabase db advisors`, CLI v2.81.3+) and confirm
   zero issues before enabling auth.
6. If the project's Data API settings do not auto-expose new tables, the
   explicit `GRANT ... TO authenticated` statements in the migration already
   cover access; RLS is enforced independently.

## 2. Google OAuth (Supabase Auth → Providers → Google)

1. Google Cloud Console → Credentials → Create OAuth client (Web application).
2. Authorized redirect URIs (Supabase callback, one per environment):
   - Local: `http://localhost:3000/auth/callback`
   - Preview: `https://<preview>.vercel.app/auth/callback` (register each
     preview deployment separately — Google forbids wildcards)
   - Production: `https://unseen-lab.vercel.app/auth/callback`
   - Supabase side (Auth → URL Configuration → Redirect URLs) must include the
     same `.../auth/callback` URLs AND be glob-matched to allow the app's
     `?next=` query string: gotrue validates the redirect URL INCLUDING the
     query string, so a bare `https://unseen-lab.vercel.app/auth/callback`
     entry silently rejects `.../auth/callback?next=%2Fdashboard`. Use
     wildcard entries (`https://unseen-lab.vercel.app/auth/callback/**`) or
     set Site URL to the app origin so relative redirects resolve.
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
