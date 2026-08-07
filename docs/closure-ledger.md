# UnseenLab PR #9 — Closure Ledger (AGENT 01 · Program Supervisor)

Branch: `feature/generative-demonstration-engine` · HEAD: `34dce5b6` (matches PR #9 draft head)
Date: 2026-08-05 · Phase: 0-1 (inventory/reconciliation) · No production code touched.

## 1. Ownership matrix (agent 01 scope)

| File | Owner | Rule |
| --- | --- | --- |
| `docs/closure-ledger.md` (this file) | AGENT 01 | sole writable file |
| Everything else in repo | other agents / ED | read-only |

## 2. Evidence inventory (file → claims → status)

| File | Claims (1-line) | Status |
| --- | --- | --- |
| `docs/demo-benchmark.md` | 97-prompt offline scorecard (route/trust/schema 100%, hard gates 100%); Gate 2 live hosted run 29/29 useful on preview `unseen-3s35szhj4`; Gate 4 real persistence (guest save, account PUT/GET, idempotency, isolation) + Atlas egress blocker on preview | VERIFIED (unit-suite numbers corroborated by `tests/demonstrations/benchmark/`; live preview/back-end runs recorded but not re-runnable by me) |
| `docs/firebase-mongodb-setup.md` | External setup checklist (Firebase auth, Atlas, env names, indexes, smoke checks); 15/15 backend-integration vs live Firebase+Atlas; Gate-4 note: preview cloud persistence blocked by Atlas Network Access (needs `0.0.0.0/0`) | VERIFIED as documentation; the preview-persistence outcome itself UNVERIFIED (blocked) |
| `docs/demo-script-generative.md` | 3:00 script (2:45 spoken + 15 s), 7 mandated beats, honest pitch line; relies on Gate 1/2/4 results; Gate 5/6 rule: exactly one post-session revision | VERIFIED as script; video execution NEW |
| `docs/generation-pipeline.md` | 9-stage pipeline (normalize→interpret→route→model→gates→science policy→intent cross-check→repair retry→fallback); circuit breaker, dedup, rate limit, telemetry; offline path; persistence routes | VERIFIED (corroborated by redteam/generation suites and `pipeline.ts` refs) |
| `docs/scientific-trust.md` | 3 trust levels (verified/conceptual/explanatory), enforced boundaries (`sciencePolicy`, `specMatchesIntent`), no model-graded predictions, safe rejection of operational language | VERIFIED (corroborated by `science-safety.test.ts`, `store-honesty.test.ts`) |
| `docs/lumina-provenance.md` | Clean-room reimplementation; zero direct reuse; collaborator permission UNCLEAR; `dstl/` untracked, NOT gitignored (accidental-commit risk) | VERIFIED as record; `dstl/` risk item OPEN |
| `validation-pack/generative-demo-audit.md` | Hostile audit (AGENT 20): 2 P1 + P2/INFO findings, all fixed; 189/189 hostile tests; re-verified 2026-08-05 live model/Firebase/Mongo/localStorage; still UNVERIFIED: preview account persistence, WebGL rasterization, screen-reader, multi-instance rate limit, participant session + 3-min video | VERIFIED (fix commits in git log: 5ab2ad4, d8b2db0, 34dce5b) |
| `tests/demonstrations/**` (26 files) | validation.test.ts (schema/sanitize/science-policy); coupling/engine-visual-state.test.ts + renderer-coupling.test.ts (canonical-state proof); backend/ (route + repo, real validator, mocked auth/Mongo); engine/lumina-2d.test.ts (numerics/determinism/runner); generation/model/pipeline.test.ts (hosted path, fetch stubbed); a11y/demo-shell-a11y.test.tsx (keyboard/live-region/reduced-motion); benchmark/benchmark.test.ts (97-prompt gold scorecard) | VERIFIED present; suite counts (1096/1092) NOT re-run by me |

## 3. Outcome-vs-evidence gap matrix (12 mandatory outcomes)

| # | Outcome | Existing evidence | Gap |
| --- | --- | --- | --- |
| 1 | Atlas preview connectivity | Diagnosis + one-step fix documented (firebase-mongodb-setup.md §Gate-4) | NEW WORK: apply `0.0.0.0/0` allowlist, re-verify on preview |
| 2 | Preview persistence | Code paths verified live locally; preview blocked | NEW WORK: re-run persistence flows on preview after #1 |
| 3 | Frozen eval rules | None found (no "frozen/eval rules" artifact in docs/ or validation-pack/) | NEW WORK: freeze + record eval rules |
| 4 | Untouched holdout benchmark | No "holdout" artifact anywhere; benchmark suite is the dev gold table | NEW WORK: define holdout split + proof of non-touch |
| 5 | Sanitizer scientific-field boundary | scientific-trust.md + science-safety.test.ts (22 tests) | EXISTING (VERIFIED) |
| 6 | Canonical-state proof | coupling tests (engine-visual-state, renderer-coupling) | EXISTING (VERIFIED) |
| 7 | Participant session | Protocol ready (participant-test-extension.md) | NEW WORK: execute session |
| 8 | Participant-caused revision | revision-log.md is an EMPTY template; Gate 5/6 rule documented | NEW WORK: one revision after session, logged |
| 9 | 3-min video flow | Script ready (demo-script-generative.md) | NEW WORK: record + verify beats |
| 10 | PR hygiene | git status clean; branch + HEAD match PR head; PR is draft | PARTIAL: PR body/labels/commits not verified (GitHub) |
| 11 | Feature-flag/rollback | `src/demonstrations/feature-flag.ts` (`NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED`), ask-flow-flag-off.test.tsx, fallback honesty documented | EXISTING (VERIFIED at code level); rollback drill optional |
| 12 | Final verdict | None | NEW WORK: closure verdict at program end |

## 4. Final status block

- Agents requested: 15 · closure-* artifacts observed at inventory: none (this ledger is the first)
- Peak concurrency: UNKNOWN (reported by ED)
- Ownership conflicts: none observed
- Current phase: PHASE 0-1 complete (inventory reconciled; awaiting dispatch outputs)
- Committed work: clean tree, HEAD `34dce5b6` — no writes by this agent beyond this file
- UNKNOWN: peak concurrency; PR GitHub-side hygiene; live preview numbers (blocked); exact suite count (not re-run); `dstl/` collaborator permission
