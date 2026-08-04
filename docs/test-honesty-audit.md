# Test Honesty Audit — Platform Tests (TST-01)

Auditor: TST-01 (test-honesty). Read-only audit; nothing was modified.
Basis: `docs/test-plan-platform.md`, all platform test files, the production code
they exercise, and the e2e specs. The question asked: **do the passing tests give
false confidence** — do they pass while production behavior is broken, or assert
something the code does not actually do?

## 0. Suite run (2026-08-03)

- `npm test` (vitest run, jsdom): **31 files / 311 tests, all passing** (49 s).
- `test-results/.last-run.json`: Playwright status `passed`, `failedTests: []`.
  Caveat: the last run includes `e2e/cross-device-resume.spec.ts`, whose 6 tests
  are **all skipped** unless `CROSS_DEVICE_E2E=1` (see §3). "Passed" therefore
  includes 6 silently-skipped tests.
- No `it.skip`/`describe.skip`/`test.todo` anywhere in `tests/`; the e2e skip is
  env-gated and documented.

## 1. Plan vs. reality (the 302 number does not cover the boundaries)

Every one of the 13 vitest files promised in the plan was created under a
**different name**, and the two planned helpers never materialized:

| Plan promised | Reality |
|---|---|
| `tests/lib/supabase-config.test.ts` (A1) | **missing** — config read never unit-tested |
| `tests/lib/auth-helpers.test.ts` (A3/A4) | **missing** — real `signInWithGoogle`/`signOut` configured branches never unit-tested |
| `tests/lib/proxy.test.ts` (A5) | **missing** — `src/proxy.ts` has zero unit tests; only the unconfigured short-circuit is covered by e2e |
| `tests/lib/onboarding-schema.test.ts` (B1) | **missing** — schema bounds only exercised implicitly through the wizard |
| `tests/lib/sync-repository.test.ts` (D1/D2/D5) | replaced by `tests/lib/cloud-session-sync.test.ts` (12 tests) |
| `tests/lib/guest-import.test.ts` (D3) | replaced by `tests/lib/guest-session-import.test.ts` (6 tests) |
| `tests/components/sync-status.test.tsx` (D4) | **missing** — `CloudSyncStatus` has zero tests |
| `tests/components/dashboard.test.tsx` (E1/E2) | replaced by `tests/app/dashboard-page.test.tsx` + `tests/components/dashboard-page.test.tsx` |
| `tests/components/lab-personalization.test.tsx` (C2/F4/F5) | **missing** — replaced by 3-test `accessibility-controls.test.tsx` (renders controls only; no reduced-motion canvas / font-size assertions) |
| `tests/helpers/mock-supabase.ts`, `tests/helpers/fixtures.ts` | **missing** — each test file hand-rolls its own mock |
| e2e `onboarding-redirect.spec.ts`, `lab-personalization.spec.ts` | **missing**; instead `e2e/cross-device-resume.spec.ts` (env-gated) was added |

The critique is accurate: the boundary states (sync status labels, resume-with-
completed, import-already-imported at UI level, cloud_newer rendering) are exactly
the parts of the platform with **no** test coverage.

## 2. Per-file verdict table

Scope: the platform test files named in the audit request. Verdicts:
HONEST = assertions would fail if the exercised production code regressed;
WEAK = asserts something but with a hole that can hide a real regression;
FALSE-CONFIDENCE = assertion passes regardless of the production behavior it claims to verify.

