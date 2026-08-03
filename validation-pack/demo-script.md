# UnseenLab — Demo Script (2:45 spoken)

> **RE-STAMPED on the final-hardening branch.** This script was rewritten for the
> current product: topic-input homepage, repeatable multi-trial loop (no reload),
> optional structured LLM provider with deterministic fallback, and truthful
> first-trial change evidence. Earlier versions of this script described a
> single-trial session and a fixed three-card deterministic outcome; both are
> obsolete. The script is now **intervention-agnostic** — it must not require the
> hosted model (or the rules) to pick a specific intervention; any adaptation
> offer with a plain-language reason is acceptable in the demo.

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
- The demo is one session with **two trials** from a clean state, to show the loop: predict →
  run → understand → update prediction → run another trial. The current build supports this
  without a reload — every trial is appended to the evidence and the replay lists both.
  Do not improvise a third run unless the first two are fast; two trials prove the loop.

---

## Production facts you are allowed to rely on (all verified in source)

| Fact | Source |
|---|---|
| Same seed + same parameters → identical run (seeded PRNG, client-side) | `src/simulation/nuclear-chain-reaction.ts` (`createSeededRandom`) |
| Adaptation can only change representation/pacing/preferences, never science | `src/domain/adaptation.ts` (`applyProposedChanges` touches preferences only) |
| Adaptation is a typed provider: deterministic offline rules by default; an optional structured LLM provider behind `POST /api/adapt` when `NEXT_PUBLIC_LLM_ENABLED=1` + server `LLM_API_KEY` are set; every failure falls back to the rules | `src/adaptation/llm-provider.ts`, `src/adaptation/llm-client.ts`, `src/adaptation/llm-schema.ts`, `src/app/api/adapt/route.ts`, `src/adaptation/deterministic-provider.ts` |
| Proposals are labeled "AI interpretation" vs "Offline rules" so the learner can always tell them apart | UI badges on the adaptation card |
| The scientific core is fully client-side and offline; the only network call in the whole app is the optional `POST /api/adapt` (hosted path only) | `src/app/api/adapt/route.ts` |
| Counterfactual changes exactly one variable, keeps the same seed | `src/simulation/counterfactual.ts` |
| Homepage: topic input ("What topic do you need help with?") → supported topics route to the lab; unsupported topics get a pointer | `src/components/ui/topic-input-hero.tsx`, `src/lib/topic-routing.ts`, `src/app/page.tsx` |
| The demo flow the product is tested against | `e2e/smoke.spec.ts` (one-trial core flow), `e2e/multi-trial.spec.ts` (three trials without a reload) |

### Verified seeded reference (deterministic rules path; seed 42, startingNeutrons 3, density 0.9, absorption 0.25, duration 60)

Run with **absorber 0.9 (default)** → `extinct` at step 7, final free neutrons 0, reactions 4.
Run with **absorber 0.2** → `max_population` at step 28, final free neutrons **500**, reactions **1043**.
Counterfactual absorber **0.2 → 0.9** (same seed) → final free neutrons **0**, reactions 4.
**Do not use absorber 0.5**: with seed 42 it goes extinct (verified). The hero trial below uses 0.2.

With the hosted model enabled, the deterministic seed facts stay identical (the model never
touches simulation output); only the *interpretation* (the card's reason and the proposed
intervention) may differ. Never promise a specific card — promise the loop.

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

### Segment 2 — Solution + pitch + topic input (0:20–0:35)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 0:20–0:29 | UnseenLab landing page (`/`): topic input hero, "How it works", "Available lab" | "This is UnseenLab. Verbatim pitch: 'UnseenLab lets students safely perform otherwise inaccessible STEM experiments while an adaptive AI engine changes how each experiment is represented, paced, and controlled according to the learner's demonstrated understanding.'" | Cut to the landing page at 0:20. The pitch is read slowly, one sentence, no ad-libs. |
| 0:29–0:35 | Topic input focused; typing "chain reaction" | "You tell the lab what you need help with — I'll type 'chain reaction' — and it routes me straight into the matching experiment." | Type in the topic input, press Enter; the page routes to the lab. Latency buffer: give the route one beat. |

