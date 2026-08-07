# Sanitizer Repair Policy (canonical allowlist)

Applies to the repair-aware validation pipeline in
`src/demonstrations/validation/sanitize.ts`
(`sanitizeDemoSpec` / `validateDemoSpec`), with cross-checks against
`src/demonstrations/validation/science-policy.ts` and the strict schema in
`src/demonstrations/validation/demo-spec-schema.ts`.

## Default behavior

> **Unknown repair class → REJECT.**

The repair walk is a closed, enumerated set (see allowlist below). Any
malformation that does not match one of those branches is *rejected* — by the
strict Zod schema (unknown keys, enum membership, finiteness, range bounds,
string caps) or by the science policy (trust-level rules, content safety,
curated-only prediction truth). The sanitizer never invents values for trust,
engine identity/version, seed, parameter min/max/step, readouts, prediction
options/prompt/`correctIndex`, observation prompts, provenance, relationship
operators, or control target bindings.

## Invariants

1. **No fabricated truth.** The sanitizer never adds a `correctIndex`, never
   promotes a trust level, and never asserts an engine identity. A
   model-generated spec that carries `correctIndex` is REJECTED
   (`science_policy:model_graded_prediction`) — it is never stripped or
   repaired. (This is stronger than a "strip" policy: curated-only truth is
   enforced by rejection, not repair.)
2. **No engine substitution.** `simulation.engineId` / `engineVersion` are
   never rewritten. A changed engine id with the old engine's parameters or
   readouts is REJECTED (`incompatible_engine`); a trust block that disagrees
   with the simulation block is REJECTED (`inconsistent_engine`); an unknown
   engine id is REJECTED (`invalid_enum`).
3. **No trust escalation.** `trust.level` is never rewritten. A spec claiming
   `verified_simulation` without a simulation block is REJECTED
   (`science_policy:level1_simulation`); Level 2/3 claims of verified status
   are REJECTED the same way.
4. **No scientific-text mutation.** Every string in the spec passes through
   the sanitizer byte-for-byte except three display-metadata drops (empty unit
   string, non-numeric `size`, `null` optional object fields). Equations,
   constants, prompts, labels, limitations, and provenance text are never
   rewritten, reformatted, or "fixed".
5. **Repairs are bounded.** Every numeric repair snaps a value to the model's
   *own declared domain* or to the hard `SPEC_LIMITS` caps. The sanitizer
   never invents a value outside the domain the spec itself declared.
6. **Safe reason codes only.** Repair and rejection reasons are slugs; the
   offending content is never echoed.

## REPAIR ALLOWLIST

Every entry below is representational: it carries no scientific truth (no
trust, no engine identity, no physics constants, no graded answer, no causal
claim). Repairs change only display metadata, tuning numbers, layout, or
resource promises.

| Field(s) | Repair class | Reason code | What happens | Example |
| --- | --- | --- | --- | --- |
| `scene3d` = `null` | structural absence | `repaired:null_scene3d` | optional key stripped; semantically identical to absent (2D engine canonical) | `"scene3d": null` |
| `timeline` = `null` | structural absence | `repaired:null_timeline` | optional key stripped; a Level 3 spec still REJECTED by science policy for missing its timeline | `"timeline": null` |
| `size` non-numeric | visual hint | `repaired:non_numeric_size` | dropped; renderer default applies (size is never physics) | `"size": "medium"` |
| `unit` = `""` (empty string only) | display metadata | `repaired:empty_unit` | empty display unit dropped; **non-empty units are never touched** | `"unit": ""` |
| `simulation.parameters[].value` outside the *model's own declared* `[min, max]` | tuning number | `repaired:param_value` | snapped to the nearer declared bound; `min`/`max`/`step` are never altered | `{min:0.1,max:5,value:150}` → `value:5` |
| `controls[].defaultValue` outside the control's own `[min, max]` | learner-facing UI initial state | `repaired:control_default` | clamped into the control's declared range; target binding untouched | `{min:0,max:5,defaultValue:99}` → `5` |
| `particleCount` above the declared/cap budget | render resource promise | `repaired:particle_count` | clamped to `min(declaredMaxParticles, 1500)` | `particleCount: 5000` → `1500` |
| `trailPoints` above cap | render resource | `repaired:trail_points` | clamped to `SPEC_LIMITS.maxTrailPoints` | `trailPoints: 9000` → `300` |
| animation `speed`, `amplitude`, `delayMs` | visual tuning | `repaired:speed` / `repaired:amplitude` / `repaired:delay_ms` | clamped to the schema's own bounds | `speed: 10000` → `100` |
| timeline event `startMs`, `durationMs` | presentation timing | `repaired:start_ms` / `repaired:duration_ms` | clamped to the schema's own bounds | `startMs: 1e12` → `3_600_000` |
| renderer `preferredAspectRatio` | layout | `repaired:preferred_aspect_ratio` | clamped to `[0.1, 10]` | `preferredAspectRatio: 0.01` → `0.1` |
| object position `x` / `y` / `z` | layout | `repaired:x` / `repaired:y` / `repaired:z` | clamped to the global numeric envelope | `x: 1e12` → `1_000_000_000` |
| `limits.maxObjects` / `maxParticles` / `maxTimelineEvents` / `maxControls` over-declared | resource promise overage | `repaired:maxObjects` / `repaired:maxParticles` / `repaired:maxTimelineEvents` / `repaired:maxControls` | clamped to the hard `SPEC_LIMITS` cap | `maxControls: 999` → `6` |
| same `limits.*` under-declared (actual usage exceeds the promise) | resource promise raised to reality | `repaired:maxObjects` / `repaired:maxParticles` / `repaired:maxTimelineEvents` / `repaired:maxControls` | raised to actual object/particle/event/control usage, bounded by the hard cap | `maxObjects: 1` with 2 objects → `2` |

