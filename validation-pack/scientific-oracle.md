# Scientific Oracle — Conceptual Nuclear Chain Reaction

Defines the conceptual truths the educational simulation must preserve. This is **not** a nuclear-physics reference and deliberately provides **no** real-world quantities.

## Scope

Review only conceptual chain-reaction behavior of the implemented lab (`src/simulation/nuclear-chain-reaction.ts`). All quantities are abstract educational units.

**Explicitly out of scope (never tested for, never provided):** real critical-mass values, enrichment instructions, weapon geometries, reactor construction information, real facility parameters, methods for circumventing safeguards, material selection guidance, actual energy yields.

**Boundary rule:** the product, its copy, and its demo must never present the model as reactor-grade or engineering-usable. A visible simplification disclaimer is required (`src/domain/experiments.ts:12-15` defines it; see Invariant 13 for a UI gap).

## How to read an invariant

For every invariant: **Definition** — **Why it matters educationally** — **Minimal test** (maps to a `SCI-###` vector) — **Expected behavior** — **False-positive risk** (a test can pass while the invariant is actually broken) — **False-negative risk** (a correct implementation can fail the test) — **Severity if violated** — **Current implementation status** (source inspection at the audit snapshot; tests not executed by this audit).

---

## Invariant 1 — No starting neutrons means no chain reaction begins

- **Definition:** A run with `startingNeutrons = 0` must produce zero reactions and terminate immediately.
- **Why it matters:** The "seed population" concept is the causal trigger. If zero neutrons somehow produced reactions, the model would imply reaction out of nothing and destroy the causal story.
- **Minimal test:** `SCI-001`, `SCI-002`.
- **Expected behavior:** `stopReason = "extinct"`, `reactionEvents = 0`, all counters 0, immediately.
- **False-positive risk:** A UI that disallows `0` entirely (slider min 1) can "pass" while the engine itself is wrong. Test must call the engine directly with 0.
- **False-negative risk:** None.
- **Severity:** S0 — a reaction from zero neutrons is fake science.
- **Current status:** PASS by inspection. Engine early-returns `extinct` with an all-zero snapshot (`nuclear-chain-reaction.ts:67-71`); `clampParameter` allows engine-level 0 for `startingNeutrons` (`experiments.ts:194-196`); unit tests cover the zero case.

## Invariant 2 — State values cannot become negative

- **Definition:** Every snapshot counter (`freeNeutrons`, `absorbedNeutrons`, `escapedNeutrons`, `reactionEvents`, `cumulativeEnergyUnits`) is ≥ 0 at every step, and `freeNeutrons` is an integer.
- **Why it matters:** Negative population destroys the meaning of every graph and every counterfactual comparison.
- **Minimal test:** `SCI-007` (many seeds, full duration).
- **Expected behavior:** All counters nonnegative; `freeNeutrons` integer.
- **False-positive risk:** Checking only the final snapshot hides mid-run negatives. Check every snapshot.
- **False-negative risk:** None.
- **Severity:** S0.
- **Current status:** PASS by construction (counters only ever increment; population computed from bounded nonnegative parts; `Math.max(0, …)` on entry) plus tests. Caveat: the engine does **not** guard `NaN` inputs itself (clamping passes NaN through); the zod boundary (`experiments.ts:48-55`) rejects NaN/Infinity. See `SCI-024`.

## Invariant 3 — Identical parameters and identical seed produce identical outputs

- **Definition:** Full snapshot history and stop reason are a pure function of (parameters, seed).
- **Why it matters:** This is the product's core proof of scientific honesty: the learner can re-run and trust the result; judges can reproduce the demo.
- **Minimal test:** `SCI-003`.
- **Expected behavior:** Two runs of the same params+seed produce byte-identical snapshot arrays.
- **False-positive risk:** Comparing only final counts; a bug that reorders mid-history steps but keeps the final value would pass. Compare every snapshot.
- **False-negative risk:** Only if the PRNG itself is environment-dependent — Mulberry32 is integer-only arithmetic, so none.
- **Severity:** S0.
- **Current status:** PASS by inspection. `createSeededRandom` is Mulberry32 over integer math (`nuclear-chain-reaction.ts:25-34`); random consumption order is fixed per step; unit test asserts determinism.

## Invariant 4 — Simulation ends at the configured step cap

- **Definition:** A run never exceeds `durationSteps` steps; reaching the cap terminates the loop.
- **Why it matters:** Bounded runtime is what makes the tool safe to use freely (and demoable).
- **Minimal test:** `SCI-008`.
- **Expected behavior:** `snapshots.length ≤ durationSteps + 1`; `stopReason = "completed"` unless a cap hit first.
- **False-positive risk:** A run that exits early for the wrong reason (e.g., extinction) can mask an infinite-loop risk. Test a full-length run separately.
- **False-negative risk:** None.
- **Severity:** S1 (an unbounded loop bricks the demo).
- **Current status:** PASS by inspection. Loop bounded by `params.durationSteps` (clamped ≤ `MAX_STEPS = 120`, `experiments.ts:19`).

