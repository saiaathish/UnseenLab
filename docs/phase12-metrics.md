# Phase 12 — v4 metric contract: renderability split (judge-upgrade Round 2)

Status: CONTRACT (validation-boundary-engineer owned). Round: UNSEENLAB
judge-upgrade Round 2. Worktree branch: `fix/generative-trust-controls`.

## Judge mandate (verbatim)

> split the renderability metric — keep SEPARATE: (1) valid specification rate,
> (2) renderable after validation, (3) provider/network availability.
> "A provider outage should not be described as the renderer failing."

The v3 failure this contract fixes: the frozen v3 runner
(`scripts/holdout-v3-runner-2026-08-06.mjs`) scored a single `renderable`
metric as `renderablePass(row) = outcome==="spec" && structural==="ok"` over
ALL renderable golds. The transient `network_error` row
(`malformed-charges-typo`, fetch failed, 157 ms — no spec, no product defect)
was counted against the renderer, producing `RENDERABLE 96.4% (27/28) FAIL
← 1 transient network_error` (docs/holdout-2026-08-06-v3.md). That conflated
three distinct facts into one gated number: the pipeline produced no spec
(availability), so the validator never saw a spec to validate (renderer), and
the row still failed a "renderable" denominator it was never eligible for.
This contract splits those three facts. **No validation rule is weakened by
this split: the structural and accessible-equivalent checks are unchanged and
apply to every returned spec.**

## Row classes (frozen vocabulary, v4)

- **spec-gold row**: a holdout entry whose gold kind is `engine`, `timeline`,
  or `template` (v3: 28 rows). Category golds (clarify/unsafe/unsupported) are
  not spec-gold rows; they are scored by their own frozen rules (unchanged).
- **row with a spec**: any row whose observed outcome is `"spec"` — from the
  hosted path (`source "model"`, valid or repaired), or from the offline
  fallback path (`source "offline"`, any fallback reason including
  `trust_mismatch`, `network_error`, `timeout`, `provider_error`,
  `invalid_response`, `schema_rejected`, `no_api_key`).
- **provider/network row**: any row WITHOUT a spec from the hosted call
  (outcome `network_error`, `rate_limited`, `timeout`, `provider_error`,
  `invalid_response`, `no_data`, `http_*`, `empty_response`, or a
  `{fallback: true}` envelope). These rows are **excluded from the
  renderable-after-validation denominator** and counted only in valid-spec
  rate (as misses) and in availability.
- **successful model response** (availability numerator): a hosted model call
  that returned a parseable spec that passed the first-pass gate and the
  full repair-aware validation (`sanitizeDemoSpec` status `valid` or
  `repaired`, i.e. `source "model"`). A fallback spec is NOT a successful
  model response (the model failed) — the fallback spec is scored under
  valid-spec rate and renderable-after-validation, and the row is a miss
  under availability.

## The three metrics (definitions verbatim)

1. **valid-spec rate** = schema-valid (or repaired) spec rows / spec-gold rows.
   - "schema-valid (or repaired) spec row": outcome `"spec"` AND the boundary
     structural check returns `"ok"` (the runner's frozen `structuralCheck`:
     schemaVersion, required string fields, trust level, controls ≤ 6,
     prediction 2–4 options, ≥ 1 representation, engine/level consistency;
     "valid or repaired" as in v3). Fallback specs are included and judged by
     the same check.
   - This is the honest end-to-end delivery number: the pipeline produced a
     validation-passing spec for the gold. A provider/network row fails it
     (no spec) — but the diagnosis of that miss is attributed to availability,
     never to the renderer.
2. **renderable-after-validation** = structurally valid + accessible-equivalent
   among rows WITH a spec (provider/network rows EXCLUDED).
   - Denominator: rows with a spec (model, repaired, or fallback).
   - Numerator: those spec rows whose spec is structurally valid AND
     accessible-equivalent (the v3 `structuralCheck === "ok"` plus the v3
     `accessiblePass`: ≥ 1 non-3D representation AND
     `renderer.fallbackKind ∈ [accessible_diagram, timeline, data_table]`).
   - This is the pure renderer/validator score: of every spec the system
     delivered, how many were structurally valid and accessible-equivalent.
     Provider/network rows cannot fail it — they never reached the renderer.
   - The v3 standalone `accessible` metric is subsumed here as a REQUIRED
     per-row component (both checks must pass); its rate is still reported as
     a breakdown of this metric. Folding it in is not a weakening: v3
     accessible coverage was 100% and remains required per row.
3. **provider/network availability** = rows with a successful model response /
   spec-gold rows (reported separately, NOT gated).
   - Reported as `pass/total` plus the rate and a per-row reason breakdown
     (network_error, timeout, provider_error, invalid_response, 429, …).
   - **No threshold.** It exists so the judge can attribute valid-spec misses
     to the provider without relabeling renderer failures.

## Thresholds

| Metric | Threshold |
| --- | --- |
| valid-spec rate | ≥ 98% of spec-gold rows |
| renderable-after-validation | ≥ 98% of rows with a spec |
| provider/network availability | reported (pass/total + reasons), NO threshold |

All other frozen v3 metrics and thresholds carry over unchanged into v4:
useful ≥ 85%, trust ≥ 90% (fallback exclusions unchanged), unsafe = 100%,
escalation = 0, control relevance ≥ 85%, materialization contract recorded +
reported (NOT gated). The v4 change is ONLY the replacement of the single v3
`renderable (≥ 98%)` metric with the three-way split above.

## Fallback handling (trust_mismatch and all fallback reasons)

- **renderable-after-validation counts the FALLBACK spec if it renders.** A
  fallback row whose offline spec passes the boundary structural check AND the
  accessible-equivalent check is a numerator row; the fallback status itself
  (reason `trust_mismatch`, `network_error`, `schema_rejected`, …) is never a
  pass or a fail — the checks decide.
