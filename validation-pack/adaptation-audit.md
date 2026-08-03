# Adaptation Audit — Is the Adaptation Real?

**Core question:** Does the product actually adapt to the learner, or does it merely show generic hints?

## 1. Verdict summary

| Dimension | Verdict | Evidence |
|---|---|---|
| Adaptation is evidence-linked | **PASS** | Every proposal carries `evidenceIds` and a concrete, plain-language reason (`src/adaptation/deterministic-provider.ts`) |
| Adaptation visibly changes the experience | **PASS** | Accept applies real preference/representation changes (`src/components/lab/experiment-shell.tsx:243-267`) |
| Learner agency (accept/reject/modify) | **PASS** | No silent changes; reject applies zero changes; modify applies only the selected subset |
| No diagnosis inference | **PASS** | No diagnosis/identity fields anywhere; taxonomy language is non-judgmental (`src/adaptation/misconception-taxonomy.ts:13-26`) |
| Adaptation survives without a "chat wrapper" | **PASS** | It is a rules engine, not a chat; removing it leaves a static-ish simulation (see wrapper analysis) |
| "AI" claim is honest | **AT RISK** | There is **no AI** in the build (no LLM/ML dependency; free text is keyword-classified). Calling the rules engine "AI" without qualification will lose the Innovation criterion in front of technical judges |
| Multi-trial adaptation reachable in UI | **PARTIAL** | The primary flow allows only **one run per session** (`experiment-shell.tsx:132-179`); multi-trial rules fire only after counterfactual runs add trials to evidence |

## 2. Ownership split (required by the product specification)

The spec assigns responsibilities:

| Responsibility | Owner per spec | Owner in this build | Status |
|---|---|---|---|
| Interpreting free-text predictions | AI | Conservative keyword fallback (`misconception-taxonomy.ts:387-398`) | PARTIAL — keyword matching is not interpretation; acceptable only with the "conservative fallback" framing |
| Conservatively identifying possible conceptual friction | AI | Rule taxonomy with `supported/partial/uncertain/contradicted` | PASS |
| Choosing a bounded intervention | AI | Fixed-order rules, max 3 proposals | PASS |
| Rewriting explanation density / representation | AI | Proposals change density, representations, speed, one-variable mode | PASS (see gaps: no "increase depth", no "delay feedback") |
| Explaining why an adaptation is proposed | AI | Plain-language `reason` on every proposal | PASS |
| Generating simulation-grounded comparison questions | AI | `compare_trials` proposal; counterfactual panel is deterministic | PASS |
| Equations, state transitions, random seed, results, units, range checks, safety caps, counterfactual parameters | Deterministic software | Engine + zod schemas + `clampParameters` | PASS |

**Honest framing requirement:** the Innovation-in-AI criterion (25%) cannot be argued with a rules engine labeled "AI". Two defensible paths: (a) implement an offline, evidence-grounded interpretation layer for free text (with strict abstention when confidence is low), or (b) re-brand as "deterministic adaptive engine" and win the innovation argument on the counterfactual microscope + adaptation replay + evidence-linked proposals instead of on "AI". Path (a) is the higher-score path; path (b) is the safe path. Current status: **(b) framed as (a) — the risky middle**.

## 3. Required adaptation dimensions

Spec-required dimensions vs the build:

| Dimension | Provided by | Current status |
|---|---|---|
| Freeze all but one variable | `freeze_variables` proposal → `oneVariableMode` | PASS |
| Slow animation | `slow_animation` proposal → `animationSpeed 0.5` | PASS |
| Pause animation | Canvas Play/Pause control | PASS (manual, always available) |
| Show graph | `show_graph` proposal + graph tab | PASS |
| Hide graph | Manual tab switch only | PARTIAL — no proposal ever suggests hiding; acceptable as learner-controlled |
| Show causal view | `show_causal_view` proposal + causal tab | PASS |
| Reduce text density | `reduce_density` proposal + `informationDensity` | PASS with defect: the rule fires even when density is already low (`deterministic-provider.ts:181-193`; see ADAPT-019/020) |
| Increase explanation depth | **None** | MISSING — no proposal increases depth; the taxonomy offers no "explain more" path. S3 gap |
| Compare two trials | `compare_trials` proposal + counterfactual panel | PASS |
| Ask a revised prediction | `ask_prediction_again` + prediction panel accepts post-trial updates (`experiment-shell.tsx:132-149`) | PASS |
| Delay feedback | `feedbackTiming` preference | **DEAD** — settable and persisted but consumed by no code (`src/domain/learner.ts:38,56,70`; `accessibility-controls.tsx:115-134`). S2 gap |
| Avoid repeating a rejected representation | `rejectedTypes` set (`deterministic-provider.ts:39-43`) | PASS — rejected proposal types are never re-proposed (tested) |

## 4. Learner-agency gate

Every adaptation must reveal: observed evidence → proposed change → reason → accept / reject / modify-or-override. **Fail if the application silently changes the experience.**