## Invariant 5 — Simulation ends at the configured population cap

- **Definition:** `freeNeutrons` never exceeds `MAX_POPULATION`; when reached, the run stops with `stopReason = "max_population"`.
- **Why it matters:** The cap is the in-product safety ceiling: no infinite growth, no rendering blow-up, and it gives the learner a visible "the model stops here" moment.
- **Minimal test:** `SCI-009`.
- **Expected behavior:** Every snapshot `freeNeutrons ≤ 500`; last snapshot equals 500 when the stop reason is `max_population`.
- **False-positive risk:** A cap implemented only in the UI renderer would pass a UI test while the engine is unbounded. Test the engine directly.
- **False-negative risk:** None.
- **Severity:** S0 (an unbounded engine is a safety and demo failure).
- **Current status:** PASS by inspection. Cap applied inside the loop (`nuclear-chain-reaction.ts:101-106`).

## Invariant 6 — Increasing absorption under controlled conditions should not increase propagation

- **Definition:** With everything else held constant (across seeds), pushing the absorber further in must not produce a larger reaction on average.
- **Why it matters:** This is the experiment's central causal claim ("withdraw → grows, insert → shrinks"). Breaking it silently teaches the wrong physics.
- **Minimal test:** `SCI-010` (aggregate over 30 seeds).
- **Expected behavior:** Aggregate `reactionEvents` and final population for higher absorption ≤ those for lower absorption.
- **False-positive risk:** Using a single seed — the random stream is consumed differently per configuration, so one seed can coincidentally invert the relation. Always aggregate over seeds.
- **False-negative risk:** The aggregation window too small (see vector calibration note). Also: `absorberPosition` multiplies absorption probability; with `absorptionProbability` near 0 the effect is weak — choose values with clear separation.
- **Severity:** S1 (breaks the core lesson and the counterfactual demo).
- **Current status:** PASS by inspection (absorption scales `absorptionProbability * absorberPosition`, `nuclear-chain-reaction.ts:85`) with a 30-seed dominance test in the suite.

## Invariant 7 — Lower effective absorption may permit greater propagation

- **Definition:** Withdrawing the absorber (or lowering absorption probability) can allow a growing reaction where the original configuration died or stayed flat.
- **Why it matters:** The "safe → suddenly large" transition is the emotional core of the demo and the learner's "aha".
- **Minimal test:** `SCI-011`.
- **Expected behavior:** The low-absorption configuration reaches larger population/reactions than the high-absorption configuration under matched seeds, aggregated.
- **False-positive / false-negative risks:** Same single-seed trap as Invariant 6.
- **Severity:** S1.
- **Current status:** PASS by inspection (same mechanism as Invariant 6; `SCI-011` selects clearly separated values 0.01 vs 0.6).

## Invariant 8 — A higher initial neutron count can alter early behavior but must not rewrite the propagation rule

- **Definition:** `startingNeutrons` only seeds the initial population; growth mechanics (escape/fission/absorption probabilities) are unchanged by it.
- **Why it matters:** Learners conflate "start bigger" with "rules changed". The model must make the distinction visible and true.
- **Minimal test:** `SCI-012`.
- **Expected behavior:** Aggregated over seeds, larger starting populations yield ≥ final population/reactions; the underlying probabilities are identical constants across both runs.
- **False-positive risk:** Asserting monotonicity on one seed (random consumption differs; not guaranteed per seed).
- **False-negative risk:** None with aggregation.
- **Severity:** S2.
- **Current status:** PASS by inspection — `startingNeutrons` only initializes `freeNeutrons` (`nuclear-chain-reaction.ts:60`); all rule constants are module-level.

## Invariant 9 — One trial does not prove deterministic population behavior when randomness is involved

- **Definition:** With random events seeded per run, a single trial's final population is a sample, not a law. The product must not present a single run as "the" result.
- **Why it matters:** Protects learners from over-generalizing from one run — and protects the product from a judge who re-runs with a different seed and sees a different number.
- **Minimal test:** `SCI-013`, plus the counterfactual panel's same-seed comparison.
- **Expected behavior:** Multiple seeds produce varying final populations; the UI labels randomness (seed control exists; `experiments.ts:120-128`).
- **False-positive risk:** A seed control that does nothing.
- **False-negative risk:** If the demo configuration is chosen to always explode, randomness is invisible — a deliberate choice must still be labeled.
- **Severity:** S2.
- **Current status:** PASS by inspection (seed parameter, seeded PRNG, same-seed counterfactual). Educational friction: the current UI allows only one primary run per session (see `implementation-inspection.md`, `experiment-shell.tsx:132-179, 165-171`), which limits cross-seed exploration unless the session is cleared.

