# Evidence and Claims Register

> **RE-STAMPED on the final-hardening branch.** The claims below were corrected to match the
> current product: repeatable multi-trial loop, optional structured LLM provider behind
> `/api/adapt` (deterministic offline fallback), working accessibility fixes (focus trap,
> OS reduced motion, root-font-size text scale, WAI-ARIA tabs, no per-frame aria-live), the
> removed `feedbackTiming` control, and truthful first-trial change evidence. The old
> "single-run session constraint" and "no AI in the build" framings are obsolete.
>
> **RE-STAMPED on the lesson-workspace-redesign slice (A6, 2026-08-07, commits `3f5d14a..1fe7530`
> on `feature/generative-demonstration-engine`).** CLAIM-21..28 added for the Lesson Workspace
> Redesign (`docs/redesign-lesson-workspace.md`); CLAIM-06 and CLAIM-08 updated in place for the
> demoted adaptation surface and the new a11y suite. Every added claim was re-checked against
> the code by A6 before writing (grep + test runs), not taken from reports alone.

Single source of truth for what UnseenLab may and may not claim. Every claim used in the pitch, README, demo, or video must appear here with an approved wording. A claim may only move from UNVERIFIED to VERIFIED when the listed evidence exists.

Status legend: **CONFIRMED (PROFILE)** = supported by the confirmed design-participant facts supplied for this product; **INSPECTED** = verified in source by this audit; **PARTIAL** = only part of the evidence exists; **UNVERIFIED** = no evidence yet; **NOT ALLOWED** = must never be claimed.

| Claim | Status | High-level note |
|---|---|---|
| CLAIM-01..05 | CONFIRMED (PROFILE) | Design-participant facts |
| CLAIM-06, 09, 10, 11, 13, 19 | INSPECTED | Verified in code |
| CLAIM-08, 14, 15, 16 | PARTIAL | Real but with known gaps |
| CLAIM-07, 17, 18, 20 | UNVERIFIED | Require real user testing |
| CLAIM-12 | UNVERIFIED | Design position, not evidence |
| CLAIM-21..26, 28 | INSPECTED | Lesson Workspace Redesign — verified in code + tests |
| CLAIM-27 | PARTIAL | Redesign a11y shipped + tested; real 200% zoom and real screen-reader verification remain manual |

---

## CLAIM-01 — Designed with a neurodivergent learner

- **Evidence required:** documented ongoing involvement of the design participant (session sheets, design decisions traced to his feedback).
- **Currently available:** confirmed profile facts; README + landing-page attribution ("Designed with an initial design participant…", `src/app/page.tsx:117-121`, `README.md:15-17`); design-decision tracing in `docs/product-spec.md`.
- **Allowed wording:** "Designed with an initial design participant — a high-school senior who reports learning differently."
- **Forbidden wording:** "Co-designed by neurodivergent students" (plural), "validated with", "user-tested".
- **Status:** CONFIRMED (PROFILE) for involvement; VERIFICATION pending for session documentation.

## CLAIM-02 — Interactivity was requested

- **Evidence required:** participant statement; product decision record.
- **Currently available:** profile fact: "Interactivity is important to him"; "Classroom demonstrations and laboratory showcases did not provide enough interactivity."
- **Allowed wording:** "The participant said interactivity mattered to him."
- **Forbidden wording:** "Students with ADHD demand interactivity."
- **Status:** CONFIRMED (PROFILE).

## CLAIM-03 — Animation was requested

- **Evidence required:** participant statement; product decision record.
- **Currently available:** profile fact: "Animation is important to him."
- **Allowed wording:** "Animation was important to the design participant."
- **Forbidden wording:** "Animation improves learning for ADHD students" (causal claim, no evidence).
- **Status:** CONFIRMED (PROFILE).

## CLAIM-04 — Modern Physics was difficult

- **Evidence required:** participant statement.
- **Currently available:** profile fact: "Had difficulty understanding Modern Physics fully."
- **Allowed wording:** "He found Modern Physics difficult to fully understand."
- **Forbidden wording:** "UnseenLab fixes Modern Physics difficulties."
- **Status:** CONFIRMED (PROFILE).

