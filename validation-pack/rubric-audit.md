# UnseenLab — Rubric Audit (Validation Pack)

**Product:** UnseenLab — Adaptive Virtual STEM Laboratory. Track 1 ("AI for Learners Who Think Differently"), IncludAI: The Neurodiversity Hackathon.

**Pitch (verbatim, src/app/page.tsx:19-25):** "UnseenLab lets students safely perform otherwise inaccessible STEM experiments — dangerous, radioactive, microscopic, massive, or too slow for a classroom — while an adaptive engine changes how each experiment is represented, paced, and controlled according to the learner's demonstrated understanding."

**Design principle (README.md:11):** "adapt the tool to the student, not the student to the tool."

**One implemented lab:** Conceptual Nuclear Chain Reaction (educational, fictionalized, dimensionless; explicit disclaimer at src/domain/experiments.ts:12-15 and src/simulation/nuclear-chain-reaction.ts:11-16). Two further labs registered as `Planned`, non-functional (src/domain/experiments.ts:241-262).

**Design participant:** ~17-year-old high-school senior, disclosed ADHD, aspiring mountain biker, engineering interest; Modern Physics (AP Physics 2) was difficult; classroom demos lacked interactivity; interactivity and animation strongly valued (docs/user-research.md:7-14, 16-20). CONFIRMED FACTS ONLY — no testing has occurred; no learning-outcome claim is made (README.md:121; docs/user-research.md:56-61).

---

## Rubric (official weights)

| Criterion | Weight |
|---|---|
| Impact on Neurodivergent Youth | 30% |
| Innovation in AI Application | 25% |
| Usability and Accessibility | 25% |
| Technical Execution | 10% |
| Presentation Quality | 10% |

## Rating scale

**Disqualifying / Below Bar / Meets Bar / Finalist / Winner**

## Severity scale (used for findings)

- **S0 Disqualifying** — the entry cannot be considered under the rubric.
- **S1 Winner-blocking** — cannot win under current evidence.
- **S2 Finalist-blocking** — cannot reach finalist under current evidence.
- **S3 Important** — materially weakens a criterion but fixable.
- **S4 Polish** — cosmetic or documentary.

## Audit method

- Source inspection of the product checkout (read-only): `src/`, `tests/`, `e2e/`, `docs/`, `README.md`, `package.json` at `/Users/saiaathishkarthik/Desktop/UnseenLab`.
- **Citation note:** file:line references are repo-root-relative paths in the product checkout. The audit worktree snapshot (`UnseenLab-audit-worktree`, commit `8d6b77a`) contains only the create-next-app scaffold, so product citations cannot be verified against the snapshot itself; they were verified against the product checkout's committed state (`e4a6d0a`).
- **Tests NOT executed** by this audit. 7 test files and 1 Playwright smoke spec were reviewed conceptually (see Technical Execution). README.md:85 claims "60 unit/component tests"; the product-fact sheet reports 59 — exact count UNVERIFIED without running `npm test`.
- **User evidence pending:** no structured product test session exists (README.md:121). All impact/user-claims are therefore UNVERIFIED.
- Evidence that does not yet exist is marked **UNVERIFIED** or **NOT YET INSPECTABLE** — nothing is invented.

---

# Criterion 1 — Impact on Neurodivergent Youth (Weight 30%)

- **Winner standard:** Demonstrated, recorded improvement for a neurodivergent learner (pre/post confidence, observed friction fixed, at least one iteration based on user feedback), plus a principled story that generalizes without stereotyping.
- **Finalist standard:** One structured test session completed with the design participant, recorded honestly (consent, direct quotes, session JSON export), with at least one product change derived from it.
- **Meets-bar standard:** A real neurodivergent user involved in design; confirmed preferences visibly shaped the product; honest documentation of what is and is not claimed.
- **Below-bar condition:** Design-participant input exists, but no test session, no quotes, no measurable change — impact rests entirely on claims.
- **Disqualifying condition:** No neurodivergent user involvement at all, or fabricated user evidence.
- **Evidence currently inspectable:**
  - Design participant documented: docs/user-research.md:7-14 ("Approximately 17 years old... Has disclosed ADHD..."), confirmed preferences at docs/user-research.md:16-20.
  - Preference → product revision log: docs/user-research.md:24-30 (animation as visual center; representation choice; prediction-before-run; adaptation offers; no diagnosis-based presets).
  - Landing page states the same story: src/app/page.tsx:116-122.
  - Explicit non-claims and empty testing templates: docs/user-research.md:32-61; README.md:121 ("**No structured product test has been performed yet**").
