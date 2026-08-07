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

The lab runs a **repeatable loop** — a learner can run several trials in one session, without reloading, and every trial is recorded:

1. **Predict** — the learner predicts the outcome of a trial and states their confidence before running it. A prediction is required before **every** trial.
2. **Run** — the learner runs a deterministic, seeded simulation and watches an interactive animation.
3. **Understand** — the lab holds the prediction next to the **truthful trial outcome** and, alongside it, explains what it observed: the adaptation engine interprets the learner's prediction, behavior (variables changed, replays, views opened), and trial outcomes against a small bounded misconception taxonomy.
4. **Adapt** — the engine offers an **explainable adaptation card**: what was observed, what would change, and why it may help. The learner **accepts, rejects, or modifies** it. Nothing is silently applied.
5. **Update the prediction** — the learner submits an updated prediction, which unlocks the next trial.
6. **Run another trial** — a second, third, or later trial with a changed variable; the loop repeats. Trials are appended, never overwritten, so the replay shows the whole journey.

The **Counterfactual Microscope** changes exactly one variable (same randomness seed) and shows both runs side by side; the **Adaptation Replay** reconstructs the journey: prediction → variables changed → outcome → possible conceptual friction → adaptation offered → decision → updated prediction → counterfactual → evidence of changed understanding. Change evidence is truthful from the very first run: the first trial's "changed since last run" diff is computed against the experiment's actual default parameters, and later trials diff against the previous real trial.

The AI layer may interpret and adapt; it can never change simulation equations or outcomes. The scientific core is deterministic and offline.

## Homepage

The landing page opens with a **topic input** hero ("What topic do you need help with?"). Typing a supported topic (e.g., "nuclear chain reaction", "fission", "absorber") routes straight into the matching lab; unsupported topics get a friendly explanation and a pointer to the available lab. Below the hero: "How it works", the "Available lab" card with a **"Start this lab"** link, "Future labs" (registered as planned, non-functional), an "Accessibility" section, and the conceptual-safety disclaimer in the footer.

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

## Generative demonstration engine (flag-gated)

Behind `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1` (default `0` — the current
product is unchanged), the homepage adds an ask-to-demo workflow: a learner
asks for any STEM concept, the AI emits a **bounded JSON specification**
(`DemoSpecV1`), a validator sanitizes and classifies it, and deterministic
renderers build the experience. The model is never asked to write code.

- **Three visible trust levels**: Verified simulation (curated engines only),
  Conceptual demonstration, Explanatory animation — never conflated.
- **Prediction-first**: every demo requires a prediction before controls
  unlock; curated predictions are graded by engine truth, model specs never.
- **Approved 3D primitives** (direct Three.js) with three immersive showcase
  families: orbital mechanics, electric fields, wave interference.
- **Accessible equivalent for every demo** — 2D stage, diagram, table,
  timeline or text sequence — so predict → manipulate → observe → compare →
  adapt works without 3D.
- **Offline router + generator** keep the whole learning flow working with no
  model; the hosted pipeline (bounded prompt, strict JSON, retry, circuit
  breaker, rate limit) falls back to it honestly with a source badge.
- Rollback is one line: set the flag back to `0`. The Nuclear Chain Reaction
  lab remains reachable in both states.

See `docs/generative-demonstrations.md`, `docs/demo-spec.md`,
`docs/scientific-trust.md`, `docs/3d-renderer.md`, `docs/generation-pipeline.md`,
`docs/demo-benchmark.md`, `docs/accessibility-equivalents.md`.

## Accessibility controls

- Animation-first experience with play / pause / step forward / step backward / reset
- Reduced-motion mode honoring the operating-system preference (`prefers-reduced-motion`) and an in-app override (static frame rendering, no motion, no pulses)
- Adjustable animation speed (0.25×–2×)
- Low / medium / full information density
- One-variable-at-a-time mode
- Persistent instructions and a plain-language state summary (also the screen-reader summary); no per-frame `aria-live` announcements during playback
- Full keyboard navigation, visible focus states; the Adaptation Replay dialog traps focus and restores it on close
- Adjustable text size (1×–1.5×), applied at the root font-size so all text scales
- High-contrast theme
- Graph, equation, causal, and plain-language representations as WAI-ARIA tabs (roving tabindex + arrow keys), plus preferred-representations choice
- No timer, no forced audio, no flashing
- No diagnosis disclosure, no account, no tracking — everything stays in the local browser
- The former "feedback timing" control was intentionally removed: it was never wired to any behavior, and shipping a control that does nothing would break trust. Feedback behavior is not configurable; if it ever is, the control will return with a real effect.

