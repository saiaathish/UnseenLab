# DemoSpecV1 — the bounded demonstration contract

Source of truth: `src/demonstrations/spec/demo-spec.ts` (TypeScript types, catalogs,
limits) and `src/demonstrations/validation/demo-spec-schema.ts` (Zod runtime schema).

## What it is

`DemoSpecV1` is the ONLY thing the AI may emit. It is a JSON document describing
what to *build* — never code to execute. A runtime validator
(`validateDemoSpec` / `sanitizeDemoSpec`) then rejects, repairs, or accepts it,
and deterministic renderers construct the experience.

```
Learner asks → intent → AI emits bounded JSON → validator → renderer
```

## Top-level shape

```ts
{
  schemaVersion: 1,
  id, generationId, userQuery, normalizedConcept, title, learningObjective,
  trust:   { level, label, limitations, engineId?, engineVersion? },
  renderer:{ kind: "lumina_2d" | "primitive_3d" | "hybrid",
             fallbackKind: "accessible_diagram" | "timeline" | "data_table",
             preferredAspectRatio, background },
  simulation?: { engineId, engineVersion, seed, parameters[], readouts[] },
  scene3d?:   { objects[], relationships[], animations[] },
  timeline?:  { events[] },
  controls: [], prediction: {}, observationPrompts: [], representations: [],
  adaptationContext: { allowed, oneVariableMode },
  provenance: { source: "curated_engine" | "template_composition" | "model_generated_spec",
                templateIds, generatedAt, model? },
  limits: { maxObjects, maxParticles, maxTimelineEvents, maxControls }
}
```

## Trust levels (exactly one per spec)

| Level | Label | Rules |
| --- | --- | --- |
| 1 | Verified simulation | Curated engine only (`VERIFIED_ENGINE_IDS`); parameters/readouts must match `ENGINE_CATALOG`; seeded, deterministic replay; `correctIndex` allowed (curated only). |
| 2 | Conceptual demonstration | No `simulation`, no `correctIndex`, ≥ 1 visible limitation, no numerical claims. |
| 3 | Explanatory animation | No `simulation`, must have `timeline`, no readout-like controls, no graded prediction. |

**Prediction truth is curated-only.** `provenance.source === "model_generated_spec"`
specs can never carry `correctIndex` (rejected by the science policy with
`science_policy:model_graded_prediction`, and `predictionTruth` in the demo store
refuses to grade them even if one slipped through).

## Approved catalogs (the model selects from these ONLY)

- 18 primitives: sphere, box, plane, ring, arrow, line, trail, label,
  particle_field, vector_field, orbit_path, wave_surface, graph_surface,
  process_node, process_edge, energy_packet, camera_marker, group
- 12 relationships: attracts, repels, orbits, collides_with, flows_to,
  transfers_to, oscillates_with, causes, inhibits, activates, contains,
  transforms_into
- 12 animation operators: rotate, orbit, translate, oscillate, pulse,
  follow_path, emit, fade, reveal, scale, change_color, update_vector
- 8 control types: slider, toggle, segmented_control, button, drag_handle,
  play_pause, speed_control, reset
- 10 verified engines: pendulum, orbits, projectile, gas, charges, waves,
  reaction_diffusion, cellular_automaton, rc_circuit, nuclear_chain_reaction

## Hard limits (validator-enforced, never exceeded)

Objects 80 · particles 1500 desktop / 500 mobile · timeline events 30 ·
controls 6 · labels 25 · relationships 100 · trail points 300 · group depth 4 ·
spec size 256 KB · generation 12 s · explanation block 800 chars ·
prediction options 4 · query 500 chars.

## Validation outcomes

- `valid` — accepted as-is.
- `repaired` — unsafe *numeric* values clamped to bounds (meaning preserved);
  reason codes attached (e.g. `repaired:param_value`).
- `rejected` — structural overages or scientific-meaning changes; safe reason
  codes only, never raw attacker text.
- `fallback` — input was not JSON at all.

Reason codes are slugged (`unknown_key:<safe-slug>`): attacker-controlled key
names can never be echoed into logs.

## Rejected at schema level

`eval(`, `new Function`, `onclick/onerror/onload/onmouseover=`, `<script`,
`srcdoc=`, `dangerouslySetInnerHTML` (case/whitespace-insensitive, word-boundary
safe), `javascript:`/`data:`/`http(s)://`/`www.`/`//` URLs, shader fields,
unknown keys anywhere, prototype-pollution keys (`__proto__`, `constructor`,
`prototype`), nesting deeper than 8.

## Versioning

Breaking changes bump `schemaVersion`; a new interface supersedes rather than
mutates `DemoSpecV1`.
