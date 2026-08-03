# UnseenLab — Release Gates

Pre-submission gates for the IncludAI / Stanford NNEA Track 1 hackathon submission. Each gate must be certified by the named owner before the submission deadline. Statuses are based on static inspection of `/Users/saiaathishkarthik/Desktop/UnseenLab` (the audit worktree contains only the app shell); no test suite was executed during this audit, so runtime-dependent statuses are marked accordingly.

Severity rubric (for the blocking defects): S0 Disqualifying | S1 Winner-blocking | S2 Finalist-blocking | S3 Important | S4 Polish.

---

## GATE A — Disqualification prevention

**Purpose:** Eliminate every failure mode that gets a submission disqualified outright before judging begins.

**Owner:** Submission lead (must certify; a second person re-checks the submitted URLs and the video file on a fresh machine).

**Evidence required:**
- Real user involvement documented (who, what they did, what changed as a result) — currently `docs/user-research.md:5-30` (initial design participant) plus empty templates `docs/user-research.md:32-45`.
- No fake evidence anywhere (README explicitly disclaims: "No structured product test has been performed yet", `README.md:121`; `docs/user-research.md:3,56-61`).
- Repository public and reachable before submission.
- Video ≤ 3 minutes.
- Substantial work built during the event (README: "Substantially built during the hackathon", `README.md:120`).
- Meaningful AI use.
- Track selected (Track 1, `README.md:3`).
- Safety boundary present (`simulationDisclaimer` rendered, `src/components/lab/experiment-shell.tsx:338-342`; `src/domain/experiments.ts:12-15`; `docs/safety-model.md`).

**Current status: PARTIAL**

Justification:
- Real user involvement: initial design interview confirmed and honestly labeled (`docs/user-research.md:5-30`). No structured product test yet — this is disclosed, so it is not a disqualification risk as long as claims stay scoped.
- No fake evidence: PASS by inspection — the repo's own docs refuse to claim unperformed tests (`README.md:121`, `docs/user-research.md:32-45,56-61`).
- Repository public: **NOT VERIFIED / AT RISK.** README asserts "Public GitHub repository: this repository" (`README.md:127`) but no remote URL or repository link was verifiable in this audit (no git commands were run per instruction; the environment reports the workspace as not a git repo). Submission must verify the URL resolves in a logged-out browser.
- Video: NOT CREATED (README: "Three-minute demo video: planned", `README.md:128`; demo script exists at `docs/product-spec.md:74`).
- Meaningful AI: **CURRENT RISK** — the adaptation layer is a deterministic rules engine (`src/adaptation/deterministic-provider.ts:22-31`), no LLM/AI SDK exists (`package.json:15-20`), and README already discloses this (`README.md:114`). "AI" language in the tagline (`README.md:5`) overstates the implementation; see GATE C.

**Blocking defects:**
- No live public repository URL (S0 if unresolved by submission).
- No demo video (S0 — video is a stated requirement, `README.md:128`).
- No structured product-test session with the participant (S3 — does not disqualify if scoped honestly; strengthens submission if completed).

**Repair hours estimate:** 4–6h (make repo public + verify 0.5h; script + record + backup 2–3h; one structured test session with consent 1–2h).

**Pass criteria (exact checklist):**
- [ ] GitHub repo is public; link opens logged-out; README renders; all referenced docs exist (`README.md:104-106` list matches the actual `docs/` directory — verified: all 7 files exist).
- [ ] Video exists, is ≤ 3:00 (hard stop at 2:45 for margin), is English or has subtitles, and demonstrates the real product (not slides).
- [ ] A named neurodivergent participant is documented with what was learned and what changed (design interview is sufficient minimum; product test preferred).
- [ ] No claim in any submission artifact is unsupported (grep README/docs for "we plan to" — see checklist).
- [ ] Track 1 stated.
- [ ] The safety disclaimer is visible in the demo (see GATE D defect: it disappears in low-density mode — demo must not toggle low-density before showing it, or the defect must be fixed).
- [ ] "AI" claims are either made honest (rules engine labeled as such) or upgraded to a real LLM provider with the safety re-test list from `safety-abuse-cases.md`.

---

## GATE B — Scientific integrity

