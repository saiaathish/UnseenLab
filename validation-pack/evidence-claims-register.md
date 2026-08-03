# Evidence and Claims Register

Single source of truth for what UnseenLab may and may not claim. Every claim used in the pitch, README, demo, or video must appear here with an approved wording. A claim may only move from UNVERIFIED to VERIFIED when the listed evidence exists.

Status legend: **CONFIRMED (PROFILE)** = supported by the confirmed design-participant facts supplied for this product; **INSPECTED** = verified in source by this audit; **PARTIAL** = only part of the evidence exists; **UNVERIFIED** = no evidence yet; **NOT ALLOWED** = must never be claimed.

| Claim | Status | High-level note |
|---|---|---|
| CLAIM-01..05 | CONFIRMED (PROFILE) | Design-participant facts |
| CLAIM-06, 09, 10, 11, 19 | INSPECTED | Verified in code |
| CLAIM-08, 13 | PARTIAL | Real but with known gaps |
| CLAIM-07, 17, 18, 20 | UNVERIFIED | Require real user testing |
| CLAIM-12 | UNVERIFIED | Design position, not evidence |
| CLAIM-14, 15, 16 | PARTIAL | Defensible delta; needs demo proof |

---

## CLAIM-01 — Designed with a neurodivergent learner

- **Evidence required:** documented ongoing involvement of the design participant (session sheets, design decisions traced to his feedback).
- **Currently available:** confirmed profile facts; README + landing-page attribution ("Designed with an initial design participant…", `src/app/page.tsx:117-121`, `README.md:15-17`); design-decision tracing in `docs/product-spec.md`.
- **Allowed wording:** "Designed with an initial design participant — a high-school senior who reports learning differently."
- **Forbidden wording:** "Co-designed by neurodivergent students" (plural), "validated with", "user-tested".
- **Status:** CONFIRMED (PROFILE) for involvement; VERIFICATION pending for session documentation.

## CLAIM-02 — Interactivity was requested

- **Evidence required:** participant statement; product decision record.
- **Currently available:** profile fact: "Interactivity is important to him"; "Classroom demonstrations and laboratory showcases did not provide enough interactivity."
- **Allowed wording:** "The participant said interactivity mattered to him."
- **Forbidden wording:** "Students with ADHD demand interactivity."
- **Status:** CONFIRMED (PROFILE).

## CLAIM-03 — Animation was requested

- **Evidence required:** participant statement; product decision record.
- **Currently available:** profile fact: "Animation is important to him."
- **Allowed wording:** "Animation was important to the design participant."
- **Forbidden wording:** "Animation improves learning for ADHD students" (causal claim, no evidence).
- **Status:** CONFIRMED (PROFILE).

## CLAIM-04 — Modern Physics was difficult

- **Evidence required:** participant statement.
- **Currently available:** profile fact: "Had difficulty understanding Modern Physics fully."
- **Allowed wording:** "He found Modern Physics difficult to fully understand."
- **Forbidden wording:** "UnseenLab fixes Modern Physics difficulties."
- **Status:** CONFIRMED (PROFILE).

## CLAIM-05 — Existing demonstrations lacked sufficient interactivity

- **Evidence required:** participant statement.
- **Currently available:** profile fact: "Classroom demonstrations and laboratory showcases did not provide enough interactivity."
- **Allowed wording:** "He said classroom demos and lab showcases were not interactive enough for him."
- **Forbidden wording:** "Existing tools fail neurodivergent learners."
- **Status:** CONFIRMED (PROFILE).

## CLAIM-06 — The simulation adapts

