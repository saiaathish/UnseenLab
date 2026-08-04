# UnseenLab — Judge Question Bank (Validation Pack)

> **RE-STAMPED on the final-hardening branch.** Answers were corrected for the current
> product: the structured LLM provider is now implemented (optional, behind `/api/adapt`,
> labeled, deterministic fallback), OS `prefers-reduced-motion` is honored, the replay dialog
> traps focus, WAI-ARIA tabs are implemented, per-frame `aria-live` spam is gone, the
> `feedbackTiming` control was removed, and the multi-trial loop is the demo flow. Items
> marked **SUPERSEDED** below are historical. No user-testing results exist; every answer
> stays honest about that.

**Purpose:** 33 cross-examination questions a judge could ask after a demo, grouped by judge perspective, each with a strong product-specific answer, the required evidence to give that answer, the weak answer to avoid, and whether the team can answer today.

**How to use:** Before the demo, the team should be able to answer every question with a citation (file:line) or artifact (session export, video timestamp, screenshot). During the demo, if a judge asks any question, answer with the Strong answer — never the Weak answer.

**The evidence rule:** Every answer must cite inspectable evidence (source file:line, recorded session JSON, e2e trace, or video). Any answer that relies on future work ("we will", "the next version", "once we add") is marked **FAIL** in judging. Unverified claims are UNVERIFIED.

**Status legend:** YES = answerable today from code + docs; PARTIAL = answerable structurally but live/user evidence missing; NO = not answerable today.

---

## THE HARDEST QUESTION (ask this one yourself before anyone else does)

**"Show one case where adaptation did something materially better than a static simulation."**

**Strong answer (specific scenario, reproducible live):** The learner predicts the reaction "stays about the same" or "gets slightly faster" (structured answers `stays_the_same` / `slightly_faster`, src/domain/evidence.ts) for a trial with the absorber fully withdrawn. The run is classified `nonlinear` because it hits the hard ceiling — any run reaching MAX_POPULATION=500 is treated as nonlinear regardless of ratio (src/adaptation/misconception-taxonomy.ts). The taxonomy marks LINEAR_VS_NONLINEAR_GROWTH as `contradicted` with evidenceIds [prediction.id, trial.id]. The provider then proposes changes (on the rules path, in fixed order: `show_graph` → `compare_trials` → `reduce_density`, src/adaptation/deterministic-provider.ts; on the hosted path, the same evidence yields a labeled "AI interpretation" card — never promise a specific intervention):
1. `show_graph` — because the prediction was contradicted and the learner never opened the graph — proposes adding the graph view;
2. `compare_trials` — same contradicted evidence, proposes the one-variable side-by-side;
3. `reduce_density` — because the run hit the ceiling — proposes informationDensity=low so the curve's tail is visible inside the caps.

A static simulation (PhET-style) shows the same ceiling animation to every learner and stops. UnseenLab converts the contradicted prediction plus ceiling-hit into: a graph of the actual growth shape, a one-variable comparison to attribute cause, and a density change that reveals the hidden tail — each with a plain-language reason and evidence IDs, each refusable (src/components/lab/adaptation-card.tsx). And the loop is repeatable: the updated prediction unlocks a second trial, and the replay shows both trials, so the judge can watch the reasoning change.

**Required product evidence:** A recorded session trace (export JSON via research-mode) or an e2e screenshot showing proposals fired with their evidence IDs — and ideally the demo video timestamp. The e2e suite covers the loop (`e2e/smoke.spec.ts`, `e2e/multi-trial.spec.ts`), including "only one /api/adapt request per trial".

**Weak answer to avoid:** "We adapt the pace and content to each learner." (This names a category; it shows no mechanism, no evidence, and it is true of Lumina-style tools.)

**Current status: PARTIAL** — the scenario can be demonstrated live today (deterministic rules path, no network), but no recorded trace, screenshot, or video of it exists yet.

---

## Group 1 — Neurodiversity research (JUDGE-01..05)

### JUDGE-01. What changed in the product because of your participant?
- **Question:** What concretely changed because of your design participant?
- **Strong answer:** The participant's confirmed preferences (docs/user-research.md:16-20) map to specific product decisions logged in the revision table (docs/user-research.md:24-30): animation is the visual center (src/components/lab/simulation-canvas.tsx:21-37 — animation-first, play/pause/step/reset), every representation is a learner choice (src/components/lab/representation-tabs.tsx:27-33), prediction-before-run was introduced (docs/user-research.md:28), and adaptations became offers rather than automatic changes (docs/user-research.md:29; src/components/lab/adaptation-card.tsx:29-33).
- **Required product evidence:** The revision log with dates/sources; ideally a recorded test session showing a further change.
- **Weak answer to avoid:** "We built it with an ADHD learner, so it's great for ADHD."
- **Current status: YES** — the log exists and matches code.

