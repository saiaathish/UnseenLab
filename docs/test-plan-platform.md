# Test Plan — Personalized Auth & Onboarding Platform

Branch: `feature/personalized-auth-onboarding-platform`
Scope: auth (Supabase + Google OAuth + route protection), onboarding, personalization,
session sync, dashboard, and the accessibility/perf obligations of the platform.
Baseline today: 17 vitest files / 167 tests; 4 Playwright specs / 12 tests. This plan
adds ~13 vitest files and 4 new e2e specs, and modifies 1 e2e spec.

## 0. Environment truthfulness (read first)

This plan only proposes tests that can be **honestly executed** in this environment:

1. **No live Supabase project and no Google OAuth credentials exist here.** `.env` /
   `.env.local` contain only LLM keys and `VERCEL_OIDC_TOKEN`. `getSupabaseConfig()`
   returns `null` at build time, so the production build used by Playwright runs in
   guest-only mode (`isSupabaseConfigured() === false`).
2. **Playwright cannot intercept server-side calls.** `playwright.config.ts` starts
   `next start` as a separate process (`webServer.command: "npm run start -- -p 3100"`,
   `reuseExistingServer: false`). Playwright route interception only sees the browser's
   network; the Next.js server process makes its own `fetch()` to Supabase, which is
   invisible to the test. Signed-in UI cannot be exercised in a real browser here.
3. **The RLS isolation suite is SQL-only** (`supabase/tests/rls-isolation.sql`) and runs
   against a real database (`supabase db query -f ...` or the SQL editor, after applying
   `supabase/migrations/20260803193000_platform_schema.sql`). It is **not** runnable in
   vitest or Playwright and is planned as an external gate.

Consequences, stated plainly:

- Guest flows run **real** in e2e.
- Signed-in flows are covered by **vitest component/integration tests with mocked
  Supabase clients** (`vi.mock` of `@/lib/supabase/browser-client` / `server-client` /
  `proxy-client`). Mocks live only in vitest; they are never used to fake an e2e pass.
- Real Google OAuth round trips are marked **`NOT_RUN_EXTERNAL_CREDENTIALS`**: documented
  as a manual smoke procedure, never faked, never stubbed green.

### Automation status vocabulary

| Status | Meaning |
|---|---|
| `AUTOMATABLE` | Runs in this repo today (`npm test` or `npm run test:e2e`). |
| `SQL-EXTERNAL` | SQL suite that requires a live DB; executed outside vitest/Playwright. |
| `NOT_RUN_EXTERNAL_CREDENTIALS` | Requires live OAuth/API credentials; documented, never faked. |

### Conventions honored

- Vitest: `tests/**/*.test.{ts,tsx}` (config include), `globals: false` — every file
  imports `{ describe, expect, it, vi }` from `"vitest"`; jsdom; `tests/setup.ts` runs
  `afterEach(() => cleanup())`. Component tests use `@testing-library/react` +
  `@testing-library/user-event` and `vi.mock` heavy children (pattern established in
  `tests/components/homepage.test.tsx`).
- Env manipulation: `beforeEach`/`afterEach` + `vi.stubEnv`/`delete process.env[...]`
  (pattern from `tests/adaptation/provider-factory.test.ts`).
- Playwright: specs in `e2e/`, `getByRole`/`getByLabel`/`getByText` selectors, port 3100.
- Local storage keys use the existing `.v1` suffix convention
  (`src/storage/session-storage.ts`).
- Helper/fixture modules live in `tests/helpers/` — they carry no `.test.` suffix, so the
  vitest include glob never runs them as tests.

---

## 1. Test inventory mapped to the MANDATORY TESTS list

### A. Auth tests

