# Firebase Auth + MongoDB setup (exact external checklist)

The platform layer is implemented and covered by unit/component tests with
mocked clients, but it has **not** been smoke-tested against a real Firebase
project or MongoDB. This document is the exact checklist to
finish that gate. The app degrades gracefully to guest-only mode until then
(no Firebase/Mongo env vars → the lab works fully locally, nothing signs in).

The platform layer is:

- **Auth:** Firebase Auth with Google sign-in (popup). The browser exchanges
  the resulting ID token for an httpOnly session cookie
  (`unseenlab.session`, 14-day expiry) via `POST /api/auth/session`.
- **Data:** MongoDB (Atlas or local), collections `profiles`,
  `learner_preferences`, `learning_sessions`. Ownership is enforced by the
  API layer — `user_id` is always derived server-side from the verified
  session cookie, never accepted from request bodies (there is no RLS in the
  MongoDB model). See `docs/mongo-schema.md`.

## 1. Firebase project + Google sign-in

1. Firebase console (<https://console.firebase.google.com>) → create a
   project (or reuse one) named e.g. `unseen-lab`.
2. **Authentication → Sign-in method → Google** → enable it. (The app uses
   Google only; email/password is not part of the product sign-in flow.)
3. **Authentication → Settings → Authorized domains** must include every
   origin the app runs on:
   - `localhost` (dev server; the console usually lists it by default)
   - your preview domain, e.g. `<preview>.vercel.app` (register each preview
     deployment separately — Firebase forbids wildcards)
   - your production domain, e.g. `unseen-lab.vercel.app` or your Render
     service domain
   A popup from an unlisted origin is blocked by the browser.
4. **Project settings → Your apps → Web app** (or *Add app* → Web): register
   the app and copy the four **publishable** values (SDK setup and
   configuration):
   - API key (`apiKey`)
   - Auth domain (`authDomain`)
   - Project ID (`projectId`)
   - App ID (`appId`)

   These four values are browser-safe by design (the Firebase web SDK ships
   them to every client); they are the `NEXT_PUBLIC_*` build-time envs below.

5. **Project settings → Service accounts → Generate new private key** →
   download the JSON. This is `FIREBASE_SERVICE_ACCOUNT` — a **server-only
   secret** (it can mint admin tokens). Never commit it. In `.env`, keep the
   whole JSON on **one line** (the `private_key` field contains literal `\n`
   escapes, so `JSON.parse` works):

   ```bash
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"unseen-lab","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxxx@unseen-lab.iam.gserviceaccount.com", ...}
   ```

## 2. MongoDB Atlas

1. Atlas (<https://www.mongodb.com/cloud/atlas>) → create a free **M0**
   cluster.
2. **Database Access → Add new database user**: create an app user (e.g.
   `unseenlab`) with a strong password. The app needs read/write on the
   `unseenlab` database only.
3. **Network Access → Add IP address**: allow your deployment's egress
   (for local dev, add your current IP; for Vercel/Render, follow their
   static-egress docs or open the CIDR your provider documents).
4. **Database → Connect → Drivers**: copy the connection string
   (`mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority`)
   and substitute the real user/password. This is `MONGODB_URI` — a
   **server-only secret** (it contains credentials). Never commit it.

   Local alternative: run MongoDB locally (e.g. via `mongodb-memory-server`
   for tests, or a local `mongod`/Docker container) and use
   `mongodb://127.0.0.1:27017` as `MONGODB_URI` — everything below works
   identically.

## 3. Environment variables (names only)

```bash
# Browser-safe, baked at build time (from Firebase console → web app):
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Server-only:
FIREBASE_SERVICE_ACCOUNT=   # service-account JSON, one line (see §1.5)
MONGODB_URI=                # connection string with credentials (see §2.4)
# Optional: MONGODB_DB=unseenlab   (default database name)
```

Never add `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PRIVATE_KEY`, `MONGODB_URI`,
or Google OAuth client secrets to any environment file consumed by the
browser, and never commit real values to the repository (CI scans for
tracked-file assignments of these names).

## 4. Create the Mongo collections + indexes

Run the idempotent setup script (creates missing collections and indexes,
never drops data):

```bash
MONGODB_URI='mongodb+srv://...' npx node scripts/mongo-setup.mjs
# optional: MONGODB_DB=unseenlab  (default)
```

The script creates: `profiles` (unique index on `user_id`),
`learner_preferences` (unique index on `user_id`), and `learning_sessions`
(unique index on `id`, plus indexes on `user_id`, `{user_id, lab_slug,
status}`, and `{user_id, updated_at: -1}`). See `docs/mongo-schema.md`.

## 5. Post-configuration smoke checks

- Guest flow unchanged: homepage → lab → trials → export, no account.
- Flow B (new user): sign in (Google popup) → callback → onboarding (4
  steps) → dashboard → lab with saved preferences → cloud "Saved" status →
  reload → resume.
- Flow C (guest conversion): guest trial → sign in → import dialog
  ("Save your current learning session?") → Not now (no cloud row) → explicit
  "Save this session to your account" → exactly one cloud row; re-import
  creates no duplicates.
- Flow F (isolation): two accounts; each sees only its own dashboard rows;
  direct API calls across users are denied (the API derives `user_id` from
  the verified session cookie).

## 6. Cross-device e2e (real backend)

```bash
# 1. Build WITH the Firebase publishable envs baked in:
NEXT_PUBLIC_FIREBASE_API_KEY=... \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=... \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=... \
NEXT_PUBLIC_FIREBASE_APP_ID=... \
npm run build

# 2. Run the cross-device spec with the server-only creds exported:
FIREBASE_SERVICE_ACCOUNT='{...one-line JSON...}' \
MONGODB_URI='mongodb+srv://...' \
NEXT_PUBLIC_FIREBASE_API_KEY=... \
CROSS_DEVICE_E2E=1 \
npx playwright test e2e/cross-device-resume.spec.ts
# optional: E2E_BASE_URL=http://localhost:3100 (default), MONGODB_DB (default unseenlab)
```

`scripts/e2e-seed-auth.mjs` does the heavy lifting without a browser:
`create` idempotently creates `learner_a@test.local` / `learner_b@test.local`
on Firebase Auth, upserts their `profiles` rows to `onboarding_version: 1`,
and wipes their sessions/preferences; `token <email>` mints a real
`unseenlab.session` cookie (custom token → Identity Toolkit
`signInWithCustomToken` → `createSessionCookie`). The spec injects that
cookie into fresh browser contexts and runs the real flow — only the Google
popup round trip is skipped. The suite self-skips without
`CROSS_DEVICE_E2E=1`, so CI stays green without credentials.

## 7. Honest limitations

- **Popup sign-in requires authorized domains.** A popup from an origin not
  listed in Authentication → Settings → Authorized domains is blocked; every
  preview deployment needs its own entry (no wildcards).
- **iOS in-app browsers block popups** (e.g. Chrome/Facebook in-app
  webviews). Users there should open the site in a full browser.
- **Session cookie lifetime is 14 days**, refreshed by the client-side
  keepalive (each signed-in page mount re-mints the cookie from the in-memory
  ID token). A user who never returns for 14 days signs in again.
- **Ownership is enforced by the API layer, not by the database.** MongoDB
  has no row-level security; every route derives `user_id` from the verified
  session cookie (firebase-admin `verifySessionCookie(cookie, true)`) and
  rejects any `user_id` supplied by clients. The database itself is only as
  safe as the API code in front of it.
- **Without any of this the app is fully functional guest-only**: no crash,
  no auth wall, everything stays on the device (localStorage evidence, JSON
  export, deterministic offline adaptation).

## 8. Known state

- Real OAuth smoke: RUN 2026-08-04 — popup opens to the Google account
  chooser from localhost; session cookie minted (868 B) and verified;
  cross-device cookie flow covered by `scripts/backend-integration.mjs`
  (15/15 vs live Firebase + Atlas).
- The cross-device e2e cookie is a single `unseenlab.session` cookie; the
  script measures its byte size at mint time and warns if it approaches the
  browser's 4096-byte per-cookie limit (a Firebase session cookie is ~1–1.5
  KB in practice).
- `npm audit`: 3 high findings in `sharp` (transitive via Next.js image
  optimization; unused by the app). Fix: `next@16.3.0` (out of pinned range,
  deferred).

### Gate-4 note (2026-08-05): Vercel preview cloud persistence

`PUT/GET /api/demonstrations` (generated-demo cloud save) on a Vercel
**preview** fails with `503 not_configured` even when `MONGODB_URI` is set
on the branch. Diagnosis (deployment logs + a temporary health probe, since
reverted): the lambda reaches Atlas but Atlas terminates the TLS handshake
(`tlsv1 alert internal error`) — the classic Atlas response to a client IP
that is NOT in the project's Network Access list. Your local IP is
allowlisted (which is why every local/e2e run passes), but Vercel Hobby
functions egress from a dynamic shared pool; Vercel Static IPs are
Pro/Enterprise-only ($100/mo, no Hobby equivalent).

**Fix (Atlas console, one step):** Atlas → Network Access → Add IP address →
`0.0.0.0/0` (protect with the strong app-user password; the app user has
read/write only on the `unseenlab` database). Or add the current Vercel
function egress IP, but it rotates on Hobby.

Verified with the allowlisted path (local `next dev` against the real
Firebase project + real Atlas, identical code): signed-in PUT 200 (revision
1), GET-by-id 200 owner-scoped, idempotent replay (same `mutation_id` →
same revision, no new write), two-user isolation (learner_b GET → null;
PUT creates learner_b's own row under the composite key), and the client
`loadFromCloud` second-browser resume restores the demo with an honest
"Saved to your account" banner and empty trial log.
