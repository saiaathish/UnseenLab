# UnseenLab — Demo Failure Script

**Purpose:** What to do the moment the live demo breaks. Read this before every recording and
every live pitch.

## The principle

1. Never pretend a failure is intentional. Say what happened, in one sentence, with zero apology
   spirals.
2. State the failure once, then move to recorded evidence or screenshots within the same breath.
3. Keep explaining the causal flow of the product while the backup plays — the product story must
   not stop because the app did.
4. Do not spend the pitch debugging. If a fix takes more than 10 seconds, it is not a fix — it is
   a transition to backup.
5. Backup locations below are relative to this pack: `validation-pack/backups/`.

---

## Failure modes

### 1. App does not load

| Field | Content |
|---|---|
| **Likely cause** | Dev server not running (`npm run dev` on the main repo — the worktree has no `node_modules`), port in use, or a browser extension blocking the page. |
| **On-stage admission (verbatim)** | "The app is not loading right now — give me one moment." |
| **Recovery move** | Immediately: "I captured the full flow earlier — watch this. The demo runs entirely on this laptop, zero network calls." Play the recorded hero flow backup and narrate the causal story over it. Only if a 10-second fix is obvious (server restart), do it silently while the video plays. |
| **Where the backup lives** | `validation-pack/backups/hero-flow.mp4` (≤3 min, recorded from this exact script) + `validation-pack/backups/screenshots/` |

### 2. Simulation animation freezes

| Field | Content |
|---|---|
| **Likely cause** | Browser timer throttling (background tab, low power mode) — the playback loop is a `setInterval` in `src/components/lab/simulation-canvas.tsx:39-51`. The simulation result itself is already computed synchronously at run time (`experiment-shell.tsx:185`) and is not affected. |
| **On-stage admission (verbatim)** | "The animation has stalled — the trial itself finished, so let me step through the frames instead." |
| **Recovery move** | "The result is already on screen — the lab just replays it. I'll step forward." Click "Step ›" repeatedly or "Reset", then switch to the Graph tab: "and here is the whole curve — the ceiling at 500 is marked right on the graph." Everything continues; no data was lost. If the canvas is entirely unresponsive, reload the page — the session persists in localStorage and the trial reappears. |
| **Where the backup lives** | No video needed for this one; `validation-pack/backups/screenshots/step-03-result-ceiling.png` if you want a cutaway. |

### 3. Adaptation does not appear after the trial

| Field | Content |
|---|---|
| **Likely cause** | The adaptation engine is offline and deterministic (`src/adaptation/deterministic-provider.ts:33-40`): cards only fire when the evidence conditions match. The hero flow's `show_graph` card requires a contradicted linear prediction (`deterministic-provider.ts:101-122`). If the prediction was supported, or the proposal type was previously rejected (rejected types are suppressed for the session, `deterministic-provider.ts:39-43`), no card appears — that is correct behavior, not a bug. |
| **On-stage admission (verbatim)** | "No suggestion card appeared — the rules only speak when the evidence fires, and here it did not." |
| **Recovery move** | "That is the conservative-by-design part: no evidence, no claim, no diagnosis. Let me show you a case where it must fire." Then run the guaranteed trigger: submit prediction "It stays about the same" (or "It gets slightly faster"), absorber at 0.2, seed 42, Run — ceiling hit makes the growth nonlinear, the prediction is contradicted, and `show_graph` appears with the reason "The prediction and the result differed…". If the presenter had previously rejected `show_graph`, first clear the session (Research mode → "Clear local session", confirm twice) and rerun. |
| **Where the backup lives** | `validation-pack/backups/screenshots/step-05-adaptation-card.png` (the exact card, reason visible). |

### 4. Counterfactual comparison fails

| Field | Content |
|---|---|
| **Likely cause** | No trial has been run yet — the panel shows "Run a trial first to compare what a single change would do." (`src/components/lab/counterfactual-panel.tsx:33-46`). The variable selector only ever exposes the four allowed variables (`src/simulation/counterfactual.ts:15-20`), so an invalid variable is not possible from the UI. |
| **On-stage admission (verbatim)** | "The comparison needs a completed trial first — let me run one." |
| **Recovery move** | Run the seeded trial (prediction + absorber 0.2, seed 42), then click "Run comparison" — it is synchronous and client-side. If the panel still misbehaves, deliver the causal point on the Graph tab instead: "the curve hits 500 here — and this run stops early, which is exactly what the counterfactual isolates." |
| **Where the backup lives** | `validation-pack/backups/screenshots/step-07-counterfactual.png` (side-by-side sparklines with "Changed exactly one variable" visible). |

### 5. Local storage fails (privacy mode / quota)

