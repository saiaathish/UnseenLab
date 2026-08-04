# UnseenLab — Final Claim Register (Devpost / scoring)

**Purpose:** the single source of truth for every claim the team may put in the submission (Devpost
description, demo video, spoken pitch, judge answers). Each claim maps to the artifact that proves
it and carries an honest status. A claim may be spoken only if its status is VERIFIED or PARTIAL
(with the partial part stated aloud); NOT_YET claims may be described only as planned work.

**Status legend**

- **VERIFIED** — proven by a recorded artifact (test run, integration run, CI scan, source + doc).
- **PARTIAL** — the mechanism is real and verified, but part of the claim (usually live/human
  verification) is still missing; the missing part must be stated.
- **NOT_YET** — real plan, no evidence yet. Cannot be claimed as a result.

**Standing rule — READ FIRST:** nothing about participant outcomes or learning gains is claimable
yet. No structured product-test session has run (`README.md:165`; `docs/user-research.md:32-61`
templates are empty). Any sentence of the form "the participant improved / learned / preferred X
after using the product" is NOT ALLOWED until a recorded session exists and the register is
updated. The design-participant facts that ARE allowed are listed in claim C-14.

---

## Product claims

### C-01 — Guest-first: the lab is fully usable with no account, no API key, no setup
- **Status: VERIFIED**
- **Artifacts:** `README.md:86` ("Guest-first by design"); `src/storage/session-storage.ts`
  (local anonymous persistence); `src/lib/firebase/client.ts` + `src/lib/mongo/client.ts`
  (null → guest mode when unconfigured); `e2e/smoke.spec.ts` and `e2e/multi-trial.spec.ts`
  (guest flow in a real browser against a production build); `validation-pack/rubric-audit.md`
  (Deployment Reality Test, steps 2–10 verified by source).
- **Allowed wording:** "The lab runs fully in the browser — no account required; sign-in is
  optional and adds cloud features only."

### C-02 — Authentication: Firebase Auth with Google popup + httpOnly session cookie
- **Status: VERIFIED** (implementation + real-stack integration), **PARTIAL** for the
  human-visible popup round trip on a deployed domain.
- **Artifacts:** `docs/security.md` §1–5 (cookie properties, CSRF origin check, rate limit,
  open-redirect allowlist, ownership invariant); `src/app/api/auth/session/route.ts`,
  `src/lib/firebase/server.ts`; tests `tests/app/auth-session-route.test.ts`,
  `tests/app/auth-callback.test.ts`, `tests/lib/redirect-safety.test.ts`,
  `tests/components/sign-in-dialog.test.tsx`; real-backend cookie mint/verify exercised by
  `scripts/backend-integration.mjs` (15/15, `docs/backend-verification.md`).
- **PARTIAL part:** the Google popup round trip on the deployed domain (authorized domains must
  include the production origin — see `docs/firebase-mongodb-setup.md` §1.3 and the morning
  checklist). Until a signed-in browser session on `unseen-lab.vercel.app` (or the submitted
  domain) is observed, say "sign-in is wired and the cookie path is tested against the real
  Firebase project; the live popup on this domain is on the morning checklist".

### C-03 — Cross-device sync: sessions and preferences resume on a second device
- **Status: PARTIAL**
- **Artifacts:** sync contract and conflict policy in `src/sync/cloud-session-sync.ts`
  (evidence-time conflict resolution, complete-stays-complete) + `tests/lib/cloud-session-sync.test.ts`;
  consent-gated import state machine `src/sync/guest-session-import.ts` +
  `tests/lib/guest-session-import.test.ts`; idempotent upsert + optimistic concurrency proven
  against the real backend (`docs/backend-verification.md` A3, A8–A10); the cross-device e2e spec
  `e2e/cross-device-resume.spec.ts` exists and is env-gated on `CROSS_DEVICE_E2E=1`
  (`docs/firebase-mongodb-setup.md` §6).
- **PARTIAL part:** the two-real-browser resume demonstration has not been run yet (it is a
  morning task — see `validation-pack/morning-checklist.md`). Claim: "cloud save/resume is
  implemented, authorization-tested against the real database, and the two-device run is
  scheduled" — not "verified across devices".

