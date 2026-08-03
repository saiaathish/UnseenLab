# UnseenLab — User Testing Protocol (Single Design Participant)

**Product:** UnseenLab — Adaptive Virtual STEM Laboratory, Conceptual Nuclear Chain Reaction lab (`/lab/nuclear-chain-reaction`).

**Participant:** ONE design participant — a ~17-year-old high-school senior with disclosed ADHD who values interactivity and animation. The participant is a **design collaborator**, not a research subject.

**Status of results:** This protocol describes a planned two-session engagement. **No results exist yet.** Any future write-up must mark all outcomes UNVERIFIED until the sessions actually run, and may never generalize beyond this single participant.

**First session budget:** 15–20 minutes maximum. **Follow-up session:** 5–10 minutes maximum. The follow-up exists only to test the one feature the builder changed.

---

## Purpose and ethics

**Purpose.** Answer three questions, in this order of importance:

1. Does the learner choose interactivity and animation when nothing forces him to?
2. Do the adaptation offers feel respectful, understandable, and under his control?
3. Which single feature should change, which should be preserved, which should be cut?

This is **not a clinical study**. It produces design direction for one learner, not evidence about any population. No diagnosis is offered, inferred, or recorded. No pressure is applied at any point — the participant can stop at any time, for any reason, without explanation.

**What may be recorded (with consent):**
- Anonymous interaction notes (what was clicked, when, in what order).
- Anonymous quotes from the participant.
- The participant's own answers and confidence/effort ratings.
- A description of design changes made as a result.

**What may NEVER be recorded:**
- The participant's name, face, voice, school, or any identifying information.
- Anything the participant says after revoking consent or during a stop.
- Medical, diagnostic, or medication information — even if volunteered, it is not noted.

**Anonymity.** The participant receives a random identifier (e.g., `UL-P07`) generated at session start. All notes use only that identifier. Quotes used in the reporting section must be scrubbed of identifying detail.

**Stop rule.** The facilitator says at the start: "You are in charge. Say stop and we stop — no explanation needed, nothing is lost." If the participant looks uncomfortable, tired, or distracted for more than ~30 seconds, the facilitator offers a break or ends the session. The participant's comfort always outranks the protocol.

**Consent (verbal, recorded as Y/N on the session sheet).** Before anything else, the participant is asked, and his answer is logged:
"Do you agree that I watch you use the app, take anonymous notes about what you do, and later describe changes to the app that came from your feedback — without ever using your name? You can stop at any time, and you don't have to answer any question you don't want to. Is that OK?"

---

## Part A — Consent and context (2 min)

Facilitator says, plainly:

> "This is a design session, not a test of you. The app is the thing being tried out — you are the designer giving feedback. I'll ask you a few questions before, you'll use the app on your own for a few minutes, then I'll ask you a few questions after. You can stop whenever you like. Nothing you say will be connected to your name. Ready?"

Record on the session sheet:
- Consent recorded (Y/N) and what was agreed.
- Anonymous participant identifier.
- Session date and facilitator.

