# Trust Decision Table — PHASE 2A + 2B (deterministic trust + EngineControlCatalog)

**Author:** evaluation-director · **Program:** UNSEENLAB PHASE 1–2 CLOSURE
**Branch:** `fix/generative-trust-controls` · **Status:** implemented + tested
**No git operations performed (no add/commit/push).**

This document is the authoritative spec for the deterministic trust decision
table (Phase 2A) and the EngineControlCatalog design (Phase 2B). Both close
the two v2 holdout failures (docs/holdout-2026-08-06-v2.md):

- **Trust classification FAIL (86.2%, threshold 90%)** — 2 policy-internal
  contradictions (predator-prey: "relationship" phrasing vs "cycle" phrasing;
  cause-effect chain vs ordered sequence) and 2 model deviations
  (comparisons → Level 3: `chem-bond-comparison`, `chem-graphite-diamond`).
- **Control relevance FAIL (50%, threshold 85%)** — the hosted model
  under-provisions canonical parameter controls (average coverage ~0.33 of
  the gold's expected keys) and invents control metadata (e.g., an orbits
  `distance` control bounded 1..3 when the engine's canonical range is
  20..2000).

---

## 1. The precedence (Phase 2A) — learner intent, not topic name

The trust level is resolved deterministically, first matching rule wins:

| # | Signal | Resolution |
| --- | --- | --- |
| 1 | **Verified engine match** (an id in `VERIFIED_ENGINE_IDS`; parameters/readouts engine-owned) | **Level 1** `verified_simulation` |
| 2 | **Explicit staged / sequential / cyclic / over-time intent** (stage, phase, step, sequence, cycle, walk through, over time, trace/follow … through, process) | **Level 3** `explanatory_animation` |
| 3 | **Explicit comparison / relationship / effect / structure intent** (compare, versus, difference between, influence, cause and effect, transfer, convert, structure, …) | **Level 2** `conceptual_demonstration` |
| 4 | Neither, and no engine | **`clarify`** — one clarification question, **never a guessed spec** |

Ordering rules, pinned by tests:

- **Rule 1 outranks the marker classes.** The v2 engine golds carry effect
  markers ("how the electric force … shrinks as they separate", "raising the
  frequency squeezes the wavelength") and are Level 1; the engine match wins.
  The prompt's Level-1 engine rules are kept intact.
- **Rule 2 outranks rule 3.** An explicit ordered-narrative request wins over
  a comparative reading ("compare the stages of mitosis" → Level 3).
- **Wording can never fabricate an engine.** "Build a verified simulation
  showing water climbing through every stage of the hydrologic cycle"
  (v2 `trust-misleading-hydrologic`) has no engine → the ordered-narrative
  intent ("every stage", "cycle") resolves to Level 3. Escalation is
  forbidden; Level 1 exists only with a curated engine.
- **Ambiguity is a category, not a level.** Broad, markerless, engine-less
  requests ("show cells") resolve to `clarify` — and in the real pipeline the
  intent router produces the clarify envelope before the model is ever called
  (src/demonstrations/generation/intent/route.ts), so the hosted model never
  guesses a level.

Implementation: `src/demonstrations/generation/trust/decision-table.ts`
(`resolveTrustLevel(normalizedQuery, intent, engineMatch)`), keyword rules in
`TRUST_L3_MARKERS` / `TRUST_L2_MARKERS` (exported and inspectable). The
`intent` argument is part of the pipeline-facing signature but is deliberately
NOT consulted — the table is topic-name-blind by design.

## 2. The nine required cases

| # | Case | Query (normalized) | Resolution | Justification |
| --- | --- | --- | --- | --- |
| 1 | Predator-prey **relationship** | show how predator prey population sizes influence each other | **L2** | "influence each other" is a relationship/effect request (rule 3); no cycle/sequence marker. |
| 2 | Predator-prey **cycle walkthrough** | walk me through the predator prey cycle over time | **L3** | "walk me through" + "cycle" + "over time" are explicit ordered-narrative markers (rule 2). Same topic as #1, opposite level — intent, not topic name. |
| 3 | Graphite versus diamond | compare and contrast the structure of graphite and diamond | **L2** | "compare and contrast" + "structure" (rule 3). The v2 model-deviation case: comparisons are never Level 3. |
| 4 | Chemical-bond comparison | show the difference between a covalent bond and an ionic bond | **L2** | "difference between" is an explicit comparison marker (rule 3). |
| 5 | Mitosis **stages** | show the stages of mitosis | **L3** | "stages" (rule 2). |
| 6 | Photosynthesis **energy transfer** | show how photosynthesis transfers energy | **L2** | "transfers" is an effect/transfer marker (rule 3). Refines the policy §3 topic blanket: an energy-transfer phrasing is Level 2; only the ordered-stage phrasing is Level 3. |
| 7 | Photosynthesis **process sequence** | walk through the steps of photosynthesis in order | **L3** | "walk through" + "steps" + "in order" (rule 2). Same topic as #6, opposite level. |
| 8 | Neural-network information flow | walk through how information flows through a neural network from input to output | **L3** | Ordered sequence (input → hidden layers → output) per approved trust policy §3. **EXCLUDED from holdout-2026-08-06-v2** (§6: no-path — the intent layer returns `unsupported` before the resolver/model; zero golds, zero scoring rows). The assertion is a policy-conformance pin; any future gold must be worded as an ordered walkthrough. |
| 9 | Ambiguous "show cells" | show cells | **clarify** | No engine, no intent marker → one clarification question, never a guessed spec. |

Conformance with the UNCHANGED v2 gold corpus (section 3): all 16 checked
golds agree with their frozen levels except the single documented divergence
`bio-photosynthesis-2` (frozen L3; the new intent-first table reads "convert
sunlight into stored chemical energy" as an energy-transfer/effect request →
L2). The old gold is not modified.

## 3. The old failed holdouts (v1/v2) remain unchanged

- `docs/holdout-2026-08-05.md` / `docs/holdout-results-2026-08-05.json`
  (v1) and `docs/holdout-2026-08-06-v2.md` /
  `docs/holdout-v2-results-2026-08-06.json` (v2) are **untouched**: no gold,
  no label, no scoring rule was modified. Their frozen SHA-256 manifest
  (`065be4c8…` for v2) is unaffected.
- The decision table governs **future** gold authoring (v3+) and the hosted
  trust decision; it does not rewrite history. Where the table refines the
  approved trust policy (docs/trust-policy.md) — intent-first vs the §3
  topic-based rows (photosynthesis rows 6/7 above), and the §4.3 "biological
  … ALWAYS Level 3" blanket yielding to explicit comparison intent — the
  refinement is a new contract for new artifacts, explicitly NOT a relabel of
  existing golds.
- The approved policy's §2 anchor ("the model-prompt trust rule is the
  anchor") is preserved: the prompt now embeds the same precedence verbatim
  (section 5).

## 4. EngineControlCatalog (Phase 2B) — design and data

File: `src/demonstrations/generation/controls/catalog.ts`.

### 4.1 Why

The model cannot be trusted to author control metadata: the v2 results show
invented bounds (orbits `distance` control min 1 max 3 vs the engine's
canonical 20..2000) and under-provisioned controls (coverage ~0.33). Phase 2B
removes control authorship from the model entirely.

### 4.2 Architecture (the deterministic materialization contract)

```
model selects  engine + bounded learning focus (simulation.focusParameterKeys,
1-4 keys, every key engine-owned)
  +------------------------------------------------------------------+
  | deterministic layer (controls/materialize.ts + validation)       |
  |  - validates keys against the engine's catalog                   |
  |    (validator reason invalid_engine_key — never repaired)        |
  |  - drops unknown keys (NEVER retargets)                          |
  |  - falls back to curated defaults (top-priority catalog entries) |
  |  - guarantees >= 1 control; >= 2 on comparison intent            |
  |  - one-variable mode: at most ONE parameter control              |
  |  - catalog bounds/labels/steps/defaults WIN over model-emitted   |
  |    values; labels source honestly (showcase/engine citations)    |
  +------------------------------------------------------------------+
  v
deterministic controls + engine parameters the UI and engine both read
```

- **The model emits ONLY `focusParameterKeys`** (bounded, engine-owned) for
  verified engines — never parameter keys/targets/units/bounds/steps/defaults
  of its own invention. `controls[]` at Level 1 carries scene controls only
  (play_pause / reset / speed_control); the deterministic layer builds the
  final control set.
- **Guarantees**: ≥ 1 parameter control always; ≥ 2 when the intent is a
  comparison (`learner_goal === "compare scenarios"`); one-variable mode
  preserves the single-variable contract (≤ 1 parameter control).
- **Honest labels**: every entry cites its source (showcase PARAMETERS block,
  engine META, or curated offline block) in the catalog file; the materializer
  propagates catalog labels verbatim.
- **Backward compatibility**: `focusParameterKeys` is optional; curated
  showcase/offline specs (provenance `curated_engine` /
  `template_composition`) and Level 2/3 model specs are never materialized
  (tests in tests/demonstrations/coupling/control-materialization.test.ts).

### 4.3 Data — per-engine control counts and sources

| Engine | Entries | Canonical source (cited in catalog.ts) |
| --- | --- | --- |
| orbits | 5 | showcase `showcases/orbits/build-spec.ts:42-48` (PARAMETERS) + controls order 163-214 |
| projectile | 4 | engine META `renderers/lumina-2d/engines/projectile.ts:13` + curated labels `engine-builder.ts:50-55` |
| charges | 4 | showcase `showcases/electric-fields/build-spec.ts:44-49` + controls order 146-178 |
| waves | 5 | showcase `showcases/wave-interference/build-spec.ts:46-52` + controls order 137-166 |
| gas | 4 | engine META `engines/gas.ts:17` + curated labels `engine-builder.ts:68-73` |
| pendulum | 4 | engine META `engines/pendulum.ts:12` + curated labels `engine-builder.ts:74-79` |
| rc_circuit | 3 | engine META `engines/circuit.ts:13` + curated labels `engine-builder.ts:80-84` (units Ω/F/V per engine) |
| reaction_diffusion | 4 | engine META `engines/reaction-diffusion.ts:15` + curated labels `engine-builder.ts:85-90` |
| cellular_automaton | 2 | engine META `engines/cellular-automaton.ts:14` + curated labels `engine-builder.ts:91-94` |
| nuclear_chain_reaction | 3 | curated offline block `engine-builder.ts:42` (the only curated source — no lumina-2d module is registered yet) |

Totals: 38 entries across all ten `VERIFIED_ENGINE_IDS`. Priority order
matches the curated showcase control order for the three showcased engines
(orbits: speed, g; waves: frequency, wavelength, separation; charges: q2, q1,
separation, fieldScale) and the engine's canonical parameterKeys order
otherwise; the materializer sorts ascending when every entry carries a
numeric `priority`.

Two documented sourcing notes:
- charges `fieldScale` default is **10** (showcase canonical) while the
  engine META default is 1 — the showcase PARAMETERS block wins per the
  evaluation-director mandate; the engine accepts 10 (within 0.05..20).
- `ENGINE_CONTROL_CATALOG` is a full `Record<VerifiedEngineId, …>`: the
  materializer's fail-loud contract check iterates every id and throws on a
  missing engine, so a partial catalog would break the runtime.

### 4.4 Type-shape note (deliberate deviation from the task's literal interface)

The exported definition is a **type alias** (not an `interface`) with
**required** `min`/`max`/`step`:

```ts
export type EngineControlDefinition = {
  key: string; label: string; description: string;
  controlType: "slider" | "toggle" | "segmented_control";
  min: number; max: number; step: number;
  defaultValue: number; unit?: string;
  learningRelationships: string[]; priority: number;
};
```

Rationale: the landed materializer (controls/materialize.ts) consumes every
entry with a fail-loud runtime check that throws when min/max/step are
missing or invalid, and its type contract requires them; an `interface` with
optional bounds fails the consumer's typecheck (`as CatalogEntry` cast) and
would permit catalog entries without the very bounds Phase 2B exists to
guarantee. All data entries satisfy the stricter shape; the trust tests
assert finite bounds and in-range defaults for every entry.

## 5. Prompt updates (src/demonstrations/generation/model/prompt.ts)

1. **Trust-rules section — same precedence verbatim.** The Level 2/3 branch
   now states: Level 3 for explicit staged/sequential/cyclic/over-time
   requests (even for topics that could be read as static); Level 2 for
   explicit comparison/relationship/effect/structure requests (even for
   biological topics — comparisons are never Level 3); ambiguity is resolved
   by the deterministic router BEFORE the model (one clarification question;
   the model never guesses a level and never emits a clarify-style spec; the
   policy's conservative "otherwise Level 2" remains the last resort).
2. **Level-1 engine rules intact**, plus the Phase 2B/2C focus-keys
   instruction: the model emits `simulation.focusParameterKeys` (1-4 keys,
   every key from the engine's parameterKeys; ≥ 2 for comparison requests;
   curated defaults when omitted), never authors parameter controls or their
   min/max/step/default/unit, and keeps `controls[]` to scene controls.
3. **Schema section** documents `focusParameterKeys` (optional, verified
   only, 1-4 strings, engine-owned) so the model knows the field is part of
   its contract.

## 6. Verification

- `npx vitest run tests/demonstrations/trust/` → **2 files, 45 tests, all
  pass** (decision-table.test.ts: 32; control-catalog.test.ts: 13).
- `npx vitest run tests/demonstrations/generation/model/` → 37 pass (prompt
  change is text-only; exported signature unchanged).
- `npx tsc --noEmit` — the files owned by this phase report zero errors
  (decision table, catalog, prompt, trust tests). See section 7 for the
  concurrent-worktree caveat.
- TDD: both test files were written and run RED (module imports unresolved)
  before the implementations landed, then GREEN.

## 7. UNKNOWN / honest reporting

- **Concurrent worktree**: this worktree is shared with parallel agents whose
  files (validation boundary, materializer, coupling suite, pipeline) are
  uncommitted and were observed changing during this phase (line numbers
  drifted mid-session). `tsc --noEmit` currently reports residual errors in
  `controls/materialize.ts:271`, `tests/demonstrations/coupling/
  control-materialization.test.ts` (516/534 — a pre-existing
  `ControlSpec.defaultValue: string | number` narrowing issue in the coupling
  test, which never typechecked before the catalog existed), and
  `tests/demonstrations/validation.test.ts:1585` (`gate.value` narrowing).
  Those files are outside this phase's ownership (coupling/*, validation/*
  are do-not-touch; materialize.ts belongs to the canonical-state architect)
  and are flagged, not fixed.
- **nuclear_chain_reaction has no lumina-2d module** (renderers/lumina-2d/
  engines/index.ts registers nine engines). The catalog covers it (sourced
  from the curated offline block) so the materializer contract check passes,
  but the coupling suite's "engine accepts every materialized default" test
  throws `engine not registered` for it until the renderer registers the
  module. Outside this phase's ownership; the router can already score the
  topic (pre-existing gap).
- **bio-photosynthesis-2 divergence**: the frozen v2 L3 gold reads as an
  energy-transfer request (L2) under the new intent-first table. The gold is
  unchanged (section 3); v3 gold authoring must word photosynthesis process
  golds as ordered-stage walkthroughs ("walk through the stages of
  photosynthesis") to earn Level 3.
- **Bare topic names**: "mitosis" alone, with no intent marker and no engine,
  resolves to `clarify` at the resolver; the offline curated timeline route
  (TRUST_BY_KIND) is unchanged and still produces its Level 3 artifact. The
  resolver governs the hosted path and gold wording, where explicit intent is
  required.
- **Offline vs hosted parameter spaces differ** for the six non-showcase
  engines (engine-builder curated blocks vs lumina-2d engine META). The
  catalog is engine-truthful (META) because the materializer feeds the
  lumina-2d engines; the offline path keeps its own curated space. Both paths
  are internally consistent; no cross-path coupling was changed.

## 8. Freeze statement

- Files written by this phase: `src/demonstrations/generation/trust/
  decision-table.ts`, `src/demonstrations/generation/controls/catalog.ts`,
  `src/demonstrations/generation/model/prompt.ts` (updated),
  `tests/demonstrations/trust/decision-table.test.ts`,
  `tests/demonstrations/trust/control-catalog.test.ts`, this document.
- No git operations performed (no add/commit/push).
- No validation/*, pipeline.ts, coupling/*, showcases/*, or old holdout file
  was modified by this phase.