- **Evidence still missing:** Any recorded test session; pre/post confidence and effort data (the measurement protocol exists as placeholders, docs/user-research.md:47-54); direct learner quotes; session JSON export from a real use; consent record.
- **Highest-risk hackathon tell:** Claiming the product "works for ADHD learners" in the pitch, demo, or video on the strength of an interview alone — the tell is an impact story with zero recorded outcomes. README.md:15-17 and docs/user-research.md:56-61 already guard against this; the risk is the live pitch, not the README.
- **Exact remediation:**
  1. Run the documented protocol once with the design participant (docs/user-research.md:47-54): pre-use (confidence, expected effort, learning preferences), use, post-use (confidence, effort, "what became clearer/confusing/remove"), free-text quotes with consent.
  2. Export the session JSON (research-mode.tsx:135-141; src/storage/session-storage.ts:88-100) and attach it to the submission.
  3. Make at least one product change from that session and record the change in docs/user-research.md:24-30.
  4. In every spoken and written claim, keep the "initial design case study, not a validated study" framing (docs/user-research.md:54; src/components/lab/research-mode.tsx:18-19).
- **Estimated repair hours:** 4-8 h (2 sessions + write-up + one iteration), not counting travel.
- **CURRENT RATING: Below Bar (S1).** The design-participant story is strong, documented, and visibly shaped the product (docs/user-research.md:24-30; animation-first canvas src/components/lab/simulation-canvas.tsx:26-37; prediction-required flow src/components/lab/prediction-panel.tsx:35-39). But by the rubric's own bar, "Impact" requires demonstrated effect: zero test sessions, zero quotes, zero outcomes exist (README.md:121). The product is honest about this, which is exactly why it cannot score above Below Bar today. One structured session with a recorded pre/post delta moves this to Meets Bar; a second session plus an iteration moves it toward Finalist.

---

# Criterion 2 — Innovation in AI Application (Weight 25%)

- **Winner standard:** A genuinely novel adaptive mechanism, demonstrably meaningfully "AI", that a static or standard lab cannot reproduce, shown live.
- **Finalist standard:** A working adaptive loop (observe → interpret → intervene → learner decides → re-observe) with at least one novel interaction (e.g., Counterfactual Microscope, Adaptation Replay) and honest framing of what is AI vs rules.
- **Meets-bar standard:** Adaptation is real, evidence-linked, explainable, and learner-controlled; claims match implementation; the "AI" claim is either implemented or honestly re-framed.
- **Below-bar condition:** The adaptation is genuinely novel engineering, but the "AI" claim is unsupported by implementation and unaddressed in the pitch.
- **Disqualifying condition:** The "AI" is a wrapper (chat around static content, prerecorded animation, quiz form) or a claim with no mechanism at all.
- **Evidence currently inspectable:**
  - Adaptation contract: src/domain/adaptation.ts:21-27 (deterministic provider interface, evidence IDs required); implementation src/adaptation/deterministic-provider.ts:32-196.
  - Bounded misconception taxonomy, four statuses (supported/partial/uncertain/contradicted), no diagnosis inference: src/adaptation/misconception-taxonomy.ts:12-26, 28-34, 210-385.
  - Conservative keyword fallback for free text, explicitly labeled as not language understanding: src/adaptation/misconception-taxonomy.ts:104-118, 387-398.
  - Rejected proposal types never re-proposed: src/adaptation/deterministic-provider.ts:39-43, 61.
  - Every proposal carries plain-language reason + evidenceIds: src/adaptation/deterministic-provider.ts:54-72; rendered at src/components/lab/adaptation-card.tsx:102-117.
  - Counterfactual Microscope — exactly one variable, same seed: src/simulation/counterfactual.ts:9-20, 33-59.
  - Adaptation Replay — full journey reconstructed from recorded evidence: src/components/lab/adaptation-replay.tsx:31-229.
  - Dependencies are next/react/react-dom/zod only — no AI/LLM SDK: package.json:15-20. LLM provider "designed-for but not implemented": README.md:44, 114.
