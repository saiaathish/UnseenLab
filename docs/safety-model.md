# UnseenLab — Safety Model

## Educational purpose

UnseenLab teaches causal principles of otherwise inaccessible experiments. Every module must let a learner predict, manipulate, observe, and re-derive the cause-and-effect structure of a phenomenon — without ever providing instructions that could enable dangerous real-world experimentation.

## Dangerous-experiment boundary

Allowed: conceptual models, fictionalized dimensionless values, abstract outcomes, causal reasoning, and explicit statements that the model is simplified.

Forbidden: operationally dangerous procedures, real materials by weapon relevance, facility specifications, bypassing control systems, and any content that could be used to construct real hazardous devices or conduct hazardous experiments.

## Nuclear-content restrictions (current module)

- Fictionalized dimensionless values only; no real materials.
- No enrichment procedures.
- No critical-mass calculations.
- No reactor construction steps.
- No methods for bypassing control systems.
- No real facility specifications.
- Visible disclaimer in the app and README: the simulation is conceptual and simplified and must not be used for real engineering or safety decisions.
- Counterfactual comparison exposes only four safe variables (absorber position, absorption probability, material density, starting neutrons); `durationSteps` and `seed` are rejected programmatically.

## Deterministic-engine requirement

Simulation outcomes come exclusively from the deterministic, seeded engine in `src/simulation/`. The adaptation layer can interpret evidence and propose representational changes, but it cannot modify simulation equations or outcomes. No LLM-generated calculations, no arbitrary code execution, no hardcoded prerecorded results.

## Simplification disclaimer

All results are labeled conceptual and simplified. The engine includes safety caps (population ceiling, step limit, parameter clamping, nonnegativity) and terminates deterministically.

## Future-experiment safety review checklist

Before any new lab ships, reviewers must confirm:

- [ ] The lab teaches a causal principle and nothing operationally dangerous.
- [ ] No real-world operational instructions are included anywhere.
- [ ] No real materials, facility data, or weapon-relevant parameters.
- [ ] No enrichment / construction / bypass procedures.
- [ ] All values are fictionalized and clearly labeled conceptual.
- [ ] The simulation is deterministic/seeded and unit-tested against invariants.
- [ ] The adaptation layer cannot alter simulation outcomes.
- [ ] A visible disclaimer appears in the UI and README.
- [ ] Counterfactual exposure is limited to a small, safe, reviewed variable set.
- [ ] Language is non-judgmental and never pathologizes the learner.