| ID | Test | Approach | File to create | Key assertions | Mock strategy |
|---|---|---|---|---|---|
| A1 | `getSupabaseConfig` / `isSupabaseConfigured` | UNIT | `tests/lib/supabase-config.test.ts` | URL/key parsed and trimmed; legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` accepted as fallback; both null when env absent; `isSupabaseConfigured()` false when either missing | `vi.stubEnv` per case; restore in `afterEach` |
| A2 | `isSafeRedirectPath` allowlist | UNIT | `tests/lib/auth-helpers.test.ts` | Accepts `/dashboard`, `/onboarding`, `/settings/profile`, `/lab/nuclear-chain-reaction`; rejects `null`, `""`, `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:alert(1)`, `dashboard` (no slash), `" /onboarding"` (leading space) | none (pure) |
| A3 | `signInWithGoogle` missing-config and OAuth call | UNIT | `tests/lib/auth-helpers.test.ts` | Client `null` ⇒ returns `Error("Authentication is not configured yet.")`, never throws; configured ⇒ calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })` and returns `error \|\| null` | `vi.mock("@/lib/supabase/browser-client")` returning `null` or a stub client |
| A4 | `signOut` null-safe; preserves local guest evidence | UNIT | `tests/lib/auth-helpers.test.ts` | Client `null` ⇒ returns `null`; configured ⇒ `auth.signOut()` called; seeds `unseenlab.evidence.v1` first and asserts it is untouched after `signOut()` | mocked browser client + localStorage seeding |
| A5 | `src/proxy.ts` route protection | UNIT | `tests/lib/proxy.test.ts` | `/dashboard`, `/onboarding`, `/settings` and nested `/settings/profile` redirect to `/?auth=open` (307, `Location` header) when unconfigured or when `getUser` returns no user; pass-through (`NextResponse.next()`) when user present; `/lab/*` always pass-through | `new NextRequest("http://localhost:3100/dashboard")`; `vi.mock("@/lib/supabase/proxy-client")` for the signed-in branch. Caveat: `NextRequest` construction needs a `Request` global — available under vitest 4/node 20; if it proves flaky in jsdom, the same scenarios are re-covered by E2E (A9) and the unit is kept for the logic-only branches |
| A6 | `/auth/callback` — code exchange, safe-next, routing | UNIT | `tests/app/auth-callback.test.ts` | `GET` handler invoked with `new Request("http://localhost:3100/auth/callback?code=…&next=…")`. Safe `next` honored; unsafe `next` (`https://evil.com`, `//evil.com`, `javascript:`) ignored ⇒ profile routing; profile `onboarding_version` absent/0 ⇒ `/onboarding`; `>= CURRENT_ONBOARDING_VERSION` ⇒ `/dashboard`; exchange error or no `code` ⇒ `/?auth=error`; `createClient()` null ⇒ `/?auth=error` | `vi.mock("@/lib/supabase/server-client")`; mocked `auth.exchangeCodeForSession` + `from("profiles").select("onboarding_version").maybeSingle()` |
| A7 | Auth dialog component (entry, open/close, guest dismissal) | COMPONENT | `tests/components/auth-dialog.test.tsx` | Trigger opens `role="dialog"`; "Continue with Google" calls `signInWithGoogle`; when unconfigured the dialog shows a graceful inline message (no crash, no navigation); guest dismissal closes dialog and restores focus | `vi.mock("@/lib/supabase/browser-client")` with `getBrowserClient` → null and → stub; `userEvent` |
| A8 | Real Google OAuth round trip (sign-in → callback → session cookie → sign-out) | **`NOT_RUN_EXTERNAL_CREDENTIALS`** | manual checklist appended in this file (see §1.2) | Requires live OAuth + project. Covered instead by A5/A6 (redirect + exchange logic), A7 (dialog), and the signed-in component tests (B3, E1) | n/a — documented, not faked |

**A-not-automatable summary:** only A8. Its logic is split across A5/A6/A7/E1; the real
round trip is a documented manual smoke (step-by-step checklist in §1.2), not a stubbed
e2e.

### B. Onboarding tests

| ID | Test | Approach | File to create | Key assertions | Mock strategy |
|---|---|---|---|---|---|
| B1 | Onboarding schema (enums, draft, defaults) | UNIT | `tests/lib/onboarding-schema.test.ts` | `learningGoalSchema`/`explanationStyleSchema`/`learningPaceSchema` accept only the contract enums; `onboardingDraftSchema` bounds `step` 1–4, `textScale` 1–1.5, `topicInterests` ≤ 12 entries, each trimmed 1–40 chars; `emptyOnboardingDraft()` returns step 1 defaults; values match the migration's CHECK constraints (schema is the single source of truth) | none (pure zod) |
| B2 | Draft persistence and resume | UNIT + COMPONENT | `tests/lib/onboarding-schema.test.ts` + `tests/components/onboarding-wizard.test.tsx` | Seed `unseenlab.onboarding-draft.v1` with `step: 3` ⇒ wizard resumes at step 3; corrupt JSON / invalid draft ⇒ clean fallback to step 1 without throwing | localStorage seeding via `tests/helpers/fixtures.ts` |
| B3 | Wizard flow: 4 steps, validation, submit, version bump | COMPONENT | `tests/components/onboarding-wizard.test.tsx` | "Next" disabled until current step valid; "Back" preserves entered values; final submit calls `from("learner_preferences").upsert(...)` with the mapped values and updates `profiles.onboarding_version` to `CURRENT_ONBOARDING_VERSION` + `onboarding_completed_at`; completed wizard redirects to `/dashboard` | mocked browser client (`upsert`, `update`) + mocked `next/navigation` router |
| B4 | Version gating (no re-onboarding at v1) | UNIT | `tests/app/auth-callback.test.ts` (assertion in A6) | `onboarding_version === 1` ⇒ `/dashboard`; missing or `0` ⇒ `/onboarding` | as A6 |
| B5 | Signed-out onboarding redirect e2e | E2E | `e2e/onboarding-redirect.spec.ts` | `/onboarding` redirects to `/?auth=open` with the auth dialog open and focused; after guest dismissal the learner can reach the lab without auth | real server, unconfigured env (redirect is client-observable; works because `proxy.ts` short-circuits on `isSupabaseConfigured()`) |

