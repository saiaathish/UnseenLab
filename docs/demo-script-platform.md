> **SUPERSEDED — historical record.** This document describes the Supabase +
> Postgres RLS platform layer, which was replaced by Firebase Auth + MongoDB
> (see `docs/firebase-mongodb-setup.md`, `docs/backend-verification.md`,
> `docs/security.md`). Kept for audit history; its claims do not describe the
> current runtime.

# UnseenLab — Platform Demo Script

Author: AGENT DEMO-01 (demo script author) · Target: **4–6 minutes** spoken, plus Q&A.
Companion docs: `docs/platform-copy-spec.md` (every string below is verbatim from it or from shipped UI), `docs/platform-contracts.md` (routes, auth, sync, RLS), `e2e/smoke.spec.ts` (the exact demo flow the script follows), `supabase/tests/rls-isolation.sql` (Technical beat), `docs/judge-qa.md` (Q&A sources).

**Honesty rule for this script:** every clickable string below is real shipped copy. Nothing is scripted that the product cannot currently do. The only conditional section is §3 (cross-device, needs **live Google OAuth**); it is marked `[CONDITIONAL]` and has an explicit branch to the fallback (§4). If a step in the script would require something that does not exist, the script says what to say instead — it never fakes a claim.

---

## 1. Pre-flight checklist (before the judges arrive — 15 min)

| # | Check | Pass condition | If it fails |
|---|---|---|---|
| P1 | Production build running on `:3000` (or demo port) | Homepage hero `What topic do you need help with?` renders | Fix build; do not demo a dev-mode half-state |
| P2 | **Live OAuth decision** — click `Continue with Google` once in a rehearsal browser | Google account chooser opens and a test account completes sign-in → `/onboarding` | **Live OAuth is NOT available → plan the fallback (§4)** and set the demo on the guest + seeded-stack script |
| P3 | If P2 passed: second browser profile is signed out, not used during rehearsal | Clean second browser | Clear cookies; this is the "new device" |
| P4 | LLM decision — `NEXT_PUBLIC_LLM_ENABLED=1` + server `LLM_API_KEY` set? | Adaptation card badge reads `AI interpretation` | Leave it off: badge reads `Offline rules` and the same offers appear (deterministic provider). Both are honest; rehearse whichever badge will show |
| P5 | Local Supabase stack (for fallback + Technical beat): `supabase start` running, migration `20260803193000_platform_schema.sql` applied | `docker exec -i supabase_db_UnseenLab psql -U postgres -d postgres < supabase/tests/rls-isolation.sql` ends with `RLS ISOLATION SUITE: ALL CHECKS PASSED` and exit 0 | Investigate before demo; never claim RLS green otherwise |
| P6 | Fallback users seeded (only needed if P2 failed): `learner_a@unseenlab.test` / `learner_b@unseenlab.test` exist in local `auth.users`, `learner_a` has one saved cloud session | Sign-in with `learner_a` verified in dress rehearsal | See §4.2; if unverifiable, use §4.3 |
| P7 | Watch/clock, copy of this script, second browser tab pre-pinned | — | — |

---

## 2. The 60-second contradicted-prediction reveal — guest, no account

**Goal of the beat:** in one minute, a judge sees prediction → contradiction → ceiling → the lab *offering* a repair → one controlled comparison. This is the winning "why does this exist" moment, and it needs no account. No sign-in is touched in this section. (This is the exact flow `e2e/smoke.spec.ts` executes, with `It stays about the same` as the prediction for maximum contradiction.)

**Setup:** browser 1, signed out. Header shows sync chip `Saved on this device`.