**Presenter note:** do not dwell on the unsupported-topic path in the video; it exists and is
covered by tests, but the demo beats are the loop, not the router.

### Segment 3 — Live hero flow, trial 1 (0:35–1:25)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 0:35–0:40 | Lab page; "Accessibility & display" sweep | "Every dial — speed, motion, representations — is a learner-controlled setting, not a profile the system invented. And let me be explicit: no diagnosis mode. The system never classifies the learner." | Sweep the "Accessibility & display" panel once. Do not list every setting. |
| 0:40–0:50 | "Predict first" panel with the goal: "Find out what happens to the reaction when you withdraw the absorber." | "The lab does not let you run before you predict. I think it gets slightly faster — I don't expect it to really take off." | Click radio "It gets slightly faster", set confidence 3, click "Submit prediction". Wait for the "Your prediction" card. |
| 0:50–0:56 | Experiment variables: Absorber position 0.9 inserted | "The absorber rod is fully inserted at 0.9. I'm going to withdraw it — one variable, one change." | Drag Absorber position to 0.2 (slider step is 0.1; 0.2 hits the ceiling with seed 42 — verified; 0.5 goes extinct, never use it). |
| 0:56–1:08 | Canvas; then "Run trial" → Play → animation | "Run it. Same seed as always: 42. Play." | Click "Run trial". Click "Play" (the canvas never auto-plays). Narrate nothing during the animation; let it run to the ceiling at step 28. |
| 1:08–1:16 | Stop banner: "The simulation stopped at the safety ceiling: 500 free neutrons." | "It did not grow slightly faster. It grew so fast the simulation stopped at the safety ceiling — 500 free neutrons — and the steepest part of the curve is cut off." | Point at the stop banner. This is the friction beat: prediction vs result. |
| 1:16–1:25 | "Suggested adaptation" card with its source badge | "The lab checks my prediction against what happened, and it flags the mismatch — read the reason aloud: [read the card's reason verbatim]. The badge tells me whether this is an AI interpretation or the offline rules; either way, I decide." | Read the reason verbatim off the card, then click "Accept". Accept whatever is offered — any intervention is fine; never promise a specific one. |

**Presenter note — latency buffer:** the 0:35–1:25 window reserves ~10 seconds of slack. If
anything lags, skip narration during the animation, not during the prediction or the adaptation
read — those are the beats that matter.

### Segment 4 — Understanding + the loop (1:25–2:00)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 1:25–1:35 | Counterfactual Microscope result | "Now the question is causal: what did the absorber actually do? The Counterfactual Microscope changes exactly one variable — absorber position — same randomness, same seed. Any difference is caused by that one change." | Click "Run comparison" (absorber position 0.2 → 0.9). Point at the "Same randomness seed (42)" line and the delta (free neutrons 500 → 0). |
| 1:35–1:45 | Updated-prediction prompt | "I now understand more than my first guess. I update my prediction: 'The neutron population may grow nonlinearly.' That updated prediction is what unlocks the next trial." | Submit the updated prediction with confidence 4. |
| 1:45–2:00 | Second trial: change one variable, run | "And the lab lets me go again — no reload, no reset. I'll change one variable this time, run, and the evidence from both trials is kept." | Change one variable (e.g., material density), run the second trial, let the animation play briefly. Point at the per-trial evidence (e.g., "Trial 2"). |

**Presenter note:** do not narrate the second trial's outcome in detail — the loop is the point.
If the second run feels slow, skip ahead by opening the Adaptation Replay (Segment 5).

