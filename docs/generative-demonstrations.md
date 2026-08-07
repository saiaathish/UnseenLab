# Generative Demonstration Engine — Architecture

Status: Phase 0 contract, `feature/generative-demonstration-engine` (2026-08-04).

## Product shape

```
Learner asks for a concept
→ AI interprets the learning intent (or asks one clarifying question)
→ AI selects a verified engine / conceptual template / explanatory timeline
→ AI emits bounded JSON (DemoSpecV1)
→ validator sanitizes and classifies the output
→ deterministic renderer constructs the demonstration
→ learner predicts → manipulates → observes → adapts → replays
```

**The model is not the renderer. The model is not the simulator. The model is
never permitted to write executable code.**

## Feature flag

`NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` (default `0`). Flag `0` preserves the
current product bit-for-bit; flag `1` enables the ask-to-demo experience.
Rollback = set flag to `0`. The Nuclear Chain Reaction lab is reachable in
both states. See `src/demonstrations/feature-flag.ts`.

## 3D technology decision (Chief Architect gate)

**Direct Three.js (no React Three Fiber).**

- `three@0.185.1` is already a production dependency; R3F is not installed.
- The renderer surface is a single canvas per demo — one imperative lifecycle
  (renderer owns its own rAF loop, resize observer, pointer handling) is
  simpler to test and dispose than a reconciler-driven scene.
- Bundle growth stays bounded to the three.js core we already ship.
- R3F would only be re-evaluated if a second 3D surface proves necessary and
  direct Three.js lifecycle code becomes a maintenance liability.

## Module map (ownership frozen at Phase 0)

| Path | Owner | Responsibility |
| --- | --- | --- |
| `src/demonstrations/spec/**` | ED (integration) | `DemoSpecV1`, limits, catalogs (written at Phase 0) |
| `src/demonstrations/validation/**` | Agent 09 | Zod schema, sanitizer, trust rules, engine compatibility |
| `src/demonstrations/renderers/lumina-2d/**` | Agent 10 | Deterministic 2D engines, runner, registry, seeds |
| `src/demonstrations/renderers/primitive-3d/**` | Agent 11 | Approved-primitive Three.js renderer, lifecycle |
| `src/demonstrations/showcases/**` | Agent 12 | Orbits / electric fields / wave interference families |
| `src/demonstrations/generation/intent/**` | Agent 14 | Normalization, ambiguity, clarification |
| `src/demonstrations/generation/offline/**` | Agent 14 | Word-aware deterministic router + offline generator |
| `src/demonstrations/generation/model/**` | Agent 15 | Bounded model prompt, strict JSON, retry, breaker |
| `src/app/api/demonstrations/**` | Agent 15 / 19 | generate (15), save/list/get/delete (19) |
| `src/components/demonstrations/**` | Agents 16/17 | Ask flow, shell, prediction, controls, adaptation |
| `src/lib/mongo/` (demonstrations repo) | Agent 19 | `generated_demonstrations` collection |
| Homepage ask surface | Agent 16 | Flag-gated entry point |
| `docs/`, `validation-pack/` | ED + Agents 08/20 | Provenance, port map, audits |

Forbidden edits for every agent: `package.json`, `package-lock.json`,
`.env*`, `next.config.ts`, `src/lib/firebase/**`, `src/adaptation/**`,
`src/simulation/**`, `src/domain/**` (read-only references).

## API contract (frozen)

`POST /api/demonstrations/generate` — body `{ query, preferences? }`, returns
`{ data: { spec, source, generatedAt } }` or `{ fallback: true, reason }`
or `{ error, status }`. Unauthenticated guests allowed; per-IP rate limit;
body cap 64 KB; safe logs only.

`GET|PUT|DELETE /api/demonstrations` — owner-scoped Mongo CRUD, `user_id`
from verified session cookie only, idempotent upsert (`mutation_id`),
optimistic concurrency (`expected_revision`), 11000 → 409.

## Trust model

- Level 1 "Verified simulation" — curated engine code only; no model-authored
  equations/constants/integration; deterministic seeded replay.
- Level 2 "Conceptual demonstration" — approved primitives; no quantitative
  claims; visible limitations.
- Level 3 "Explanatory animation" — narrative timeline; no readouts.

The AI can never promote Level 2/3 to Level 1.

## Renderer limits (validator-enforced)

Objects 80 · particles 1500/500 (desktop/mobile) · timeline events 30 ·
controls 6 · labels 25 · relationships 100 · trail points 300 · group depth 4 ·
spec 256 KB · generation 12 s · explanation block 800 chars.

## Verified engine families (curated)

`pendulum · orbits · projectile · gas · charges · waves ·
reaction_diffusion · cellular_automaton · rc_circuit · nuclear_chain_reaction`
(see `ENGINE_CATALOG` in `src/demonstrations/spec/demo-spec.ts`).

## Rejected architectures (do not reintroduce)

Arbitrary generated React/JS/shaders · model-generated HTML · untrusted asset
URLs · browser-stored provider keys · Python FastAPI · Render Workflow ·
Supabase/Firestore · second database · client-side API keys.
