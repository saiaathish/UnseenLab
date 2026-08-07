# UnseenLab ONE-SHOT 90-READINESS — Program Supervisor Ledger

Branch: `feature/generative-demonstration-engine` · HEAD: `fcb5ad35` · PR #9 (OPEN, DRAFT, head matches) · Date: 2026-08-05 · Program: one-shot 90-readiness. Read-only except this file. No git add/commit/push; no production code.

## 1. Git state (recorded)
- `git status --short`: CLEAN (no output)
- HEAD: `fcb5ad35395fcf8f64c0aff80cae84c16eb7e7ac`; branch `feature/generative-demonstration-engine`
- Last 5: fcb5ad3 (test/doc-truth corrections), f3d6298 (holdout results commit), 75cab04 (closure evidence + freeze manifest), 34dce5b (audit re-verify), 4d7cb0b (demo script + Gate 5/6 rule)
- PR #9 via gh: state OPEN, isDraft TRUE, headRefOid fcb5ad3 (== HEAD), base main. PR body/labels NOT verified (UNKNOWN).

## 2. Ownership matrix
| File | Owner | Rule |
|---|---|---|
| `docs/closure-90-ledger.md` (this file) | Program Supervisor (me) | sole writable file |
| Everything else | other profiles / ED | read-only |

## 3. Carried-forward evidence (prior program, closure-ledger.md @ 34dce5b + closure-* docs)
- Persistence (AGENT 08): LOCAL_VERIFIED on real Firebase+Atlas (guest save/reload, account PUT rev 1, idempotent replay, rev N→N+1, user-B isolation, deletion, zero console errors). Preview PREVIEW_BLOCKED_EXTERNAL (SSO protection + Atlas access list + `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` empty in preview env). SECURITY: `MONGODB_URI` user `saiaathish_db_user` has LIVE ROLE atlasAdmin — must be downgraded to readWrite(unseenlab) BEFORE any `0.0.0.0/0` allowlist.
- Atlas (closure-atlas.md): ATLAS_ACCESS_BLOCKED from this machine (no API keys/CLI); 2-min human console steps documented (§6); order matters: downgrade role first.
- Canonical state (AGENT 07, docs/canonical-state-proof.md): PROVEN — one lifted state copy, 17 controls, coupling.ts single bridge; 2 control-semantics defects + 3 decorative issues recorded, none duplicate scientific state.
- A11y (AGENT 09): real Chromium Playwright — desktop/mobile 1280/375/320, reduced motion, forced colors, 150% text, 200% zoom, keyboard (16+21 stops) all PASS; screen reader NOT RUN (VoiceOver unavailable; DOM equivalents 8/8 PASS); a11y suite 9/9.
- Participant (AGENT 10): BLOCKED — no human available; session NOT run; export NONE; capture-sheet gaps (7 present/4 partial/5 missing); task-text discrepancy (required "Ask UnseenLab to help you understand why planets remain in orbit." absent; canonical "Show why planets stay in orbit." used).
- Video (AGENT 12): script corrected to mandated 11-beat, 180 s; pitch verbatim present post-correction; fallback lines present; recording NOT POSSIBLE; final video NOT_COMPLETE.
- Hostile audit (AGENT 20, validation-pack/generative-demo-audit.md): 2 P1+P2/INFO fixed; 189/189 hostile tests; remaining UNVERIFIED: preview persistence, WebGL rasterization, screen-reader, multi-instance rate limit, participant session + video.
- Holdout 2026-08-05: frozen manifest SHA `06413fa2…29c24`, 29 prompts, single run @ freeze 75cab04f (local-prod, base localhost:3200). Results: USEFUL 100% (22/22) PASS · TRUST 86.4% (19/22) **FAIL <90%** · UNSAFE 100% PASS · ESCALATION 0 PASS · RENDERABLE 100% PASS. GATE FAIL. No labels changed, no model patch (per Phase-2 rule). Diagnosis: 3 template golds labeled conceptual_demonstration contradict the frozen prompt's process→Level-3 rule.

## 4. ADD items the 90-program must create (all ABSENT at inventory)
1. `docs/trust-policy.md` — MISSING (nothing found in docs/ or validation-pack/)
2. `docs/canonical-state-proof-final.md` — MISSING (only canonical-state-proof.md, PROVEN but with 2+3 recorded defects)
3. `holdout-2026-08-06-v2` files (manifest/runner/results) — MISSING; recommended follow-up holdout with template golds labeled per prompt's Level-3 rule (never post-hoc label edits)
4. `docs/closure-90-*` set — NOW OBSERVED: `closure-90-ledger.md` (this file) + `closure-90-revision.md` (revision engineer, BLOCKED — no session, zero product changes, 4/6 trace fields explicit in revision-log.md template). Note: `docs/closure-90-participant.md` referenced by revision engineer does NOT exist; canonical path is `docs/closure-participant.md`.