**B-not-automatable:** none — every onboarding behavior that does not require a live
session is covered. "Completed onboarding → dashboard" in a real browser is impossible
here (no session); it is covered by B3/B4 with mocked clients, which is the honest
substitute.

### C. Personalization tests

| ID | Test | Approach | File to create | Key assertions | Mock strategy |
|---|---|---|---|---|---|
| C1 | Profile → learner-preferences mapper | UNIT | `tests/lib/profile-to-learner-preferences.test.ts` | Full mapping table from `docs/platform-contracts.md` §4: `learning_goal` → dashboard guidance copy; `preferred_representation` → initial representation tab; `explanation_style` → lab copy only (never equations/outcomes); `learning_pace` → animation speed (calm 0.5 / balanced 1 / quick 1.5) unless explicit `animation_speed` overrides; `information_density` → `informationDensity`; `reduced_motion` / `high_contrast` / `text_scale` / `one_variable_mode` → direct shell effects; `topic_interests` → dashboard chips. Contract states UI never maps preferences itself | none (pure). Note: authored against `src/personalization/profile-to-learner-preferences.ts` (planned per contract §4) |
| C2 | Lab applies local preferences | COMPONENT | `tests/components/lab-personalization.test.tsx` | Seed `unseenlab.preferences.v1` with `reducedMotion: true` ⇒ no canvas (static gradient); `textScale: 1.25` ⇒ root `font-size: 125%`; `highContrast: true` ⇒ contrast class applied; initial representation tab from `preferredRepresentations` | render `ExperimentShell` with seeded localStorage; existing shell is deterministic (seeded PRNG) |
| C3 | Lab personalization e2e (guest, real) | E2E | `e2e/lab-personalization.spec.ts` | Toggling "Reduced motion" removes the canvas and persists to `unseenlab.preferences.v1`; "Text size" change persists; reload restores both; no auth wall appears | real server; localStorage assertions via `page.evaluate` |

**C-not-automatable:** none — local personalization is fully guest-side.

### D. Session-sync tests

| ID | Test | Approach | File to create | Key assertions | Mock strategy |
|---|---|---|---|---|---|
| D1 | Meaningful-event saves only (never per-frame) | UNIT | `tests/lib/sync-repository.test.ts` | `upsert` is called only for: prediction created, trial completed, proposal accepted/rejected/modified, counterfactual, session cleared/complete; **zero** calls for slider drags, animation ticks, or representation tab switches. Drive one simulated trial run and assert the exact call count (≤ events, 0 per-frame) | mocked client; spy on `from("learning_sessions").upsert` |
| D2 | Conflict policy | UNIT | `tests/lib/sync-repository.test.ts` | Same session id ⇒ `schema_version` then `updated_at` comparison, newer wins, local unsynced copy preserved (returned, not overwritten); different ids ⇒ both preserved | mocked client returning seeded rows |
| D3 | Guest import state machine | UNIT | `tests/lib/guest-import.test.ts` | Consent dialog required before import; original evidence IDs retained; idempotent by session id (re-import of same id creates no duplicates); never auto-upload; dismissal remembered for the visit only (not persisted) | mocked client + `vi.useFakeTimers()` for visit-scoped memory |
| D4 | Sync status labels | COMPONENT | `tests/components/sync-status.test.tsx` | Renders exactly the four contract states: `Saved` / `Saving…` / `Saved on this device` / `Couldn't sync — your work is safe on this device`; unconfigured env resolves to "Saved on this device" | mocked browser client; state-driven render |
| D5 | Session id stability | UNIT | `tests/lib/sync-repository.test.ts` | `unseenlab.session-id.v1` generated once; reload (re-read) returns the same id; cleared on session complete | localStorage seeding + `crypto.randomUUID` |
| D6 | RLS isolation suite | **`SQL-EXTERNAL`** | `supabase/tests/rls-isolation.sql` (exists) | 10 blocks: anon cannot read; own-row read; cross-user read/update/insert/delete denied; `user_id` reassignment denied; own delete works; CHECK constraints reject invalid enums. Must print exactly the PASS lines, else the suite errors out | run against a real project DB or `supabase start` stack after the platform migration: `supabase db query -f supabase/tests/rls-isolation.sql` (CLI v2.79+) or SQL editor. **Not runnable in vitest/Playwright** — planned as an external release gate |
| D7 | Real-network sync latency/idempotency against live API | **`NOT_RUN_EXTERNAL_CREDENTIALS`** | manual checklist | Deferred until a live project exists; unit-level behavior is D1–D5 and perf guardrails are in §6 | n/a |

