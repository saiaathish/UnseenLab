# UnseenLab

**Adaptive Virtual STEM Laboratory** — IncludAI: The Neurodiversity Hackathon, in partnership with Stanford NNEA · Track 1: AI for Learners Who Think Differently.

> UnseenLab lets students safely perform otherwise inaccessible STEM experiments while an adaptive AI engine changes how each experiment is represented, paced, and controlled according to the learner's demonstrated understanding.

## Problem

K-12 STEM classrooms cannot safely or practically run experiments that are dangerous (chain reactions), radioactive, microscopic, massive, or too slow. Existing virtual labs ship one fixed interface for every learner. Learners who think differently — including neurodivergent learners — often need a different representation, a different pacing, or a different variable structure to build a complete understanding.

The design principle: **adapt the tool to the student, not the student to the tool.**

## Target users

- K–12 learners, with a first design participant: a ~17-year-old high-school senior with disclosed ADHD, an aspiring mountain biker interested in engineering, who reports learning differently from how material is normally presented in class and struggled to build a full understanding of Modern Physics (AP Physics 2) from demonstrations and lab examples alone.
- The participant strongly values **interactivity and animation** — recorded as initial confirmed design preferences.
- UnseenLab is not designed only for this individual, and it never assumes all learners with ADHD share preferences. There are **no diagnosis-based presets** (no "ADHD mode"). Every adaptation follows explicit learner preferences and demonstrated task behavior.

## How the product adapts to the learner

1. The learner predicts the outcome of a trial and states their confidence before running it.
2. The learner runs a deterministic, seeded simulation and watches an interactive animation.
3. The adaptation engine interprets the learner's prediction, behavior (variables changed, replays, views opened), and trial outcomes against a small bounded misconception taxonomy.
4. The engine offers an **explainable adaptation card**: what was observed, what would change, and why it may help. The learner **accepts, rejects, or modifies** it. Nothing is silently applied.
5. The **Counterfactual Microscope** changes exactly one variable (same randomness seed) and shows both runs side by side.
6. The **Adaptation Replay** reconstructs the whole journey: prediction → variables changed → outcome → possible conceptual friction → adaptation offered → decision → updated prediction → counterfactual → evidence of changed understanding.

The AI layer may interpret and adapt; it can never change simulation equations or outcomes. The scientific core is deterministic and offline.

## Current module

### Nuclear Chain Reaction (conceptual, fictionalized)

- Variables: absorber position, starting neutrons, material density, absorption probability, duration, randomness seed.
- Outcomes: free neutron population, absorbed/escaped neutrons, reaction events, abstract energy units.
- Seeded randomness: same seed + same parameters → identical result, every time.
- Safety caps: population ceiling (500), step limit (120), parameter clamping, no negative values, guaranteed termination.
- Explicit disclaimer: conceptual and simplified; **not** a real reactor model; must not be used for real engineering or safety decisions. No enrichment procedures, no critical-mass calculations, no real materials, no weapon-relevant data.

Future labs (High-Voltage Circuit Failure, Exothermic Thermal Runaway) are registered as `Planned` and are not functional.

## AI role vs. deterministic role

- **AI (adaptation layer)** — interprets learner predictions and interaction history, classifies possible conceptual friction, selects targeted pedagogical interventions, explains every proposal, tracks accept/reject/modify decisions. Current implementation is a deterministic, offline, rule-based provider with a typed provider interface (`AdaptationProvider`), designed to be replaceable by a structured hosted/local LLM provider without touching the rest of the system.
- **Simulation (scientific core)** — seeded, deterministic, unit-tested against invariants. No LLM-generated calculations, no arbitrary code execution, no hardcoded results.

## Accessibility controls

- Animation-first experience with play / pause / step forward / step backward / reset
- Reduced-motion mode (static frame rendering, no motion, no pulses)
- Adjustable animation speed (0.25×–2×)
- Low / medium / full information density
- One-variable-at-a-time mode
- Persistent instructions and a plain-language state summary (also the screen-reader summary)
- Full keyboard navigation, visible focus states
- Adjustable text size (1×–1.5×)
- High-contrast theme
- Graph, equation, causal, and plain-language representations, each with its own tab
- No timer, no forced audio, no flashing
- No diagnosis disclosure, no account, no tracking — everything stays in the local browser

## Safety boundaries

Educational principles only. The nuclear module uses fictionalized dimensionless values, never real materials or facility data, and includes a visible disclaimer. Future labs must follow the same rule: teach causal principles without providing operationally dangerous procedures. See `docs/safety-model.md`.

## Local setup

```bash
npm install
npm run dev        # http://localhost:3000
```

Requires Node 20+ (built against Node 22). No API key, no database, no auth, no telemetry.

## Tests

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run (unit + component)
npm run test:e2e    # Playwright smoke (requires `npx playwright install chromium`)
npm run build       # production build
```

- 60 unit/component tests: simulation invariants, seed reproducibility, counterfactual one-variable constraint, adaptation rule selection, evidence IDs, preference validation, session persistence, main learner flow, reduced motion, accept/reject, replay, clear-session.
- 1 Playwright e2e smoke: open → enter lab → predict → withdraw absorber → run → adaptation → accept → counterfactual → replay.

## Architecture

```text
src/
  app/                     Next.js App Router (landing + lab page)
  components/lab/          experiment shell, prediction, variables, canvas,
                           representation tabs, adaptation card,
                           counterfactual, replay, accessibility, research mode
  domain/                  typed schemas: experiments, learner, evidence,
                           adaptation contract (Zod-validated)
  simulation/              seeded engine + counterfactual microscope
  adaptation/              provider interface, deterministic provider,
                           misconception taxonomy
  storage/                 anonymous local session (Zod-validated)
tests/                     unit + component tests
e2e/                       Playwright smoke
docs/                      product spec, rubric strategy, judge Q&A,
                           user research, safety model, architecture,
                           initial commit report
```

See `docs/architecture.md` for the component diagram and data flow.

## Current limitations

- One lab (Nuclear Chain Reaction) is functional; two are registered as planned.
- The adaptation provider is deterministic and offline (bounded rules + conservative keyword classification). A structured LLM provider is designed-for but not implemented.
- Free-text research answers are held in component state only (not persisted) in this commit.
- No multi-user accounts, no server, no database — intentional for the hackathon scope.

## Hackathon status

- Substantially built during the hackathon: working product, tests, docs, and demo flow.
- User testing: initial design participant interviewed; his preferences are recorded in `docs/user-research.md`. **No structured product test has been performed yet** — the testing templates in that document are placeholders and are not claimed as results.

## IncludAI requirements

- AI used meaningfully: prediction interpretation, misconception mapping, targeted intervention, explainable accept/reject adaptations (not a chat wrapper).
- Designed/tested with a real neurodivergent user: initial design participant (feedback recorded).
- Public GitHub repository: this repository.
- Three-minute demo video: planned; demo script in `docs/product-spec.md` §Demo flow.
- User feedback documented: `docs/user-research.md` (confirmed preferences + empty templates awaiting real test sessions).
