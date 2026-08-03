# UnseenLab — Demo Script (2:45 spoken)

**Purpose:** The exact, rehearsal-ready script for the Track 1 demo video (max 3 minutes).
**Runtime:** 2:45 spoken + 15 seconds reserved for interaction latency = 3:00 wall clock.
**Hard rule:** every claim below is demonstrable on screen. If it is not on screen, do not say it.

---

## The 3-second rule

- No architecture diagrams, no code, no "rules engine" talk in the opening. In the first three
  seconds the judge must see a person and a product, not a diagram.
- Every claim maps to a visible element. If you cannot point at the element, cut the claim.
- Show first, explain second. The phrase "misconception taxonomy" never leaves your mouth on
  video; say "the lab's evidence rules" instead.
- The demo is one session, one trial, from a clean state. The current build gates every run on a
  prediction (`src/components/lab/experiment-shell.tsx:165-179`) and records a submitted
  prediction against the last trial (`experiment-shell.tsx:132-163`) — a second trial in the
  same session cannot be run without clearing the session (Research mode → "Clear local
  session", confirm twice). The script below is built for exactly one trial. Do not improvise a
  second run.

---

## Production facts you are allowed to rely on (all verified in source)

| Fact | Source |
|---|---|
| Same seed + same parameters → identical run (seeded PRNG, client-side) | `src/simulation/nuclear-chain-reaction.ts` (`createSeededRandom`) |
| Adaptation can only change representation/pacing/preferences, never science | `src/domain/adaptation.ts:33-63` (`applyProposedChanges` touches preferences only) |
| Adaptation is offline deterministic rules, not an LLM; no AI SDK in dependencies (next, react, react-dom, zod) | `src/adaptation/deterministic-provider.ts:22-31`; `package.json` |
| Zero network calls; everything local; storage writes guarded by try/catch | `src/storage/session-storage.ts:32-42, 71-85` |
| Counterfactual changes exactly one variable, keeps the same seed | `src/simulation/counterfactual.ts:10-20` |
| Landing page: one lab "Available now", two "Planned" | `src/app/page.tsx:38-77` |
| The demo smoke flow the product is tested against | `e2e/smoke.spec.ts:8-48` (predict → withdraw → run → ceiling → adapt → compare → replay) |

### Verified seeded outcomes (seed 42, startingNeutrons 3, density 0.9, absorption 0.25, duration 60)

Run with **absorber 0.9 (default)** → `extinct` at step 7, final free neutrons 0, reactions 4.
Run with **absorber 0.2** → `max_population` at step 28, final free neutrons **500**, reactions **1043**.
Counterfactual absorber **0.2 → 0.9** (same seed) → final free neutrons **0**, reactions 4.
**Do not use absorber 0.5**: with seed 42 it goes extinct (verified). The hero flow below uses 0.2.

### Adaptation cards that MUST appear after the hero trial (prediction contradicted, in order)

1. `show_graph` — "The prediction and the result differed. Seeing the population on a graph can
   show how it actually grew." (fires when the linear/nonlinear evidence is contradicted and no
   graph was opened after the trial; `src/adaptation/deterministic-provider.ts:101-122`)
2. `compare_trials` — "A side-by-side comparison of two runs that differ in only one variable can
   show what actually caused the difference." (`deterministic-provider.ts:124-133`)
3. `reduce_density` — "The reaction hit the safety ceiling, so the details were hidden. Lowering
   the material density would let us see more of the curve." (`deterministic-provider.ts:180-193`)

---

## THE SCRIPT

### Segment 1 — Problem (0:00–0:20)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 0:00–0:08 | Presenter, speaking to camera | "The most important STEM experiments are the ones you can never touch. Nuclear reactions, high-voltage circuits, thermal runaway — dangerous, radioactive, or just too slow for a classroom." | Standing, camera on presenter. No product yet. |
| 0:08–0:16 | Same | "And the labs we do get? One interface, one speed, one representation — every learner is pushed through the exact same fixed flow, whether it fits how they think or not." | Small hand gesture, no screenshots. |
| 0:16–0:20 | Same | "We designed with a 17-year-old who told us straight: the classroom demos were missing interactivity, and animation mattered to him. That is design-participant input, not a study result — it is where we started, not what we proved." | Deliver this frame honestly: no study claims. |

**Presenter note:** 0:00–0:20 is presenter-only. No product, no slides, no architecture. The
design participant sentence must include the word "design participant" and must not imply data.

