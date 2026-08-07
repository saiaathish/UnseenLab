# Scientific trust model

Every demonstration carries exactly ONE trust level, shown as a visible badge.

## Level 1 — Verified simulation

- Implemented by curated deterministic engine code only
  (`src/demonstrations/renderers/lumina-2d/engines/*`).
- Bounded parameters, testable readouts, documented assumptions.
- No model-generated equations, constants, or integration code — the schema
  has no such fields, and unknown keys are rejected.
- Deterministic / seeded replay (mulberry32 PRNG; seed from the spec).
- Numerically validated in tests: RK4 projectile matches the analytic parabola
  (0.000% range error), orbit period matches Kepler (0.1%), RC time constant
  matches τ = RC (0.00%), gas avg-speed scales as √T, waves stay stable and
  finite, B3/S23 glider translates exactly.
- Prediction answers may carry `correctIndex` — asserted by the engine, never
  by the model.

## Level 2 — Conceptual demonstration

- Composed from approved primitives; explains relationships.
- Makes no quantitative prediction claim; never shows invented numerical
  measurements; at least one visible limitation.
- No `correctIndex`; the learner's reasoning is recorded, not graded.

## Level 3 — Explanatory animation

- Narrative sequence (timeline) with accessible text equivalent.
- No simulation claim, no numerical prediction, no scientific readouts.
- Ordering questions only.

## Enforced boundaries

- `sciencePolicy` rejects Level 2 with simulation or a graded prediction,
  Level 3 with simulation/readout controls, Level 1 without a curated engine.
- The generation pipeline cross-checks the emitted spec against the intent
  layer's routed trust level and engine candidates (`specMatchesIntent`): the
  model may never escalate a conceptual/explanatory topic into a "verified"
  simulation, and a verified topic must stay inside the routed engine family.
- Content safety: operational weapon/explosive/drug/enrichment/reactor-
  operation language is rejected with a safe message; the fictionalized,
  dimensionless Nuclear Chain Reaction experience remains supported and is
  clearly not operational.

Coverage language used everywhere: "Supported through verified engines",
"Supported through conceptual demonstrations", "Supported through explanatory
animations", "Not currently supported" — never universal STEM coverage.