## Safety boundaries

Educational principles only. The nuclear module uses fictionalized dimensionless values, never real materials or facility data, and includes a visible disclaimer. Future labs must follow the same rule: teach causal principles without providing operationally dangerous procedures. See `docs/safety-model.md`.

## Local setup

```bash
npm install
npm run dev        # http://localhost:3000
```

Requires Node 20+ (built against Node 22). **Guest-first by design**: the lab is fully usable with no account, no Firebase project, no MongoDB, and no hosted model — everything works locally and offline (deterministic rules, localStorage evidence, JSON export).

The optional platform layer (Firebase Auth + MongoDB) adds: Google sign-in, saved preferences, cloud-saved sessions, cross-device resume, a personalized dashboard, and account settings. Without the Firebase/Mongo env vars the app degrades gracefully to guest-only mode (no crash, no auth wall). The core app has no telemetry; the only logging in the product is the optional server bridge's safe telemetry (model, fallback reason, elapsed milliseconds) when the hosted path is enabled. See `docs/firebase-mongodb-setup.md` for the exact external configuration checklist.

### Optional: enable the hosted model

The app works fully offline without any of this — everything runs on the deterministic rules. To enable the structured LLM adaptation path, set the following environment variables (names only; see `.env.example` for a template):

- `NEXT_PUBLIC_LLM_ENABLED` — build-time public flag (`1` enables the hosted path in the client build)
- `LLM_API_KEY` — server-side only; never commit a real key, and it never leaves the server
- `LLM_API_BASE_URL` — optional; OpenAI-compatible chat completions base URL
- `LLM_MODEL` — optional; model name
- `LLM_DISABLE_THINKING` — optional; when `1`, the client sends `thinking: { type: "disabled" }` to suppress chain-of-thought (only for providers that support the field)

```bash
cp .env.example .env        # then fill in your key
npm run dev                 # restart the dev server after changing env
```

Notes:

- `NEXT_PUBLIC_LLM_ENABLED` is baked at build time; `LLM_API_KEY` is read only server-side by `POST /api/adapt` and never leaves the server.
- The model never sees simulation internals beyond the typed session summary (prediction, trial outcome summary, behavior counts) and never receives personal identity.
- Any model failure — no key, timeout, invalid JSON, schema violation — falls back silently to the deterministic rules; proposals are labeled "AI interpretation" vs "Offline rules" in the UI, and telemetry logs only the model, the fallback reason, and elapsed milliseconds.
- See `docs/safety-model.md` for the AI layer's boundary.

## Tests

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run (unit + component)
npm run test:e2e    # Playwright against a production build on port 3100 (requires `npx playwright install chromium`)
npm run build       # production build
```

Note on `node`: on this machine the default PATH `node` is a Bun shim that
breaks mongodb/bson test loads and the production build. Run the gates with
real Node on PATH instead:

```bash
env PATH="/opt/homebrew/opt/node/bin:$PATH" npm test
env PATH="/opt/homebrew/opt/node/bin:$PATH" npm run build
```

- **1230 unit/component tests across 73 files** passing under real Node (measured 2026-08-07): simulation invariants, adaptation rules (deterministic + LLM + retry/circuit-breaker reliability), session persistence, multi-trial flow, reduced motion, replay truthfulness, plus the platform layer — redirect-safety (open-redirect vectors), preference mapping, onboarding wizard, dashboard/settings, cloud-session conflict policy + optimistic concurrency (revision/409/idempotent replay), guest-import idempotency, auth callback routing, session-route security (origin check, rate limit), research-mode consent/recorder/export — plus the generative demonstration engine: DemoSpecV1 schema/sanitizer/science-policy (61), nine deterministic 2D engines with physics-verified numerics (24), intent + word-aware offline router + generator (190), 3D primitive renderer lifecycle (37), hosted generation pipeline + circuit breaker (31), Mongo persistence + owner isolation (38), 3D showcases with engine-asserted predictions (22), performance/a11y hardening (29), and a hostile red-team suite + 97-prompt benchmark (189). The lesson-workspace redesign adds: canonical graph invariants (`template-builder` 8), accessible diagram parity (3), 3D graph derivation + interaction surface (extended `primitive-3d` suite), lesson rail state machine (7), lesson-rail accessibility (7), rewritten demo shell (13).
- **58 Playwright e2e tests across 11 specs** (mode-dependent pass/skip counts; latest flag-on run: 47 passed/11 env-gated, 0 failed): demo smoke, keyboard-only core flow (LLM-aware waits), homepage topic routing + auth entry, the repeatable multi-trial loop, auth dialog behavior (guest-build gated), route protection, an accessibility matrix (keyboard/focus, reduced motion, text scale, 320px, contrast), a console/perf/fallback quality pack, the demo lesson-rail spec (70/30 layout, rail gating, interaction completion, persisted steps; self-skips unless the build was baked with `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1`), and two env-gated real-backend specs — cross-device resume and two-user browser isolation (4/4 vs live Firebase + Atlas).

## Architecture

```text
src/
  app/                     Next.js App Router (landing + lab page)
    api/adapt/route.ts     server bridge: typed payload -> hosted model -> validated answer
    api/auth/              session-cookie mint (POST /api/auth/session) + logout
    api/account/           profile + preferences (GET/PATCH/PUT/DELETE)
    api/cloud/sessions/    cloud session upsert/list/delete/complete
  components/lab/          experiment shell, prediction, variables, canvas,
                           representation tabs, adaptation card,
                           counterfactual, replay, accessibility, research mode
  components/ui/           homepage: topic-input hero, wave background, mini navbar
  lib/firebase/            Firebase browser config + admin session-cookie verify/mint
  lib/mongo/               server-only MongoDB client + row types
  lib/topic-routing.ts     homepage topic -> supported/unsupported lab routing
  domain/                  typed schemas: experiments, learner, evidence,
                           adaptation contract (Zod-validated)
  simulation/              seeded engine + counterfactual microscope
  adaptation/              provider interface + factory, deterministic provider,
                           structured LLM provider, llm-client, llm-schema,
                           misconception taxonomy
  storage/                 anonymous local session (Zod-validated)