### JUDGE-02. Which of your assumptions proved wrong?
- **Question:** What did you assume at the start that turned out to be wrong?
- **Strong answer:** Honest answer today: **none — and we say so.** No structured test has run (README.md:121); the templates in docs/user-research.md:32-45 are explicitly empty. The only assumption we can flag is structural: we assumed a prediction-before-run gate would be lightweight, and it is the single biggest UX cost in the flow (a trial is blocked without it, src/components/lab/experiment-shell.tsx:166-170) — we have not yet measured whether the participant finds it valuable or burdensome. That is a documented open question, not a claimed result.
- **Required product evidence:** A test-session entry in docs/user-research.md with a changed assumption.
- **Weak answer to avoid:** "Nothing was wrong — it all worked." (No one believes this; it also implies no testing occurred.)
- **Current status: PARTIAL** — the non-claim is honest; the corrected assumption requires a test session.

### JUDGE-03. Why are there no diagnosis-based presets?
- **Question:** You know the participant has ADHD — why no "ADHD mode"?
- **Strong answer:** Because preference ≠ identity: no assumption that all ADHD learners share preferences (README.md:17; docs/user-research.md:9, 20, 30). Every adaptation follows explicit learner preferences and demonstrated task behavior (README.md:17; src/domain/learner.ts:27-30), the taxonomy "never infers a diagnosis" (src/adaptation/misconception-taxonomy.ts:16-22), and adaptations are offers the learner accepts, rejects, or modifies (src/components/lab/adaptation-card.tsx:167-191). A diagnosis preset would be both stereotyping and a safety risk (self-disclosure stored nowhere).
- **Required product evidence:** None beyond code — this is a design-position answer.
- **Weak answer to avoid:** "We will add an ADHD mode in the next version."
- **Current status: YES.**

### JUDGE-04. How does the learner retain control?
- **Question:** Does the system ever change anything without the learner knowing?
- **Strong answer:** No. Every change originates in a proposal with a plain-language reason and evidence IDs (src/adaptation/deterministic-provider.ts:54-72); the learner accepts, rejects, or modifies (src/components/lab/adaptation-card.tsx:167-191); "modified" applies only the selected subset (experiment-shell.tsx:254-259); nothing is silently applied (adaptation-card.tsx:29-33). The only automatic preference writes are the learner's own slider changes (src/components/lab/accessibility-controls.tsx:24-168). Rejected proposal types are never re-proposed (deterministic-provider.ts:39-43).
- **Required product evidence:** A recorded session showing a reject, a modify, and the proposal not reappearing.
- **Weak answer to avoid:** "The AI knows best, so it applies what it thinks is right."
- **Current status: YES** (structural; the reject/modify trace is in the e2e only partially — e2e/smoke.spec.ts:35 accepts, never rejects).

### JUDGE-05. What is the evidence this helps neurodivergent learners?
- **Question:** Show me the evidence this helps a neurodivergent learner.
- **Strong answer:** There is none yet, and we are saying so explicitly: "No structured product test has been performed yet" (README.md:121); test templates are placeholders (docs/user-research.md:32-45). What exists is confirmed design evidence: the participant's disclosed difficulties (Modern Physics from demonstrations alone, docs/user-research.md:11-13) and confirmed preferences (interactivity, animation, docs/user-research.md:16-20) — plus the product decisions they drove (docs/user-research.md:24-30). Impact is a claim we will only make with recorded pre/post data from the protocol at docs/user-research.md:47-54.
- **Required product evidence:** Completed session records with pre/post confidence, effort, and quotes.
- **Weak answer to avoid:** "The participant loved it, so it works."
- **Current status: NO** — by design and by honest documentation.

---

## Group 2 — Accessibility advocacy (JUDGE-06..10)

### JUDGE-06. Can the learner operate it independently?
- **Question:** Could a learner use this alone, no teacher, no developer?
- **Strong answer:** By construction yes — no account, no diagnosis disclosure, no teacher configuration, no API key required for the core (README; deps are next/react/react-dom/zod/gsap/three; the only network call in the app is the optional `POST /api/adapt` when the hosted path is enabled, and it falls back to deterministic rules), anonymous local persistence (src/storage/session-storage.ts), and the full flow is on one page (predict → run → adapt → compare → replay → updated prediction → another trial, src/app/lab/nuclear-chain-reaction/page.tsx). What is UNVERIFIED: no live URL exists and no independent-use test has been run.
- **Required product evidence:** A public URL plus one unsupervised session by the participant.
- **Weak answer to avoid:** "It works on my machine."
- **Current status: PARTIAL.**