**D-not-automatable summary:** D6 (external by design), D7 (no credentials). Both are
covered by D1–D5 at the logic level and documented as external/manual gates.

### E. Dashboard tests

| ID | Test | Approach | File to create | Key assertions | Mock strategy |
|---|---|---|---|---|---|
| E1 | Dashboard renders real data only | COMPONENT | `tests/components/dashboard.test.tsx` | Seeded `getUser` + `profiles` + `learner_preferences` + `learning_sessions` ⇒ guidance copy derived from `learning_goal`; resume cards for `active` sessions; completed sessions shown as history; **no fabricated/sample data**: empty store ⇒ empty-state message ("no saved sessions"), not demo rows | mocked browser client via `tests/helpers/mock-supabase.ts` with seeded fixture rows |
| E2 | Dashboard signed-in gating | UNIT (logic) + COMPONENT | `tests/lib/proxy.test.ts` (A5) + `tests/components/dashboard.test.tsx` | No session (`getUser` null) ⇒ dashboard never renders; proxy redirects to `/?auth=open` | as A5 |
| E3 | Signed-in dashboard e2e | **`NOT_AUTOMATABLE_HERE`** | — | Impossible without a live session: Playwright cannot intercept the server's Supabase calls, and no project exists. Covered by E1/E2 component tests + the A9 redirect e2e (which proves signed-out users land on `/?auth=open`). Documented, not faked | n/a |

**E-not-automatable summary:** only E3 — explicit substitute: E1/E2 + A9.

### F. Accessibility tests

| ID | Test | Approach | File to create | Key assertions | Mock strategy |
|---|---|---|---|---|---|
| F1 | Keyboard-only auth dialog: focus trap, Escape, focus return | COMPONENT + E2E | `tests/components/auth-dialog.test.tsx` + `e2e/auth-dialog.spec.ts` | Tab cycles inside the dialog (trap); Shift+Tab wraps; Escape closes and returns focus to the trigger; Enter/Space activate "Continue with Google"; dialog has `role="dialog"` + accessible name | component: `userEvent.tab()` sequence; e2e: real browser |
| F2 | Keyboard-only onboarding (all 4 steps, no pointer) | COMPONENT | `tests/components/onboarding-wizard.test.tsx` | Full keyboard path step 1→4; focus lands on the first control of each step; validation errors are announced when "Next" is impossible | `userEvent` keyboard only |
| F3 | Keyboard-only dashboard | COMPONENT | `tests/components/dashboard.test.tsx` | Nav and resume cards reachable in order; no focus dead-ends; skip-to-content link present | `userEvent.tab` over seeded render |
| F4 | Reduced motion | COMPONENT + E2E | `tests/components/lab-personalization.test.tsx` + `e2e/lab-personalization.spec.ts` (+ existing `homepage.spec.ts` reduced-motion block) | No WebGL canvas under reduced motion; static gradient; preference honored from localStorage and from the OS hint (`contextOptions: { reducedMotion: "reduce" }`) | n/a |
| F5 | Text scale (max 150% via `textScale`; 200% browser zoom) | COMPONENT + E2E | `tests/components/lab-personalization.test.tsx` + `e2e/lab-personalization.spec.ts` | `textScale: 1.5` ⇒ root `font-size: 150%`, no horizontal overflow; 200% zoom approximated by halving viewport width (see matrix §5) | component: fontSize assertion; e2e: viewport |
| F6 | 320px viewport | E2E | `e2e/route-protection.spec.ts`, `e2e/auth-dialog.spec.ts` (plus existing `homepage.spec.ts` 320px block) | Dialog and onboarding redirect page fit 320px without horizontal overflow; controls remain tappable | `test.use({ viewport: { width: 320, height: 568 } })` |
| F7 | Focus visible + focus order (dialog → onboarding → dashboard) | COMPONENT | F1/F2/F3 files | `:focus-visible` retained on every interactive element; document order = visual order | `userEvent` + style assertions where meaningful |

**F-not-automatable:** none — the full matrix is either component-level or real-browser
guest e2e (see §5 for the matrix itself).

### 1.1 Coverage substitution map (not-automatable → substitute)