- **PASS:** proposals are rendered as cards with the plain-language reason and Accept / Reject / Modify (`adaptation-card.tsx`). Reject records the decision and changes nothing (`experiment-shell.tsx:254-259`). Modify applies only selected checkboxes.
- **PASS (visible-only side effect):** accepting `show_graph` / `show_causal_view` also switches the active tab — this is a visible, immediate consequence, not a silent change.
- **WATCH:** proposals left `pending` in evidence when the learner navigates away without deciding (`activeProposals` is component state; `experiment-shell.tsx:81-83`). Not a gate failure, but a replay-data cleanliness issue (S3).

## 5. Diagnosis gate

**Fail if it infers or displays:** ADHD/autism likelihood, attention score, disability classification, emotional state, clinical diagnosis.

- **PASS:** no such fields exist in any schema; the taxonomy explicitly documents "never infers a diagnosis and never uses judgmental language" (`misconception-taxonomy.ts:14-19`); proposal reasons speak about the *action* ("the prediction and the result differed") never the *person*.
- **PASS (privacy):** no name, age, or identity is stored; localStorage keys hold preferences + evidence only (`session-storage.ts:17-18`).
- **Re-verify:** if an LLM provider is ever added, prompt/system boundary must enforce this gate. Encode as vector ADAPT-024.

## 6. Evidence gate

Each adaptation must cite concrete session evidence. Fail examples: "We think you are a visual learner"; "Students like you need animation"; "Your ADHD means this layout is better."

- **PASS:** reasons are templated from observed events, e.g. *"The animation was replayed several times. A slower speed can make the pattern easier to follow."* and *"This run changed several things at once, which makes it hard to see which one caused the result."* (`deterministic-provider.ts:78-193`). Every proposal's `evidenceIds` point at the triggering trials/predictions.
- **Pass example for the demo:** "You replayed the animation three times and have not opened the graph. Would you like a slower side-by-side view?" — the current rule set produces close variants of this.

## 7. Wrapper test on the adaptation itself

Remove the adaptation provider. What remains? An interactive, seeded, animated simulation with manual controls, representation tabs, prediction gating, and the counterfactual panel. That is a good PhET-style lab — but **without the provider, the product's differentiating loop (evidence → proposal → learner decision → visible change) disappears**. The adaptation is therefore structural, not cosmetic.

It is also not a "generic hint": proposals fire only from session-specific evidence (replays, changed-variable counts, prediction/outcome mismatches, ceiling hits) and mutate actual experience state. **Exception to verify in the demo:** the `reduce_density` redundancy (fires even when density is already low) is the kind of generic-feeling misfire a judge will catch — fix before the demo (ADAPT-019).

## 8. Structural findings

1. **Single-run session constraint (S2):** after the first trial, `handlePredictionSubmit` routes predictions to the existing trial and `handleRun` requires `pendingPrediction`, which is only ever set when `lastTrial` is null (`experiment-shell.tsx:132-179`, `165-171`). Consequence: `slow_animation`, `show_causal_view`, absorber/starting-population concepts, and `freeze_variables` (vs. prior trial) are **unreachable in a normal single-trial session** — they can only fire after counterfactual runs append trials to evidence. For the demo, plan the counterfactual step BEFORE expecting multi-trial cards, or clear the session between runs.
2. **`feedbackTiming` dead preference (S2):** the UI sells a control that does nothing. Either wire it (delay hint/card display timing) or remove it.
3. **`reduce_density` ignores current density (S3):** fires on ceiling hit even when `informationDensity` is already `low` or learner requested `full`.
4. **No "increase depth" proposal (S3):** the spec asks for both directions.
5. **Accepted-type suppression (S4 design note):** proposals of an accepted type are also skipped (`deterministic-provider.ts:44-46`); with a cap of 3, this can starve later suggestions in long sessions.
6. **Adaptation failure fallback is good (PASS):** provider errors are caught; the trial still completes; a notice explains suggestions are unavailable (`experiment-shell.tsx:210-233`).
7. **Determinism (PASS):** same input → same rule selections, fixed order (tested); proposal UUIDs vary but rule selection does not — correctly documented.

## 9. Priority fix list

| Priority | Item | Hours |
|---|---|---|
| P0 | Decide and document the honest AI framing (rules engine vs. real interpretation layer) | 2 |
| P0 | Keep disclaimer visible in low-density mode (`experiment-shell.tsx:338-342`) | 0.5 |
| P1 | Wire or remove `feedbackTiming` | 2–6 |
| P1 | Guard `reduce_density` against already-low / requested-full density | 0.5 |
| P2 | Add "increase depth" proposal (e.g., `increase_density`/explain-more with evidence link) | 4–8 |
| P2 | Persist pending proposals or resolve them on unmount (replay integrity) | 1–2 |
| P2 | Consider allowing a second primary run after explicit learner confirmation (unblocks multi-trial adaptation and distribution exploration) | 4–8 |

Rubric impact: every item in this section lands on **Innovation in AI Application (25%)** and **Usability and Accessibility (25%)**.
