# UnseenLab — Overnight Score Audit (official rubric)

**Purpose:** an honest, evidence-linked scoring projection against the official IncludAI /
Stanford NNEA Track 1 rubric. Three columns: (1) **verified current state** — what evidence
exists in the repo right now; (2) **overnight verified ceiling** — what the completed engineering
work plus morning artifacts (screenshots, video, test run, deploy) can support; (3) **post-
participant projected** — what a real participant session can add.

**Rating scale** (from `validation-pack/rubric-audit.md`): Winner = 1.0 · Finalist = 0.8 ·
Meets Bar = 0.6 · Below Bar = 0.4 · Disqualifying = 0 · Not Evaluated = 0 (until the artifact
exists). Criterion score = weight × points. Bands: 0.8+ = Finalist-to-Winner; 0.6–0.79 = Finalist
potential; below 0.6 does not clear the official bar.

**Two hard rules**

1. **Human-evidence points cannot be claimed yet.** No structured product-test session has run
   (`README.md:165`; `docs/user-research.md:32-61` empty). Any point in the Impact column that
   depends on a session stays at the pre-session rating until a recorded session exists.
2. Every number below cites an artifact. "Ceiling" means the rating the artifact set CAN support —
   not that it has been earned; the morning checklist is what converts ceilings into current state.

---

## Score table

| Criterion (weight) | Verified current state | Overnight verified ceiling | Post-participant projected |
|---|---|---|---|
| **Impact on Neurodivergent Youth (30%)** | **0.4 → 0.12 (Below Bar)** — design-participant involvement confirmed and honestly documented (`docs/user-research.md:5-30`); no test session, no quotes, no outcomes; the pack's own audit rated Below Bar (`validation-pack/rubric-audit.md`, Criterion 1) | **0.4 → 0.12** — engineering cannot produce human evidence; ceiling unchanged without a session. No artifact created overnight moves this row | **0.6 → 0.18 (Meets Bar)** — one structured session (consent → pre → observed use → post → export → one feedback-driven revision, per `docs/user-testing-kit.md` + `validation-pack/user-testing-protocol.md`) with the results recorded in `docs/user-research.md` and the session JSON in `validation-pack/backups/` moves this row. **0.8 (Finalist) → 0.24 is a stretch** that requires a second session AND a visible iteration — do not project it by default |
| **Innovation in AI Application (25%)** | **0.6 → 0.15 (Meets Bar)** — two honest layers implemented: deterministic rules (default) + optional structured LLM behind `POST /api/adapt` with schema-validated output and fallback on every failure (`src/adaptation/llm-provider.ts`, `llm-schema.ts`, `src/app/api/adapt/route.ts`); evidence-linked proposals, Counterfactual Microscope, Adaptation Replay (`validation-pack/rubric-audit.md`, Criterion 2: "Meets Bar → Finalist boundary") | **0.8 → 0.20 (Finalist)** — contingent on: recorded live proposal trace (screenshot S22 + one exported session JSON), the labeled fallback proof on camera (model down → "Offline rules" badge), and `docs/ai-benchmark.md` landing with measured metrics (currently MISSING — see `docs/evidence-inventory.md` §2). Without the benchmark doc, stay at 0.6–0.7 in self-assessment | **0.8 → 0.20** — the AI axis does not depend on the participant session; it depends on the artifacts above. If the session produces outcome-vs-adaptation observations, that feeds Impact, not this row |
| **Usability and Accessibility (25%)** | **0.6 → 0.15 (Meets Bar)** — controls implemented and test-covered (reduced motion incl. OS preference, speed, density, contrast, text scale, keyboard, focus-managed dialogs, ARIA tabs); keyboard e2e (`e2e/keyboard.spec.ts`); 66-test audit: 52 implemented, 1 static-proven miss (skip-to-content link, S4) (`validation-pack/accessibility-audit.md`); **documented MED findings F1–F4 on the new surfaces are unverified as fixed** (`docs/a11y-audit-platform.md`) | **0.8 → 0.20 (Finalist)** — contingent on: F1–F4 verified fixed against the current build (or fixed overnight), a keyboard-only manual pass by a non-implementer, an axe/WCAG scan with recorded output, and OS reduced-motion verified on camera (all in `validation-pack/morning-checklist.md` §6/§2) | **0.8 → 0.20** — a session can add the "used independently" evidence (protocol Part C observation checklist) but independent operation by the target learner is the Finalist→Winner differentiator (1.0); do not project Winner |
| **Technical Execution (10%)** | **0.6 → 0.06 (Meets Bar)** — typed domain, seeded deterministic core with caps, counterfactual constraint in code, adaptation provably unable to touch science; CI (lint/typecheck/unit/build/bundle-secret-scan); **real-backend integration 15/15, executed twice** (`docs/backend-verification.md`); validators + indexes + optimistic concurrency on live Atlas (`docs/mongo-schema.md`). Caps: no deployed URL verified; test-count reconciliation pending (README 302/25 vs coordinator 363+/24–25) | **0.8 → 0.08 (Finalist)** — contingent on: full suite green with recorded output, production build + bundle scan CLEAN recorded, deployed URL live (Vercel env vars + authorized domains verified), repo public, and (if credentials allow) the cross-device e2e run with `CROSS_DEVICE_E2E=1` | **0.8 → 0.08** — unchanged; the session does not affect this row |
| **Presentation Quality (10%)** | **0.0 → 0.00 (Not Evaluated)** — no video exists; a criterion with no artifact scores 0 until the artifact exists (`validation-pack/rubric-audit.md`, Criterion 5) | **0.6 → 0.06 (Meets Bar)** — recorded ≤3:00 video per `docs/demo-script-final.md` showing the real product loop with honest limitations. **0.8 → 0.08 (Finalist)** — the video includes the static-sim-beating moment (contradicted prediction → ceiling → evidence-linked offer → counterfactual → second trial → replay) and states scope honestly | **0.6–0.8 → 0.06–0.08** — a re-cut with real (not placeholder) participant framing is possible if the morning session runs; the artifact is what scores, so the ceiling is the same as the overnight column |