| Time | What the presenter does | Exact copy on screen (click/read) | Presenter says |
|---|---|---|---|
| 0:00 | Open `/`. Click the `Available lab` card. | Hero: `What topic do you need help with?` — card `Nuclear Chain Reaction`, badge `Interactive lab ready`, action `Start this lab` | "The lab is fully usable without an account. Here is the whole product in sixty seconds." |
| 0:05 | Lab loads. Read the goal aloud. | Heading `Nuclear Chain Reaction`; goal line `Find out what happens to the reaction when you withdraw the absorber.` | "The lab asks one question: what happens when you withdraw the absorber?" |
| 0:10 | Step 1 (`Predict`). Click radio **`It stays about the same`**. Leave confidence at `3 — in the middle`. | `What do you expect?` · `Choose an answer. This is a hypothesis, not a grade.` · radios: `It stays about the same` / `It gets slightly faster` / `It grows much faster than before` / `It gets slower` / `It stops completely` · `How confident are you? 3 — in the middle` · button `Submit prediction` | "The learner predicts it stays about the same — a reasonable intuition. This is a hypothesis, not a grade." |
| 0:18 | Click `Submit prediction`. | — | "Now the experiment." |
| 0:20 | Step 2 (`Experiment`). Set the `Absorber position` slider to **0** (fully withdrawn; default is 0.9, fully inserted). | `Change one thing` · `Adjust a control, then run the experiment. You can always start over.` · control `Absorber position` | "Withdraw the absorber. One change. Then run." |
| 0:27 | Click `Run trial`. Wait through the two statuses. | `Running the simulation…` then `Interpreting your evidence…` | "While it runs, the lab is reading the prediction against the result — that reading is the AI beat, not the simulation. The simulation itself never changes." |
| 0:40 | Step 3 (`Understand`). Point at the result banner, then read it aloud. | `Watch what happened` · status line: `The simulation stopped at the safety ceiling: 500 free neutrons.` | "The prediction said 'stays about the same.' The reaction grew nonlinearly and hit the safety ceiling at 500 free neutrons. The lab now treats that as evidence worth acting on — not a failure." |
| 0:46 | In `Try one helpful change`, click **`Accept`** on the graph proposal. | Section `Try one helpful change` · `UnseenLab noticed something worth comparing. You stay in control: accept it, change it, or skip it.` · card `Suggested adaptation`, badge `Offline rules` (or `AI interpretation` if P4), reason: `The prediction and the result differed. Seeing the population on a graph can show how it actually grew.` · action `Open the graph view` · buttons `Accept` / `Reject` / `Modify` | "The lab offers one thing: open the graph view. Not forced — offered. The learner accepts." |
| 0:52 | Open `Compare one change` (details, marked `Optional`). Click **`Run comparison`** (defaults: `Which variable to change` = `Absorber position`, new value 1 — the opposite of the withdrawn run). | `Compare one change` · `Optional` · `Counterfactual Microscope` · `What single change would most alter or reverse this outcome? One variable at a time — same randomness, same everything else.` · button `Run comparison` · result: `Changed exactly one variable: Absorber position 0 → 1` · `Same randomness seed (…), same duration.` | "One controlled comparison: re-insert the absorber, same randomness seed, same everything — and the result line shows exactly what that one variable controls." |
| 1:00 | (Optional, if time allows) click `Adaptation Replay`, then `Close replay`. | `Adaptation Replay` dialog · `Initial prediction` step · `Close replay` | "And every step of that chain — prediction, result, offer, decision — is replayable." |

**Beat complete at 1:00.** The lab remains open — §3 continues from this exact state (one completed trial, no account).

---

## 3. The cross-device moment `[CONDITIONAL — live OAuth only]`

> **Gate:** run this section only if pre-flight P2 passed (a real Google sign-in completed in rehearsal). Otherwise **branch to §4 now** and do not touch `Continue with Google`.
> **What this proves:** guest trial → explicit consent to save → a *second* browser resumes at Trial 2 with the same evidence and the same accessibility preferences. Evidence IDs are preserved across the import by contract (contracts §5: original IDs retained, idempotent by session id).

### 3.1 Sign in and save (browser 1, continuing from §2)