## CLAIM-05 — Existing demonstrations lacked sufficient interactivity

- **Evidence required:** participant statement.
- **Currently available:** profile fact: "Classroom demonstrations and laboratory showcases did not provide enough interactivity."
- **Allowed wording:** "He said classroom demos and lab showcases were not interactive enough for him."
- **Forbidden wording:** "Existing tools fail neurodivergent learners."
- **Status:** CONFIRMED (PROFILE).

## CLAIM-06 — The simulation adapts

- **Evidence required:** adaptation proposals that change visible experience from session evidence; adaptation test vectors ADAPT-001..026.
- **Currently available:** deterministic rule provider with evidence-linked proposals (INSPECTED, `src/adaptation/deterministic-provider.ts`); optional structured LLM provider behind the same interface (`src/adaptation/llm-provider.ts`); the repeatable multi-trial loop makes multi-trial rules reachable in a normal session (`e2e/multi-trial.spec.ts`); tests. **Redesign update (A6):** on the generative demo lesson page the live suggestions block now lives only on the rail's complete step and the decision history lives in the AboutThisModel dialog — the derivation (`deriveAdaptationSuggestions`) and the recording contract (`onAdaptationDecision`) are unchanged (commit `3c5f630`, `a2-report.md`). The lab page is untouched.
- **Allowed wording:** "The lab proposes representation, pacing, and structure changes based on what the learner did — and the learner accepts, rejects, or modifies each one."
- **Forbidden wording:** "AI-driven adaptation" without qualification (the default path is deterministic rules; AI interpretation is optional and labeled), "the system learns your style" (no learning).
- **Status:** INSPECTED — adapts; AI framing is only allowed for the labeled, optional hosted path (see CLAIM-13).

## CLAIM-07 — Adaptation improved understanding

- **Evidence required:** at least one completed user-testing session (pre/post conceptual questions, session sheet).
- **Currently available:** none.
- **Allowed wording:** "In an initial two-session design case study, one participant reported…" (fill in only with real data).
- **Forbidden wording:** "Adaptation improves learning", "proven effective".
- **Status:** UNVERIFIED — no testing performed yet.

## CLAIM-08 — The application is accessible

- **Evidence required:** keyboard, focus, motion, screen-reader, visual, cognitive, and animation tests from `accessibility-audit.md` passing.
- **Currently available:** strong basics (INSPECTED) with the previously verified gaps now fixed: OS `prefers-reduced-motion` honored, replay-dialog focus trap + initial focus + restore, WAI-ARIA tabs with roving tabindex, no per-frame `aria-live` spam, text scale effective via root font-size, disclaimer always visible (density no longer hides it), and the dead `feedbackTiming` control removed. **Redesign update (A6):** the lesson workspace carries its own a11y pass — keyboard-only rail journey, focus after step advance, dialog focus management, one polite announcement per step transition, completed steps exposed as text (never color-only), an accessible interact-completion path when WebGL is unavailable, reduced-motion mapping — covered by the new `tests/demonstrations/ui/lesson-rail-a11y.test.tsx` (7 tests) plus updated shell/a11y suites (commit `3b614ef`, `a4-report.md`; real-Chromium keyboard/focus/viewport pass, 320–1280 px). PARTIAL remainder now also includes: real 200% browser zoom and real screen-reader (VoiceOver/NVDA) verification remain manual checks (see CLAIM-27); the pre-existing `--muted-strong` high-contrast token typo (`globals.css:52`) is mitigated in redesign-owned components but the token itself is an open A8 item.
- **Allowed wording:** "Designed with accessibility controls: reduced motion (including the OS preference), animation speed, low-density mode, high contrast, text scale, and full keyboard operation of the core flow."
- **Forbidden wording:** "Fully WCAG 2.2 AA compliant", "accessible to all users".
- **Status:** PARTIAL — fixes shipped and covered by tests; manual assistive-tech verification still pending.

