# UnseenLab — Facilitator Session Sheet (in-app research mode)

Runs the impact evidence session for ONE participant using the built-in research
mode. Everything the participant does is captured locally and exported as one
anonymous JSON file. This sheet is the facilitator's runbook.

**Version:** redesigned lesson workspace (PR #20 head `917156a`) — the
70/30 LessonRail workspace at `/demos/[id]` (LEFT model + RIGHT rail
`Predict → Interact → Observe → Explain → Complete`). Complementary paper
sheets: `user-testing-kit.md` and `user-testing-session-sheet.md` (use this
sheet for the app flow, those for verbatim observation grids).

**Honesty rule:** fill in nothing that did not happen. All templates stay empty
until a real session runs. Never fabricate results.

**Generative demo session (judge Gate 5/6):** use
`participant-test-extension.md` instead. Mandated task text, verbatim:
"Ask UnseenLab to help you understand why planets remain in orbit."

**Never collect:** email, account info, Firebase tokens, Mongo credentials, or
any diagnosis. The export has no such fields; do not write them into the notes.

---

## Before the participant arrives (~10 min)

- [ ] Open the deployed preview: **https://unseen-7cr4flzbr-sai-aathish-karthiks-projects.vercel.app**
      (PR #20 preview of the redesigned workspace — NOT production main).
      The homepage ask form loads ("What topic do you need help with?").
      Do NOT use localhost; this kit targets the deployed preview.
- [ ] Clear research data: open `/research` on the preview → **Clear all research
      data** (press again to confirm) so the device is a clean slate.
- [ ] Note the participant's consent needs: read the consent line verbatim
      (below) and let them choose. The app records their choice.
- [ ] Prepare the post questions on paper as a backup if the participant prefers
      to answer aloud (facilitator types them into the post form).
- [ ] Screenshot checklist ready (see "Screenshot checklist" below).

## 1. Consent (mandatory, first)

Open **https://unseen-7cr4flzbr-sai-aathish-karthiks-projects.vercel.app/research**
(reachable via the subtle footer link "Product research session" on the
homepage).

Read the consent copy **exactly**:

> **"This session is voluntary — you can stop at any time, no questions asked.
> If you agree, we may collect anonymized notes, anonymized quotes, anonymized
> screenshots, and your responses to help improve the product. Recording is
> optional and only happens with your permission. This is not a diagnosis or an
> evaluation of you, and taking part does not guarantee any learning benefit."**

The participant chooses:

- **Agree and begin** — recording is ON; the pre-session form appears.
- **Continue without research recording** — the app opens normally, nothing is
  recorded, and the screen is clearly labeled "Research recording is OFF".
  End here if they decline: no export, no data, no problem. Note the decline in
  the revision log (observation, no fabricated data).

## 2. Pre-session form (~3 min)

With consent agreed, have the participant complete the pre form:

1. The concept question (shown on screen, topic-agnostic — the same wording is
   used for any demonstration): *"What happens to the system when one thing
   changes?"*
2. Confidence 1–5 (expected to be low before the lab — record as given).
3. Expected mental effort 1–5.
4. Preferred explanation style (visual first / step by step / concise).

Press **Start session**. The session id is generated automatically — read it
aloud or note it in the facilitator notes so it can be linked to the paper sheet.

## 3. Task (rail script — the mandated single task, ~10–15 min)

> **Note on the research page's "Open the lab (recording ON)" button:** that
> button still links to the legacy lab route `/lab/nuclear-chain-reaction?research=1`
> and the in-app event capture is wired to that legacy lab only (code-verified,
> PR #20 head). The redesigned workspace at `/demos/[id]` does not emit in-app
> research events. For this session, do NOT click "Open the lab (recording ON)".
> The consent, pre/post forms, facilitator notes, and JSON export on `/research`
> all work unchanged; the rail journey itself is captured via the facilitator
> notes (timestamps, verbatim remarks) and the screenshot checklist below.

Open the homepage on the preview (new tab). Say: *"You will do one thing. I
won't help during the task — if the app is broken, tell me and we'll stop."*

**The single mandated task (read aloud, verbatim):**
*"Ask UnseenLab to help you understand why planets remain in orbit."*

Have the participant type that exact query into the homepage ask form and
submit. The task must route to the **orbits showcase** ("Gravity & Orbits";
verified: the query words "planets" + "orbit" route to the `orbits` engine and
match the orbits showcase — read-only code verification, not a claim about
this session). The generated demo opens at `/demos/[id]` with the 70/30
workspace: LEFT model (representation tabs, stage, minimal controls), RIGHT
LessonRail.

Let the participant work through the rail at their own pace. The rail steps and
their honest gating (code-verified behavior; observe whether it holds):

1. **Predict** — read the goal, choose an answer. **Continue stays disabled
   until the prediction is submitted** ("Submit prediction").
2. **Interact** — the step names the real control (e.g. "Move the Orbital
   speed slider."). **Continue stays disabled until that control is actually
   touched** — the stage confirms "Interaction recorded." A different control
   does not complete the step. Watch whether the orbit widens and the period
   readout grows.
3. **Observe** — select at least one observation item; Continue unlocks.
4. **Explain** — engine demos: free-text self-assessment ("Your explanation"),
   never graded. Conceptual demos: self-assessed options, never graded. Watch
   whether this step feels honest for the demo type.
5. **Complete** — recap of what the participant predicted and changed,
   "Restore these parameters" (honest replay — fresh run, labeled), and the
   "New concept" link home.

Throughout: **Back never relocks a completed step** — re-entering a step keeps
its Continue enabled. **Completed steps persist** across back-navigation and
reload.

**Save / provenance / trial log:** behind the **ⓘ About this model** button —
trust label, source ("Offline catalog"), provenance, limitations, save status
("Not saved" → guest "Saved on this device" / signed-in "Saved to your
account"), and the compact trial log with replay. The trust chip (e.g.
"Verified simulation") appears only in the header.

**Facilitator does:** observe silently. Type observations into the **Facilitator
notes** box on the research page as they happen — hesitation timestamps, help
requests, verbal comments (verbatim), navigation confusion. Pause timestamps
with wall-clock time (e.g. `00:01:42 — long pause before touching the slider`).
Note explicitly: did Continue unlock only after real interaction? did Back
relock anything? did the Explain step feel honest?

## 4. Post-session form (~5 min)

Return to the **/research** page (keep the demo tab open or re-open the page).
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
   facilitator notes, timestamps — and nothing else (no email, no token, no
   diagnosis). Note honestly: because the redesigned `/demos/[id]` workspace
   does not emit in-app research events (see §3 note), the
   `interactionEvidence` array will typically be empty for this session — the
   rail evidence lives in the facilitator notes and screenshots. Record that
   fact in the notes; do not backfill or invent event rows.
4. Press **Clear all research data** (double-confirm) so the next participant
   starts from a clean slate — after the export is saved.
5. After the session, fill `revision-log.md` with observed rows (0 rows allowed)
   and `docs/user-research.md` templates.

## Screenshot checklist

**Before (with the participant, or during setup):**

- [ ] `/research` consent gate (the exact consent copy visible).
- [ ] Pre-session form filled with the concept question and sliders.
- [ ] Homepage ask form with the mandated query typed in, before submit.

**After (during or right after the task):**

- [ ] Demo workspace at `/demos/[id]` — full 70/30 layout (LEFT model + RIGHT
      rail), trust chip in the header.
- [ ] Predict step with the participant's answer and the gated Continue.
- [ ] Interact step mid-slider-move ("Interaction recorded." visible).
- [ ] Observe step with selections.
- [ ] Explain step with the participant's own text (engine) or choice (conceptual).
- [ ] Complete step recap + "Restore these parameters".
- [ ] Completed-step persistence: a step re-entered via Back showing Continue
      enabled (if the participant does this naturally).
- [ ] **ⓘ About this model** dialog open — trust, provenance, save status,
      trial log.
- [ ] `/research` session card showing the session id and event count.
- [ ] Post form filled.
- [ ] Exported JSON opened (first ~30 lines).

Name screenshots `research-before-01…` / `research-after-01…` and store them
next to the export. Screenshots must not capture account emails or any tab with
cloud credentials.

## Debrief notes (right after the participant leaves)

- What did they say about the task overall (verbatim)?
- Where did they hesitate or stop?
- Did Continue unlock only after real interaction? Did Back relock anything?
- Did the Explain step feel honest (their own answer, not a test)?
- Which representation did they use most?
- What felt under their control; what did not?
- Anything that would change the rail task for the next session?

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