**Purpose:** The simulation must be deterministic, bounded, nonnegative, and tamper-proof against the adaptation layer — this is the submission's core technical truthfulness claim.

**Owner:** Lead engineer.

**Evidence required:**
- Seed replay determinism (engine + tests).
- Zero-neutron case.
- Nonnegative state.
- Safety caps (500 population, 120 steps).
- Counterfactual changes exactly one variable.
- AI cannot modify outcomes.
- Simplification notice visible.
- Dangerous operational queries refused.

**Current status: PARTIAL** (code-verified items PASS by inspection; test-suite execution and the "dangerous query" surface are the open items).

Justification, per item:
1. **Seed replay:** PASS by inspection — pure Mulberry32 PRNG (`src/simulation/nuclear-chain-reaction.ts:25-34`), no `Date`/`Math.random` in the engine, same seed + params → identical timeline; tests "deterministic replay: identical seed and parameters produce identical snapshots" and "seeded random is deterministic" (`tests/simulation/nuclear-chain-reaction.test.ts:19,174`).
2. **Zero-neutron case:** PASS by inspection — early return with `stopReason = "extinct"` (`src/simulation/nuclear-chain-reaction.ts:68-71`); clamp intentionally allows `startingNeutrons = 0` (`src/domain/experiments.ts:194-196`); test exists (`tests/simulation/nuclear-chain-reaction.test.ts:27`).
3. **Nonnegative state:** PASS by construction — subtraction is bounded by population-at-step-start; test "state never goes negative and never exceeds the population cap" (`tests/simulation/nuclear-chain-reaction.test.ts:38`).
4. **Safety caps:** PASS by inspection — `MAX_POPULATION = 500`, `MAX_STEPS = 120` (`src/domain/experiments.ts:17-19`); cap stop conditions at `src/simulation/nuclear-chain-reaction.ts:101-106`; tests at `tests/simulation/nuclear-chain-reaction.test.ts:53,61`.
5. **Counterfactual one variable:** PASS by inspection — allowed list excludes `durationSteps` and `seed` (`src/simulation/counterfactual.ts:15-20`), disallowed variables throw (`:38-42`), same seed/duration preserved (`:44-48`); tests `tests/simulation/counterfactual.test.ts:20,43,53`.
6. **AI cannot modify outcomes:** PASS by inspection — adaptation contract "NEVER modifies scientific truth" (`src/domain/adaptation.ts:9-13`); `applyProposedChanges` touches preferences only (`:33-63`); proposals carry only representation/pacing preference changes (`src/adaptation/deterministic-provider.ts:85-193`).
7. **Simplification notice visible:** PARTIAL — disclaimer exists (`src/domain/experiments.ts:12-15`) and renders in header and landing (`src/components/lab/experiment-shell.tsx:338-342`, `src/app/page.tsx:115`) **but is hidden in low-density mode** (`src/components/lab/experiment-shell.tsx:338-342`). Defect: S3 — safety notice should never be conditionally hidden; fix: always render a compact disclaimer or exempt the disclaimer from density filtering (1h).
8. **Dangerous operational queries refused:** PASS structurally — no generative AI exists to answer any query (see `safety-abuse-cases.md` Group A); must be re-verified if an LLM provider is added.

**Blocking defects:**
- Disclaimer hidden when `informationDensity === "low"` (S3; `src/components/lab/experiment-shell.tsx:338-342`).
- Engine lacks explicit `Number.isFinite` guard in `clampParameter` (S3 defense-in-depth; `src/domain/experiments.ts:188-202`) — see SAFE-021.
- Test suite not executed in this audit (README claims 60 unit/component tests and 1 e2e smoke, `README.md:85-86`; suites exist at `tests/` and `e2e/smoke.spec.ts`; a `test-results/` directory exists in the repo suggesting prior runs — results must be re-recorded for submission evidence).

**Repair hours estimate:** 2h (disclaimer fix 1h, NaN guard + test 1h) + 1h to run and record the full suite.

**Pass criteria (exact checklist):**
- [ ] `npm run test` green: determinism, zero-neutron, nonnegativity, caps, counterfactual, clamp, adaptation rules.
- [ ] `npm run test:e2e` green (smoke flow).
- [ ] `npm run build` green; `npm run lint` and `npm run typecheck` clean.
- [ ] Low-density mode still shows the safety disclaimer.
- [ ] `clampParameter(NaN)` returns a finite in-range value (new test).
- [ ] Grep confirms zero network primitives and zero `dangerouslySetInnerHTML` (already verified — re-check before submission).
- [ ] Counterfactual UI offers exactly four variables, never seed/duration (`src/components/lab/counterfactual-panel.tsx:86-93`).