### JUDGE-07. What happens with reduced motion at the OS level?
- **Question:** I have Reduce Motion on in my OS. Does your app respect it automatically?
- **Strong answer:** Yes — the app now honors the OS `prefers-reduced-motion` preference on load (in addition to the in-app toggle; the manual override wins if the learner changes it). Once reduced motion is active, motion is thoroughly suppressed: no CSS animation/transition, static frames with pulse glyphs replaced by static marks (src/components/lab/simulation-canvas.tsx), slower frame pacing, and the adaptation engine never proposes `slow_animation` under reduced motion.
- **Required product evidence:** A screen recording with OS Reduce Motion on at load; the e2e keyboard spec covers reduced-motion behavior.
- **Weak answer to avoid:** "Yes, we fully support reduced motion" without the OS-level hook — the hook now exists, so say it plainly and show it.
- **Current status: YES** (implemented; a screenshot/video of the OS-level behavior is trivial to produce).

### JUDGE-08. Is animation optional?
- **Question:** Can a learner use the lab with animation effectively off?
- **Strong answer:** Yes. The canvas never auto-plays (src/components/lab/simulation-canvas.tsx:21-25); in reduced-motion mode each step renders statically (simulation-canvas.tsx:311-335, 323-335 for static reaction markers); play/pause/step-back/step-forward/reset are always available (simulation-canvas.tsx:128-171); the graph, equation, causal, and plain-language views are full alternatives generated from the same trial (src/components/lab/representation-tabs.tsx:89-291); and there is no flashing, no forced audio, no timer (README.md:59).
- **Required product evidence:** A static-mode run on the e2e path; a screenshot with reduced-motion on.
- **Weak answer to avoid:** "The animation is the point, so we kept it mandatory."
- **Current status: YES** (code-level; the static-mode screenshot is trivial to produce).