| Cannot be automated here | Honest substitute in this plan |
|---|---|
| Real Google OAuth round trip (A8) | A5/A6 unit tests of redirect + exchange logic; A7 dialog component; manual smoke checklist (§1.2) |
| RLS isolation against a real DB (D6) | `SQL-EXTERNAL`: `supabase/tests/rls-isolation.sql` run outside vitest/Playwright; release gate |
| Live-API sync latency/idempotency (D7) | D1–D5 unit tests + perf guardrails (§6); deferred checklist |
| Signed-in dashboard/onboarding/settings in a real browser (E3) | E1/E2 component tests with seeded mocks; A9 e2e proves the signed-out redirect contract |

### 1.2 Manual smoke checklist (NOT_RUN_EXTERNAL_CREDENTIALS)

Run only when a live Supabase project and Google OAuth credentials exist (project-linked
`supabase` CLI, env keys in `.env`/`.env.local`, fresh build). Record results in the
platform PR description; do not convert to an automated test that mocks the exchange.

1. Homepage → "Continue with Google" → Google consent → redirect to `/auth/callback`.
2. Callback exchanges code; first sign-in with no profile → lands on `/onboarding`.
3. Complete 4-step wizard → lands on `/dashboard`; `profiles.onboarding_version` = 1.
4. Sign out → protected route redirects to `/?auth=open`; local lab evidence intact.
5. Sign in again → skips onboarding (v1) → `/dashboard`.
6. `next=https://evil.com` callback attempt → ignored, lands on profile-based route.

---

## 2. Mock strategy spec

### 2.1 Mocked browser Supabase client (`tests/helpers/mock-supabase.ts`)

Single factory consumed by every component test; never imported by e2e. Shape mirrors
`createBrowserClient<Database>()` from `src/lib/supabase/browser-client.ts`:

```ts
export function createMockSupabase(overrides?: Partial<SupabaseLike>): SupabaseLike {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn((_cb) => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithOAuth: vi.fn(async ({ provider, options }) => ({ provider, options, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: (table: string) => {
      const builders: Record<string, QueryBuilderLike> = {
        profiles: {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })), single: vi.fn(), order: vi.fn() })) })),
          upsert: vi.fn(async () => ({ error: null })),
          insert: vi.fn(async () => ({ error: null })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        },
        // learner_preferences and learning_sessions: same chain, per-table
        // defaults seeded from tests/helpers/fixtures.ts via `seed` helper.
      };
      return builders[table];
    },
    ...overrides,
  };
}
```

Contract for the chain: `from(t).select(cols).eq(col, val).maybeSingle()`,
`from(t).select(cols).eq(col, val).order(col, { ascending })`, `from(t).upsert(row)`,
`from(t).update(row).eq(col, val)`, `from(t).delete().eq(col, val)`. Every call returns
`{ data, error }` so tests can assert on the `error` branch (e.g., "Couldn't sync").

### 2.2 Mocked server client (callback/proxy tests)

`vi.mock("@/lib/supabase/server-client", () => ({ createClient: vi.fn(async () => mockOrNull) }))`
with `mockOrNull` exposing `auth.exchangeCodeForSession`, `auth.getUser`, and the same
`from()` chain. `vi.mock("@/lib/supabase/proxy-client", ...)` likewise for A5.

### 2.3 The one-liner mock that most components use

```ts
vi.mock("@/lib/supabase/browser-client", () => ({
  getBrowserClient: () => mockSupabase, // module-scoped factory result
}));
```

### 2.4 localStorage seeding keys (existing + new)

| Key | Shape | Owner |
|---|---|---|
| `unseenlab.preferences.v1` | `LearnerPreferences` (`src/domain/learner.ts`) | lab shell (exists) |
| `unseenlab.evidence.v1` | `SessionEvidence` (zod-validated) | lab shell (exists) |
| `unseenlab.workflow.v1` | `{ pendingPrediction: PendingPrediction \| null }` | lab shell (exists) |
| `unseenlab.session-id.v1` | **new** — stable session UUID string | sync repository (platform) |
| `unseenlab.onboarding-draft.v1` | **new** — `OnboardingDraft` (`src/personalization/onboarding-schema.ts`) | onboarding wizard (platform) |

Seeding helper `seedLocalStorage({ preferences?, evidence?, workflow?, sessionId?,
onboardingDraft? })` in `tests/helpers/fixtures.ts`; `localStorage.clear()` in each
`beforeEach`. Note: the two new keys have no reader in `src/storage/session-storage.ts`
yet — the platform branch adds the sync repository and wizard that own them; the plan's
fixtures define their canonical shapes now so those readers have a test oracle.

---

## 3. Fixture factories (`tests/helpers/fixtures.ts`)

All factories typed against `src/lib/supabase/types.ts` (hand-written `Database` types)
and the domain types; values always satisfy the migration CHECK constraints.

