# UnseenLab — Release Gates

> **RE-STAMPED on the final-hardening branch.** Gate statuses below were corrected for the
> current product. What changed since the original audit: the repeatable multi-trial loop
> (single-run constraint gone), the `feedbackTiming` control removed, the disclaimer always
> visible, replay-dialog focus trap + OS `prefers-reduced-motion` + WAI-ARIA tabs + no per-frame
> aria-live + effective text scale all implemented, the five unused `public/` SVGs deleted,
> and an optional structured LLM provider implemented behind `/api/adapt` with a deterministic
> fallback and honest "AI interpretation"/"Offline rules" labeling. **Unchanged:** no structured
> user-testing session has run; a real participant session is still required.

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
- Meaningful AI: **RESOLVED** — the adaptation layer is a deterministic rules engine by default (`src/adaptation/deterministic-provider.ts`), and an optional structured LLM provider is now implemented behind the same interface and a server bridge (`src/adaptation/llm-provider.ts`, `src/app/api/adapt/route.ts`), gated by `NEXT_PUBLIC_LLM_ENABLED` + server `LLM_API_KEY`, with labeled "AI interpretation"/"Offline rules" badges and deterministic fallback. The README describes this honestly.

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
- [ ] The safety disclaimer is visible in the demo (always visible in the lab header now — GATE B defect resolved).
- [ ] "AI" claims are labeled and honest: the deterministic rules are the default and the hosted interpretation is optional, labeled "AI interpretation", and bounded (schema-validated, server-side key, fallback on any failure).

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
7. **Simplification notice visible:** PASS — disclaimer exists (`src/domain/experiments.ts:12-15`), renders in the header and landing (`src/components/lab/experiment-shell.tsx`, `src/app/page.tsx`), and is **no longer hidden in low-density mode** (the density defect was fixed on the final-hardening branch).
8. **Dangerous operational queries refused:** PASS structurally — the optional hosted path only accepts the bounded typed payload and returns schema-validated answers (see `safety-abuse-cases.md` Group A re-test note); the default path has no generative AI at all.

**Blocking defects:**
- Engine lacks explicit `Number.isFinite` guard in `clampParameter` (S3 defense-in-depth; `src/domain/experiments.ts`) — see SAFE-021. (Non-finite inputs are already rejected at the zod boundary and normalized in the run path; this is defense-in-depth, not an observed failure.)
- Test suite not executed in this audit (current suite: 166 unit/component tests across 17 files + 12 Playwright e2e across 4 specs; suites exist at `tests/` and `e2e/`; results must be re-recorded for submission evidence).

**Repair hours estimate:** 2h (optional NaN-guard defense-in-depth 1h + run and record the full suite 1h).

**Pass criteria (exact checklist):**
- [ ] `npm run test` green: determinism, zero-neutron, nonnegativity, caps, counterfactual, clamp, adaptation rules.
- [ ] `npm run test:e2e` green (smoke flow).
- [ ] `npm run build` green; `npm run lint` and `npm run typecheck` clean.
- [ ] Low-density mode still shows the safety disclaimer.
- [ ] `clampParameter(NaN)` returns a finite in-range value (new test).
- [ ] Grep confirms zero network primitives in the core flow (the only network call in the app is the optional `POST /api/adapt` bridge when the hosted path is enabled) and zero `dangerouslySetInnerHTML` (already verified — re-check before submission).
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
- **"AI" label overstates a rules engine:** RESOLVED — the product now has both: the deterministic rules remain the default and always-available fallback, and an optional structured LLM provider is implemented behind the same `AdaptationProvider` interface and the `POST /api/adapt` bridge (`src/adaptation/llm-provider.ts`, `src/app/api/adapt/route.ts`). It is gated by `NEXT_PUBLIC_LLM_ENABLED` (build time) + server `LLM_API_KEY`, sends only a typed bounded payload, validates the schema-typed answer, falls back to the rules on ANY failure, and labels proposals "AI interpretation" vs "Offline rules". README/landing wording now matches this.

**Blocking defects:**
- None code-side. Proposal IDs are UUIDs while rule selection is deterministic (`src/adaptation/deterministic-provider.ts`) — fine for UX; the accurate framing "same input yields the same proposal types in the same order" is used in docs and tests.

