# Implementation Inspection — Independent Source Review

Independent inspection of the UnseenLab build (Next.js 16 / React 19 / Zod 4 / Tailwind v4, TypeScript). Source read at the audit snapshot; **no tests were executed by this audit** (parallel-session isolation). Findings cite `file:line` against the repository root.

## Architecture

| Aspect | Finding | Evidence |
|---|---|---|
| Simulation/UI separation | **GOOD** — engine is a pure function of (parameters, seed); UI consumes recorded snapshots only | `src/simulation/nuclear-chain-reaction.ts:53-118`; `src/components/lab/simulation-canvas.tsx` renders `trial.snapshots` |
| Adaptation/science separation | **GOOD** — adaptation consumes evidence, never equations; `applyProposedChanges` writes preferences only | `src/domain/adaptation.ts:33-63` |
| State ownership | Centralized in `experiment-shell` session state; evidence updates via pure reducers (`addTrial`, `addPrediction`, …) | `src/domain/evidence.ts:143-197` |
| Persistence | localStorage, zod-validated on read; corrupt data falls back to defaults silently (comment claims "repair" but no repair occurs — cosmetic mismatch) | `src/storage/session-storage.ts:48-66` |
| Type safety | Strong: zod schemas at every boundary (params, snapshots, trials, predictions, evidence, preferences) | `src/domain/*.ts` |
| Error boundaries | Adaptation provider failures caught with user-facing notice; trial still completes. No React error boundary for render crashes | `src/components/lab/experiment-shell.tsx:210-233` |
| File sprawl | Low; 14 source files, clear naming | `src/` listing |
| Dependency quality | Excellent for a hackathon: 4 runtime deps, no AI SDK, no analytics | `package.json:15-20` |

## Scientific implementation

| Aspect | Finding |
|---|---|
| Seed method | Mulberry32 seeded PRNG, integer math, environment-independent (`nuclear-chain-reaction.ts:25-34`) |
| Randomness | Consumed in fixed order per step (escape → absorb → fission); consumption count depends on population only |
| Caps | `MAX_POPULATION = 500` (`experiments.ts:18`), `MAX_STEPS = 120`, `MIN_STEPS = 10`, `MAX_STARTING_NEUTRONS = 10` |
| Mutation risks | None found; params cloned in counterfactual (`counterfactual.ts:29-31`); original returned by reference unmodified |
| Counterfactual isolation | Single-variable allowlist; seed + durationSteps excluded (`counterfactual.ts:15-20, 38-42`) |
| Numeric safety | Clamping for range; **GAP:** `clampParameter` passes `NaN` through (no `Number.isFinite` guard) — zod rejects NaN at the boundary, but a bypassed-schema path would propagate NaN (`experiments.ts:188-212`) — S1, ~0.5h fix |
| Replay correctness | Canvas replays recorded snapshots; per-trial remount via `key={lastTrial?.id}` (`experiment-shell.tsx:424-425`) |

## Adaptation implementation

| Aspect | Finding |
|---|---|
| Input signals | `AdaptationInput` = preferences + predictions + trials + sessionEvidence (`adaptation.ts:14-19`) |
| Output schema | `AdaptationProposal` with type, plain-language reason, `evidenceIds`, proposedChanges, decision (`evidence.ts:83-105`) |
| Evidence links | Every proposal carries `evidenceIds` (verified across all 7 rule paths) |
| Diagnosis inference | None; taxonomy explicitly non-judgmental (`misconception-taxonomy.ts:13-26`); no identity fields in any schema |
| Silent UI changes | None; preferences change only on Accept/Modify; visible tab switch on accepted view proposals (`experiment-shell.tsx:263-267`) |
| Rejected-adaptation handling | Rejected types never re-proposed (session-scoped set) (`deterministic-provider.ts:37-46`); accepted types also skipped |
| No-adaptation fallback | Empty card state "No suggestions right now"; provider failure → notice, trial still completes |
| **FINDING — single-run session constraint** | After the first trial, `handleRun` can never run again (requires `pendingPrediction`, which is only set when `lastTrial` is null). Multi-trial rules (`slow_animation`, `show_causal_view`, absorber/starting-population concepts) are reachable only after counterfactual runs append trials to evidence (`experiment-shell.tsx:132-179, 165-171`) — S2 for the adaptation story and demo |
| **FINDING — dead preference** | `feedbackTiming` settable + persisted + documented, consumed by no code path (`learner.ts:38,56,70`; `accessibility-controls.tsx:115-134`) — S2 |
| **FINDING — redundant density rule** | `reduce_density` fires on ceiling-hit even when density is already low/full-requested (`deterministic-provider.ts:181-193`) — S3 |
| **FINDING — no increase-depth proposal** | Spec asks for both density directions; only reduction exists — S3 |