- **Evidence required:** adaptation proposals that change visible experience from session evidence; adaptation test vectors ADAPT-001..026.
- **Currently available:** deterministic rule provider with evidence-linked proposals (INSPECTED, `src/adaptation/deterministic-provider.ts`); tests; single-run session constraint limits multi-trial rules (see `implementation-inspection.md`).
- **Allowed wording:** "The lab proposes representation, pacing, and structure changes based on what the learner did — and the learner accepts, rejects, or modifies each one."
- **Forbidden wording:** "AI-driven adaptation" (no AI present), "the system learns your style" (no learning).
- **Status:** INSPECTED — adapts; the *AI* framing is not allowed (see CLAIM-13).

## CLAIM-07 — Adaptation improved understanding

- **Evidence required:** at least one completed user-testing session (pre/post conceptual questions, session sheet).
- **Currently available:** none.
- **Allowed wording:** "In an initial two-session design case study, one participant reported…" (fill in only with real data).
- **Forbidden wording:** "Adaptation improves learning", "proven effective".
- **Status:** UNVERIFIED — no testing performed yet.

## CLAIM-08 — The application is accessible

- **Evidence required:** keyboard, focus, motion, screen-reader, visual, cognitive, and animation tests from `accessibility-audit.md` passing.
- **Currently available:** strong basics (INSPECTED) + verified gaps: no OS `prefers-reduced-motion`, dialog focus trap missing, tab arrow navigation missing, aria-live spam while playing, `textScale` likely ineffective for rem-based text, dead `feedbackTiming` control.
- **Allowed wording:** "Designed with accessibility controls: reduced motion, animation speed, low-density mode, high contrast, text scale, and full keyboard operation of the core flow."
- **Forbidden wording:** "Fully WCAG 2.2 AA compliant", "accessible to all users".
- **Status:** PARTIAL — fix the five verified gaps first.

## CLAIM-09 — The science is deterministic

- **Evidence required:** seed reproducibility test; zero-neutron case; nonnegative state; caps.
- **Currently available:** INSPECTED — Mulberry32 seeded PRNG, fixed consumption order, caps 500/120, clamping, unit tests; counterfactual locks seed (`src/simulation/counterfactual.ts:15-20`).
- **Allowed wording:** "Same settings and same seed always produce the same result. The adaptation layer cannot change scientific outcomes."
- **Forbidden wording:** "Physically accurate nuclear model" (it is explicitly fictionalized).
- **Status:** INSPECTED.

## CLAIM-10 — No API key is required

- **Evidence required:** deploy to a public URL; verify clean-browser flow.
- **Currently available:** INSPECTED — zero network calls in `src/`, no AI SDK, no env vars (`package.json` deps: next, react, react-dom, zod).
- **Allowed wording:** "Runs fully in the browser — no account, no API key."
- **Forbidden wording:** none specific.
- **Status:** INSPECTED (architecture); VERIFY on the deployed URL.

## CLAIM-11 — Data remains local

- **Evidence required:** network tab empty during use; export only on explicit button press; delete clears both localStorage keys.
- **Currently available:** INSPECTED — `unseenlab.preferences.v1` + `unseenlab.evidence.v1` only; zod-validated reads; no analytics SDK; no fetch/axios anywhere in `src/`.
- **Allowed wording:** "Everything stays in your browser. You can export your session as a file or clear it at any time."
- **Forbidden wording:** "Private and secure" (no security claim tested), "anonymized cloud storage".
- **Status:** INSPECTED.

## CLAIM-12 — The project serves any learner

- **Evidence required:** user-testing with more than one learner (any learner who benefits from the listed features).
- **Currently available:** universal-design position only; one design participant engaged.
- **Allowed wording:** "Built from one participant's needs using universal-design principles: representation choice, adjustable pacing, reduced density, controlled experimentation."
- **Forbidden wording:** "Works for all students", "designed for every ADHD learner".
- **Status:** UNVERIFIED.

## CLAIM-13 — AI is used meaningfully

