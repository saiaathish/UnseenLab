# UnseenLab — Submission Evidence Checklist

> **RE-STAMPED on the final-hardening branch.** Corrected for the current product: optional
> structured LLM provider implemented (labeled, fallback-safe), accessibility fixes shipped
> (focus trap, OS reduced motion, WAI-ARIA tabs, no aria-live spam, effective text scale),
> `feedbackTiming` control removed, multi-trial loop, five unused `public/` SVGs deleted,
> runtime deps now include `gsap` and `three`, and current test counts are 166 unit/component
> (17 files) + 12 e2e (4 specs). The "no LLM in the build" and "zero network calls" framings
> are superseded as noted below.

Use this as the final sweep before submitting. All citations point at the main repository tree at `/Users/saiaathishkarthik/Desktop/UnseenLab` unless a file is explicitly called out as part of the audit worktree (`UnseenLab-audit-worktree/`). Statuses are inspection-based; nothing here claims a test result that was not recorded.

---

## SECTION 1 — Requirements checklist

| Requirement | Required evidence | Current status | Where recorded |
|---|---|---|---|
| Three-minute demo video | MP4 ≤ 3:00 (target 2:45), English or subtitles, shows the real product | **NOT CREATED** — README says "planned; demo script in `docs/product-spec.md` §Demo flow" (`README.md:128`); script section exists (`docs/product-spec.md:74`) | Submission link field |
| Public GitHub repository | URL that opens logged-out; README renders; no secrets | **NOT VERIFIED** — README asserts "Public GitHub repository: this repository" (`README.md:127`) but no remote URL was confirmable in this audit; **must check before submission** | Submission link field |
| Project description | Concise, accurate pitch (not "a chat wrapper") | **PASS by inspection** — problem statement and design principle at `README.md:7-17`; pitch on landing page (`src/app/page.tsx:16-25`) | README + landing |
| Track selected | Track 1 stated | **PASS** — "Track 1: AI for Learners Who Think Differently" (`README.md:3`) | README |
| Real neurodivergent-user involvement | Who, what they said, what changed | **PARTIAL** — initial design participant documented (age, disclosure, preferences) with a design-revision log (`docs/user-research.md:5-30`); **no structured product test yet** — honestly disclosed (`README.md:121`; empty templates `docs/user-research.md:32-45`). Acceptable as-is if claims stay scoped; a consent-covered test session strengthens it | `docs/user-research.md` |
| Meaningful AI | The AI layer does something real and demonstrable | **RESOLVED** — two honest layers: a deterministic bounded-rules engine (default, `src/adaptation/deterministic-provider.ts`) and an implemented optional structured LLM provider behind `POST /api/adapt` (`src/adaptation/llm-provider.ts`, `llm-client.ts`, `llm-schema.ts`, `src/app/api/adapt/route.ts`), gated by `NEXT_PUBLIC_LLM_ENABLED` + server `LLM_API_KEY`, schema-validated, labeled "AI interpretation" vs "Offline rules", falling back to the rules on ANY failure | README + landing + code |
| Accessibility evidence | Concrete: keyboard-only, reduced motion, screen-reader, focus | **PARTIAL (verification pending)** — previously verified failures are fixed: replay-dialog focus trap (initial focus + restore), OS `prefers-reduced-motion`, WAI-ARIA tabs with roving tabindex, no per-frame `aria-live` spam, effective text scale (root font-size), `feedbackTiming` control removed. What remains is *verification*, not code: a keyboard-only pass and a screen-reader pass by a non-implementer, plus an automated axe/WCAG scan | Gates D + video |
| Technical evidence | Tests, build, determinism | **PARTIAL** — suites exist (`tests/` — simulation, counterfactual, adaptation incl. LLM provider/schema/factory, components, lib topic-routing; `e2e/` — smoke, keyboard, homepage, multi-trial). Current counts: 166 unit/component tests across 17 files + 12 e2e tests across 4 specs; **fresh `npm run test` / `test:e2e` output must be recorded for the submission** | `tests/`, `e2e/`, README |
| Safety disclaimer | Visible in product and README | **PASS** — disclaimer exists (`src/domain/experiments.ts:12-15`) and renders on the landing page (hero footer) and lab header, **always visible regardless of information density** (previously hidden in low-density mode; fixed on the final-hardening branch) | `src/domain/experiments.ts`, README |
| Third-party assets disclosure | List fonts, images, libraries | **PARTIAL** — dependencies are open-source and listed in `package.json` (next, react, react-dom, zod, gsap, three — no AI/LLM SDK bundled; the hosted path is an optional server call to an OpenAI-compatible API); fonts are Geist via `next/font/google` (self-hosted at build). The five default create-next-app SVGs (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) were **deleted** on the final-hardening branch | `package.json`, `public/` |
| Originality | No copied demo code presented as own | **PASS by inspection** — all lab logic is custom (`src/simulation/nuclear-chain-reaction.ts:53-118`, Mulberry32 `:25-34`); the only boilerplate is the default Next.js scaffold | Repo diff/commit history |
| Pre-existing code disclosure | Any code not built during the event flagged | **PARTIAL** — README says "Substantially built during the hackathon" (`README.md:120`) but no explicit pre-existing-code disclosure; if any component predates the event, state it | README `:118-121` |
| English or subtitles | Video and artifacts in English | **PASS** — all product and doc copy is English | All artifacts |
| No invented metrics | Every number traceable to a recorded run | **PASS (with discipline)** — the docs' honesty rule explicitly forbids fabricated results (`docs/user-research.md:3,56-61`); export label says "Not a statistically validated learning study" (`src/storage/session-storage.ts:94-95`). **Do not add impact numbers in the video without a real session** | `docs/user-research.md`, `src/storage/session-storage.ts` |
| No unsupported medical claims | No claim that the product treats ADHD | **PASS** — "no diagnosis-based presets" repeated (`README.md:17`, `docs/user-research.md:9,30`, `src/app/page.tsx:119-120`); no medical language anywhere | README, docs |
| No dangerous procedural content | No build/weapon/reactor guidance | **PASS by inspection** — fictionalized dimensionless model (`src/domain/experiments.ts:3-8`), no real values (Group A, `safety-abuse-cases.md`), safety model forbids operational content (`docs/safety-model.md:7-23`) | `safety-abuse-cases.md`, `docs/safety-model.md` |