```ts
export function profileFixture(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: "user-platform-a",
    display_name: "Ada",
    avatar_url: null,
    onboarding_version: CURRENT_ONBOARDING_VERSION,   // 1
    onboarding_completed_at: "2026-08-03T10:00:00.000Z",
    created_at: "2026-08-03T09:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

export function learnerPreferencesFixture(
  overrides: Partial<LearnerPreferencesRow> = {},
): LearnerPreferencesRow {
  return {
    user_id: "user-platform-a",
    learning_goal: "understand_concept",      // enum must match CHECK
    preferred_representation: "animation",
    explanation_style: "step_by_step",
    learning_pace: "balanced",
    animation_speed: 1,                       // calm 0.5 / balanced 1 / quick 1.5
    information_density: "medium",
    reduced_motion: false,
    high_contrast: false,
    text_scale: 1,                            // [1, 1.5]
    one_variable_mode: true,
    topic_interests: [],
    schema_version: 1,
    created_at: "2026-08-03T10:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

export function learningSessionFixture(
  status: LearningSessionStatus,
  overrides: Partial<LearningSessionRow> = {},
): LearningSessionRow {
  const completedAt = status === "complete" ? "2026-08-03T11:00:00.000Z" : null;
  return {
    id: crypto.randomUUID(),
    user_id: "user-platform-a",
    lab_slug: "nuclear-chain-reaction",
    status,
    title: status === "active" ? "Chain reaction, absorber withdrawn" : "Chain reaction basics",
    schema_version: 1,
    evidence: { predictions: [], trials: [], adaptationProposals: [], counterfactuals: [] },
    workflow: { pendingPrediction: null },
    created_at: "2026-08-03T09:30:00.000Z",
    updated_at: status === "active" ? "2026-08-03T10:30:00.000Z" : "2026-08-03T11:00:00.000Z",
    completed_at: completedAt,
    ...overrides,
  };
}

// Local (guest) session with exactly 2 trials, for lab, sync, and persistence tests.
// Trials come from the real seeded simulation so snapshots are always valid:
//   runSimulation({ absorberPosition: 0.05, ..., seed: 42 }).trial
export function localSessionFixture(): LocalSession {
  return {
    preferences: { ...createDefaultPreferences(), preferredRepresentations: ["graph"] },
    evidence: {
      predictions: [
        { id: "prediction-1", trialId: "trial-1", prompt: "…", answer: "It gets slightly faster",
          structuredAnswer: "slightly_faster", confidence: 3, createdAt: "…" },
        { id: "prediction-2", trialId: "trial-2", prompt: "…", answer: "It grows much faster than before",
          structuredAnswer: "much_faster_nonlinear", confidence: 4, createdAt: "…" },
      ],
      trials: [
        { id: "trial-1", parameters: { ...DEFAULT_EXPERIMENT_PARAMETERS, absorberPosition: 0.05 },
          snapshots: runSimulation({ ...DEFAULT_EXPERIMENT_PARAMETERS, absorberPosition: 0.05, seed: 42 }).trial.snapshots,
          changedVariables: [], startedAt: "…", completedAt: "…" },
        { id: "trial-2", parameters: { ...DEFAULT_EXPERIMENT_PARAMETERS, materialDensity: 0.4 },
          snapshots: runSimulation({ ...DEFAULT_EXPERIMENT_PARAMETERS, materialDensity: 0.4, seed: 42 }).trial.snapshots,
          changedVariables: ["materialDensity"], startedAt: "…", completedAt: "…" },
      ],
      representationEvents: [{ mode: "graph", openedAt: "…" }],
      adaptationProposals: [{ id: "prop-1", type: "compare_trials", reason: "…", evidenceIds: ["trial-1"],
        proposedChanges: {}, decision: "accepted", createdAt: "…", decidedAt: "…", source: "rules" }],
      conceptEvidence: [],
      counterfactuals: [],
    },
    workflow: { pendingPrediction: null },
  };
}
```

`createMockSupabase()` in `tests/helpers/mock-supabase.ts` accepts
`seedLocalStorage(...)` data and wires `maybeSingle`/`upsert` returns from it, so
component tests express intent as data, not as call-by-call stubbing.

---

## 4. e2e updates

### 4.1 Modified spec: `e2e/homepage.spec.ts`

**Replace** the final test `"homepage has no login or signup controls"` — the platform
adds an auth entry point to the homepage, so asserting zero auth controls is now wrong.
Keep every other test untouched (guest flow regression is implicit in them).

```ts
test("homepage auth entry opens the dialog; guest path stays auth-free", async ({ page }) => {
  await page.goto("/");
  // No login/signup *pages or links* — the only auth surface is the dialog trigger.
  await expect(page.getByRole("link", { name: /log ?in|sign ?up|continue with google/i })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const trigger = page.getByRole("button", { name: /continue with google|sign in/i }).first();
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /continue with google/i }),
  ).toBeVisible();

  // Guest dismissal keeps the flow working with no auth wall.
  await page.getByRole("button", { name: /explore without an account|not now/i }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Describe the topic you need help with").fill("nuclear chain reaction");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Start this lab" }).first()).toBeVisible();
});
```