## 5. Gap matrix vs the 7 program requirements
| # | Requirement | Current status | Evidence |
|---|---|---|---|
| 1 | Secure deployed persistence | PARTIAL — local proven (real Firebase+Atlas, isolation, idempotency, deletion); deployed preview UNVERIFIABLE (SSO + Atlas ACL); live app user is atlasAdmin (security blocker) | closure-persistence.md, closure-atlas.md |
| 2 | Valid blind holdout | PROCEDURE VALID + single run done, but GATE **FAIL** (trust 86.4% < 90%); follow-up v2 holdout required | holdout-2026-08-05.md, holdout-results-2026-08-05.json |
| 3 | Real participant evidence | NOT DONE — no human participant; session not run; sheet gaps; task-text mismatch | closure-participant.md |
| 4 | Exactly one participant revision | NOT DONE — rule documented (Gate 5/6, one post-session revision); revision-log.md empty template; zero rows; revision engineer BLOCKED (no observation → no change, correctly) | demo-script-generative.md, validation-pack/revision-log.md, closure-90-revision.md |
| 5 | Real accessibility evidence | PARTIAL — real-browser PASS across 8 environments + 9/9 suite; real screen reader NOT RUN | closure-a11y.md |
| 6 | Complete 3-min video | NOT DONE — script readiness complete (11 beats, 180 s); recording impossible here; no final video | closure-video.md, demo-script-generative.md |
| 7 | Accurate PR claims | PARTIAL — PR draft/OPEN, head==local HEAD; PR body/labels/claims unverified; claim registers exist but no final reconciliation | gh pr view, claim-register.md |

## 6. Phase ledger (1-12) — owner profile, status
| Ph | Phase | Owner profile | Status |
|---|---|---|---|
| 1 | Program kickoff / profile dispatch (15) | ED | Dispatches asserted by ED; individual dispatch log not observed → UNKNOWN |
| 2 | Code freeze + holdout definition | ED + holdout author | DONE (freeze 75cab04; manifest+runner+hash baked) |
| 3 | Inventory & reconciliation | Program Supervisor (me) | DONE (this ledger; prior ledger Phase 0-1) |
| 4 | Persistence verification | AGENT 08 | LOCAL_VERIFIED; preview blocked |
| 5 | Atlas connectivity + role security | AGENT 08 / Atlas owner | BLOCKED (no admin creds; atlasAdmin finding OPEN) |
| 6 | Canonical-state proof | AGENT 07 | PROVEN w/ recorded defects (needs final doc) |
| 7 | Accessibility evidence | AGENT 09 | Real-browser PASS; VoiceOver NOT RUN |
| 8 | Participant session | AGENT 10 + human facilitator | BLOCKED (no human) |
| 9 | Single participant revision | revision engineer + AGENT 10 + ED | NOT DONE (rule only; engineer BLOCKED, zero changes — compliant) |
| 10 | 3-min video | AGENT 12 | Script ready; recording NOT COMPLETE |
| 11 | Holdout single run + scoring | ED | RUN EXECUTED → GATE FAIL (trust 86.4%); scoring immutable |
| 12 | PR claims reconciliation + final verdict | Program Supervisor + ED | PARTIAL (draft PR; body/labels UNVERIFIED; verdict pending) |

## 7. UNKNOWN
- Peak concurrency (ED reports)
- Dispatched profile list beyond observed 8 (AGENT 01/07/08/09/10/12/20 + ED)
- PR #9 body, labels, checklist state
- Preview persistence outcome (SSO/ACL blocked); `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` preview value
- Real screen-reader pass; final video file; participant data
- Exact live suite count (not re-run here)
- `dstl/` collaborator permission (carried from prior program)

## 8. Final status block
- Profiles requested: 15 | dispatched observed in evidence: 8 (7 AGENTs + ED); remainder UNKNOWN
- Ownership conflicts: none observed (distinct per-file owners; AGENT 08 used /tmp copy due to port 3110 lock — coordination note)
- Highest-risk: requirement 2 gate FAIL + requirements 3/4/6 human-blocked (participant, revision, video) + requirement 1 preview unverifiable with live atlasAdmin exposure
- Next action: ED to resolve human-blocked items and initiate v2 holdout; no code changes before freeze review
