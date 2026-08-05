# Generation pipeline

`POST /api/demonstrations/generate` · `GET /api/demonstrations/health`

## Stages

1. **Normalize** — trim, 500-char cap, script detection, harmful-content and
   prompt-injection filters (`generation/intent/normalize.ts`).
2. **Interpret** — deterministic intent: verified engine / conceptual template /
   explanatory timeline / clarify / unsafe / unsupported. Ambiguous requests
   get ONE clarifying question; nothing is guessed silently
   (`generation/intent/route.ts`).
3. **Route** — word-aware scoring with specificity tie-break (longer keyword
   wins; "capacitor charge" → rc_circuit, "pendulum on the moon" → pendulum).
4. **Model round** — bounded system prompt (schema + catalogs + limits +
   trust rules + safety; no learner text beyond the normalized query), strict
   JSON only, 3k token budget, hard timeout, one transient retry (429/502/503/
   504/network/timeout), never retry invalid output.
5. **First-pass gate** — strict zod schema on raw model JSON.
6. **Full validation + science policy** — `sanitizeDemoSpec` (repair clamp or
   reject) + `sciencePolicy` (trust rules, curated-only prediction truth,
   operational-danger text).
7. **Intent cross-check** — `specMatchesIntent`: the model can never escalate
   trust level beyond the routed intent or leave the routed engine family.
8. **Repair retry** — at most ONE retry with a safe repair directive.
9. **Fallback** — any failure → deterministic offline generation, honestly
   labeled `source: "offline"` with a safe reason; never presented as model
   output.

## Reliability

- Cross-request circuit breaker: 3 consecutive provider failures open for 30 s;
  half-open probe; success resets. Reported by the health route.
- In-flight dedup: identical (query, prefs) share one promise — duplicate
  submissions cannot burn two model calls.
- Per-IP rate limit (30 / 5 min), 64 KB body cap, 413/429/400 error mapping.
- Telemetry: one safe line per attempt (`outcome, source, reason, model,
  elapsedMs`) — never learner text, never raw model output.
- The existing `LLM_API_KEY` / `LLM_MODEL` / `LLM_API_BASE_URL` env config is
  reused; missing key → offline path with `no_api_key`.

## Offline path (no model, no network)

`generateOfflineDemo(query, prefs)` → spec | clarify | unsafe | unsupported.
Word-aware router (18+ routes), curated spec builders for all 10 engines
(correct predictions asserted against engine physics in tests), 10 conceptual
templates, 4 explanatory timelines (mitosis, DNA transcription, water cycle,
immune response). Deterministic; ~0.04 ms p50 offline generation.

## Persistence

`PUT/GET/DELETE /api/demonstrations(/:id)` — owner-scoped Mongo
`generated_demonstrations` (unique `{firebaseUid, demonstrationId}`), idempotent
upserts (`mutation_id`), optimistic concurrency (`expected_revision`),
server-side `validateDemoSpec` gate, 256 KB cap. Guests stay local
(localStorage) until they explicitly save to their account.
