# Trust Wiring — ONE trust function across every path (Round 2, judge-upgrade)

**Author:** canonical-state-architect · **Program:** UNSEENLAB PHASE 1–2 CLOSURE
**Worktree:** `fix/generative-trust-controls` @ c3870ef · **No git operations performed.**

## 1. The single function

```
resolveTrustIntent(normalizedRequest, verifiedEngineMatch): TrustLevel | "clarify"
```

implemented in `src/demonstrations/generation/intent/route.ts` as a **pure
adapter over the evaluation-director's decision table**
(`src/demonstrations/generation/trust/decision-table.ts` →
`resolveTrustLevel`), which remains the **single DECISION source**. No other
module calls `resolveTrustLevel` directly; there is exactly ONE trust function
and exactly ONE precedence implementation (the table's four rules:
verified engine → Level 3 markers → Level 2 markers → clarify).

The route kind no longer decides trust. `TRUST_BY_KIND` survives only as the
**documented sanity fallback** for a markerless request that still routed to a
curated artifact (e.g. `show me mitosis` — no marker class, no engine → the
table says `clarify`; the curated timeline's level stands). The fallback is
pinned by tests; it is the ONLY case where candidate trust ≠ the raw table
outcome. `clarify` / `unsupported` / `unsafe` envelopes are byte-for-byte
unchanged.

### Call-site table

| Call site | Where | What it consumes |
| --- | --- | --- |
| Offline routing | `route.ts` `interpret()` → `buildIntentSpec` | `candidate_trust_level` = `resolveTrustIntent(req, bestEngine)` (+ documented fallback) — the value every downstream consumer reads |
| Hosted prompt context | `pipeline.ts` → `buildGenerationPrompt(..., intent.candidate_trust_level)` (`prompt.ts` `trustRulesSection`, new `resolvedTrust` param) | The prompt embeds the deterministic decision (`DETERMINISTIC TRUST DECISION — …`) so the model never re-derives the policy |
| Candidate trust | `IntentSpec.candidate_trust_level` (`intent/types.ts`) | The table's outcome via `resolveTrustIntent` |
| Model-output cross-check | `pipeline.ts` `specMatchesIntent(spec, intent)` (now exported) | Compares the model spec's `trust.level` against the candidate (the table's decision); the model may never claim more trust, and verified candidates pin the engine |
| Benchmark gold helper | `tests/demonstrations/benchmark/benchmark.test.ts` (new conformance block) | Every gold row's offline spec trust and hand-authored `goldTrust` are checked against `resolveTrustIntent` / the sanity fallback / the documented exclusion marks |
| Clarification behavior | `route.ts` `interpret()` ambiguous branch + `resolveTrustIntent` | The table's `clarify` == the router's `clarify` (pinned; the offline generator asks the SAME question — one ambiguity logic) |

### Single-function flow

```
raw query ──normalize──▶ NormalizedRequest ──▶ interpret()
                                                 ├─ unsafe / unsupported / clarify (unchanged envelopes)
                                                 └─ routeQuery() ──▶ resolveTrustIntent(req, engineMatch)
                                                                        └─▶ decision-table resolveTrustLevel
                                                                              (the ONLY precedence code)
                                                                        └─▶ candidate_trust_level
                                                                              ├─▶ offline generator (specs)
                                                                              ├─▶ hosted prompt (resolvedTrust)
                                                                              └─▶ specMatchesIntent (cross-check)
                                                                                    └─ trust_mismatch ─▶ offline fallback
```

## 2. Cross-site consistency tests

`tests/demonstrations/trust/trust-wiring.test.ts` (new, 41 tests) proves
identical classification across all call sites for the **9 decision-table
cases + 6 more (incl. engine queries)**:

- `candidate_trust_level === resolveTrustIntent === cross-check outcome` per
  corpus row (spec at the candidate level is accepted; a more-trusted spec is
  rejected; verified candidates additionally pin the engine);
- `resolveTrustIntent` delegation == the table (`resolveTrustLevel`) — no
  second precedence anywhere;
- trust-mismatch end-to-end, clarify equality, engine-only Level 1, offline
  divergence marking, and the `rankFocusKeys` wiring/invariants.

