# UnseenLab — Judging Rubric Strategy

Official weights: Impact 30% · AI Innovation 25% · Usability & Accessibility 25% · Technical Execution 10% · Presentation 10%.

---

## 1. Impact on Neurodivergent Youth — 30%

> Does this meaningfully address a real need? Is impact demonstrated, not merely claimed?

**Winning evidence (product behavior):** prediction before simulation · learner answer after simulation · confidence before and after · self-reported mental effort · interaction history (variables changed, replays, views opened) · accepted/rejected adaptations · user feedback · visible design revision log (`docs/user-research.md`).

**Current implementation evidence:**
- Prediction panel requires a prediction + confidence before every trial; after the trial the learner can submit an updated prediction with a new confidence.
- Every trial, prediction, representation open, and adaptation decision is recorded into an anonymous local session; the Adaptation Replay renders the full journey.
- Research mode captures pre/post confidence, mental effort (1–5), and three free-text questions; exportable as JSON; labeled "Initial design case study evidence. Not a statistically validated learning study."
- Design feedback document exists with confirmed preferences (interactivity, animation) and empty templates for real test sessions.

**Missing evidence:** structured product test with the design participant (not yet performed — templates are placeholders, nothing fabricated). Real feedback quotes, observed friction, before/after understanding measures.

**Risk:** impact claims without test data. **Next action:** run the first structured session with the design participant; record friction and quotes; update `docs/user-research.md`; iterate the product accordingly and log the changes.

---

## 2. Innovation in AI Application — 25%

> Is AI used meaningfully and creatively rather than as a chat-interface wrapper?

**Winning evidence:** AI interprets learner predictions · maps errors to a bounded misconception taxonomy · selects targeted pedagogical interventions · changes representation/pacing/structure · explains why an adaptation is offered · cannot change equations or outcomes.

**Current implementation evidence:**
- `AdaptationProvider` interface with typed input/output; `DeterministicAdaptationProvider` implements bounded rules (freeze variables, slow animation, show graph, compare trials, causal view, reduce density, ask prediction again).
- `misconception-taxonomy.ts` classifies evidence into five concepts (LINEAR_VS_NONLINEAR_GROWTH, ABSORBER_EFFECT, STARTING_POPULATION_EFFECT, RANDOM_EVENT_VS_SYSTEM_PATTERN, MULTIPLE_VARIABLE_CONFOUNDING) with conservative structured-answer/keyword classification, documented as an offline fallback, not advanced AI.
- Every proposal carries evidence IDs and a plain-language reason; learners accept/reject/modify; rejected proposal types are never re-offered.
- Scientific core is isolated from the AI layer; AI can never modify simulation code, equations, or outcomes.

**Missing evidence:** structured LLM provider behind the same interface (designed, not implemented); hosted variant for scale.

**Risk:** rubric reviewers may ask "what does AI actually do?" — the answer is visible in the demo: prediction mismatch → possible friction → targeted offer → learner-controlled change. **Next action:** during the hackathon, if feasible, add an optional structured LLM provider behind the same interface; otherwise demo the deterministic provider as the offline fallback story.

---

## 3. Usability and Accessibility — 25%

> Could a neurodivergent learner comfortably use the prototype? Was it designed with them?

**Winning evidence (all shipped):** animation-first experience · interactive manipulation · reduced-motion mode · adjustable animation speed · low-information-density mode · one-variable-at-a-time mode · persistent instructions · keyboard navigation · visible focus states · adjustable text size · high-contrast option · plain-language explanations · graph visibility control · equation visibility control · no timer · no forced audio · no flashing · no diagnosis disclosure · no account required · adaptations explainable and accept/reject-able.

**Current implementation evidence:**
- All 15 accessibility controls live in "Accessibility & display" plus the persistent header controls; every preference is an explicit learner choice.
- Reduced motion disables CSS animations/transitions globally and switches the canvas to static frame rendering.
- State summary paragraph doubles as an `aria-live` screen-reader summary; semantic HTML throughout; no drag-only interactions.

**Missing evidence:** formal accessibility audit (e.g., axe/WCAG evaluation), real-user usability test sessions.

**Risk:** the audit is claimed without a tool run. **Next action:** run an automated a11y scan (e.g., axe via Playwright) before demo day; schedule a usability session with the design participant.

---

## 4. Technical Execution — 10%

> Does the prototype work, and is the code reasonably structured?

**Winning evidence (all shipped):** strict TypeScript · deterministic simulation · typed state · unit tests for scientific invariants · component tests for the main learner flow · no LLM-generated scientific calculations · no unsafe arbitrary code execution · no runtime dependence on paid services · no broken controls · no fake buttons · no hardcoded prerecorded results · no unhandled empty/error states.

**Current implementation evidence:**
- 60 unit/component tests + 1 Playwright e2e smoke, all passing; `tsc --noEmit` and `eslint` clean; production build passes.
- Simulation invariants tested: deterministic replay, zero-neutron no-reaction, nonnegativity, max-step termination, max-population termination, expected-value absorption monotonicity, clamping, counterfactual one-variable constraint, immutability, replay-data consistency.
- Empty/error states: no prediction, invalid parameters (clamped), simulation not started, safety-cap stop, no adaptation, adaptation rejected, no counterfactual selected, no replay history, localStorage unavailable, corrupt session data (Zod-validated fail-safe).

**Missing evidence:** none critical. **Next action:** keep test count stable as features ship.

---

## 5. Presentation Quality — 10%

> Is the problem, solution, and impact clearly communicated?

**Winning evidence:** the landing page states the pitch in one sentence, the lab card makes the demo obvious, and the demo moment is supported end-to-end: predict mild increase → withdraw absorber → nonlinear acceleration to the safety ceiling → possible linear-growth friction → offered slower one-variable comparison → accepted → counterfactual clarifies cause → Adaptation Replay shows the change in understanding.

**Current implementation evidence:** landing page with pitch + "Enter the lab" + planned-lab cards; demo flow implemented and covered by the Playwright smoke test; README and docs tell the story honestly.

**Missing evidence:** the three-minute demo video (planned). **Next action:** record the demo video using the documented flow.
