# UnseenLab — Final Demo Script (3:00)

**Status:** FINAL submission script for the Track 1 demo (video + live). Written 2026-08-03 on
`feature/overnight-90-readiness` for the current product: guest-first lab, repeatable multi-trial
loop, optional structured LLM provider with deterministic fallback, Firebase Auth + MongoDB
platform layer. Every clickable string below is real shipped copy (verified in `src/`); every
claim is demonstrable on screen.

**Runtime:** 2:45 spoken + ~15 s reserved for interaction latency = 3:00 wall clock.

**Mandated structure (do not reorder):** 0:00–0:20 problem → 0:20–0:35 solution + pitch →
0:35–1:25 guest hero flow (predict → run → understand → adapt) → 1:25–2:00 loop (counterfactual →
updated prediction → second trial → replay) → 2:00–2:25 AI boundary + fallback proof →
2:25–2:55 impact honesty + optional account continuity → 2:55–3:00 closing claim.

**Two mandated pitch lines (verbatim):**

1. **Core line (say at 2:00–2:25, the AI-boundary beat, and echo it in the closer):**
   > "AI never changes the science. It changes how the learner reaches the science."
2. **Account line (say at ~2:30, the optional account-continuity beat):**
   > "No account is ever required. And when a learner does want their progress to follow them,
   > one Google sign-in saves it to their own private space — nothing else is asked, nothing is
   > inferred."

**Hard rules**

- No architecture diagrams, no code, no "rules engine" talk in the first 20 seconds.
- Every claim maps to a visible element; if you cannot point at it, cut the claim.
- Never promise a specific adaptation card. The demo is intervention-agnostic: any card with a
  plain-language reason and a source badge ("AI interpretation" or "Offline rules") is acceptable.
