# UnseenLab — Judge Q&A

Prepared answers for the official judging questions. Honest, evidence-linked, with missing evidence and failure conditions stated.

---

## Lawrence Fung — Stanford neurodiversity perspective

**Likely question:** *What did your neurodivergent design participant tell you that contradicted your original assumptions?*

**Honest answer:** Our original assumption was that a good virtual lab plus a few extra toggles would be enough. The participant (a high-school senior with disclosed ADHD who reported difficulty building understanding of Modern Physics from demonstrations) told us the core problem was **interactivity and animation**: without being able to manipulate the system and watch it move, the demonstrations never built a full mental model. He valued interactivity and animation above all other features. That directly shaped the product: animation is the visual center, every representation is a choice, and the adaptation engine changes representation, pacing, and structure instead of just adding hints. A second, softer contradiction: the participant was interested in engineering but wary of materials that feel like a textbook — so the lab speaks in plain language and conceptual values rather than dense notation by default.

**Product evidence:** `docs/user-research.md` (confirmed preferences, empty templates for future sessions), the animation-first lab layout, representation tabs, adaptation offers.

**Missing evidence:** direct quotes and structured test results (templates exist; no test performed yet — nothing fabricated).

**Failure condition:** presenting the design-participant interview as a completed user study.

---

## Wei Xiong — leadership and impact perspective

**Likely question:** *Can this scale beyond one student and one physics lesson?*

**Honest answer:** Yes, by architecture. A lab is a typed `ExperimentDefinition` (parameters, defaults, goal, status) in `src/domain/experiments.ts`; any registered lab renders in the shared `ExperimentShell`. The adaptation layer is a provider interface (`AdaptationProvider`) decoupled from any specific lab. Preferences and evidence are generic (representations, pacing, density, prediction history, trials). Two future labs (High-Voltage Circuit Failure, Exothermic Thermal Runaway) are already registered as planned. There is no diagnosis-specific hardcoding anywhere — only explicit preferences and demonstrated behavior, so the system is safe to generalize to any learner and any subject.

**Product evidence:** experiment registry, shared shell, provider abstraction, generic evidence model.

**Missing evidence:** a second working lab; authoring tooling (explicitly out of scope).

**Failure condition:** claiming multi-lab support without a second implemented lab.

---

## Disha Patel — software and ML perspective

**Likely question:** *What exactly does AI do, and what happens without it?*

**Honest answer:** The AI layer (1) interprets learner predictions (structured choices or conservative keyword classification of free text), (2) maps behavior and outcomes onto a bounded misconception taxonomy (five concepts), and (3) selects targeted, explainable pedagogical interventions (freeze variables, slow animation, show graph, compare trials, causal view, reduce density, ask again) — each with evidence IDs and a plain-language reason. It proposes; the learner disposes. Two implementations share one typed `AdaptationProvider` interface: the deterministic offline rules (always available, the default) and an optional structured LLM provider behind `POST /api/adapt` — a typed, Zod-validated payload in, a schema-validated answer out, active only when the build-time flag `NEXT_PUBLIC_LLM_ENABLED=1` and a server-side `LLM_API_KEY` are set. Any failure — no key, timeout, invalid JSON, schema violation — falls back silently to the deterministic rules, and proposals are labeled "AI interpretation" vs "Offline rules" so the learner can always tell them apart. Without the hosted path, the app is still a complete, deterministic virtual lab: prediction → seeded simulation → animation → graph/equation/causal/plain-language views → counterfactual comparison → replay, all offline with no API key. There is no generic unrestricted chat endpoint, and the model never sees simulation equations or learner identity.

**Product evidence:** `src/adaptation/` (interface + deterministic provider + `StructuredLLMAdaptationProvider`, `llm-client.ts`, `llm-schema.ts`), the `src/app/api/adapt/route.ts` bridge, isolated scientific core in `src/simulation/`, tests for both layers.

**Missing evidence:** a live judging demo WITH the hosted model enabled and a key (the fallback story is solid and demoable; the "AI interpretation" moment has not yet been shown live).