tests/                       vitest unit/component suite (37 files)
e2e/                       Playwright: 10 specs (guest + env-gated real-backend)
docs/                      product spec, rubric strategy, judge Q&A,
                           user research, safety model, architecture,
                           Firebase/Mongo setup, security, benchmark,
                           demo script, claim register, initial commit report
docs/                      product spec, rubric strategy, judge Q&A,
                           user research, safety model, architecture,
                           initial commit report
```

See `docs/architecture.md` for the component diagram and data flow.

## Current limitations

- One lab (Nuclear Chain Reaction) is functional; two are registered as planned.
- The structured LLM provider is implemented but optional: it activates only with `NEXT_PUBLIC_LLM_ENABLED=1` (build time) plus a server-side `LLM_API_KEY`; without them everything runs on the deterministic offline rules.
- Free-text research answers are held in component state only (not persisted) in this commit.
- Cloud features (Google sign-in, cross-device sync) require a Firebase project (Google sign-in enabled) and a MongoDB Atlas cluster (or local MongoDB); they are fully implemented and tested with mocked clients, but the real OAuth smoke test is `NOT_RUN_EXTERNAL_CREDENTIALS` until credentials are configured (see `docs/firebase-mongodb-setup.md`).
- On a shared device, local guest evidence is device-scoped (not per-account) by design — sign-in never deletes it.
- `npm audit` reports 3 high findings in `sharp` (transitive via Next.js image optimization; the app does not use `next/image`). Fixing requires `next@16.3.0`, intentionally deferred from this branch.
- **User research is honest but incomplete: the initial design participant was interviewed and his confirmed preferences shaped the product, but no structured product-test session has been performed yet.** The testing kit (`docs/user-testing-kit.md`) and the templates in `docs/user-research.md` are ready and empty — a real participant session is still required, and nothing in this repo claims a result that session has not produced. There is no "validated" or "statistically significant" claim anywhere.

## Hackathon status

- Substantially built during the hackathon: working product, tests, docs, and demo flow.
- User testing: initial design participant interviewed; his preferences are recorded in `docs/user-research.md`. **No structured product test has been performed yet** — the testing templates in that document are placeholders, not results, and no learning-outcome claim is made.

## IncludAI requirements

- AI used meaningfully: prediction interpretation, misconception mapping, targeted intervention, explainable accept/reject adaptations (not a chat wrapper).
- Designed/tested with a real neurodivergent user: initial design participant (feedback recorded).
- Public GitHub repository: this repository.
- Three-minute demo video: planned; demo script in `docs/product-spec.md` §Demo flow.
- User feedback documented: `docs/user-research.md` (confirmed preferences + empty templates awaiting real test sessions).

## License

Apache License 2.0. See the `LICENSE` file in the repository root.
