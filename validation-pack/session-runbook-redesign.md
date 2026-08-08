# Session Runbook — Redesigned Lesson Workspace (real learner participant)

10-minute facilitator runbook for ONE real human participant on the deployed
redesign preview. Companion to `facilitator-session-sheet.md` (full detail),
`participant-test-extension.md` (generative task), and `user-testing-kit.md` /
`user-testing-session-sheet.md` (paper observation grids).

**Honesty rule:** fill in nothing that did not happen. All templates stay empty
until a real session runs. Never fabricate results. No participant data exists
yet — nothing below is a record of a session.

---

## Setup (before the participant arrives)

- [ ] Open **https://unseen-7cr4flzbr-sai-aathish-karthiks-projects.vercel.app**
      (PR #20 preview, head `917156a` — the 70/30 LessonRail workspace; NOT
      production main). Homepage ask form loads.
- [ ] Clear research data: `/research` → **Clear all research data** (press
      again to confirm). Clean slate, no leftover session.
- [ ] Have the consent paragraph below ready to read aloud, exactly as written.
- [ ] Paper/notes ready for the observation grid and post questions.

## The 10 minutes (approximate)

### 0:00–1:30 — Consent (mandatory, first)

Open `/research` on the preview (footer link "Product research session" on the
homepage). Read the consent copy **exactly**:

> **"This session is voluntary — you can stop at any time, no questions asked.
> If you agree, we may collect anonymized notes, anonymized quotes, anonymized
> screenshots, and your responses to help improve the product. Recording is
> optional and only happens with your permission. This is not a diagnosis or an
> evaluation of you, and taking part does not guarantee any learning benefit."**

Participant chooses **Agree and begin** (recording ON) or **Continue without
research recording** (nothing recorded — end here politely if they decline).
Note the choice; do not record anything if they declined.

### 1:30–3:00 — Pre-session form

Participant completes the pre form: concept question ("What happens to the
system when one thing changes?"), confidence 1–5, expected mental effort 1–5,
preferred explanation style. Press **Start session**. Note the session id
aloud so it can be linked to the paper sheet.

### 3:00–8:00 — The single mandated task

Open the homepage in a new tab. Say: *"You will do one thing. I won't help
during the task — if the app is broken, tell me and we'll stop."*

Read the mandated task **verbatim**:

> **"Ask UnseenLab to help you understand why planets remain in orbit."**

Participant types it into the ask form and submits. Expected: the orbits
showcase ("Gravity & Orbits"; the query routes there — verified read-only).
Then let them work the rail alone: Predict → Interact → Observe → Explain →
Complete. Observe silently; type observations into the **Facilitator notes**
box on `/research` as they happen (timestamps, verbatim remarks).

### 8:00–9:30 — Post-session form

Back on `/research`: confidence 1–5, actual mental effort 1–5, "What became
clearer?", "What remained confusing?", "One thing to remove", "One thing to
keep". Press **Record post answers**. If the participant prefers to answer
aloud, type their words verbatim.

### 9:30–10:00 — Export and cleanup

1. Re-read facilitator notes; add anything remembered (verbatim only).
2. **Export anonymized session (JSON)** — save as
   `unseenlab-research-<date>-<participant-tag>.json` in `validation-pack/`
   (do NOT commit if it may identify the participant).
3. Spot-check: session id, consent, pre/post, notes, timestamps — nothing
   else. **Honest note:** the redesigned `/demos/[id]` workspace does not emit
   in-app research events (the recorder is wired to the legacy `/lab` route;
   code-verified), so `interactionEvidence` in the export will typically be
   empty for this session. Rail evidence lives in the facilitator notes and
   screenshots. Record that fact; never backfill or invent event rows.
4. **Clear all research data** (double-confirm) after the export is saved.

## Observation grid (rail — what to watch)

Record observed behavior only; mark anything not seen as not seen.

| Watch | What to note |
|---|---|
| Predict gating | Does Continue stay disabled until the prediction is submitted? |
| Interact gating | Does Continue unlock only after the REAL control is touched (e.g. the speed slider → "Interaction recorded.")? Does touching a different control fail to unlock it? |
| Back behavior | Does Back ever relock a completed step? Are completed steps shown completed on re-entry? |
| Explain honesty | Engine demo: free text, never graded — does it feel like the participant's own answer? Conceptual demo: self-assessed options — any sign it feels like a test? |
| Trust chip | Noticed? Mentioned? What did the participant make of it (verbatim)? |
| About this model | Did the participant find save / provenance / trial log behind ⓘ? How long did discovery take? |
| Representations | Which LEFT tabs were used and in what order (Table vs 3D/2D vs Timeline)? |
| Time to first prediction | Wall-clock from task start to first "Submit prediction". |
| Hesitation / help / quotes | Timestamp + surface + verbatim wording. |

## Post-session questions (2–3, redesigned-UI-aware)

Ask after the in-app post form, one at a time, answers recorded verbatim:

1. "When you went back to a step you had finished, did it still feel
   finished?" (completed-step persistence / Back never relocks)
2. "Did the Explain step feel like your own answer, or like a test?"
   (honesty of self-assessed explain, engine vs conceptual)
3. "Where did you expect to find your saved work and trial history?" (About
   this model discoverability — no leading hints)

---

## Status

**READY — awaiting participant. Nothing recorded yet.**

No session has run. No consent, no pre/post answers, no observations, no
quotes, no screenshots, no export, no revision-log rows exist for the
redesigned workspace. All templates above are empty until a real human
participant runs this kit.