**Repair hours estimate:** 0h code-side; remaining work is evidence (recorded live trace of a proposal firing from evidence; optionally a live demo with the hosted path enabled).

**Pass criteria (exact checklist):**
- [ ] Every adaptation in the demo is demonstrably triggered by recorded session evidence (show the evidence IDs or the rule in the demo).
- [ ] Demo shows the learner rejecting an adaptation and the app respecting it (no behavior change).
- [ ] Demo shows an accepted adaptation visibly changing the experience (e.g., graph view opens).
- [ ] Materials describe the system as: deterministic rule-based adaptation engine by default, with an optional, labeled, schema-bounded structured LLM provider behind `/api/adapt` that falls back to the rules on any failure — no silent overstatement.
- [ ] No diagnosis-based presets claimed anywhere (verified: `README.md:17`, landing copy).

---

## GATE D — Accessibility

**Purpose:** Match the rubric's 25% "Usability and Accessibility" weight; the product's thesis is serving learners who think differently, so accessibility evidence must be concrete, not asserted.

**Owner:** Design/UX reviewer (with a keyboard-only pass performed by a second person).

**Current status: PARTIAL**

Justification, per item:
- **Full core flow keyboard-only:** PASS structurally — all controls are native `<button>`/`<input type="range">`/`<select>`/`<textarea>` elements; no custom focus-managed widgets. **RESOLVED (final-hardening):** the Adaptation Replay dialog now traps focus, moves focus in on open, and restores it on close; the representation tabs implement the WAI-ARIA tabs pattern (roving tabindex + arrow keys).
- **Reduced motion works:** PASS — in-app toggle (static-frame rendering, no pulses) AND OS `prefers-reduced-motion` is now honored on load (final-hardening); the provider never suggests `slow_animation` when reduced motion is enabled.
- **Animation can pause:** PASS — Play/Pause/step/back/reset controls.
- **Text alternative exists:** PASS — plain-language state summary doubles as screen-reader summary; labeled sections and `aria-label`s throughout. The per-frame `aria-live` announcements were removed (final-hardening) — the summary is announced at deliberate points, not every animation step.
- **No color-only meaning:** PASS — states pair color with text/labels.
- **Focus visible:** PASS — `:focus-visible` styling exists.
- **Text size effective:** PASS (final-hardening) — text scale (1–1.5×) is applied at the root font-size so all text scales; the old container-`font-size` no-op is gone.
- **Low-density mode changes density:** PASS — it reduces explanations without hiding the safety disclaimer (the disclaimer is always visible in the lab header).
- **No dead controls:** PASS (final-hardening) — the `feedbackTiming` control was removed; nothing in the settings UI promises behavior that does not exist.
- **No forced timer:** PASS — no timer in the app.
- **Learner retains control:** PASS — adaptations are offers, not silent changes.

**Blocking defects:** none code-side. Remaining work is verification: a keyboard-only pass and a screen-reader pass by a person other than the implementer, plus an automated axe/WCAG scan.

**Repair hours estimate:** 2–4h for the verification passes (no code fixes required).

**Pass criteria (exact checklist):**
- [ ] Full flow — predict, run, accept/reject adaptation, counterfactual, open/close replay, research mode, clear session — completed with Tab/Enter/Space only, by a person other than the implementer.
- [ ] In the replay dialog, Tab is trapped; focus lands on Close on open and returns to the trigger on close.
- [ ] OS reduced-motion enabled at load → animation renders static frames without user action.
- [ ] Safety disclaimer visible in all density modes.
- [ ] Screen-reader pass: sections announce correctly, and playback does not spam per-frame announcements (use VoiceOver/NVDA for one core flow).
- [ ] `npm run lint` clean (no `jsx-a11y` violations).

---

## GATE E — Demo readiness

**Purpose:** The ≤3-minute demo must work from a clean state, be reproducible, have a backup, and never depend on infrastructure that can fail.

**Owner:** Demo presenter.

**Current status: PARTIAL**