- The `trust_mismatch` fallback path (`src/demonstrations/generation/model/
  pipeline.ts`, `offlineSpec(query, prefs, "trust_mismatch")`) must STILL
  validate the fallback spec: the boundary validation applies to every row
  with a spec regardless of source. A fallback spec failing structural or
  accessible-equivalent checks FAILS renderable-after-validation and fails
  valid-spec rate — no provider excuse.
- Wiring constraint (for canonical-state-architect's in-flight changes): any
  change to the fallback wiring must keep the fallback spec flowing through
  the same boundary validation the runner applies to model specs; it may not
  bypass or relax `structuralCheck`/`accessiblePass` for `source "offline"`
  rows, and it may not remove the `trust_mismatch` spec from the response
  envelope (a fallback spec must remain observable to the runner).
- Verified against the current tree (c3870ef): the pipeline's
  `trust_mismatch` path returns a spec via `generateOfflineDemo`, and every
  offline spec producer (engine-builder, template-builder, showcase builders)
  emits `schemaVersion: 1` plus a valid `fallbackKind`
  (accessible_diagram/timeline/data_table) and the required structural fields,
  so fallback specs satisfy the boundary checks. The runner already applies
  `structuralCheck` + `accessiblePass` to every spec row (v3: the 1 fallback
  row rendered and passed).

## Freeze rule (v4)

- v4 golds and scoring are frozen BEFORE the run, identical in mechanism to
  v3: manifest SHA-256 baked into the runner (runner refuses to run on drift),
  scoring constants and thresholds frozen constants, one single run, JSON
  results immutable, failed prompts never selectively rerun, post-run scoring
  edits not permitted.
- **The availability metric may not be used to excuse a real validation
  failure.** Availability is reported for attribution only. If a row has a
  spec and the spec fails the structural or accessible-equivalent checks, the
  row fails renderable-after-validation (and valid-spec rate) regardless of
  any provider/network condition observed on other rows. Availability excuses
  exactly one thing: the absence of a spec in a provider/network row — and
  even then the row still counts as a miss against valid-spec rate and is
  reported as such. This contract is fail-closed: no metric may be loosened to
  improve benchmark scores.

## Re-scoring of the frozen v3 run under v4 (for illustration only, NOT a v4 run)

v3 result rows reclassified under this contract (from
docs/holdout-v3-results-2026-08-06.json / docs/holdout-2026-08-06-v3.md):

- spec-gold rows: 28. Rows with a spec: 27 (26 model + 1 fallback).
- Provider/network rows: 1 (`malformed-charges-typo` — network_error, no spec).
- valid-spec rate: 27/28 = 96.4% (miss = the network_error row; attribution:
  availability).
- renderable-after-validation: 27/27 = 100% (all delivered specs structurally
  valid and accessible-equivalent; provider/network row excluded).
- availability: 26/28 = 92.9% (26 successful model responses; misses:
  `malformed-charges-typo` network_error, 1 invalid_response that fell back).

This illustrates the mandate: the same run reads as "provider hiccup, renderer
never at fault" instead of "renderer failed at 96.4%". The v4 gate will be
computed on a fresh frozen v4 run, never by re-scoring v3.

## Validation suite (Round 2 review-only sign-off)

Command recorded as mandated: `npx vitest run tests/demonstrations/validation.test.ts`.

Environment note: this machine has NO node/npm on PATH (bun only). Executed
with the repo's vitest via bun. With the repo's default vitest config the
suite failed to COLLECT under bun (`TypeError: undefined is not an object
(evaluating 'z.string')` at src/demonstrations/validation/demo-spec-schema.ts:74)
— a bun-only zod v4 ESM/CJS interop artifact of the transform pipeline, not a
test failure: `bun -e "import { z } from 'zod'"` resolves `z.string` fine with
installed zod 4.4.3, and the same suite passes under the identical config with
`server.deps.inline: ["zod"]` (temp config in /tmp, nothing added to the repo).

Result with the zod-inlined config:

```text
 RUN  v4.1.10
 ✓ tests/demonstrations/validation.test.ts (108 tests)
 Test Files  1 passed (1)
      Tests  108 passed (108)
```

- 108/108 tests pass; 1 file passed.
- No validation or sanitizer test was weakened by Round 2: the validation
  suite and sanitizer sources (`src/demonstrations/validation/`) are untouched
  since commit 40238bf (pre-Round-2); Round 2 commits (60cb2be…c3870ef)
  changed only holdout docs/runner/manifest/test additions. Working tree clean
  at c3870ef; no code modified in this round.

## UNKNOWN / honest reporting

- **The canonical-state-architect's in-flight wiring changes are not present
  in this worktree** (clean tree at c3870ef, no stash, no newer branch tip).
  This contract pins the required behavior (fallback spec validated and
  counted; boundary checks never bypassed) so the wiring cannot weaken
  validation; the wiring itself must be re-verified against this contract when
  it lands.
- **The mandated `npx` command could not be executed verbatim** (no node on
  this machine); the equivalent bunx invocation is recorded above, including
  the environmental collection failure and the passing run with zod inlined.
  On a node runtime the suite is expected to collect and pass directly.
- **Availability semantics for `invalid_response`**: treated as a model/
  provider-side failure (not a renderer failure) — reported under availability,
  not under renderable-after-validation; its fallback spec (if any) is scored
  under valid-spec rate and renderable-after-validation.
- **v4 holdout prompts are not yet authored**; this contract fixes the metric
  definitions, thresholds, freeze rule, and fallback handling. The v4 manifest,
  runner, and golds are the evaluation-director's deliverable, frozen per the
  freeze rule above before any v4 run.