---

## GATE C — Adaptive legitimacy

**Purpose:** The adaptation feature must be genuinely adaptive (driven by session evidence), visibly change the experience, respect learner control, and not overstate its intelligence.

**Owner:** Product lead (with engineer for evidence checks).

**Current status: PARTIAL**

Justification:
- **Adaptation uses session evidence:** PASS — every proposal carries `evidenceIds` (`src/adaptation/deterministic-provider.ts:66`); rules fire on trials/predictions/representation events (`:50-193`); taxonomy attaches record IDs (`src/adaptation/misconception-taxonomy.ts:233,239,253,265,314,335,366,375`).
- **Adaptation visibly changes the experience:** PASS — accepting `show_graph` switches the active representation (`src/components/lab/experiment-shell.tsx:263-267`) and `applyProposedChanges` mutates persisted preferences (`:260-262`); covered by tests (`tests/components/lab-flow.test.tsx:58`).
- **Learner can reject:** PASS — Accept / Reject / Modify on the adaptation card (`src/components/lab/experiment-shell.tsx:440-446`); reject applies zero changes (`:254-259`); test "rejects all offered adaptations and keeps control" (`tests/components/lab-flow.test.tsx:76`).
- **Rejected adaptation respected:** PASS — rejected types are never re-proposed (`src/adaptation/deterministic-provider.ts:39-43,61`); test "never re-proposes a previously rejected type" (`tests/adaptation/deterministic-provider.test.ts:204`).
- **No diagnosis inferred:** PASS — schema has no identity/diagnosis fields (`src/domain/learner.ts:31-44`); classifier language is explicitly non-judgmental (`src/adaptation/misconception-taxonomy.ts:16-26`).
- **Static-simulation comparison defensible:** PASS — counterfactual microscope (one variable, same seed) and Adaptation Replay (recorded evidence only) differentiate it from a plain slider toy (`src/simulation/counterfactual.ts:9-14`; `src/components/lab/adaptation-replay.tsx:31-35,225-228`).
- **"AI" label overstates a rules engine:** FAIL — tagline says "adaptive AI engine" (`README.md:5`), landing says "adaptive engine" (`src/app/page.tsx:22-23`), while the provider is bounded deterministic rules (`src/adaptation/deterministic-provider.ts:22-31`) and no AI SDK exists (`package.json:15-20`). README does disclose this honestly in its limitations (`README.md:114`), which is good, but the external-facing pitch language needs alignment.

**Blocking defects:**
- External language calls the rules engine "AI" while the implementation is deterministic rules (S2 for the "Innovation in AI Application" 25% rubric axis — judges will probe the AI claim; a rules engine honestly framed scores better than an overstated one).
- Proposal determinism is partial: rule selection is deterministic, but proposal IDs are UUIDs (`src/adaptation/deterministic-provider.ts:17,63`) — fine for UX, but the doc claim "same input yields the same proposal types in the same order" (test `tests/adaptation/deterministic-provider.test.ts:356`) is the accurate framing to use everywhere.

**Repair hours estimate:** 2h (align README/landing/script wording; prepare a 30-second "what is AI here and what is not" explanation for Q&A). Alternatively 12–20h to add a real structured LLM provider — then re-run the Group A/B safety cases.

**Pass criteria (exact checklist):**
- [ ] Every adaptation in the demo is demonstrably triggered by recorded session evidence (show the evidence IDs or the rule in the demo).
- [ ] Demo shows the learner rejecting an adaptation and the app respecting it (no behavior change).
- [ ] Demo shows an accepted adaptation visibly changing the experience (e.g., graph view opens).
- [ ] Materials describe the system as "deterministic rule-based adaptation engine (designed to be replaceable by an LLM provider)" or ship a real LLM — no silent overstatement.
- [ ] No diagnosis-based presets claimed anywhere (verified: `README.md:17`, `src/app/page.tsx:119-120`).

---

## GATE D — Accessibility

