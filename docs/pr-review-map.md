> **SUPERSEDED — historical record.** This document describes the Supabase +
> Postgres RLS platform layer, which was replaced by Firebase Auth + MongoDB
> (see `docs/firebase-mongodb-setup.md`, `docs/backend-verification.md`,
> `docs/security.md`). Kept for audit history; its claims do not describe the
> current runtime.

# PR Review Map — Personalized Auth & Onboarding Platform

Purpose: make PR #5 reviewable. The PR is one 92-file / ~11.8k-line commit
(11837 insertions, 163 deletions) on `feature/personalized-auth-onboarding-platform`.
This map splits the diff into 8 logical review units, gives each unit concrete
review questions tied to the documented contracts (`docs/platform-contracts.md`),
and prescribes a review order. It exists because a single 11.8k-line commit is
otherwise hostile to review.

- Diff under review: `git diff ec2062fc6d9df8b40552fdb7a6d97f60892fd60b..HEAD`
- Base commit: `ec2062fc` (head of `feature/final-adaptive-loop-hardening`)
- Primary contract: `docs/platform-contracts.md` (route map, auth flow, data
  model + RLS, personalization mapping, sync contract, UI plan)
- Writing date: 2026-08-03

## How to use

1. Review units in the order below (security first, UI last).
2. For each unit, answer the listed questions against the diff. A "no" or
   "can't verify" is a review comment — file it per unit.
3. Check the gate table at the end; anything other than green is a merge
   blocker for that gate. Do not merge until all gates are green.
4. Verification commands are listed in the gate table section.

## Recommended review order

`A. Auth & RLS → B. Sync & persistence → C. Personalization & lab → D. Onboarding → E. Dashboard & settings → F. UI system (last)`

Units G (tests) and H (docs/config) are reviewed alongside their dependencies:
run G's checks as you finish each of A–E, and treat H as the final sanity pass.
Rationale: auth/RLS is the trust boundary; sync is the data-integrity boundary;
UI is the largest but lowest-risk surface — it gets the shallowest pass.

---

## Unit A — Auth & RLS (11 files, security-critical)

Files:
- `src/proxy.ts` — route protection (Next 16 `proxy.ts` convention)
- `src/app/auth/callback/route.ts` — OAuth code exchange + safe redirect
- `src/lib/supabase/auth.ts` — `isSafeRedirectPath`, `signInWithGoogle`, `signOut`
- `src/lib/supabase/browser-client.ts`, `config.ts`, `proxy-client.ts`,
  `server-client.ts`, `types.ts`, `use-session.ts`
- `supabase/migrations/20260803193000_platform_schema.sql` — 3 tables + RLS
- `supabase/tests/rls-isolation.sql` — SQL isolation suite

Review questions:

1. Open-redirect safety — `isSafeRedirectPath` must reject absolute URLs,
   `//evil.com`, `/\evil.com`, control-character injection (`/%09/evil.com`,
   `/%0a/evil.com`), and `javascript:`. Is the callback's `next` the ONLY
   user-influenced redirect input, and is `origin` always request-derived
   (never taken from a query param)? Cover each attack in your head against
   the code, then confirm `tests/lib/redirect-safety.test.ts` encodes them.
2. RLS completeness — all three tables (`profiles`, `learner_preferences`,
   `learning_sessions`) must have own-row policies on all four verbs with
   `to authenticated`, and UPDATE must carry BOTH `using` and `with check`
   `(select auth.uid()) = user_id` so `user_id` can never be reassigned. Are
   grants to `authenticated` only and anon explicitly revoked? Is
   `handle_new_user()` (SECURITY DEFINER, `set search_path = ''`, EXECUTE
   revoked from public/anon/authenticated) safe if triggered with hostile or
   oversized metadata?
3. Constraint drift — do the SQL CHECK constraints match the app's typed
   enums exactly: `learner_preferences` enums (goal ×3, representation ×5,
   explanation ×3, pace ×3, density ×3), `animation_speed` 0.25–2,
   `text_scale` 1–1.5, `topic_interests` ≤12 items / ≤500 chars total,
   `learning_sessions` `lab_slug in ('nuclear-chain-reaction')`, `status in
   ('active','complete')`, `title` 1–120 chars? Cross-check
   `src/lib/supabase/types.ts`, `src/personalization/onboarding-schema.ts`,
   and the migration — drift here is a runtime 500 from Supabase.