Run tail (this worktree, vitest via Bun with a /tmp-only zod-inline config;
CI runs Node 22 with the repo's own `vitest.config.ts`):

```text
Test Files  10 passed (10)   # trust/ + coupling/ + generation/offline/ + benchmark/
Tests       172 passed (172) # required suites (task 4 command)
Test Files  72 passed | 2 failed (74)   # full suite; the 2 failing FILES are
Tests       1263 passed (1263)          # Bun-only mongodb/bson loader failures
                                        # (node:v8 isBuildingSnapshot), untouched
                                        # by this work and green under Node 22 CI
```

## 3. Model-output cross-check

`specMatchesIntent` (exported from `pipeline.ts`) enforces the table on the
model's output: a model spec whose trust ≠ the table's decision for the query
→ **`trust_mismatch`** → deterministic offline fallback (`offlineSpec(query,
prefs, "trust_mismatch")`) — the wrong-level model spec is **never**
surfaced. Verified candidates additionally reject a spec on a different
engine. Pinned end-to-end (mocked fetch):

- Level 2 model spec for a table-Level-3 query (`walk me through the predator
  prey cycle over time`) → offline, `reason: "trust_mismatch"`, and the
  emitted artifact equals `generateOfflineDemo(query)` exactly;
- Level 1 pendulum spec answering an orbits query → offline, `trust_mismatch`,
  offline spec engineId `orbits`;
- a spec AT the table's level → accepted (source `model`, one fetch).

The pre-existing red-team escalation pin (`prompt-injection.test.ts`, Level 1
spec for a Level 3 topic) remains green unchanged.

## 4. Offline divergences (documented, never silent)

Where the table says **Level 3** but only a **Level 2 curated template**
exists, the offline path emits the curated template as-is (NOT a retarget to a
fake Level 3), and the row is **marked** via
`TRUST_FALLBACK_EXCLUSION_ROWS` / `markTrustFallbackExclusion(query)`
(`route.ts`). Fallback-path outcomes for these rows are excluded from trust
accuracy and reported separately — the same class as the frozen holdout
manifests' `META.hostedPathFallbackExclusions`.

| Row | Query | Table | Offline (curated artifact) |
| --- | --- | --- | --- |
| `decision-predator-cycle` (holdout) | walk me through the predator prey cycle over time | L3 | L2 `particle_population` |
| `decision-photosynthesis-sequence` (holdout) | walk through the steps of photosynthesis in order | L3 | L2 `energy_transfer` |
| `benchmark-es3/4/5` | carbon / rock / nitrogen cycle | L3 | L2 `cyclic_process` |
| `benchmark-p5` | show me a production process flow | L3 | L2 `process_flow` |
| `benchmark-p6` | show me before and after changes in a process | L3 | L2 `before_after_comparison` |

Where a curated artifact exists at the table's level, the offline spec carries
it: mitosis stages → L3 timeline; photosynthesis transfer → L2 template;
engine queries → L1 engines; `show me mitosis` → L3 timeline (sanity
fallback). Pinned by tests (e) and by the benchmark conformance block.

## 5. Focus-key ranking implemented

`rankFocusKeys(engineId, normalizedQuery, modelFocusKeys, opts?)` in
`src/demonstrations/generation/controls/materialize.ts`, per the
evaluation-director's frozen contract (`docs/focus-ranking.md`, manifest
`tests/demonstrations/trust/focus-ranking.test.ts` — **24/24 green**),
consuming `src/demonstrations/generation/controls/relationships.ts`:

1. **explicit learner variable** — `FOCUS_VARIABLE_WORDS` phrases in the
   query, filtered to the engine's `parameterKeys` (declaration order);
2. **catalog relationship match** — every `LEARNING_RELATIONSHIPS[engineId]`
   entry (ascending priority) whose any phrase is contained in the query;
3. **model-suggested valid keys** — `modelFocusKeys` ∩ `parameterKeys`, model
   order, deduped;
4. **curated default** — top-priority `ENGINE_CONTROL_CATALOG` entry when the
   result is empty.

Tiers 1-2 always beat the model; `opts.oneVariableMode` → the single top
ranked key. `materializeControls` consumes the ranking (the ranking query is
the pipeline's canonical normalized query, `MaterializeOptions.query` — never
model-authored `userQuery`), keeps its own count guarantees on top (≥ 1
always, ≥ 2 on comparison intent, top-up to 2 on the curated-default tier),
and the pipeline threads the query through.

## 6. Test adaptations (documented, never weakened)

- `tests/demonstrations/benchmark/benchmark.test.ts` — **added** a
  trust-wiring conformance block (2 assertions) proving every spec row and
  every hand-authored `goldTrust` agrees with the one trust function or is a
  marked fallback exclusion. The measured scorecard is unchanged: trust
  accuracy 100% (68/68), route accuracy 100% (93/93), schema-valid 100% —
  the exclusion rows keep their offline (L2) goldTrust because that is what
  the offline path legitimately emits.
- No other existing test needed changes: candidate trust changed only where
  the table legitimately overrides the old kind-trust (the exclusion rows
  above), and every existing assertion on emitted specs, envelopes, and
  routing held verbatim (all pre-existing suites pass: coupling,
  generation/offline, redteam, ui, showcases, engine, state).

## 7. BLOCKER RESOLVED

> **The runtime does not execute the trust policy.** Previously the decision
> table existed but `TRUST_BY_KIND` still computed candidate trust, the
> hosted prompt embedded its own rules, and nothing derived trust from the
> table at runtime.

Now every runtime path — offline routing, candidate trust, hosted prompt
context, model-output cross-check, benchmark gold helper, and clarification —
derives from `resolveTrustIntent` → the decision table. The only duplicate
precedence was deleted (kind-based trust is demoted to the documented sanity
fallback). The v3-observed deviations (case-6 model downgrade to L3,
model-selected focus keys ignoring the learner) are closed deterministically:
the prompt now carries the resolved level, and the focus-key ranking puts
learner signals above the model.

## 8. UNKNOWN

- `docs/focus-ranking.md` and `src/.../controls/relationships.ts` landed in
  this worktree **during** the round (evaluation-director, concurrent); this
  doc and `rankFocusKeys` are aligned to the frozen contract. If the ED's
  data changes, the frozen manifest fails loudly.
- The two failing full-suite FILES (`dashboard-page.test.tsx`,
  `database-security-contract.test.ts`) are Bun-runtime mongodb/bson loader
  failures (`node:v8 isBuildingSnapshot`), present before this round and
  unrelated to the diff; they run under Node 22 CI.
- `FOCUS_VARIABLE_WORDS` is a test-pinned mirror of `route.ts`
  `VARIABLE_WORDS` (route.ts does not export it) — ED's own note; a future
  route.ts edit fails the pin loudly.
- Local verification used a /tmp-only vitest config inlining `zod` (Bun
  interop workaround); the repo's `vitest.config.ts` is unchanged.
