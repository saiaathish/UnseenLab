# UnseenLab — Product Specification

## Product vision

UnseenLab is an adaptive virtual STEM laboratory in which students safely perform experiments that are dangerous, radioactive, high-voltage, chemically hazardous, biologically unsafe, too expensive, too small, too large, too slow, or otherwise impossible under ordinary school conditions. The defensible delta vs. PhET, Labster, PraxiLabs and similar products is:

> Existing virtual laboratories usually provide one predefined interface. UnseenLab observes how a learner predicts, manipulates, retries, and interprets an inaccessible experiment, then offers a different representation, variable structure, feedback strategy, or pacing — while preserving learner control.

## User problem

A high-school student in AP Physics 2 (Modern Physics) reports that demonstrations and lab examples are not interactive enough to build a full understanding. Static diagrams and one-path virtual labs assume a single way of perceiving cause and effect. Learners who think differently benefit from choosing how an experiment is shown — animation, graph, equation, causal map, plain language — and from adapting pacing, information density, and variable structure based on demonstrated understanding rather than on identity or diagnosis.

## User flow

1. Open UnseenLab (no account).
2. Choose the Nuclear Chain Reaction lab.
3. Set display preferences (explicit controls; defaults are calm and neutral).
4. Read the task: *"Find out what happens to the reaction when you withdraw the absorber."*
5. Submit a prediction (quick choice and/or own words) + confidence 1–5.
6. Adjust variables (sliders; one-variable mode available).
7. Run the seeded trial — required: a prediction must exist first.
8. Watch the animation; play/pause/step/reset; switch speed; reduced-motion possible.
9. Compare with the prediction; optionally open graph/equation/causal/plain-language views.
10. Review adaptation offers (explainable, evidence-tagged): accept / reject / modify.
11. Run a Counterfactual Microscope comparison (exactly one variable, same seed).
12. Submit an updated prediction (post-trial confidence).
13. Open Adaptation Replay to review the journey.
14. Optional: research mode — pre/post questions, mental effort, free-text feedback, JSON export, clear local session.

## Adaptation dimensions

| Dimension | Examples | Controlled by |
|---|---|---|
| Representation | animation, graph, equation, causal, plain language | learner tabs + adaptation offers |
| Pacing | animation speed 0.25–2×, reduced motion | learner + adaptation offers |
| Information density | low / medium / full | learner + adaptation offers |
| Experiment structure | one-variable mode | learner + adaptation offers |
| Feedback timing | immediate / after trial / hints only / manual | learner |
| View composition | preferred representations set | learner + adaptation offers |

Adaptation cards always show: what was observed, what change is proposed, why it may help, and Accept / Reject / Modify buttons. Learners can override any adapted setting manually at any time.

## Functional requirements

- Landing page with product pitch, "Enter the lab" primary action, ready lab card, planned lab cards (non-interactive).
- Lab page: title, goal, conceptual-safety disclaimer, prediction panel, variable controls, run control, animation canvas, representation tabs, adaptation card, counterfactual panel, replay, accessibility controls, research mode.
- Prediction required before running; confidence 1–5 before and after.
- Deterministic seeded simulation with safety caps (population ceiling, step limit, clamping, no negatives).
- Adaptation provider interface with a working deterministic offline implementation; every proposal carries evidence IDs.
- Counterfactual Microscope: exactly one variable, same seed, side-by-side outcome comparison, plain-language causal explanation, original trial immutable.
- Adaptation Replay: initial prediction → variables changed → outcome → interaction pattern → possible conceptual friction → adaptation → decision → updated prediction → counterfactual → evidence of changed understanding.
- Research mode: pre/post questions, confidence, mental effort, free-text, JSON export, clear-session. Labeled as initial design case study evidence, not a validated study.
- Anonymous local persistence (localStorage, Zod-validated); corrupt data fails safe to defaults; no telemetry.

## Nonfunctional requirements

- Strict TypeScript, no `any` without justification, no disabled type checks.
- Determinism: same seed + parameters ⇒ same result; replay data matches recorded session events.
- Browser safety: simulation terminates at cap or step limit; no unbounded loops/arrays; no freezing.
- Accessibility (practical WCAG-oriented): semantic HTML, keyboard access, visible focus, sufficient contrast, reduced motion, no color-only meaning, screen-reader state summary, responsive layout, large touch targets, no drag-only interactions.
- No runtime dependence on paid services; app works fully offline with no API key.
- No generic unrestricted chat endpoint; AI confined to structured input/output schemas.
- No unsafe arbitrary code execution; no LLM-generated scientific calculations.
- Local-first: everything stored on device; external transmission only via explicit JSON export.

## Out of scope (this commit)

Authentication, cloud database, paid APIs, generic chat, teacher dashboard, full course system, additional complete labs, VR, webcam analysis, diagnosis detection, social features, deployment credentials, real dangerous laboratory instructions, authoring platform.

## Future lab registry vision

`src/domain/experiments.ts` defines `ExperimentDefinition` (id, title, pitch, goal, parameter specs, defaults, status). A shared `ExperimentShell` renders any registered lab. Future modules registered as planned: High-Voltage Circuit Failure, Exothermic Thermal Runaway. New labs require: a seeded engine + invariant tests, parameter specs, a registry entry, and a safety review (see `docs/safety-model.md`). No full authoring platform in this commit.

## Demo flow

1. Open UnseenLab. 2. Enter Nuclear Chain Reaction. 3. Choose animation-first, low text density, interactive mode. 4. Read the goal. 5. Enter prediction: "The reaction gets slightly faster." 6. Set absorber position lower. 7. Run the seeded trial. 8. Watch the neutron population accelerate nonlinearly to the safety ceiling. 9. Show the graph. 10. Display prediction vs. observed result and possible `LINEAR_VS_NONLINEAR_GROWTH` friction. 11. Offer: freeze all variables except absorber position · slow animation · compare two trials. 12. Accept. 13. Run the Counterfactual Microscope (absorber position). 14. Show side-by-side trials. 15. Submit updated prediction ("The neutron population may grow nonlinearly."). 16. Open Adaptation Replay. No step depends on an external model API.
