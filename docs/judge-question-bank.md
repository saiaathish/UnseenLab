# UnseenLab — Final Judge Question Bank (12 mandated Q&A)

**Purpose:** the exact 12 cross-examination questions the team must be able to answer at judging,
each with a crisp, evidence-backed answer. Every answer cites an artifact (source file, test
name, doc, or recorded output). Nothing here claims a result that does not exist: where evidence
is pending it is marked NOT YET, and the answer says so.

**Answering rules**

1. Cite the artifact, then the one-sentence claim. Never answer with "we will…".
2. If a question demands human-outcome evidence, answer with the honest non-claim
   ("no structured product-test session has run yet — it is scheduled for the morning") and pivot
   to what IS verified.
3. Q10 is the mandated honesty checkpoint: answer it exactly as written below.

Sources: `docs/user-research.md`, `docs/backend-verification.md`, `docs/security.md`,
`docs/mongo-schema.md`, `docs/firebase-mongodb-setup.md`, `docs/ai-benchmark.md` (status: NOT
YET — see Q9), `docs/architecture.md`, `validation-pack/judge-question-bank.md` (33-question
superset), `validation-pack/demo-failure-script.md`.

---

## Q1 — Lawrence Fung (neurodiversity): "What did your design participant tell you that contradicted your original assumptions?"

**Answer:** Our original assumption was that a good virtual lab plus a few extra toggles would be
enough. The participant — a ~17-year-old high-school senior with disclosed ADHD — told us the core
problem was interactivity and animation: demonstrations alone never built a full mental model of
Modern Physics (AP Physics 2). That directly shaped the product before build: animation is the
visual center of the lab, every representation is a learner choice, prediction-before-run is the
workflow, and adaptations are offers the learner accepts, rejects, or modifies.

**Evidence:** confirmed profile facts and the design-revision log in `docs/user-research.md:5-30`;
preference→product mapping (`docs/user-research.md:24-30`); participant description in
`README.md:15-17`.

**Honest boundary:** this is design-participant input, not a study result. "No structured product
test has been performed yet" (`README.md:165`).

## Q2 — Wei Xiong (scale): "Can this scale beyond one student and one physics lesson?"

**Answer:** Yes, by architecture, and we say precisely what is and is not built. A lab is a typed
`ExperimentDefinition` in `src/domain/experiments.ts` rendered by a shared shell; adaptation is a
provider interface (`src/domain/adaptation.ts`) decoupled from any specific lab; preferences and
evidence are generic. Two further labs (High-Voltage Circuit Failure, Exothermic Thermal Runaway)
are registered as `planned` and honestly marked "Not built yet" on the landing page — the
registry is `EXPERIMENT_REGISTRY` in `src/domain/experiments.ts:262-287`. What is NOT proven: a
second working lab. We do not claim multi-lab support until one exists.

## Q3 — Disha Patel (software/ML): "What exactly does the AI do, and what happens without it?"

**Answer:** The interpretation layer (1) classifies the learner's prediction against the recorded
trial outcome across five bounded concepts (e.g., LINEAR_VS_NONLINEAR_GROWTH) with a four-value
status, (2) proposes targeted, explainable changes — representation, pacing, structure only —
each with evidence IDs and a plain-language reason, and (3) the learner accepts, rejects, or
modifies. Two honest implementations share one `AdaptationProvider` interface: deterministic
offline rules (default, `src/adaptation/deterministic-provider.ts`) and an optional structured
LLM behind `POST /api/adapt` (`src/adaptation/llm-provider.ts`, `llm-schema.ts`) that activates
only with `NEXT_PUBLIC_LLM_ENABLED=1` + a server `LLM_API_KEY`, validates its answer against a
Zod schema, and falls back to the rules on ANY failure. Proposals are labeled "AI interpretation"
vs "Offline rules". Without the hosted path, the product is complete: the rules engine is the
default. The AI can never touch simulation outcomes (`src/domain/adaptation.ts`).

**Evidence:** `tests/adaptation/deterministic-provider.test.ts`,
`tests/adaptation/llm-provider.test.ts`, `tests/adaptation/llm-schema.test.ts`,
`tests/adaptation/provider-factory.test.ts` (fallback on every failure mode); `docs/ai-benchmark.md`
for measured metrics — see Q9.

## Q4 — Haixia Gu (accessibility): "Did the learner control the interface, or did the system decide?"

