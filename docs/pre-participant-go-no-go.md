# UNSEENLAB FINAL PRE-PARTICIPANT GO/NO-GO — 2026-08-06

**VERDICT: PARTICIPANT_BLOCKED_PROTOCOL** — 3 P1 items must close before the participant session.
P0 = 0 · P1 = 3 · P2 ≈ 7 · P3 ≈ 4. Product code untouched; engineering remains frozen.

- Audit window: 2026-08-06T18:15Z → ~19:00Z (~45 min of the 75-min budget)
- Head audited: `d747853` (PR #10, draft) · product code `089aef0` (deployed) · PR #9 `0d88957` (draft) · main `75fbd73b` untouched
- Organization: 15 profiles dispatched (15 calls); peak concurrency 13 (gate batch); 15/15 completed, 0 blocked
- Skills used: dispatching-parallel-agents, verification-before-completion
- Red-team validation: `valid: true`, no invalid reports, no unresolved conflicts

## Executive summary

Security is closed, the science flow is sound, the frozen evaluation is intact, and the
build is green on unit/typecheck/lint — but the participant session must not start yet:

1. **P1 — Facilitator sheet scripts a question the app never shows.** `validation-pack/facilitator-session-sheet.md:55-56`
   instructs the on-screen concept question is *"What happens to the number of free neutrons over time if nothing changes?"*
   (nuclear wording the audit rejects). The app shows the topic-agnostic question
   (`src/research/research-recorder.ts:36-37`: "What happens to the system when one thing changes?").
   `docs/pre-participant-handoff.md:23` repeats the false rationale ("the in-app recorder is nuclear-specific, use paper").
   A facilitator following the sheet asks the participant a question that never appears on screen.
2. **P1 — Consent is missing the no-guaranteed-learning-benefit clause.** In-app consent
   (`src/components/research/research-session.tsx:165`) + protocol cover 7 of the 8 required clauses;
   no line disclaims a guaranteed learning benefit anywhere (closest: the RESEARCH_LABEL "Not a statistically
   validated learning study", which is not consent text).
3. **P1 — Deployed journey on the exact participant URL is not live-verified.** Every path on
   https://unseen-k4nudwiwu-sai-aathish-karthiks-projects.vercel.app returns HTTP 302 → vercel.com/login
   (Vercel SSO wall). The audit had no authenticated session or test credentials, so sign-in, guest
   save/reload, prediction restore, and replay could not be certified on the exact artifact — and the
   committed journey spec (`e2e/demo-journey.spec.ts:47`) **cannot pass in any environment**:
   `getByText("Trust: Verified simulation")` never matches because the badge exposes that string only as
   `aria-label` (visible text is "Verified simulation"). 2/2 journey tests fail everywhere; CI E2E has
   never completed green on this head (cancelled on the only run).

## Gate results (evidence summary)

| Gate | Result | Key evidence |
|---|---|---|
| 0 Repository truth | PASS | PR9 draft @ 0d88957; PR10 draft @ d747853; stacked (ancestor verified); main 75fbd73b untouched; trees clean; DEPLOYMENT_CODE_EQUIVALENT=YES (089aef0..d747853 = 2 docs files, 0 product-code diff); handoff URL correct; PR bodies stale (P2) |
| 1 Security closure | PASS | Live security-contract test 3/3 (readWrite@unseenlab, no admin roles); SECRET_SCAN=PASS; ATLAS_API/VERCEL_TOKEN absent from `.env` (counts only, never values); API key revoked (docs 204/0 keys); 0.0.0.0/0 rule documented w/ `deleteAfterDate 2026-08-09T23:59:59Z` + removal comment; TEMPORARY_ACCEPTED_RISK; live Atlas readback UNKNOWN (no credentials exist — itself consistent with revocation) |
| 2 Build & CI | FAIL | Node v24.17.0; lint 0; typecheck 0; unit 1297/1297 (75 files); build OK; browser-verify 26/26; bundle scan CLEAN; diff-check clean. Playwright 39/3/10: 2× journey-spec locator bug (fails in every env) + 1× auth-dialog env mismatch. CI 31120686263 on d747853: FAILURE — secrets-scan job failed at "Set up job" (GitHub infra Service Unavailable); E2E CANCELLED; lint/unit/build SUCCESS |
| 3 Firebase preview | FAIL (live unverifiable) | All paths 302 → vercel.com/login (SSO); local build of 089aef0: 4 NEXT_PUBLIC_FIREBASE_* inlined (plain), zero private-credential hits, bundle scan clean; live bundle/auth handler not reachable from audit |
| 4 Sign-in | BLOCKED | Popup path previously verified live on this deployment (prior session evidence); this audit: SIGN_IN_COMPLETION=BLOCKED_CREDENTIALS; no completion fabricated |
| 5 Deployed guest journey | BLOCKED | SSO wall; committed spec reviewed + mechanism verified in source; not executable from audit environment; prior-session live evidence exists for the older deployment only |
| 6 Account persistence | NOT_RUN | BLOCKED_CREDENTIALS; session mode must be explicit before go (recommendation below) |
| 7 Prediction restore | PASS (unit) | `restoredPredictionIndex` latest-prediction-wins (demonstration-page.tsx:38-43); gate unlock + replay from restored trial; 5/5 unit; e2e assertion present but spec itself is broken (P1-3); invalid-index not unit-pinned (INFO) |
| 8 Scientific flow | PASS | Bounds/unit/step/engine from catalog only (catalog.ts:102-105; materialize.ts:484-493); model cannot grade (science-policy + demo-store `source !== "model_generated_spec"`); trust = verified_simulation via resolveTrustIntent single source; sanitizer boundary clean; divergence NONE; 143/143 targeted tests |
| 9 Evaluation integrity | PASS | v1–v4 manifests + results present; SHA-256 recomputed, all match (06413fa2/065be4c8/f4b9056a/391ccd8b); no post-run edits (v4 lint-only cleanup disclosed, no re-run); old failures remain FAIL; no selective retries |
| 10 Consent & recorder | FAIL | RECORDER_GENERIC=PASS; SCREENSHOT_CONSENT=PASS; CONSENT_COPY=FAIL (missing benefit clause); RECORDER_FIELDS=FAIL (12/20 structured; 5 via facilitatorNotes; 3 absent) |
| 11 Accessibility | PASS (precheck) | 13/13 canonical unit (+11 related); e2e 5/11 (6 "Target crashed" — environment interference, zero assertion failures); forced-colors covers focus/borders/controls/tokens; keyboard/focus/reduced-motion/text-scale/320px/touch-targets/semantics/live-regions/tabs/WebGL-fallback YES; 375px + 200% zoom no committed tests (P2); VOICEOVER_READY=YES, VERIFIED=NO |
| 12 Participant reality | PASS | URL exact; first 60 s possible without terminal/repo/dashboards/API key/devtools/CLI/admin; facilitator-authenticated session required to pass SSO |
| 13 Protocol | PASS | Before/during/after complete; one-revision rule documented; revision-log.md zero rows; FABRICATED_EVIDENCE=NO |
| 14 Failure rehearsal | PASS | 12/12 rows: TRIGGER / USER-VISIBLE RESULT / FACILITATOR LINE / RECOVERY STEP; no provider error can reach participant (fail-closed paths verified in source) |
| 15 Presentation | PASS (blocked) | Script 13/13 beats; closing line verbatim: "UnseenLab lets AI compose the learning experience, but never lets AI invent the science."; recording blocked until participant evidence; PUBLIC_DEMO_READY=NO |

## Findings

- **P1-1** — `validation-pack/facilitator-session-sheet.md:55-56` nuclear question contradicts live app; `docs/pre-participant-handoff.md:23` false rationale. Participant impact: facilitator asks a question that never appears on screen; protocol contamination.
- **P1-2** — Consent missing "no guaranteed learning-benefit" clause. Participant impact: consent not fully informed per audit checklist.
- **P1-3** — Deployed journey on exact URL not live-verified (SSO, no session); committed journey spec can never pass (locator bug). Participant impact: unverified deployed path; CI can never go green on head.
- **P2** — CI red on head (infra + spec bug); auth-dialog guest-build env mismatch (ci.yml sets no env vars); PR #9/#10 bodies stale (commit/file/test counts, key status, "newest" preview URL); handoff:48 instructs revoking an already-revoked key; recorder 12/20 structured fields; 375px/200% zoom untested; VoiceOver unverified; judge-public URL unavailable.
- **P3** — Sanitizer policy doc wording vs first-pass strip (net fail-closed identical); `EngineParameterSpec.unit` free-text at type level (schema-capped); handoff tense; stale preview URLs in older closure-90/phase12 docs.
- **UNKNOWN** — Live Atlas API-key count and live network-rule readback (no credentials by design); live bundle contents behind SSO; Firebase authorized-domains state.

## Required before go (human items only — no product code)

1. Fix facilitator sheet question text → topic-agnostic (doc edit, `validation-pack/`).
2. Fix handoff:23 rationale + add no-benefit-guarantee line to the consent script (protocol doc edit; in-app copy change is src/** = forbidden here — the facilitator script is the consent mechanism per handoff).
3. Live-verify the deployed journey on the exact URL in an authenticated browser session (sign-in popup, guest save/reload, prediction restore, replay) — 10 min. If SSO blocks the audit again, provide an authenticated session or temporarily lift protection for the verification pass.
4. Fix `e2e/demo-journey.spec.ts:47` locator (test-only change, E2E fixture class) and rerun CI on the head.
5. Re-run this go/no-go with fresh evidence; only then start the participant session.

## Session mode (once P1s close)

FACILITATOR_AUTHENTICATED_MODE — participant is a guest on the generative orbit demo; the
facilitator's SSO-authenticated browser carries the session. GUEST_MODE equivalent inside the app
(no participant sign-in wall). Participant account mode not required.

## Rubric (honest, no projected points awarded as verified)

Impact 24/30 · AI Innovation 19/25 · Usability & Accessibility 17/25 · Technical Execution 8/10 ·
Presentation 7/10 → **verified ≈ 75/100**. Projected after participant ≈ 81; projected final
(revision + VoiceOver + public demo + video) ≈ 87. Weakest axis: Usability & Accessibility
(unverified items) tied with Presentation (no public demo/video).

## Cleanup clock

- **2026-08-09T23:59:59Z** — verify 0.0.0.0/0 rule auto-removal; verify Atlas API key remains revoked.
- Engineering stays frozen; no merge of PR #9/#10; no production change.