### Segment 5 — Winning edge + fallback proof (2:00–2:25)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 2:00–2:15 | Adaptation Replay dialog listing both trials | "And every suggestion is accountable. Here's the replay — both trials, in order: my predictions, the friction the lab flagged, the adaptation it offered, and my decision. Every suggestion cites the evidence that triggered it, and you can reject it." | Click "Adaptation Replay", show the multi-trial journey (both predictions and the accepted offer), close the dialog (focus returns to the trigger — the dialog traps focus). |
| 2:15–2:25 | Adaptation card row with the source badge ("Offline rules" or "AI interpretation") | "And this is honest by construction: if the hosted model is off, unreachable, or wrong, the lab falls back to deterministic offline rules and labels the card 'Offline rules'. Same loop, same science, nothing breaks — the science itself never depends on a network." | Point at the badge on the card. If the demo runs without a key (default), the badge says "Offline rules" — say exactly that, on screen. |

**Presenter note — fallback proof:** the single most important resilience beat. Practice it:
with the hosted model enabled, kill the network (or use a bad key) and show the card still
appears labeled "Offline rules". With no key at all, that is simply the default state.

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
- [ ] Once, before recording, run trial 1 at absorber 0.2 and confirm the stop banner
      "safety ceiling: 500" appears and **at least one** adaptation card appears with its
      reason and source badge (do not require a specific intervention).
- [ ] Rehearse the updated-prediction → second-trial transition; confirm no reload happens and
      the replay lists both trials.
- [ ] Rehearse the fallback proof once: hosted model unreachable → card still appears with
      "Offline rules" badge (see `demo-failure-script.md`, failure mode 7/10).
- [ ] Before recording: open "Accessibility & display" and set animation speed to fastest
      (2x), reduced motion off. The preference persists; a full 29-step playback is ~13s at 2x.
- [ ] Practice the recoveries from `demo-failure-script.md` that can strike mid-recording:
      animation freeze (use Step), missing card (never improvise; see failure mode 3).
- [ ] Confirm the recorded hero flow backup file exists and plays (see backup checklist in
      `demo-failure-script.md`).
- [ ] Confirm mic, recording software, screen-recording permission, and the 2:45 timer.
- [ ] Rehearse the impact segment out loud — the placeholder framing line is the easiest to rush.
- [ ] Time check: 0:20, 0:35, 1:25, 2:00, 2:25, 2:45 — if you are more than 5 seconds off any
      marker, tighten the animation beat, never the prediction or adaptation beats.

---

## Words to never say

| Never say | Why | Say instead |
|---|---|---|
| "our AI chatbot" | There is no chatbot | "the adaptive engine" |
| "clinically proven" / "proven to improve learning" | No study exists | "in active user testing" |
| "we improved his grades" | Never measured | "the design participant told us interactivity mattered" |
| "ADHD mode" / "ADHD profile" / "personalized for ADHD learners" | No diagnosis mode; would misrepresent the participant | "learner-controlled settings" |
| "the model always picks this intervention" | Interventions vary (LLM vs rules); never promise a specific card | "the lab offers an explainable change — I decide" |
| "studies show…" / "85% of…" / any number | Invented | the placeholder block, verbatim |
| "the system knows what kind of learner you are" | Contradicts no-diagnosis design | "the system never classifies the learner" |
| "everything runs without any network, period" | The optional hosted path calls `/api/adapt` when enabled | "the science never depends on a network; the AI interpretation is optional and labeled" |

---

## If asked to go deeper (1-minute appendix)

**Hardest judge question: "Give me one case where adaptation did materially better than a
static simulation."**

Answer with the contradicted-linear-prediction scenario (30–45 seconds, live in the app):

1. "A learner predicts 'It gets slightly faster' — a linear expectation."
2. "The run is nonlinear — it hits the ceiling at 500. In a static simulation, the curve plays,
   nobody acknowledges the prediction, and the mismatch quietly disappears."
3. "Here, the lab holds the prediction next to the outcome, records the concept evidence as
   contradicted, and offers a change — with a plain-language reason tied to that exact evidence
   and a source badge, 'AI interpretation' or 'Offline rules'. The learner accepts it or rejects it."
4. "Then the updated prediction unlocks a second trial, and the replay shows both trials — you
   can watch the learner's reasoning change across the loop. The counterfactual isolates the
   one variable that caused it."

Close: "We measured nothing yet — that is the case we are testing with our participant now."
Do not claim learning gains; claim a design difference that is demonstrable on screen.
