# QA Report — Overnight-90 readiness (browser matrix)

Date: 2026-08-04 · Branch: `feature/overnight-90-readiness`
Runner: browser QA agent (guest-run; no Firebase env exported for the main suite)
App: `next start` on :3100 serving the EXISTING `.next` build — **never rebuilt** during this report.

## Status: PARTIAL

The suite runs, the new accessibility/quality specs pass 15/15, the real-backend isolation
spec proves 3 of 4 claims — but the **current `.next` build is not what the test suite
premise assumes** (not a guest build, and not fresh from HEAD). Two baseline tests fail
against it, the /research route is absent (404), and the cross-user conflict endpoint 500s
instead of the documented 409. Full detail below. No source edits were made.

---

## 1. Build-state findings (read this first)

Verified by inspecting `.next` output and by running the suite:

1. **The build is Firebase-baked, not a guest build.** The client bundle inlines the real
   web API key (`AIzaSyAGA…uYw`) and auth domain (`unseenlab-eece2.firebaseapp.com`)
   (`getFirebaseConfig` compiled with real values). `isFirebaseConfigured()` is true in the
   browser AND server-side (`next start` also loads `.env.local`). Consequences:
   - "Continue with Google" opens the real Google popup instead of failing calmly, so the
     guest-build graceful-failure test cannot pass against this build (see §2, failure 1).
2. **The build is LLM-baked.** `createAdaptationProvider` compiled with the LLM path:
   trial 1 in this build produced a proposal with source `llm` (badge "AI interpretation")
   with a live model response. The deterministic/offline-rules path only runs when the LLM
   bridge fails (verified by forcing `/api/adapt` to 500 — badge flips to "Offline rules").
3. **The build is stale vs HEAD.** `.next` mtime 00:55; HEAD (89e5b85) is 01:20.
   - `/research` route is missing from the build (404) although `src/app/research/page.tsx`
     exists at HEAD. Screenshot S06 could not be captured.
   - `PUT /api/cloud/sessions` in the build has `expected_revision`/`mutation_id` optimistic
     concurrency but **lacks the duplicate-key (11000 → 409) branch** that HEAD source has
     (`src/app/api/cloud/sessions/route.ts`). Cross-user PUT of the same session id returns
     500 `{error:"internal"}` instead of 409 `{error:"conflict"}` (see §5).
   - The parallel rebuild (other agent) is expected to fix these; re-running the matrix
     after the rebuild is recommended.
   - (During this run, other agents modified `src/adaptation/llm-client.ts` and
     `src/adaptation/llm-provider.ts` in the working tree; those edits are NOT part of the
     tested `.next` build and do not affect any result in this report.)

## 2. Baseline suite (existing specs, `npx playwright test`)

**23 passed, 2 failed, 6 skipped (31 total)** — expected per plan: 25 passed, 6 skipped.

Skipped (6): `e2e/cross-device-resume.spec.ts` ×6 (env-gated `CROSS_DEVICE_E2E`, correct).

Failures (verbatim):

1. `e2e/auth-dialog.spec.ts:58 › Continue with Google degrades gracefully when sign-in is
   unavailable`
   - `Error: expect(locator).toBeVisible() failed — Locator: getByText('We couldn't sign you
     in with Google. Please try again.') — element(s) not found (5000ms)`
   - Failure-time snapshot: dialog stays open with `button "Opening Google…" [disabled]` —
   the Google popup was actually opening. **Real failure, build mismatch**: the test is
   written for a guest build; this build is Firebase-baked (see §1.1). Not flaky (reproduced
   in isolation). Do NOT edit the test or the source: rebuild as a guest build (no
   NEXT_PUBLIC_FIREBASE_*) for the guest suite, or gate the run to match the build.
2. `e2e/keyboard.spec.ts:9 › keyboard-only core flow works`
   - `Error: expect(locator).toBeVisible() failed — Locator: getByText(/state summary:/i) —
     element(s) not found (5000ms)`
   - Failure-time snapshot: trial in flight (`status: Interpreting your evidence…`). The run
     had started; the 5s assertion timed out while the adaptation provider (LLM round-trip
     in this build) was still resolving. **Flaky/latency-sensitive**: the identical flow
     passes with mouse clicks (smoke/multi-trial, 10–30s timeouts) and this spec passed 2/2
     solo re-runs. Under parallel load the LLM interpretation exceeded the test's 5s expect
     timeout. No source change made.

## 3. Accessibility spec (new, `e2e/accessibility.spec.ts`) — 8/8 passed

| # | Test | Result |
|---|------|--------|
| 1 | keyboard: Tab → Sign in, Enter opens dialog, Escape closes + restores focus | PASS |
| 2 | focus-visible: Sign in button + topic input show a focus indicator after Tab | PASS |
| 3 | no tab trap: focus cycles through every homepage control (never freezes) | PASS |
| 4 | reduced motion: lab simulation view mounts and a trial runs | PASS |
| 5 | text scale: accessibility control applies `documentElement.style.fontSize = "150%"` | PASS |
| 6 | 320px: homepage no horizontal overflow | PASS |
| 7 | 320px: lab no horizontal overflow | PASS |
| 8 | high contrast: toggle applies `body.high-contrast` + computed token change | PASS |

Notes:
- Reduced motion: the lab simulation is an inline SVG (`svg[role=img]`), not a WebGL
  canvas; under OS reduce the `html[data-reduced-motion]` kill-switch pins static frames.
- Onboarding intentionally not covered (auth-gated; redirects to /?auth=open signed out).

## 4. Quality spec (new, `e2e/quality.spec.ts`) — 7/7 passed

