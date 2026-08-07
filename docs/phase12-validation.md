# Phase 12 — Validation Layer for Engine-Owned Controls (Phase 2C)

Date: 2026-08-05. Agent: validation-boundary-engineer (UNSEENLAB PHASE 1-2
CLOSURE, Phase 2C). Worktree:
`/Users/saiaathishkarthik/Desktop/UnseenLab-worktrees/generative-trust-controls`
(branch `fix/generative-trust-controls`). No git add/commit/push performed.

Scope: the Phase 2B architecture change (evaluation-director) lets the hosted
model emit ONLY `focusParameterKeys: string[]` for verified engines;
deterministic code (canonical-state-architect) materializes the full controls
from the EngineControlCatalog. This report covers making the VALIDATION layer
accept and enforce the bounded field, in strict TDD order (failing tests
first, all 16 new tests observed failing on `unknown_key:focusparameterkeys`
before implementation).

---

## VALIDATION STATUS

- **Schema: focusParameterKeys accepted (1-4 keys, array of strings, optional,
  inside the simulation object only)**. Added to
  `src/demonstrations/validation/demo-spec-schema.ts` `simulationSchema`:
  `z.array(z.string().min(1).max(MAX_ID_CHARS)).min(1).max(4).optional()`.
  The element-length bound (64, the contract's identifier cap) is a deliberate
  strengthening of the plain `z.string()` sketch: it mirrors `idString`
  everywhere else and keeps first-pass and full-validation rules compatible.
  The field is `.strict()`-scoped to the simulation object — anywhere else in
  the document it is an unknown key (`unknown_key:focusparameterkeys`), so a
  spec without a simulation block can never carry it.

- **Engine-owned enforcement: catalog membership in the schema itself**.
  `simulationSchema.superRefine` checks every entry against
  `ENGINE_CATALOG[engineId].parameterKeys` and emits the stable reason code
  `invalid_engine_key` for any non-member. `engineId` is a verified-enum, so
  the catalog lookup can never be undefined. This mirrors the two existing
  parameter-key validations: the root `superRefine` builds a `parameterKeys`
  set from `simulation.parameters` for control-target resolution
  (`invalid_control_target`), and `science-policy.ts` checks parameter/readout
  keys against `ENGINE_CATALOG[engineId].parameterKeys` / `.readoutKeys`
  (`incompatible_engine`). Putting the membership check in the schema (not
  science policy) means `demoSpecSchema` direct consumers get it too; the
  science-policy module is unchanged.

- **Tests: 108 total in `tests/demonstrations/validation.test.ts`
  (92 pre-existing + 16 new in `describe("focusParameterKeys boundary")`)**.
  Vitest tail:

  ```
   Test Files  1 passed (1)
        Tests  108 passed (108)
     Start at  20:47:09
     Duration  11.04s (transform 1.07s, setup 2.50s, import 1.37s, tests 360ms, environment 5.74s)
  ```

  New coverage: valid engine-owned keys accepted (two engines: pendulum +
  nuclear_chain_reaction); full 4-key catalog accepted; non-engine key,
  cross-engine key, and catalog-absent key rejected (`invalid_engine_key`);
  >4 keys rejected (bounded, `count_exceeded`); non-array and empty array
  rejected; non-string entry rejected; oversized element rejected; Level 2 and
  Level 3 specs rejected (verified-only field, via the existing
  `science_policy:level2_simulation` / `level3_simulation` — the field lives
  inside simulation, so it cannot appear on a Level 2/3 spec without dragging
  the forbidden simulation block along); no-simulation placement rejected as
  `unknown_key:focusparameterkeys`; NO repair path (foreign key rejects with
  zero `repaired:` reasons and `spec` undefined); verbatim pass-through of
  engine-owned keys through an unrelated numeric repair; backward
  compatibility (explicit-controls specs without the field validate
  unchanged); direct `demoSpecSchema.parse` boundary; and first-pass gate
  admission end-to-end.

- **Sanitizer: unchanged, unknown -> REJECT preserved**. `sanitize.ts` repair
  walk (`repairTree` + named clamps + `raiseDeclaredLimits`) has no
  `focusParameterKeys` class and was not modified (verified via `git diff`:
  empty). A foreign `focusParameterKeys` entry is therefore never repaired:
  it falls through unmutated to the strict schema and rejects with
  `invalid_engine_key`. The regression test "never repairs a foreign
  focusParameterKeys entry (no repair path)" pins this — unknown repair class
  -> REJECT remains. No repair-class decision was needed or made.

- **First-pass gate: updated (admission only, documented)**.
  `src/demonstrations/generation/model/schema.ts` `simulationSchema` now
  declares the field with the same shape and bounds as the full validator
  (`z.array(z.string().min(1).max(MAX_ID_CHARS)).min(1).max(4).optional()`),
  so the model's raw output reaches the sanitizer instead of being rejected at
  `unknown_key:focusparameterkeys`. Catalog membership stays in the full
  validator — the gate deliberately does not repeat cross-field invariants
  (its own header documents this for control-target resolution and
  trust/simulation consistency). The change is additive and optional; no
  existing gate behavior changed.

- **BLOCKER RESOLVED: the model cannot invent controls — bounded
  engine-owned field only**. The model's only control authority is a 1-4
  entry selection of parameter keys the VERIFIED engine itself owns
  (`ENGINE_CATALOG[engineId].parameterKeys`). Full `ControlSpec[]` objects
  (types, targets, ranges, labels) are never model-authored in this path; they
  are materialized deterministically from the EngineControlCatalog by the
  canonical-state-architect. The strict schema additionally keeps the
  existing `controlSchema` path intact for curated showcases (backward
  compatible), and the existing cross-field invariants (`invalid_control_target`,
  `count_exceeded:controls`, science-policy parameter-control bans) are
  unchanged.

---

## Amendments (files touched, all minimal and additive)

| File | Change | Why |
| --- | --- | --- |
| `src/demonstrations/spec/demo-spec.ts` | `focusParameterKeys?: string[]` added to `VerifiedSimulationSpec` (documented) | The schema is the strict Zod mirror of the contract; the validated spec must carry the field so the controls materializer can consume it. Purely additive/optional; no existing shape changed. Not on the Phase 2C do-not-touch list. |
| `src/demonstrations/validation/demo-spec-schema.ts` | Bounded field + `invalid_engine_key` catalog-membership `superRefine` on `simulationSchema`; `ENGINE_CATALOG` import | Task 2. |
| `src/demonstrations/generation/model/schema.ts` | First-pass gate admits the field (same bounds; no membership check) | Task 3 — the pipeline depends on the gate; without this the model's raw output is rejected before the full validator runs. Admission only, documented in code. |
| `tests/demonstrations/validation.test.ts` | 16 new tests appended | Task 1, TDD first (all failed on `unknown_key:focusparameterkeys`). |
| `docs/phase12-validation.md` | This file | New. |

Untouched (verified via `git diff --stat`): `prompt.ts`, `pipeline.ts`,
`controls/*` (none exist yet in this worktree), `coupling/*`,
`sanitize.ts`, holdout files, and every other file in the repo.

## Boundary matrix (new field)

| Input | Result | Reason code(s) |
| --- | --- | --- |
| `simulation.focusParameterKeys: ["length"]` (pendulum) | valid | — |
| 4 engine-owned keys | valid | — |
| Foreign key (e.g. `temperature`), cross-engine key (`frequency`), catalog-absent key | rejected | `invalid_engine_key` |
| 5 keys | rejected | `count_exceeded:focusParameterKeys` (plus `invalid_engine_key`) |
| Non-array / empty array / non-string entry | rejected | `invalid_type` / `count_required:focusParameterKeys` / `invalid_type` |
| Oversized entry (>64 chars) | rejected, never repaired | element bound |
| On a Level 2 / Level 3 spec | rejected | `science_policy:level2_simulation` / `level3_simulation` |
| Outside the simulation object (no simulation block) | rejected | `unknown_key:focusparameterkeys` |
| Foreign key with repairable numeric issues elsewhere | rejected (no repair of the field) | `invalid_engine_key`, no `repaired:*` |

## UNKNOWN

- **EngineControlCatalog shape and consumption**: the catalog and the
  canonical-state-architect materializer are not in this worktree (owned by
  the Phase 2B evaluation-director/canonical-state-architect workstream). The
  validator enforces membership against `ENGINE_CATALOG[engineId].parameterKeys`
  (the existing contract catalog) — if the EngineControlCatalog's key set
  diverges from `ENGINE_CATALOG.parameterKeys`, the validator and materializer
  could disagree on what is "engine-owned". Flag for the materializer owner.
- **focusParameterKeys vs declared `simulation.parameters`**: the validator
  does NOT require `focusParameterKeys` to be a subset of the spec's own
  `parameters` array (the materializer may source parameter blocks from the
  catalog). Whether that subset invariant is needed is the materializer's
  call — not in the Phase 2C task list, so not invented here.
- **Post-materialization spec**: whether the final materialized spec retains
  `focusParameterKeys` or drops it after control construction is a
  materializer decision; the validator preserves it verbatim.
- **Prompt-side instructions** (`prompt.ts`) for emitting `focusParameterKeys`
  are out of Phase 2C validation scope; the validation layer is ready for the
  output regardless.
- **Standalone `sciencePolicy` callers** (outside the schema pipeline) are not
  re-checked for `focusParameterKeys` membership — the schema covers the
  pipeline path, and science-policy is unchanged per ownership. Documented,
  not expanded.

---

## Appendix A — shared-worktree note (concurrent Phase 2B workstream)

This worktree is shared: the evaluation-director/canonical-state-architect
workstream landed `src/demonstrations/generation/controls/materialize.ts` +
`pipeline.ts` integration + `tests/demonstrations/coupling/control-materialization.test.ts`
+ `tests/demonstrations/trust/*` DURING this phase, and is still writing them
(`controls/catalog.ts` — the ED-owned `ENGINE_CONTROL_CATALOG` the materializer
imports — did not exist at the time of writing). Failure attribution for the
full-repo run (11 files / 8 tests failing at 21:01, plus 17 at 20:47):

- **Not caused by Phase 2C (this workstream)**: every pipeline-dependent file
  (`pipeline.test.ts`, `prompt-injection.test.ts`, `generation-pipeline.test.ts`,
  `benchmark.test.ts`, `ask-flow*.tsx`, `demo-shell-a11y*.tsx`,
  `control-materialization.test.ts`) fails at import time with
  `Failed to resolve import "./catalog"` — the ED's `materialize.ts` imports a
  catalog that does not exist yet. `database-security-contract.test.ts` is a
  live-Atlas-cluster test (app user holds `atlasAdmin` on the real cluster).
  `lab-flow.test.tsx` / `ask-flow.test.tsx` timeouts are load-induced 5s
  timeouts under a 70-file parallel run. None of these failures reference any
  Phase 2C file (the only log line naming this workstream's files is the
  validation suite itself passing 108/108). `tsc --noEmit` errors are confined
  to the ED's in-flight `tests/demonstrations/trust/control-catalog.test.ts`
  (invalid characters mid-write); Phase 2C files are type-clean (verified
  before the concurrent changes landed).
- **Layering with the materializer (compatible by construction)**: the
  materializer drops unknown focus keys defensively; the Phase 2C validator
  rejects them at the boundary (`invalid_engine_key`) BEFORE the materializer
  runs (pipeline order: gate -> sanitizeDemoSpec -> materializeControls). The
  materializer's `FocusedSimulation` structural cast is now redundant with the
  contract field this phase added — harmless.
- **Isolated Phase 2C verification (this workstream's footprint)**: 108/108 on
  `tests/demonstrations/validation.test.ts`; 371/371 on the isolated subset
  (validation, showcases, engine, non-pipeline coupling, offline generation);
  481/481 on generation/redteam/showcases/engine/coupling before the ED
  changes landed.
