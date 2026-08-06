# Phase 1–2 Closure — Canonical State: Deterministic Control Materialization (2B) and State Continuity (2C)

**Owner:** canonical-state-architect · **Worktree:** `generative-trust-controls`
**Files:** `src/demonstrations/generation/controls/materialize.ts` (new), `src/demonstrations/generation/model/pipeline.ts` (materialization step), `tests/demonstrations/coupling/control-materialization.test.ts` (new)

---

## 1. The problem this closes

Holdout v2 (`docs/holdout-2026-08-06-v2.md`): **control relevance 50% FAIL** — the hosted
model under-provisions controls for verified engines (average coverage ~0.33 of the gold's
expected keys). Root cause: control authorship was delegated to the model. Phase 2B removes
that delegation: for verified engines the model selects the engine and a **bounded learning
focus** (`simulation.focusParameterKeys`, added by the validation boundary), and
**deterministic code materializes full control definitions** from the ED-owned
`ENGINE_CONTROL_CATALOG`. Phase 2C pins that the materialized controls, the simulation
parameters, and the engine's canonical state are the *same* values.

## 2. Architecture

```
model output (JSON)                      curated showcases / offline fallbacks
   | firstPassModelCheck (gate)          (provenance curated_engine / template_composition)
   |   admits bounded focusParameterKeys         |  never enter this path
   v                                            v
sanitizeDemoSpec (repair-aware validation)   untouched (requirement 9)
   |  - bounds focusParameterKeys (1-4)
   |  - rejects non-engine-owned keys (`invalid_engine_key`)
   v
materializeControls(spec, {comparisonIntent, reducedMotion, animationSpeed})
   |  src/demonstrations/generation/controls/materialize.ts
   |  guards: provenance.model_generated_spec AND verified_simulation+simulation
   |  (Level 2/3 model specs and curated specs returned unchanged — requirement 8/9)
   |  selection (deterministic, pure, no I/O):
   |    focus keys ∩ catalog keys  ->  honored (dropped unknowns NEVER retargeted)
   |    all-unknown / omitted      ->  curated defaults (two highest-priority entries)
   |    comparisonIntent           ->  two highest-priority keys (>= 2 controls)
   |    adaptationContext.oneVariableMode -> at most ONE parameter control
   |  catalog wins: bounds/labels/units/defaults replace model-emitted values
   |  parameters the ENGINE reads are overwritten with the same catalog definitions
   v
spec.controls + spec.simulation.parameters  (single source of truth)
   |  3D stage · 2D stage · readouts · tables · replay — all read this state
```

**Honest labeling (requirement 7):** `provenance.source` stays `"model_generated_spec"` —
the model wrote the spec. The materialized controls are deterministic code; the code
reference is `src/demonstrations/generation/controls/materialize.ts`. Nothing claims the
model authored the controls, and the prompt never asks it to for verified engines.

## 3. Catalog contract (dependency on the evaluation-director — LANDED)

`materializeControls` consumes `ENGINE_CONTROL_CATALOG` from
`src/demonstrations/generation/controls/catalog.ts` (ED-owned). The landed
catalog defines `EngineControlDefinition` with:

- `Record<VerifiedEngineId, EngineControlDefinition[]>` — every verified
  engine, at least two entries each;
- `key` MUST be a member of `ENGINE_CATALOG[engineId].parameterKeys`;
- `controlType: "slider" | "toggle" | "segmented_control"` (the UI renders all
  three for parameter targets); `label`, `description`, `learningRelationships`;
- `min`/`max` finite with `min <= max`; `step` optional (defaults to 1);
  `defaultValue` inside `[min, max]`; optional `unit`;
- `priority`: positive unique integer per engine; lower = higher priority
  (materializeControls sorts ascending when every entry carries one; array
  order is the fallback priority).

