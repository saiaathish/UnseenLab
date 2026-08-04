# Platform Contracts — Personalized Auth & Onboarding Platform

Status: Phase 1 (contracts) — basis for implementation.
Branch: `feature/personalized-auth-onboarding-platform`
Base: `ec2062fc6d9df8b40552fdb7a6d97f60892fd60b` (hardened head)

## 1. Route map

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Topic-first hero + auth entry + app header |
| `/lab/nuclear-chain-reaction` | public (always) | Hardened adaptive lab + personalization + sync |
| `/auth/callback` | public (OAuth) | Exchange code for session; safe redirect |
| `/onboarding` | protected | 4-step onboarding wizard |
| `/dashboard` | protected | Personalized dashboard (real data only) |
| `/settings` | protected | Profile, preferences, accessibility, privacy & data |

Redirect policy: signed-out visitors to protected routes go to `/?auth=open`
(homepage with the auth dialog open). The lab is never guarded.

## 2. Auth flow (Supabase Auth + Google OAuth, PKCE)

1. `Continue with Google` → `signInWithOAuth({ provider: "google", options: { redirectTo: origin + "/auth/callback" } })`.
2. Callback route exchanges `code` via `exchangeCodeForSession`, then redirects to:
   - original safe destination (`next` query param, allowlisted to same-origin paths), else
   - `/onboarding` if `onboarding_version` < current, else
   - `/dashboard`.
3. `src/proxy.ts` (Next 16 convention; `middleware.ts` deprecated) refreshes the session on protected routes and redirects signed-out users.
4. Sign-out clears the Supabase session and account-specific state; local guest evidence is preserved.

Env config (names only, documented in `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` accepted as fallback). Missing config ⇒ app degrades to guest-only mode with graceful UI.

## 3. Data model (3 public tables)

- `profiles` — identity + onboarding state (`onboarding_version`, `onboarding_completed_at`). Trigger `handle_new_user()` copies display name/avatar on signup.
- `learner_preferences` — typed personalization (see mapping below). CHECK constraints match the exact supported enums/ranges.
- `learning_sessions` — cloud evidence/workflow snapshots for resume. Indexes `(user_id, updated_at desc)` and `(user_id, lab_slug, updated_at desc)`. JSONB objects only.

RLS: all three tables own-row only: `to authenticated using ((select auth.uid()) = user_id)`, `WITH CHECK` on INSERT/UPDATE. Grants to `authenticated` only; anon gets nothing. No `user_metadata` authorization. Isolation suite: `supabase/tests/rls-isolation.sql`.

## 4. Personalization mapping (canonical layer)

`src/personalization/profile-to-learner-preferences.ts` — single conversion point; UI never maps preferences itself.

| Onboarding field | LearnerPreferences effect (visible) |
|---|---|
| learning_goal | Dashboard guidance copy (real-state rules only) |
| preferred_representation | Initial representation tab + `preferredRepresentations` |
| explanation_style | Lab copy + bounded adaptation context; never equations/outcomes |
| learning_pace | Initial animation speed (calm 0.5 / balanced 1 / quick 1.5); explicit `animation_speed` overrides |
| information_density | `informationDensity` (helper text, panel density) |
| reduced_motion / high_contrast / text_scale / one_variable_mode | Direct preference application (existing shell effects) |
| topic_interests | Dashboard copy / future-topic chips (labeled) |

## 5. Sync contract (local-first)

- Local state remains source of truth during an active lab; cloud saves after meaningful events only (prediction created, trial completed, proposal accepted/rejected/modified, counterfactual, session cleared/complete). Never per-frame.
- Deterministic conflict policy: stable session UUID; same id ⇒ schema-version + `updated_at` comparison, newer wins, local unsynced copy preserved; different ids ⇒ both preserved.
- Guest import: consent dialog only; original evidence IDs retained; idempotent by session id (no duplicates); never auto-upload; dismissal remembered for the visit.
- Sync status: `Saved` / `Saving…` / `Saved on this device` / `Couldn't sync — your work is safe on this device`.

## 6. UI component plan (shadcn official registry)

Install only what surfaces need: button, card, avatar, dropdown-menu, dialog, progress, tabs, badge, skeleton, switch, input, select, separator, alert, sonner (toast). Shared app components under `src/components/{navigation,auth,onboarding,dashboard,settings,sync}/`. Dark homepage identity preserved; lab tokens untouched.

## 7. Testing strategy

- Vitest units: preference mapper, onboarding schema, sync repository (mocked supabase client), guest-import state machine, redirect allowlist, auth helpers (missing-config paths).
- Playwright e2e (production build, port 3100): guest flows preserved; route protection redirects; auth dialog UX; lab personalization; onboarding redirect. Signed-in UI covered by component tests with seeded mocks — real OAuth smoke deferred (`NOT_RUN_EXTERNAL_CREDENTIALS`).
- RLS: SQL isolation suite (external project). Security: secret scan, client-bundle inspection, npm audit.

## 8. Ownership matrix (single active writer per file)

- Supabase clients / auth / callback / proxy: platform branch (me).
- Migrations + RLS + tests: platform branch.
- Personalization + sync + lab integration: platform branch.
- Shared UI components + pages: platform branch.
No worktrees: parallel writers are the named read-only agents (exploration, red team, review). Peak honest concurrency will be reported in the final response.