- **Evidence still missing:** Any mechanism that interprets free text beyond keyword matching; any evidence that the adaptation loop improves outcomes (tie to Criterion 1); a live-captured trace of a proposal firing from evidence (the e2e smoke asserts only that "Suggested adaptation" text appears: e2e/smoke.spec.ts:31-33, not which proposal fired from which evidence).
- **Highest-risk hackathon tell:** Saying "AI is used meaningfully" in the pitch while package.json contains zero AI dependencies and the README says the LLM provider is not implemented (README.md:114). A judge running `npm ls` or reading package.json:15-20 will catch it in seconds.
- **Exact remediation:**
  1. Re-frame the claim (fastest, zero code risk): change every surface where "AI engine" implies machine learning to "adaptive engine (deterministic rules, AI-ready architecture)" — README.md:5, 44; src/app/page.tsx:19-25; the pitch. ~1-2 h.
  2. OR implement real interpretation: a hosted structured LLM provider behind the existing `AdaptationProvider` interface (src/domain/adaptation.ts:21-27) for free-text prediction classification only. Cost: an API key — which conflicts with the current zero-network, zero-key posture (README.md:73; no fetch in src) — so this is a deliberate trade-off to make explicit, not a default.
  3. Ship the "dead preference" fix (see Novelty Test): either make `feedbackTiming` actually change behavior or remove the control. ~1-2 h.
  4. Capture one recorded live trace (proposal fired with evidence IDs → accepted → preference changed) for the demo. ~1 h.
- **Estimated repair hours:** 2-4 h for honest re-framing + dead-preference fix; 8-20 h for a real LLM interpretation path (plus key/network policy decision).
- **CURRENT RATING: Below Bar → Meets Bar boundary (S2, borderline S1).** The adaptation machinery is real, deterministic, evidence-linked, explainable, and learner-controlled — the Counterfactual Microscope (src/simulation/counterfactual.ts:9-20) and Adaptation Replay (src/components/lab/adaptation-replay.tsx:31-37) are genuinely novel interactions no static lab ships. But the rubric criterion is "Innovation in **AI** Application": today there is no AI, and the pitch's word "AI" is a promise (README.md:114). That is exactly the Below-Bar condition. Because the underlying adaptation is genuinely novel engineering and the interface is AI-ready, a re-frame or a working interpreter moves this to Meets Bar quickly; the current unsupported claim blocks Winner and Finalist defensibility until addressed.

---

# Criterion 3 — Usability and Accessibility (Weight 25%)

- **Winner standard:** Independently operable by the target learner (no setup, no help); OS-level accessibility respected (prefers-reduced-motion); full keyboard/screen-reader operation of all flows including dialogs and tabs; adaptations never force anything.
- **Finalist standard:** Strong basics (focus visibility, reduced-motion option, labelled controls, aria-live summaries) plus a documented plan/backlog for the remaining gaps and at least one accessibility gap closed via user testing.
- **Meets-bar standard:** Good labeled controls, keyboard navigable, visible focus, explicit reduced-motion and contrast options, honest known-gaps list.
- **Below-bar condition:** Basic accessibility exists but core interactions (dialog, tabs) break for assistive tech, or OS preferences are ignored while a product-internal toggle is required.
- **Disqualifying condition:** The app is unusable by keyboard alone, or animations cannot be disabled.
- **Evidence currently inspectable (strengths):**
  - Explicit learner-controlled settings: animationSpeed 0.25-2, reducedMotion, informationDensity, preferredRepresentations, oneVariableMode, highContrast, textScale 1-1.5 (src/domain/learner.ts:31-49; controls at src/components/lab/accessibility-controls.tsx:24-168).
  - :focus-visible outlines: src/app/globals.css:70-74. High-contrast palette: globals.css:21-36.
  - Reduced-motion kill-switch for all CSS animation/transitions: globals.css:38-44; static frames rendered in reduced-motion mode, including pulse replacement glyphs: src/components/lab/simulation-canvas.tsx:311-335.
  - role=switch with aria-checked and description: src/components/lab/accessibility-controls.tsx:189-206; labelled sliders with outputs; radio groups in fieldsets (accessibility-controls.tsx:57-76, 115-134).
  - Plain-language state summary doubling as screen-reader summary: src/components/lab/simulation-canvas.tsx:219-231 (aria-live="polite").
  - Persistent instructions and no-timer/no-flash/no-forced-audio design: README.md:59.
  - Animation never starts on mount; play/pause/step/back/reset: simulation-canvas.tsx:21-25, 128-171.