### JUDGE-09. Is the adaptation explainable?
- **Question:** When the app changes something, can the learner see why — in plain language?
- **Strong answer:** Yes. Every proposal carries a plain-language reason and the evidence IDs that triggered it (src/adaptation/deterministic-provider.ts:54-72, e.g. "The prediction and the result differed..." at 110-114 and "...hit the safety ceiling, so the details were hidden..." at 186-189). The Adaptation Replay renders the whole chain — prediction → variables → outcome → interaction pattern → conceptual friction → proposal → decision → updated prediction → counterfactual — "rendered entirely from recorded evidence" (src/components/lab/adaptation-replay.tsx:31-37, 93-229), non-judgmental throughout (misconception-taxonomy.ts:16-22).
- **Required product evidence:** Live firing of a proposal plus the replay showing it with its reason.
- **Weak answer to avoid:** "The AI just knows — trust it."
- **Current status: YES** (structural; the replay's "What changed in understanding" step honestly says whether comparison is possible, adaptation-replay.tsx:212-222).

### JUDGE-10. Does the system stereotype?
- **Question:** Could this system label me as a type of learner, or leak a label?
- **Strong answer:** No. The taxonomy only ever states whether learner behavior is consistent or in tension with a scientific idea — `supported/partial/uncertain/contradicted` — and "contradiction ... is a normal part of exploring a model, not a failing on the learner's part" (src/adaptation/misconception-taxonomy.ts). No diagnosis is inferred anywhere — including the hosted path, whose system prompt forbids diagnosis inference and whose output schema has no diagnosis field. Everything is local by default: no account, no server, no telemetry (src/storage/session-storage.ts); the only network activity is the optional, labeled `/api/adapt` call when the hosted path is enabled, and the only export is learner-initiated and anonymous (labeled "Not a statistically validated learning study").
- **Required product evidence:** None beyond code; a judge can verify by running with the network panel open.
- **Weak answer to avoid:** "We classify learners by learning style."
- **Current status: YES.**

---

## Group 3 — ML / software engineering (JUDGE-11..17)

### JUDGE-11. What does the AI actually do?
- **Question:** Point at the AI and tell me exactly what it does.
- **Strong answer:** Two honest layers. Default: a deterministic rules engine — classifies prediction-vs-outcome evidence against a 5-concept taxonomy (src/adaptation/misconception-taxonomy.ts), applies rule types in fixed order with per-proposal evidence IDs (src/adaptation/deterministic-provider.ts), proposes representation/pacing/structure changes only (never science: src/domain/adaptation.ts), and respects rejection memory. Optional (enabled at build time with `NEXT_PUBLIC_LLM_ENABLED=1` + server `LLM_API_KEY`): a structured LLM provider behind `POST /api/adapt` — typed bounded payload in, Zod-validated enum-only answer out, system-prompt guards, fallback to the rules on ANY failure, proposals labeled "AI interpretation" vs "Offline rules" (src/adaptation/llm-provider.ts, llm-client.ts, llm-schema.ts; src/app/api/adapt/route.ts). We never claim more than the label on the card.
- **Required product evidence:** A trace of one propose() call with its inputs and outputs (rules path), or one labeled "AI interpretation" card (hosted path).
- **Weak answer to avoid:** "It's an AI that understands how the student learns." (No such code exists on either path.)
- **Current status: YES** (the accurate answer includes both layers and the label).

### JUDGE-12. What remains if you remove the AI?
- **Question:** Strip the AI out. What's left?
- **Strong answer:** Everything except the interpretation step: the seeded deterministic engine (src/simulation/nuclear-chain-reaction.ts:25-34, 53-118), prediction-before-run gating (experiment-shell.tsx:166-170), five representation views (representation-tabs.tsx:31-291), the Counterfactual Microscope (src/simulation/counterfactual.ts:9-59), the Adaptation Replay (adaptation-replay.tsx:31-229), anonymous local storage (session-storage.ts:44-122). What would vanish is the proposal generator and the taxonomy — i.e., exactly the adaptive loop that distinguishes this from a plain simulator. In practice, "removing the AI" removes nothing today, because the adaptation layer is the rules engine (deterministic-provider.ts:32-196).
- **Required product evidence:** Run with `adaptationProvider.propose` stubbed — the lab still fully functions (graceful-degradation path already exists: experiment-shell.tsx:210-220).
- **Weak answer to avoid:** "Without the AI the app would be empty." (False — the lab is substantial.)
- **Current status: YES.**

### JUDGE-13. How is scientific truth isolated from AI?
- **Question:** How do you guarantee the AI can't corrupt the science?
- **Strong answer:** Contractually and structurally. The provider interface returns proposals and takes no science authority (src/domain/adaptation.ts:9-12, 21-27); the proposal types are limited to representation/pacing/structure changes (src/domain/evidence.ts:72-81; proposed changes are preference keys only, applied via applyProposedChanges, src/domain/adaptation.ts:33-62); the simulation is a pure seeded function of parameters (nuclear-chain-reaction.ts:53-118) that clamps all inputs (src/domain/experiments.ts:188-212); the counterfactual enforces one-variable/same-seed in code (src/simulation/counterfactual.ts:38-42); and there is no code path where an adaptation output reaches simulation inputs.
- **Required product evidence:** Unit tests asserting determinism and the counterfactual constraint (tests/simulation/nuclear-chain-reaction.test.ts, tests/simulation/counterfactual.test.ts — reviewed, not executed).
- **Weak answer to avoid:** "The AI is smart enough not to touch physics."
- **Current status: YES** (structural; test execution pending).

### JUDGE-14. How are AI outputs structured?
- **Question:** What is the output contract of your interpretation layer?
- **Strong answer:** Typed and Zod-validated end to end: `ConceptEvidence` with a 4-value status and evidenceIds (src/domain/evidence.ts:58-70), `AdaptationProposal` with type, plain reason, evidenceIds, proposedChanges, and decision lifecycle (src/domain/evidence.ts:83-105), validated against schemas (evidence.ts:96-105). The provider contract requires determinism and evidence IDs on every proposal (src/domain/adaptation.ts:21-27). Proposals are serializable — the session export is exactly this structure (src/storage/session-storage.ts:88-100).
- **Required product evidence:** One exported session JSON.
- **Weak answer to avoid:** "The AI returns natural language and we parse it." (No such path exists.)
- **Current status: YES.**

### JUDGE-15. What happens when interpretation confidence is low?
- **Question:** When the engine is unsure, what does it do?
- **Strong answer:** It says nothing rather than guessing. The taxonomy only emits a concept when there is signal, and unclassified cases are omitted entirely; free text without matching keywords yields `uncertain` with no evidenceIds; structured answers outside the covered cases are left unclassified; the provider proposes nothing unless a rule's preconditions hold; and if the provider itself throws, the lab still runs trials normally with a notice. On the hosted path, the same conservative behavior is enforced mechanically: a low-confidence or schema-invalid answer from the model is discarded and the deterministic rules run, labeled "Offline rules".
- **Required product evidence:** A session where a free-text prediction produces no proposals (or an `uncertain` replay entry).
- **Weak answer to avoid:** "It falls back to the LLM." (The fallback is the other way: the model falls back to the deterministic rules, which stay conservative.)
- **Current status: YES.**

### JUDGE-16. How is adaptation evidence recorded?
- **Question:** Where does the evidence trail live, and can I inspect it?
- **Strong answer:** In the anonymous local session: predictions, trials, representation events, proposals with decisions, concept evidence (src/domain/evidence.ts), persisted Zod-validated to localStorage (src/storage/session-storage.ts), exportable as JSON with a label stating it is "not a statistically validated learning study", and rendered back to the learner as the Adaptation Replay (src/components/lab/adaptation-replay.tsx) — which now lists every trial in a multi-trial session.
- **Required product evidence:** The exported JSON from any live session.
- **Weak answer to avoid:** "It's in the cloud, we can pull it." (There is no cloud.)
- **Current status: YES.**

### JUDGE-17. Why is there no LLM in your dependencies?
- **Question:** Your pitch says AI, but package.json has six dependencies. Explain.
- **Strong answer:** Deliberate and documented. There is no bundled AI/LLM SDK — deps are next, react, react-dom, zod, gsap, three — because the AI layer is a bounded, optional server call: when enabled (`NEXT_PUBLIC_LLM_ENABLED=1` + server `LLM_API_KEY`), the server bridge `POST /api/adapt` calls an OpenAI-compatible chat completions API, validates the typed answer, and returns either the structured result or `{ fallback: true }`; the client bundle contains no model code and the key never leaves the server. Default posture stays zero-network and deterministic (the same input must produce the same proposal so the science stays judgeable and reproducible), and the product is presented as a deterministic adaptive engine with an optional, labeled AI-interpretation layer.
- **Required product evidence:** None — this is the honesty answer.
- **Weak answer to avoid:** "We use an LLM under the hood, it's just bundled." (Verifiably false — it is not bundled, it is an optional server call.)
- **Current status: YES.**

---

## Group 4 — Data science (JUDGE-18..22)

### JUDGE-18. What evidence supports a misconception?
- **Question:** What evidence makes you say a learner "has" a misconception?
- **Strong answer:** We never say "has" — only "evidence suggests status X" (replay wording, src/components/lab/adaptation-replay.tsx:146-149). The evidence is always a pair/triple of recorded artifacts: prediction + trial (LINEAR_VS_NONLINEAR_GROWTH: prediction.structuredAnswer vs growth class of the trial's snapshot timeline, src/adaptation/misconception-taxonomy.ts:217-287), two trials differing only in one variable (ABSORBER_EFFECT: previous vs last absorber position plus predicted direction, misconception-taxonomy.ts:289-317), two trials differing in starting population (STARTING_POPULATION_EFFECT: 319-338), two same-parameter runs differing only in seed (RANDOM_EVENT_VS_SYSTEM_PATTERN: 340-369), or variable-diff counts (MULTIPLE_VARIABLE_CONFOUNDING: 371-380). Every claim carries the evidenceIds (deterministic-provider.ts:54-72).
- **Required product evidence:** A replay or export showing a concept entry with its evidence IDs.
- **Weak answer to avoid:** "The AI detected the learner's misconception." (No detection of the learner exists — only prediction-vs-outcome comparison.)
- **Current status: YES.**

### JUDGE-19. How do you distinguish confusion from exploration?
- **Question:** A learner changing many variables could be curious, not confused. How do you tell?
- **Strong answer:** We don't claim to — and the system's language is careful: statuses are `supported/partial/uncertain/contradicted` about the learner's *prediction vs outcome alignment*, not about the learner's state of mind (src/adaptation/misconception-taxonomy.ts:12-26, 210-385). Multi-variable changes trigger a *suggestion* (freeze_variables, deterministic-provider.ts:86-99) framed as "makes it hard to see which one caused the result", not a verdict; the causal view and one-variable mode are offered as tools (deterministic-provider.ts:158-178). Confounding is classified as `partial`/`contradicted` only as an evidence property (misconception-taxonomy.ts:371-380). The replay says "evidence suggests: X" (adaptation-replay.tsx:146-149).
- **Required product evidence:** A multi-variable session showing the freeze_variables proposal and its wording.
- **Weak answer to avoid:** "Our AI tells curiosity apart from confusion." (No such classifier exists.)
- **Current status: YES.**

### JUDGE-20. How do you avoid overfitting to one learner?
- **Question:** You designed with one participant. How do you know it isn't just built for them?
- **Strong answer:** We don't know yet — that is documented as an open state, not a solved one (README.md:121; docs/user-research.md:56-61). What the architecture does about it: no diagnosis-based presets (README.md:17), preferences are explicit and per-learner with safe defaults (src/domain/learner.ts:51-60), the taxonomy encodes scientific-concepts-vs-behavior, not personal traits (misconception-taxonomy.ts:12-26), and generalization is an explicit non-claim ("Never claimed for all learners with ADHD", docs/user-research.md:20). The honest statement: one design participant informed the interface; N test sessions will inform generalization, and we need them.
- **Required product evidence:** Multiple test sessions; until then, this is the honesty answer.
- **Weak answer to avoid:** "Our approach is universal by design." (With one participant, that's unsupported.)
- **Current status: PARTIAL** (the non-claim is answerable; the generalization claim is not).

### JUDGE-21. What metrics are meaningful with one participant?
- **Question:** With n=1, what can you actually measure?
- **Strong answer:** Not statistical learning gains — that's why the export label says "not a statistically validated learning study" (src/storage/session-storage.ts:94-95). Meaningful with n=1: (1) task-completion evidence (prediction before every run; prediction updated after, experiment-shell.tsx:132-163); (2) acceptance rate and rejection of specific proposal types (decisions recorded, src/domain/evidence.ts:11, 83-105); (3) pre/post confidence and mental-effort ratings and qualitative friction ("what became clearer / confusing / remove") collected by the in-app research-mode questionnaire (src/components/lab/research-mode.tsx:46-123) and transcribed into the session sheet by the facilitator (validation-pack/user-testing-session-sheet.md) — the questionnaire answers themselves stay in component state and are NOT persisted or exported (research-mode.tsx:24-27), so the recorded artifact is the facilitator's session sheet; (4) the exported session JSON (predictions, trials, decisions, counterfactuals) as machine-readable case-study evidence — the standard single-case-study evidence class, honestly labeled (docs/user-research.md:54).
- **Required product evidence:** One completed session record using research-mode.
- **Weak answer to avoid:** "We saw a 40% improvement." (With no session, no baseline, that's fabrication.)
- **Current status: PARTIAL** — the metric framework exists; no data yet.

### JUDGE-22. How do you know the rules engine isn't just guessing?
- **Question:** Your rules fire on thresholds. How do I know they're not arbitrary?
- **Strong answer:** Because every firing is evidence-linked and reviewable: each proposal's evidenceIds point at the prediction/trial records that triggered it (deterministic-provider.ts:54-72), the taxonomy thresholds are explicit constants (NONLINEAR_GROWTH_RATIO=8, FLAT_GROWTH_RATIO=1.5, misconception-taxonomy.ts:101-102; ceiling rule at 127-128) and the engine is deterministic — same input, same output (README.md:27-28; determinism documented at deterministic-provider.ts:22-31). A judge can replay any proposal chain through the Adaptation Replay (adaptation-replay.tsx:93-229) and verify the rule by hand from the exported JSON. The rules are also deliberately conservative: only 7 proposal types (src/domain/evidence.ts:72-81), capped at 3 per propose() (deterministic-provider.ts:19-20).
- **Required product evidence:** The rules tests (tests/adaptation/deterministic-provider.test.ts — 16 cases, reviewed not executed) plus one manual replay of a firing chain.
- **Weak answer to avoid:** "The rules were tuned by our AI."
- **Current status: YES** (reviewable by construction; test execution pending).

---

## Group 5 — Education (JUDGE-23..28)

### JUDGE-23. Why is prediction required?
- **Question:** Why force a prediction before every run? That's friction.
- **Strong answer:** Because prediction is the product's evidence engine: without a recorded prediction, there is no prediction-outcome alignment to classify, and the adaptation loop degenerates into a generic settings panel. The gate is deliberate (experiment-shell.tsx:166-170 blocks "Run trial" without one), the structured answers map directly to the taxonomy (src/domain/evidence.ts:17-32; misconception-taxonomy.ts:223-241), and the prediction panel also exists to elicit an updated prediction after the trial for before/after comparison (prediction-panel.tsx:35-39; adaptation-replay.tsx:177-190, 212-222). The participant's confirmed preference for interactivity ("learner manipulates meaningfully before seeing results") is the design rationale (docs/user-research.md:28).
- **Required product evidence:** A recorded session where the updated prediction differs from the initial one, and the replay shows it.
- **Weak answer to avoid:** "Predicting is a proven pedagogy." (Name the mechanism, not the trend.)
- **Current status: YES** (rationale in docs; live updated-prediction trace pending).

### JUDGE-24. How does this improve causal understanding?
- **Question:** What makes this better for understanding cause and effect?
- **Strong answer:** The Counterfactual Microscope is a causal-inference instrument: change exactly one variable, keep the SAME seed — identical randomness — so any outcome difference is attributable to that one variable (src/simulation/counterfactual.ts:9-20, 33-59); the comparison UI states exactly that ("This shows what that one variable alone controls", src/components/lab/counterfactual-panel.tsx:186-190); the causal view diagrams knob→mechanism→outcome (representation-tabs.tsx:196-253); and the freeze_variables proposal teaches the confounding concept (deterministic-provider.ts:86-99; MULTIPLE_VARIABLE_CONFOUNDING in misconception-taxonomy.ts:76-83). Determinism is what makes the counterfactual rigorous — with real randomness, a one-variable comparison would be confounded by the seed.
- **Required product evidence:** The counterfactual e2e step (e2e/smoke.spec.ts:37-40) plus a live side-by-side.
- **Weak answer to avoid:** "Simulations are just more engaging."
- **Current status: YES.**

### JUDGE-25. How is this different from a standard simulation?
- **Question:** PhET exists. Why would I use this?
- **Strong answer:** PhET gives every learner the same interface; UnseenLab's loop is evidence-driven and learner-refusable: prediction recorded (prediction-panel.tsx), outcome classified against a bounded taxonomy (misconception-taxonomy.ts:210-385), targeted proposals with reasons (deterministic-provider.ts:54-72), accept/reject/modify (adaptation-card.tsx:167-191), one-variable same-seed counterfactual (counterfactual.ts:9-20), and a full adaptation replay (adaptation-replay.tsx:31-229). PhET has settings; UnseenLab has an adaptation record. The delta claim is documented in this validation pack's Novelty Test. What we must still prove: that the loop produces better outcomes than PhET for the participant — that requires the test session we don't have yet (README.md:121).
- **Required product evidence:** The Novelty Test comparison table plus live demo of the loop.
- **Weak answer to avoid:** "We're like PhET but with AI."
- **Current status: PARTIAL** (differentiation is structural; outcome superiority is unproven).

### JUDGE-26. Can the learner transfer understanding?
- **Question:** After using this lab, can a learner predict an unfamiliar scenario?
- **Strong answer:** We can't claim transfer yet (no test data, README.md:121). What the product structurally supports: within a session, transfer is testable via the updated-prediction step — the learner predicts again after the trial and the replay compares it with the outcome (adaptation-replay.tsx:177-190, 212-222); the structured prediction answers are scenario-independent (src/domain/evidence.ts:17-32); and the taxonomy's RANDOM_EVENT_VS_SYSTEM_PATTERN concept explicitly teaches that a pattern repeating across different seeds is systematic (misconception-taxonomy.ts:69-75, 340-369) — the seed slider exists for exactly this probe (src/domain/experiments.ts:120-128). Cross-lab transfer is unanswerable: the other two labs are `Planned` and non-functional (experiments.ts:241-262).
- **Required product evidence:** A session where the learner predicts a new seed/parameter set after having seen the pattern, with the replay comparison.
- **Weak answer to avoid:** "Learners leave with deep understanding." (Unmeasured.)
- **Current status: NO** for transfer claims; PARTIAL for the mechanism.

### JUDGE-27. How long until a learner stops needing the adaptivity?
- **Question:** Is the goal to make the adaptivity disappear?
- **Strong answer:** The honest design answer: the adaptivity is an offer system, so "needing" it is learner-defined — proposals are one-tap refusable (adaptation-card.tsx:167-191) and rejected types are never re-proposed (deterministic-provider.ts:39-43), which is the closest implemented mechanism to "the system notices the learner has moved on". There is no fade-out algorithm (no mastery model — an honest limitation). What the replay provides is evidence of whether the learner's updated predictions start aligning (supported statuses, misconception-taxonomy.ts:235-241), which is the observable proxy for "stopped needing it" — measured per-session, never claimed across sessions.
- **Required product evidence:** A multi-trial session where later predictions flip from contradicted to supported.
- **Weak answer to avoid:** "We fade out adaptivity automatically as you master the topic." (No mastery model exists.)
- **Current status: PARTIAL.**

### JUDGE-28. Why this lab first, and what's next?
- **Question:** Why the nuclear chain reaction as the only lab?
- **Strong answer:** Chosen for the pitch's core promise: a physically inaccessible, dangerous, invisible phenomenon where prediction-vs-outcome contrast is dramatic (a ceiling stop vs. extinction vs. steady growth) and the fictionalized model is safe by construction — dimensionless, capped, disclaimed (src/domain/experiments.ts:3-8, 12-15, 18-19; README.md:38). Two more are registered but not built, honestly marked `Planned` on the landing page (src/app/page.tsx:57-76; experiments.ts:241-262). The engine and provider are lab-agnostic (registry pattern, experiments.ts:264-265; provider keyed on trial evidence, deterministic-provider.ts), so the next lab's cost is a parameter spec + taxonomy concept, not a rewrite — that's a design claim we have not yet proven by building one.
- **Required product evidence:** None beyond code; a second lab would prove the claim.
- **Weak answer to avoid:** "We'll add three more labs by demo day."
- **Current status: YES** for the why; UNVERIFIED for the lab-agnostic claim.

---

## Group 6 — Safety / wellbeing (JUDGE-29..33)

### JUDGE-29. Could this provide dangerous guidance?
- **Question:** This is a nuclear chain reaction. What if a learner uses it to make bad decisions in real life?
- **Strong answer:** The model is fictionalized and explicitly non-referential: dimensionless abstract values, "does NOT model any real reactor, material, or facility" (src/domain/experiments.ts:3-8), a visible disclaimer in the header (experiments.ts:12-15; rendered at experiment-shell.tsx:338-342 and the landing footer, src/app/page.tsx:114-115), no real materials, no critical-mass data, no enrichment or weapon-relevant content (README.md:38), a hard population cap and step limit so outcomes stay abstract (experiments.ts:18-19), and a documented safety model (docs/safety-model.md). The adaptation layer changes representation, pacing, and structure only — never parameters, equations, or outcomes (src/domain/adaptation.ts:9-12). Planned labs must follow the same "teach causal principles without operationally dangerous procedures" rule (README.md:64).
- **Required product evidence:** The safety-model doc (docs/safety-model.md) and the disclaimer render in a screenshot.
- **Weak answer to avoid:** "It's just a game." (Undermines the whole submission.)
- **Current status: YES.**

### JUDGE-30. Does the product pathologize the learner?
- **Question:** Does the system treat the learner as having a deficit?
- **Strong answer:** The system's language is behavior-based, not person-based: proposals speak about "what the learner did and what could help, never about who the learner is" (deterministic-provider.ts:29-31); a contradicted prediction is "a normal part of exploring a model, not a failing on the learner's part" (misconception-taxonomy.ts:16-22); no diagnosis is ever inferred (misconception-taxonomy.ts:16); there are no diagnosis-based presets (README.md:17); the replay frames every step neutrally ("No adaptation was offered", "Nothing flagged — the evidence and prediction lined up", adaptation-replay.tsx:138-142, 156-159); and the free-text research questions are explicitly non-judgmental (research-mode.tsx:94-123).
- **Required product evidence:** A replay screenshot showing neutral wording after a contradicted prediction.
- **Weak answer to avoid:** "It corrects the learner's errors." (Wrong framing — the product doesn't correct, it offers.)
- **Current status: YES.**

### JUDGE-31. Does adaptation feel surveillant?
- **Question:** The app records everything. Does the learner feel watched?
- **Strong answer:** Everything is recorded only in the learner's own browser: anonymous, local, Zod-validated (src/storage/session-storage.ts). The default posture is zero network activity; the ONLY exception is the optional, labeled `POST /api/adapt` when the hosted path is enabled, which sends a bounded typed session summary (never identity, never free text verbatim) and falls back locally on any failure. No account, no telemetry; the record is visible back to the learner as the Adaptation Replay; data leaves the device otherwise only if the learner clicks Export, with a label on the file; and Clear Session exists with a confirm.
- **Required product evidence:** A network-panel screenshot showing zero requests during a full session (hosted path off) or exactly the one labeled `/api/adapt` request (hosted path on).
- **Weak answer to avoid:** "Data is anonymized in the cloud." (There is no cloud.)
- **Current status: YES.**

### JUDGE-32. What data is collected, and where does it live?
- **Question:** Exactly what data, stored where, and who can access it?
- **Strong answer:** Two localStorage keys (`unseenlab.preferences.v1`, `unseenlab.evidence.v1`, src/storage/session-storage.ts): preferences (learner.ts) and evidence (predictions, trials incl. full snapshots, representation events, proposals+decisions, concept evidence — src/domain/evidence.ts). It lives on the learner's device; no server, no database, no third party in the default posture. Access: only the learner (browser) and anyone they send the optional JSON export to. If the hosted path is enabled, the server bridge additionally receives the bounded typed payload (structured prediction, confidence, trial summary, behavior counts — no identity) and its telemetry logs only model, fallback reason, and elapsed ms. Free-text research answers are NOT persisted in this commit (component state only).
- **Required product evidence:** The exported JSON structure from a live session.
- **Weak answer to avoid:** "We only collect what's needed for the AI." (In the default posture no AI collects anything.)
- **Current status: YES.**

### JUDGE-33. What happens if the learner rejects everything?
- **Question:** If a learner rejects every suggestion, does the product keep nagging or break?
- **Strong answer:** It stops proposing those types for the session: rejected proposal types are never re-proposed (deterministic-provider.ts:39-43, 61), the proposal cap is 3 per propose() (deterministic-provider.ts:19-20), and the lab remains fully functional with the learner's own preferences (the shell runs trials regardless of proposal state, experiment-shell.tsx:165-241; if the provider throws, trials still run with a notice, 210-220). The adaptation card even shows the zero-state honestly ("No suggestions right now...", adaptation-card.tsx:40-54). Nothing is forced; rejecting everything yields a normal simulator with prediction gating — which is the designed consent boundary.
- **Required product evidence:** A session trace rejecting two proposal types and showing they do not reappear (tests/adaptation/deterministic-provider.test.ts covers the rule; reviewed, not executed).
- **Weak answer to avoid:** "The AI keeps trying until the learner accepts." (That's the opposite of the implementation.)
- **Current status: YES.**

---

*Rule reminder: every answer above cites inspectable code or docs; anything not yet demonstrable is labeled UNVERIFIED or NO. Do not answer a question whose evidence does not exist yet — say what would need to exist, as the table does.*
