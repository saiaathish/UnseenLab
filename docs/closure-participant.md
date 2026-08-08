# Closure — Participant Research (AGENT 10)

Status: **READY (kit) — awaiting human participant on the redesign preview (PR #20 head 917156a)**

Date: 2026-08-07
Branch: `feature/generative-demonstration-engine` (PR #20 — redesigned lesson workspace)

---

## 0. Status update (2026-08-07)

The participant kit is now READY for a real human learner on the redesigned
workspace deployed at
https://unseen-7cr4flzbr-sai-aathish-karthiks-projects.vercel.app
(PR #20 preview, head `917156a` — the 70/30 LessonRail workspace; NOT
production main).

What changed since the 2026-08-05 record below:

- `validation-pack/facilitator-session-sheet.md` — rewritten for the redesign:
  before-session checklist points at the deployed preview URL (not localhost),
  the session flow is the rail (`Predict → Interact → Observe → Explain →
  Complete`) plus `ⓘ About this model` for save/provenance/trial log, and the
  screenshot checklist covers the 70/30 layout, rail gating,
  completed-step persistence, and the About dialog. Consent copy and honesty
  rule kept verbatim.
- `validation-pack/participant-test-extension.md` — updated to the redesign;
  every removed touchpoint is mapped to its new location (rail step /
  `ⓘ About this model`). The mandated task text is unchanged.
- `validation-pack/session-runbook-redesign.md` — NEW 10-minute runbook:
  exact URL, consent read-aloud, the single mandated task, rail observation
  grid, redesigned-UI-aware post questions, export step, and the status block
  "READY — awaiting participant. Nothing recorded yet."
- Primary task text now CONFIRMED (read-only code verification): the mandated
  query "Ask UnseenLab to help you understand why planets remain in orbit."
  routes to the orbits showcase — `routeQuery` scores it `engine:orbits`
  (keywords "planets" + "orbit"), `matchShowcase` resolves it to orbits, and
  `interpret` yields "Gravity & Orbits". The previous wording discrepancy
  (required text vs canonical "Show why planets stay in orbit.") is resolved:
  the mandated text itself routes correctly.

What still blocks: **the human.** No participant has been available to this
agent. No session has run; no data exists.

- Session run: **NO** (awaiting human participant)
- Export file (`unseenlab-research-<date>-<participant-tag>.json`): **NONE**
- Revision-log rows from the session: **NONE**
- Claims from participant evidence: **NONE**

Required human action (unchanged): a human facilitator runs
`validation-pack/session-runbook-redesign.md` (10 min) with the participant on
the preview, then reports back with the exported JSON and any revision-log
rows.

---

## 1. Previous record — protocol-ready status: NO (partial), 2026-08-05

Files reviewed (as of 2026-08-05, pre-redesign):

- `validation-pack/facilitator-session-sheet.md` — present. Facilitator runbook for the
  **Nuclear Chain Reaction** lab research mode (`/research`), not the generative orbits
  demo. Honesty rule present ("fill in nothing that did not happen"; templates empty).
- `validation-pack/participant-test-extension.md` — present. Extends the participant kit
  for the generative demonstration engine (orbits task, adaptation, save, fallback honesty,
  session→revision rule).
- `docs/demo-script-generative.md` — present. 3-minute generative demo script (orbits →
  photosynthesis → mitosis → trust labels → save).

Primary task text check — **FAILED (cannot confirm)** at the time:

- Required exact text: `"Ask UnseenLab to help you understand why planets remain in orbit."`
- Searched repo (docs, validation-pack, tests, src): **no occurrence** of
  "planets remain in orbit" or "Ask UnseenLab".
- Canonical text used everywhere instead:
  `"Show why planets stay in orbit."`
  (`validation-pack/participant-test-extension.md` line 8;
  `docs/demo-script-generative.md` line 30; also
  `tests/demonstrations/benchmark/benchmark.test.ts`, `tests/demonstrations/ui/ask-flow.test.tsx`).

Additional mismatch: the facilitator session sheet targeted the Nuclear Chain Reaction lab
("What happens to the number of free neutrons over time if nothing changes?"), a different
task/lab from the required orbits task.

## 2. Previous record — capture sheet checklist (required before/during/after fields)

Verified against `validation-pack/facilitator-session-sheet.md` (+ extension where noted),
as of 2026-08-05:

| Required field | Status | Where / note |
|---|---|---|
| Concept explanation | Present | Pre/post concept question (free text) — nuclear chain reaction wording |
| Prediction | Present | Step 1 "What do you expect?" + submit |
| Confidence 1–5 | Present | Pre and post forms |
| Mental effort 1–5 | Present | Expected (pre) / actual (post) |
| First action | Missing | No capture field; task steps are fully scripted (implicit in facilitator notes at best) |
| First variable changed | Missing | No capture field; scripted (absorber → 0 in sheet; one-variable mode in extension) |
| Time to first prediction | Missing | Only ad-hoc wall-clock facilitator pause timestamps, no defined field |
| Hesitation | Present (implicit) | Facilitator notes: "hesitation timestamps" |
| Help request | Present (implicit) | Facilitator notes: "help requests" |
| Representation selected | Partial | Debrief question only ("Which representation did they use most?"); in-task view is scripted (Graph) |
| Trust-label interpretation | Missing | Sheet has no trust labels; extension records only "trust badge seen" as a note |
| Adaptation accepted/rejected/modified | Partial | Instruction to decide accept/modify/reject + screenshot checklist; no explicit capture field |
| Accessibility settings | Missing | Not present in the sheet |
| Revised explanation/prediction | Partial | Second loop invites "updated prediction"; no explicit field |
| One thing to remove / keep | Present | Post form items 5 and 6 |
| Exact quote | Present (implicit) | Facilitator notes: verbatim comments only |

Result (2026-08-05): 7 present / 4 partial / 5 missing. The required field set was not fully
covered by any single sheet. No session sheet row, score, quote, or observation had been
filled in — all templates remained empty. (Superseded by the 2026-08-07 kit above, which
remaps the removed UI and adds the rail observation grid.)

## 3. BLOCKED declaration (2026-08-05, superseded by §0)

This closure office runs in an automated environment. The participant session requires a
real human learner in a live browser session with a facilitator present; **no human
participant is available to this agent**.

Per the honesty rules in the session sheet and the extension ("Do NOT fabricate: record
only what the participant actually did and said"), no session was run and no participant
data can be produced.

- Session run: **NO**
- Export file (`unseenlab-research-<date>-<participant-tag>.json`): **NONE**
- Revision-log rows from the session: **NONE**
- Claims from participant evidence: **NONE**

## 4. Required human action (still open)

A human facilitator must run the session in a live browser per
`validation-pack/session-runbook-redesign.md` (consent → pre form → mandated
ask task on the rail → post form → export → clear), using the generative
extension `validation-pack/participant-test-extension.md` for the orbits task,
then report back with the exported JSON and any revision-log rows. The primary
task text discrepancy noted on 2026-08-05 is now resolved (see §0): the
mandated text routes to the orbits showcase.

## 5. Claims that remain unavailable

- Participant pre/post measures
- Confidence change (pre → post)
- Mental effort (expected vs actual)
- Rail-gating observations (Continue after real interaction; Back relock)
- Direct participant quote
- Participant-caused revision

Impact points awarded: **NONE**