Justification:
- **Hero flow from clean state:** PASS by design — fresh profile + `loadLocalSession` defaults; the e2e suite encodes the intended path (smoke: open → enter lab → predict → withdraw absorber → run → adaptation → accept → counterfactual → replay; multi-trial: three trials without a reload).
- **Seed stable:** PASS by inspection — seeded engine, deterministic replay (GATE B item 1).
- **Demo fits 2:45:** NOT EVALUATED — no video exists; script drafted (`docs/product-spec.md` §Demo flow and `validation-pack/demo-script.md`, re-stamped for the multi-trial loop).
- **Backup recording exists:** **NO** — must create (primary + backup, different recording method).
- **No load-bearing network dependency:** PASS — the scientific core, rules, storage, and rendering are fully client-side. The only network call in the app is the optional `POST /api/adapt` (hosted path only), which is labeled and falls back to deterministic rules on any failure; no server/database/auth is required.
- **Impact numbers real or omitted:** UNVERIFIED — no test session has run, so no impact metrics exist; the demo must not invent any (docs explicitly forbid claiming results).
- **Failure fallback rehearsed:** **NO** — no rehearsal of mid-demo recovery (e.g., `npm run dev` restart, port conflict, cleared localStorage, hosted-model-down fallback proof).

**Blocking defects:**
- No video (primary or backup).
- No impact numbers (fine to omit — omit, do not invent).
- No rehearsal of failure fallback (including the hosted-model-down → "Offline rules" recovery).

**Repair hours estimate:** 4–5h (script rehearsal + record primary and backup 3–4h; failure-fallback runbook 0.5h; clean-state verification 0.5h).

**Pass criteria (exact checklist):**
- [ ] Clean browser profile, incognito window, `npm run dev` from a fresh clone → hero flow (two trials) complete in one take.
- [ ] Video length ≤ 3:00 (target 2:45); audio legible; English or subtitles.
- [ ] Second recording exists in a different location/format.
- [ ] Demo shows: disclaimer, prediction-before-run, adaptation offer + accept AND a rejection, counterfactual (one variable), updated prediction, a second trial, replay listing both trials.
- [ ] No metric is spoken or displayed that is not backed by a recorded test session.
- [ ] Presenter has a written 1-page runbook: restart commands, clearing localStorage (`clearLocalSession`, `src/storage/session-storage.ts`), the hosted-model-down fallback line, and the honest answer to "is this AI?" (deterministic rules by default + optional, labeled, bounded hosted interpretation).

---

## Combined gate-status table

| Gate | Purpose | Status | Blocking defects (count) | Repair estimate |
|---|---|---|---|---|
| A — Disqualification prevention | Not get disqualified | PARTIAL | 3 (repo public, video, structured test) | 4–6h |
| B — Scientific integrity | Truthful, bounded, tamper-proof core | PARTIAL | 2 (NaN-guard defense-in-depth, unrecorded suite run) | 2h |
| C — Adaptive legitimacy | Evidence-driven, learner-controlled adaptation | PARTIAL | 0 code-side (recorded live trace + optional hosted demo pending) | 1–2h evidence |
| D — Accessibility | 25% rubric weight, keyboard/motion/safety | PARTIAL | 0 code-side (verification passes pending) | 2–4h verification |
| E — Demo readiness | ≤3:00 reproducible demo with backup | PARTIAL | 3 (no video, no impact numbers — omit, no rehearsal) | 4–5h |

## BLOCKED until (fewest actions that unblock submission)

1. **Make the repository public** and record the URL in the submission (Gate A; unverifiable in this audit).
2. **Record the demo video (≤ 3:00) plus a backup recording** and rehearse the failure fallback, including the hosted-model-down → "Offline rules" recovery (Gate A + E).
3. **Run and record the full test suite** (`npm run test`, `npm run test:e2e`, `npm run build`, `npm run lint`, `npm run typecheck`) and fix any failures (Gate B). Current counts to verify: 166 unit/component tests across 17 files; 12 e2e tests across 4 specs.
4. **Optional defense-in-depth:** `Number.isFinite` clamp guard (~1h, Gate B).
5. **Verify accessibility by hand:** one keyboard-only pass and one screen-reader pass by a non-implementer, plus an automated axe/WCAG scan (Gate D).
6. **Either run one structured product-test session with consent** (fills `docs/user-research.md` templates) or keep claims scoped to the design interview — do not invent results (Gate A + E). A real participant session is still required.