| File (tests) | Verdict | Evidence |
|---|---|---|
| `tests/lib/redirect-safety.test.ts` (15) | **HONEST** | Pure-function adversarial tests of the real `isSafeRedirectPath`: absolute/protocol-relative URLs, backslash, `javascript:`, control-char injection (`"/\t/evil.example"`), encoded separators, and the same-origin acceptance cases. Assertions are behavior, not mocks. |
| `tests/lib/cloud-session-sync.test.ts` (12) | **WEAK → FALSE-CONFIDENCE** for ordering/limit/onConflict | Conflict outcomes (`saved`, `cloud_newer_kept`, `cloud_schema_newer_kept`, `offline`) are genuinely exercised against a stateful mock — honest. But: (a) "lists newest first" passes by insertion order with identical timestamps and an unsorted mock; (b) `{ onConflict: "id" }` is never asserted; (c) `markComplete` asserts only that *some* `update` happened; (d) `getIncompleteForLab` is untested and the mock cannot even express its chain. Details in §4.1–4.2. |
| `tests/lib/guest-session-import.test.ts` (6) | **HONEST** | Real state machine (`importGuestSession`/`isSessionImported`/`dismissImportForVisit`) against a minimal honest repo stub; asserts idempotency, evidence-id preservation, visit-scoped dismissal, `nothing_to_import`, and `offline` retryability. |
| `tests/personalization/profile-to-learner-preferences.test.ts` (9) | **HONEST** | Pure mapping tests: representation→tab, pace→speed, explicit `animation_speed` override, clamps (`animation_speed: 9 → 2`, `text_scale: 4 → 1.5`), "never changes unsupported fields", summary labels. |
| `tests/app/auth-callback.test.ts` (8) | **WEAK** | Exchange/no-code/version-gating assertions are real (mocked client shape matches production exactly: `from("profiles").select("onboarding_version").maybeSingle()`). Two holes: the unsafe-`next` test asserts only the negative (would pass if unsafe `next` users were wrongly routed to `/?auth=error`), and the `createClient() → null` branch the plan's A6 explicitly promised is not tested. §4.3. |
| `tests/app/onboarding-page.test.tsx` (6) | **HONEST** | Real server component invoked directly; `NEXT_REDIRECT` throw sentinel makes redirect targets real assertions; real `useSession` over a mocked browser client; version gate, `?rerun=1`, unconfigured and signed-out branches all covered. |
| `tests/app/dashboard-page.test.tsx` (10) | **WEAK** | `resolveSession`/`loadDashboardData` gating, error, and redirect branches are genuinely asserted. But "loads … the ten most recent sessions" never asserts `order("updated_at", { ascending: false })` or `limit(10)`; the mock ignores both and returns the array as-is, so removing/reversing the order or changing the limit passes. §4.4. |
| `tests/components/sign-in-dialog.test.tsx` (9) | **WEAK** | Real component, real `isSafeRedirectPath` (kept via `importOriginal`). But `signInWithGoogle` is module-mocked and 3 tests assert **mock call signatures** (`mockSignInWithGoogle.mock.calls[0][0]` URL) rather than behavior; the real function's configured branch is never run in the unit suite (only in the guest-build e2e, null-client path). `useSession` is stubbed `{ user: null, … }`, so the signed-in auto-close effect (`router.replace("/")`) is untested. |
| `tests/components/sign-out-dialog.test.tsx` (5) | **HONEST** | Real dialog with real `clearLocalSession`/`rotateLocalSessionId` against real localStorage: the **clear path with evidence present** is covered — seeds all five keys, asserts all cleared and the session id rotated (`expect(localStorage.getItem(SESSION_ID_KEY)).not.toBe(SEEDED_SESSION_ID)`); keep path asserts evidence intact; Cancel/Escape assert no sign-out. |
| `tests/components/user-menu.test.tsx` (4) | **HONEST** | Real `UserMenu` + real `SignOutDialog` wiring; asserts menu opens the choice dialog (no direct sign-out), keep-path signs out and navigates home, Settings navigates. |
| `tests/components/app-header.test.tsx` (5) | **HONEST** | Real `AppHeader` with injectable session state; signed-out vs signed-in nav, avatar label, dialog open wiring, dialog closed by default. |
| `tests/components/onboarding-wizard.test.tsx` (17) | **HONEST** | Real wizard; mock throws on unexpected tables (strict); asserts exact `upsert` payloads (`{...draftToPreferencesRow(draft), user_id}`), `update` payload with `onboarding_version` bump + `eq("user_id", …)`, draft persist/resume/corrupt fallback, save-error Retry, client-unavailable local completion, keyboard-only full path, 320px scan, forbidden-language scan. The strongest platform file. |
| `tests/components/dashboard-page.test.tsx` (27) | **HONEST** | Real dashboard components with seeded rows; empty states asserted (no fabricated data); recommendation rules R1–R6; query failure → `{ kind: "error" }`. |
| `tests/components/settings-page.test.tsx` (10) | **HONEST** | Real `SettingsTabs`; mocked browser client chain matches production exactly (`upsert` without options — matches `learning-preferences-settings.tsx`; `update().eq`; `delete().eq`; `select().order`; `select().maybeSingle`). Export blob URL, delete confirm/cancel paths, clear-local, sign-out through the dialog all asserted with payload checks. |