**Answer:** The learner controls everything. Every accessibility/display setting — animation speed
(0.25×–2×), reduced motion (including the OS `prefers-reduced-motion` preference), information
density, one-variable mode, high contrast, text scale (1–1.5×), preferred representations — is an
explicit control with a readable value. Adaptations are offers: Accept / Reject / Modify on every
card, and a rejected proposal type is never re-proposed in the session
(`src/adaptation/deterministic-provider.ts:39-43`). Nothing is silently applied
(`src/domain/adaptation.ts`; `src/components/lab/experiment-shell.tsx`).

**Evidence:** `src/components/lab/accessibility-controls.tsx`; `e2e/keyboard.spec.ts`; the
accept-reject-modify tests in `tests/components/lab-flow.test.tsx` ("rejects all offered
adaptations and keeps control"); `validation-pack/accessibility-audit.md`.

## Q5 — Soumitra Mehrotra (data science): "How do you know the adaptation reflects learning evidence, not arbitrary UI behavior?"

**Answer:** Every proposal carries `evidenceIds` that reference the exact prediction and trial
records that triggered it (`src/adaptation/deterministic-provider.ts:54-74`), and the Adaptation
Replay renders the whole chain — prediction → variables → outcome → friction → offer → decision →
updated prediction — from recorded evidence only (`src/components/lab/adaptation-replay.tsx`).
The engine is deterministic: same input, same proposal types in the same order. The session is
exportable as JSON, labeled "Initial design case study evidence. Not a statistically validated
learning study."

**Evidence:** `src/domain/evidence.ts` (typed, Zod-validated records); `tests/adaptation/
deterministic-provider.test.ts` (16 rule cases); `src/storage/session-storage.ts:88-100`.

## Q6 — Benslyne Avril (wellbeing): "How do you avoid judging or pathologizing the learner?"

**Answer:** By language and by design. The system speaks about what the learner did and what could
help, never about who the learner is: statuses are `supported / partial / uncertain / contradicted`
about the prediction-vs-outcome alignment, and "contradiction is a normal part of exploring a
model, not a failing on the learner's part" (`src/adaptation/misconception-taxonomy.ts:16-22`).
There are no diagnosis-based presets anywhere (`README.md:17`), no diagnosis field exists in any
schema, the hosted system prompt forbids diagnosis inference, and the product never says
"diagnosed" — it says "possible conceptual friction". No timer, no forced audio, no flashing.

**Evidence:** `src/adaptation/misconception-taxonomy.ts`; `docs/safety-model.md`;
`validation-pack/judge-question-bank.md` JUDGE-10/JUDGE-30.

## Q7 — The hardest question: "Show one case where adaptation did materially better than a static simulation."

**Answer (specific, reproducible live):** A learner predicts "It gets slightly faster" and
withdraws the absorber to 0.2 with seed 42. The run is classified nonlinear because it hits the
hard ceiling — any run reaching MAX_POPULATION=500 is nonlinear regardless of ratio
(`src/adaptation/misconception-taxonomy.ts:101-128`). The rules propose (fixed order): `show_graph`
("The prediction and the result differed. Seeing the population on a graph can show how it
actually grew."), `compare_trials`, and `reduce_density` — each with evidence IDs
(`src/adaptation/deterministic-provider.ts`). A static simulation shows the same ceiling animation
to every learner and stops. Here, the contradicted prediction plus ceiling-hit becomes: a graph of
the actual growth shape, a one-variable same-seed comparison attributing cause, and a density
change revealing the hidden tail — each refusable. The updated prediction then unlocks a second
trial, and the replay shows both trials, so the judge can watch the reasoning change.

**Honest boundary:** "We measured nothing yet — that is the case we are testing with our
participant now." We claim a demonstrable design difference, not learning gains.

**Evidence:** the seeded reference (absorber 0.2, seed 42 → ceiling 500 at step 28) verified in
`validation-pack/demo-script.md`; `e2e/multi-trial.spec.ts`; `tests/simulation/counterfactual.test.ts`.

## Q8 — Platform red-team: "How do you prove Learner B cannot see or touch Learner A's data?"

**Answer:** MongoDB has no row-level security, so the API layer is the enforcement boundary and
that is exactly what we tested against the real stack. `user_id` is always derived from the
verified httpOnly session cookie — never accepted from a request body
(`docs/security.md` §5). The real-backend integration suite
(`scripts/backend-integration.mjs`, run 2026-08-04, **15/15 passed, executed twice**) proved:
B cannot read A's session (A5), cannot create a row under A's id (A6 — the unique `id` index
rejects the insert), cannot complete A's session (A7), cannot delete A's session (A12), and
account wipe removes exactly A's rows, leaving B's untouched (A13). Optimistic concurrency
(revision + mutation_id) is proven live: duplicate mutation replay is idempotent (A8), stale
`expected_revision` → 409 with the current doc (A9).

**Evidence:** `docs/backend-verification.md` (full per-test table); `docs/mongo-schema.md`
(indexes, validators, concurrency contract); `scripts/mongo-setup.mjs`.

## Q9 — "You claim an AI layer. Show me its measured performance and failure behavior."

**Answer:** The AI layer is bounded, optional, and fallback-safe by construction: a typed payload
in, a Zod-validated enum-only answer out, a 12 s client / 15 s server timeout, and a documented
fallback on any failure — no key, timeout, invalid JSON, or schema violation
(`src/adaptation/llm-client.ts`, `src/app/api/adapt/route.ts`). The provider is genuinely flaky in
practice (the repo's operational record shows `provider_error` bursts historically; the client
maps them to `{ ok: false, reason: "provider_error" }` — `src/adaptation/llm-client.ts:85`), which
is precisely why the deterministic fallback is the guaranteed path and is the default. The
fallback is unit-tested on every failure mode (`tests/adaptation/llm-provider.test.ts`,
`tests/adaptation/provider-factory.test.ts`).

**Status flag — NOT YET:** the dedicated benchmark document `docs/ai-benchmark.md` (accuracy,
latency, fallback-rate metrics on the real provider) is owned by a separate agent and was not
present in the repo at the time this bank was written (2026-08-03). Until it lands, quote the
mechanism above and the coordinator-verified integration state; do NOT quote unrecorded accuracy
numbers.

## Q10 — "What did the real participant change?" (mandated honesty checkpoint)

**Answer — exactly as stated, no fabrication:** The initial design participant (~17, HS senior,
disclosed ADHD) engaged BEFORE the build, and his confirmed preferences shaped the product
pre-build: animation as the visual center, every representation a learner choice,
prediction-before-run, adaptations as offers rather than automatic changes, and no diagnosis-based
presets — each row in the design revision log (`docs/user-research.md:24-30`) traces to a
confirmed preference (`docs/user-research.md:16-20`). What has NOT happened: the structured
product-test session (in-app pre/post questionnaire, consent, observed use, post-use interview,
and one feedback-driven revision) is scheduled for the morning of the deadline and has NOT run.
No post-build change from a recorded session exists, and we will not invent one. When it runs,
the first change it produces will be recorded in `docs/user-research.md`'s "First structured
product test" template and the claim register (`docs/claim-register.md`) will be updated — not
before.

## Q11 — "Why is there no 'ADHD mode'?"

**Answer:** Because preference ≠ identity. We never assume all ADHD learners share preferences
(`README.md:17`), no diagnosis-based preset exists anywhere in code, the taxonomy never infers a
diagnosis (`src/adaptation/misconception-taxonomy.ts:16`), and a diagnosis preset would both
stereotype and require collecting data we deliberately do not collect. Every adaptation follows
explicit learner preferences and demonstrated task behavior, and is an offer the learner controls.
This is a documented design position (`docs/user-research.md:20,30`), not a roadmap item.

## Q12 — "What data is collected, where does it live, and how is it protected?"

**Answer:** Two local-only modes plus one optional signed-in mode. Guest mode: `localStorage` keys
`unseenlab.preferences.v1` + `unseenlab.evidence.v1` (+ workflow/session-id keys), Zod-validated
on read, nothing transmitted (`src/storage/session-storage.ts`); the only network call in the app
is the optional, labeled `POST /api/adapt` when the hosted path is enabled, which sends a bounded
typed summary — never identity, never free text verbatim. Signed-in mode: the browser carries only
an httpOnly `unseenlab.session` cookie (14 days, Secure in production, SameSite=Lax) minted from a
verified Firebase ID token; all `user_id`s are derived server-side from the cookie
(`docs/security.md`). Data lives in the learner's own browser and, only after explicit consent
("Save your current learning session?" → "Save to my account"), in their own MongoDB rows
(`profiles`, `learner_preferences`, `learning_sessions` — ownership enforced by the API layer).
The client bundle is scanned in CI for secret leakage (`scripts/bundle-secret-scan.mjs`,
`.github/workflows/ci.yml`); the coordinator-verified scan is CLEAN. Free-text research answers
are held in component state only, not persisted (`src/components/lab/research-mode.tsx:24-27`).

**Honest boundary:** we claim a bounded data posture, not "private and secure" as a tested
certification.

---

*Rule reminder: every answer cites an artifact; anything not yet demonstrable is marked NOT YET.
Do not answer with evidence that does not exist — say what would need to exist.*
