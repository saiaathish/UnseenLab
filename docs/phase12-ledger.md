# UnseenLab PHASE 1–2 CLOSURE — Program Supervisor Ledger

Branch: `fix/generative-trust-controls` (stacked on PR #9's head `feature/generative-demonstration-engine` @ 0d88957) · HEAD: `0d889572f0c8d5c47545f6e6b041df3ec52460f7` · Date: 2026-08-05 · Program: PHASE 1–2 CLOSURE (Atlas role/network/SSO/persistence + trust decision table/control catalog/TDD/holdout v3). Read-only except this file. No `git add/commit/push`; no production code.

## 1. Git baseline (verified)

- `git status --short`: CLEAN (no output)
- `git rev-parse HEAD`: `0d889572f0c8d5c47545f6e6b041df3ec52460f7`
- Branch: `fix/generative-trust-controls` (worktree only; main repo at same SHA on `feature/generative-demonstration-engine`)
- Stack base via `gh`: PR #9 — OPEN, DRAFT, head `feature/generative-demonstration-engine` @ 0d88957, base `main`, not merged. This branch is created at PR #9's head; the stacked PR (closure item) will target PR #9's branch, not `main`.

## 2. Ownership gate (published before any editing)

Writer = exactly one active writer per path. Reviewers = mandatory review before the writer's work is accepted. Forbidden editors = read-only (may review, may not edit).

| Path/module | Status @ baseline | Writer | Reviewers | Forbidden editors |
| --- | --- | --- | --- | --- |
| `src/demonstrations/generation/controls/*` (new module — Phase 2B) | ABSENT (dir does not exist) | GEN (generation engineer) | RT (red team), POL (trust-policy author) | ED (evaluation director), VAL, INT, TDD — read-only |
| `src/demonstrations/generation/model/prompt.ts` | EXISTS | GEN | RT (mandatory — frozen prompt rule is the anchor for v2 golds and v3 golds), POL | ED (never relabel golds to match the prompt), VAL, INT, TDD |
| `src/demonstrations/generation/model/pipeline.ts` | EXISTS | GEN | RT, INT (integration engineer) | ED, VAL, TDD |
| `src/demonstrations/validation/demo-spec-schema.ts` | EXISTS | VAL (validation engineer) | GEN, RT | ED, INT, TDD |
| `src/demonstrations/validation/sanitize.ts` | EXISTS | VAL | RT, ED (sanitizer REPAIRED split is scored in holdouts) | GEN, INT, TDD |
| `tests/demonstrations/trust/*` (new suite — Phase 2C) | ABSENT | TDD (trust-controls test engineer) | RT, POL | GEN (no tuning tests to model output), ED, VAL, INT |
| `tests/demonstrations/validation.test.ts` | EXISTS | VAL | RT | ED, GEN, INT, TDD |
| `tests/demonstrations/coupling/*` (4 files: engine-visual-state, persistence-roundtrip, renderer-coupling, replay-restore) | EXISTS | INT | RT, GEN | ED, VAL, TDD |
| `docs/trust-decision-table.md` (new — Phase 2A) | ABSENT | POL | RT (approval), XD (Executive Director, approval) | ED (must author holdout v3 AGAINST it; never edit it), GEN, VAL, INT, TDD |
| `scripts/holdout-v3-*` (new manifest/runner — Phase 2D) | ABSENT | ED | XD (freeze authority), RT | EVERYONE after freeze (hash gate + frozen scoring; same rule as v1/v2) |
| `docs/phase12-ledger.md` (this file) | ABSENT (created by this session) | PS (Program Supervisor — me) | XD | ALL other roles — sole writable file |

## 3. Old holdouts preserved — YES (diff evidence)

- `git diff 0d88957 -- docs/holdout-2026-08-06-v2.md scripts/holdout-manifest-2026-08-06.mjs` → **empty output, exit 0** (byte-identical to the freeze commit).
- `git status --short` for those two paths → **no output** (clean). Full-tree clean covers every other holdout artifact too (v1 manifest/runner, both results JSONs).
- Manifest integrity recomputed live: `SHA-256(JSON.stringify(HOLDOUT))` = `065be4c8f13b361f8e16af3f6bb315ffb72274f78fdcbcf96d34c8db1d1daf75` — **matches** the frozen value recorded in `docs/holdout-2026-08-06-v2.md` (065be4c8…daf75). Prompt count 41 matches.
- V2 result stands as recorded: useful 86.2% PASS, trust 86.2% FAIL (<90%), control relevance 50% FAIL (<85%), unsafe 100%, escalation 0, renderable 100%, accessible 100%. GATE FAIL. These two failures are the mandate for Phase 2; no golds or scoring were touched.

## 4. Phase ledger

| Phase | Item | Owner | Depends on | Status | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| 1A | Atlas role: downgrade live `saiaathish_db_user` from `atlasAdmin` → `readWrite(unseenlab)` | XD (human console step) | — | NOT STARTED (machine access blocked per `docs/closure-atlas.md` ATLAS_ACCESS_BLOCKED; ordering rule: role FIRST) | Live role = `readWrite` on `unseenlab` only; no `atlasAdmin` anywhere; security contract test green; recorded in `docs/closure-atlas.md` |
| 1B | Network: Atlas access list for preview (`0.0.0.0/0` vs scoped) | XD (human console step) | 1A (downgrade before allowlist) | NOT STARTED | Access list applied + documented; preview Mongo reachability verified; drift stays CLOSED |
| 1C | SSO: preview requires Firebase Auth; generative demos env stays empty in preview | XD (env config) | — | NOT STARTED (local guest mode already works) | Preview blocks unauthenticated access; guest mode local-only; documented in `docs/security.md` |
| 1D | Deployed persistence: E2E verify save/reload/restore/isolation against deployed backend | INT | 1A, 1B, 1C (preview unblocked) | PARTIAL (LOCAL_VERIFIED on real Firebase+Atlas per `docs/closure-persistence.md`; PREVIEW_BLOCKED_EXTERNAL remains) | Preview E2E pass (guest save, account rev 1, idempotent replay, rev N→N+1, user-B isolation, deletion) recorded in `docs/closure-persistence.md` |
| 2A | Trust decision table: `docs/trust-decision-table.md` resolving the §4.2 L2/L3 contradiction (predator-prey = cycle, cause-effect = sequence → L3 per §4.3; comparisons → L2) | POL | RT consultation | NOT STARTED | Table covers policy §3 rows + §4 decision rules; RT-approved; prospective only (no relabeling of v1/v2 golds) |
| 2B | Control catalog: `src/demonstrations/generation/controls/*` (orbits: speed/bodyMass · charges: q1/q2/separation · waves: frequency/separation/phase · gas: temperature/particles) raising v2 control-relevance 50% | GEN | 2A | NOT STARTED | Catalog consumed by `offline/engine-builder.ts` (CONTROL_PARAMETER_KEYS) + pipeline; unit tests; v3 control relevance ≥ 85% |
| 2C | TDD: `tests/demonstrations/trust/*` — red before 2B, green after (trust classification, control provisioning, escalation guard) | TDD | 2A | NOT STARTED | Suite red/green proof recorded; RT review; no test tuned to model output |
| 2D | Holdout v3: `scripts/holdout-v3-*` — re-author the four §4.2 L2 golds per 2A outcome (L3 or carve-out); v1/v2 untouched | ED | 2A, 2B, 2C | NOT STARTED | Frozen manifest + baked SHA before run; single run post-freeze; immutable results JSON |
| CL-1 | Red team: independent review of 2A/2B/2C + freeze + adversarial v3 prompts | RT | 2A–2D | NOT STARTED | Written approval recorded; v3 prompts pass non-overlap vs 166-prompt corpus (41 v2 + 41 Gate-2 + 29 v1 + 87 offline + README/demo examples) |
| CL-2 | Integration: coupling suite green, pipeline + controls + sanitizer integration, full suite (validation.test.ts, trust/*, redteam/*) | INT | 2B, 2C | NOT STARTED | All suites green on this branch; results recorded |
| CL-3 | Stacked PR: open PR from `fix/generative-trust-controls` onto PR #9's branch | PS | CL-1, CL-2, 1A–1D as applicable | NOT STARTED (branch exists @ 0d88957, zero commits) | PR opened targeting `feature/generative-demonstration-engine`; no commits to PR #9's branch; no push from this program |

## 5. UNKNOWN (not verifiable from this worktree)

1. Identity/assignment of writers and reviewers (GEN, VAL, INT, TDD, POL, ED, XD, RT) — roles named, agents not yet dispatched by this supervisor.
2. Live state of Phase 1 items: current Atlas role of `saiaathish_db_user`, current access list, preview SSO env — NOT re-verified (this machine cannot reach the Atlas console; only doc existence was verified, not live state).
3. Whether the four §4.2 L2 golds will be re-authored to L3 or a prompt-rule carve-out added — decision deferred to 2A (POL + RT).
4. PR #9 merge timing and whether `main` moves before the stacked PR lands (PR #9 body/labels not read).
5. Holdout v3 run date/operator and whether the infrastructure-outage single-rerun rule carries over from v2.
6. Exact scope of preview persistence steps once 1A–1C unblock the preview.

## 6. Program rules (carried forward from v2 freeze)

- Frozen holdout rules are immutable once a manifest hash is baked; the runner refuses to start on hash mismatch.
- Post-run scoring edits are NOT permitted; only the runner's frozen constants count.
- No gold relabeling, no test tuning to model output, no production edits by this profile.

---

# Round 2 — judge-upgrade (Phase 1–2 closure continuation)

## R2-0. Round 2 baseline (verified 2026-08-05)

- `git status --short`: CLEAN (no output)
- `git rev-parse HEAD`: `c3870eff33446a33b1e18daaaadd3413b955a8e5`
- Branch: `fix/generative-trust-controls`
- PR #10 via `gh`: OPEN, DRAFT, `mergeable`=MERGEABLE, `headRefOid`=`c3870eff33446a33b1e18daaaadd3413b955a8e5` (matches local HEAD), base `feature/generative-demonstration-engine` (stacked on PR #9's branch), 7 commits. Title: "fix: deterministic trust decision table + engine-owned control catalog (Phase 1-2 closure)".
- PR #9: OPEN, DRAFT, MERGEABLE, `headRefOid`=`0d889572f0c8d5c47545f6e6b041df3ec52460f7` — untouched; no commits, no push from this program.
- Judge audit outcome: KEEP_DRAFT + five ordered directives (R2-1).

## R2-1. Judge directives (verbatim order)

1. Wire the trust decision table into the RUNTIME router as ONE trust function.
2. Deterministic focus-key ranking: explicit learner variable → catalog relationship match → model keys → curated default.
3. Split renderability metrics in the next holdout: valid-spec rate / renderable-after-validation / provider-network availability (network reported separately, not blended into validity).
4. ONE final untouched holdout (v4) after wiring.
5. STOP engineering after v4 (participant/video/console are human).

## R2-2. Ownership gate (Round 2, published before any editing)

Writer = exactly one active writer per path. Reviewers = mandatory review before the writer's work is accepted. Forbidden editors = read-only (may review, may not edit).

| Path | Status @ R2 baseline | Writer | Reviewers | Forbidden editors |
| --- | --- | --- | --- | --- |
| `src/demonstrations/generation/intent/route.ts` | EXISTS | canonical-state-architect | evaluation-director (trust function + focus-key ranking are scored in v4), RT (red-team, carryover) | ALL other roles |
| `src/demonstrations/generation/model/pipeline.ts` | EXISTS | canonical-state-architect | evaluation-director, INT (integration engineer, carryover) | ALL other roles |
| `src/demonstrations/generation/controls/materialize.ts` | EXISTS | canonical-state-architect | evaluation-director (renderability split is scored in v4), POL (trust-policy author, carryover) | ALL other roles |
| `src/demonstrations/generation/controls/relationships.ts` | ABSENT (new — catalog relationship match, focus-key ranking stage 2) | evaluation-director | canonical-state-architect (consumed by route.ts ranking) | ALL other roles |
| `src/demonstrations/generation/trust/decision-table.ts` | EXISTS | evaluation-director | canonical-state-architect (single trust function consumed in route.ts), RT (carryover) | ALL other roles |
| `scripts/holdout-v4-*` | ABSENT (new) | evaluation-director | judge (freeze authority — bake SHA before run, same rule as v1/v2/v3) | EVERYONE after freeze (hash gate; immutable results) |
| `docs/trust-wiring.md` | ABSENT (new) | canonical-state-architect | evaluation-director, judge (approval) | ALL other roles |
| `docs/phase12-*.md` (excl. ledger) | EXISTS | evaluation-director | canonical-state-architect, judge | ALL other roles |
| `docs/phase12-ledger.md` (this file) | EXISTS | PS (Program Supervisor — me) | judge | ALL other roles — sole writable file for this profile |

## R2-3. Acceptance bar (judge, recorded)

- Trust ≥ 90% (v4 holdout, frozen)
- Control relevance ≥ 85%
- Schema/render validity ≥ 98% — SPLIT: valid-spec rate / renderable-after-validation; provider-network availability reported separately (NOT counted into validity)
- Unsafe = 100% (no unsafe completions)
- Escalation = 0 (clarify responses)
- Old holdouts v1/v2/v3 preserved — verified at baseline: all v1/v2/v3 artifacts present (docs/holdout-2026-08-05.md, -v2, -v3; both manifest/runner pairs; three results JSONs); `git status --short` clean; no commit between 0d88957 and c3870ef modified `docs/holdout-2026-08-06-v2.md` or `scripts/holdout-manifest-2026-08-06.mjs` (Round-1 freeze diff was already byte-identical at 0d88957)
- After v4: STOP engineering (participant/video/console are human)

Context: v3 scored trust 92.9% PASS, control relevance 87.5% PASS, renderable 96.4% FAIL (1 transient `network_error`) — directive 3 is the direct response to that failure mode; provider-network availability must no longer be blended with spec/render validity.

## R2-4. UNKNOWN (Round 2, not verifiable from this worktree)

1. Identity/dispatch of the named writers (canonical-state-architect, evaluation-director) — roles named, agents not yet dispatched by this supervisor.
2. Carryover reviewers (RT, POL, INT) availability for Round 2 — not re-confirmed.
3. Whether holdout v4 reuses the v3 frozen prompt set (41 prompts, SHA-256 f4b9056a baked in 311d1b2) or is a new manifest — judge specified "ONE final untouched holdout (v4) after wiring"; prompt set and bake timing not yet specified.
4. Exact boundary of "ONE trust function" in route.ts (single exported predicate vs single call site) — deferred to canonical-state-architect.
5. Measurement point for provider-network availability (provider status API vs runtime fetch) — deferred to evaluation-director.
6. Whether `main`/PR #9 moves before the v4 run (PR #9 body/labels not read).
7. Live Phase 1 state carried forward from Round 1 (Atlas role/access list/preview SSO) — not re-verified; this machine cannot reach the Atlas console.

## R2-5. Program rules (unchanged from Round 1, section 6)

- Frozen holdout rules are immutable once a manifest hash is baked; the runner refuses to start on hash mismatch.
- Post-run scoring edits are NOT permitted; only the runner's frozen constants count.
- No gold relabeling, no test tuning to model output, no production edits by this profile.
- No `git add/commit/push`; this ledger is the sole writable file for this profile.

## R2-6. Ownership conflict observed at closeout (disclosed, not adjudicated here)

- Baseline tree was CLEAN at R2-0. At closeout, `git status --short` shows ` M docs/phase12-ledger.md` (mine) and ` M docs/phase12-release.md` (NOT mine).
- `docs/phase12-release.md` was modified at 23:29:58 (49 s BEFORE my ledger append at 23:30:47) by a parallel writer — a "Round 2" release-status section (PR #10 26 files / +7992, CI green on head c3870eff, origin/main 75fbd73b, local main 103d5fab divergence noted, KEEP_DRAFT verdict). Content is consistent with my verified baseline; no fabrication detected.
- Under R2-2, `docs/phase12-release.md` belongs to evaluation-director (writer) with canonical-state-architect + judge as reviewers. The parallel write predates my gate publication, so the gate was not violated as published — but the write is unowned per Round 2 rules. PS did NOT revert or edit it (outside my writable set); it stands pending evaluation-director adoption/review.
- Follow-up: evaluation-director must either adopt `docs/phase12-release.md` (Round 2 section) as its deliverable or the parallel writer must be identified; judge review required before acceptance.
