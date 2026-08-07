# Focus-Key Ranking — Deterministic Ranking Spec (Round 2, judge-upgrade)

> Owner: evaluation-director. Implementer: canonical-state-architect
> (`rankFocusKeys` in `src/demonstrations/generation/controls/materialize.ts`).
> Frozen manifest: `tests/demonstrations/trust/focus-ranking.test.ts`
> (sha256 `57fdcc1691aa9746937975e239c3906802bc89b07e323f65635700228cbb7195`,
> recorded before implementation; the manifest is never edited after freeze).

## Judge mandate (verbatim)

> Deterministic focus-key ranking — "explicit learner variable → catalog
> relationship match → model-suggested valid keys → curated default. The
> model should never be the only mechanism deciding whether the learner
> receives a relevant control."

## The blocked failure this resolves

The v3 holdout (`docs/holdout-2026-08-06-v3.md`, diagnosis 3) records **2
control-relevance misses** — `orbits-comet-speed` and `resource-exhaustion-3`
— where the model's chosen `simulation.focusParameterKeys` were the **sole
selection mechanism** (model picked `eccentricity` where the gold implied
`speed`). Materialization was correct; the miss was model focus-key
selection. This spec replaces model-only selection with a 4-step
deterministic ranking; the model contributes only tier 3.

## RANKING SPEC — the contract

### Function signature

```ts
rankFocusKeys(
  engineId: VerifiedEngineId,
  normalizedQuery: string,   // lowercased defensively; phrase match = substring containment
  modelFocusKeys: string[],  // the model's simulation.focusParameterKeys, as emitted
  opts?: { oneVariableMode?: boolean },
): string[]                  // engine-owned keys, ranked, deduped; never empty
```

### 4-step precedence (first tier satisfied wins its keys; all tiers contribute, deduped)

1. **Explicit learner variable** — every phrase in `FOCUS_VARIABLE_WORDS`
   (mirror of the intent layer's `VARIABLE_WORDS`, route.ts:57-75) contained
   in the normalized query, mapped to its key, filtered to
   `ENGINE_CATALOG[engineId].parameterKeys`; declaration order of the table.
   A variable word with no matching engine key (e.g. `mass`) is inert here
   and falls through to tier 2.
2. **Catalog relationship match** — every `LEARNING_RELATIONSHIPS[engineId]`
   entry (ascending `priority`) whose **any** phrase is contained in the
   query contributes its `keys`, in entry priority order, deduped. Multiple
   matching entries all contribute (a query can express several concepts).
3. **Model-suggested valid keys** — `modelFocusKeys` filtered to the engine's
   `parameterKeys`, in model order, deduped against tiers 1-2.
4. **Curated default** — when the result is still empty: the top-priority
   `ENGINE_CONTROL_CATALOG[engineId]` entry's key.

**Invariant:** the result is never empty and never contains a non-engine
key; tiers 1-2 always beat the model; the model can only add keys the engine
owns, after the deterministic tiers.

### oneVariableMode rule

`opts.oneVariableMode: true` → return `result.slice(0, 1)` (the single top
ranked key). The materializer keeps its own count guarantees on top of the
ranked list (>= 2 parameter controls on comparison intent; >= 1 always).

### Data dependency

- `src/demonstrations/generation/controls/relationships.ts` (ED-owned):
  `LEARNING_RELATIONSHIPS` (tier 2) and `FOCUS_VARIABLE_WORDS` (tier 1).
- `src/demonstrations/generation/controls/catalog.ts` (tier 4 default).
- `ENGINE_CATALOG` (key validity for tiers 1 and 3).

## Relationships data — file and per-engine entry counts

File: `src/demonstrations/generation/controls/relationships.ts` — 10 engines,
**44 relationships** total, every engine >= 2 (mandate floor), every key a
member of the engine's `parameterKeys`, and the per-engine union of keys
covers the engine's **full** parameter space (each parameter key is reachable
by at least one relationship).