Notes:

- `particleCount`, `trailPoints`, `size`, `speed`, `amplitude`, `delayMs`,
  `startMs`, `durationMs`, `x/y/z`, and `preferredAspectRatio` are clamped to
  exactly the bounds the strict schema enforces — the repair converts a
  would-be schema rejection into a bounded, meaning-preserving repair.
- Engine parameter `min`, `max`, and `step` are never clamped, raised, or
  rewritten; only an out-of-domain `value` is snapped to the model's own
  declared domain. The domain itself is the model's scientific contract.

## FORBIDDEN: scientific fields (never repaired)

These fields carry scientific meaning. The sanitizer never alters them:
valid values pass through verbatim; invalid values are REJECTED.

| Field(s) | Why forbidden | Enforcement |
| --- | --- | --- |
| `trust.level` | trust classification is the spec's truth claim; promotion would be fabricated trust | no repair path; verified claim without simulation → `science_policy:level1_simulation` |
| `trust.engineId` / `engineVersion` | never added or rewritten | mismatch vs `simulation` → `inconsistent_engine` |
| `simulation.engineId` / `engineVersion` | engine identity is curated in code, never model-substituted | unknown id → `invalid_enum`; foreign param/readout keys → `incompatible_engine` |
| `simulation.seed` | reproducibility state | negative/non-integer → rejected (`range_exceeded:seed` / `invalid_type`) |
| parameter `min` / `max` / `step` | the declared scientific domain | `min > max` or out-of-domain `value` → `unsafe_value:param` |
| parameter `unit` (non-empty) | physical dimension label | never rewritten; mutations pass through untouched (no repair, no "fix") |
| readout `key` / `label` / `format` | what numbers are shown and how | unknown format → `invalid_enum`; foreign key → `incompatible_engine` |
| control `target.kind` / `target.ref` | binds the learner control to a specific engine/animation/scene state | unresolvable ref → `invalid_control_target`; retargeting is never repaired |
| prediction `prompt` / `options` | scientific question content | never edited; length/enum bounds enforced |
| prediction `correctIndex` | curated-only answer truth | model-generated spec with `correctIndex` → `science_policy:model_graded_prediction`; Level 2/3 → `level2_prediction` / `level3_prediction` |
| observation prompts | learner-facing scientific text | never edited; code/URL markers → `unsafe_value:code` / `unsafe_value:url` |
| provenance `source` / `templateIds` / `generatedAt` / `model` | attribution truth | unknown source → `invalid_enum` |
| relationship `type` / `from` / `to` | causal claims between objects | unknown operator → `invalid_enum`; valid operators pass through verbatim |
| timeline event `title` / `description`, `title`, `learningObjective`, `normalizedConcept`, `trust.limitations` | scientific narrative text | never rewritten; code/URL markers → `unsafe_value:*`; operational-danger language → `science_policy:operational_danger` |
| renderer `kind` / `fallbackKind` / `background` | platform contract | unknown values → `invalid_enum` |
| `schemaVersion` / `id` / `generationId` / `userQuery` | structural identity | never rewritten; strict schema enforced |

## Boundary notes (judgment calls, documented for ratification)

- **`repaired:param_value` is allowlisted** even though parameter `value` is a
  scientific-adjacent field. Rationale: the clamp fires *only* when the value
  lies outside the model's own declared `[min, max]` (a self-inconsistent
  spec) and snaps the value to that declared domain — it never invents a
  value beyond the model's own contract, and it never touches `min`/`max`/
  `step`/`unit`. The existing validation suite ("safe numeric repair") and the
  generation pipeline (`generation/model/pipeline.test.ts`, one-call-no-retry
  flow) canonize this behavior. The domain is sacred; the value is tuning.
- **`repaired:empty_unit` is allowlisted** because it fires only on the empty
  string, which carries zero scientific content (display metadata absence).
  Non-empty units are never touched.
- **`correctIndex` is never stripped.** The context-level description "strip"
  is not what the code does: model-generated specs carrying `correctIndex`
  are REJECTED by the science policy, which is strictly stronger than repair.

## Ratification (Executive Director, 2026-08-05)

Two allowlisted classes are ratified as REPAIRABLE, with rationale, pending
independent review (Agent 14):

1. `repaired:param_value` — fires ONLY when the model declares a parameter
   value outside its OWN declared [min, max] (self-inconsistent spec). The
   clamp snaps to the model's declared bound; it never invents physics beyond
   the spec's own range. Canonized by the existing validation suite ("safe
   numeric repair") and `generation/model/pipeline.test.ts:283`. A
   scientifically meaningful value inside the declared range passes through
   verbatim.
2. `repaired:empty_unit` — removes ONLY the empty string (display-only); any
   non-empty unit passes through verbatim. The program's own repairable
   inventory lists "empty visual unit" as representational.

Neither class can alter trust level, engine identity, parameter
min/max/step, readouts, prediction truth, or causality.