## Accessibility implementation

| Aspect | Finding |
|---|---|
| Keyboard | All controls native (buttons/inputs/selects); no drag-only interaction found — core flow keyboard-operable |
| Motion | In-app reduced-motion toggle works (static frames, "!" markers, CSS kill via `html[data-reduced-motion]`, `globals.css:39-44`); **MISSING:** OS `prefers-reduced-motion` support — S2 |
| Labels | Labels + `<output>` pairs, fieldsets/legends, `role="switch"` + `aria-checked` (`accessibility-controls.tsx:189-206`) |
| Focus | `:focus-visible` styling (`globals.css:70-74`); **MISSING:** dialog focus trap/initial focus/restore in AdaptationReplay (`adaptation-replay.tsx:258-290`) — S3; **MISSING:** roving tabindex for tabs (`representation-tabs.tsx:43-61`) — S3 |
| Screen-reader summary | `aria-live="polite"` state summary + `role="status"` stop reason; **RISK:** live region updates every step while playing (~900 ms) → screen-reader spam (`simulation-canvas.tsx:220-231`) — S3 |
| Density | Low-density mode hides disclaimer + plain-language sentence; disclaimer hidden in low density is a **safety-regression** (`experiment-shell.tsx:338-342`) — S2 |
| Responsive behavior | Grid collapses to single column below `lg`; unverified on 375 px |

## Hackathon tells (observed)

1. README references nonexistent docs: `docs/safety-model.md`, `docs/architecture.md`, `docs/user-research.md`, `docs/initial-commit-report.md` (`README.md:64, 104-109, 121, 128-129`). Missing docs = broken trust with judges.
2. README:121 — "No structured product test has been performed yet" — honest, but means Impact claims are pending.
3. Test-count claim mismatch: README says 60 unit/component tests + "session persistence" coverage; the repo has 59 tests and **no storage test file** (`tests/` contains adaptation, components, simulation only).
4. Planned labs show placeholder goals ("Planned lab.", `experiments.ts:241-260`); landing page shows "Planned"/"Not built yet" cards (`page.tsx:57-76`) — fine if framed as roadmap, fatal if presented as shipped.
5. Research-mode free-text answers intentionally not persisted (`research-mode.tsx:25-26`) — loses Part B/D answers on navigation; session sheet must capture them.
6. Default create-next-app assets remain (`public/` SVGs, scaffold README in the audit snapshot) — replace before submission.
7. No TODO/FIXME/console.log anywhere in `src/` — clean.
8. "AI" framing in README exceeds the implemented capability (see `evidence-claims-register.md` CLAIM-13) — the single highest-risk tell.

## Items marked NOT YET INSPECTABLE

- **LLM provider:** README documents an "LLM provider designed-for but not implemented" — nothing to inspect; the safety boundaries (evidence-grounded generation, diagnosis prohibition) must be enforced at its interface when/if it lands.
- **OS-level reduced motion, focus-trap behavior:** absent, not merely uninspectable — verified as missing (see accessibility findings).
- **Deployed behavior:** no public URL exists; first-60-seconds deployment trace is UNVERIFIED.
- **Video/demo assets:** none exist.

## Inspection verdict

The core is **technically real and unusually well structured for a hackathon**: deterministic seeded engine, genuine single-variable causal comparison, evidence-linked adaptation with full learner agency, no network/analytics, honest disclaimer. Nothing here is fake. The gaps are: the "AI" claim (S1), the single-run session constraint (S2), dead `feedbackTiming` (S2), disclaimer-in-low-density (S2), five accessibility gaps (S2/S3), missing docs referenced by README (S2), and zero user evidence (S0-adjacent for the Impact criterion).
