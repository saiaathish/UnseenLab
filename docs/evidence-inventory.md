# UnseenLab — Evidence Inventory (final submission)

**Purpose:** every artifact the submission can cite, grouped by claim area, with its honest status.
This is the raw material for `docs/claim-register.md`. Statuses:

- **DONE (recorded)** — a recorded artifact exists (test run output, integration run, CI scan,
  source+doc inspection).
- **DONE (source/doc)** — verified by source inspection and committed docs; no run output artifact.
- **PENDING** — scheduled work (morning of deadline); no evidence yet.
- **NOT YET** — explicitly not done; must never be presented as done.
- **MISSING** — file was expected but not found in the repo at writing time.

**Global honesty note:** no structured participant session has run and no demo video exists. Both
are morning tasks; neither is claimed anywhere in this inventory.

---

## 1. Deterministic-core tests

| Item | Status | Where |
|---|---|---|
| Simulation invariants: deterministic replay, zero-neutron, nonnegativity, caps (500/120), clamping incl. NaN guard, monotonicity | DONE (source/doc) | `tests/simulation/nuclear-chain-reaction.test.ts` |
| Counterfactual: exactly one variable, same seed, immutability | DONE (source/doc) | `tests/simulation/counterfactual.test.ts` |
| Preferences invariance (adaptation cannot change outcomes) | DONE (source/doc) | `tests/simulation/preferences-invariance.test.ts` |
| Adaptation rules: evidence IDs, rejection memory, reduced-motion rule, 3-proposal cap, fixed order | DONE (source/doc) | `tests/adaptation/deterministic-provider.test.ts` (16 cases per `validation-pack/judge-question-bank.md` JUDGE-22) |
| Taxonomy classification (5 concepts, 4 statuses, keyword fallback) | DONE (source/doc) | `tests/adaptation/misconception-taxonomy.test.ts` |
| Multi-trial loop e2e: three trials, no reload, updated-prediction gating, replay lists all | DONE (source/doc) | `e2e/multi-trial.spec.ts` (3 tests) |
| Core smoke e2e | DONE (source/doc) | `e2e/smoke.spec.ts` (1 test) |
| Suite totals | PENDING reconciliation | README claims **302 unit/component across 29 files** and **25 Playwright e2e across 6 specs** (`README.md:122-123`); coordinator-verified state is **363+ unit and 24–25 e2e**. The two numbers differ — a fresh full run is on the morning checklist and its output must be recorded as the submission artifact. The 7th spec, `e2e/cross-device-resume.spec.ts`, self-skips without `CROSS_DEVICE_E2E=1` (`docs/firebase-mongodb-setup.md` §6). |

## 2. AI layer / benchmark

| Item | Status | Where |
|---|---|---|
| LLM provider fallback on every failure mode (no key, timeout, invalid JSON, schema violation) | DONE (source/doc) | `tests/adaptation/llm-provider.test.ts`, `tests/adaptation/llm-schema.test.ts`, `tests/adaptation/provider-factory.test.ts` |
| Bounded payload + Zod-validated enum-only answer; 12 s/15 s timeouts; `provider_error` handling | DONE (source/doc) | `src/adaptation/llm-client.ts:23,85`, `src/adaptation/llm-schema.ts`, `src/app/api/adapt/route.ts` |
| **AI benchmark metrics (accuracy / latency / fallback rate on the real provider)** | **MISSING — file not present at writing time** | `docs/ai-benchmark.md` is owned by a separate agent and had not been created when this inventory was written (2026-08-03). Until it lands, do not quote unrecorded metrics; see `docs/judge-question-bank.md` Q9 for the honest interim answer. |
| Provider flakiness (known limitation) | DONE (coordinator-verified operational fact; mechanism in code) | Historical `provider_error` bursts (~60% failure bursts reported by coordinator). Not yet written into any doc — morning task: record the observed failure rate from server telemetry if available, and state it in the submission's limitations. |

## 3. Firebase Auth verification