| Field | Content |
|---|---|
| **Likely cause** | Private browsing, blocked cookies, or quota. All storage reads and writes are guarded: `storageAvailable()` returns false → the app loads defaults and keeps running; `saveLocalSession()` returns false instead of throwing (`src/storage/session-storage.ts:32-42, 71-85`). |
| **On-stage admission (verbatim)** | "This browser is blocking local storage — the lab keeps running, it just can't remember the session after a reload." |
| **Recovery move** | "Everything you see right now still works — prediction, run, adaptation, comparison. Only the persistence across reloads is affected." Continue the demo normally; the evidence export still works from memory (Research mode → "Export anonymous session data (JSON)"). Do not reload the page. |
| **Where the backup lives** | None required; if you must show a persisted session, play `validation-pack/backups/unseenlab-session.json` on screen. |

### 6. Graph fails

| Field | Content |
|---|---|
| **Likely cause** | The graph is a plain inline SVG (`src/components/lab/representation-tabs.tsx:89-168`); a browser rendering quirk, an extension, or a corrupted page state. The data behind it is unaffected. |
| **On-stage admission (verbatim)** | "The graph view is having a rendering problem — let me use the plain-language view instead." |
| **Recovery move** | Switch to the "Plain language" tab — it renders the same outcome as text ("the population was accelerating — it grew much faster than a steady climb. The population grew so fast it hit the safety ceiling of 500 free neutrons."). Or use the "Equation" tab for the balance, or the counterfactual sparklines, which are a separate SVG. |
| **Where the backup lives** | `validation-pack/backups/screenshots/step-06-graph.png`. |

### 7. Network unavailable

| Field | Content |
|---|---|
| **Likely cause** | Irrelevant — there is nothing to fail. The build has zero network calls: dependencies are only next, react, react-dom, zod (`package.json`), the engine, adaptation, and storage are all client-side, and no API keys or env vars exist. |
| **On-stage admission (verbatim)** | "Offline is the default state for this demo — there are no network calls to make." |
| **Recovery move** | Open DevTools → Network tab and show that the only requests are the initial page load: "No API keys, no prompts, nothing leaves this laptop — the whole experiment, adaptation included, is computed here." Then keep going. |
| **Where the backup lives** | None required. |

### 8. Video playback unavailable (venue or recording)

| Field | Content |
|---|---|
| **Likely cause** | Codec/player mismatch at the venue, or the recorded backup file is corrupt. |
| **On-stage admission (verbatim)** | "The video player is not cooperating — here is the same flow, live." |
| **Recovery move** | Go live with the app from the pre-demo checklist state. If the app is also down, walk the screenshot deck in order (each screenshot shows the same steps as the hero flow) and narrate the causal story. |
| **Where the backup lives** | `validation-pack/backups/hero-flow.mp4` + `validation-pack/backups/screenshots/` (step-01 through step-08 in the scripted order). |

### 9. User evidence is incomplete

| Field | Content |
|---|---|
| **Likely cause** | No user testing has been completed yet; no numbers have been collected. This is expected — impact placeholders are the honest state of the project. |
| **On-stage admission (verbatim)** | "The impact numbers are still being collected — testing with our participant is in progress." |
| **Recovery move** | Show the placeholder block verbatim, then show the data format the numbers will come from: Research mode → "Export anonymous session data (JSON)" → `unseenlab-session.json` has the pre/post fields and the export label "Initial design case study evidence. Not a statistically validated learning study." (`src/storage/session-storage.ts:88-100`, `src/components/lab/research-mode.tsx:18-19`). Then say: "We will report exactly what that testing returns — nothing more." Never fabricate; a fabricated number is a disqualifying offense under this pack's severity scale. |
| **Where the backup lives** | `validation-pack/backups/unseenlab-session.json` (sample export, fields empty), and `evidence-claims-register.md` as the single source of truth for what may be said. |

**Placeholder block (verbatim):**

```
Baseline: [X/3]
After use: [Y/3]
Confidence: [A/5] → [B/5]
Mental effort: [C/5] → [D/5]
Feedback-driven change: [CHANGE]
```

---

## Known current-build constraint (not a failure — plan around it)

A session supports exactly **one trial**. After the first run, a submitted prediction is recorded
against the last trial and no pending prediction is created (`experiment-shell.tsx:132-163`),
so "Run trial" is blocked with "A prediction is required before running a trial. Please submit
your prediction first." (`experiment-shell.tsx:166-170`). The hero flow and the seeded checklist
below are single-trial by design. To rerun: Research mode → "Clear local session" (confirm
twice, `research-mode.tsx:142-159`) and restart the flow. On stage, do not fight this — a
clean-slate rerun is a legitimate recovery line: "Let's start a fresh session — same seed, same
setup."

---

## Pre-demo checklist (run 30 minutes before recording)