### E2E verdicts

| Spec | Verdict | Evidence |
|---|---|---|
| `e2e/route-protection.spec.ts` (5) | **HONEST** | Real guest build (`isSupabaseConfigured()` false — `.env` has no Supabase keys, verified); `waitForURL(/\?auth=open/)`, dialog assertions, lab-stays-public, dismissal → full guest flow to the lab. Note: the in-file NOTE about an "undefined `setOpen`" is stale — the current handler (`close` → `onOpenChange(false)`, sign-in-dialog.tsx:50–55) is defined; the comment rots, but the test is not vacuous. |
| `e2e/auth-dialog.spec.ts` (7) | **HONEST** | Escape + focus restore to trigger, graceful degradation of the **real** `signInWithGoogle` (null client → error copy, no navigation), 320px overflow check, reduced-motion context. |
| `e2e/homepage.spec.ts` (6) | **HONEST** | Guest topic flow, unsupported-topic recovery loop, reduced-motion (canvas count 0), 320px, auth entry point. |
| `e2e/smoke.spec.ts`, `e2e/keyboard.spec.ts`, `e2e/multi-trial.spec.ts` | **HONEST** | Guest lab flows with strong behavior assertions (trials appended never overwritten, reload restores without duplication, `adaptRequests <= 1` per trial). |
| `e2e/cross-device-resume.spec.ts` (6) | **HONEST-when-run, INFLATING-when-skipped** | Real-backend assertions against a local Supabase stack, honestly documented. But `test.skip(!ENABLED, …)` skips **every test** unless `CROSS_DEVICE_E2E=1`, the final test is a hardcoded `test.skip(true, …)`, and the file's `.last-run.json` status "passed" silently includes 6 skips. Counts claiming "e2e passed" overstate real coverage by 6. |

## 3. The mock-vs-production chain audit (the core critique)

Production queries in `src/sync/cloud-session-repository.ts`:

```ts
// list():   .select("*").order("updated_at", { ascending: false }).limit(limit)
// getById(): .select("*").eq("id", id).maybeSingle()
// getIncompleteForLab():
//   .select("*").eq("lab_slug", labSlug).eq("status", "active")
//     .order("updated_at", { ascending: false }).limit(1).maybeSingle()
// upsert():  .upsert(payload, { onConflict: "id" })
// markComplete(): .update({ status: "complete", completed_at: … }).eq("id", id)
```

The test mock (`tests/lib/cloud-session-sync.test.ts:32–94`) supports
`select().order().limit()`, `select().eq().maybeSingle()`, and
`select().eq().order()`, but:

1. **It never sorts, never filters in the order paths, never limits.**
   `order().limit()` returns `{ data: [...state.values()] }` (insertion order,
   full array). A regression that removes `.order(...)` or `.limit(limit)` from
   `list()` is invisible to every test.
2. **`eq().order().maybeSingle()` returns the first *inserted* row unfiltered**
   (`const first = [...state.values()][0] ?? null`), ignoring both the `eq`
   filter and the ordering — a latent wrong-row trap for any future query.
3. **The mock cannot express the `getIncompleteForLab` chain.** Its `eq()`
   returns `{ maybeSingle, order }` with no second `eq`, so production's
   `.eq("lab_slug", …).eq("status", "active")` would crash the mock. The
   function has **zero** tests; the resume feature's only cloud read is
   unverified at unit level.