| Item | Status | Where |
|---|---|---|
| Session-cookie security model (httpOnly, Secure, SameSite=Lax, 14 days, Origin check, rate limit, open-redirect allowlist, ownership invariant) | DONE (source/doc) | `docs/security.md` §1–5 |
| Auth unit/component tests (session route 403/200, callback onboarding gate, redirect safety, sign-in dialog) | DONE (source/doc) | `tests/app/auth-session-route.test.ts`, `tests/app/auth-callback.test.ts`, `tests/lib/redirect-safety.test.ts`, `tests/components/sign-in-dialog.test.tsx` |
| Real-stack session cookie mint/verify (custom token → Identity Toolkit → createSessionCookie) | DONE (recorded) | `scripts/backend-integration.mjs` — 15/15 passed, run twice; `docs/backend-verification.md` |
| Google popup round trip on the deployed domain | PENDING (morning) | Requires authorized domains to include the production origin; see `docs/firebase-mongodb-setup.md` §1.3 and `validation-pack/morning-checklist.md` |

## 4. MongoDB authorization tests

| Item | Status | Where |
|---|---|---|
| A1–A15 real-backend suite: no-cookie 401, garbage-cookie 401, client-supplied `user_id` ignored, cross-user read/create/complete/delete denied, idempotent mutation replay, stale revision → 409, revision increments, complete-timestamp, account wipe isolation, cleanup | DONE (recorded) — **15/15 passed, executed twice** | `docs/backend-verification.md` (full per-test table + stdout); suite: `scripts/backend-integration.mjs` |
| Schema: `$jsonSchema` validators (strict) on all three collections, unique + query indexes, no COLLSCAN query shapes | DONE (recorded) | `docs/mongo-schema.md` (validators, index table, measured query plans via `scripts/explain-plans.mjs`, 2026-08-03); setup: `scripts/mongo-setup.mjs` |
| Optimistic concurrency contract (revision, `last_client_mutation_id`, 409 response shape) | DONE (source/doc + real-stack) | `docs/mongo-schema.md` §"Optimistic concurrency"; `docs/backend-verification.md` A3, A8–A10 |

## 5. Cross-device test

| Item | Status | Where |
|---|---|---|
| Cross-device resume e2e spec (real Firebase + MongoDB, cookie-injected, env-gated) | DONE (source/doc); **run PENDING** | `e2e/cross-device-resume.spec.ts` (6 tests, skipped unless `CROSS_DEVICE_E2E=1`); runbook `docs/firebase-mongodb-setup.md` §6 |
| Two-browser manual resume demonstration | PENDING (morning) | morning checklist |
| Conflict policy + import consent + idempotency unit coverage | DONE (source/doc) | `tests/lib/cloud-session-sync.test.ts`, `tests/lib/guest-session-import.test.ts` |

## 6. Accessibility checks

| Item | Status | Where |
|---|---|---|
| 66-test accessibility audit (by inspection): 52 implemented, 2 partial, 1 static-proven miss (skip-to-content link, S4), 10 manual-only | DONE (source/doc) | `validation-pack/accessibility-audit.md` |
| Keyboard-only core flow e2e | DONE (source/doc) | `e2e/keyboard.spec.ts` (3 tests) |
| New-platform-surface audit (dialogs, onboarding, dashboard, settings, sync): contrast table + findings F1–F4 (MED), F5–F13 (LOW/INFO) | DONE (source/doc) — findings **not yet verified fixed** | `docs/a11y-audit-platform.md`; morning task: re-check F1–F4 against the current build before claiming accessibility |
| Recorded screen-reader pass (VoiceOver/NVDA) | NOT YET | morning task; the code claims are covered by tests, the assistive-tech pass is not |
| axe/WCAG automated scan | NOT YET | morning task (`validation-pack/rubric-audit.md` Criterion 3 remediation) |
| OS-level reduced-motion verification on camera | NOT YET | morning task (screenshot/video) |

## 7. Participant evidence (human)