| Engine | Relationships | Covered parameter keys |
|---|---|---|
| orbits | 5 | g, speed, bodyMass, eccentricity, distance |
| projectile | 4 | angle, speed, drag, gravity |
| charges | 4 | q1, q2, separation, fieldScale |
| waves | 5 | frequency, wavelength, amplitude, separation, phase |
| gas | 5 | temperature, particles, gravity, speedScale |
| pendulum | 4 | length, gravity, amplitude, damping |
| rc_circuit | 5 | resistance, capacitance, voltage |
| reaction_diffusion | 4 | feed, kill, diffusionU, diffusionV |
| cellular_automaton | 4 | speed, density |
| nuclear_chain_reaction | 4 | initialNeutrons, absorber, multiplication |

Grounding is per-engine physics, cited in the file header (Kepler/Coulomb/
kinetic theory/Gray-Scott/…). Mandate examples are pinned verbatim by tests,
e.g. orbits `period|slower|faster|speed` -> `[speed, distance]`, charges
`force|attract|repel` -> `[q1, q2]`, waves `frequency|pitch` -> `[frequency]`,
gas `temperature|hot` -> `[temperature]`.

## Tests — frozen state (single full-file run, no selective reruns)

Run: `npx vitest run tests/demonstrations/trust/focus-ranking.test.ts`
(package manager note: this worktree runs vitest via `node node_modules/.bin/vitest`).

```text
Tests  14 failed | 10 passed (24)
```

- **GREEN (10/10) — the relationships data contract** (ED-owned, must pass
  now): full Record over VERIFIED_ENGINE_IDS; >= 2 relationships per engine;
  well-formed entries (lowercased non-empty phrases, unique per engine,
  unique positive priorities); every key in the engine's `parameterKeys`;
  full parameter-key coverage; 4 mandate pins; `FOCUS_VARIABLE_WORDS` mirror
  of route.ts pinned verbatim.
- **RED (14/14) — the `rankFocusKeys` precedence contract** (pending
  canonical-state-architect implementation): every failure is the single
  cause `rankFocusKeys not yet exported by materialize.ts` — no contract
  assertion is failing on semantics. Implementing the 4-step precedence
  above in `materialize.ts` should flip all 14 green. The 14 cases pin:
  period-implied -> `[speed, distance]`; wider -> `[speed, eccentricity]`;
  frequency+pattern -> `[frequency, wavelength, separation]`; charges
  attraction -> `[q1, q2]`; explicit variable before model keys; explicit
  variable before relationship keys; variable-word fallback to relationship
  (`angle` -> `[amplitude]`, `faster` -> `[speedScale]`); invalid model keys
  dropped; model keys deduped; all-invalid model keys -> curated default;
  empty query + empty model keys -> curated default; oneVariableMode ->
  single top key (two cases).

The ranking block imports `materialize.ts` **dynamically**, so the missing
export fails only the ranking tests — the data contract stays green in the
same file (the mandate's required state).

## Verification integrity

- Manifest hash frozen before implementation: `57fdcc1691aa9746…` — re-verified
  unchanged after the run (no post-hoc edits to the manifest).
- Full trust directory: `2 passed | 1 failed` files, `55 passed | 14 failed`
  (the 14 failures are the pending ranking implementation; the existing
  decision-table 32 and control-catalog 13 tests are unaffected).
- No production code other than the ED-owned data file was changed;
  `route.ts`, `pipeline.ts`, validators, and holdouts are untouched.

## UNKNOWN / honest reporting

- **`FOCUS_VARIABLE_WORDS` is a mirror, not a link**: route.ts does not
  export `VARIABLE_WORDS`, so tier 1 mirrors it in relationships.ts; the
  mirror is pinned by test today, and a future route.ts edit fails the pin
  loudly. It is a test-pinned invariant, not a compile-time link.
- **Ranking function behavior is unexecuted until the CSA implements it.**
  The frozen expectations are exact-equality assertions on the data the ED
  authored, so a CSA implementation that follows this spec should pass
  without relabeling; any divergence is a visible test failure, never a
  silent re-score.
- **Substring matching** (documented above) trades precision for
  determinism; e.g. `formation` would match `information`. No current
  phrase collides with a learner query in the pinned cases; a future
  collision is a data edit gated by the frozen tests.
- **Model-key ordering** (tier 3) preserves model order; if the model emits
  multiple valid keys, relative order among them remains model-dependent
  (all tiers above it remain deterministic).