## CLAIM-09 — The science is deterministic

- **Evidence required:** seed reproducibility test; zero-neutron case; nonnegative state; caps.
- **Currently available:** INSPECTED — Mulberry32 seeded PRNG, fixed consumption order, caps 500/120, clamping, unit tests; counterfactual locks seed (`src/simulation/counterfactual.ts:15-20`).
- **Allowed wording:** "Same settings and same seed always produce the same result. The adaptation layer cannot change scientific outcomes."
- **Forbidden wording:** "Physically accurate nuclear model" (it is explicitly fictionalized).
- **Status:** INSPECTED.

## CLAIM-10 — No API key is required

- **Evidence required:** deploy to a public URL; verify clean-browser flow.
- **Currently available:** INSPECTED — the core app runs fully offline with no key: deterministic rules, no server dependency. The optional structured LLM path requires `NEXT_PUBLIC_LLM_ENABLED=1` (build time) plus a server-side `LLM_API_KEY`, and is off by default. Runtime deps are now `next`, `react`, `react-dom`, `zod`, `gsap`, `three`.
- **Allowed wording:** "Runs fully in the browser — no account, no API key required. An optional, labeled AI-interpretation layer can be enabled with a server-side key; without it everything runs on deterministic offline rules."
- **Forbidden wording:** none specific.
- **Status:** INSPECTED (architecture); VERIFY on the deployed URL.

## CLAIM-11 — Data remains local