## Invariant 10 — Repeated trials should reveal distributions rather than one guaranteed outcome

- **Definition:** Given enough runs, learners should be able to see a range of outcomes (and the pattern behind them).
- **Why it matters:** This is the distinction between "random noise" and "system pattern" — a first-class concept in the misconception taxonomy (`RANDOM_EVENT_VS_SYSTEM_PATTERN`).
- **Minimal test:** `SCI-013`; protocol question in `user-testing-protocol.md`.
- **Expected behavior:** Varying the seed across repeated runs yields a visible distribution of final populations.
- **False-positive risk:** A histogram that just replays one recorded run.
- **False-negative risk:** Single-run-per-session UI friction (see Invariant 9).
- **Severity:** S2.
- **Current status:** PARTIAL — the engine supports it; the UI session model constrains it. Tracked as `GATE B` evidence need.

## Invariant 11 — A conceptual critical transition may appear nonlinear

- **Definition:** Small parameter changes near the growth/decay boundary can produce dramatically different outcomes (growth class jumps from flat to runaway).
- **Why it matters:** The "sudden takeover" is the concept learners find both surprising and memorable; it justifies the product's causal-comparison machinery.
- **Minimal test:** `SCI-009` / `SCI-011` outcome shape; `growthClassOf` classification (`misconception-taxonomy.ts:121-133`).
- **Expected behavior:** Some parameter pairs show nonlinear growth (ratio > 8× or ceiling hit).
- **False-positive risk:** Claiming "nonlinear" for any run that merely reaches the cap — the cap itself is a linear-boundary artifact. The taxonomy treats cap-hit as nonlinear deliberately (`misconception-taxonomy.ts:128`), which is a documented heuristic, not physics.
- **False-negative risk:** None.
- **Severity:** S3.
- **Current status:** PASS by inspection; nonlinear classification is exercised by taxonomy tests.

## Invariant 12 — Energy must remain labeled as abstract educational units

- **Definition:** Energy values (`cumulativeEnergyUnits`) must be presented as abstract units, never Joules, MeV, or any real unit.
- **Why it matters:** Real units invite real-world comparison and misuse; abstract units keep the fiction honest.
- **Minimal test:** Grep UI copy for physical units; verify labels; `SCI-023` for arithmetic consistency.
- **Expected behavior:** No physical-unit strings in the UI; energy is a dimensionless count.
- **False-positive risk:** None.
- **False-negative risk:** None.
- **Severity:** S2.
- **Current status:** INSPECTABLE — `ENERGY_PER_REACTION = 2` and `cumulativeEnergyUnits` (`nuclear-chain-reaction.ts:20, 44`); unit labels must be verified on screen during `GATE B` execution (vector `SCI-023` asserts `cumulativeEnergyUnits = reactionEvents × 2`).

## Invariant 13 — The simulation must not claim reactor-grade physical fidelity

- **Definition:** Product copy, README, demo, and UI must state the model is conceptual/fictionalized and not for engineering or safety decisions.
- **Why it matters:** This is the product's ethical boundary and a disqualification shield for a nuclear-content hackathon entry.
- **Minimal test:** Disclaimer visible; README phrasing; demo language.
- **Expected behavior:** The disclaimer sentence is shown whenever the lab is used for the first time and in the lab header.
- **False-positive risk:** A disclaimer that exists in code but is hidden in the default view.
- **False-negative risk:** None.
- **Severity:** S0 (a nuclear-adjacent product without a visible boundary reads as dangerous).
- **Current status:** FAIL (edge) — disclaimer exists (`experiments.ts:12-15`) and renders in the header, but is **hidden in low-density mode** (`experiment-shell.tsx:338-342`). A learner who chooses "less text" loses the safety disclaimer. Severity S2 as implemented; fix: keep the disclaimer outside density controls.

## Invariant 14 — Counterfactual comparison must change exactly one variable

- **Definition:** The Counterfactual Microscope alters exactly one of {absorberPosition, absorptionProbability, materialDensity, startingNeutrons} and nothing else — seed and duration are locked.
- **Why it matters:** The entire causal claim ("this change caused that difference") collapses if two variables move at once or the random stream changes.
- **Minimal test:** `SCI-014`; existing counterfactual tests.
- **Expected behavior:** `changedVariable` records the single variable; all other parameters (including seed and durationSteps) equal the original.
- **False-positive risk:** Comparing two runs that coincidentally match.
- **False-negative risk:** None.
- **Severity:** S0.
- **Current status:** PASS by inspection (`counterfactual.ts:15-20` allowlist; seed and durationSteps are rejected as counterfactual variables; deep clone at `:29-31`).