### Segment 2 — Solution + pitch (0:20–0:35)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 0:20–0:29 | UnseenLab landing page (`/`): title, one lab "Available now", two "Planned" cards | "This is UnseenLab. Verbatim pitch: 'UnseenLab lets students safely perform otherwise inaccessible STEM experiments while an adaptive AI engine changes how each experiment is represented, paced, and controlled according to the learner's demonstrated understanding.'" | Cut to the landing page at 0:20. The pitch is read slowly, one sentence, no ad-libs. |
| 0:29–0:35 | Accessibility & display panel open: animation speed, reduced motion, representations | "Every one of those dials — speed, motion, representations — is a learner-controlled setting, not a profile the system invented. And let me be explicit: no diagnosis mode. The system never classifies the learner." | Click "Accessibility & display" in the lab header (`src/components/lab/experiment-shell.tsx:344-352`) and show the panel. Do not list every setting; sweep the panel once. |

### Segment 3 — Live hero flow (0:35–1:35) — one trial, one session

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 0:35–0:40 | Landing page | "One lab is live today: a conceptual nuclear chain reaction. Let's go in." | Click "Enter the lab". Latency buffer: page is client-rendered; give it one beat. |
| 0:40–0:50 | "Predict first" panel with the goal: "Find out what happens to the reaction when you withdraw the absorber." | "The lab does not let you run before you predict. I think it gets slightly faster — I don't expect it to really take off." | Click radio "It gets slightly faster", set confidence 3, click "Submit prediction". Wait for the "Your prediction" card. |
| 0:50–0:56 | Experiment variables: Absorber position 0.9 inserted | "The absorber rod is fully inserted at 0.9. I'm going to withdraw it." | Drag Absorber position to 0.2 (slider step is 0.1; 0.2 hits the ceiling with seed 42 — verified; 0.5 goes extinct, never use it). |
| 0:56–1:10 | Canvas; then "Run trial" → Play → animation | "Run it. Same seed as always: 42. Play." | Click "Run trial". Click "Play" (the canvas never auto-plays — `src/components/lab/simulation-canvas.tsx:23-24`). Narrate nothing during the animation; let it run to the ceiling at step 28. |
| 1:10–1:18 | Stop banner: "The simulation stopped at the safety ceiling: 500 free neutrons." | "It did not grow slightly faster. It grew so fast the simulation stopped at the safety ceiling — 500 free neutrons — and the steepest part of the curve is cut off." | Point at the stop banner (`simulation-canvas.tsx:74-97`). This is the friction beat: prediction vs result. |
| 1:18–1:26 | "Suggested adaptation" card (`show_graph`) | "The lab checks my prediction against what happened, and it flags the mismatch. Listen to the reason: 'The prediction and the result differed. Seeing the population on a graph can show how it actually grew.' I accept." | Read the reason verbatim off the card. Click "Accept". The Graph tab opens automatically (`experiment-shell.tsx:264`). |
| 1:26–1:35 | Graph view with "safety ceiling (500)" annotation; then Counterfactual Microscope | "Now the question is causal: what did the absorber actually do? In the Counterfactual Microscope I pick one variable — absorber position — and push it back to 0.9. Run comparison." | Click "Run comparison". Read the result block: "Changed exactly one variable: Absorber position 0.2 → 0.9" and the explanation — free neutrons 500 → 0, reactions 1043 → 4. |

**Presenter note — latency buffer:** the 0:35–1:35 window reserves ~10 seconds of slack. If
anything lags, skip narration during the animation, not during the prediction or the adaptation
read — those are the beats that matter.

### Segment 4 — Winning edge (1:35–2:05)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 1:35–1:50 | Counterfactual comparison still visible | "That is the Counterfactual Microscope: changed exactly one variable, same randomness, same seed — any difference is caused by that one change. Same seed, same duration — the only difference between these two runs is that one absorber." | Keep the comparison on screen; point at the "Same randomness seed (42)" line. |
| 1:50–2:05 | Adaptation Replay dialog, steps 5 and 6 | "And every suggestion is accountable. Here's the replay: my prediction, the friction the lab flagged, the adaptation it offered, and my decision — accepted. Every suggestion cites the evidence that triggered it, and you can reject it." | Click "Adaptation Replay" (header button), show step 5 "Possible conceptual friction — evidence suggests: contradicted" and step 6 "Adaptation offered … Your decision: Accepted". Close the dialog. |

**Presenter note:** the Reject and Modify buttons exist on every card
(`src/components/lab/adaptation-card.tsx:170-188`) and a rejected type is never re-offered in the
session (`deterministic-provider.ts:39-43`). Do not click them in the demo; name them.

