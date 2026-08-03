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

- **AI (adaptation layer)** — interprets learner predictions and interaction history, classifies possible conceptual friction, selects targeted pedagogical interventions, explains every proposal, tracks accept/reject/modify decisions.
  - Two-tier provider behind one typed `AdaptationProvider` interface (`createAdaptationProvider()` in `src/adaptation/llm-provider.ts`):
    - **Structured LLM provider** (`StructuredLLMAdaptationProvider`) — active only when `NEXT_PUBLIC_LLM_ENABLED=1` (build-time public flag) AND a server-side `LLM_API_KEY` is set. It POSTs a typed, bounded payload to the server bridge (`POST /api/adapt`), which calls an OpenAI-compatible chat completions API and returns a schema-validated JSON answer (enum-only misconception and intervention, confidence 0..1, 1–3 evidence strings, optional follow-up question). ANY failure — no key, timeout, invalid JSON, schema violation — falls back to the deterministic rules; the key never leaves the server and no raw model text is returned unvalidated.
    - **Deterministic offline provider** — bounded rules + conservative keyword classification; the default and always-available fallback.
  - Every proposal is tagged with a source — `"llm"` or `"rules"` — shown in the UI as "AI interpretation" vs "Offline rules", so the learner can always tell AI interpretation apart from the simulation result.
- **Simulation (scientific core)** — seeded, deterministic, unit-tested against invariants. No LLM-generated calculations, no arbitrary code execution, no hardcoded results. The AI layer can never alter equations, parameters, or outcomes. See `docs/safety-model.md`.

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

Requires Node 20+ (built against Node 22). No database, no auth, no telemetry.

### Optional: enable the hosted model

The app works fully offline without any of this — everything runs on the deterministic rules. To enable the structured LLM adaptation path:

```bash
cp .env.example .env        # then fill in your key
export NEXT_PUBLIC_LLM_ENABLED=1
export LLM_API_KEY=sk-...   # server-side only — never commit a real key
# optional: export LLM_API_BASE_URL=https://api.openai.com/v1
# optional: export LLM_MODEL=gpt-4o-mini
npm run dev                 # restart the dev server after changing env
```

Notes:

- `NEXT_PUBLIC_LLM_ENABLED` is baked at build time; `LLM_API_KEY` is read only server-side by `POST /api/adapt` and never leaves the server.
- The model never sees simulation internals beyond the typed session summary (prediction, trial outcome summary, behavior counts) and never receives personal identity.
- Any model failure falls back silently to the deterministic rules; proposals are labeled "AI interpretation" vs "Offline rules" in the UI.
- See `docs/safety-model.md` for the AI layer's boundary.

## Tests

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run (unit + component)
npm run test:e2e    # Playwright smoke (requires `npx playwright install chromium`)
npm run build       # production build
```

- 98 unit/component tests passing (measured on the latest run; the LLM provider tests continue to grow the adaptation count): simulation invariants, seed reproducibility, counterfactual one-variable constraint, adaptation rule selection (deterministic + LLM provider, schema, factory), evidence IDs, preference validation, session persistence, main learner flow, reduced motion, accept/reject, replay, clear-session.
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
- The structured LLM provider is implemented but optional: it activates only with `NEXT_PUBLIC_LLM_ENABLED=1` plus a server-side `LLM_API_KEY`; without them everything runs on the deterministic offline rules.
- Free-text research answers are held in component state only (not persisted) in this commit.
- No multi-user accounts, no server, no database — intentional for the hackathon scope.
- No structured user test has been performed yet — the testing kit (`docs/user-testing-kit.md`) is ready and `docs/user-research.md` templates are placeholders.

## Hackathon status

- Substantially built during the hackathon: working product, tests, docs, and demo flow.
- User testing: initial design participant interviewed; his preferences are recorded in `docs/user-research.md`. **No structured product test has been performed yet** — the testing templates in that document are placeholders and are not claimed as results.

## IncludAI requirements

- AI used meaningfully: prediction interpretation, misconception mapping, targeted intervention, explainable accept/reject adaptations (not a chat wrapper).
- Designed/tested with a real neurodivergent user: initial design participant (feedback recorded).
- Public GitHub repository: this repository.
- Three-minute demo video: planned; demo script in `docs/product-spec.md` §Demo flow.
- User feedback documented: `docs/user-research.md` (confirmed preferences + empty templates awaiting real test sessions).