**Failure condition:** the adaptation layer influencing simulation outcomes — structurally impossible here (separation of layers; AI operates only on evidence).

---

## Haixia Gu — autism advocacy and accessibility perspective

**Likely question:** *Did the learner control the interface, or did the system decide what was best for them?*

**Honest answer:** The learner controls everything. Every accessibility/display setting (animation speed, reduced motion — including the OS `prefers-reduced-motion` preference — information density, one-variable mode, high contrast, text scale, preferred representations) is an explicit control with a readable value, persisted locally. The former "feedback timing" control was removed because it never did anything. Adaptations are offers, not actions: each card states what was observed, what would change, and why it may help, with Accept / Reject / Modify buttons; a rejected proposal type is never re-offered; every preference can be manually overridden. There are no clinical labels, no diagnosis-based presets, and the product never says "the system diagnosed a misconception" — it speaks of "possible conceptual friction". No timer, no forced audio, no flashing, no account.

**Product evidence:** `accessibility-controls.tsx`, `adaptation-card.tsx`, non-judgmental copy everywhere, reject rule in the deterministic provider.

**Missing evidence:** a recorded usability session showing a learner using the controls without assistance.

**Failure condition:** any flow that silently changes the learner's experience.

---

## Soumitra Mehrotra — data science perspective

**Likely question:** *How do you know the adaptation reflects learning evidence rather than arbitrary UI behavior?*

**Honest answer:** Adaptations are computed from recorded evidence only: prediction history (answer, structured key, confidence, timestamps), trial history (parameters, snapshots, changed variables), representation usage (mode + openedAt), retry/replay patterns (identical parameter sets), accepted/rejected/modified adaptation decisions, concept evidence with evidence IDs, and explicit confidence before/after. Every proposal's `evidenceIds` reference the exact records that triggered it, and the Adaptation Replay shows the causal chain from evidence to offer to decision to updated prediction. Nothing is inferred about the learner as a person — no diagnosis inference exists in the codebase.

**Product evidence:** `SessionEvidence` schema (Zod-validated), deterministic provider rules, replay view, JSON export.

**Missing evidence:** longitudinal data across sessions (no server/database by design).

**Failure condition:** any claim of diagnosis or trait inference — absent from the codebase.

---

## Benslyne Avril — psychotherapy and learner-wellbeing perspective

**Likely question:** *How do you avoid judging or pathologizing the learner?*

**Honest answer:** Through language and design. The product says "Try another representation", "Compare one variable", "This prediction differed from the observed result", "Would this view help?" It never says "You failed", "You were inattentive", "Your ADHD caused this", "You are deficient", or "The AI diagnosed a misconception" — it uses "possible conceptual friction" and "possible interpretation". Mismatches are framed as prediction-vs-outcome comparisons, not personal failures. No diagnostic labels anywhere; the adaptation card always leaves control with the learner.

**Product evidence:** copy audit of all UI strings and provider reasons; `docs/safety-model.md`; user-research framing.

**Missing evidence:** participant testimony that the tone felt non-judgmental (pending first test session).

**Failure condition:** shipping copy that attributes outcomes to identity or diagnosis.

---

## The question the team hopes nobody asks

**Likely question:** *Show one case where adaptation did something materially better than a static simulation.*

**Answer — built into the demo:** A static simulation would show the learner "the neutron count goes up." In UnseenLab, the learner predicts "it gets slightly faster", withdraws the absorber, and the seeded run accelerates nonlinearly to the safety ceiling. The engine flags possible `LINEAR_VS_NONLINEAR_GROWTH` friction, offers a one-variable comparison plus a slower animation, the learner accepts, and the Counterfactual Microscope shows — with identical randomness — that the absorber alone explains the difference. The Adaptation Replay then shows the updated prediction aligning with the controlled trial. That is a materially better outcome than a static sim: the learner has actively rebuilt their model of cause and effect, and can replay exactly what changed and why.

**Product evidence:** `e2e/smoke.spec.ts` executes this exact sequence.