---

## SECTION 2 — Common hackathon tells (and which ones UnseenLab shows)

| Tell | Why judges hate it | Detection method | Current status |
|---|---|---|---|
| Slides-only demo | Shows a pitch, not a product; the judging rubric is 25% usability and judges cannot verify it | Watch the video: does it show clicks on the real URL, or screenshots of the repo? | **NOT DETECTED** — no video exists yet; the e2e smoke (`e2e/smoke.spec.ts`) is a scriptable proof the flow is real; record the real product |
| Hardcoded happy path | Demo breaks the moment a judge deviates | Change one variable before "Run trial" and watch the outcome; edit the prediction text; withdraw the absorber fully (`absorberPosition` → 0) | **NOT DETECTED by inspection** — engine is parameter-driven (`src/simulation/nuclear-chain-reaction.ts:53-118`), counterfactual covers one-variable deviations; still, rehearse a deviation on camera |
| Fake data presented as real | Judges will ask "where did the numbers come from?" | Check every number in the video against a recorded session or the engine; check the export label (`src/storage/session-storage.ts:94-95`) | **NOT DETECTED** — no claims made yet; the repo's honesty rule (`docs/user-research.md:3`) is a positive signal; keep it that way in the video |
| "We plan to..." | The submission is a deck, not a build | Grep README/docs for "planned" — the honest `README.md:121` says "No structured product test has been performed yet" | **PARTIALLY DETECTED** — future labs are labeled "Planned lab." (`src/domain/experiments.ts:247,257`) and the landing marks them "Not built yet" (`src/app/page.tsx:72-74`): that is honest labeling, fine in the demo, but do not spend video time on them |
| Default theme | Signals a rushed submission; hurts presentation quality (10%) | Grep for create-next-app boilerplate: the five default SVGs (`public/next.svg`, `public/vercel.svg`, `public/globe.svg`, `file.svg`, `window.svg`) were **deleted** on the final-hardening branch; verify none remain and that the scaffold README is not the submission README (`README.md` is the full product doc) | **RESOLVED (final-hardening)** — verify before submission |
| Architecture before demo | Boring; judges want to see the learner | Reorder the video: show the learner flow first, architecture only if a judge asks | **NOT YET RELEVANT** — video not recorded; script (`docs/product-spec.md` §Demo flow, `validation-pack/demo-script.md`) is learner-first |
| Missing error states | Judges will hit an error; unrehearsed failure is the most common demo death | Deliberately: run a trial without a prediction (`src/components/lab/experiment-shell.tsx:165-171` shows a notice — rehearsed); clear localStorage mid-demo (`src/storage/session-storage.ts:102-110`); open replay with no trials (`src/components/lab/adaptation-replay.tsx:51-59` shows an empty state) | **PARTIALLY COVERED by inspection** — error/empty states exist; must be rehearsed on camera |
| Unverified impact claims | "Learners improved 40%" with no test is a disqualifier | Ask: which recorded session backs this number? (`docs/user-research.md:32-45` templates are empty) | **NOT DETECTED** — no impact numbers exist; omit them (see Section 1, "No invented metrics") |
| Generic "AI-powered" differentiation | Every hackathon says AI; judges probe what it does | **The definitive test: remove the "AI" and see if anything changes.** Honest answer today: the deterministic rules engine is the default and the demo runs on it; the optional structured LLM provider adds a labeled "AI interpretation" layer behind `/api/adapt` with schema-validated output and deterministic fallback. Frame the demo as "deterministic adaptive engine by default, optional labeled AI interpretation" — and show the fallback proof (model down → "Offline rules" badge) if a judge asks | **RESOLVED (final-hardening)** — framing aligned; demo must keep the labels and optionality visible |
| Video over 3 minutes | Hard rule; judges stop watching | Check the file duration and a hard 2:45 rehearsal stopwatch | **NOT DETECTED** — video not created; block time to record |
| Missing required field | Submission form rejects or judges dock points | Walk the submission form against Section 1 with a second person | **NOT EVALUATED** — do a dry run of the form |
| Private repository | Judges cannot verify the code | Open the GitHub URL in a logged-out browser | **NOT VERIFIED** — must be made public before submission (`README.md:127` claims it) |
| User engagement only after completion | Testing after the demo means it never shaped the product | Check the design-revision log: `docs/user-research.md:22-30` shows the participant's preferences shaped the product **before** build (animation center, prediction-before-run, offer-don't-apply adaptations) | **NOT DETECTED** — this is a strength; cite the revision log in the Q&A |
| Persisted-looking data that is not persisted | Judges reopen the page and the "results" vanish | Research-mode free text lives only in component state (`src/components/lab/research-mode.tsx:25-27` comment; disclosed in `README.md:115`) — reloading loses it; trial evidence *does* persist (`src/storage/session-storage.ts:44-69`) | **PARTIALLY DETECTED** — disclosed honestly; if the demo relies on research-mode answers, note they are ephemeral |

---

## What to do with this checklist (one page)

1. Make the repo public; confirm the URL logged-out.
2. Run and record the full suite (`npm run test`, `test:e2e`, `build`, `lint`, `typecheck`). Expected: 166 unit/component tests (17 files) + 12 e2e tests (4 specs) green; lint/typecheck clean.
3. Record the ≤3:00 demo + backup, learner-first, with one deliberate deviation, an accept *and* a reject of an adaptation, the disclaimer visible, a second trial (multi-trial loop), and zero invented metrics.
4. Verify the accessibility fixes by hand (keyboard-only pass, screen-reader pass, axe/WCAG scan) — the code fixes are shipped; only verification remains.
5. Run one structured user-testing session with the design participant (still required — no results exist) or keep claims scoped to the design interview.
6. In every artifact, call the adaptation layer what it is: deterministic rules by default, with an optional, labeled, schema-bounded AI-interpretation layer behind `/api/adapt` that falls back to the rules on any failure.
