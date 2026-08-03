# UnseenLab — Initial Commit Report

Completed after implementation. All commands executed in this repository.

## What was built

The first production-quality vertical slice of UnseenLab: a landing page, a fully functional Nuclear Chain Reaction lab with a deterministic seeded simulation, prediction workflow, interactive animation, five representations, an evidence-based deterministic adaptation provider, learner-controlled accept/reject/modify adaptations, a Counterfactual Microscope, an Adaptation Replay, local research mode, comprehensive accessibility controls, anonymous local persistence, documentation, and a full test suite including a Playwright demo smoke test.

## Files added

```text
src/domain/learner.ts                      preferences, representation modes, defaults (Zod)
src/domain/experiments.ts                  parameter schema, registry, specs, clamping
src/domain/evidence.ts                     predictions, trials, proposals, session evidence (Zod)
src/domain/adaptation.ts                   AdaptationProvider interface + change application
src/simulation/nuclear-chain-reaction.ts   seeded engine (mulberry32), safety caps
src/simulation/counterfactual.ts           one-variable counterfactual microscope
src/adaptation/deterministic-provider.ts   offline bounded-rule provider
src/adaptation/misconception-taxonomy.ts   5-concept taxonomy + classification
src/storage/session-storage.ts             anonymous Zod-validated localStorage session
src/components/lab/experiment-shell.tsx    orchestrator
src/components/lab/prediction-panel.tsx
src/components/lab/variable-controls.tsx
src/components/lab/simulation-canvas.tsx   SVG animation, reduced motion
src/components/lab/representation-tabs.tsx graph/equation/causal/plain-language views
src/components/lab/adaptation-card.tsx     accept/reject/modify
src/components/lab/counterfactual-panel.tsx
src/components/lab/adaptation-replay.tsx
src/components/lab/accessibility-controls.tsx
src/components/lab/research-mode.tsx
src/app/page.tsx                           landing page
src/app/lab/nuclear-chain-reaction/page.tsx
src/app/layout.tsx                         metadata
src/app/globals.css                        design tokens, high-contrast, reduced-motion CSS
tests/setup.ts                             RTL cleanup
tests/simulation/nuclear-chain-reaction.test.ts   (11 tests)
tests/simulation/counterfactual.test.ts          (5 tests)
tests/adaptation/deterministic-provider.test.ts  (created by subagent)
tests/adaptation/misconception-taxonomy.test.ts  (created by subagent)
tests/components/lab-flow.test.tsx               (10 tests)
tests/components/counterfactual.test.tsx         (3 tests)
e2e/smoke.spec.ts                         Playwright demo smoke
playwright.config.ts
vitest.config.ts
docs/README.md is updated; docs/product-spec.md, rubric-strategy.md, judge-qa.md,
     user-research.md, safety-model.md, architecture.md, initial-commit-report.md
```

## Files modified

- `package.json` (name → unseenlab; scripts: typecheck, test, test:watch, test:e2e; deps: zod, vitest, @testing-library/*, jsdom, @playwright/test)
- `src/domain/evidence.ts` (added trialRecordSchema import, prediction answer choices) — original authored this commit
- `src/domain/experiments.ts` (startingNeutrons engine clamp allows 0)

## Commands run (final state)

| Command | Result |
|---|---|
| `npm install` | success |
| `npm run lint` (eslint) | pass, 0 problems |
| `npm run typecheck` (tsc --noEmit) | pass, 0 errors |
| `npm test` (vitest run) | 63 passed (6 files) |
| `npm run build` (next build) | success, 3 static routes |
| `npx playwright test` | 1 passed |
| `git diff --check` | clean (no whitespace errors) |

## Test results

- Unit tests — simulation invariants: 15 passed (deterministic replay, zero-neutron no-reaction, nonnegativity, max-step and max-population termination, expected-value absorption monotonicity, clamping, monotonic counters, contiguous steps, counterfactual one-variable constraint, immutability, same-seed causal design, disallowed variables).
- Unit tests — adaptation: 35 passed (rule selection, evidence IDs on all proposals, rejection rule, reduced-motion rule, taxonomy classification, determinism, proposal cap, preference application).
- Component tests: 13 passed (prediction required before run, run+outcome+adaptation, accept, reject, safety-ceiling notice, clear session, reduced-motion rendering, step control, replay rendering, replay empty state, counterfactual one-variable emission, counterfactual empty state, counterfactual comparison rendering).
- E2E: 1 passed (open → enter lab → predict → withdraw absorber → run → safety ceiling → adaptation → accept → counterfactual → replay).

## Build result

Production build succeeded; routes: `/`, `/lab/nuclear-chain-reaction`, `/_not-found` — all prerendered static.

## Known limitations

- Only one lab is functional (the two future labs are `planned` cards).
- The adaptation provider is deterministic and offline; a structured LLM provider is designed behind `AdaptationProvider` but not implemented.
- Free-text research answers live in component state only (not persisted) in this commit.
- The adaptation engine's monotonicity assertions are expected-value checks over 30 fixed seeds (single-seed RNG stream divergence near extinction boundaries can flip an endpoint by a hair); margins are ≥ 5×.
- Playwright requires `npx playwright install chromium` on fresh machines (documented in README).
- No structured product test with the design participant has been performed yet (templates only).

## Deferred work

- High-voltage lab, exothermic lab (planned cards only).
- Structured LLM adaptation provider (interface ready).
- Additional user-testing evidence (templates ready in `docs/user-research.md`).
- axe/WCAG automated audit run; demo video; GitHub publication.

## Commit status

- Commit created: YES
- Commit message: `feat: establish UnseenLab adaptive virtual lab foundation`
- Push performed: NO