**Purpose:** Match the rubric's 25% "Usability and Accessibility" weight; the product's thesis is serving learners who think differently, so accessibility evidence must be concrete, not asserted.

**Owner:** Design/UX reviewer (with a keyboard-only pass performed by a second person).

**Current status: PARTIAL**

Justification, per item:
- **Full core flow keyboard-only:** PASS structurally — all controls are native `<button>`/`<input type="range">`/`<select>`/`<textarea>` elements (`src/components/lab/variable-controls.tsx:86-96`, `src/components/lab/prediction-panel.tsx:99-140`, `src/components/lab/counterfactual-panel.tsx:69-93`, `src/components/lab/accessibility-controls.tsx:37-45`); no custom focus-managed widgets. **FAIL:** the Adaptation Replay dialog has no focus trap and no initial focus — Tab can leave the modal, focus does not return on close (`src/components/lab/adaptation-replay.tsx:258-289`; only Escape handling exists at `:43-49`). Native `<dialog>` or a focus-trap wrapper fixes this.
- **Reduced motion works:** PASS for the in-app toggle — static-frame rendering when `reducedMotion` is on (`src/components/lab/simulation-canvas.tsx:87,320-323`; test `tests/components/lab-flow.test.tsx:148`); provider never suggests `slow_animation` when reduced motion is enabled (`src/adaptation/deterministic-provider.ts:136-144`). **PARTIAL/FAIL for OS preference:** no `@media (prefers-reduced-motion)` in `globals.css` (grep verified — only `:focus-visible` at `src/app/globals.css:70`); the app honors only its own toggle, so OS-level reduced motion is ignored on load.
- **Animation can pause:** PASS — Play/Pause/step/back/reset controls (`src/components/lab/simulation-canvas.tsx:131-134`; README `README.md:49`).
- **Text alternative exists:** PASS — plain-language state summary doubles as screen-reader summary (`README.md:54`), labeled sections and `aria-label`s throughout (`src/components/lab/prediction-panel.tsx:51-53`, `src/components/lab/adaptation-replay.tsx:270-273`).
- **No color-only meaning:** PASS — states pair color with text/labels (e.g., comparison table text "Original"/"Counterfactual", `src/components/lab/counterfactual-panel.tsx:200-232`).
- **Focus visible:** PASS — `:focus-visible` styling exists (`src/app/globals.css:70`).
- **Low-density mode changes density:** PARTIAL — it removes explanations (`src/components/lab/variable-controls.tsx:97-101`) and the disclaimer (`src/components/lab/experiment-shell.tsx:338-342`); hiding the disclaimer is the defect (see GATE B).
- **No forced timer:** PASS — no timer in the app (grep verified; README `README.md:59`).
- **Learner retains control:** PASS — adaptations are offers, not silent changes (`src/components/lab/experiment-shell.tsx:440-446`; README `README.md:24`).

**Blocking defects:**
- No focus trap / initial focus / focus restore in the Adaptation Replay dialog (S3; `src/components/lab/adaptation-replay.tsx:258-289`).
- OS-level `prefers-reduced-motion` not honored (S3).
- Disclaimer hidden in low-density mode (S3; safety-relevant, see GATE B).

**Repair hours estimate:** 3–4h (focus trap 1h; `prefers-reduced-motion` media-query hook on initial load 0.5h; disclaimer always-visible 0.5h; keyboard-only verification pass 1–2h).

**Pass criteria (exact checklist):**
- [ ] Full flow — predict, run, accept/reject adaptation, counterfactual, open/close replay, research mode, clear session — completed with Tab/Enter/Space only, by a person other than the implementer.
- [ ] In the replay dialog, Tab is trapped; focus lands on Close on open and returns to the trigger on close.
- [ ] OS reduced-motion enabled at load → animation renders static frames without user action.
- [ ] Safety disclaimer visible in all density modes.
- [ ] Screen-reader pass: sections announce correctly (use VoiceOver/NVDA for one core flow).
- [ ] `npm run lint` clean (no `jsx-a11y` violations).

---

## GATE E — Demo readiness

**Purpose:** The ≤3-minute demo must work from a clean state, be reproducible, have a backup, and never depend on infrastructure that can fail.

**Owner:** Demo presenter.

**Current status: PARTIAL**