| Item | Status | Where |
|---|---|---|
| Initial design participant profile + confirmed preferences + pre-build design-revision log | DONE (source/doc) | `docs/user-research.md:5-30` |
| Structured product-test session (consent → baseline → observed use → post-use → feedback-driven revision) | **NOT RUN — scheduled for the morning of the deadline** | Kit: `docs/user-testing-kit.md`; protocol: `validation-pack/user-testing-protocol.md`; sheet: `validation-pack/user-testing-session-sheet.md`; templates empty in `docs/user-research.md:32-61` |
| Pre/post confidence, mental effort, understanding answers; quotes | **NOT RUN** | same sources |
| First feedback-driven post-build change | **NOT YET — nothing claimable** | `docs/claim-register.md` C-15 |

## 8. Video

| Item | Status | Where |
|---|---|---|
| Three-minute demo video (≤3:00, target 2:45) | **NOT MADE — scheduled for the morning** | Script: `docs/demo-script-final.md`; backup + failure drills: `validation-pack/demo-failure-script.md`; recording checklist: `validation-pack/morning-checklist.md` |
| Backup recording + screenshot deck | NOT YET | `validation-pack/demo-failure-script.md` (backup checklist); `docs/screenshot-inventory.md` |

## 9. Deployment

| Item | Status | Where |
|---|---|---|
| Production env vars on Vercel (`NEXT_PUBLIC_FIREBASE_API_KEY/AUTH_DOMAIN/PROJECT_ID/APP_ID`, `FIREBASE_SERVICE_ACCOUNT`, `MONGODB_URI`) | **UNKNOWN — must be verified/added in the morning** | `docs/firebase-mongodb-setup.md` §1–3; `validation-pack/morning-checklist.md` |
| Authorized domains in Firebase console (production origin, e.g. `unseen-lab.vercel.app`) | **UNKNOWN — must be verified in the morning** | `docs/firebase-mongodb-setup.md` §1.3 |
| Repository public + logged-out URL check | UNKNOWN | `validation-pack/release-gates.md` Gate A; morning checklist |

## 10. Known limitations (state these in the submission; never hide them)

| Limitation | Detail | Source |
|---|---|---|
| LLM provider flakiness | Real provider intermittently fails (`provider_error` bursts, ~60% historical); deterministic fallback is the guaranteed path and the default | `src/adaptation/llm-client.ts:85`; coordinator-verified; see §2 above |
| `npm audit` — 3 high findings in `sharp` | Transitive via Next.js image optimization; unused by the app (`next/image` not used); fix requires `next@16.3.0`, intentionally deferred | `README.md:164`; `docs/security-hygiene-audit.md` F1 |
| Preview/auth domains | Firebase forbids wildcards in authorized domains; every preview deployment needs its own entry; iOS in-app browsers block popups | `docs/firebase-mongodb-setup.md` §1.3, §7 |
| Accessibility findings on new surfaces | `docs/a11y-audit-platform.md` F1–F4 (MED contrast/target-size) unverified as fixed | §6 above |
| One lab functional; two registered as `planned` | Honest labeling on landing page | `src/domain/experiments.ts:262-287` |
| Free-text research answers not persisted | Component state only by design | `src/components/lab/research-mode.tsx:24-27`; `README.md:161` |
| Test-count reconciliation | README 302/25 vs coordinator 363+/24–25 | §1 above; morning full run |

---

## Morning tasks that move rows from NOT YET → DONE (summary)

1. Full test run (`npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build`) — record output; reconcile 302 vs 363+.
2. Participant session per `validation-pack/morning-checklist.md` (fills §7).
3. Record demo video + backup + screenshot deck (fills §8).
4. Deploy env vars + authorized domains + public-repo checks (fills §9).
5. Verify `docs/a11y-audit-platform.md` F1–F4; optional axe scan (fills §6).
6. Land `docs/ai-benchmark.md` (fills §2) — owned by another agent; flag to coordinator if still missing.
