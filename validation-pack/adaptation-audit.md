# Adaptation Audit — Is the Adaptation Real?

> **RE-STAMPED on the final-hardening branch.** Corrected for the current product: the
> structured LLM provider is now IMPLEMENTED (optional, behind `/api/adapt`, labeled, with
> deterministic fallback), the repeatable multi-trial loop makes multi-trial adaptation
> reachable in a normal session, and the dead `feedbackTiming` control was removed. Items
> marked **SUPERSEDED** below are historical.

**Core question:** Does the product actually adapt to the learner, or does it merely show generic hints?

## 1. Verdict summary

| Dimension | Verdict | Evidence |
|---|---|---|
| Adaptation is evidence-linked | **PASS** | Every proposal carries `evidenceIds` and a concrete, plain-language reason (`src/adaptation/deterministic-provider.ts`) |
| Adaptation visibly changes the experience | **PASS** | Accept applies real preference/representation changes (`src/components/lab/experiment-shell.tsx`) |
| Learner agency (accept/reject/modify) | **PASS** | No silent changes; reject applies zero changes; modify applies only the selected subset |
| No diagnosis inference | **PASS** | No diagnosis/identity fields anywhere; taxonomy language is non-judgmental (`src/adaptation/misconception-taxonomy.ts`); the LLM system prompt forbids diagnosis inference |
| Adaptation survives without a "chat wrapper" | **PASS** | It is a rules engine (and optionally a bounded structured LLM), not a chat; removing it leaves a static-ish simulation (see wrapper analysis) |
| "AI" claim is honest | **RESOLVED** | Deterministic rules by default (labeled honestly), PLUS an implemented optional structured LLM provider whose proposals are labeled "AI interpretation" vs "Offline rules" (`src/adaptation/llm-provider.ts`, `src/app/api/adapt/route.ts`) — no silent overstatement remains |
| Multi-trial adaptation reachable in UI | **PASS** | The repeatable multi-trial loop (updated prediction gates each new trial; trials appended, no reload) makes `slow_animation`, `show_causal_view`, absorber/starting-population concepts, and `freeze_variables` reachable in a normal session (`e2e/multi-trial.spec.ts`) |

## 2. Ownership split (required by the product specification)

The spec assigns responsibilities:

| Responsibility | Owner per spec | Owner in this build | Status |
|---|---|---|---|
| Interpreting free-text predictions | AI | Conservative keyword fallback by default (`misconception-taxonomy.ts`); structured LLM provider when enabled (`src/adaptation/llm-provider.ts`, schema-validated, labeled) | PASS — both paths are honest: keyword matching is documented as a conservative fallback, and the hosted interpretation is bounded and labeled "AI interpretation" |
| Conservatively identifying possible conceptual friction | AI | Rule taxonomy with `supported/partial/uncertain/contradicted` | PASS |
| Choosing a bounded intervention | AI | Fixed-order rules, max 3 proposals | PASS |
| Rewriting explanation density / representation | AI | Proposals change density, representations, speed, one-variable mode | PASS (see gaps: no "increase depth", no "delay feedback") |
| Explaining why an adaptation is proposed | AI | Plain-language `reason` on every proposal | PASS |
| Generating simulation-grounded comparison questions | AI | `compare_trials` proposal; counterfactual panel is deterministic | PASS |
| Equations, state transitions, random seed, results, units, range checks, safety caps, counterfactual parameters | Deterministic software | Engine + zod schemas + `clampParameters` | PASS |

**Honest framing requirement:** the Innovation-in-AI criterion (25%) can now be argued on either path: (a) the implemented optional structured LLM provider — bounded, schema-validated, labeled, fallback-safe — interprets free-text predictions and behavior when enabled; or (b) the "deterministic adaptive engine" framing wins the innovation argument on the counterfactual microscope + adaptation replay + evidence-linked proposals. Current status: **both paths exist and are honestly labeled** — the risky middle is gone, provided the demo keeps the labels and optionality visible.

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
| Reduce text density | `reduce_density` proposal + `informationDensity` | PASS with defect: the rule fires even when density is already low (`deterministic-provider.ts`; see ADAPT-019/020) |
| Increase explanation depth | **None** | MISSING — no proposal increases depth; the taxonomy offers no "explain more" path. S3 gap |
| Compare two trials | `compare_trials` proposal + counterfactual panel | PASS |
| Ask a revised prediction | `ask_prediction_again` + prediction panel accepts post-trial updates | PASS — and the updated prediction now gates the next trial in the multi-trial loop |
| Delay feedback | `feedbackTiming` preference | **REMOVED (SUPERSEDED)** — the control was dead (settable, persisted, consumed by nothing) and was removed from the UI; the schema field remains for compatibility only. S2 gap closed |
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

1. **Single-run session constraint (S2) — SUPERSEDED.** The build now supports a repeatable multi-trial loop: the updated prediction gates each new trial, trials are appended (never overwritten), and no reload is needed (`experiment-shell.tsx`; `e2e/multi-trial.spec.ts` runs three trials). `slow_animation`, `show_causal_view`, absorber/starting-population concepts, and `freeze_variables` (vs. prior trial) are now reachable in a normal session.
2. **`feedbackTiming` dead preference (S2) — SUPERSEDED.** The control was removed from the UI; the schema field remains for compatibility but nothing consumes it as a control.
3. **`reduce_density` ignores current density (S3):** still open — fires on ceiling hit even when `informationDensity` is already `low` or learner requested `full`.
4. **No "increase depth" proposal (S3):** the spec asks for both directions.
5. **Accepted-type suppression (S4 design note):** proposals of an accepted type are also skipped (`deterministic-provider.ts:44-46`); with a cap of 3, this can starve later suggestions in long sessions.
6. **Adaptation failure fallback is good (PASS):** provider errors are caught; the trial still completes; a notice explains suggestions are unavailable (`experiment-shell.tsx`). The hosted path adds the same guarantee: ANY `/api/adapt` failure returns `{ fallback: true }` and the deterministic rules run, with the "Offline rules" badge visible.
7. **Determinism (PASS):** same input → same rule selections, fixed order (tested); proposal UUIDs vary but rule selection does not — correctly documented.

## 9. Priority fix list

| Priority | Item | Hours |
|---|---|---|
| P0 | Guard `reduce_density` against already-low / requested-full density | 0.5 |
| P1 | Add "increase depth" proposal (e.g., `increase_density`/explain-more with evidence link) | 4–8 |
| P1 | Persist pending proposals or resolve them on unmount (replay integrity) | 1–2 |
| P2 | Recorded live trace of a proposal firing from evidence (for the demo and the register) | 1 |
| P2 | Optional: live judging demo with the hosted path enabled (labeled "AI interpretation") | 0.5 (config) |

Rubric impact: the remaining open items land on **Innovation in AI Application (25%)** and **Usability and Accessibility (25%)**, but none blocks the demo: the multi-trial loop, the labeled LLM fallback, and the evidence-linked proposals are all demonstrable today.
