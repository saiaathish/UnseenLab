# Demo benchmark — measured scorecard

Suite: `tests/demonstrations/benchmark/benchmark.test.ts` (97 gold-scored
prompts; run offline, no model calls).

## Measured (Phase 9, 2026-08-04)

| Metric | Result | Target | Gate |
| --- | --- | --- | --- |
| Route accuracy | **100.0%** (93/93) | — | reported |
| Trust-level accuracy | **100.0%** (68/68) | ≥ 90% | reported |
| Schema-valid rate | **100.0%** (68/68) | ≥ 98% | reported |
| Render success (scene3d) | **100.0%** (16/16) | 100% | HARD GATE |
| Accessible-equivalent coverage | **100.0%** (68/68) | 100% | HARD GATE |
| Unsafe-output rejection | **100.0%** (8/8) | 100% | HARD GATE |
| Control relevance (acceptance set) | **100.0%** (8/8) | ≥ 85% | reported |
| Model-failure fallback | **100.0%** | 100% | HARD GATE |
| Offline generation latency | p50 0.04 ms / p95 0.17 ms | — | reported |

Model-path latency (p50/p95 of the hosted LLM) is **UNVERIFIED in CI** — it
requires a live key and is a manual workflow; the offline fallback latency above
bounds the worst case.

## Prompt coverage (97)

Direct supported (engines/templates/timelines), ambiguous (clarify), unsafe
(8 — all rejected), nonsense, excessively long (4), prompt injection,
requests for arbitrary code, requests for unsupported 3D assets, repeated
generation, model failure (simulated). Domains: mechanics, gravity,
electricity, waves, thermodynamics, chemistry, biology, earth science,
networks, process systems.

## Gates that failed at audit and were fixed

- Schema-valid 94.0% → 100%: `userQuery` schema cap aligned to the intent
  500-char cap; offline generator now normalizes the query once.
- Route 97.8% → 100%: harmful-phrase filter extended; gold table reflects the
  safer outcomes.
- Trust escalation (P1): model specs can no longer upgrade trust level or carry
  `correctIndex`.