- **Evidence currently inspectable (known gaps):**
  - No OS `prefers-reduced-motion` media query — reduced motion is only honored after the learner flips the in-app toggle (globals.css:38-44 has only the `html[data-reduced-motion]` rule).
  - Replay dialog has no focus trap, no initial focus, no aria-labelledby (src/components/lab/adaptation-replay.tsx:258-289).
  - Representation tabs use role=tab without roving tabindex, aria-controls, or arrow-key support (src/components/lab/representation-tabs.tsx:43-59).
  - aria-live state summary re-announces on every animation frame while playing (simulation-canvas.tsx:219-231) — screen-reader spam during playback.
  - textScale sets inline `font-size` percentage on the shell (src/components/lab/experiment-shell.tsx:328) but Tailwind v4 sizes are rem-based, so the control likely has no visible effect — needs browser verification (UNVERIFIED behavior, verified code path).
  - Research-mode textareas and replay dialog are reachable only via header buttons; no skip link observed (search of src/ found none).
- **Evidence still missing:** Keyboard-only walkthrough of the full flow; screen-reader run (the smoke test is not accessibility-tested: e2e/smoke.spec.ts); real-device test with the participant; verification of textScale effect; OS-level reduced-motion behavior.
- **Highest-risk hackathon tell:** A demo where the judge toggles OS Reduce Motion (or opens the Replay dialog with a screen reader) and nothing changes / focus escapes the dialog. Both are instant, observable failures.
- **Exact remediation:**
  1. Add `@media (prefers-reduced-motion: reduce)` CSS (and optionally auto-enable the preference on first load via `matchMedia`). ~1-2 h.
  2. Focus trap + initial focus + aria-labelledby in the Replay dialog. ~2 h.
  3. Roving tabindex + arrow-key nav for the representation tabs. ~1-2 h.
  4. Announce the state summary only on pause/stop (or debounce), not per frame. ~1-2 h.
  5. Make textScale effective (rem-based: apply to `<html>` or use CSS zoom) or remove the control. ~1 h.
  6. Run one keyboard-only + one screen-reader pass; record in docs. ~2-3 h.
- **Estimated repair hours:** 7-12 h total for gaps 1-5, plus verification time.
- **CURRENT RATING: Meets Bar (S3).** The basics are genuinely good: every control is labelled with a readable value, focus is visible, reduced-motion is honored once enabled, nothing is silently applied, and the adaptation UI is non-judgmental and explainable (src/components/lab/adaptation-card.tsx:29-33, 102-117). But the known gaps are real and blocking for assistive-tech users: the dialog focus trap, tab keyboard model, per-frame aria-live announcements, and missing OS reduced-motion are each S3 (one or two are S2 in combination). Fixing the five gaps above is 7-12 h of work and would move this criterion to Finalist territory. This rating is based on code inspection; live keyboard/screen-reader verification is pending.

---

# Criterion 4 — Technical Execution (Weight 10%)

