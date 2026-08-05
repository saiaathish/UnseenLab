# Closure — Participant Research (AGENT 10)

Status: **BLOCKED** — no human participant available in this environment.

Date: 2026-08-05
Branch: `feature/generative-demonstration-engine` (PR #9)

---

## 1. Protocol-ready status: NO (partial — files exist, exact task text not confirmed)

Files reviewed:

- `validation-pack/facilitator-session-sheet.md` — present. Facilitator runbook for the
  **Nuclear Chain Reaction** lab research mode (`/research`), not the generative orbits
  demo. Honesty rule present ("fill in nothing that did not happen"; templates empty).
- `validation-pack/participant-test-extension.md` — present. Extends the participant kit
  for the generative demonstration engine (orbits task, adaptation, save, fallback honesty,
  session→revision rule).
- `docs/demo-script-generative.md` — present. 3-minute generative demo script (orbits →
  photosynthesis → mitosis → trust labels → save).

Primary task text check — **FAILED (cannot confirm)**:

- Required exact text: `"Ask UnseenLab to help you understand why planets remain in orbit."`
- Searched repo (docs, validation-pack, tests, src): **no occurrence** of
  "planets remain in orbit" or "Ask UnseenLab".
- Canonical text used everywhere instead:
  `"Show why planets stay in orbit."`
  (`validation-pack/participant-test-extension.md` line 8;
  `docs/demo-script-generative.md` line 30; also
  `tests/demonstrations/benchmark/benchmark.test.ts`, `tests/demonstrations/ui/ask-flow.test.tsx`).

Additional mismatch: the facilitator session sheet targets the Nuclear Chain Reaction lab
("What happens to the number of free neutrons over time if nothing changes?"), a different
task/lab from the required orbits task.

## 2. Capture sheet checklist (required before/during/after fields)

Verified against `validation-pack/facilitator-session-sheet.md` (+ extension where noted):

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

Result: 7 present / 4 partial / 5 missing. The required field set is not fully covered by
any single sheet. No session sheet row, score, quote, or observation has been filled in —
all templates remain empty.

## 3. BLOCKED declaration

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

## 4. Required human action

A human facilitator must run the session in a live browser per
`validation-pack/facilitator-session-sheet.md` (consent → pre form → 4-step lab task →
post form → export → clear), using the generative extension
`validation-pack/participant-test-extension.md` for the orbits task, then report back
with the exported JSON and any revision-log rows. Before running, the primary task text
discrepancy should be resolved (required text vs canonical "Show why planets stay in orbit.").

## 5. Claims that remain unavailable

- Participant pre/post measures
- Confidence change (pre → post)
- Mental effort (expected vs actual)
- Adaptation choice (accept / reject / modify)
- Direct participant quote
- Participant-caused revision

Impact points awarded: **NONE**