- The phrase "misconception taxonomy" never leaves your mouth; say "the lab's evidence rules".
- No fabricated numbers, ever. Impact numbers are shown as placeholders or omitted (research mode
  export is labeled "Initial design case study evidence. Not a statistically validated learning
  study." — `src/components/lab/research-mode.tsx:18-19`).

---

## Verified facts you may rely on (all verified in source)

| Fact | Source |
|---|---|
| Same seed + same parameters → identical run (client-side seeded PRNG) | `src/simulation/nuclear-chain-reaction.ts` (Mulberry32 `createSeededRandom`) |
| Adaptation can change representation/pacing/preferences only, never science | `src/domain/adaptation.ts` (`applyProposedChanges` touches preferences only) |
| Adaptation is a typed provider: deterministic offline rules by default; optional structured LLM behind `POST /api/adapt` when `NEXT_PUBLIC_LLM_ENABLED=1` + server `LLM_API_KEY`; ANY failure falls back to rules | `src/adaptation/llm-provider.ts`, `llm-client.ts`, `llm-schema.ts`, `src/app/api/adapt/route.ts`, `src/adaptation/deterministic-provider.ts` |
| Proposals labeled "AI interpretation" vs "Offline rules" | Source badge on the "Suggested adaptation" card (`src/components/lab/experiment-shell.tsx`) |
| Scientific core fully client-side and offline; the only network call is the optional `POST /api/adapt` | `src/app/api/adapt/route.ts`; verified by `scripts/bundle-secret-scan.mjs` + CI |
| Counterfactual changes exactly one variable, same seed | `src/simulation/counterfactual.ts` |
| Guest-first: lab fully usable with no account, no Firebase, no MongoDB | `src/storage/session-storage.ts`; `src/lib/firebase/client.ts` (null → guest mode) |
| Signed-in layer: Google popup → session cookie (`unseenlab.session`, httpOnly, 14 days) → MongoDB-owned rows; `user_id` always derived from verified cookie, never from the body | `docs/security.md` §1, §5; `src/lib/firebase/server.ts` |
| The demo flow is the tested flow | `e2e/smoke.spec.ts` (core flow), `e2e/multi-trial.spec.ts` (three trials, no reload), `e2e/cross-device-resume.spec.ts` (env-gated), `e2e/route-protection.spec.ts` |

### Seeded reference (seed 42; defaults: startingNeutrons 3, density 0.9, absorption 0.25, duration 60)

- Absorber **0.9 (default)** → `extinct` at step 7, final free neutrons 0, reactions 4. (Reference only — do not demo.)
- Absorber **0.2** → `max_population` at step 28, final free neutrons **500**, reactions **1043**. **This is the hero trial.**
- **Do not use absorber 0.5**: with seed 42 it goes extinct (verified — `validation-pack/demo-failure-script.md`).
- Counterfactual absorber 0.2 → 0.9 (same seed) → final free neutrons **0**, reactions **4**.
- With the hosted model enabled, outcomes stay identical (the model never touches simulation output); only the card's reason may differ.

---

## THE SCRIPT

### Segment 1 — Problem (0:00–0:20) · presenter only, no product

| Time | Presenter says | Notes |
|---|---|---|
| 0:00–0:08 | "The most important STEM experiments are the ones you can never touch. Nuclear reactions, high-voltage circuits, thermal runaway — dangerous, radioactive, or just too slow for a classroom." | Camera on presenter. No product yet. |
| 0:08–0:16 | "And the labs we do get? One interface, one speed, one representation — every learner is pushed through the same fixed flow, whether it fits how they think or not." | Small gesture; no screenshots. |
| 0:16–0:20 | "We designed with a 17-year-old who told us straight: the classroom demos were missing interactivity, and animation mattered to him. That is design-participant input, not a study result — it is where we started, not what we proved." | Must include the words "design participant". No study claims. |

### Segment 2 — Solution + pitch (0:20–0:35) · landing page

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 0:20–0:29 | Landing page `/` — topic input hero, "How it works", "Available lab" card | "This is UnseenLab. Verbatim pitch: 'UnseenLab lets students safely perform otherwise inaccessible STEM experiments while an adaptive AI engine changes how each experiment is represented, paced, and controlled according to the learner's demonstrated understanding.'" | Cut to landing at 0:20. Read slowly, one sentence, no ad-libs. |
| 0:29–0:35 | Topic input focused | "You tell the lab what you need help with — I'll type 'chain reaction' — and it routes me straight into the matching experiment." | Type "chain reaction" in the hero input, press Enter → routes to `/lab/nuclear-chain-reaction`. Give the route one beat. |

**Guest-first note (say only if asked):** the lab is fully usable with no account — the signed-in layer is an add-on, never a wall.

### Segment 3 — Guest hero flow: predict → run → understand → adapt (0:35–1:25) · lab page

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 0:35–0:40 | Lab page, "Accessibility & display" panel | "Every dial — speed, motion, representations — is a learner-controlled setting, not a profile the system invented. And to be explicit: there is no diagnosis mode. The system never classifies the learner." | One sweep of the panel. Do not list every setting. |
| 0:40–0:50 | "Predict first" panel: "What do you expect?" radios + "How confident are you?" + "Submit prediction" | "The lab will not let you run before you predict. I think it gets slightly faster — I do not expect it to really take off." | Select "It gets slightly faster", confidence 3, click "Submit prediction". Wait for the "Your prediction" card. |
| 0:50–0:56 | "Change one thing" — "Absorber position" slider at 0.9 | "The absorber rod is fully inserted at 0.9. I am going to withdraw it — one variable, one change." | Drag Absorber position to **0.2**. |
| 0:56–1:08 | "Run trial" → "Running the simulation…" → animation plays | "Run it. Same seed as always: 42. Play." | Click "Run trial". Click "Play" (the canvas never auto-plays). Narrate nothing during the animation; let it run to the ceiling at step 28. |
| 1:08–1:16 | Stop banner: "The simulation stopped at the safety ceiling: 500 free neutrons." | "It did not grow slightly faster. It grew so fast the simulation stopped at the safety ceiling — 500 free neutrons — and the steepest part of the curve is cut off." | Point at the stop banner. This is the friction beat: prediction vs result. |
| 1:16–1:25 | "Try one helpful change" → "Suggested adaptation" card with reason + source badge + Accept / Reject / Modify | "The lab checks my prediction against what happened, and it flags the mismatch — read the reason aloud: [read the card's reason verbatim]. The badge tells me whether this is an AI interpretation or the offline rules; either way, I decide." | Read the reason verbatim off the card, then click "Accept". Accept whatever is offered — never promise a specific intervention. |

**Latency buffer:** the 0:35–1:25 window reserves ~10 s. If anything lags, skip narration during the animation, never during prediction or the adaptation read.

### Segment 4 — The loop: counterfactual → updated prediction → second trial → replay (1:25–2:00)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 1:25–1:35 | "Compare one change" (Optional) → "Counterfactual Microscope" → "Run comparison" | "Now the causal question: what did the absorber actually do? The Counterfactual Microscope changes exactly one variable — absorber position — same randomness, same seed. Any difference is caused by that one change." | Click "Run comparison" (absorber position 0.2 → 0.9). Point at "Same randomness seed (42)" and the delta (free neutrons 500 → 0). |
| 1:35–1:45 | "Updated prediction" prompt | "I understand more than my first guess now. I update my prediction: 'The neutron population may grow nonlinearly.' That updated prediction is what unlocks the next trial." | Submit the updated prediction, confidence 4. |
| 1:45–2:00 | Second trial — change one variable, "Run trial" | "And the lab lets me go again — no reload, no reset. I change one variable, run, and the evidence from both trials is kept." | Change one variable (e.g., Material density), run the second trial, let the animation play briefly. Point at the per-trial evidence. |

**Presenter note:** do not narrate the second trial's outcome in detail — the loop is the point. If the second run feels slow, skip ahead to the Adaptation Replay (next segment).

### Segment 5 — Winning edge: AI boundary + fallback proof (2:00–2:25)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 2:00–2:15 | "Adaptation Replay" dialog listing both trials | "And every suggestion is accountable. Here is the replay — both trials, in order: my predictions, the friction the lab flagged, the adaptation it offered, and my decision. Every suggestion cites the evidence that triggered it, and you can reject it." | Click "Adaptation Replay", show the multi-trial journey, close the dialog (focus returns to the trigger — the dialog traps focus). |
| 2:15–2:25 | "Suggested adaptation" card row with the source badge | "And this is honest by construction: **AI never changes the science. It changes how the learner reaches the science.** If the hosted model is off, unreachable, or wrong, the lab falls back to deterministic offline rules and labels the card 'Offline rules'. Same loop, same science, nothing breaks — the science never depends on a network." | Point at the badge. If the demo runs without a key (default), the badge says "Offline rules" — say exactly that, on screen. |

**Fallback proof practice:** with the hosted model enabled, kill the network (or use a bad key) and show the card still appears labeled "Offline rules". With no key at all, that is simply the default state.

### Segment 6 — Impact honesty + optional account continuity (2:25–2:55)

| Time | On screen | Presenter says | Presenter does |
|---|---|---|---|
| 2:25–2:40 | Research mode open; the placeholder block on screen | "We are in active user testing with our design participant. These are the numbers we will report from it — we will not present placeholders as results." | Open "Research mode"; show the placeholder block below verbatim. |
| 2:40–2:55 | If time permits (or live judging): header link "Sign in to save progress across devices." → "Continue with Google" → 4 onboarding steps → dashboard → "Continue learning" | "And the account is optional end to end. No account is ever required. And when a learner does want their progress to follow them, one Google sign-in saves it to their own private space — nothing else is asked, nothing is inferred. On another device, the dashboard resumes the same session, same evidence, same accessibility choices." | See the WINNING EDGE continuity drill below. If time is tight, run only up to the dashboard and say the account line over it. If sign-in is unavailable on the demo environment, say the recovery line (failure mode F2) instead — never fake sign-in. |

**Placeholder impact block (display verbatim, never replace with invented numbers):**

```
Baseline: [X/3]
After use: [Y/3]
Confidence: [A/5] → [B/5]
Mental effort: [C/5] → [D/5]
Feedback-driven change: [CHANGE]
```

### Segment 7 — Closing claim (2:55–3:00) · presenter, camera

| Time | Presenter says |
|---|---|
| 2:55–3:00 | "UnseenLab does not ask learners to fit one lab interface. The lab changes with them — because **AI never changes the science; it changes how the learner reaches the science.**" |

---

## The WINNING EDGE sequence (mandated) — mapped to real UI elements

This is the exact sequence a judge should be able to tick off during the demo. Each step maps to a
named, shipped UI element.

| # | Edge beat | Real UI element (name on screen) | Evidence (file) |
|---|---|---|---|
| 1 | **Guest entry** — no account, no key, no setup | Homepage topic input "What topic do you need help with?" → routes to lab; or "Available lab" card → "Start this lab" | `src/components/ui/topic-input-hero.tsx`, `src/lib/topic-routing.ts`, `src/app/page.tsx:90` |
| 2 | **Prediction** — mandatory, before every trial | "Predict first" panel: "What do you expect?" radios, "How confident are you?" slider, "Submit prediction" (run is gated without it) | `src/components/lab/prediction-panel.tsx`; gate in `src/components/lab/experiment-shell.tsx:166-170` |
| 3 | **Deterministic result** — seeded, capped, truthful | "Run trial" → "Running the simulation…" → stop banner "The simulation stopped at the safety ceiling: 500 free neutrons." | `src/simulation/nuclear-chain-reaction.ts`, `src/components/lab/experiment-shell.tsx:825` |
| 4 | **Bounded AI** — evidence-linked, labeled, refusable | "Try one helpful change" → "Suggested adaptation" card: plain-language reason + evidence-linked + source badge ("AI interpretation" / "Offline rules") + Accept / Reject / Modify | `src/adaptation/deterministic-provider.ts` (rules), `src/adaptation/llm-provider.ts` (hosted), `src/components/lab/experiment-shell.tsx` |
| 5 | **Learner adaptation** — nothing silent | Accept → proposed change applies (e.g., Graph view opens); Reject → zero changes, type never re-proposed | `src/domain/adaptation.ts` (`applyProposedChanges`), `src/components/lab/experiment-shell.tsx` |
| 6 | **Second trial** — updated prediction unlocks the loop, no reload | "Updated prediction" → "Run trial" again; trials appended, never overwritten | `src/components/lab/prediction-panel.tsx:100,182`; `e2e/multi-trial.spec.ts` |
| 7 | **Replay** — the whole journey is accountable | "Adaptation Replay" dialog: prediction → variables → outcome → friction → offer → decision → updated prediction → counterfactual; lists every trial | `src/components/lab/adaptation-replay.tsx` |
| 8 | **Optional account continuity** — cross-device, consent-gated | "Sign in to save progress across devices." → "Continue with Google" → onboarding "Step N of 4" → dashboard "Continue learning" → "Save your current learning session?" → "Save to my account" → on a second device "Continue where you left off?" → "Continue saved session" → "Trial 2 — run another trial" + "Using your saved learning preferences" | `src/components/auth/sign-in-dialog.tsx`, `src/components/onboarding/onboarding-wizard.tsx`, `src/components/sync/guest-import-dialog.tsx`, `src/components/sync/session-resume-dialog.tsx`, `src/components/lab/experiment-shell.tsx:648,687`; `e2e/cross-device-resume.spec.ts` |

---

## Failure-recovery spoken lines (memorize these; never improvise a fix on stage)

| # | Failure | Verbatim spoken line | Recovery move |
|---|---|---|---|
| F1 | **Hosted model down / returns garbage** (the fallback proof) | "The hosted model is not responding — this is the exact moment the fallback exists for. The card is labeled 'Offline rules': deterministic rules took over, same loop, same science, nothing broke. The AI interpretation is an optional, labeled layer; the lab never depends on it." | Wait for the card (it appears after the 12 s client / 15 s server timeout — `src/adaptation/llm-client.ts`), point at the badge. This IS a demo beat. |
| F2 | **Firebase unavailable / unconfigured** (no Google sign-in) | "Sign-in needs credentials on this demo environment; the lab is fully usable without it — let me show you the same flow as a guest. The account layer ships, is tested against the real stack, and is disabled here only because no credentials are configured." | Do not touch "Continue with Google" again. Continue the guest flow (§3–5). Do not claim sign-in works. |
| F3 | **MongoDB unavailable** (sync fails while signed in) | "The cloud save is not reachable right now — your work is safe on this device. The sync status says exactly that: 'Couldn't sync — your work is safe on this device'. Cloud is an add-on, never a dependency." | Point at the sync chip (`src/components/sync/cloud-sync-status.tsx:40`). Continue locally; export still works. |
| F4 | **OAuth callback failure** (sign-in clicked, error returned) | "We couldn't sign you in with Google. Please try again." (on-screen copy; if the popup was blocked: "We couldn't open Google sign-in. Your browser may be blocking pop-ups. Please allow pop-ups for this site and try again.") | Read the on-screen copy verbatim (`src/components/auth/sign-in-dialog.tsx:113-114`). Retry once after allowing pop-ups; then say F2's line and continue as guest. |
| F5 | **Slow network** (spinners / "Interpreting your evidence…" hangs) | "The lab is local-first — the science runs on this laptop, not a server. The only network call in the whole app is one optional, labeled AI-interpretation request, and it has a hard timeout. What you see running is already computed." | Keep narrating; do not go silent. Skip narration during the animation; the result is synchronous. |
| F6 | **Demo refresh / page reload** | "That reloaded the page — nothing is lost. This session lives in this browser; let me pick up right where we were." | Reload → session restores from `localStorage` (`unseenlab.evidence.v1` + `unseenlab.workflow.v1`, Zod-validated, `src/storage/session-storage.ts`). If signed in, the dashboard resume card is cloud-backed. If the session does not reappear: "Let's start a fresh session — same seed, same setup" (seed 42, absorber 0.2). |
| F7 | **No saved session** (fresh browser / cleaned storage) | "There's no saved session on this device yet — that is the guest-first design. Let's start fresh: same seed, same setup." | Clear via "Research mode" → "Clear local session" (confirm twice) if needed, re-set seed 42, run the hero trial (absorber 0.2). |

---

## Words to never say

| Never say | Why | Say instead |
|---|---|---|
| "our AI chatbot" | There is no chatbot | "the adaptive engine" |
| "clinically proven" / "proven to improve learning" | No study exists | "in active user testing" |
| "we improved his grades" | Never measured | "the design participant told us interactivity mattered" |
| "ADHD mode" / "ADHD profile" | No diagnosis mode | "learner-controlled settings" |
| "the model always picks this intervention" | Interventions vary | "the lab offers an explainable change — I decide" |
| "studies show…" / any invented number | Fabrication risk | the placeholder block, verbatim |
| "the system knows what kind of learner you are" | Contradicts no-diagnosis design | "the system never classifies the learner" |
| "everything runs with zero network, period" | The optional hosted path calls `/api/adapt` when enabled | "the science never depends on a network; the AI interpretation is optional and labeled" |

---

## Rehearsal checklist (before recording)

- [ ] Dry-run 3 times with a 2:45 timer; the closing claim must land at 2:55–3:00.
- [ ] Once, before recording: run trial 1 at absorber 0.2, seed 42 → confirm the stop banner "safety ceiling: 500" and at least one adaptation card with a reason + source badge.
- [ ] Confirm the updated-prediction → second-trial transition (no reload; replay lists both trials).
- [ ] Rehearse F1 (hosted model unreachable → "Offline rules" badge) and F4 (popup blocked) out loud.
- [ ] If the account beat (§6 optional) is included: rehearsal sign-in must have completed once (pre-flight), and the second-device resume must be verified — otherwise run the guest-only variant.
- [ ] Confirm the recorded backup video exists (see `validation-pack/demo-failure-script.md` and `validation-pack/morning-checklist.md`).
- [ ] Time check: 0:20, 0:35, 1:25, 2:00, 2:25, 2:55 — if off by >5 s at any marker, tighten the animation beat, never the prediction or adaptation beats.

## Companion docs

- `docs/judge-question-bank.md` — the 12 mandated judge Q&A answers.
- `docs/screenshot-inventory.md` — the screenshot deck to capture tomorrow.
- `validation-pack/morning-checklist.md` — the morning-of-deadline runbook (participant session, screenshots, video, deploy checks).
- `validation-pack/overnight-score-audit.md` — the score audit this demo is designed to earn.
