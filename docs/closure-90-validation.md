# Closure 90 — Validation Boundary Report (Agent: validation-boundary-engineer)

Date: 2026-08-05. Scope: re-verification of the sanitizer boundary
(`src/demonstrations/validation/sanitize.ts`, `science-policy.ts`,
`demo-spec-schema.ts`) against the program's Phase-4 repairable list and
`docs/sanitizer-repair-policy.md`; enforceability review of
`docs/trust-policy.md` (canonical trust policy, draft for red-team review).
No git operations performed. No code or test changes (no real boundary
violation exists).

---

## VALIDATION BOUNDARY

### Phase-4 allowed repairs present (all confirmed against code + tests)

| Phase-4 class | Behavior in sanitizer | Reason code | Evidence |
| --- | --- | --- | --- |
| Optional `scene3d`/`timeline` = null → absent | key stripped (semantically identical to absent; Level 3 with null timeline still rejected by science policy) | `repaired:null_scene3d` / `repaired:null_timeline` | `sanitize.ts` repairTree null branch; tests "strips scene3d: null", "strips timeline: null", "still rejects a Level 3 spec whose timeline was null" |
| Empty cosmetic unit → absent | empty-string `unit` dropped; non-empty units pass verbatim | `repaired:empty_unit` | `sanitize.ts` unit branch; test "still drops an empty unit string" |
| Invalid cosmetic visual size → default | non-numeric `size` dropped (renderer default applies); numeric out-of-range `size` clamped to `[0.001, 1e9]` | `repaired:non_numeric_size` / `repaired:size` | `sanitize.ts` size branches + FIELD_CLAMP_MIN/MAX; tests "drops a non-numeric size"; scratch check confirmed `repaired:size` clamp to 0.001 |
| Resource budget correction | over-declared limits clamped to hard `SPEC_LIMITS` caps; under-declared limits raised to actual usage; `particleCount` clamped to `min(declaredMaxParticles, 1500)` | `repaired:maxObjects` / `repaired:maxParticles` / `repaired:maxTimelineEvents` / `repaired:maxControls` / `repaired:particle_count` / `repaired:trail_points` | `sanitize.ts` clampField + `raiseDeclaredLimits`; tests "repairs declared limits that exceed the hard caps", "raises declared limits that lie below actual counts", "clamps particles to a smaller declared mobile cap", etc. |
| Safe text-length truncation | **NOT implemented — over-long strings are REJECTED, never truncated.** Reason code `text_exceeded:<field>` (Zod `too_big`, origin string → `describeIssue`). Program's list says "may include" — current reject is acceptable, no change made | `text_exceeded:label` / `text_exceeded:title` / `text_exceeded:description` / `text_exceeded:unit` etc. | `demo-spec-schema.ts` string caps (120 label / 120 title / 800 explanation / 16 unit / 500 query / 400 objective / 240 limitation / 240 option); tests "rejects a unit string beyond the schema bound"; scratch check confirmed label + timeline-description rejects |

Repair ordering note: repairs fire on the raw tree before schema validation;
first-pass validation and sanitization use the same `SPEC_LIMITS` constants
and the same bounds the schema enforces, so a repair converts a would-be
schema rejection into a bounded, meaning-preserving repair — compatible rules.

### Forbidden mutations repairable: NONE (verified per class)

| Forbidden class | Enforcement (all REJECT, never repair) |
| --- | --- |
| trust (level / engineId / engineVersion) | `science_policy:level1_simulation` (escalation without engine); `inconsistent_engine` (trust vs simulation mismatch); `invalid_enum` (level); no repair path exists |
| engine id / version | `invalid_enum:simulation.engineId`; `text_exceeded:engineVersion`; no repair path |
| parameter meaning / unit / target | foreign `key` → `incompatible_engine`; non-empty `unit` passes verbatim (empty unit is the ratified display-only repair); `min`/`max`/`step` → `unsafe_value:param` / `range_exceeded:step`; `value` outside model's OWN declared domain → `repaired:param_value` (ratified allowlist item, snaps to the model's own bound; domain itself never altered) |
| equation | no constant/equation fields in contract — unknown keys rejected (`unknown_key:*`); formula text passes verbatim; executable markers → `unsafe_value:code` |
| constant | contract has no constant field; unknown keys rejected |
| causal relationship | valid operator mutation passes through verbatim (never "fixed"); unknown operator → `invalid_enum`; no repair |
| prediction truth (correctIndex) | `science_policy:model_graded_prediction` (model-generated spec, never stripped — rejection is stronger than strip); `science_policy:level2_prediction` / `level3_prediction`; `invalid_prediction_index`; no repair |
| readout meaning | foreign `key` → `incompatible_engine`; unknown `format` → `invalid_enum`; no repair |
| safety classification | `trust.level` — no repair path |
| provenance | unknown `source` → `invalid_enum`; `templateIds` capped; never rewritten |
| control-to-engine binding | unresolvable target → `invalid_control_target`; unknown scene ref → `invalid_enum`; retargeting never repaired |
| seed (reproducibility) | negative/non-integer → `range_exceeded:seed` / `invalid_type:simulation.seed` (test "does not repair a seed") |

### Unknown repair class: REJECT (confirmed)

The repair walk is a closed enumerated set (null scene3d/timeline, empty
unit, non-numeric size, tuning-block value, control default, named clamp
fields, declared-limit raise). Every other malformation falls through
unmutated to the strict Zod schema (`.strict()` unknown-key rejection,
enum membership, finiteness, bounds, count caps, group depth, 256 KB size
cap, `MAX_SPEC_DEPTH` 8 recursion guard, prototype-pollution/URL/code gates)
or to the science policy. Safe reason slugs only — offending content never
echoed (asserted by tests: `not.toContain("evil.example")`,
`not.toContain("Synthesis")`). One documented judgment call: a rogue
non-numeric `size` key at a non-schema location (e.g., root) is dropped as
representational (`repaired:non_numeric_size`) rather than rejected as an
unknown key — equivalent to absence, carries no science, matches the
allowlisted class; flagged, not a violation.

