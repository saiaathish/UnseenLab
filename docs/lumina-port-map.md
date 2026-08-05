# Lumina Port Map

Status: Phase 0 extraction, `feature/generative-demonstration-engine`
(2026-08-04). Companion to `docs/lumina-provenance.md`. Every claim below was
verified by reading the actual source in
`/Users/saiaathishkarthik/Desktop/UnseenLab/dstl/stem-main` (read-only).

Decision vocabulary:

- **REUSE-CLEANROOM** — the *concept* (contract shape, numerical method,
  determinism discipline) is reimplemented from scratch inside
  `src/demonstrations/` against UnseenLab's stack. No lines are copied.
- **ADAPT** — small idea kept; re-expressed in UnseenLab's own types/helpers.
- **REJECT** — not ported at all, for provenance, architecture, or
  redundancy reasons.

---

## 1. File-by-file classification

| Lumina file | Role | Port decision | UnseenLab target namespace |
| --- | --- | --- | --- |
| `src/types.ts` | `SceneSpec`, `Parameter`, `SimKind`, `Subject` — the bounded JSON contract the AI may emit | REUSE-CLEANROOM (contract shape already re-expressed as `DemoSpecV1`) | `src/demonstrations/spec/demo-spec.ts` (done) |
| `src/engine/core.ts` | `SimModule` lifecycle contract (`init/resize/step/draw/setParam/reset/pointer/readouts/dispose`), `SimContext`, math helpers, `makeRng` (xorshift32 seeded PRNG) | REUSE-CLEANROOM (module contract + seeded PRNG concept; xorshift32 is a well-known public algorithm, reimplemented from its published definition) | `src/demonstrations/renderers/lumina-2d/**` (Agent 10) |
| `src/engine/params.ts` | `pget/cnum/cstr/cbool` — typed readers with fallbacks so a module never sees garbage | ADAPT (trivial accessors; re-express per engine) | `src/demonstrations/renderers/lumina-2d/**` |
| `src/engine/registry.ts` | `SIM_FACTORIES` map, `SIM_INFO` (title/subject/keywords per sim), `createModule` (unknown sim → orbits fallback), `sanitizeSpec` (validate/repair philosophy) | REUSE-CLEANROOM (sanitizeSpec philosophy → §4; keyword catalog → `ENGINE_CATALOG` keywords) | `src/demonstrations/spec/demo-spec.ts` (catalog, done) + `src/demonstrations/validation/**` (Agent 09) |
| `src/engine/runner.ts` | `SimRunner` — owns canvas, rAF loop, DPR, ResizeObserver, pointer capture, dt cap 0.05 s, speed/play, readout throttle 0.12 s, scene swap | REUSE-CLEANROOM (runner lifecycle) | `src/demonstrations/renderers/lumina-2d/**` |
| `src/engine/sims/orbits.ts` | N-body gravity module | REUSE-CLEANROOM | `src/demonstrations/renderers/lumina-2d/engines/orbits/` |
| `src/engine/sims/pendulum.ts` | (double) pendulum module | REUSE-CLEANROOM | `src/demonstrations/renderers/lumina-2d/engines/pendulum/` |
| `src/engine/sims/projectile.ts` | projectile + quadratic drag module | REUSE-CLEANROOM | `src/demonstrations/renderers/lumina-2d/engines/projectile/` |
| `src/engine/sims/gas.ts` | kinetic theory / hard-disk gas module | REUSE-CLEANROOM | `src/demonstrations/renderers/lumina-2d/engines/gas/` |
| `src/engine/sims/charges.ts` | Coulomb field module | REUSE-CLEANROOM | `src/demonstrations/renderers/lumina-2d/engines/charges/` |
| `src/engine/sims/waves.ts` | 2D wave equation / double-slit module | REUSE-CLEANROOM | `src/demonstrations/renderers/lumina-2d/engines/waves/` |
| `src/engine/sims/reaction.ts` | Gray–Scott reaction–diffusion module | REUSE-CLEANROOM (method only; seeding must be made deterministic — §3) | `src/demonstrations/renderers/lumina-2d/engines/reaction_diffusion/` |
| `src/engine/sims/life.ts` | Conway's Game of Life module | REUSE-CLEANROOM (rule only; seeding must be made deterministic — §3) | `src/demonstrations/renderers/lumina-2d/engines/cellular_automaton/` |
| `src/engine/sims/circuit.ts` | RC circuit module | REUSE-CLEANROOM | `src/demonstrations/renderers/lumina-2d/engines/rc_circuit/` |
| `src/generator.ts` | Offline keyword router (`interpretOffline`) + BYOK LLM generator (`generateScene`) + Tavily grounding | REUSE-CLEANROOM for the offline router only (§5); **REJECT** the BYOK/Tavily browser-call portion | `src/demonstrations/generation/offline/**` (Agent 14) |
| `src/scenes.ts` | `FEATURED` (12 curated scenes with hand-tuned parameter values + tutor copy), `BASE_BY_SIM` | ADAPT (concept of curated parameter sets per engine; text is copied from Lumina → clean-room copy) | `src/demonstrations/showcases/**` (Agent 12); parameter keys/values inform `ENGINE_CATALOG.parameterKeys` |
| `src/store.ts` | Zustand app state; `localStorage` key `lumina.settings.v1` holding provider API keys | REJECT (Zustand; browser-stored provider keys) | UNKNOWN (none) |
| `src/lesson.ts` | Lesson-gateway client + client-side fallback lesson (duplicates server quiz/scene logic) | REJECT (server lesson system is out of scope; fallback idea may inform the adaptation system, but no contract) | UNKNOWN (none) |
| `src/components/*.tsx` (12 files) | UI shell: Landing, Lab, Header, SimStage, Controls, Tutor, Gallery, LessonPanel, PromptBar, Settings, AmbientCanvas | REJECT (Vite/React UI; UnseenLab has its own Next.js components and adaptation system) | `src/components/demonstrations/**` conceptually only — UNKNOWN mapping |
| `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/lib/ui.tsx`, `src/vite-env.d.ts` | Vite shell / styling / icon map | REJECT (Vite shell) | UNKNOWN (none) |
| `server/api.py` | FastAPI lesson gateway; in-memory `JOBS` dict; polls Render Workflows | REJECT (Python backend; in-memory job storage) | UNKNOWN (none) |
| `server/lumina_workflow/catalog.py` | Duplicate of `src/scenes.ts` scenes + per-scene quiz bank | REJECT (duplicated catalog — two sources of truth) | UNKNOWN (none) |
| `server/lumina_workflow/llm.py` | Server-side BYOK LLM (openai/groq/gemini/anthropic) + Tavily | REJECT (server BYOK) | UNKNOWN (none) |
| `server/lumina_workflow/pipeline.py` | Lesson pipeline: plan → build sections → quiz → compose | REJECT (lesson pipeline out of scope) | UNKNOWN (none) |
| `server/workflows/lesson.py` | Render Workflows task chain (plan/build×N/quiz/compose) | REJECT (Render Workflow) | UNKNOWN (none) |
| `server/requirements.txt`, `server/.env.example`, `server/README.md`, `server/workflows/__init__.py`, `server/lumina_workflow/__init__.py` | Python infra | REJECT | UNKNOWN (none) |
| `render.yaml`, `railway.json` | Render Blueprint + Railway deploy config | REJECT (deploy infra; UnseenLab ships its own) | UNKNOWN (none) |
| `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `postcss.config.js`, `tailwind.config.js`, `.gitignore` | Build config | REJECT (build config; no port) | UNKNOWN (none) |
| `index.html` | Vite entry; loads Google Fonts (Inter, JetBrains Mono, Sora) from CDN | REJECT (Vite shell + CDN fonts) | UNKNOWN (none) |
| `README.md`, `DEMO.md`, `DEVPOST.md`, `DEPLOY.md` | Hackathon collateral | REJECT (marketing docs; not provenance-relevant) | UNKNOWN (none) |
| `thumbnail.html`, `make_thumb.py`, `lumina-thumbnail.jpg`, `lumina-thumbnail.png`, `devpost-gallery/*.jpg` (8), `lumina-documentation.zip`, `public/lumina.svg` | Marketing assets, screenshots, doc zip, logo | REJECT-no-provenance (see §7) | UNKNOWN (none) |

---

## 2. Per-sim numerical methods, parameters, readouts (verified from code)

All sims read params via `pget(spec, key, fallback)`; ranges below are the
curated ranges from `src/scenes.ts` and the LLM prompt in `src/generator.ts`
(`paramRef()`). `config` is module-specific and read with `cnum/cbool/cstr`.
Substep counts and time scales are module constants.

| # | Sim (file) | Numerical method (verified) | Parameter keys (fallback) | config keys | Readouts | Determinism requirements for the clean-room port |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | orbits (`sims/orbits.ts`) | **Semi-implicit (symplectic) Euler**: kick `v += a·h` then drift `x += v·h`, 6 substeps; `TIME_SCALE = 60` sim-s per real-s; softened inverse-square `a = G·M/(d²+40)` (star) and `G·m/(d²+60)` (mutual); optional mutual gravity toggles N-body chaos; drag-to-throw pointer | `gravity` (1), `starMass` (1800), `planets` (5), `trail` (140) | `mutual` (0\|1) | Bodies, Peak speed, Kinetic E, Mode | Fixed substeps (6); fixed PRNG seed → use `makeRng(20250802)`-equivalent derived from `spec.seed`; body count/positions from the same RNG stream; trail buffer truncation order; dt capped at 0.05 s before `TIME_SCALE` |
| 2 | pendulum (`sims/pendulum.ts`) | **Classical RK4** (four-stage, standard weights 1/6,2/6,2/6,1/6), 8 substeps, `TIME_SCALE = 1.6`; exact coupled double-pendulum EOMs (`den1`, `den2` denominators) or damped single `dω = −(g/L)sinθ − damping·ω`; drag-to-set-angle pointer | `length1` (1.2), `length2` (1.0), `mass1` (1.4), `mass2` (1.1), `gravity` (9.8), `damping` (0) | `double` (bool), `angle1`, `angle2` (deg) | Angle θ₁, Angle θ₂ (double only), Ang. speed, Regime | RK4 stage order and formula shape must match exactly (chaos is sensitive); 8 substeps; start angles from config; trail cap 900 |
| 3 | projectile (`sims/projectile.ts`) | **Semi-implicit Euler with quadratic drag**: `a_x = −k·v·vx`, `a_y = −g − k·v·vy`, 6 substeps, dt cap 0.032 s; auto-relaunch after 1.1 s landed; ideal (vacuum) path drawn analytically for comparison; drag-to-aim cannon pointer feeds back `angle`/`speed` via `ctx.emit` | `angle` (55), `speed` (34), `gravity` (9.8), `drag` (0.006) | — | Range, Max height, Flight time, Launch | Fixed substeps (6); `apex`/`range`/`tof` update order; scale computed from vacuum formulas; landing detection `y <= 0 && vy < 0` |
| 4 | gas (`sims/gas.ts`) | **Event-driven collision model** (not a differential solve): hard disks, equal masses → exchange normal component of velocity (`rel < 0`), overlap separation; wall bounces with impulse accumulation; exponential pressure smoothing `p = 0.9p + 0.1Σ|vx|`; pointer repulsor `F = 900/d²` | `particles` (140), `temperature` (1), `radius` (5) | — | Particles, Temperature, Avg speed, Mixing | Fixed PRNG seed (777); temperature changes rescale all velocities by `√(T_new/T_old)` (keep this to preserve distribution); pairwise collision order (O(n²), i<j); wall/bounce impulse; histogram bins = 26 |
| 5 | charges (`sims/charges.ts`) | **No time integration** — static superposition: `E = strength·4000·q/(d²+100)` per charge (softened inverse-square), rendered as a vector grid with log-scaled arrow length/hue; drag-to-move pointer | `strength` (1), `charges` (4), `density` (26) | — | Charges, Positive, Negative, Field ∝ | Fixed PRNG seed (4242) for charge placement; `step()` is a no-op; field sampling grid step `max(18, min(W,H)/density)`; q alternates sign by index |
| 6 | waves (`sims/waves.ts`) | **2D finite-difference wave equation** (leapfrog-style Verlet): `u_new = (2u − u_prev + c²·lap)·(1 − damping)`, 5-point Laplacian `u[k+1]+u[k−1]+u[k+GW]+u[k−GW]−4u[k]`, `c` (Courant) clamped ≤ 0.49, 2 substeps/frame; barrier with two 5-cell slits (`mode:"slit"`) or twin point sources (`mode:"sources"`); plane-wave source column for slit mode; pointer drops a Gaussian bump | `frequency` (0.5), `separation` (40), `damping` (0.0008), `speed` (0.35) | `mode` ("slit"\|"sources") | Mode, Frequency, Wavelength, Pattern | Grid is fixed-height (GH=150), GW from aspect (140–340) — fix grid or derive from seed for replay; exact Laplacian term order; buffer swap pattern; source phase `sin(t·f·2π)`; damping multiplier applied after update |
| 7 | reaction (`sims/reaction.ts`) | **Gray–Scott, explicit forward Euler**: `U += dU·lap(U) − U·V² + f·(1−U)`; `V += dV·lap(V) + U·V² − (k+f)·V`; 3×3 isotropic diffusion kernel (center −1, orthogonal 0.2, diagonal 0.05); 16 iterations/frame; pointer paints V/U seeds | `feed` (0.037), `kill` (0.06), `diffuseU` (0.16), `diffuseV` (0.08) | — | Feed, Kill, Model, Theory | **GAP: seeding uses `Math.random()` (14 random blotches) — the port must seed from the spec PRNG for deterministic replay**; kernel weights and update order (U then V, both read from old arrays); 16 iters/frame; grid GH=140, GW 130–320 |
| 8 | life (`sims/life.ts`) | **Cellular automaton, B3/S23 rule** (birth on 3, survival on 2 or 3), toroidal (periodic) boundary via modular index; generation accumulator `interval = 1/rate` with ≤4 catch-up steps/frame; per-cell age counter (cap 600) drives hue | `cellSize` (10), `speed` (12), `density` (0.3) | — | Population, Generation, Rule, Class | **GAP: initial seeding uses `Math.random()` — port must use the spec PRNG**; toroidal indexing `((c+cols)%cols)`; B3/S23 exact; age semantics (born=1, survive=min(age+1,600)); paint radius 3×3 |
| 9 | circuit (`sims/circuit.ts`) | **Forward Euler** on the capacitor ODE: `dVc/dt = (V_target − Vc)/τ`, τ = R·C, 8 substeps; auto-toggling switch at `period = clamp(6τ, 1.4, 8) s`; `I = (Vs − Vc)/R`; scope ring buffer (240 samples); no pointer interaction | `voltage` (5), `resistance` (1000), `capacitance` (100) | — | Time constant τ, Cap voltage, Current, State | Fixed substeps (8); dt cap 0.033 s; auto-toggle period formula; scope buffer truncation; reset clears `Vc`, `I`, `switchT`, scope |

Notes common to all nine: the runner caps `dt` at 0.05 s and each module caps its
own `dt` before scaling; sims use fixed seeds (`20250802` orbits, `777` gas,
`4242` charges) rather than a per-spec seed — `DemoSpecV1.seed` must become the
single source of truth. `reaction` and `life` are the only two modules with
nondeterministic seeding today; fixing that is a required clean-room
improvement to meet the "deterministic seeded replay" contract.

---

## 3. What a clean-room port must preserve for determinism

1. **Seeded PRNG everywhere.** Lumina's `makeRng` is xorshift32
   (`s ^= s<<13; s ^= s>>>17; s ^= s<<5`, normalized by 2³²). Reimplement the
   same algorithm or an equivalent documented generator; derive every module's
   stream from `DemoSpecV1.seed` (orbits/gas/charges today use constants;
   reaction/life use `Math.random()` — both must become seed-derived).
2. **Fixed substepping.** Per-sim substep counts (orbits 6, pendulum 8,
   projectile 6, waves 2, reaction 16, circuit 8) and the gas/life
   frame-normalized stepping (gas `h = dt·60`, life generation accumulator)
   must be module constants, never model-supplied.
3. **dt caps.** Runner cap 0.05 s plus per-sim caps (pendulum/projectile/gas/
   circuit 0.032–0.033 s; orbits 0.05 s before `TIME_SCALE`). Identical caps
   are needed or replays diverge under load.
4. **Operation order.** RK4 stage order, Laplacian term order, velocity-kick
   vs position-drift order (orbits/projectile), Gray–Scott U-before-V update,
   buffer-swap patterns (waves/reaction/life), and collision iteration order
   (`i<j`) all affect bit-level results — preserve them.
5. **Fixed or seed-derived grid sizes.** waves GH=150/GW from aspect and
   reaction GH=140/GW from aspect make replay depend on canvas size; the port
   should fix grid dimensions per engine version or derive them from the seed.
6. **Smoothing constants.** gas pressure `0.9/0.1` EMA, reaction kernel
   weights (−1, 0.2, 0.05), waves damping multiplier, circuit auto-toggle
   `clamp(6τ, 1.4, 8)` — all engine constants that change behavior if tuned.

---

## 4. `sanitizeSpec` philosophy → requirements for UnseenLab's validator

`src/engine/registry.ts:146-186` (`sanitizeSpec`) plus `createModule`/`params.ts`
`pget` are the whole of Lumina's validation story. Its operating principles,
restated as requirements:

1. **Total function.** `sanitizeSpec(raw, fallback)` never throws; every branch
   falls back to a runnable spec (`createModule` falls back to orbits).
   Requirement: the validator must always return accept/repair/reject — never
   crash the request.
2. **Known-engine guarantee.** Unknown `sim` → curated fallback.
3. **Parameter hygiene.** Non-objects dropped; numeric coercion via `Number()`
   with defaults `min=0, max=1, step=0.01, value=min`; finiteness check
   `Number.isFinite(min) && Number.isFinite(max) && max > min`; parameters
   sliced to 8; if none survive, the fallback parameter set is used.
4. **String bounding.** `title` ≤ 80, `summary` ≤ 240, `explanation` ≤ 2000
   chars; arrays (`experiments/facts/tags`) string-coerced, empty-filtered,
   sliced to 8.
5. **Config passthrough (weak point).** `config` is accepted as-is if it is an
   object — no per-sim schema check. Requirement: UnseenLab must validate
   `config` against a per-engine Zod schema (e.g. `double: z.boolean()`).
6. **Gaps Lumina did not close (UnseenLab must).** (a) `value` is never clamped
   into `[min,max]`; (b) parameter keys are not checked against the sim's
   allowed set — unknown keys are silently ignored by the module's `setParam`
   if/else chains and `pget` fallbacks; (c) `subject` is type-cast
   (`r.subject as Subject`) without enum validation; (d) no duplicate-key
   dedupe; (e) no integer enforcement for discrete params (modules
   `Math.round()` internally: `planets`, `charges`, `particles`, `density`,
   `cellSize`). All five are handled by `DemoSpecV1`/`ENGINE_CATALOG` shapes:
   clamp `value` into `[min,max]`, whitelist keys against
   `EngineCapability.parameterKeys`, enum-check `trust.level`/`engineId`,
   dedupe keys, and type-check discrete params.
7. **Source tagging.** Lumina forces `source: "llm"` after sanitization and
   carries the model string. UnseenLab's `provenance.source` enum serves the
   same purpose.

---

## 5. Offline generator / keyword router (`src/generator.ts`) → requirements

`interpretOffline(prompt)` (generator.ts:63-126) is the deterministic,
zero-network path. Requirements distilled for `generation/offline/**`:

1. **Total and cheap.** Always returns a valid `SceneSpec`; no network, no
   throw. Fallback sim default is `orbits`.
2. **Normalized keyword scoring.** Prompt lowercased, non-`[a-z0-9\s-]`
   stripped; score = Σ per-keyword (multi-word keyword = 3, single word = 1.4)
   + 1 per title word > 3 chars present; highest score wins.
3. **Variant routing by regex.** pendulum: `/single|simple|harmonic|shm/` →
   simple variant else double; orbits: `/chaos|chaotic|n-?body|three\s*body|binary|slingshot/` → N-body else solar-system; waves: `/two\s*source/` and not `/slit/` → two-source else double-slit; all other sims → first curated scene for that sim (`BASE_BY_SIM`).
4. **Qualitative tuning.** `/fast|quick|energetic|hot/` → `temperature=3,
   speed=55, frequency=0.9`; `/slow|cold|gentle|calm/` → `temperature=0.4,
   speed=18, frequency=0.25`; first number 1–12 in the prompt → `planets` and
   `charges` both set to it.
5. **Regime presets.** reaction: `/spot|dot/` → feed 0.03/kill 0.062;
   `/maze|labyrinth/` → 0.029/0.057; `/mitosis|divide|replicat/` →
   0.0367/0.0649.
6. **Clamping.** All tuned values clamped into the parameter's `[min,max]`.
7. **Identity.** Generated id `offline-<timestamp>`, `source: "offline"`.
8. **Fallback chain concept** (generator.ts:288-352): LLM path with key →
   Tavily grounding → `sanitizeSpec(parsed, fallback)` → on ANY error, return
   the offline spec with a human note. UnseenLab keeps the "always fall back to
   offline" behavior; the BYOK browser calls and Tavily key handling are
   rejected (server-side model route with retry/breaker instead, per
   `docs/generative-demonstrations.md`).

---

## 6. Rejected systems (exact paths)

- **Python FastAPI backend** — `dstl/stem-main/server/api.py`,
  `dstl/stem-main/server/requirements.txt`, `dstl/stem-main/server/.env.example`
- **Server-side BYOK LLM + Tavily** — `dstl/stem-main/server/lumina_workflow/llm.py`
- **Render Workflows** — `dstl/stem-main/server/workflows/lesson.py`,
  `dstl/stem-main/server/lumina_workflow/pipeline.py`, `dstl/stem-main/render.yaml`
- **In-memory job storage** — `JOBS` dict in `dstl/stem-main/server/api.py`
- **Browser BYOK model calls / CORS-bypassing headers** — `dstl/stem-main/src/generator.ts`
  (`buildCall` for gemini/groq/openai/anthropic, incl. the
  `anthropic-dangerous-direct-browser-access` header) and
  `dstl/stem-main/src/components/Settings.tsx`
- **localStorage API keys** — key `lumina.settings.v1` in
  `dstl/stem-main/src/store.ts` (lines 9, 13, 84)
- **Zustand app state** — `dstl/stem-main/src/store.ts` (`useLab`), sole
  `zustand` consumer
- **Vite shell** — `dstl/stem-main/src/main.tsx`, `src/App.tsx`,
  `src/index.css`, `vite.config.ts`, `index.html`, `postcss.config.js`,
  `tailwind.config.js`, `tsconfig*.json`, `railway.json`
- **Duplicated catalogs (two sources of truth)** —
  `dstl/stem-main/server/lumina_workflow/catalog.py` duplicates
  `src/scenes.ts` scenes; `dstl/stem-main/src/lesson.ts` `FALLBACK_QUIZ`
  duplicates the server quiz bank; `SIM_INFO` keywords in
  `src/engine/registry.ts` are re-entered by hand in the LLM prompt
  `paramRef()` in `src/generator.ts`
- **Lesson gateway client** — `dstl/stem-main/src/lesson.ts`
- **UI shell components** — `dstl/stem-main/src/components/*.tsx` (12 files)

---

## 7. Third-party assets — REJECT-no-provenance

None of these carry a license inside the repo, so they cannot be reused with
clearance:

| Asset | Path | Verdict |
| --- | --- | --- |
| Google Fonts Inter / JetBrains Mono / Sora | loaded via `<link>` in `index.html` (CDN only — no font files in repo) | REJECT-no-provenance (not bundled; UnseenLab uses its own typography) |
| Lumina logo | `public/lumina.svg` | REJECT-no-provenance (no license header) |
| Screenshots | `devpost-gallery/00-cover.jpg` … `07-solar-system.jpg` (8 files), `lumina-thumbnail.jpg`, `lumina-thumbnail.png` | REJECT-no-provenance (generated marketing images; no license) |
| Thumbnail tooling | `thumbnail.html`, `make_thumb.py` | REJECT (screenshot tooling, dead for the port) |
| Doc bundle | `lumina-documentation.zip` (re-zips README/DEVPOST/DEMO/DEPLOY/server README/render.yaml) | REJECT (redundant packaging of already-rejected docs) |

---

## 8. Dead / obsolete files (inside Lumina, not ported)

- `thumbnail.html`, `make_thumb.py`, `lumina-thumbnail.jpg`,
  `lumina-thumbnail.png` — one-shot thumbnail generation
- `lumina-documentation.zip` — stale zip of repo docs (timestamps predate
  final DEMO.md edits)
- `devpost-gallery/` — hackathon submission screenshots
- `railway.json` — abandoned in favor of `render.yaml` (two competing deploy
  configs in the repo)
- `server/README.md` — duplicates DEPLOY.md guidance for the gateway
- `README.md`, `DEMO.md`, `DEVPOST.md`, `DEPLOY.md` — hackathon collateral
  (not dead code, but not ported)
- `src/vite-env.d.ts` — Vite boilerplate

## 9. UNKNOWN items

- `nuclear_chain_reaction` (verified engine in `ENGINE_CATALOG`) has **no**
  counterpart in Lumina's nine sims — its provenance is the UnseenLab team's
  own existing lab content, not Lumina.
- Collaborator contribution boundary inside the Lumina codebase (which files
  the collaborator wrote) — `UNCLEAR`, same as `docs/lumina-provenance.md`.
- Exact authorship of `public/lumina.svg` and the `devpost-gallery/`
  screenshots (user vs collaborator vs tooling) — unknown; irrelevant since all
  are REJECT-no-provenance.