Justification:
- **Hero flow from clean state:** PASS by design — fresh profile + `loadLocalSession` defaults (`src/components/lab/experiment-shell.tsx:71-75`); the e2e smoke encodes the intended hero path: open → enter lab → predict → withdraw absorber → run → adaptation → accept → counterfactual → replay (`e2e/smoke.spec.ts`; README `README.md:86`).
- **Seed stable:** PASS by inspection — seeded engine, deterministic replay (GATE B item 1).
- **Demo fits 2:45:** NOT EVALUATED — no video exists; script drafted (`docs/product-spec.md:74`).
- **Backup recording exists:** **NO** — must create (primary + backup, different recording method).
- **No load-bearing API dependency:** PASS — fully offline, zero network (grep verified), no server/database/auth (`README.md:116`); `next/font/google` fonts self-host at build (`src/app/layout.tsx:2`).
- **Impact numbers real or omitted:** UNVERIFIED — no test session has run (`README.md:121`), so no impact metrics exist; the demo must not invent any (docs explicitly forbid claiming results: `docs/user-research.md:56-61`).
- **Failure fallback rehearsed:** **NO** — no rehearsal of mid-demo recovery (e.g., `npm run dev` restart, port conflict, cleared localStorage).

**Blocking defects:**
- No video (primary or backup).
- No impact numbers (fine to omit — omit, do not invent).
- No rehearsal of failure fallback.

**Repair hours estimate:** 4–5h (script rehearsal + record primary and backup 3–4h; failure-fallback runbook 0.5h; clean-state verification 0.5h).

**Pass criteria (exact checklist):**
- [ ] Clean browser profile, incognito window, `npm run dev` from a fresh clone → hero flow complete in one take.
- [ ] Video length ≤ 3:00 (target 2:45); audio legible; English or subtitles.
- [ ] Second recording exists in a different location/format.
- [ ] Demo shows: disclaimer, prediction-before-run, adaptation offer + accept AND a rejection, counterfactual (one variable), replay.
- [ ] No metric is spoken or displayed that is not backed by a recorded test session.
- [ ] Presenter has a written 1-page runbook: restart commands, clearing localStorage (`clearLocalSession`, `src/storage/session-storage.ts:102-110`), and the honest answer to "is this AI?" (rule-based engine + provider interface).

---

## Combined gate-status table

| Gate | Purpose | Status | Blocking defects (count) | Repair estimate |
|---|---|---|---|---|
| A — Disqualification prevention | Not get disqualified | PARTIAL | 3 (repo public, video, structured test) | 4–6h |
| B — Scientific integrity | Truthful, bounded, tamper-proof core | PARTIAL | 3 (disclaimer in low-density, NaN guard, unrecorded suite run) | 3h |
| C — Adaptive legitimacy | Evidence-driven, learner-controlled adaptation | PARTIAL | 2 (AI overstatement, framing) | 2h (rules path) or 12–20h (LLM path) |
| D — Accessibility | 25% rubric weight, keyboard/motion/safety | PARTIAL | 3 (focus trap, prefers-reduced-motion, disclaimer visibility) | 3–4h |
| E — Demo readiness | ≤3:00 reproducible demo with backup | PARTIAL | 3 (no video, no impact numbers — omit, no rehearsal) | 4–5h |

## BLOCKED until (fewest actions that unblock submission)

1. **Make the repository public** and record the URL in the submission (Gate A; unverifiable in this audit).
2. **Record the demo video (≤ 3:00) plus a backup recording** and rehearse the failure fallback (Gate A + E).
3. **Run and record the full test suite** (`npm run test`, `npm run test:e2e`, `npm run build`, `npm run lint`, `npm run typecheck`) and fix any failures (Gate B).
4. **Fix three small defects:** disclaimer always visible, dialog focus trap, `Number.isFinite` clamp guard — ~3h total (Gates B + D).
5. **Align the "AI" framing** in README/landing/demo script with the deterministic rules engine, or ship a real LLM provider and re-run the safety re-test list (`safety-abuse-cases.md`, "What must be re-tested if an LLM provider is added") (Gate C).
6. **Either run one structured product-test session with consent** (fills `docs/user-research.md:32-45`) or keep claims scoped to the design interview — do not invent results (Gate A + E).
