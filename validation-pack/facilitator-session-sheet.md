# UnseenLab — Facilitator Session Sheet (in-app research mode)

Runs the impact evidence session for ONE participant using the built-in research
mode. Everything the participant does in the lab is captured locally and
exported as one anonymous JSON file. This sheet is the facilitator's runbook.
Complementary paper sheets: `user-testing-kit.md` and
`user-testing-session-sheet.md` (use this sheet for the app flow, those for
verbatim observation grids).

**Honesty rule:** fill in nothing that did not happen. All templates stay empty
until a real session runs. Never fabricate results.

**Never collect:** email, account info, Firebase tokens, Mongo credentials, or
any diagnosis. The export has no such fields; do not write them into the notes.

---

## Before the participant arrives (~10 min)

- [ ] `npm run dev` running; http://localhost:3000 loads (Nuclear Chain Reaction lab).
- [ ] Clear research data: open `/research` → "Clear all research data" (or clear
      localStorage in dev tools) so the device is a clean slate.
- [ ] Note the participant's consent needs: read the consent line verbatim
      (below) and let them choose. The app records their choice.
- [ ] Prepare the post questions on paper as a backup if the participant prefers
      to answer aloud (facilitator types them into the post form).
- [ ] Screenshot checklist ready (see "Screenshot checklist" below).

## 1. Consent (mandatory, first)

Open **http://localhost:3000/research** (reachable via the subtle footer link
"Product research session" on the homepage).

Read the consent copy **exactly**:

> **"This session records your interactions and responses for product testing.
> You may stop at any time."**

The participant chooses:

- **Agree and begin** — recording is ON; the pre-session form appears.
- **Continue without research recording** — the lab opens normally, nothing is
  recorded, and the screen is clearly labeled "Research recording is OFF".
  End here if they decline: no export, no data, no problem. Note the decline in
  the revision log (observation, no fabricated data).

## 2. Pre-session form (~3 min)

With consent agreed, have the participant complete the pre form:

1. The concept question (shown on screen): *"What happens to the number of free
   neutrons over time if nothing changes?"*
2. Confidence 1–5 (expected to be low before the lab — record as given).
3. Expected mental effort 1–5.
4. Preferred explanation style (visual first / step by step / concise).

Press **Start session**. The session id is generated automatically — read it
aloud or note it in the facilitator notes so it can be linked to the paper sheet.

## 3. Lab task (script — the exact 4-step task, ~10–15 min)

Open the lab via **"Open the lab (recording ON)"** (URL:
`/lab/nuclear-chain-reaction?research=1`). The strip at the bottom of the lab
must read **"Research recording ON"** — if it does not, stop and fix consent /
URL before continuing.

Say: *"You will do four things. I won't help during the task — if the app is
broken, tell me and we'll stop."*

1. **Predict.** Read the goal, choose an answer to "What do you expect?" and
   set a confidence. Submit the prediction.
2. **Change one thing.** Withdraw the absorber (absorber position → 0).
3. **Run the trial.** Press "Run trial" and watch the animation play.
4. **Understand.** Open "See the result another way" → **Graph** view. Compare
   what you predicted with what the graph shows.

Then, only if the participant is comfortable and time allows:

- If an adaptation offer appears, let them read it and decide (accept / modify /
  reject) without coaching.
- Invite one more loop: *"Would you like to change one thing and try again?"*
  (updated prediction → one variable → run).

**Facilitator does:** observe silently. Type observations into the **Facilitator
notes** box on the research page as they happen — hesitation timestamps, help
requests, verbal comments (verbatim), navigation confusion. Pause timestamps
with wall-clock time (e.g. `00:01:42 — long pause before touching the absorber`).

## 4. Post-session form (~5 min)

Return to the **/research** page (keep the lab tab open or re-open the page).
Have the participant complete the post form:

1. The same concept question, confidence 1–5 (expected to change — record as given).
2. Actual mental effort 1–5.
3. What became clearer?
4. What remained confusing?
5. One thing to remove.
6. One thing to keep.

Press **Record post answers**. If the participant prefers to answer aloud,
type their words into the fields verbatim.

## 5. Export (~2 min)

1. Re-read the facilitator notes; add anything remembered (verbatim only).
2. Press **Export anonymized session (JSON)** — save the file as
   `unseenlab-research-<date>-<participant-tag>.json` in this repo's
   `validation-pack/` folder (do NOT commit it if it may identify the
   participant).
3. Spot-check the file: it must contain session id, consent, pre/post answers,
   interaction evidence, facilitator notes, timestamps — and nothing else
   (no email, no token, no diagnosis).
4. Press **Clear all research data** (double-confirm) so the next participant
   starts from a clean slate — after the export is saved.
5. After the session, fill `revision-log.md` with observed rows (0 rows allowed)
   and `docs/user-research.md` templates.

## Screenshot checklist

**Before (with the participant, or during setup):**

- [ ] `/research` consent gate (the exact consent copy visible).
- [ ] Pre-session form filled with the concept question and sliders.
- [ ] Lab first step: prediction panel with the participant's answer.

**After (during or right after the task):**

- [ ] Results view with the graph representation open (trial + graph).
- [ ] Adaptation offer card if one appeared (accepted or not).
- [ ] Counterfactual comparison if used.
- [ ] `/research` session card showing the session id and event count.
- [ ] Post form filled.
- [ ] Exported JSON opened (first ~30 lines).

Name screenshots `research-before-01…` / `research-after-01…` and store them
next to the export. Screenshots must not capture account emails or any tab with
cloud credentials.

## Debrief notes (right after the participant leaves)

- What did they say about the task overall (verbatim)?
- Where did they hesitate or stop?
- Which representation did they use most?
- What felt under their control; what did not?
- Anything that would change the 4-step task for the next session?

Keep debrief notes in the facilitator notes box or on paper — either way they
may be transcribed into `revision-log.md` as evidence, verbatim, never improved.

## Sign-off

| Field | Entry |
|---|---|
| Session date |  |
| Participant still comfortable at end | [ ] yes  [ ] no  [ ] stopped early — reason (only if offered freely) |
| Export saved and spot-checked | [ ] yes |
| Research data cleared after export | [ ] yes |
| Revision log rows filled (may be 0) |  |
| No identifying info / no diagnosis collected | [ ] yes |
