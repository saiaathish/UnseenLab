# AI Adaptation Benchmark

Date: 2026-08-04
Branch: `feature/overnight-90-readiness`

## What this measures

The app has a bounded hosted-model adaptation path with a deterministic
offline fallback. This benchmark POSTs 31 curated session fixtures to the
server bridge (`/api/adapt`), scores each response, and reports aggregate
metrics. It is a functional quality check: does the path return
schema-valid answers, does it pick pedagogically acceptable interventions, and
does it classify the learner's conceptual friction into the right taxonomy
bucket.

Nothing sensitive is ever written to the results: the benchmark logs fixture
ids only, sends no API keys, and the results JSON contains only fixture
metadata, response outcome codes, and latency.

## Method

- Each fixture is a complete session input: `preferences`, `predictions`,
  `trials`, `sessionEvidence` — exactly the shape validated by
  `/api/adapt` (see `src/adaptation/llm-schema.ts` and `src/domain/*`).
- Trials are hand-built deterministic records (snapshots, parameters) so the
  growth classification (nonlinear / moderate / declining) is fully under the
  benchmark's control and reproducible.
- The request is `POST {baseUrl}/api/adapt` with a 90s client cap (the server
  itself has a 15s hard timeout per attempt plus a single transient retry).
- Per fixture the script records:
  - `schemaValid` — response structurally satisfies the bounded schema
    (`data` with all required fields) **or** is a `{ fallback: true, reason }`
    response (both are valid contract shapes);
  - `fallbackReason` — the enum code when the server fell back;
  - `acceptableIntervention` — whether the model's `intervention` is in the
    fixture's acceptable set;
  - `unacceptableInterventionChosen` — whether it picked a clearly wrong one;
  - `taxonomyAgreement` — whether `misconception_id` equals the fixture's
    expected id (data responses only);
  - `latencyMs`, `httpStatus`.
- Aggregate metrics: schema-valid rate, acceptable-intervention rate,
  taxonomy agreement, fallback rate, retry rate (share of responses with
  HTTP 429/5xx), p50/p95/mean latency, and fallback-reason counts.

### Modes (no rebuild needed)

- `rules` — the server runs with `LLM_API_KEY=` (empty shell env overrides
  `.env`), forcing the deterministic path. Every response is expected to be
  `{ fallback: true, reason: "no_api_key" }`; the deterministic rules
  themselves run client-side, so intervention/taxonomy scores are **N/A** in
  this mode (nothing to judge). This mode measures the offline path's latency
  and contract stability.
- `llm` — the server runs normally (key from `.env`), calling the real hosted
  model. Intervention and taxonomy scores apply here.

## Fixture list (31)

| # | id | expected misconception | acceptable interventions (subset) |
|---|----|------------------------|-----------------------------------|
| 1 | growth-linear-pred-nonlinear-actual | LINEAR_VS_NONLINEAR_GROWTH | compare_trials, show_graph |
| 2 | growth-nonlinear-pred-supported | LINEAR_VS_NONLINEAR_GROWTH | compare_trials, show_graph |
| 3 | growth-freetext-linear-vs-nonlinear | LINEAR_VS_NONLINEAR_GROWTH | compare_trials, show_graph |
| 4 | growth-pred-faster-actual-declining | LINEAR_VS_NONLINEAR_GROWTH | show_graph, compare_trials |
| 5 | growth-no-prediction-latest | LINEAR_VS_NONLINEAR_GROWTH | ask_prediction_again |
| 6 | absorber-withdrawn-pred-slower | ABSORBER_EFFECT | show_causal_view, compare_trials |
| 7 | absorber-withdrawn-pred-faster | ABSORBER_EFFECT | show_causal_view, compare_trials |
| 8 | absorber-inserted-pred-slower | ABSORBER_EFFECT | show_causal_view, compare_trials |
| 9 | absorber-withdrawn-freetext | ABSORBER_EFFECT | show_causal_view, compare_trials |
| 10 | start-pop-up-final-up | STARTING_POPULATION_EFFECT | compare_trials, show_graph |
| 11 | start-pop-down-final-down | STARTING_POPULATION_EFFECT | compare_trials, show_graph |
| 12 | start-pop-up-final-down | STARTING_POPULATION_EFFECT | compare_trials, show_graph |
| 13 | random-event-same-params-same-shape | RANDOM_EVENT_VS_SYSTEM_PATTERN | compare_trials, show_graph |
| 14 | random-event-same-params-different-shape | RANDOM_EVENT_VS_SYSTEM_PATTERN | compare_trials, show_graph, show_causal_view |
| 15 | replay-same-run-twice | RANDOM_EVENT_VS_SYSTEM_PATTERN | slow_animation, compare_trials |
| 16 | confounded-three-variables | MULTIPLE_VARIABLE_CONFOUNDING | freeze_variables, compare_trials |
| 17 | confounded-two-variables | MULTIPLE_VARIABLE_CONFOUNDING | freeze_variables, compare_trials |
| 18 | confounded-absorber-density-start | MULTIPLE_VARIABLE_CONFOUNDING | freeze_variables |
| 19 | safety-ceiling-hit | LINEAR_VS_NONLINEAR_GROWTH | reduce_density, show_graph, compare_trials |
| 20 | high-confidence-wrong-prediction | LINEAR_VS_NONLINEAR_GROWTH | compare_trials, show_graph |
| 21 | uncertain-vague-prediction | LINEAR_VS_NONLINEAR_GROWTH | compare_trials, show_graph, ask_prediction_again |
| 22 | unchanged-prediction-after-contradiction | LINEAR_VS_NONLINEAR_GROWTH | compare_trials, show_graph |
| 23 | extinction-pred-explosion | LINEAR_VS_NONLINEAR_GROWTH | show_graph, compare_trials |
| 24 | absorber-withdrawn-nonlinear-growth | ABSORBER_EFFECT | show_causal_view, compare_trials |
| 25 | start-pop-1-to-10-nonlinear | STARTING_POPULATION_EFFECT | compare_trials, show_graph |
| 26 | delayed-feedback-manual-contradiction | LINEAR_VS_NONLINEAR_GROWTH | compare_trials, show_graph |
| 27 | random-event-three-seeds-same-shape | RANDOM_EVENT_VS_SYSTEM_PATTERN | compare_trials |
| 28 | two-vars-no-prediction | MULTIPLE_VARIABLE_CONFOUNDING | freeze_variables, ask_prediction_again |
| 29 | moderate-growth-linear-pred | LINEAR_VS_NONLINEAR_GROWTH | compare_trials, show_graph |
| 30 | absorber-inserted-pred-faster | ABSORBER_EFFECT | show_causal_view, compare_trials |
| 31 | graph-opened-still-contradicted | LINEAR_VS_NONLINEAR_GROWTH | compare_trials |