## Invariant 15 — The original run must remain immutable

- **Definition:** Running a counterfactual must not mutate the original trial's parameters or snapshots.
- **Why it matters:** The comparison is only trustworthy if the baseline cannot drift; Adaptation Replay and the evidence register both depend on immutable history.
- **Minimal test:** `SCI-015`.
- **Expected behavior:** Original trial object and its snapshots are identical before and after the counterfactual run.
- **False-positive risk:** Testing with copies instead of the live object.
- **False-negative risk:** None.
- **Severity:** S0.
- **Current status:** PASS by inspection — `runCounterfactual` clones parameters and returns the original by reference (`counterfactual.ts:44, 58`); unit test asserts immutability.

## Invariant 16 — Representation changes must not alter simulation outcomes

- **Definition:** Switching between animation, graph, equation, causal, and plain-language views re-renders the same recorded trial; it never re-simulates.
- **Why it matters:** "Same science, different lens" is the whole point of representation choice. If a view changed the numbers, adaptation would be lying about causation.
- **Minimal test:** `SCI-017`; `SCI-018`; `SCI-019`.
- **Expected behavior:** Trial id, snapshots, and final values are identical across representations and speed/motion settings.
- **False-positive risk:** Testing only the final number while a view recomputes mid-history.
- **False-negative risk:** None.
- **Severity:** S0.
- **Current status:** PASS by inspection — all views render `trial.snapshots`; the canvas replays recorded data (`simulation-canvas.tsx`); playback speed only changes frame delay.

## Invariant 17 — Accessibility settings must not alter scientific outcomes

- **Definition:** Reduced motion, speed, text scale, density, contrast affect presentation only; results are identical.
- **Why it matters:** Access must never buy a "different science". A learner using reduced motion must see the same outcome as a learner using full animation.
- **Minimal test:** `SCI-019` (reduced motion), `SCI-018` (speed).
- **Expected behavior:** Identical trial data regardless of preference state.
- **False-positive risk:** None realistic.
- **False-negative risk:** None.
- **Severity:** S0.
- **Current status:** PASS by inspection — `applyProposedChanges` only writes preference fields (`adaptation.ts:33-63`); `runSimulation` takes parameters only.

## Invariant 18 — AI explanations must describe recorded state rather than invent new state

- **Definition:** Any adaptive/AI explanation (proposal reasons, replay narration) must reference evidence that exists in the session (trials, predictions, representation events) and must never assert unrecorded facts.
- **Why it matters:** Fabricated explanations are fake adaptation; they also poison the evidence register.
- **Minimal test:** Every proposal's `reason` maps to `evidenceIds`; Adaptation Replay renders recorded evidence only; no generative text exists.
- **Expected behavior:** Reasons cite concrete observed behavior (e.g., "the animation was replayed several times"); replay shows the 9-step recorded journey.
- **False-positive risk:** An LLM added later could generate plausible-sounding but unrecorded claims. This invariant must be re-tested if a generative provider is ever added.
- **False-negative risk:** None for the current rules engine.
- **Severity:** S0.
- **Current status:** PASS by inspection — the deterministic provider emits templated reasons tied to `evidenceIds` (`deterministic-provider.ts`); replay reads evidence only (`adaptation-replay.tsx`). **Conditional:** re-audit if an LLM provider is introduced.

---

## Oracle summary table

| # | Invariant | Severity | Current status |
|---|---|---|---|
| 1 | Zero neutrons → no reaction | S0 | PASS |
| 2 | No negative state | S0 | PASS |
| 3 | Same params+seed → same result | S0 | PASS |
| 4 | Step cap | S1 | PASS |
| 5 | Population cap | S0 | PASS |
| 6 | More absorption ≠ more propagation | S1 | PASS |
| 7 | Less absorption permits propagation | S1 | PASS |
| 8 | Starting population ≠ rule change | S2 | PASS |
| 9 | One trial is not proof | S2 | PASS (UI friction noted) |
| 10 | Distributions over repeated trials | S2 | PARTIAL (session model) |
| 11 | Nonlinear critical transition | S3 | PASS |
| 12 | Abstract energy units | S2 | INSPECTABLE (verify labels) |
| 13 | No reactor-grade fidelity claim | S0 | FAIL-EDGE (disclaimer hidden in low density) |
| 14 | Counterfactual: one variable | S0 | PASS |
| 15 | Original immutable | S0 | PASS |
| 16 | Representations don't change science | S0 | PASS |
| 17 | Accessibility doesn't change science | S0 | PASS |
| 18 | AI explains recorded state only | S0 | PASS (re-audit if LLM added) |