- **Winner standard:** Production-quality: typed end-to-end, deterministic and tested core, reproducible build, deployed URL, CI or at least full local verification, honest docs.
- **Finalist standard:** Clean modular separation, typed domain schemas, unit + e2e tests for the critical demo flow, deterministic simulation with safety caps, and a build that typechecks and lints.
- **Meets-bar standard:** The product works, is structured, has tests, and the core science is isolated from the adaptation layer.
- **Below-bar condition:** Works but with evident structural weaknesses, untested critical paths, or docs that don't match reality.
- **Disqualifying condition:** Cannot be built or run; crashes in the demo flow; scientific core mutable by the adaptation layer.
- **Evidence currently inspectable:**
  - Modular separation: domain (Zod schemas) / simulation (seeded engine) / adaptation (provider) / storage / UI — README.md:90-107; src/domain/experiments.ts:48-55 (zod schemas); src/domain/learner.ts:62-74; src/domain/evidence.ts:96-105.
  - Adaptation cannot touch science: provider returns proposals, science stays in simulation — src/domain/adaptation.ts:9-12; src/adaptation/deterministic-provider.ts:22-25.
  - Deterministic seeded engine (Mulberry32): src/simulation/nuclear-chain-reaction.ts:25-34; safety caps MAX_POPULATION=500 / MAX_STEPS=120 and clamping: src/domain/experiments.ts:18-19, 188-212; guaranteed termination: src/simulation/nuclear-chain-reaction.ts:53-118.
  - Counterfactual enforces one-variable/same-seed: src/simulation/counterfactual.ts:15-20, 33-59.
  - Storage is localStorage-only, Zod-validated with fail-safe defaults: src/storage/session-storage.ts:44-86; zero network calls (no fetch/XHR/beacon/EventSource anywhere in src/).
  - Test files present: 7 files under tests/ (adaptation, simulation, components) + e2e/smoke.spec.ts:8-48 covering the critical demo flow (predict → run → ceiling → adaptation → accept → counterfactual → replay).
  - Build/check scripts: package.json:5-14 (dev/build/lint/typecheck/test/test:e2e).
- **Evidence still missing:** Audit did NOT execute `npm test`, `npm run typecheck`, `npm run lint`, or `npm run build` — execution results are NOT YET INSPECTABLE. README.md:85 claims 60 unit/component tests; the fact sheet says 59 — UNVERIFIED until run. No deployed URL exists; the checkout has no git remote (not public), so the README claim "Public GitHub repository: this repository" (README.md:127) is currently unmet.
- **Highest-risk hackathon tell:** Demo-day failure from never running the suite in a clean environment — or citing "60 tests pass" without a green run. Second tell: the README's nonexistent-doc references if the judged artifact is the scaffold snapshot (docs/ exists in the product checkout but is absent from the worktree snapshot; on the scaffold commit, README links would dangle).
- **Exact remediation:**
  1. Run `npm run typecheck && npm run lint && npm test && npm run build` in a clean clone; fix; record output in the submission. ~1-2 h.
  2. Reconcile the test count (README.md:85 vs 59) to the actual green run. ~0.5 h.
  3. Push the repo public and deploy to Vercel; put the URL in the README and submission. ~1-2 h.
  4. Strengthen the e2e smoke to assert a specific proposal fired from specific evidence (currently it only asserts the "Suggested adaptation" header: e2e/smoke.spec.ts:31-33). ~1-2 h.
- **Estimated repair hours:** 3-7 h.
- **CURRENT RATING: Meets Bar → Finalist boundary (S3).** Architecture is genuinely clean: typed domain, seeded deterministic core with hard caps and clamping (src/domain/experiments.ts:18-19, 188-212), counterfactual constraint enforced in code (src/simulation/counterfactual.ts:38-42), adaptation provably unable to touch science (src/domain/adaptation.ts:9-12), zero network surface, and tests exist for the exact invariants the pitch depends on (seed reproducibility, one-variable counterfactual, rejection logic). The path to Finalist is verification, not rework: execute the suite, reconcile the count, deploy, and publish. Until those are done, "Meets Bar" with Finalist potential is the honest rating; a green clean-env run plus a public URL upgrades it to Finalist on the evidence alone.

---

# Criterion 5 — Presentation Quality (Weight 10%)