- **Evidence required:** either (a) a real interpretation layer for free-text predictions with conservative abstention, or (b) re-framing: "adaptive engine" claims, no "AI" claims.
- **Currently available:** deterministic rules engine + keyword fallback; NO AI/LLM dependency (INSPECTED).
- **Allowed wording (today):** "A deterministic adaptive engine proposes representation, pacing, and structure changes from your session evidence — you keep control of every change."
- **Forbidden wording (today):** "Our AI", "AI-powered", "machine learning", "the AI interprets your answers".
- **Status:** PARTIAL — the product is meaningfully adaptive; the word "AI" is not yet earned. Highest-risk claim in the register.

## CLAIM-14 — The product is different from PhET

- **Evidence required:** demo segment showing counterfactual microscope + adaptation replay + evidence-linked proposals; PhET comparison in `rubric-audit.md` novelty test.
- **Currently available:** defensible delta documented; differentiators implemented (INSPECTED).
- **Allowed wording:** "PhET gives you a simulation. UnseenLab changes the simulation's representation, pacing, and structure based on what you do — and shows you the causal difference one variable makes."
- **Forbidden wording:** "PhET is not accessible" (unverified competitor claim).
- **Status:** PARTIAL — true in code; needs the 45-second live proof.

## CLAIM-15 — The product is different from Labster

- **Evidence required:** same as CLAIM-14.
- **Currently available:** same differentiators; also no account/payment wall vs Labster's model (unverified competitor claim — keep out of public copy).
- **Allowed wording:** "Unlike full paid lab platforms, this is a single focused conceptual lab that adapts to the learner, runs offline, and keeps evidence local."
- **Forbidden wording:** "Better than Labster", "Labster fails at X".
- **Status:** PARTIAL.

## CLAIM-16 — The product is different from Lumina-style tools

- **Evidence required:** same as CLAIM-14.
- **Currently available:** deterministic-outcomes + learner-controlled adaptation framing (INSPECTED).
- **Allowed wording:** "Lumina-style tools adapt content; UnseenLab keeps the science deterministic and hands the learner the control over every adaptation."
- **Forbidden wording:** "We are a Lumina killer".
- **Status:** PARTIAL.

## CLAIM-17 — The product improved confidence

- **Evidence required:** session sheet pre/post confidence (1–5) showing improvement; one session minimum; reported as case-study, not statistics.
- **Currently available:** none.
- **Allowed wording:** "Baseline confidence [A/5] → after use [B/5]" (real values only).
- **Forbidden wording:** "Boosts student confidence".
- **Status:** UNVERIFIED.

## CLAIM-18 — The product reduced mental effort

- **Evidence required:** session sheet pre/post mental effort (1–5).
- **Currently available:** none.
- **Allowed wording:** "Mental effort [C/5] → [D/5]" (real values only).
- **Forbidden wording:** "Easier for the ADHD brain".
- **Status:** UNVERIFIED.

## CLAIM-19 — The learner independently used it

- **Evidence required:** observed independent use in Part C of the protocol without coaching (except product-defect blocks).
- **Currently available:** none — no testing session has run.
- **Allowed wording:** "He used the lab on his own; we only helped when the product blocked him."
- **Forbidden wording:** "Effortless to use".
- **Status:** UNVERIFIED.

## CLAIM-20 — User feedback changed the build

- **Evidence required:** at least one feedback-driven change from a session (Part E builder decision), committed with a traceable reference to the session sheet.
- **Currently available:** none — no structured testing yet (`README.md:121` states "No structured product test has been performed yet").
- **Allowed wording:** "After the first session we changed [FEATURE] because he said [QUOTE]."
- **Forbidden wording:** "Iterated with user feedback" without a specific, dated example.
- **Status:** UNVERIFIED — this is the single most impactful claim for the Impact criterion (30%); prioritize.

---

## Usage rules

1. Public copy (README, video, pitch) may only contain claims whose status is not UNVERIFIED, or may use the exact placeholder language (`[X/3]`).
2. The demo must state honestly when numbers are pending: "Impact testing is in progress."
3. Re-check the register after every user-testing session and after any AI-provider change; update statuses in place.