- Console (asserted ZERO error-level messages):
  - home: PASS — 0 errors; 4 warnings, all benign headless GPU-driver noise
    (`[.WebGL-…]GL Driver Message … GPU stall due to ReadPixels`, SwiftShader in headless).
  - lab: PASS — 0 errors, 0 warnings.
  - signed-out `/dashboard` redirect: PASS — 0 errors, 0 warnings (the old 401 is gone;
    `/api/auth/me` returns 200 with `user: null`).
- Perf (recorded only, no budgets — headless local numbers, single sample each):
  - home: DCL 22.3 ms, load 91.3 ms, responseStart 3.2 ms, LCP 116 ms (LargestContentfulPaint
    via PerformanceObserver, entry size 46500)
  - lab: DCL 19.0 ms, load 75.5 ms, responseStart 2.9 ms, LCP 68 ms (size 33660)
  - Caveat: localhost/headless; treat as relative sanity numbers, not production LCP.
- Adaptation badge: PASS — a trial shows the source badge with the real copy from
  `src/components/lab/adaptation-card.tsx`; this build's badge read **"AI interpretation"**
  (LLM path live).
- AI fallback: PASS — with `/api/adapt` forced to 500 via `page.route`, the card shows the
  **"Offline rules"** badge (deterministic rule set fired `reduce_density`; multiple
  proposals each carried the offline badge).
- Evidence pack (screenshots): PASS with one honest gap — S01–S05 captured; S06 not
  captured because `/research` returns 404 in this build (see §1.3). Recorded in
  `validation-pack/screenshots/quality-data.json`.

## 5. Isolation spec (new, `e2e/isolation.spec.ts`, env-gated `ISOLATION_E2E=1`) — 3 passed, 1 failed

Ran against the real Firebase project + MongoDB with creds from the local `.env`/`.env.local`
(the build IS Firebase-baked, so no rebuild was needed or performed; no other agent was
building when the run started).

1. learner_a: empty cloud, PUT creates session at revision 1 — **PASS** (200, revision 1)
2. learner_b: isolated cloud (empty) but PUTting the SAME id → **FAIL**:
   `Expected: 409, Received: 500`. The current build's PUT handler has the
   `expected_revision` concurrency check but **no duplicate-key branch** (verified in the
   compiled chunk: no `11000` anywhere), so the cross-user insert blows up to
   500 `{error:"internal"}` instead of 409 `{error:"conflict"}`. HEAD source has the branch
   (`src/app/api/cloud/sessions/route.ts` catch block); the build predates it.
3. learner_a: session persists at revision ≥ 1 — **PASS** (row intact; learner_b never
   corrupted it)
4. Sign-out privacy (UI): user-menu sign-out shows the keep/clear dialog with both mandated
   options ("Sign out and keep my data on this device" / "Sign out and clear data on this
   device" + Cancel), "Keep" returns home, and `/dashboard` redirects to `/?auth=open` after
   the server cookie is cleared — **PASS**

Honest status: the isolation CLAIMS are proven (per-user empty clouds, persistence,
sign-out gating), except the cross-user **409** which the current build cannot produce
(500 instead) — **BLOCKED-BY-BUILD** for that single assertion; re-run after rebuild.

## 6. Screenshot inventory (`validation-pack/screenshots/`, gitignored)

| File | Content | Status |
|------|---------|--------|
| S01-home-1440.png | Home, 1440×900 | captured |
| S02-home-320.png | Home, 320×568 | captured |
| S03-auth-dialog.png | Auth dialog open (`/?auth=open`) | captured |
| S04-lab-predict.png | Lab predict step | captured |
| S05-lab-results.png | Lab results after one trial (deterministic flow, LLM badge visible) | captured |
| S06-research-consent.png | /research consent gate | **NOT captured — route 404s in this build** |

Metrics JSON: `validation-pack/screenshots/quality-data.json` (console messages, perf
timings/LCP, adaptation badge text, screenshot list, research page status 404).

## 7. Flakiness notes

- `e2e/keyboard.spec.ts:9` failed once in the parallel baseline run, passed 2/2 solo.
  Cause: 5s assertion vs live LLM interpretation latency under worker contention (this
  build is LLM-baked). Not a product bug; the flow itself works (smoke + multi-trial pass).
- Everything else is deterministic across runs (each new spec passed on re-run after my own
  assertion fixes, which were bugs in the new tests, not the app).

## 8. Commands run

- `npx playwright test` (baseline, existing specs) → 23 passed / 2 failed / 6 skipped
- `npx playwright test e2e/keyboard.spec.ts` ×2 (flake check) → 3 passed each time
- `npx playwright test e2e/auth-dialog.spec.ts -g "degrades gracefully"` → 1 failed (deterministic)
- `npx playwright test e2e/accessibility.spec.ts e2e/quality.spec.ts` → 15 passed
- `set -a; source .env; source .env.local; set +a; ISOLATION_E2E=1 npx playwright test e2e/isolation.spec.ts` → 3 passed / 1 failed
- Final full-suite run: see §9.
- Never ran `npm run build`, `npm test`, or `npx tsc`. Nothing committed.

## 9. Combined suite (final run, all specs; isolation self-skips)

`npx playwright test` → **39 passed, 1 failed, 10 skipped (50 tests, 26.5s)**

- 31 baseline tests: 23 passed, 6 skipped (cross-device), 1 failed (auth-dialog graceful
  failure — the same deterministic build mismatch as §2; the keyboard flake did not recur
  in this run).
- 15 new tests (accessibility 8 + quality 7): all passed.
- 4 isolation tests: skipped (env-gated; ran separately in §5).

Net suite status: everything green except the single guest-build premise failure that this
Firebase/LLM-baked, pre-HEAD build cannot satisfy.