- **Evidence required:** network tab empty during use (with the hosted path disabled); export only on explicit button press; delete clears both localStorage keys.
- **Currently available:** INSPECTED — `unseenlab.preferences.v1` + `unseenlab.evidence.v1` only; zod-validated reads; no analytics SDK; no fetch/axios in `src/` except the optional `POST /api/adapt` bridge, which is active only when the hosted path is enabled and sends only the typed, bounded session summary (never the learner's identity or free text verbatim), with every failure falling back locally.
- **Allowed wording:** "Everything stays in your browser — except one optional, labeled AI-interpretation request when the hosted layer is enabled, which sends only a bounded summary and never personal identity. You can export your session as a file or clear it at any time."
- **Forbidden wording:** "Private and secure" (no security claim tested), "anonymized cloud storage".
- **Status:** INSPECTED.

## CLAIM-12 — The project serves any learner

- **Evidence required:** user-testing with more than one learner (any learner who benefits from the listed features).
- **Currently available:** universal-design position only; one design participant engaged.
- **Allowed wording:** "Built from one participant's needs using universal-design principles: representation choice, adjustable pacing, reduced density, controlled experimentation."
- **Forbidden wording:** "Works for all students", "designed for every ADHD learner".
- **Status:** UNVERIFIED.

## CLAIM-13 — AI is used meaningfully

- **Evidence required:** either (a) a real interpretation layer for free-text predictions with conservative abstention, or (b) re-framing: "adaptive engine" claims, no "AI" claims.
- **Currently available:** deterministic rules engine + keyword fallback (default), AND an implemented optional structured LLM provider behind `POST /api/adapt` — typed bounded payload, Zod-validated enum-only answer (misconception, intervention, confidence 0..1, 1–3 evidence strings, optional follow-up), system-prompt guards (no diagnosis inference, no science changes), server-side key only, ANY failure falls back to the deterministic rules, proposals tagged `source: "llm" | "rules"` shown as "AI interpretation" vs "Offline rules". Active only when `NEXT_PUBLIC_LLM_ENABLED=1` + server `LLM_API_KEY` (INSPECTED: `src/adaptation/llm-provider.ts`, `llm-client.ts`, `llm-schema.ts`, `src/app/api/adapt/route.ts`).
- **Allowed wording (today):** "The lab interprets your prediction and behavior with a bounded evidence model. When enabled, a hosted model provides a labeled 'AI interpretation'; by default, deterministic offline rules provide the same explainable proposals, labeled 'Offline rules' — you keep control of every change."
- **Forbidden wording:** "Our AI" without the label and the optionality, "machine learning", "the AI infers your diagnosis" (never — no diagnosis inference exists).
- **Status:** INSPECTED — meaningful, bounded, labeled AI interpretation is implemented and optional; the default offline path is deterministic rules.

## CLAIM-14 — The product is different from PhET

- **Evidence required:** demo segment showing counterfactual microscope + adaptation replay + evidence-linked proposals; PhET comparison in `rubric-audit.md` novelty test.
- **Currently available:** defensible delta documented; differentiators implemented (INSPECTED).
- **Allowed wording:** "PhET gives you a simulation. UnseenLab changes the simulation's representation, pacing, and structure based on what you do — and shows you the causal difference one variable makes."
- **Forbidden wording:** "PhET is not accessible" (unverified competitor claim).
- **Status:** PARTIAL — true in code; needs the 45-second live proof.

## CLAIM-15 — The product is different from Labster

- **Evidence required:** same as CLAIM-14.
- **Currently available:** same differentiators; also no account/payment wall vs Labster's model (unverified competitor claim — keep out of public copy).
- **Allowed wording:** "Unlike full paid lab platforms, this is a single focused conceptual lab that adapts to the learner, runs offline, and keeps evidence local."
- **Forbidden wording:** "Better than Labster", "Labster fails at X".
- **Status:** PARTIAL.

## CLAIM-16 — The product is different from Lumina-style tools

- **Evidence required:** same as CLAIM-14.
- **Currently available:** deterministic-outcomes + learner-controlled adaptation framing (INSPECTED).
- **Allowed wording:** "Lumina-style tools adapt content; UnseenLab keeps the science deterministic and hands the learner the control over every adaptation."
- **Forbidden wording:** "We are a Lumina killer".
- **Status:** PARTIAL.

## CLAIM-17 — The product improved confidence

- **Evidence required:** session sheet pre/post confidence (1–5) showing improvement; one session minimum; reported as case-study, not statistics.
- **Currently available:** none.
- **Allowed wording:** "Baseline confidence [A/5] → after use [B/5]" (real values only).
- **Forbidden wording:** "Boosts student confidence".
- **Status:** UNVERIFIED.

## CLAIM-18 — The product reduced mental effort

- **Evidence required:** session sheet pre/post mental effort (1–5).
- **Currently available:** none.
- **Allowed wording:** "Mental effort [C/5] → [D/5]" (real values only).
- **Forbidden wording:** "Easier for the ADHD brain".
- **Status:** UNVERIFIED.

## CLAIM-19 — The learner independently used it

- **Evidence required:** observed independent use in Part C of the protocol without coaching (except product-defect blocks).
- **Currently available:** none — no testing session has run.
- **Allowed wording:** "He used the lab on his own; we only helped when the product blocked him."
- **Forbidden wording:** "Effortless to use".
- **Status:** UNVERIFIED.

## CLAIM-20 — User feedback changed the build

- **Evidence required:** at least one feedback-driven change from a session (Part E builder decision), committed with a traceable reference to the session sheet.
- **Currently available:** none — no structured testing yet (`README.md:121` states "No structured product test has been performed yet").
- **Allowed wording:** "After the first session we changed [FEATURE] because he said [QUOTE]."
- **Forbidden wording:** "Iterated with user feedback" without a specific, dated example.
- **Status:** UNVERIFIED — this is the single most impactful claim for the Impact criterion (30%); prioritize.

---

## Lesson Workspace Redesign claims (A6, 2026-08-07)

Scope: `docs/redesign-lesson-workspace.md`, commits `3f5d14a..1fe7530` on
`feature/generative-demonstration-engine` (A1 canonical graph invariant, A2
70/30 workspace + lesson rail + provenance demotion, A3 representation labels,
A4 a11y, A5 browser e2e; infra `cf88729`/`b52f289`). These claims are about
the flag-gated generative demo lesson page (`NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1`);
with the flag at its default `0` the product is unchanged. Each claim was
re-checked against the code by A6 (grep + test runs; full unit suite
re-executed: 73 files / 1230 tests, 0 failed, real Node). No learning-gain
claim is made anywhere in this section.

## CLAIM-21 — The conceptual templates emit only the canonical graph

- **Evidence required:** no standalone decorative objects (`arrow` /
  `process_edge` / detached title labels) in any conceptual template; every
  `relationships[].from/to` and every animation target resolves to a real
  object; node ids/labels/positions stable so 2D and 3D agree.
- **Currently available:** INSPECTED — `src/demonstrations/generation/offline/template-builder.ts`
  (commit `3f5d14a`; all 10 conceptual templates; `energy_packet` objects kept
  because they travel along an edge path; the two `state_change` captions are
  group children of state nodes, not detached labels); contract tests
  `tests/demonstrations/generation/template-builder.test.ts` (8 tests) and
  `tests/demonstrations/ui/accessible-diagram.test.tsx` (3 tests); A1 report.
- **Allowed wording:** "Conceptual demonstrations render the declared scene
  objects and their typed relationships; nothing decorative is invented."
- **Forbidden wording:** "Every template is a real simulation" (Level 2/3
  templates are conceptual, no simulation block — see CLAIM-06/09 framing).
- **Status:** INSPECTED.

## CLAIM-22 — The 3D stage is an alternate projection of the same graph

- **Evidence required:** 3D edges derived from `scene3d.relationships`, not
  from decorative objects; arrowhead at the destination; `inhibits` ends in a
  bar (`—|`); labels locked above nodes and camera-facing; near-orthographic
  default camera; rotation clamped; node/edge selection with causal-path dim;
  interaction events fire only on selection-state changes.
- **Currently available:** INSPECTED — `primitive-3d/scene-graph.ts`
  (`isGraphLikeScene`, `deriveGraphEdges`, `cascadeOrder`, `edgeCausalPath`),
  `primitive-3d/renderer.ts` (graph mode opt-in `!hasEngineMapping &&
  isGraphLikeScene`, `OrthographicCamera`, `GRAPH_AZIMUTH_BAND`/polar clamp,
  `onNodeSelect`/`onEdgeSelect`/`onNodeManipulate` change-only firing),
  `primitive-3d/types.ts` + `demonstration-stage.tsx` optional callbacks
  (commit `3f5d14a`); `tests/demonstrations/renderer/primitive-3d.test.ts`
  (+485 tests); real-Chromium pointer click on node A verified in
  `e2e/demo-lesson-rail.spec.ts` (commit `1fe7530`). Hybrid engine showcases
  and containment scenes keep their prior non-graph rendering.
- **Allowed wording:** "In a 3D graph view the arrows ARE the declared
  relationships: arrowheads point at the destination and a bar marks an
  inhibition."
- **Forbidden wording:** "The 3D view shows the physics" (graph mode is a
  projection of declared relationships, not a simulation surface).
- **Status:** INSPECTED.

## CLAIM-23 — The 2D diagram shows only the canonical graph

- **Evidence required:** the accessible SVG renders only nodes + relationship
  edges; decorative kinds never appear as shapes; `inhibits` ends in a bar,
  not an arrowhead; honest empty state.
- **Currently available:** INSPECTED — `accessible-representation.tsx` filters
  `arrow`/`process_edge`/`line`/`label` kinds and draws the `—|` bar for
  `inhibits` (commit `3f5d14a`); `accessible-diagram.test.tsx` (3 tests);
  A4 added the interactive fallback diagram (graph nodes as real buttons with
  `aria-pressed`, Enter/Space activation, Escape clear) firing the same event
  surface (commit `3b614ef`) so the 2D surface is also the WebGL-unavailable
  completion path for rail interact steps (no fake gate).
- **Allowed wording:** "The diagram view draws exactly the declared model
  objects and their relationships."
- **Forbidden wording:** "The diagram is a real simulation."
- **Status:** INSPECTED.

## CLAIM-24 — The lesson rail is a gated, honest state machine

- **Evidence required:** `predict → interact → observe → explain → complete`;
  one instruction/question per step; Continue gated on real completion
  (prediction commit, real node manipulation or control touch per scene type,
  at least one observation, explanation selection); Back always available;
  completed steps persist across back-navigation (never relock); the explain
  step for conceptual demos is learner self-assessment (no invented grading).
- **Currently available:** INSPECTED — `lesson-rail.tsx` +
  `demonstration-shell.tsx` 70/30 grid + `demonstration-page.tsx` state
  (`manipulatedNodeIds` recorded only after prediction commit,
  `touchedControls`) (commit `3c5f630`); `lesson-rail.test.tsx` (7 tests),
  `demonstration-shell.test.tsx` (13 tests); real-Chromium e2e
  `e2e/demo-lesson-rail.spec.ts` (8 tests: gating, empty-canvas click does
  not complete, real pointer click on node A completes, completed steps never
  relock, engine-demo slider drag completes) (commit `1fe7530`); A2/A5
  reports. Graded reveal for curated engines stays behind the manipulation
  gate (never leaks before submission).
- **Allowed wording:** "The lesson is a sequence of steps you cannot skip:
  predict, interact, observe, explain. A step completes only when you have
  actually done it."
- **Forbidden wording:** "The app grades your explanation" (conceptual
  explain steps are learner self-assessment; `correctIndex` is curated-only).
- **Status:** INSPECTED.

## CLAIM-25 — Provenance is demoted on the lesson page, never deleted

- **Evidence required:** the primary workspace carries one trust chip + `ⓘ`
  only; the AboutThisModel dialog carries source, origin, save status,
  limitations, trial log (with honest replay) and adaptation history; the
  save control and its honest 401 fallback still work from the dialog.
- **Currently available:** INSPECTED — `about-this-model.tsx` +
  `trust-badge.tsx` + `demonstration-shell.tsx`; `prediction-panel.tsx`,
  `observation-panel.tsx`, `demo-limitations.tsx` deleted with no remaining
  imports (commit `3c5f630`); A5 e2e provenance test asserts the workspace
  carries no "Offline catalog" badge / trial log / save status / limitations
  and the dialog does (commit `1fe7530`).
- **Allowed wording:** "One small trust chip on the model page; the details —
  source, save status, limitations, your trial history — are one `ⓘ` away."
- **Forbidden wording:** "Nothing about the model is hidden" (the primary
  workspace intentionally shows only the chip; details are in the dialog).
- **Status:** INSPECTED.

## CLAIM-26 — Representation labels are normalized to Model/Diagram language

- **Evidence required:** all representation labels in the A3-owned builders
  are exactly `3D Model | 2D Model | Model | Diagram | Table | Timeline |
  Text sequence | Graph`; no "Explore / See / Guide" vagueness; no behavior
  change.
- **Currently available:** INSPECTED — orbits / electric-fields /
  wave-interference `build-spec.ts` + `engine-builder.ts` (commit `5ca316c`);
  grep-verified in A6; 1223 tests pass before and after (A3 report); no test
  asserted any old label string. **Open item (not claimed fixed):**
  `template-builder.ts:633` still emits `"3D stage"` (A1-owned file) — queued
  for A8.
- **Allowed wording:** "View controls use the Model/Diagram family: 3D Model,
  2D Model, Model, Diagram, Table, Timeline, Text sequence, Graph."
- **Forbidden wording:** none specific.
- **Status:** INSPECTED.

## CLAIM-27 — The lesson workspace passes automated and layout-level accessibility checks

- **Evidence required:** keyboard-only journey, focus after step advance
  (heading on fresh steps, enabled Continue on already-completable steps),
  dialog focus trap/Escape/focus return, exactly one polite announcement per
  step transition (silent first render), completed steps exposed as text
  (never color-only), perceivable disabled Continue, reduced-motion mapping,
  contrast in default + high-contrast palettes, 320–1280 px reflow without
  horizontal overflow, WebGL-unavailable interact completion path.
- **Currently available:** PARTIAL — commit `3b614ef` (A4): new
  `tests/demonstrations/ui/lesson-rail-a11y.test.tsx` (7 tests) + updated
  `demo-shell-a11y.test.tsx` (9) + `demo-shell-a11y-matrix.test.tsx` (4);
  real-Chromium keyboard/focus pass at every step hop and dialog trap verified
  in a production build; viewports 320/375/768/1280 zero overflow; 200% zoom
  approximated at layout level via a 640px viewport (WCAG 1.4.10 reflow);
  high-contrast F2/F3 fixes verified (12.6:1 / 17.8:1). PARTIAL remainder
  (manual, unchanged from prior programs): real 200% browser zoom in a headed
  browser, real screen-reader (VoiceOver/NVDA) walk-through, and real-AT
  confirmation of the SVG node buttons under `role="img"` — all NOT_RUN
  (documented in `docs/accessibility-equivalents.md` §5 and `a4-report.md`).
  Also open (A8, pre-existing, not caused by the redesign): the
  `--muted-strong: #f5f5f5` high-contrast token typo at `globals.css:52` —
  mitigated in redesign-owned components, token itself not yet fixed.
- **Allowed wording:** "The lesson workspace is keyboard-operable with
  managed focus, reduced-motion support, high-contrast-safe text, and a
  fallback interaction path when WebGL is unavailable."
- **Forbidden wording:** "Fully WCAG 2.2 AA compliant", "verified with a
  screen reader" (real-AT verification has not run).
- **Status:** PARTIAL.

## CLAIM-28 — The redesign is covered by a green unit suite and real-browser e2e

- **Evidence required:** full unit suite green under real Node; new e2e spec
  green in real Chromium against a flag-on production build; the lab smoke
  gate green; environment caveats stated, not hidden.
- **Currently available:** INSPECTED — infra commits `cf88729` + `b52f289`
  (ESM vitest config for the Vite 8 native loader, zod v4 interop, jsdom 30
  storage shim); unit suite 73 files / 1230 tests / 0 failed (re-verified by
  A6 under `/opt/homebrew/opt/node/bin`); `e2e/demo-lesson-rail.spec.ts` 8/8
  (real Chromium, flag-on production build, offline-catalog seeding via the
  app's own ask-to-demo flow with the generation bridge stubbed to HTTP 500);
  full e2e with the build's own Firebase env: 47 passed / 11 skipped / 0
  failed; `node browser-verify.mjs` ALL PASS; gates typecheck/lint/build PASS
  (A1–A5 reports).
- **Environment caveats (known, NOT product claims):** (1) the default PATH
  `node` on this machine is a Bun shim that breaks mongodb/bson test loads —
  the canonical test command uses real Node (`/opt/homebrew/opt/node/bin`,
  documented in README "Tests"); (2) `auth-dialog.spec.ts` degrades when the
  runner lacks `NEXT_PUBLIC_FIREBASE_API_KEY` — local builds are Firebase-baked
  via `.env.local`, so with the key exported the Google test self-skips by
  design (Run B: 0 failed); without it, that one test fails on a genuine
  Firebase popup, unrelated to the redesign (flagged for A8).
- **Allowed wording:** "The redesign ships with 73 unit files / 1230 passing
  tests and an 8-test real-browser lesson-rail suite; the full e2e suite runs
  47 passed / 11 env-gated / 0 failed against the flag-on build."
- **Forbidden wording:** "CI verified" (this program runs gates locally under
  real Node; no CI job covers the new spec) and blending the two e2e run
  states into one number.
- **Status:** INSPECTED.

---

## Usage rules

1. Public copy (README, video, pitch) may only contain claims whose status is not UNVERIFIED, or may use the exact placeholder language (`[X/3]`).
2. The demo must state honestly when numbers are pending: "Impact testing is in progress."
3. Re-check the register after every user-testing session and after any AI-provider change; update statuses in place.