Every fixture also carries an `unacceptableInterventionIds` list (clearly
wrong options such as `reduce_density` when no ceiling was hit, or
`slow_animation` when nothing was replayed); the results record whether any
response picked one. Full fixture definitions (with complete inputs and
notes) live in `scripts/ai-benchmark.mjs`.

## Results

### Rules mode (deterministic path, `LLM_API_KEY=`)

Measured 2026-08-04 06:50 UTC against a production build (`npm run build`)
started as `LLM_API_KEY= npx next start -p 3102`. Results JSON:
`scripts/benchmark-results-rules-2026-08-04T06-50-48-346Z.json`.

| metric | value |
|--------|-------|
| fixtures | 31 |
| schema-valid rate | 100% (31/31) |
| acceptable-intervention rate | N/A (no `data` payloads in this mode) |
| taxonomy agreement | N/A (no `data` payloads in this mode) |
| fallback rate | 100% (all `{ fallback: true, reason: "no_api_key" }`) |
| retry rate (HTTP 429/5xx) | 0% |
| latency p50 / p95 / mean | 3 ms / 8 ms / 4.4 ms (min 1, max 39) |
| HTTP statuses | 200 × 31 |

Every fixture returns the contract-valid fallback shape instantly; the
deterministic rules themselves run client-side and are covered by
`tests/adaptation/deterministic-provider.test.ts`.

### LLM mode (hosted model, key from .env)

Measured 2026-08-04 06:50 UTC against the same build started normally on
`http://localhost:3101` (`npx next start -p 3101`, key from `.env`). Results
JSON: `scripts/benchmark-results-llm-2026-08-04T06-50-54-129Z.json`.

| metric | value |
|--------|-------|
| fixtures | 31 |
| schema-valid rate | 100% (31/31) |
| acceptable-intervention rate | 61.3% (19/31 data responses) |
| unacceptable-intervention rate | 0% (never picked a clearly wrong option) |
| taxonomy agreement | 45.2% (14/31 data responses) |
| fallback rate | 0% (no `provider_error` burst in this window) |
| retry rate (HTTP 429/5xx) | 0% |
| latency p50 / p95 / mean | 2507 ms / 4280 ms / 2699 ms (min 1987, max 4497) |
| HTTP statuses | 200 × 31 |

Server-side telemetry (`/tmp/unseenlab-llm-server.log`): 31 `llm_success`,
0 transient retries, 0 fallbacks — the hosted provider was fully healthy for
this window (the historically observed ~60% `provider_error` bursts did not
occur here, so this run's fallback rate does not exercise the fallback path;
previous observation history still applies).

Observations from the per-fixture rows:

- The model anchors heavily on the growth pattern: it classified
  `LINEAR_VS_NONLINEAR_GROWTH` for most absorber, starting-population,
  random-event, and confounding fixtures, which is why taxonomy agreement
  (45.2%) trails the acceptable-intervention rate.
- Even on taxonomy mismatches the intervention stayed pedagogically sound
  (`compare_trials` / `show_graph` / `show_causal_view`), and no fixture
  produced an unacceptable intervention (`reduce_density` without a ceiling,
  `slow_animation` without a replay, etc.) — the bounded schema plus prompt
  holds.
- The strict fixtures (`growth-no-prediction-latest`, expected
  `ask_prediction_again`, and `graph-opened-still-contradicted`, expected
  `compare_trials` only) were the main acceptable-intervention misses: the
  model proposed a graph/comparison instead.

## Interpretation notes

- Taxonomy agreement and acceptable-intervention scores only apply when the
  server returned a `data` payload (LLM mode). Rules-mode responses are
  `{ fallback: true, reason: "no_api_key" }` by design.
- The hosted provider has historically shown bursts of `provider_error`
  fallbacks (about 60% of requests in past windows). In this particular LLM
  run it was healthy (0% fallback, 0 retries), so the fallback path under
  real provider failure is exercised by unit tests
  (`tests/adaptation/llm-reliability.test.ts`) and by the rules mode, not by
  this window's data.
- Latency in LLM mode is dominated by the hosted model; the server-side retry
  (one attempt on transient failures) adds up to ~30s worst case per request.