### C-04 — Isolation: a learner can never see or touch another learner's data
- **Status: VERIFIED** (real-backend integration)
- **Artifacts:** `docs/backend-verification.md` — A4 (client-supplied `user_id` ignored), A5, A6,
  A7, A12 (cross-user read/create/complete/delete all denied against the real Firebase + MongoDB
  stack), A13 (account wipe removes exactly the owner's rows); ownership invariant
  `docs/security.md` §5; `docs/mongo-schema.md` (indexes that enforce uniqueness).
- **Allowed wording:** "Authorization is enforced at the API layer and proven against the real
  backend: 15/15 integration checks, including cross-user read/write/delete attempts."

### C-05 — AI boundary: the adaptation layer can never change scientific outcomes
- **Status: VERIFIED**
- **Artifacts:** `src/domain/adaptation.ts` (provider returns proposals; `applyProposedChanges`
  touches preferences only); `src/adaptation/deterministic-provider.ts` (rules propose
  representation/pacing/structure changes only); `tests/simulation/preferences-invariance.test.ts`
  and `tests/simulation/nuclear-chain-reaction.test.ts` (engine determinism, caps, clamping);
  `docs/safety-model.md`; `validation-pack/scientific-oracle.md` (18 invariants).
- **Allowed wording:** "The scientific core is deterministic, seeded, capped, and structurally
  isolated from the adaptation layer — the AI proposes; it never computes or modifies outcomes."

### C-06 — Fallback: any hosted-model failure degrades to the deterministic rules, labeled honestly
- **Status: VERIFIED**
- **Artifacts:** `src/adaptation/llm-provider.ts`, `src/adaptation/llm-client.ts`
  (timeouts 12 s/15 s, `provider_error` handling), `src/adaptation/llm-schema.ts` (Zod-validated
  enum-only answer), `src/app/api/adapt/route.ts` (any failure → `{ fallback: true }`);
  `tests/adaptation/llm-provider.test.ts`, `tests/adaptation/llm-schema.test.ts`,
  `tests/adaptation/provider-factory.test.ts` (fallback on every failure mode); UI badge
  "AI interpretation" / "Offline rules" (`src/components/lab/experiment-shell.tsx`).
- **Known limitation (say it if asked):** the real LLM provider is intermittently flaky
  (historical `provider_error` bursts; see `docs/judge-question-bank.md` Q9). The deterministic
  fallback is the guaranteed path and is the default — this is by design, and the fallback is
  what the demo shows.

### C-07 — Accessibility: reduced motion (incl. OS preference), speed control, density, contrast, text scale, keyboard operation, focus-managed dialogs, ARIA tabs
- **Status: PARTIAL** — implemented and test-covered; live assistive-tech verification pending.
- **Artifacts:** `src/components/lab/accessibility-controls.tsx`,
  `src/components/lab/simulation-canvas.tsx` (static frames under reduced motion),
  `src/components/lab/adaptation-replay.tsx` (focus trap + restore),
  `src/components/lab/representation-tabs.tsx` (WAI-ARIA tabs); `e2e/keyboard.spec.ts`;
  `validation-pack/accessibility-audit.md` (66 tests by inspection: 52 implemented, 1
  static-proven miss — skip-to-content link, S4); `docs/a11y-audit-platform.md` (new-surface
  audit: contrast/target-size findings F1–F4 documented — **VERIFY whether fixed before
  submission**, see morning checklist).
- **PARTIAL part:** no recorded screen-reader pass and no axe/WCAG scan output yet; also the
  documented MED findings in `docs/a11y-audit-platform.md` (F1–F4) unless resolved.
- **Allowed wording:** "Designed with accessibility controls: reduced motion (including the OS
  preference), animation speed, low-density mode, high contrast, text scale, and full keyboard
  operation of the core flow."
- **Forbidden wording:** "fully WCAG 2.2 AA compliant" (not audited), "accessible to all users".

### C-08 — Personalization consumers: saved preferences actually change the lab experience
- **Status: VERIFIED**
- **Artifacts:** `src/personalization/profile-to-learner-preferences.ts` — the single canonical
  mapping (`profileToLearnerPreferences`, `PACE_TO_SPEED` calm 0.5 / balanced 1 / quick 1.5,
  clamps, `preferenceSummary` chips) consumed by the lab header's "Using your saved learning
  preferences" indicator (`src/components/lab/experiment-shell.tsx:648`); `draftToPreferencesRow`
  drives onboarding writes; `tests/personalization/profile-to-learner-preferences.test.ts`
  (clamp bounds equal domain constants); onboarding persistence + dashboard
  (`tests/app/onboarding-page.test.tsx`, `tests/app/dashboard-page.test.tsx`).
- **Allowed wording:** "Every stored preference has a visible consumer in the lab — initial
  representation, animation speed, density, reduced motion, high contrast, text scale,
  one-variable mode."

### C-09 — Security hygiene: no secrets in the repo or in the client bundle
- **Status: VERIFIED** (CI scans + coordinator-verified clean bundle scan)
- **Artifacts:** `scripts/bundle-secret-scan.mjs` (client chunks must contain zero occurrences of
  private-key/service-account/Mongo/LLM patterns) wired into `.github/workflows/ci.yml`;
  `docs/security-hygiene-audit.md` (tracked-file and history scans clean; 3 high `npm audit`
  findings in `sharp`/`postcss` via `next`, unused by the app — documented limitation);
  `docs/security.md`.
- **Allowed wording:** "CI scans the shipped bundle for leaked credentials and is clean."
- **Known limitation (disclose if asked):** `npm audit` reports 3 high findings in transitive
  `sharp` (unused by the app); fix requires `next@16.3.0`, intentionally deferred
  (`README.md:164`).