- [ ] Dev server running from the main repo (`npm run dev`), page loads at `http://localhost:3000`.
- [ ] Fresh browser profile OR cleared site data (localStorage empty — see browser-reset checklist).
- [ ] Clean session state loaded: no trials, replay shows "No replay history yet — run a trial to start one."
- [ ] Seed confirmed at 42 ("Show advanced: randomness seed" in the variables panel).
- [ ] Animation speed set to fastest (2x) and reduced motion off via "Accessibility & display".
- [ ] Speaker notes printed and placed off-camera (never on the recording).
- [ ] Microphone checked; recording software tested; screen-recording permission granted for the browser window.
- [ ] 2:45 timer visible to the presenter only (phone or sticky note) — the video itself must show no timer.
- [ ] Backup files verified playable: `backups/hero-flow.mp4`, `backups/hero-flow-offline.mp4`, screenshot deck.
- [ ] Seeded outcomes sanity-checked once today (run at absorber 0.2, seed 42 → "safety ceiling: 500").
- [ ] The three expected cards visible in the sanity run (show_graph, compare_trials, reduce_density).

## Offline-mode checklist (verify once per recording machine)

- [ ] Disconnect network (Wi-Fi off, or DevTools → Network → Offline).
- [ ] Load the app; confirm the full page renders (no external asset requests).
- [ ] Run the complete hero flow offline: prediction → run → animation → adaptation card → accept → counterfactual → replay.
- [ ] DevTools Network tab shows zero requests beyond the initial page load during run/comparison/replay.
- [ ] No API key prompts, no environment-variable errors, no console errors during the flow.
- [ ] Confirm the offline flow uses the same seed-42 outcomes as the online sanity run.

## Backup recording checklist (record once, before submission)

- [ ] Recorded hero flow ≤3 minutes, following `demo-script.md` exactly.
- [ ] Recorded failure fallback: the "adaptation does not appear" recovery (guaranteed `show_graph` trigger) so it can be shown even if the live rules are misunderstood on stage.
- [ ] Screenshots of each hero step: step-01 landing, step-02 prediction, step-03 result ceiling, step-04 variables at 0.2, step-05 adaptation card, step-06 graph view, step-07 counterfactual, step-08 replay dialog.
- [ ] Evidence JSON export (`unseenlab-session.json`) from a real run, stored in `backups/`.
- [ ] Adaptation Replay screenshot showing the 9-step journey (steps 5 and 6 with the contradiction and the Accepted decision).

## Browser-reset checklist (for a clean second take)

- [ ] DevTools → Application → Storage → "Clear site data" for `localhost`, or Research mode → "Clear local session" clicked twice.
- [ ] Reload the page.
- [ ] Verify clean state: no trial data, "Your prediction" panel absent, replay empty.
- [ ] Re-seed: confirm seed 42 in the advanced controls.
- [ ] Confirm the prediction gate is live: clicking "Run trial" without a prediction shows "A prediction is required before running a trial. Please submit your prediction first."
- [ ] Run the hero flow once end-to-end and confirm the clean-state demo produces the expected seeded outcomes below.

## Seeded demo-state checklist (what SHOULD appear, so you know when it is wrong)

Exact parameters for the hero trial (all verified against the engine with seed 42):

| Parameter | Value |
|---|---|
| Absorber position | 0.9 (default) → **withdraw to 0.2** |
| Starting neutrons | 3 |
| Material density | 0.9 |
| Neutron absorption chance | 0.25 |
| Duration | 60 steps |
| Random seed | 42 |

**Correction note:** the plan originally specified withdrawing to ~0.5. Verified engine output
with seed 42 at absorber 0.5 is `extinct` (final free neutrons 0) — the demo must withdraw to
**0.2 or lower**. 0.2 hits the ceiling; 0 is what the product's own smoke test uses
(`e2e/smoke.spec.ts:24`).

| Step | Expected visible outcome (verified) |
|---|---|
| Run at absorber 0.9 (default, seed 42) | Stop reason `extinct` at step 7; final free neutrons 0; reactions 4. Only used as the "do not use" reference. |
| Hero run at absorber 0.2 (seed 42) | Stop banner: "The simulation stopped at the safety ceiling: 500 free neutrons." at step 28; final free neutrons 500; reactions 1043. |
| Adaptation cards after the hero run | Exactly three, in this order: `show_graph` ("The prediction and the result differed…"), `compare_trials` ("A side-by-side comparison of two runs…"), `reduce_density` ("The reaction hit the safety ceiling, so the details were hidden…"). If `show_graph` is missing, the prediction was not contradicted — check the radio answer. |
| Accept `show_graph` | Graph tab opens automatically with the "safety ceiling (500)" annotation on the curve. |
| Counterfactual: absorber position 0.2 → 0.9, "Run comparison" | "Changed exactly one variable: Absorber position 0.2 → 0.9"; "Same randomness seed (42), same duration."; original free neutrons 500 / reactions 1043 vs counterfactual free neutrons 0 / reactions 4; explanation "…changed the final free neutrons from 500 to 0 and reactions from 1043 to 4." |
| Adaptation Replay | 9 steps rendered; step 5 shows "Linear vs. nonlinear growth — evidence suggests: contradicted"; step 6 shows the offer and "Your decision: Accepted". |

If any row does not match, do not ad-lib around it — use the failure recovery for the matching
mode above, or clear the session and rerun from the browser-reset checklist.
