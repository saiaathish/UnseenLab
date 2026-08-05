# Closure — 90-Readiness Participant Evidence (User Research Facilitator)

Status: **BLOCKED** — no human participant available in this automated environment.

Date: 2026-08-05
Branch: current working tree (`UnseenLab`), profile: user-research-facilitator

---

## 1. Blocked declaration

This environment is automated. The Phase-7 impact evidence session requires a
REAL human participant in a live browser session with a human facilitator
present (consent gate → pre form → lab task → post form → export). No human
participant is available to this agent.

Per the honesty rules in `validation-pack/facilitator-session-sheet.md`
("fill in nothing that did not happen", "Never fabricate results") and
`validation-pack/participant-test-extension.md` ("Do NOT fabricate: record
only what the participant actually did and said"), NO session was run:

- Session run: **NO**
- Export file (`unseenlab-research-<date>-<participant-tag>.json`): **NONE**
- Revision-log rows from a session: **NONE** (`validation-pack/revision-log.md`
  table is empty, as it must stay until a real session)
- Participant pre/post measures, quotes, adaptation decisions: **NONE**
- A 90-range claim based on participant evidence: **NOT AVAILABLE**

## 2. Protocol readiness checklist

### 2.1 Mandated verbatim task text — CONFIRMED PRESENT

`"Ask UnseenLab to help you understand why planets remain in orbit."`

- `validation-pack/participant-test-extension.md` line 8 — inside the Ask step,
  marked "mandated verbatim task — judge audit Gate 5/6".
- `validation-pack/facilitator-session-sheet.md` lines 14–15 — "Mandated task
  text, verbatim" with the same string.

(This resolves the failure recorded in the prior closure
`docs/closure-participant.md`, which found only "Show why planets stay in orbit."
The sheets have since been corrected.)

### 2.2 Required Phase-7 capture fields (verified against facilitator-session-sheet.md + participant-test-extension.md + the complementary paper sheets they delegate to: user-testing-session-sheet.md, user-testing-kit.md)

| Phase | Required field | Status | Where / note |
|---|---|---|---|
| Before | Concept explanation | Present | Pre-form concept question (free text); paper sheet Part B verbatim |
| Before | Prediction | Present | Step 1 "What do you expect?" + submit; extension step 2 |
| Before | Confidence 1–5 | Present | Pre-form item 2; paper sheet Part B |
| Before | Expected effort 1–5 | Present | Pre-form item 3 "Expected mental effort 1–5" |
| During | First action | Present | Paper sheet: "Time to first interaction" + C1–C4 + interaction events log (time/action) |
| During | First control changed | Present | Paper sheet C3 + events-log ordering (extension scripts "raise the speed slider") |
| During | Time to prediction | Partial | No defined field; only ad-hoc wall-clock pause timestamps in facilitator notes |
| During | Hesitation | Present | Facilitator notes "hesitation timestamps"; paper sheet pause/hover notes; C5 |
| During | Errors | Present (implicit) | Paper sheet C5 confusion points (time + surface); events log; facilitator "navigation confusion" |
| During | Help requests | Present | Facilitator notes "help requests"; paper sheet spoken-words log |
| During | Representation chosen | Present | Paper sheet C4 (tick, in order); debrief question "Which representation did they use most?" |
| During | Trust-badge interpretation | **MISSING** | Extension records only "trust badge seen"; no field for what the participant understood the badge to mean |
| During | Held-constant understanding | **MISSING** | Extension scripts the "Held constant" labels; no capture field for participant understanding of held-constant |
| During | Adaptation accepted/rejected/modified | Present | Paper sheet C7; app sheet decision instruction (accept / modify / reject) + screenshot checklist |
| After | Revised explanation | Present | Post form re-asks the same concept question; paper sheet Part D re-asks verbatim |
| After | Revised prediction | Partial | Second-loop "updated prediction" is a flow step; no explicit post-session field |
| After | Confidence | Present | Post form item 1; paper sheet Part D |
| After | Actual effort | Present | Post form item 2; paper sheet Part D |
| After | Clearer / confusing | Present | Post form items 3–4; paper sheet Part D Q1–Q2 |
| After | One thing to remove | Present | Post form item 5; paper sheet Part D Q3 |
| After | One thing to keep | Present | Post form item 6; paper sheet Part E "Feature to preserve" |
| After | Exact quote | Present | Paper sheet Part D "Direct quote (verbatim)"; revision-log verbatim-quote rule; facilitator notes verbatim |

Result: 18 present / 2 partial / 2 missing.
**Missing:** trust-badge interpretation, held-constant understanding.
**Partial:** time to prediction, revised prediction (as explicit capture fields).

### 2.3 Required files

| File | Status |
|---|---|
| `validation-pack/facilitator-session-sheet.md` | EXISTS (read; runbook ready, templates empty) |
| `validation-pack/participant-test-extension.md` | EXISTS (read; orbits script, verbatim task confirmed) |
| `validation-pack/revision-log.md` | EXISTS (header: "UnseenLab — Revision Log"; marked "NOT COMPLETE — requires a real participant session"; 0 rows) |
| `validation-pack/claim-register.md` | **DOES NOT EXIST at this path** (no git history either). Claim registers exist as `docs/claim-register.md` ("Final Claim Register (Devpost / scoring)") and `validation-pack/evidence-claims-register.md` ("Evidence and Claims Register", CLAIM-07/17/18/20 UNVERIFIED awaiting real user testing) |

### 2.4 Overall protocol status

**NO (partial)** — mandated task text present, session sheets complete and
honest, but 2 capture fields are missing and 2 are partial, and
`validation-pack/claim-register.md` is absent at the required path. All
templates remain empty; nothing may be filled until a real session runs.

## 3. Claims that remain unavailable (no participant evidence exists)

- Participant pre/post measures (concept explanation, prediction, confidence
  1–5, expected vs actual effort)
- Confidence change (pre → post)
- Effort expected vs actual
- First action / first control changed / time to prediction
- Hesitation, errors, help-request observations
- Representation chosen in-task
- Trust-badge interpretation
- Held-constant understanding
- Adaptation decision (accept / reject / modify) and why
- Direct participant quote (verbatim)
- Participant-caused revision (revision-log row — the judge's Gate 5/6 rule)
- Any "participant improved / learned / preferred X" sentence (standing rule in
  `docs/claim-register.md`; CLAIM-07, 17, 18, 20 in
  `validation-pack/evidence-claims-register.md` stay UNVERIFIED)

## 4. Required human action

A human facilitator must run the session with a REAL participant in a live
browser, exactly per the sheets:

1. `npm run dev`; verify http://localhost:3000 (research mode).
2. Consent gate first (read the consent copy verbatim; record the choice).
3. Pre form (concept explanation, prediction, confidence 1–5, expected effort
   1–5).
4. Mandated task, verbatim: "Ask UnseenLab to help you understand why planets
   remain in orbit." → expect "Verified simulation" badge, prediction BEFORE
   controls unlock.
5. Observe and record during: first action, first control changed, time to
   prediction, hesitation, errors, help requests, representation chosen,
   trust-badge interpretation, held-constant understanding, adaptation
   accepted/rejected/modified (use the paper grids for verbatim observation).
6. Post form (revised explanation, revised prediction, confidence, actual
   effort, clearer/confusing, one thing to remove, one thing to keep, exact
   quote).
7. Export the anonymized JSON to `validation-pack/`; spot-check; clear
   research data.
8. Fill ONE revision-log row from what the participant actually did or said
   (verbatim quote), then update the claim register statuses.

Impact points awarded: **NONE**