### Segment 5 — Technical proof (2:05–2:25)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 2:05–2:15 | Back on the lab; hover the seed control | "Under the hood: a deterministic engine. Same seed, same parameters, same result — every time. That is what makes the counterfactual honest." | Click "Show advanced: randomness seed" (`src/components/lab/variable-controls.tsx:107-114`) to reveal seed 42. |
| 2:15–2:25 | Adaptation card row (Accept/Reject/Modify) | "And the adaptation is deterministic adaptation — structured rules, not a language model. There is no AI SDK in this build. The adaptive engine can change how the lab is represented, paced, and controlled — it can never change the science. Everything runs on this laptop, zero network calls." | Point at the card buttons. Do not overclaim: say "adaptive engine" and "deterministic adaptation". |

### Segment 6 — Impact + closer (2:25–2:45)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 2:25–2:40 | Research mode open; the placeholder block on screen | "We are in active user testing with our design participant. These are the numbers we will report from it — we will not present placeholders as results." | Open Research mode; show the placeholder block below verbatim. |
| 2:40–2:45 | Presenter, camera | "UnseenLab does not ask learners to fit one lab interface. The lab changes with them." | Stop. That is the closer, verbatim. |

**Placeholder impact block (display verbatim, never replace with invented numbers):**

```
Baseline: [X/3]
After use: [Y/3]
Confidence: [A/5] → [B/5]
Mental effort: [C/5] → [D/5]
Feedback-driven change: [CHANGE]
```

---

## Rehearsal checklist

- [ ] Dry-run the full script 3 times with a 2:45 timer; spoken word count must fit the window.
- [ ] Once, before recording, run the seeded trial at absorber 0.2 and confirm the stop banner
      "safety ceiling: 500" and all three cards (show_graph, compare_trials, reduce_density) appear.
- [ ] Before recording: open "Accessibility & display" and set animation speed to fastest
      (2x), reduced motion off. The preference persists; a full 29-step playback is ~13s at 2x.
- [ ] Practice the two recoveries from `demo-failure-script.md` that can strike mid-recording:
      animation freeze (use Step), missing card (never improvise; see failure mode 3).
- [ ] Confirm the recorded hero flow backup file exists and plays (see backup checklist in
      `demo-failure-script.md`).
- [ ] Confirm mic, recording software, screen-recording permission, and the 2:45 timer.
- [ ] Rehearse the impact segment out loud — the placeholder framing line is the easiest to rush.
- [ ] Time check: 0:20, 0:35, 1:35, 2:05, 2:25, 2:45 — if you are more than 5 seconds off any
      marker, tighten the animation beat, never the prediction or adaptation beats.

---

## Words to never say

| Never say | Why | Say instead |
|---|---|---|
| "our AI chatbot" | There is no chatbot | "the adaptive engine" |
| "clinically proven" / "proven to improve learning" | No study exists | "in active user testing" |
| "we improved his grades" | Never measured | "the design participant told us interactivity mattered" |
| "ADHD mode" / "ADHD profile" / "personalized for ADHD learners" | No diagnosis mode; would misrepresent the participant | "learner-controlled settings" |
| "the model was trained on…" / "LLM" | No AI SDK in the build | "deterministic adaptation rules" |
| "studies show…" / "85% of…" / any number | Invented | the placeholder block, verbatim |
| "the system knows what kind of learner you are" | Contradicts no-diagnosis design | "the system never classifies the learner" |
| "sent to the cloud" / "our servers" | Zero network calls | "everything stays on this device" |

---

## If asked to go deeper (1-minute appendix)

**Hardest judge question: "Give me one case where your adaptation did materially better than a
static simulation."**

Answer with the contradicted-linear-prediction scenario (30–45 seconds, live in the app):

1. "A learner predicts 'It gets slightly faster' — a linear expectation."
2. "The run is nonlinear — it hits the ceiling at 500. In a static simulation, the curve plays,
   nobody acknowledges the prediction, and the mismatch quietly disappears."
3. "Here, the lab holds the prediction next to the outcome, records the concept evidence as
   contradicted, and offers a change — the graph — with a plain-language reason tied to that
   exact evidence. The learner accepts it or rejects it."
4. "The material difference: the learner's wrong prediction becomes the teaching moment. The
   learner is in the loop, decides what happens next, and the counterfactual then isolates the
   one variable that caused it."

Close: "We measured nothing yet — that is the case we are testing with our participant now."
Do not claim learning gains; claim a design difference that is demonstrable on screen.