| Time | What the presenter does | Exact copy on screen | Presenter says |
|---|---|---|---|
| 1:00 | In the lab header (signed out), click `Sign in to save progress across devices.` | Sync chip `Saved on this device` · link `Sign in to save progress across devices.` | "The learner can stop here — or sign in to save across devices. Watch how little is asked." |
| 1:05 | Auth dialog. Click **`Continue with Google`**. | Dialog `Sign in to UnseenLab` · `Save your learning preferences and continue across devices.` · button `Continue with Google` · `or` · `Try without an account` · `Try the lab now. Sign in whenever you want to save progress across devices.` · `Your saved learning data is private to your account. We do not ask for diagnosis information.` | "One button. The privacy promise is right there in the dialog." |
| 1:10–1:30 | Google account picker → consent → callback → auto-redirect to `/onboarding` (new user). Complete the four steps at a calm pace. | OB-1 `What would you like help doing?` → `Understand a difficult concept.` → `Continue` · OB-2 `How do explanations make the most sense to you?` → `Walk me through it step by step.` → `Continue` · OB-3 `What should the experience feel like?` → `Balanced pace` + switch **`Reduce animation motion` ON** → `Continue` · OB-4 `What topics are you working on?` → chip `Nuclear chain reactions` → `Start learning` | "Four questions, under a minute. Note the accessibility choice — reduced motion — because we are about to prove it travels." |
| 1:45 | Dashboard renders. | Greeting `Good morning, {name}.` · `Your learning preferences` rows: `Goal: Understand a difficult concept` · `Explanations: Walk me through it step by step` · `Pace: Balanced pace` · `Reduced motion: On` | "Real state, real preferences — nothing invented." |
| 1:50 | Click `Start this lab` (Continue learning section). The guest evidence is still in this browser's storage, so the import dialog appears. | `Continue learning` → `Start this lab` → dialog **`Save your current learning session?`** · `This will add your current progress to your private account so you can continue on another device.` · buttons `Save to my account` / `Not now` | "The lab never uploads silently. It asks for consent, and `Not now` keeps the work on this device." |
| 1:55 | Click **`Save to my account`**. | Toast `Your session is saved to your account.` · sync chip `Saving…` → `Saved` | "The guest trial is now on the account, with the same evidence — same prediction, same trial — by design." |

### 3.2 Resume on a second browser (the winning moment)

| Time | What the presenter does | Exact copy on screen | Presenter says |
|---|---|---|---|
| 2:05 | Pick up the second browser (signed out, no cookies). Navigate to the app's dashboard route. | Signed-out visitor hits a protected route → redirect to `/?auth=open`, auth dialog opens (`Sign in to UnseenLab`) | "A brand-new device. No email, no code — just sign in." |
| 2:10 | Click `Continue with Google`, choose the same account. This account has `onboarding_version` current, so the callback goes straight to the dashboard. | Greeting `Good morning, {name}.` | "Same account, second device." |
| 2:20 | In `Continue learning`, click **`Resume`** on the card. | `Continue learning` · card `Nuclear Chain Reaction` · status chip `In progress` · `You last worked on this {relative time}.` · action `Resume` | "The dashboard found the saved session — real `updated_at`, no invented progress." |
| 2:25 | Resume dialog appears. Click **`Continue saved session`**. | Dialog `Continue where you left off?` · `You have a saved Nuclear Chain Reaction session with 1 completed trial. Your progress stays on record either way.` · buttons `Continue saved session` / `Start a new session` | "One completed trial, exactly as saved." |
| 2:30 | Land on the Trial 2 step. Point at the evidence and the preferences indicator. | Step 2 heading `Trial 2 — run another trial` · `Adjust one control, then run it. Trial 1 stays on record so you can compare. You can always start over.` · prediction blockquote (the saved `It stays about the same` answer, `Confidence: 3/5`) · header indicator `Using your saved learning preferences` (inline detail, rendered from the stored row: `Visual-first · Balanced pace · One-variable mode · Reduced motion`) | "Trial 2, ready to run, on the new device — with the same evidence IDs and the same accessibility preferences. Reduced motion is on here, exactly as chosen on the other browser." |
| 2:45 | (If time allows) open the preferences disclosure (`Using your saved learning preferences`) and the `Adaptation Replay` to show the evidence chain survived the trip. | `Adaptation Replay` → `Initial prediction` → `Close replay` | "The evidence chain — prediction, trial, offer, decision — crossed devices intact." |

**Cross-device beat complete at ~3:00.** This is the moment the red team named: guest → sign in → explicit save → second browser → resume at Trial 2, same evidence and preferences.

---

## 4. The honest fallback — no live OAuth `[use when P2 failed]`

If `Continue with Google` is not configured on the demo environment, **never pretend**. Do exactly this:

### 4.1 The trigger moment

A judge clicks `Continue with Google` and nothing happens, or an inline message appears. Say, calmly and verbatim:

> "Sign-in needs credentials on the demo environment; the lab is fully usable without it — let me show you the same flow with a seeded session."

(If an inline message appears instead of the Google picker, the copy spec defines the calm variants: `We couldn't sign you in with Google. Please try again.` / `We couldn't open Google sign-in. Your browser may be blocking pop-ups. Please allow pop-ups for this site and try again.` — do not read error text from the console, ever.)

### 4.2 Local-stack alternative (real local Supabase with seeded users)