A fail-loud runtime contract check (`assertCatalogContract`, exported from
materialize.ts and consumed by the trust suite's `control-catalog.test.ts`)
runs on first materialization: a diverging catalog throws instead of silently
degrading. Parameters the catalog defines are fully curated
(labels/bounds/units/defaults — the same definitions the controls expose);
parameters outside the catalog keep the model's sanitized values; focus keys
outside the catalog fall back to curated defaults.

## 4. Guarantees (requirements 1–9)

| # | Guarantee | Where pinned |
|---|-----------|--------------|
| 1 | Model selects engine + focus; code materializes definitions | `materializeControls` focus-key path |
| 2 | Requested keys validated against the selected engine | catalog membership filter + validator `invalid_engine_key` |
| 3 | >= 1 control; >= 2 on comparison intent | curated defaults (top-2) / comparison branch |
| 4 | one-variable mode keeps the single-variable contract | at most ONE parameter control when `adaptationContext.oneVariableMode` |
| 5 | Unknown keys rejected, never silently retargeted | dropped; all-unknown -> curated defaults |
| 6 | Curated defaults when focus omitted | top two highest-priority catalog entries |
| 7 | Honest source labeling | provenance stays `model_generated_spec`; code reference in `materialize.ts` |
| 8 | Level 2/3 specs: controls untouched | early return (no verified simulation) |
| 9 | Only `model_generated_spec` with a verified simulation | provenance + trust-level guards |
| 10 | Continuity: controls == parameters == engine keys | see section 5 |

## 5. Canonical-state continuity (Phase 2C)

Statement: **for a materialized spec, the control definitions ARE the engine parameter
definitions.** Every materialized control's `target.ref` is a member of the engine's
`parameterKeys`; its `min/max/step/defaultValue` are EXACTLY equal to the
`simulation.parameters` entry the engine consumes, and both are the catalog's values by
construction (the materializer rewrites both from the same catalog entry). The 3D stage,
2D stage, readouts, tables, and the replay path (parameter-only restore:
`reset()` + `setParameter` per key) therefore read one canonical state — there is no
second copy of control bounds anywhere.

### Control → canonical state matrix

| Control | Canonical field(s) | Writers | Consumers | Persistence | Replay proof | Risk |
|---|---|---|---|---|---|---|
| `param_<key>` slider | `simulation.parameters[<key>]` (label/min/max/step/value/unit) — written by materializer from catalog | `materializeControls` (catalog wins; model cannot write) | 2D stage (`setParameter` → runner), 3D stage (visual state), readouts, table, replay | trial `parameters` snapshot (key/value only, per demo-store) | `reset` + `setParameter` reproduces canonical state (`control-materialization.test.ts` §replay path; `replay-restore.test.ts`) | low — single source; catalog contract checked at load |
| `play_pause` / `reset` | scene refs (`play_pause`/`reset` on runner) | materializer (deterministic transport) | stage transport | trial `controls` map | n/a (transport) | low |
| `speed_control` | scene ref `speed` (default from `animationSpeed` pref) | materializer (omitted under `reducedMotion`) | stage speed | trial `controls` map | n/a (transport) | low |
| `focusParameterKeys` | `simulation.focusParameterKeys` (bounded 1–4, engine-owned) | model (bounded emit) | materializer (selection input) | not persisted (declarative only) | selection determinism pinned by unit tests | low — validator rejects non-engine-owned keys |
| model-emitted `controls` (verified engines) | — (stripped) | nobody after 2B | — | — | pipeline test asserts strip+replace | resolved |

## 6. Test evidence

`tests/demonstrations/coupling/control-materialization.test.ts` (new coupling
suite, 21 tests) plus the suites it extends. Final runs (recorded 2026-08-05):

- `npx vitest run tests/demonstrations/coupling/` → 5 files, 48 tests, 48 pass
  (21 new control-materialization tests),
- `npx vitest run tests/demonstrations/generation/model/pipeline.test.ts` →
  19/19 pass (no fixture adaptations),
- `npx vitest run tests/demonstrations/generation/` → 227/227 pass,
- `npx vitest run tests/demonstrations/trust/` → 45/45 pass (includes the ED's
  catalog contract test calling `assertCatalogContract`),
- `npx vitest run tests/demonstrations/` → 810 pass, 1 pre-existing failure
  (live-cluster Atlas security contract, security agent's scope).

Covered behaviors:
- catalog contract covers every verified engine with well-formed, engine-owned entries;
- valid focus keys materialize catalog definitions; unknown keys dropped (never retargeted);
  all-unknown -> curated defaults;
- omitted focus keys -> the two highest-priority entries (>= 1 control; transport included;
  <= `SPEC_LIMITS.maxControls`); `reducedMotion` omits `speed_control`;
- comparison intent -> >= 2 parameter controls (top-2 priority, filled from catalog when
  the model requested fewer);
- one-variable mode -> at most ONE parameter control;
- model-emitted controls stripped; model labels/bounds/units/values lose to the catalog;
  declared `limits.maxControls` raised to the materialized count;
- Level 2 model specs and curated (`curated_engine` / `template_composition`) specs
  untouched;
- continuity: every materialized control's bounds equal the parameter the engine reads,
  both equal the catalog entry; the engine accepts every materialized default without
  throwing and readouts stay displayable; parameter-only restore reproduces the same
  canonical state (orbits / charges / waves);
- pipeline integration: `generateDemo` strips model-emitted controls for verified specs,
  honors `oneVariableMode` and comparison intent end-to-end; offline path and Level 2
  model specs are never materialized.

## 7. Fixture adaptations

None required: `tests/demonstrations/generation/model/pipeline.test.ts` never
asserted control content, so the deterministic replacement keeps every existing
assertion valid (19/19 pass, unchanged). One behavioral note for the new
coupling suite: the learner DEFAULT preference is `oneVariableMode: true`
(`src/domain/learner.ts`), so fixtures built with default preferences exercise
the single-variable contract; multi-control assertions use explicit
`oneVariableMode: false` preferences. The curated showcase builders hardcode
`adaptationContext.oneVariableMode: true`; the model fixture mirrors the
learner preference instead (as the prompt instructs the model to do).

## 8. Dependencies / notes

- `ENGINE_CONTROL_CATALOG` (`controls/catalog.ts`) is the evaluation-director's
  module — landed and contract-verified (trust suite `control-catalog.test.ts`
  passes, including its call of `assertCatalogContract`).
- `simulation.focusParameterKeys` (1–4, engine-owned, reason
  `invalid_engine_key`) is the validation boundary's field (contract + schema +
  gate); the materializer reads it from the typed spec.
- The model still authors `simulation.parameters`; the materializer overwrites
  the catalog-defined subset so bounds/labels/units/defaults are always curated
  ("catalog values win over any model-emitted values").
- The only failing test in the full demonstrations tree is the pre-existing
  live-cluster security contract test (`backend/database-security-contract.test.ts`,
  Atlas app-user role drift) — owned by the security agent, unrelated to
  materialization.