### Boundary suite (exact)

```
 Test Files  1 passed (1)
      Tests  89 passed (89)
   Start at  17:52:42
   Duration  1.73s (transform 111ms, setup 298ms, import 178ms, tests 41ms, environment 1.06s)
```
(`npx vitest run tests/demonstrations/validation.test.ts`)

Additional boundary evidence: red-team validator-vs-engine fuzz suite
`tests/demonstrations/redteam/validator-engine-fuzz.test.ts` — 24 passed (24),
1 file. Scratch verification (4 checks, file deleted after run): over-long
label → rejected `text_exceeded:*`; numeric out-of-range size →
`repaired:size` clamp; over-long timeline description → rejected; root rogue
non-numeric size → dropped (judgment call above).

### Trust-policy enforceability (docs/trust-policy.md — draft for red-team review, reviewed)

All 7 classified topics (respiration, food webs, photosynthesis, mitosis,
nitrogen cycle, water cycle, neural-network information flow) are canonical
Level 3 `explanatory_animation`. For each, the validator enforces the
Level-3 structure via four science-policy codes:
`science_policy:level3_timeline` (timeline with >=1 event required),
`science_policy:level3_simulation` (simulation forbidden),
`science_policy:level3_parameter_control` (parameter-target controls
forbidden), `science_policy:level3_prediction` (correctIndex forbidden).
Topic identity itself is NOT validator-visible (level is self-asserted); the
canonical topic→level mapping is enforced upstream (intent router
`TRUST_BY_KIND`: engine→verified, template→conceptual, timeline→explanatory;
frozen prompt rule for hosted). Neural-network information flow is
provisional: same structural enforceability, but no curated artifact and the
offline router returns `unsupported` — hosted-path expectation only
(policy section 6 UNKNOWN).

Validator CANNOT enforce (documented in trust-policy.md section 8):
1. "Level 3 controls limited to play_pause/speed_control/reset" — schema
   admits all 8 CONTROL_TYPES at every level; science policy bans only
   parameter-kind targets. Curated builders honor it; validation does not.
2. "No numeric claims in text" (Levels 2/3) — no numeric-claim detection
   exists in the validator.
3. Topic identity / topic→level mapping — a Level 2 conceptual spec for any
   of the 7 topics validates cleanly; the validator cannot distinguish the
   canonical classification.
4. "Curated engine for the topic" (escalation guard) — catalog membership
   and structural compatibility are enforced; topic-appropriateness of the
   engine is not (generation-time `specMatchesIntent` covers it upstream).

### Amendments

- `docs/trust-policy.md`: appended clearly-marked "Validation review"
  (section 8): per-topic enforceability table, the four non-enforceable
  claims, cited enforceable rules, verdict. Classification text (sections
  1-7) untouched.
- `docs/closure-90-validation.md`: this file (new).

### Curated-template conflicts (evaluation-director's flags — echoed, no code changed)

1. `src/demonstrations/generation/offline/router.ts` —
   `TEMPLATE_KEYWORDS.energy_transfer` (photosynthesis, respiration, food
   chain/web) and `TEMPLATE_KEYWORDS.cyclic_process` (nitrogen/carbon/rock/
   nutrient cycle) route Level-3 canonical topics to Level-2 templates →
   offline path emits `conceptual_demonstration` while hosted emits Level 3.
2. `src/demonstrations/generation/offline/template-builder.ts` —
   `energy_transfer` / `cyclic_process` templates are Level 2 (line 636-637
   `level: "conceptual_demonstration"`); the violation is the keyword-to-
   template mapping for the 4 process topics, not the templates themselves.
3. `scripts/demo-hosted-benchmark.mjs` (line 54) — Gate-2 photosynthesis gold
   is `conceptual_demonstration`; model returned `explanatory_animation`;
   gold must be relabeled Level 3.
4. `docs/demo-script-generative.md` Beat 9 / `docs/closure-video.md` /
   `docs/closure-participant.md` — photosynthesis carries the "Conceptual
   demonstration" badge yet the beat shows the "timeline representation"
   (Level-3-only artifact); badge copy must become "Explanatory animation".

Validator-side observation on all four: the validator accepts both Level 2
and Level 3 structures for these topics, so the path divergence is invisible
to (and not fixable by) validation — the fix belongs at the routing/gold/
copy layer as the policy states.

### Verdict

BOUNDARY_CLEAN — no sanitizer boundary violation; no code or test change.
GAPS documented at the trust-policy layer (not sanitizer): GAPS_trust-policy-claims (Level-3 control-type restriction, no-numeric-claims-in-text, topic-identity/engine-for-topic grounding — sections 8.2.1-8.2.4 of trust-policy.md).

### UNKNOWN

- Neural-network information flow: Level 3 classification is rule-derived
  only (no curated artifact, no model observation, offline router returns
  `unsupported`); validator enforceability is structural only.
- Food web "process vs system": framework's Level 2 "system explanation"
  reading is arguable; settled as Level 3 by holdout diagnosis + observed
  model output; flagged for red-team challenge (policy section 6).
- Offline Level 3 output for respiration / nitrogen cycle has no run-time
  evidence yet (offline path cannot currently produce Level 3 for them —
  policy section 5, items 1-2).
- Assignment 2 (holdout authoring) must not begin until red-team approval of
  the trust policy (policy section 7).