**Prep (pre-flight P5/P6):** local Supabase running with the schema migration applied; the RLS suite run once with **real** `auth.users` ids substituted for the two placeholder uuids (see the suite header's `sed` instructions). Two seeded demo accounts exist in the local stack's `auth.users`:

| Account | Purpose | What it proves |
|---|---|---|
| `learner_a@unseenlab.test` | The demo learner: one saved cloud session (from dress rehearsal), preferences set (e.g. reduced motion on) | **Cloud save + cross-device resume**: sign in as `learner_a` (local stack email provider; see note below), run/keep Trial 1, watch sync chip `Saved`; open the second browser, sign in as `learner_a`, dashboard shows the `In progress` card, `Resume` lands at `Trial 2 — run another trial` with the same evidence |
| `learner_b@unseenlab.test` | The isolation control | **RLS isolation**: `learner_b`'s dashboard never shows `learner_a`'s rows — empty states (`Nothing in progress right now.`, `No sessions yet.`) or `learner_b`'s own data only; a direct cross-user request returns nothing |

**Honest note to say out loud while showing it:** "The sign-in button is wired to Google. On this environment the Google provider isn't configured, so I authenticate through the local stack's own Auth — the same Supabase session flow, end to end. The account layer itself is real and running." Then run the SQL isolation suite live in the terminal:

```
docker exec -i supabase_db_UnseenLab psql -U postgres -d postgres < supabase/tests/rls-isolation.sql
```

Final banner to point at: `RLS ISOLATION SUITE: ALL CHECKS PASSED` (exit 0). In one sentence: "Eleven scenarios — anonymous denied, own rows readable, cross-user reads, writes, and deletes blocked, constraints enforced. That is the Technical beat, demonstrated against the real database."

**Verification drill:** the seeded-user sign-in path (local email provider) must pass the dress rehearsal. If it was not verified, do **not** improvise it — go to §4.3.

### 4.3 If even the seeded stack is not demo-ready

Say the §4.1 line, then demo the complete guest flow (§2, extended with a second trial and the `Adaptation Replay`), and close the account layer honestly: "The account layer ships, with tests, RLS policies, and a migration — and it is fully disabled on this environment because no credentials are configured. The lab is complete without it." The Technical evidence then rests on the RLS suite output (§4.2) and the guest-first sync statuses (`Saved on this device`), which are truthful.

---

## 5. Per-rubric beats — where each axis gets its evidence

Official weights (docs/rubric-strategy.md): Impact 30% · AI Innovation 25% · Usability & Accessibility 25% · Technical Execution 10% · Presentation 10%.

| Axis | Where in this script | What the judge sees/hears |
|---|---|---|
| **Impact** (30%) | Entire §2 reveal + §3 cross-device; the closing line after §3.3 | Participant-session framing: "The design participant told us demonstrations never built a mental model without being able to manipulate the system — so animation is the center, every representation is a choice, and nothing is imposed. The learner you just watched predicted, was contradicted, accepted an offer, and rebuilt the cause-and-effect model in their own words — and it followed them to a second device." Tied to `docs/user-research.md`; no fabricated study claims |
| **AI Innovation** (25%) | §2 at 0:27 and 0:46 | The interpretation/adaptation card: status `Interpreting your evidence…`, badge `AI interpretation` (or `Offline rules`), proposal reason with `evidenceIds` in the payload, `Accept`/`Reject`/`Modify`, and `Adaptation Replay` showing prediction → result → offer → decision. The AI reads evidence; it can never change simulation outcomes |
| **Usability & Accessibility** (25%) | §2 step-1 copy; §3.1 onboarding; §3.2 resume | `Choose an answer. This is a hypothesis, not a grade.` (no judgment); `Reduce animation motion` + OS `prefers-reduced-motion` honored; `Text size` / `High contrast` in `Accessibility & display`; every control keyboard-reachable (the presenter can Tab through `Accept`/`Reject`/`Modify` and the replay dialog's `Close replay`); calm, non-urgent language throughout |
| **Technical Execution** (10%) | §4.2 live SQL suite (fallback) or, with live OAuth, the same suite output shown during Q&A | `RLS ISOLATION SUITE: ALL CHECKS PASSED` against the real local stack; own-row RLS on `profiles`, `learner_preferences`, `learning_sessions`; local-first sync (`Saving…` → `Saved`, `Couldn't sync — your work is safe on this device`); guest-import idempotency (importing twice creates no duplicate rows — contracts §5) |
| **Presentation** (10%) | This script | Timing discipline (60-second reveal; total under 6 minutes); every string read aloud is real shipped copy |

---

## 6. Failure drills

| Failure | What the judge sees | What you do and say (verbatim where marked) |
|---|---|---|
| **Model call slow / fails** | After `Run trial`, `Interpreting your evidence…` hangs past ~10s; or a calm notice appears: `Something went wrong while preparing suggestions — your experiment ran normally.` The adaptation card badge then reads `Offline rules`. | Keep narrating, don't go silent: "The AI layer is optional — it has a hard timeout, and the moment it fails it hands off to the deterministic offline rules. Same offers, labeled honestly." The badge itself is the demo of the fallback. Never claim the model responded if the badge says `Offline rules` |
| **Supabase down / network lost** | Sync chip shows `Couldn't sync — your work is safe on this device` (signed in) or `Saved on this device` (signed out); import toast `We couldn't save your session right now. Your work is safe on this device — you can try again from the lab.`; auth dialog `Sign-in needs an internet connection. You can keep using the lab without an account.`; lab offline banner `You're offline. You can keep working — your progress is saved on this device.` | "The lab is local-first — every status tells the truth: work is saved on this device. Cloud is an add-on, never a dependency." Continue the guest flow; skip §3 and give the §4.1 line if sign-in was in progress |
| **Browser blocks the sign-in pop-up** | `Continue with Google` does nothing, or the dialog shows the popup message: `We couldn't open Google sign-in. Your browser may be blocking pop-ups. Please allow pop-ups for this site and try again.` | Say the string, then: allow pop-ups for the site in the browser's site settings, click `Continue with Google` once more. If it still fails, deliver §4.1 and branch to §4. Calm, no console reading |
| **Google account chooser friction** | Multiple accounts / no account on the demo machine | Pre-flight P3: rehearse with the exact demo Google account. At demo time: "Pick the account I used in the rehearsal — it is the one with the saved session." If the account is missing, branch to §4 |
| **Second browser is already signed in** | Dashboard shows the wrong profile | Use a clean profile or incognito; if time is short, clear cookies and sign in again — the resume card reappears from the cloud (`In progress`, `Resume`) |
| **Onboarding drags** | Step 4 topics input stalls (irrelevant; local-only) | Onboarding persists a local draft per step; a refresh resumes the same step. In a pinch, `Skip for now` (step 1 only) still reaches the dashboard — but then no saved preferences to show in §3.2, so only skip if §3.2's preference proof is waived |
| **RLS suite output fails on stage** | Nonzero exit / `FAIL` notices | Do not claim a pass. Say: "The suite runs against the real stack and it is failing right now — that is exactly the gate this product enforces before I'd claim isolation." Fix, rerun, or pivot the Technical beat to the local-first sync statuses |

---

## 7. Judge Q&A cheat sheet (8 questions)

Answers are 1–2 sentences, tied to moments the judge just watched. Sources: `docs/judge-qa.md` (questions 1–7) and the platform red-team audit that shaped the RLS suite (question 8, from the audit design notes in `docs/platform-contracts.md` §3 and the `supabase/tests/rls-isolation.sql` header).

1. **Lawrence Fung — "What did your neurodivergent design participant tell you that contradicted your original assumptions?"**
   The participant said demonstrations alone never built a mental model — manipulation and animation did. That is exactly the sixty seconds you just watched: the prediction, the animation to the 500 ceiling, and the offer to see it another way; the user-research notes are in `docs/user-research.md`.

2. **Wei Xiong — "Can this scale beyond one student and one physics lesson?"**
   Yes, by architecture: a lab is a typed `ExperimentDefinition` rendered by a shared shell, and adaptation is a provider interface — so any lab can reuse prediction, evidence, offers, and sync. Two further labs are registered as `— planned`, and nothing in the demo path is learner-specific or diagnosis-specific.

3. **Disha Patel — "What exactly does AI do, and what happens without it?"**
   The AI layer reads the prediction-versus-result evidence, maps it to a bounded concept taxonomy, and proposes targeted, explainable offers; the card badge tells you `AI interpretation` versus `Offline rules`, and any failure falls back to the deterministic rules with the same offers — which is precisely what you saw if the badge read `Offline rules`.

4. **Haixia Gu — "Did the learner control the interface, or did the system decide?"**
   Everything is an offer: the graph was accepted, not applied; every card has `Accept` / `Reject` / `Modify`, and a rejected offer type is never proposed again in the session — and the reduced-motion preference carried across devices because the learner set it, not because anyone inferred it.

5. **Soumitra Mehrotra — "How do you know the adaptation reflects learning evidence, not arbitrary UI behavior?"**
   Every proposal carries `evidenceIds` pointing at the exact prediction and trial records that triggered it, and the `Adaptation Replay` you can open shows the whole chain — the same evidence IDs that survive the guest import and the cross-device resume you just watched.

6. **Benslyne Avril — "How do you avoid judging or pathologizing the learner?"**
   The screen says `This is a hypothesis, not a grade.` and the result is framed as a comparison between prediction and outcome, never as a verdict about the learner; there are no clinical labels anywhere, and the only place the word "diagnosis" appears is in the two mandated privacy statements.

7. **The question nobody hopes is asked — "Show one case where adaptation did something materially better than a static simulation."**
   A static simulation would just show the count rising; the learner instead predicted stable, saw the contradiction hit the safety ceiling, accepted the graph offer, and ran the one-variable comparison with the same randomness seed — proving the absorber alone caused the difference, then replayed the chain. That is a rebuilt mental model, not a watched animation.

8. **Platform red-team audit — "How do you prove Learner B cannot see or touch Learner A's data?"**
   All three tables are own-row RLS with `WITH CHECK`, anon gets nothing, and the isolation suite runs eleven scenarios — including cross-user inserts, reassignment, and deletes — against the real stack; the final banner `RLS ISOLATION SUITE: ALL CHECKS PASSED` is the proof, and the seeded `learner_a` / `learner_b` accounts show it from the UI side: each dashboard shows only its owner's sessions.

---

## Appendix A — Exact copy quick-reference (all strings shipped; see copy spec IDs)

Guest reveal: `What topic do you need help with?` · `Start this lab` · `Find out what happens to the reaction when you withdraw the absorber.` · `What do you expect?` · `Choose an answer. This is a hypothesis, not a grade.` · `It stays about the same` · `How confident are you? 3 — in the middle` · `Submit prediction` · `Change one thing` · `Adjust a control, then run the experiment. You can always start over.` · `Absorber position` · `Run trial` · `Running the simulation…` · `Interpreting your evidence…` · `Watch what happened` · `The simulation stopped at the safety ceiling: 500 free neutrons.` · `Try one helpful change` · `UnseenLab noticed something worth comparing. You stay in control: accept it, change it, or skip it.` · `Suggested adaptation` · `The prediction and the result differed. Seeing the population on a graph can show how it actually grew.` · `Open the graph view` · `Accept` / `Reject` / `Modify` · `Compare one change` · `Optional` · `Counterfactual Microscope` · `Run comparison` · `Changed exactly one variable: Absorber position 0 → 1` · `Same randomness seed (…), same duration.` · `Adaptation Replay` · `Initial prediction` · `Close replay`

Auth (AUTH-01…08): `Sign in to UnseenLab` · `Save your learning preferences and continue across devices.` · `Continue with Google` · `or` · `Try without an account` · `Try the lab now. Sign in whenever you want to save progress across devices.` · `Your saved learning data is private to your account. We do not ask for diagnosis information.` · `We couldn't sign you in with Google. Please try again.` · `We couldn't open Google sign-in. Your browser may be blocking pop-ups. Please allow pop-ups for this site and try again.` · `Sign-in needs an internet connection. You can keep using the lab without an account.`

Import + sync (IMP-01…04, SYNC-01…05): `Save your current learning session?` · `This will add your current progress to your private account so you can continue on another device.` · `Save to my account` · `Not now` · `Your session is saved to your account.` · `Saved` · `Saving…` · `Saved on this device` · `Couldn't sync — your work is safe on this device` · `Sign in to save progress across devices.` · `Save this session to your account`

Resume + dashboard (DASH-01…14): `Good morning, {name}.` · `Continue learning` · `In progress` · `You last worked on this {relative time}.` · `Resume` · `Continue where you left off?` · `You have a saved Nuclear Chain Reaction session with 1 completed trial. Your progress stays on record either way.` · `Continue saved session` · `Start a new session` · `Trial 2 — run another trial` · `Adjust one control, then run it. Trial 1 stays on record so you can compare. You can always start over.` · `Using your saved learning preferences` · `Adjust for this session`

Offline/errors: `You're offline. You can keep working — your progress is saved on this device.` · `We couldn't save your session right now. Your work is safe on this device — you can try again from the lab.` · `Something went wrong while preparing suggestions — your experiment ran normally.`
