# Closure — Evidence-Driven Revision (revision engineer)

Status: **BLOCKED** — no participant session was run, so no observation exists to
drive a revision.

Date: 2026-08-05
Branch: `feature/generative-demonstration-engine` (PR #9)

Referenced blocked declaration: `docs/closure-participant.md` (Status: BLOCKED —
"no human participant available in this environment"). Note: the path
`docs/closure-90-participant.md` does not exist in this repo; the actual file is
`docs/closure-participant.md`.

---

## 1. Trigger check (gate before any revision)

Rule: begin only after the user-research-facilitator provides a real participant
observation from a session run per
`validation-pack/facilitator-session-sheet.md` + the generative extension
`validation-pack/participant-test-extension.md`.

- Participant session run: **NO**
- Export file (`unseenlab-research-<date>-<participant-tag>.json`): **NONE**
- Observation provided to this role: **NONE**
- Revision-log rows: **NONE** (template remains unfilled)

## 2. Template readiness check

`validation-pack/revision-log.md` is an unfilled template with columns:
Observation | Evidence | Product change | Reason | Before | After | Verification.

Mapping to the required trace fields (observation → evidence → root cause →
focused change → regression test → retest):

| Required trace field | Template representation | Status |
|---|---|---|
| observation | "Observation" column (verbatim where possible) | Explicit |
| evidence | "Evidence" column (session id, event types, timestamps) | Explicit |
| root cause | "Reason" column ("why this observation led to this change") | Implicit — not labeled "root cause" |
| focused change | "Product change" column ("smallest honest change") | Explicit |
| regression test | "Verification" column ("follow-up session, replay of evidence, reviewer") | Implicit — regression test not named |
| retest | "Before"/"After" columns (pre/post product state) + "Verification" | Explicit |

Result: template is ready and unfilled; 4 of 6 trace fields are explicit, 2
(root cause, regression test) are represented implicitly within "Reason" and
"Verification". The session→revision rule in
`validation-pack/participant-test-extension.md` is honored: record the
observation first, then implement EXACTLY ONE revision; no pre-emptive changes.

## 3. BLOCKED declaration

No human participant is available in this environment, so the facilitator has not
run a session. Per the honesty rules ("fill in nothing that did not happen"; "Do
NOT fabricate"), no observation exists, therefore:

- Observation: NONE (no session)
- Evidence: PARTICIPANT_BLOCKED (`docs/closure-participant.md`)
- Change: NONE — zero product-code revisions
- Files changed: NONE | Tests added: NONE | Retest: N/A
- Fabricated participant work: NO

The single participant-driven revision will be implemented only after a real
session produces an observation, in this order: observation → evidence → root
cause → focused change → regression test → retest, recorded first in
`validation-pack/revision-log.md`.

## 4. Required human action

A human facilitator must run the session in a live browser per
`validation-pack/facilitator-session-sheet.md` with the generative extension
`validation-pack/participant-test-extension.md`, resolve the primary-task-text
discrepancy noted in `docs/closure-participant.md` (required text
"Ask UnseenLab to help you understand why planets remain in orbit." vs canonical
"Show why planets stay in orbit."), and hand the exported JSON plus the recorded
observation to this role.
