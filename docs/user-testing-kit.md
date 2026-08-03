# UnseenLab — User Testing Kit

**Purpose:** the FIRST structured user session with the initial design participant (a ~17-year-old high-school senior with disclosed ADHD, aspiring mountain biker, engineering interest, AP Physics 2 Modern Physics difficulty, values interactivity and animation).

**Honesty rule: this is an initial design case study, NOT a validated study.** Results are labeled "Initial design case study evidence. Not a statistically validated learning study." No test has been performed yet — this kit is the plan. Never claim a session happened before it did.

**Consent:** consent to record and use anonymous findings must be requested from the participant before starting, and the consent outcome must be recorded (see recording sheet). No quotes or observations are used without it.

Total time budget: ~30 min preparation + ~20 min testing.

---

## Pre-session setup checklist (before the participant arrives)

- [ ] Run `npm run dev` and verify http://localhost:3000 loads (Nuclear Chain Reaction lab).
- [ ] Reset local storage (dev tools → Application → Local Storage → clear) so the session starts from a clean state — no leftover session evidence or adaptations.
- [ ] Prepare the recording sheet (template below): pre-filled headers, empty cells, timestamp slots.
- [ ] Ask for and record consent to use anonymous findings (verbally or in writing; record the outcome).
- [ ] Agree on ground rules with yourself: **no coaching during the test** — never correct, hint, or explain how the lab works while the participant is using it. Observe and record only.
- [ ] Prepare the baseline question set (below) and the post-use questionnaire (below) on paper, ready to be read aloud.

---

## Baseline question set (before the test, ~5 min)

Three concept questions, asked and answered before any lab use. Score each independently on a 1–3 scale (1 = no useful answer / off track, 2 = partial, 3 = correct and confident-sounding). Do not tell the participant whether answers were right or wrong.

| # | Question | Score (1–3) |
|---|---|---|
| Q1 | If the absorber is withdrawn, what happens to the neutron population and why? |  |
| Q2 | What does material density change? |  |
| Q3 | What is a chain reaction in your own words? |  |

Record the answers verbatim alongside the scores.

---

## Test protocol (20 min)

### Phase 1 — Free exploration (3 min)

Let the participant explore the lab on their own. Do not interrupt, do not guide. Observe and note what they touch first, what they skip, how long they spend per feature, any visible hesitation.

### Phase 2 — Guided scenario (8 min)

Walk through the demo flow, narrating the steps only (not the science):

1. Predict the outcome of a trial (slightly faster than the previous one) + confidence.
2. Withdraw the absorber.
3. Run the simulation; watch the acceleration.
4. Open the graph view.
5. Note when the adaptation offer appears; read it; let the participant decide.
6. Accept the adaptation.
7. Run the counterfactual comparison.
8. Submit an updated prediction.
9. Open the Adaptation Replay.

**RECORD verbatim:** what the participant does at each step, what he says (exact wording), and any hesitation (pause length, hovering, asking for reassurance). If the adaptation offer does not appear, note that too — that is a finding, not a failure.

### Phase 3 — Static vs adaptive comparison (5 min) — the winning edge

Compare the unchanged simulation against the adaptive flow directly:

- **Static experience:** have the participant use ONLY the unchanged simulation (no adaptation offers) to answer ONE concept question. Record the answer verbatim.
- **Adaptive experience:** have the participant use the adaptive flow (adaptation offers active) to answer a parallel concept question. Record the answer verbatim.

Record both answers and any commentary. Do not judge either answer aloud.

### Phase 4 — Post-use questionnaire (4 min)

Ask, one at a time, and record answers verbatim:

- Confidence 1–5 **before** the session / **after** the session.
- Mental effort 1–5 **before** / **after**.
- "What became clearer?"
- "What remained confusing?"
- "What should we remove or change?"
- One direct anonymous quote: **"What was the most annoying thing?"** — write down the exact wording.

---

## Recording sheet template

Timestamp each row. Consent status at the top.

```
Consent to use anonymous findings: [ ] granted   [ ] declined   Date: ______
```

| Time | Observation (what he did / said, verbatim where possible) | Friction | Feature to remove | Feature to change |
|---|---|---|---|---|
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

---

## Honesty rules

- Record everything raw — including negative feedback. A session with no friction reported is a red flag; do not round away rough edges.
- Do not chase flattering feedback. Do not rephrase, soften, or editorialize quotes.
- Do not fabricate. Empty cells stay empty. If something was not observed, it is not recorded.
- Never claim a validated result — this is one initial case study, not a study with statistical power.

### After the session (required follow-ups)

1. Fill the templates in `docs/user-research.md` (test date, observed friction, direct quote, feature removed/changed, second-test field).
2. Implement **ONE** feedback-driven revision (smallest honest change that addresses the strongest signal), and document it in the design revision log as:

   `original design → user observation → direct feedback → implemented change → follow-up response`

   Leave the follow-up response empty if there is no second session yet — do not invent one.

---

## Updating the landing page "Design evidence" panel afterwards

After the session, update `src/app/page.tsx`'s "Design evidence" section (currently: "First structured test session — Pending…" and "Evidence fields to fill"):

- Replace the "Pending" text with a one-line summary of the session (date, what was tested, that it is an initial case study, not validated).
- Fill the evidence fields: observed issue (friction with a real quote), product change (the implemented revision), initial result (baseline vs post-use scores, confidence, mental effort).

Keep the same plain, honest voice: no marketing spin, no claims beyond what was measured.