Optional context question (record if he answers, skip if he doesn't want to): "Is there anything that usually makes learning software feel good or bad for you?" — used only to interpret observations, never reported as a finding.

---

## Part B — Baseline (3 min, 3 conceptual questions)

Purpose: a coarse pre/post read on whether the app shifts understanding of chain reactions. Three short conceptual questions, asked **orally** (no app open). For each: record the answer (verbatim), confidence 1–5, and mental effort 1–5 (how hard the question felt to think about). There are no right answers; the facilitator never corrects.

**B1.** "Imagine the same starting conditions every step — same number of neutrons, nothing else changing. What do you think happens to the number of free neutrons over time: does it stay steady, grow, shrink — and why do you think that?"

**B2.** "If you push the absorber in further, what do you expect to happen to the reaction — and why?"

**B3.** "If you run the exact same experiment twice with the same settings, will the two runs look the same or different? Why?"

Confidence scale: 1 = guessing, 5 = very sure. Mental effort scale: 1 = effortless, 5 = very hard to think about. The participant picks the number; the facilitator never suggests one.

---

## Part C — Independent use (8 min)

The participant uses the app alone. The facilitator's job is to watch and take notes, **not to coach**.

**Handoff script:**

> "This is UnseenLab. There's one lab open: a nuclear chain reaction. Start anywhere you like. I won't help unless something is actually broken — if something is broken, tell me and I'll fix it or note it. Take your time; there's no timer on you."

**When coaching is allowed (only for product defects, not for confusion):**
- The app itself errors (crash, blank screen, a control that visibly does nothing).
- The participant asks a direct question and waiting would frustrate him — answer with the shortest neutral pointer (e.g., "the prediction panel is on the left"), then note it as coaching.
- Confusion that is *not* a defect is recorded, not resolved.

**Observation checklist** (tick on the session sheet; every box gets one of: met / not met / unclear):

| # | Observation | What to look for | Record |
|---|---|---|---|
| C1 | Time to first interaction | Seconds from handoff to first click/keystroke | ____ s |
| C2 | Animation used | Did he press Play at all? On which trial? | [ ] yes [ ] no |
| C3 | Animation replayed | Same parameters re-run, or Play pressed again (count) | ____ times |
| C4 | Variable changes | Which of absorber position / starting neutrons / material density / absorption chance / duration / seed did he touch | list: ____ |
| C5 | Representation changes | Did he open Graph / Equation / Causal / Plain language? Which, in what order | list: ____ |
| C6 | Confusion points | Points where he paused, re-read, asked, or sighed | time + surface: ____ |
| C7 | Adaptation offered | Which type appeared (freeze_variables, slow_animation, show_graph, show_causal_view, reduce_density, compare_trials, ask_prediction_again) | type: ____ |
| C8 | Adaptation accepted | Accept / Reject / Modify — which decision | decision: ____ |
| C9 | Does the adaptation help? | What happened after the decision — did he use the changed view/setting? | notes: ____ |
| C10 | Does he notice WHY the system adapted? | Does he comment on the reason text at all, or just click through? | notes: ____ |

**Interaction events log** (raw rows on the session sheet): time (e.g., `0:00`, `3:15`), action, screen region, any spoken words. This log is the raw material for the reporting section.

---

## Part D — Post-use (5 min)

**Step 1 — Parallel conceptual questions (2 min).** The SAME three questions from Part B, re-asked with the same wording, same scales. Record answer / confidence / mental effort. No reminding of the earlier answers, no "compare to before" prompts — the comparison happens later, in analysis, not in front of the participant.

**Step 2 — The eight questions, verbatim (3 min).** Ask exactly these; read them in this order. Record answers verbatim (or close paraphrase if verbatim is impractical, marked as paraphrase):

1. "What became clearer?"
2. "What remained confusing?"
3. "Which feature should be removed?"
4. "Which feature should change?"
5. "Did the animation help? How?"
6. "Did the interaction help? How?"
7. "Did any adaptation feel annoying or incorrect?"
8. "Did the final view feel under your control?"

**Step 3 — Direct quote (30s).** Ask: "Is there one thing you'd want the builders to hear, in your own words?" Record it verbatim as the direct quote. If nothing comes, leave the field empty — never paraphrase into a quote.

---

## Part E — Design decision (2 min)

This is a **builder decision**, made after the session, by the builder — not by the participant, and not on the spot. The builder selects:

- **One feature to change** (preferably the top item from the participant's answers).
- **One feature to preserve.**
- **One feature to cut or defer.**

Record the choices and the one-line rationale each. If the participant's requested removal or requested change is not the item the builder picks, the sheet must show the mismatch explicitly (both recorded; the builder's choice carries the note "deviates from participant request").

---

## Follow-up session (5–10 min, only after the change is built)

**Purpose:** test the ONE changed feature. Nothing else.

**Script:**

> "We changed [feature]. Here's what it does now. Try it. Then I'll ask you two things."

1. **Try the changed feature** (3–5 min, same observe-only rules as Part C, focused on the changed surface only).
2. **Three questions:**
   - "Did this change address the problem you identified?"
   - "Is this easier, harder, or unchanged compared to before?"
   - "Should this change stay?"

Record answers verbatim. Follow-up outcome: keep the change / revise the change / revert the change — with the participant's words as justification. If the follow-up cannot happen, the reporting section must say so (UNVERIFIED) rather than claim a follow-up.

---

## Reporting language

Any write-up that comes from these sessions must:

**Allowed (examples):**
- "In an initial two-session design case study, one neurodivergent high-school learner reported…"
- "The design participant described the graph view as clearer than the animation for comparing runs."
- "UNVERIFIED: follow-up session not yet run."
- "No statistical claims are made; n = 1 design case."

**Forbidden (never use):**
- "Proven effective"
- "Improves ADHD learning"
- "Validated for neurodivergent students"
- "Statistically significant"
- "Clinically shown"
- Any statement that turns one learner's preference into a claim about a population, a diagnosis, or a treatment.

Rule of thumb: every sentence in the report must be attributable to a specific observation or quote from this one participant, or be explicitly marked UNVERIFIED.

---

## Timing budget (first session: 15–20 min total)

| Part | Minutes | Cumulative |
|---|---|---|
| A. Consent and context | 2 | 2 |
| B. Baseline (3 questions × answer+2 ratings) | 3 | 5 |
| C. Independent use (observe + checklist) | 8 | 13 |
| D. Post-use (3 questions + 8 questions + quote) | 5 | 18 |
| E. Design decision (builder, after session) | 2 | 20 |
| Buffer for stops/breaks | 0–2 | ≤ 20 |

Follow-up: changed-feature tryout 3–5 min + three questions 2–3 min + decision 1 min = **5–10 min**.

## Materials needed

- Laptop or tablet with UnseenLab running, fresh session (clear localStorage `unseenlab.preferences.v1` and `unseenlab.evidence.v1` — `src/storage/session-storage.ts:17-18`), screen brightness normal, no other tabs open.
- The printed session sheet (`user-testing-session-sheet.md`) + pen.
- Timer (phone is fine; visible to the facilitator only).
- A quiet room; no audience; no observers other than the facilitator.
- Nothing else — no recording devices, no consent forms beyond the verbal agreement, no school paperwork.

## What to record / what NOT to record

**Record:**
- Consent Y/N and the words of what was agreed.
- Anonymous identifier, date, session length.
- Baseline and post-use answers with confidence and mental effort ratings (1–5 each).
- Every item in the observation checklist (C1–C10) — including "unclear" marks.
- The interaction events log (time/action/region).
- Animation feedback and interactivity feedback (from questions 5 and 6).
- Adaptation offered (which type) and accepted/rejected/modified.
- Verbatim quotes and the 8 question answers.
- Requested removal, requested change.
- Builder decision (change/preserve/cut) with rationale.
- Follow-up outcome (if and when it happens).
- Explicit `UNVERIFIED` marks for anything that didn't happen.

**Do NOT record:**
- Any identifying information (name, school, face, voice, device identifiers).
- Anything said during a stop, or after consent is withdrawn.
- Any medical, diagnostic, or medication details.
- The facilitator's own interpretations as if they were participant statements — interpretations are marked separately as facilitator notes.
- Inferred results, invented quotes, or "expected" answers.