### 4.2 New spec: `e2e/route-protection.spec.ts`

Runs real: with no Supabase config baked into the build, `proxy.ts` short-circuits on
`isSupabaseConfigured()` and redirects — no session needed, no interception required.

| Scenario | Steps / selectors | Assertion |
|---|---|---|
| `/dashboard` redirects signed-out users | `page.goto("/dashboard")` | `waitForURL(/\?auth=open/)`; `getByRole("dialog")` visible; heading `getByRole("heading", { name: /continue with google/i })` visible |
| `/onboarding` redirects signed-out users | `page.goto("/onboarding")` | same URL + dialog assertions |
| `/settings` and nested paths redirect | `page.goto("/settings")`, `page.goto("/settings/profile")` | both → `/\?auth=open/` |
| `/?auth=open` opens the dialog on load | `page.goto("/?auth=open")` | dialog visible on first paint (deep-link contract for the redirect target) |
| Lab stays public | `page.goto("/lab/nuclear-chain-reaction")` | URL unchanged, `getByRole("dialog")` count 0, lab heading visible |
| Guest flow regression after redirect dismissal | dismiss dialog → homepage topic flow → `Start this lab` | no dialog on the lab page; prediction radio `getByRole("radio", { name: /gets slightly faster/i })` visible |

### 4.3 New spec: `e2e/auth-dialog.spec.ts`

| Scenario | Steps / selectors | Assertion |
|---|---|---|
| Keyboard-only: focus moves into dialog, Trap, Escape restores focus | trigger → Tab → first dialog control focused; Tab×N never leaves dialog; `Escape` | `toBeFocused()` on trigger after Escape; dialog closed |
| `Continue with Google` while unconfigured degrades gracefully | click `getByRole("button", { name: /continue with google/i })` | no navigation, dialog stays open, inline status text visible (copy per implementation, e.g. `getByText(/not configured|sign-in is unavailable/i)`), no unhandled error |
| Guest dismissal closes dialog and restores focus | `getByRole("button", { name: /explore without an account|not now/i })` | dialog count 0; focus returns to trigger |
| 320px: dialog fits without horizontal overflow | `test.use({ viewport: { width: 320, height: 568 } })` | `scrollWidth <= clientWidth + 1` (pattern from `homepage.spec.ts`) |
| Reduced-motion dialog | `test.use({ contextOptions: { reducedMotion: "reduce" } })` | dialog usable, focus trap intact |

### 4.4 New spec: `e2e/onboarding-redirect.spec.ts`

| Scenario | Steps / selectors | Assertion |
|---|---|---|
| Signed-out `/onboarding` → `/?auth=open` with dialog focused | `page.goto("/onboarding")` | `waitForURL(/\?auth=open/)`; first focusable dialog control `toBeFocused()` |
| After dismissal, guest can reach the lab | dismiss → `page.goto("/lab/nuclear-chain-reaction")` | no dialog, lab renders |

Note: "completed onboarding → `/dashboard`" is **not** e2e-able here (needs a session);
it is covered by B3/B4 component/unit tests with mocked clients — no fake login in e2e.

### 4.5 New spec: `e2e/lab-personalization.spec.ts`

| Scenario | Steps / selectors | Assertion |
|---|---|---|
| Reduced motion toggle persists and re-applies | lab → `getByRole("button", { name: /accessibility|display settings/i })` → `getByRole("switch", { name: "Reduced motion" })` | canvas count 0; `page.evaluate` on `unseenlab.preferences.v1` ⇒ `reducedMotion: true`; reload ⇒ still 0 canvas |
| Text size persists across reload | `getByLabelText("Text size")` → 1.25 | `unseenlab.preferences.v1.textScale === 1.25`; reload keeps slider value |
| Guest sync status shows device-only save | after a trial completes | status text "Saved on this device" visible (no cloud path exists in this build) |
| No per-frame writes in the browser | `page.on("request")` counter during a trial run | no `/api/*` sync requests fired per frame (see §6) |

### 4.6 Unchanged specs

`e2e/smoke.spec.ts`, `e2e/keyboard.spec.ts`, `e2e/multi-trial.spec.ts` stay untouched —
they are the guest-flow regression net and must keep passing on the platform branch.

---

## 5. Accessibility test matrix

Method key: C = vitest component, E = Playwright e2e, both = C + E.