- **Winner standard:** Three-minute demo video that shows the adaptation loop live, including a moment a static simulation could not produce, with honest framing of scope.
- **Finalist standard:** Demo video exists, shows the full learner flow (predict → run → adapt → counterfactual → replay), and states limitations (one lab, deterministic rules, no validated study).
- **Meets-bar standard:** A working demo exists (live or recorded) with a clear narrative.
- **Below-bar condition:** Demo scripted on paper only; no video, no live URL.
- **Disqualifying condition:** No demo of any kind.
- **Evidence currently inspectable:** Demo flow is scripted in docs/product-spec.md ("Demo flow" section per README.md:128); the e2e smoke encodes the intended demo path (e2e/smoke.spec.ts:8-48); landing page exists as the demo entry (src/app/page.tsx:26-31).
- **Evidence still missing:** The three-minute video ("planned", README.md:128); any recorded screen capture; a public URL to demo live (see Deployment Reality Test).
- **Highest-risk hackathon tell:** Narrating the adaptation ("the AI notices... and suggests...") over screenshots without ever showing a proposal firing from real evidence — the video must show the actual accept/reject flow, not a storyboard.
- **Exact remediation:** Record the 3-minute video against the scripted demo flow using the live deployment: landing → predict (low confidence) → run with absorber withdrawn → ceiling stop → adaptation card appears with reason and evidence → accept → counterfactual comparison → replay. State scope honestly in the last 20 seconds (one lab, deterministic rules engine, no validated study). ~3-6 h including retakes.
- **Estimated repair hours:** 3-6 h.
- **CURRENT RATING: Not Evaluated (S2).** No video exists (README.md:128: "planned"); no deployment URL exists. A criterion with no artifact cannot be rated on the scale — treat as scoring 0 until the video and URL exist. The demo script and the e2e smoke give a strong, exact template to record from; 3-6 h closes this criterion to at least Meets Bar.

---

# Mandatory Test 1 — DEPLOYMENT REALITY (first 60 seconds)

**Test definition:** Trace the learner's literal first 60 seconds. **FAIL** if at any step the learner needs: an API key, a paid account, a terminal, an IDE, setup instructions, diagnosis disclosure, teacher configuration, a credit card, or developer help.

**Current status: PARTIAL / UNVERIFIED.** The app is fully client-side: dependencies are next/react/react-dom/zod only (package.json:15-20), zero network calls in src/, anonymous localStorage persistence (src/storage/session-storage.ts:12-15), no account or auth anywhere (README.md:60, 73). A Vercel deploy of this exact code would satisfy the test. But there is **no deployment URL, no public repo (no git remote configured), and no evidence the app was ever served to a human** — so every step below that depends on a live server is UNVERIFIED. Steps 2-10 are verified by source inspection; step 1 is not.

**First-60-seconds trace:**

| # | Step | Verified? | Fails if... |
|---|---|---|---|
| 1 | Learner opens the URL (or scans QR) on their own device | UNVERIFIED — no URL exists yet | Any setup, terminal, IDE, or "install Node 20+" instruction (README.md:73) is required; or the URL requires a login |
| 2 | Landing page loads: pitch, labs grid, "Enter the lab" (src/app/page.tsx:19-31) | Verified (source) | Any signup wall, credit card, or diagnosis disclosure appears |
| 3 | Learner clicks "Enter the lab" → lab page (src/app/lab/nuclear-chain-reaction/page.tsx:6-8) | Verified (source) | Teacher configuration or class code is required |
| 4 | Left panel shows "Predict first" with 5 structured answers, optional free text, confidence 1-5 (src/components/lab/prediction-panel.tsx:79-163) | Verified (source) | The prediction step is skippable — the adaptation engine depends on it (experiment-shell.tsx:166-170 blocks Run without it) |
| 5 | Learner picks an answer + confidence, submits; "Your prediction" confirmation appears (prediction-panel.tsx:49-76) | Verified (source) | The product guesses a prediction silently, or asks anything about the learner's diagnosis |
| 6 | Learner adjusts one labeled slider (e.g., Absorber position; src/components/lab/variable-controls.tsx:52-105) | Verified (source) | Sliders have no labels or current-value readout |
| 7 | Learner clicks "Run trial"; deterministic seeded run animates (experiment-shell.tsx:165-241; simulation-canvas.tsx:53-232) | Verified (source); live behavior UNVERIFIED | Run requires developer help; animation auto-plays or flashes (it does not auto-start: simulation-canvas.tsx:21-25) |
| 8 | Adaptation card appears with plain-language reason (e.g., ceiling hit → reduce density; src/adaptation/deterministic-provider.ts:180-193) | Verified (source); live firing UNVERIFIED | Adaptation is applied silently (it is not: adaptation-card.tsx:167-191; experiment-shell.tsx:243-276) |
| 9 | Learner accepts/rejects/modifies; nothing is forced | Verified (source) | Learner has no way to decline |
| 10 | Counterfactual Microscope + Adaptation Replay are available from the same screen (counterfactual-panel.tsx:51-138; adaptation-replay.tsx:93-229) | Verified (source) | Any step requires returning to the developer |