---

## Composite ranges

| Scenario | Sum | Reading |
|---|---|---|
| **Verified current state (today, no morning work)** | 0.12 + 0.15 + 0.15 + 0.06 + 0.00 = **0.48 (48/100)** | Below the official bar band (0.6). Matches the pack's honest pre-artifact state. |
| **Overnight ceiling (engineering + artifacts, NO participant)** | 0.12 + 0.20 + 0.20 + 0.08 + 0.06–0.08 = **0.66–0.68 (66–68/100)** | "Finalist potential" band (0.6–0.79). Reached by converting the overnight contingencies — none of which require the participant. |
| **Post-participant projected (session runs well)** | 0.18 + 0.20 + 0.20 + 0.08 + 0.06–0.08 = **0.72–0.80 (72–80/100)** | Upper edge of "Finalist potential" → lower edge of Finalist-to-Winner. The 0.80 endpoint requires the Finalist presentation artifact AND a complete, honestly recorded session. |

**Conservative guidance:** quote **66–68/100 overnight** and **72–80/100 with a completed session**
to the team; quote **nothing above 80** to anyone — the Winner band requires demonstrated,
recorded improvement for the learner (Impact 1.0) which one session cannot honestly claim.

## What each ceiling is contingent on (checklist form — all in `validation-pack/morning-checklist.md`)

- [ ] Impact 0.6: session ran per protocol; consent, pre/post, quotes, export, one revision recorded in docs.
- [ ] AI 0.8: proposal trace + fallback proof captured; `docs/ai-benchmark.md` exists (flag to coordinator if still missing).
- [ ] Usability 0.8: F1–F4 verified/fixed; keyboard manual pass + axe scan recorded; OS reduced-motion on camera.
- [ ] Technical 0.8: full suite output recorded and count reconciled; deployed URL + public repo verified; bundle scan CLEAN.
- [ ] Presentation 0.6–0.8: video recorded ≤3:00 + backup; honest scope framing.

## Known caps (why we do not project higher)

1. One lab is functional; two are `planned` — caps scale claims (`src/domain/experiments.ts:262-287`).
2. No validated-study claim is possible with n=1; every human claim is case-study framed
   (`docs/user-research.md:54`).
3. The hosted LLM provider is intermittently flaky (~60% historical `provider_error` bursts);
   the deterministic fallback is the guaranteed path — this is by design but caps "AI reliability"
   wording (`src/adaptation/llm-client.ts:85`; `docs/judge-question-bank.md` Q9).
4. `npm audit`: 3 high findings in transitive `sharp` (unused), deferred (`README.md:164`).
5. `docs/ai-benchmark.md` was missing at writing time (owned by another agent) — without it,
   AI-axis self-assessment stays at 0.6–0.7.
6. Accessibility: documented MED findings F1–F4 in `docs/a11y-audit-platform.md` until verified
   fixed; no recorded screen-reader/axe pass yet.

---

*Method note: this audit re-uses the rating scale and per-criterion standards from
`validation-pack/rubric-audit.md` (which was written pre-platform; this file is the post-
platform, overnight-90 update). All ratings are self-assessments backed by the artifacts cited;
the morning checklist is the conversion plan.*