| Dimension | Auth dialog | Onboarding | Dashboard | Lab (guest) | Homepage |
|---|---|---|---|---|---|
| Keyboard-only (tab order, no pointer) | both — F1 | C — F2 | C — F3 | E (existing `keyboard.spec.ts`) | E (existing keyboard test) |
| Focus trap (Tab/Shift+Tab containment) | both — F1 | C — F2 (per-step focus) | C — F3 | n/a (no modal shell) | n/a |
| Escape closes + focus restore | both — F1 | C — F2 | n/a | E (existing replay-Escape test) | E |
| Reduced motion | E (context option) | C | C | both — F4 | E (existing block) |
| Text scale (150% max control / 200% browser zoom) | C | C | C | both — F5 | E |
| 320px viewport, no horizontal overflow | E — F6 | C (min-width layout) | C | E (existing 320px home test) | E (existing) |
| 200% zoom (approximated) | E (viewport 320 + overflow check) | C | C | E | E |
| Focus visible (`:focus-visible` retained) | C — F7 | C — F7 | C — F7 | E (existing keyboard) | E |
| Dialog accessible name (`role="dialog"` + labelled heading) | both — F1 | n/a | n/a | n/a | E |

Zoom honesty note: true browser 200% zoom is not scriptable via Playwright's public API;
the matrix uses the accepted approximation — halve the viewport width (320px at 100%
≈ 200% zoom layout conditions) plus assert no horizontal overflow. Real 200% zoom
verification is part of the manual smoke checklist (§1.2) once credentials/project exist.

Pass criteria: every surface reachable and operable keyboard-only; focus never escapes a
modal; Escape always closes a modal and restores focus; no horizontal overflow at any
listed width; reduced-motion surfaces render without WebGL canvas.

---

## 6. Performance checks

| Check | Method / file | Threshold | Notes |
|---|---|---|---|
| No per-frame cloud writes | UNIT — `tests/lib/sync-repository.test.ts` (D1) | `upsert` call count == number of meaningful events; 0 calls during parameter drags/ticks | The core contract: cloud saves only after meaningful events (prediction, trial complete, proposal decision, counterfactual, session cleared/complete) |
| Per-trial request ceiling in the browser | E2E — extend `e2e/multi-trial.spec.ts` assertion style into `e2e/lab-personalization.spec.ts` (`page.on("request")` counter) | ≤ 1 `/api/adapt` per trial (existing spec); 0 cloud-sync requests per trial in guest build | Existing multi-trial spec already proves ≤1 adapt request; add a sync counter for the guest build |
| Save p50/max (local persistence) | UNIT — `tests/lib/sync-repository.test.ts`: 100 iterations of `saveLocalSession` + mocked `upsert`, timed with `performance.now()` | p50 < 5 ms, p95 < 25 ms | **Guardrail, not a benchmark** — jsdom timing is noisy; failures above budget trigger a review, not a hard gate. Real-network budget deferred (D7) |
| Sync status latency labels | COMPONENT — `tests/components/sync-status.test.tsx` (D4) | "Saving…" shown while an in-flight save is pending; terminal state within one microtask flush | Assert the transient state renders (contract §5 labels) |

Deferred (needs live project): network save latency p50/max, retry/backoff behavior,
idempotent import under real races — all captured as `NOT_RUN_EXTERNAL_CREDENTIALS`
checklist items in §1.2, never asserted against a mock pretending to be the network.

---

## 7. Execution summary

New vitest files (13): `tests/lib/supabase-config.test.ts`, `tests/lib/auth-helpers.test.ts`,
`tests/lib/proxy.test.ts`, `tests/app/auth-callback.test.ts`, `tests/lib/onboarding-schema.test.ts`,
`tests/lib/profile-to-learner-preferences.test.ts`, `tests/lib/sync-repository.test.ts`,
`tests/lib/guest-import.test.ts`, `tests/components/auth-dialog.test.tsx`,
`tests/components/onboarding-wizard.test.tsx`, `tests/components/dashboard.test.tsx`,
`tests/components/lab-personalization.test.tsx`, `tests/components/sync-status.test.tsx`.
Helpers (not tests): `tests/helpers/fixtures.ts`, `tests/helpers/mock-supabase.ts`.

New e2e specs (4): `e2e/route-protection.spec.ts`, `e2e/auth-dialog.spec.ts`,
`e2e/onboarding-redirect.spec.ts`, `e2e/lab-personalization.spec.ts`.
Modified e2e (1): `e2e/homepage.spec.ts` (login/signup assertion → auth-entry + guest
path). Unchanged: `smoke`, `keyboard`, `multi-trial`.

External gates: `supabase/tests/rls-isolation.sql` (SQL-EXTERNAL); manual OAuth smoke
(NOT_RUN_EXTERNAL_CREDENTIALS). Nothing in this plan is faked: tests either run real
(guest paths), mock only inside vitest, or are documented as external.