4. **`upsert(payload)` drops the options argument.** Production's
   `{ onConflict: "id" }` (cloud-session-repository.ts:107) is the entire basis
   for cross-device idempotency (import twice / two devices, same stable id,
   no duplicate rows), and no test asserts it. Removing `onConflict` would
   produce unique-violation errors at runtime — after every unit test passed.

Settings components (`src/components/settings/*`) fare better: their mock chains
match production exactly, including the absence of `onConflict` on
`learner_preferences` upserts, `update().eq("user_id", …)`, `delete().eq`, and
`select().order()` for export.

## 4. Top 5 false-confidence risks (ranked)

**#1 — `cloud-session-sync.test.ts` "lists newest first" asserts nothing about ordering.**
`rowFor` hardcodes `updated_at: "2026-08-03T00:00:00.000Z"` for every row
(line 111), the mock returns `[...state.values()]` in insertion order
(line 35–37), and the assertion `expect(rows.map((r) => r.id)).toEqual(["s-1", "s-2"])`
passes by insertion order alone. The test's own name claims "newest first"; the
data is tied; the sort is mocked out. Deleting `.order("updated_at", { ascending: false })`
or flipping it to `ascending` changes nothing.

**#2 — `{ onConflict: "id" }` is never asserted.** The upsert mock accepts only
`(payload)` (line 78–81) and the repo test checks only `payload` fields
("upserts with the authenticated user id"). The idempotency guarantee the whole
sync/import story leans on (plan D3: "re-import of same id creates no
duplicates") is untested at the query level. The guest-import unit tests prove
the *local marker* is idempotent, not the DB write.

**#3 — auth-callback unsafe-`next` test asserts only the negative.**
`tests/app/auth-callback.test.ts:65–72` asserts `redirect` was *not* called with
the evil URLs but never asserts it *was* called with `/dashboard`. A regression
that sends unsafe-`next` users to `/?auth=error` (sign-in appearing to fail)
passes. Also the `createClient() → null ⇒ /?auth=error` branch promised by plan
A6 has no test.

**#4 — dashboard "ten most recent sessions" is never verified.**
`tests/app/dashboard-page.test.tsx:209–237` asserts the three tables were
queried and the seeded array came back; the mock's `order`/`limit` accept and
discard their arguments. `limit(10)` and `order("updated_at", { ascending: false })`
could be deleted from `src/app/dashboard/page.tsx:66–71` and every test passes.

**#5 — real `signInWithGoogle` is replaced by a mock in the dialog tests.**
`sign-in-dialog.test.tsx` mocks `@/lib/supabase/auth` (keeping only
`isSafeRedirectPath` real) and asserts the mock's *call signature*
(`mockSignInWithGoogle.mock.calls[0][0]`), not behavior. The real function's
`supabase.auth.signInWithOAuth` invocation and its error passthrough
(`auth.ts:29–39`) are exercised nowhere in the unit suite; only the null-client
branch is covered, by the e2e guest build. If `signInWithOAuth` were called with
the wrong provider/options or its error were swallowed, all 9 dialog tests still
pass.

## 5. Top 5 missing tests (highest value, with exact scenarios)

**M1 — Resume a *completed* cloud session (status-preservation branch).**
`CloudSessionSync.save()` (`cloud-session-sync.ts:86–89`) forces
`status: "complete"` and `completedAt: cloud.completedAt` when the cloud copy is
complete, so reviewing an old session cannot flip the dashboard row back to "In
progress". Scenario: seed cloud row `status: "complete", completed_at:
"2026-08-03T11:00:00.000Z"`, local snapshot with a *newer* evidence timestamp and
`status: "active"`; assert `save()` returns `"saved"` and the upsert payload
carries `{ status: "complete", completed_at: "2026-08-03T11:00:00.000Z" }`.
This branch is currently dead code in the tests.

**M2 — `CloudSyncStatus` renders the four contract states (plan D4, never built).**
`src/components/sync/cloud-sync-status.tsx` has zero tests. Scenario matrix:
`signedIn=false` → "Saved on this device"; `signedIn=true` with `"saving"` →
"Saving…", `"offline"` → "Couldn't sync — your work is safe on this device",
**`"cloud_newer"` → "Saved on this device"** (the cloud-newer rendering is a
contract state with no coverage anywhere), `"saved"` → "Saved" then disappears
after 2500 ms (`showSaved` effect), `"idle"` → empty.

**M3 — `GuestImportDialog` auto-offer state machine at the UI level.**
`src/components/sync/guest-import-dialog.tsx` has zero tests. Scenarios: user +
local evidence + not imported + not dismissed → dialog opens automatically
(derived `shouldAutoOffer`); **already imported → dialog never opens, and an
explicit save with an already-imported id closes silently** (`"already_imported"`
→ no toast, `onRequestHandled`); "Not now" records dismissal in sessionStorage
for this session id only; "Save to my account" with a failing `upsert` → offline
toast and the session is *not* marked imported.

**M4 — `SessionResumeDialog` + `CloudSessionRepository.getIncompleteForLab`.**
Zero tests; the mock cannot even express the query. Scenarios: signed-in user
with no local evidence and an active cloud session → auto-offer with the *newest*
incomplete session (`eq("lab_slug").eq("status","active").order(updated_at
desc).limit(1)`); explicit `?resume=<id>` fetches that id; "Continue saved
session" persists the snapshot via `saveLocalSession` and adopts the cloud id
via `setLocalSessionId` (assert `unseenlab.session-id.v1 === cloudId`);
"Start a new session" dismisses for the visit (sessionStorage key
`unseenlab.resume-dismissed.v1.<id|auto>`).

**M5 — `useCloudSessionSync` fingerprint/debounce gating (plan D1, "the core
contract": meaningful-event saves only, never per-frame).**
`src/sync/use-cloud-session-sync.ts` has zero tests. The plan's §6 calls this
"the core contract", and it is implemented only by the
`JSON.stringify([evidenceRef, workflowRef])` fingerprint + 800 ms debounce.
Scenarios with a mocked `getBrowserClient` + spied `sync.save`: (a) mutate only
`session.preferences` → **zero** `save` calls; (b) append one trial → exactly
one debounced save after 800 ms; (c) unmount mid-debounce → the pending save
still fires (the code comment at use-cloud-session-sync.ts:108–109 promises this);
(d) `flush()` runs the pending save immediately; (e) outcomes map
`cloud_schema_newer_kept`/`cloud_newer_kept` → status `"cloud_newer"`.

**Honorable mention (plan A5, never built):** `src/proxy.ts` signed-in branch —
`getUser` returning a user must pass through with `NextResponse.next()`. Only the
unconfigured short-circuit is e2e-covered today; the "user present → pass" line
(proxy.ts:34–38) is untested.

## 6. Bottom line

The component/integration layer (onboarding wizard, dashboard, settings,
sign-in/sign-out dialogs, header, guest import state machine) is genuinely
honest: real components, strict mocks, behavior-level assertions. The false
confidence is concentrated where the critique pointed:

1. The **sync layer's tests pass regardless of production ordering, limiting,
   and `onConflict` behavior** — the mock is shape-compatible but semantically
   blind (sort/filter/limit/options all dropped).
2. The **signed-in flows are indeed mock-driven** (`signInWithGoogle`,
   `useSession`, browser client), and at least three promises from the test plan
   (D4 sync-status labels, proxy unit tests, the callback null-client branch)
   were never delivered — so "302 tests / all green" overstates the boundary
   coverage.
3. The **five highest-value missing tests** (M1–M5) are exactly the boundary
   states the plan claimed to cover: resume-with-completed, cloud_newer status
   rendering, import-when-already-imported at the UI, the resume dialog's only
   cloud read, and the no-per-frame sync contract.