### C-10 — Deterministic scientific core with safety caps
- **Status: VERIFIED**
- **Artifacts:** `src/simulation/nuclear-chain-reaction.ts` (Mulberry32, fixed consumption order),
  `src/domain/experiments.ts` (MAX_POPULATION 500, MAX_STEPS 120, clamping incl. NaN guard);
  `tests/simulation/nuclear-chain-reaction.test.ts` (deterministic replay, zero-neutron,
  nonnegativity, caps, monotonicity), `tests/simulation/counterfactual.test.ts` (one variable,
  same seed, immutability); `validation-pack/scientific-oracle.md` (18 invariants).
- **Allowed wording:** "Same settings and same seed always produce the same result; the model is
  explicitly fictionalized, dimensionless, and not a reactor simulator."

### C-11 — Evidence trail: every trial, prediction, proposal and decision is recorded and replayable
- **Status: VERIFIED**
- **Artifacts:** `src/domain/evidence.ts` (typed Zod records; trials appended, never
  overwritten); `src/storage/session-storage.ts` (Zod-validated persistence + JSON export with
  the "not a statistically validated learning study" label); `src/components/lab/adaptation-replay.tsx`;
  `e2e/multi-trial.spec.ts` (three trials, replay lists every trial); `tests/components/replay-paths.test.tsx`.
- **Allowed wording:** "The learner can replay their whole journey — prediction, variables,
  outcome, offers, decisions — and export it as a labeled JSON file."

### C-12 — Meaningful, bounded AI use (not a chat wrapper)
- **Status: VERIFIED** (mechanism), **PARTIAL** (no live hosted-model demo recorded yet; see Q9
  of the judge bank for the benchmark-status flag).
- **Artifacts:** the two-provider architecture (`src/adaptation/*`), taxonomy
  (`src/adaptation/misconception-taxonomy.ts`), evidence-linked proposals, accept/reject/modify;
  `validation-pack/rubric-audit.md` (Wrapper Test: removing the LLM leaves the full product —
  rules engine, counterfactual, replay, five representations).
- **Allowed wording:** "Deterministic adaptive engine by default, with an optional, labeled,
  schema-bounded AI-interpretation layer that falls back to the rules on any failure."

### C-13 — Cross-device/account continuity requires explicit consent; nothing is uploaded silently
- **Status: VERIFIED**
- **Artifacts:** `src/sync/guest-session-import.ts` (consent-gated state machine: never
  auto-upload; per-visit dismissal; local data not deleted before cloud confirmation) +
  `tests/lib/guest-session-import.test.ts`; "Save your current learning session?" →
  "Save to my account" / "Not now" (`src/components/sync/guest-import-dialog.tsx`); import
  idempotency (`docs/backend-verification.md` A8 pattern, `tests/lib/cloud-session-sync.test.ts`).

---

## Design-participant claims (the ONLY human claims allowed today)

### C-14 — Designed with an initial design participant (confirmed profile facts)
- **Status: VERIFIED** (profile + design-revision log)
- **Artifacts:** `docs/user-research.md:5-30`; participant description in `README.md:15-17`.
  (Note: older validation-pack docs cite a landing-page attribution at `src/app/page.tsx:117-121`
  — that text is not present in the current `src/app/page.tsx` at HEAD or in the working tree;
  the README + user-research docs are the authoritative sources.)
- **Allowed wording:** "Designed with an initial design participant — a ~17-year-old high-school
  senior with disclosed ADHD who reports learning differently from how material is normally
  presented in class, and who strongly values interactivity and animation. His confirmed
  preferences shaped the product before build (animation-first, representation choice,
  prediction-before-run, offers-not-automatic-changes, no diagnosis presets)."
- **Forbidden:** "co-designed by neurodivergent students" (plural), "validated with", "user-tested",
  any causal claim about ADHD learners.

### C-15 — Participant outcomes / learning gains / feedback-driven post-build changes
- **Status: NOT_YET — NOTHING IS CLAIMABLE.** The structured product-test session (consent →
  baseline → observed use → post-use → one feedback-driven revision) is scheduled for the morning
  of the deadline and has NOT run (`docs/user-research.md:32-61` templates empty; kit ready in
  `docs/user-testing-kit.md`). No pre/post confidence, mental-effort, understanding, or quote data
  exists. No post-build change from a session exists.
- **What updates this claim:** a completed session recorded per `docs/user-testing-kit.md` +
  `validation-pack/user-testing-session-sheet.md`, results filled into `docs/user-research.md`,
  and the first feedback-driven revision committed with a traceable reference. Until then the
  demo and Devpost text must show the placeholder block verbatim (see `docs/demo-script-final.md`).

---

## Usage rules

1. Any sentence used in Devpost, video, or spoken pitch must trace to a row above. VERIFIED rows
   may be stated as facts; PARTIAL rows must include their missing part; NOT_YET rows may only be
   described as scheduled work.
2. Re-check after the participant session and after any deployment/screenshot evidence: update
   statuses in place, never silently remove a NOT_YET mark.
3. The composite scoring consequence of this register is in
   `validation-pack/overnight-score-audit.md`.

## Companion

- `validation-pack/evidence-claims-register.md` — the 20-claim adversarial register (pre-platform
  numbering); this file supersedes it for the final submission.
- `docs/evidence-inventory.md` — the artifact inventory backing this register.