**Verdict:** The design passes the test by construction — every failure condition is absent from the code (no auth, no keys, no network, no setup beyond serving static output of a Next.js build). It is currently **UNVERIFIED end-to-end** solely because no URL exists. This is the single cheapest win in the pack: `git push` + Vercel.

---

# Mandatory Test 2 — WRAPPER TEST

**Test definition:** Remove the LLM. List what remains. **FAIL innovation** if the remaining product is merely: static text, one prerecorded animation, a quiz form, or a chat interface.

**Current result: PASS by construction — with an honesty caveat.**

What removing the (nonexistent) LLM changes: nothing. There is no LLM in the dependency tree (package.json:15-20) and no network call in src/. The product as it exists today is already the "LLM-removed" product, which means the wrapper test reveals what is genuinely defensible:

**What remains (all verified in source):**
1. A seeded, deterministic simulation engine (Mulberry32, caps, clamping, guaranteed termination): src/simulation/nuclear-chain-reaction.ts:25-34, 53-118; src/domain/experiments.ts:18-19, 188-212.
2. A prediction-before-run workflow that gates every trial on a recorded prediction + confidence (experiment-shell.tsx:165-170; prediction-panel.tsx:35-39).
3. A deterministic adaptation engine that classifies behavior against a bounded misconception taxonomy and proposes changes — never static text, never a prerecorded response (src/adaptation/deterministic-provider.ts:32-196; src/adaptation/misconception-taxonomy.ts:210-385).
4. Evidence-linked proposals: every proposal carries evidenceIds and a plain-language reason (deterministic-provider.ts:54-72).
5. Learner control: accept/reject/modify, rejected types never re-proposed (deterministic-provider.ts:39-43; adaptation-card.tsx:167-191).
6. Counterfactual Microscope: exactly one variable, same seed, side-by-side (src/simulation/counterfactual.ts:9-59).
7. Adaptation Replay: full journey reconstructed from recorded evidence (adaptation-replay.tsx:31-229).
8. Five representation modes, all generated from the trial record (representation-tabs.tsx:31-291).
9. Anonymous, Zod-validated local storage with export/clear (session-storage.ts:44-122).

**What is defensible today:** Items 1-9 are real, deterministic, and not replicable by a static text page, a single prerecorded animation, a quiz form, or a chat interface. The adaptation loop is a genuine closed loop (predict → run → interpret → propose → decide → re-predict → compare).

**What is NOT yet defensible:** The word "AI". The pitch (src/app/page.tsx:19-25) and README.md:5 say "adaptive AI engine"; the README itself states the LLM provider is "designed-for but not implemented" (README.md:44, 114). Free-text interpretation is keyword matching explicitly labeled as "a coarse approximation, never an attempt at real language understanding" (src/adaptation/misconception-taxonomy.ts:245-247, 387-398). A judge applying the "meaningful AI" test to this product today must answer NO — and the product would then be scored as novel adaptive educational software, not as an AI application.

**Verdict:** Not a wrapper — the inner product is real. But the wrapper test exposes the claim gap: the innovation that IS defensible (deterministic evidence-linked adaptation, counterfactual, replay) must be presented under its true name, or a real interpretation layer must be added.

---

# Mandatory Test 3 — NOVELTY TEST

**Test definition:** Compare against the category. **Defensible delta (verbatim):** "UnseenLab adapts the representation, experimental structure, pacing, and intervention according to the learner's demonstrated interaction and prediction evidence while keeping scientific outcomes deterministic."