4. Graceful degradation — with env vars missing: proxy redirects to
   `/?auth=open`, browser/server clients return null, and the app renders in
   guest-only mode without throwing (hydration-safe). Verify the
   unconfigured paths in `signInWithGoogle`/`signOut`/`useSession`.
5. Cookie/token plumbing — `proxy-client.ts` and `server-client.ts` use the
   canonical cookie getAll/setAll swap; refreshed tokens must reach the
   browser. Is the `cookies().set` throw inside `setAll` (server component
   render) actually swallowed? PKCE flow uses `exchangeCodeForSession` (no
   hash-mode mismatch with Next)?
6. RLS suite conclusiveness — `supabase/tests/rls-isolation.sql` asserts via
   an admin observer (never the attacker's own visibility) and revokes helper
   EXECUTE from public. Were the placeholder user ids replaced with two REAL
   `auth.users` ids before the run? Without that, tests 5/6 (cross-user
   insert, user_id reassignment) are FK-dependent and less conclusive.

Verification status: unit/component-tested with mocks (callback, redirect
safety, auth helpers). RLS suite is SQL-only — runs against a real project or
`supabase start` stack, NOT RUN in this environment at writing time (see gate
table). Google OAuth smoke: NOT_RUN_EXTERNAL_CREDENTIALS.

## Unit B — Sync & persistence (5 files, data-integrity-critical)

Files:
- `src/sync/cloud-session-repository.ts` — Supabase-backed repository
- `src/sync/cloud-session-sync.ts` — deterministic conflict policy
- `src/sync/guest-session-import.ts` — consent-gated import state machine
- `src/sync/use-cloud-session-sync.ts` — debounced client hook
- `src/storage/session-storage.ts` — local session id lifecycle

Review questions:

1. Conflict policy (contract §5) — `save()` compares schema version first,
   then `newestEvidenceTime(evidence)`; the newer snapshot wins; a cloud row
   marked `complete` stays complete (reviewing an old session must not flip
   the dashboard back to "In progress"). Does anything overwrite a newer
   cloud copy or silently discard local unsynced evidence? Check both clock
   directions and the schema-version branch in
   `tests/lib/cloud-session-sync.test.ts`.
2. Idempotency — repository `upsert` keys on `onConflict: "id"` (stable
   session UUID): importing twice never duplicates, original evidence IDs
   retained verbatim. The repository must NEVER filter by user client-side —
   RLS is the only user filter; confirm `list`/`getById`/`deleteByIds` pass
   only the caller's `user_id` on writes.
3. Guest import consent — never auto-upload; local evidence is not deleted
   before cloud confirmation; dismissal is sessionStorage-scoped (per visit);
   the imported-flag is localStorage keyed by session id. Walk the state
   machine in `guest-session-import.ts` and its tests
   (`tests/lib/guest-session-import.test.ts`).
4. Session id lifecycle — `getLocalSessionId`/`rotateLocalSessionId`/
   `setLocalSessionId` in `session-storage.ts`: "Start over" rotates so a
   fresh session never overwrites a previously imported one; resume adopts a
   cloud id (format-validated); UUID regexp `^[0-9a-f-]{36}$` gates writes.
   Any path where two local sessions could share an id?
5. Race conditions — `useCloudSessionSync` gates saves on an
   evidence/workflow fingerprint (never per-frame), 800 ms debounce that must
   survive preference-only updates AND unmount, and `flush()` before
   "Start over"/complete. Can a pending debounced save race a completion,
   a sign-out, or a session-id rotation? Is there an upload-after-signout
   path (browser client holds no session after signOut, but verify the hook's
   `user` guard)?
6. Storage hygiene — all new localStorage/sessionStorage keys are
   namespaced (`unseenlab.*`) and every access is try/catch; evidence arrays
   must stay within what the JSONB object constraints tolerate.

Verification status: unit-tested against a MOCKED supabase client
(`tests/lib/*.test.ts`). No real-backend verification. Cross-device sync
behavior is untested end-to-end (pending gate).

## Unit C — Personalization & lab integration (5 files)

Files:
- `src/personalization/onboarding-schema.ts` — zod draft schema
- `src/personalization/profile-to-learner-preferences.ts` — canonical mapping
- `src/components/lab/experiment-shell.tsx` — +226 lines, personalization wiring
- `src/components/lab/representation-tabs.tsx` — +102 lines
- `src/app/lab/nuclear-chain-reaction/page.tsx` — AppHeader + lab stays public

Review questions:

1. Single conversion point (contract §4) — is
   `profileToLearnerPreferences` the ONLY profile→preferences mapping, and
   does UI never map enums itself? Grep the lab components for stray label
   maps or direct preference math that bypasses the canonical layer.
2. Bounded adaptation — `explanation_style` may affect copy and a BOUNDED
   adaptation context only (never equations/outcomes); `learning_pace` sets
   only the INITIAL animation speed (calm 0.5 / balanced 1 / quick 1.5) with
   explicit `animation_speed` overrides winning. Verify both in the
   experiment-shell diff and that `preferred_representation` initializes the
   representation tab + `preferredRepresentations`.
3. Clamping and fallback — invalid/missing rows fall back to
   `DEFAULT_LEARNER_PREFERENCES` (structuredClone); `animation_speed` and
   `text_scale` are clamped to domain constants; `topic_interests` bounded.
   Confirm the clamp bounds equal the SQL CHECK ranges.
4. Schema parity — onboarding-schema zod enums/ranges must equal
   `types.ts` + SQL CHECKs; a draft that passes zod but violates SQL is a
   500. Check min/max for textScale, topic count, and every enum list.
5. Lab regression — experiment-shell grew +226: with no profile (guest, no
   Supabase), behavior must be identical to the pre-PR hardened lab. Does
   adding AppHeader + `pt-[4.5rem]` to the lab page break small-viewport
   layout or the "lab is never guarded" guarantee?

Verification status: component tests only (wizard, dashboard), no live
backend. Personalization effects on the real lab are covered by seeded-mock
component tests, not an authenticated browser run.

## Unit D — Onboarding (2 files)

Files:
- `src/app/onboarding/page.tsx`
- `src/components/onboarding/onboarding-wizard.tsx` — 666 lines, largest new file

Review questions:

1. Flow contract — 4 steps (goal → style/pace → accessibility → interests)
   map through `draftToPreferencesRow` to the `learner_preferences` upsert;
   completion sets `onboarding_version` = `CURRENT_ONBOARDING_VERSION` and
   `onboarding_completed_at`; post-completion routing goes to `/dashboard`
   (callback gate: incomplete onboarding always wins over a `next` hint).
   Can a partially completed wizard leave a half-written preferences row?
2. Refresh/back behavior — is the draft preserved across a mid-wizard reload
   (client state, or lost with a graceful restart)? Back/next must not
   corrupt later steps' saved values.
3. Guest/unconfigured handling — `/onboarding` is proxy-protected; if
   Supabase is unconfigured the proxy redirects to `/?auth=open`; the page
   itself should not crash when there is no session (defensive).
4. Constraint-bounded inputs — the UI cannot submit values violating SQL
   CHECKs: topic_interests ≤12 / ≤500 chars total, textScale 1–1.5, enum
   fields from the fixed option sets only.
5. Accessibility — keyboard-operable end-to-end, focus managed per step,
   step indicator truthful on back-navigation, reduced-motion/high-contrast
   choices apply the lab's existing effects (not just stored). 632 lines of
   wizard tests should pin most of this — check what they do NOT cover.

Verification status: component-tested with seeded mocks; no live
backend/real-profile run.

## Unit E — Dashboard & settings (13 files)

Files:
- `src/app/dashboard/page.tsx`, `src/app/settings/page.tsx`
- `src/components/dashboard/{available-lab-card,continue-learning-card,greeting,preference-summary-card,recent-sessions,recommendation-card}.tsx`
- `src/components/settings/{accessibility-settings,learning-preferences-settings,privacy-settings,profile-settings,settings-tabs}.tsx`

Review questions:

1. Real-data-only rule — dashboard cards read from `profiles`,
   `learner_preferences`, `learning_sessions` (via repository); no fabricated
   stats or demo filler. Check empty/new-account states: skeleton, zero
   sessions, default preferences, and that `preference-summary-card` shows
   only preferences that actually change behavior.
2. Recommendation honesty — the recommendation card must be deterministic
   and clearly labeled (e.g., future-topic chips "labeled" per contract §4);
   it must respect `one_variable_mode` / `reduced_motion` if it proposes a
   trial or representation. No engagement-bait copy.
3. Settings persistence — each settings component upserts only own-row data
   (RLS) with payload parity to `draftToPreferencesRow`; optimistic update
   with error rollback; no write attempt when Supabase is unconfigured.
   `profile-settings` display_name/avatar must match SQL constraints
   (≤60 chars; avatar https:// or http://localhost only).
4. Privacy & data — `privacy-settings` deletes `learning_sessions` via
   `deleteByIds` (own rows only) behind explicit destructive confirmation;
   nothing in settings or dashboard ever lists another user's rows.
5. Cross-surface consistency — after a settings save, do dashboard cards and
   the lab reflect the same source (refetch or shared state)? Does
   `settings-tabs` keep tab state on save/navigation?

Verification status: component-tested with seeded mocks
(`tests/components/dashboard-page.test.tsx` 507 lines); no live backend.

## Unit F — UI system (29 files, review LAST)

Files:
- Primitives: `src/components/ui/{alert,avatar,badge,button,card,dialog,dropdown-menu,input,progress,select,separator,skeleton,sonner,spinner,switch,tabs}.tsx` + `topic-input-hero.tsx` (changed) + `mini-navbar.tsx` (deleted)
- App shell: `src/components/navigation/app-header.tsx`,
  `src/components/auth/{sign-in-dialog,user-menu}.tsx`
- Sync UI: `src/components/sync/{cloud-sync-status,guest-import-dialog,session-resume-dialog}.tsx`
- `src/app/globals.css`, `components.json`, `src/lib/utils.ts`,
  `src/app/layout.tsx` (Toaster), `src/app/page.tsx` (AppHeader)

Review questions:

1. Kit provenance & identity — ui/ primitives are official shadcn registry
   (base-nova style, per components.json): do they preserve the dark
   homepage identity and leave lab tokens untouched (contract §6)? The
   deleted `mini-navbar.tsx` was replaced by `app-header.tsx` — no dangling
   imports/`<MiniNavbar/>` call sites remain; `topic-input-hero`'s 13-line
   change must not alter the hero's guest behavior.
2. Interactive-component accessibility — dialog/dropdown-menu/select
   keyboard support, focus trap and restoration, aria labels on
   sign-in-dialog, user-menu, session-resume-dialog; reduced-motion respect.
   These are new to the codebase; spot-check with keyboard only.
3. Auth UI contract — `/?auth=open` opens the sign-in dialog (proxy redirect
   target); `/?auth=error` shows the failure state; "Continue with Google"
   is disabled/unreachable when Supabase is unconfigured (no requests sent).
4. Sync status truthfulness — `cloud-sync-status` renders exactly the four
   contract strings: "Saved" / "Saving…" / "Saved on this device" /
   "Couldn't sync — your work is safe on this device". `guest-import-dialog`
   and `session-resume-dialog` appear only under the consent rules (never
   auto-upload; per-visit dismissal).
5. Layout/theme integration — Toaster in root layout and AppHeader on
   homepage + lab must not change lab canvas interaction or z-index
   behavior; globals.css additions are additive (no token overrides).

Verification status: component tests for app-header, sign-in-dialog,
homepage, topic-input-hero; remaining primitives are visual/kit review.
Lowest risk — review last and shallowest.

## Unit G — Tests (17 files)

Files:
- `tests/app/{auth-callback,dashboard-page,onboarding-page}.test.ts(x)`
- `tests/components/{app-header,dashboard-page,homepage,onboarding-wizard,settings-page,sign-in-dialog,topic-input-hero}.test.tsx`
- `tests/lib/{cloud-session-sync,guest-session-import,redirect-safety}.test.ts`
- `tests/personalization/profile-to-learner-preferences.test.ts`
- `e2e/{auth-dialog,homepage,route-protection}.spec.ts` (changed in this PR)

Review questions:

1. Mock fidelity — sync tests mock the supabase client: do they simulate
   offline/error paths and assert the OUTCOME strings (saved/cloud_newer/
   offline), not merely no-throw?
2. Security-path coverage — `redirect-safety.test.ts` must encode `//evil.com`,
   `/\evil.com`, control-char injection, `javascript:`, absolute URLs;
   `auth-callback.test.ts` must assert the onboarding gate fires BEFORE any
   `next` destination hint.
3. E2E honesty — `route-protection.spec.ts` asserts signed-out redirects to
   `/?auth=open`; `auth-dialog.spec.ts` exercises the dialog WITHOUT real
   OAuth (mock) — is that limitation explicit in the spec? `homepage.spec.ts`
   changes must preserve the pre-PR guest flows.
4. Contract drift detection — tests encode the same enums/ranges as the SQL
   CHECKs (e.g., clamp bounds in `profile-to-learner-preferences.test.ts`,
   topic-interests limits in wizard tests). A future enum change that passes
   tests but fails SQL is a test gap — note it if you find one.
5. Counts — PR claims 302 unit + 25 e2e green. Re-run and confirm;
   cross-device sync e2e does NOT exist yet (pending gate).

## Unit H — Docs & config (10 files)

Files:
- `docs/{platform-contracts,platform-copy-spec,platform-ia,supabase-setup,test-plan-platform}.md`
- `.env.example`, `.gitignore`, `README.md`, `package.json`, `package-lock.json`

Review questions:

1. Env hygiene — `.env.example` documents only publishable names
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — never a service-role key — and
   matches `config.ts`'s fallback logic. `.gitignore`'s new lines cover
   `.env*` to prevent key leakage.
2. Dependency review — new runtime deps (`@supabase/ssr`, `@supabase/supabase-js`,
   `@base-ui/react`, `sonner`, `zod`, `class-variance-authority`, `clsx`,
   `tailwind-merge`, `lucide-react`, `next-themes`, `tw-animate-css`): any
   unused, any overlapping roles (cva+clsx+tailwind-merge is the standard
   shadcn set — confirm nothing redundant), versions pinned sensibly for a
   draft?
3. Docs-executable truth — `docs/supabase-setup.md` is the external gate
   checklist (migration push, RLS suite, advisors, Google console steps,
   redirect URIs): commands and file paths in it must match the repo.
   `docs/test-plan-platform.md` must match the actual test names/scripts.
4. Docs-drift — `platform-copy-spec.md` (390 lines) and `platform-ia.md`
   (309 lines) should match implemented copy and IA; the contract doc's base
   commit (`ec2062fc`) is the same as this PR's diff base — confirm.

---

## Gate status (honest flags, at writing: 2026-08-03)

| Gate | Status | How to verify |
|---|---|---|
| CI — Vercel deploy | PENDING (deploy in progress at writing) | `gh pr checks 5` |
| CI — Vercel Preview Comments | PASS | `gh pr checks 5` |
| Unit tests | 302 claimed green — mock-tested only for platform layer | `npm test` |
| e2e (Playwright, prod build :3100) | 25 claimed green — guest flows + route protection + auth dialog (no real OAuth) | `npm run test:e2e` |
| Lint + typecheck | claimed clean | `npm run lint && npm run typecheck` |
| RLS isolation suite (`supabase/tests/rls-isolation.sql`) | NOT RUN — no supabase CLI/stack present in this environment at writing; suite is runnable only against a real project or `supabase start` stack after applying the migration. **VERIFY CURRENT STATUS IN PR DESCRIPTION.** | `supabase db push` then `supabase db query -f supabase/tests/rls-isolation.sql`; for full conclusiveness substitute two real `auth.users` ids into user_a/user_b |
| Google OAuth smoke | NOT_RUN_EXTERNAL_CREDENTIALS — no credentials in this environment; exact checklist in `docs/supabase-setup.md` | follow `docs/supabase-setup.md` §2 |
| Cross-device sync e2e | PENDING — not authored; requires two authenticated sessions against a real project | n/a yet |

## Do-not-merge note

PR #5 is a DRAFT. Merge blockers: (1) RLS suite not run (or verify current
status in the PR description), (2) Google OAuth not smoke-tested, (3)
cross-device sync e2e missing, (4) Vercel deploy pending. The PR description
states "no merge requested; not for production." Additionally, GitHub's PR #5
currently lists base `main` while the intended base is
`feature/final-adaptive-loop-hardening` (diff base `ec2062fc`) — confirm the
target branch before merge so the GitHub diff matches this map.