| Competitor | What it does | What it lacks vs the delta | What UnseenLab must prove |
|---|---|---|---|
| **PhET** (interactive sims) | Rich, widely-adopted interactive simulations with accessible controls | A single fixed interface per sim; no per-learner adaptation; no prediction-evidence loop; no adaptation record | That adaptation changes representation/pacing/structure per learner rather than being a settings panel (PhET also has settings — the delta must be the evidence-linked loop, not the sliders) |
| **Labster** | Virtual lab experiences with quests, 3D environments, feedback | Scripted pedagogical paths; adaptation is scenario-choice, not evidence-driven; not deterministic science | That proposals are generated from this learner's prediction/trial evidence (evidenceIds) and can be refused |
| **PraxiLabs** | VR/3D virtual experiments for inaccessible labs | Fixed lab templates; no learner-model; no counterfactual control; cloud accounts and tracking | Zero-account, local-only privacy posture plus evidence-linked adaptation |
| **Generic AI tutors (Khanmigo-style)** | Chat-based explanation, hints, assessment | Chat wrapper around content; adaptation via conversation, not via interaction evidence; opaque models; typically server-side accounts | Deterministic, offline, explainable proposals with plain-language reasons and accept/reject/modify — not a chat |
| **AI-generated simulation projects (hackathon artifacts)** | LLM-generated sim demos, often one-shot | Usually no seeded determinism, no evidence model, no adaptation state, science not isolated from generation | That the science core is hand-written, seeded, capped, and untouchable by the adaptation layer (src/domain/adaptation.ts:9-12) |
| **Lumina-style adaptive tools** | Adaptive learning platforms with pacing/content adaptation | Server-side learner models, data collection, opaque adaptation; pacing only, not representation structure or counterfactual science | Local-only evidence, learner-visible reasons for every change, one-variable causal comparison |

**UnseenLab's defensible novelty (as implemented):** the combination of (a) prediction-before-run as a mandatory evidence source, (b) deterministic seeded trials that make counterfactual comparison rigorous (src/simulation/counterfactual.ts:9-20), (c) proposals that are explainable and refusable (adaptation-card.tsx:29-33), and (d) a full adaptation record the learner can replay (adaptation-replay.tsx:31-229). PhET gives you the sim; it does not give you this loop.

**Current behavior that FAILS to demonstrate the delta:**
1. **`feedbackTiming` is a dead preference** (S3). It is settable (src/components/lab/accessibility-controls.tsx:115-134), persisted (src/domain/learner.ts:38, 70), and even labeled in the adaptation card (src/components/lab/adaptation-card.tsx:25) — but no code anywhere consumes it to change feedback behavior. A promised adaptation dimension that does nothing is exactly the kind of thing a judge probes: "What does Feedback timing actually do?" Today the honest answer is "nothing yet."
2. **Free-text interpretation is keyword matching** — fine as a fallback, but it means the "interpretation" pillar of the delta is thin for free-text input (src/adaptation/misconception-taxonomy.ts:387-398).
3. **No recorded session trace exists** — the delta is architectural; it has never been demonstrated end-to-end to a human (README.md:121). The delta must be *shown*, not merely *implemented*.

---

# FINAL SCORING TABLE (for reviewer completion — empty by design)

| Criterion | Weight | Rating (Disqualifying / Below Bar / Meets Bar / Finalist / Winner) | Score (weight × rating points) | Evidence cited (file:line or artifact) |
|---|---|---|---|---|
| Impact on Neurodivergent Youth | 30% |  |  |  |
| Innovation in AI Application | 25% |  |  |  |
| Usability and Accessibility | 25% |  |  |  |
| Technical Execution | 10% |  |  |  |
| Presentation Quality | 10% |  |  |  |
| **Total** | **100%** |  |  |  |

**How to score:**
1. Complete each criterion AFTER running the three mandatory tests above and (ideally) the 60-second live trace. Ratings are evidence-based: any claim must cite a file:line or a recorded artifact; absent evidence scores the lower rating.
2. Map rating to points: Winner = 1.0, Finalist = 0.8, Meets Bar = 0.6, Below Bar = 0.4, Disqualifying = 0. "Not Evaluated" (e.g., Presentation with no video) scores 0 until the artifact exists.
3. Criterion score = weight × points. Total = sum of criterion scores (0-1.0).
4. Reference bands: 0.8+ Finalist-to-Winner; 0.6-0.79 Finalist potential; below 0.6 does not clear the bar under the official weights.
5. Record in the Evidence column only what you personally verified. If a claim relies on the demo video or a test session, note it as pending until you have seen it.

---

*Audit basis: read-only source inspection of the product checkout; tests reviewed conceptually, not executed; no user-testing results exist. All "current results" above reflect code as committed (e4a6d0a). Where a live behavior is referenced, it is marked UNVERIFIED unless the source makes it structurally guaranteed.*
