# UnseenLab — Platform Copy Specification

Status: Phase 1 (copy spec) — basis for implementation.
Companion doc: [`docs/platform-contracts.md`](./platform-contracts.md) (routes, auth, sync, data model).
Scope: Google sign-in, guest ("without an account") usage, 4-step onboarding, dashboard, settings, cloud session sync, lab personalization indicator.

How to use this document: every entry gives the **exact string** (in backticks), the **place** it appears, and **behavior/notes** for engineering. Strings marked `[EXISTING — do not change]` are already shipped in the codebase; keep them byte-for-byte. Copy marked `[MANDATED]` comes from the product requirements and must appear verbatim. Do not invent features: every string below maps to a surface already defined in the platform contracts. Recommended: centralize all new strings in a single copy-constants module (e.g. `src/copy/`), keyed by the IDs in this document, so tone can be reviewed in one place.

---

## 1. Voice principles

Calm. The product never hurries the learner. Sentences are short, there is no urgency, no pressure, no exclamation points, and no emoji in any user-facing string. When something fails, the message states what happened and that the learner's work is safe — never a wall of alarm.

Honest. Claim only what exists. One lab is ready; two are planned and are labeled "planned". Sync statuses say exactly what happened. There are no fake AI claims, no fake recommendations, no invented progress. When a topic has no lab, say so plainly and point to the lab that does exist.

Learner-first. The learner decides. Language frames choices as "what helps" and "what feels clearest", never as labels about the learner. Adaptations are offers the learner can accept, reject, or adjust — copy must never sound like a verdict about the learner.

Plain and concrete. Everyday words, short strings, no jargon. This matches the shipped voice: "Tell us which idea feels unclear.", "Change one variable and watch what happens.", "Compare your prediction with the result."

Private by default. The product asks only what it needs and explains why it asks. Reassurance is concrete ("Your saved learning data is private to your account."), never vague. We never ask for or reference diagnosis information — the only place the word "diagnosis" appears is in the mandated statements that say we do not ask for it.

---

## 2. Auth surfaces

### 2.1 Auth dialog (component: `src/components/auth/sign-in-dialog.tsx`)

Opened from the header "Sign in" button, or automatically via `/?auth=open` when a signed-out visitor hits a protected route (contracts §1). It is the single answer for every "you're not signed in" moment — there is no separate "you must sign in" page.

| ID | String (exact) | Place | Behavior / notes |
|---|---|---|---|
| AUTH-01 | `Sign in to UnseenLab` | Dialog heading (`h2`) | `aria-labelledby` points here. Focus moves to heading on open; focus returns to the trigger on close. |
| AUTH-02 | `Save your learning preferences and continue across devices.` | Supporting line under heading | [MANDATED] Verbatim. |
| AUTH-03 | `Continue with Google` | Primary action button | Calls `signInWithOAuth` (contracts §2). Single primary action in the dialog. |
| AUTH-04 | `or` | Divider between primary and secondary | Visually muted; `aria-hidden="true"` (decorative). |
| AUTH-05 | `Try without an account` | Secondary action button | Closes the dialog, no state change. Never opens another modal. |
| AUTH-06 | `Try the lab now. Sign in whenever you want to save progress across devices.` | Helper line directly under "Try without an account" | [MANDATED] Verbatim. Reinforces that the lab is fully usable now; sign-in only adds cross-device saving. Never frame as "limited" (see §3). |
| AUTH-07 | `Your saved learning data is private to your account. We do not ask for diagnosis information.` | Privacy note at the bottom of the dialog | [MANDATED] Verbatim. Small, muted type. This is the product's data-promise; do not add a second privacy line. |
| AUTH-08 | `Close sign-in dialog` | Close (×) button `aria-label` | Esc and backdrop click also close. Closing never discards lab work. |

Behavior: dialog is `role="dialog"` + `aria-modal="true"`. While open, the page behind stays interactive in behavior only if the dialog is explicitly non-modal — prefer modal. No timer, no "session will expire" language anywhere.

### 2.1a Homepage account-value line (below the hero input)

| ID | String (exact) | Place | Behavior / notes |
|---|---|---|---|
| HOME-04 | `Sign in to save preferences and continue across devices.` | Small text line under the suggestion chips, above the result area | [MANDATED wording] Muted, smaller than the hero copy and quieter than the `Find my learning path` primary button. A text button/link that opens the auth dialog. It must never outsize or out-color the main action. The hero question `What topic do you need help with?` is unchanged ([EXISTING]). |

### 2.2 Header sign-in button (app header on `/`, `/lab/*`, `/dashboard`, `/settings`)

| ID | String (exact) | Place | Behavior / notes |
|---|---|---|---|
| AUTH-10 | `Sign in` | Header button, signed-out state | Text button, ghost style — visually quieter than the hero primary action. Opens the auth dialog. |
| AUTH-11 | (avatar) | Header, signed-in state | Renders profile avatar + first name (e.g. `Sai`). Button `aria-label`: `` Account menu for Sai ``. |
| AUTH-12 | `Dashboard` / `Settings` / `Sign out` | Dropdown menu items under the avatar | `Sign out` clears the Supabase session and account-specific state; local guest evidence is preserved (contracts §2.4). No confirmation needed for sign-out. |

### 2.3 Auth error states (inside the dialog)

| ID | String (exact) | Trigger | Behavior / notes |
|---|---|---|---|
| AUTH-E1 | `We couldn't sign you in with Google. Please try again.` | OAuth exchange / popup flow fails | Shown inline in the dialog (`role="alert"`), primary button becomes `Try again` (same AUTH-03 label). No stack traces, no raw error text. |
| AUTH-E2 | `We couldn't open Google sign-in. Your browser may be blocking pop-ups. Please allow pop-ups for this site and try again.` | Popup blocked by browser | Inline, same placement as AUTH-E1. |
| AUTH-E3 | `Sign-in needs an internet connection. You can keep using the lab without an account.` | Network unavailable at sign-in time | Calm tone; ends on the actionable truth: the lab still works. |
| AUTH-E4 | `Something went wrong. Please try again in a moment.` | Unexpected failure (generic) | Last-resort message. Never display exception text or IDs to the learner. |

---

## 3. Guest-mode language rules

Rule: the lab is fully usable without an account, and that is the whole truth. Signing in adds one thing — saving across devices. Copy must add, never subtract: frame everything as "sign in to save across devices", never as "without an account you can't X".

Canonical phrase (use verbatim wherever guest value is explained): `Try the lab now. Sign in whenever you want to save progress across devices.` [MANDATED]

Allowed short variants (same meaning, same tone):
- `Sign in to save preferences and continue across devices.` (homepage account-value line, §2.1a HOME-04)
- `Sign in to save progress across devices.` (lab page, signed-out state, near sync status)
- `Your work is saved on this device.` (reassurance when signed out)

Never compare guest vs signed-in in a feature table. Never present sign-in as an "upgrade", "unlock", or "premium" action. Never put a timer, countdown, or quota on unsigned-in usage.

Forbidden words (user-facing copy; do not use even in aria labels): `guest mode`, `guest`, `demo mode`, `demo`, `trial mode`, `trial`, `temporary`, `anonymous`, `anonymous mode`, `limited`, `restricted`, `lite`, `basic`, `sandbox`, `throwaway`, `test account`, `preview mode`, `free tier`, `upgrade`, `unlock`, `your work won't be saved`, `you'll lose progress`, `nothing is saved`.

(Internal code may keep identifiers like `guest`, but no user-facing string — visible text, placeholder, aria-label, toast, or dialog — may contain them. Run the §10 grep over `src/` and `docs/` user-facing strings before shipping.)

---

## 4. Onboarding copy spec (route `/onboarding`, protected)

Four steps maximum, each with: one clear question, short supporting copy, a progress indicator, one primary action, Back, and Skip where appropriate. Target under 1 minute total — one question per view, no intro screen, no splash animation. The draft persists locally on every selection (schema: `onboardingDraftSchema` in `src/personalization/onboarding-schema.ts`), so a refresh resumes at the same step. Saving any step must never block on the network.

Common chrome (all steps):

| ID | String (exact) | Place | Behavior / notes |
|---|---|---|---|
| OB-C1 | `Step {n} of 4` | Above the question | `role="status"` so screen readers announce step changes. |
| OB-C2 | progress bar | Below the step label | `role="progressbar"`, `aria-valuemin="1"`, `aria-valuemax="4"`, `aria-valuenow={step}`, `aria-label="Onboarding progress"`. |
| OB-C3 | `Back` | Left of the primary action, steps 2–4 only | Returns to the previous step with all selections intact. Hidden on step 1. |
| OB-C4 | `Continue` | Primary action, steps 1–3 | Advances; selection is persisted to the draft before advancing. |
| OB-C5 | `Skip for now` | Subtle text link, top-right of step 1 only | Completes onboarding with no preferences → dashboard renders empty states (§5). One tap; no second confirmation. |
| OB-C6 | `Skip` | Step 4 only, secondary action | Finishes onboarding without topic interests; keeps steps 1–3 choices. |

Selection values stored are the enum strings from `onboarding-schema.ts` (e.g. `understand_concept`); the labels below are what learners see.

### Step 1 — Learning goal

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| OB-1Q | `What would you like help doing?` | `h1`, also the `fieldset` legend | [MANDATED] Question. |
| OB-1S | `This shapes how your dashboard guides you. You can change it anytime.` | Supporting copy under the question | Short, low-pressure; "anytime" is a promise we keep (§5, §6). |
| OB-1A | `Understand a difficult concept.` | Radio card 1 | Value `understand_concept`. |
| OB-1B | `Prepare for class or a test.` | Radio card 2 | Value `prepare_for_class`. |
| OB-1C | `Explore through experiments.` | Radio card 3 | Value `explore_experiments`. |
| OB-1D | (none) | — | No "Skip" on this step; see OB-C5. |

Behavior: radio cards, one selectable, default `understand_concept` preselected (schema default). `aria-label` per card equals its label text. No error state possible (preselected).

### Step 2 — Explanation style

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| OB-2Q | `How do explanations make the most sense to you?` | `h1`, also the `fieldset` legend | [MANDATED] Question. |
| OB-2S | `There's no right answer — choose what feels clearest to you.` | Supporting copy | Explicitly removes judgment. |
| OB-2A | `Show me visually first.` | Radio card 1 | Value `visual_first`. |
| OB-2B | `Walk me through it step by step.` | Radio card 2 | Value `step_by_step`. |
| OB-2C | `Keep it concise.` | Radio card 3 | Value `concise`. |

Behavior: same radio-card pattern as step 1; default `step_by_step` (schema default). No Skip; Back allowed.

### Step 3 — Pace and adjustments

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| OB-3Q | `What should the experience feel like?` | `h1` | [MANDATED] Question. |
| OB-3S | `Pick a pace and any adjustments that make the lab comfortable. You can change these in Settings anytime.` | Supporting copy | "Comfortable" is preference language, not condition language. |
| OB-3A | `Calm pace` | Radio card 1 | Value `calm` → animation speed 0.5 (contracts §4). |
| OB-3B | `Balanced pace` | Radio card 2 | Value `balanced` → speed 1. Default preselected. |
| OB-3C | `Quick pace` | Radio card 3 | Value `quick` → speed 1.5. |
| OB-3D | `Reduce animation motion` | Switch | Field `reducedMotion` (bool). Also honored from the OS `prefers-reduced-motion` setting (existing hero behavior). |
| OB-3E | `Text size` | Stepper: buttons `Decrease text size` / `Increase text size`, live value `Text size: {percent}%` | Field `textScale` 1.0–1.5 (schema). Output `role="status"` on change; default 100%. |
| OB-3F | `High contrast` | Switch | Field `highContrast` (bool). |

Behavior: selecting a pace and toggles all persist immediately. Back allowed; no Skip on this step. Toggle `aria-label` = label text; switches include visible labels.

### Step 4 — Topics, review, and start

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| OB-4Q | `What topics are you working on?` | `h1` | [MANDATED] Question. |
| OB-4S | `Optional — add a few topics and we'll point you to relevant labs as they become available. The Nuclear Chain Reaction lab is ready now.` | Supporting copy | Honest about availability; "as they become available" never implies dates. |
| OB-4A | (topic chips) | Suggestion chips under the input | Reuse existing homepage suggestions: `Nuclear chain reactions`, `Why reactions accelerate`, `How absorbers change reactions`. Selecting a chip adds it. |
| OB-4B | `Add a topic` | Input `aria-label` (empty-state label); placeholder `Add a topic and press Enter` | Bounded input: ≤40 characters per topic, ≤12 topics (schema). Duplicate topics are ignored. |
| OB-4C | `Remove {topic}` | Per-chip button `aria-label` | Removes that chip only. |
| OB-4D | `You can add up to 12 topics.` | Helper under input | Shown when 12 reached; input disabled. |
| OB-4E | `Each topic can be up to 40 characters.` | Inline error | `role="alert"`; shown when an entry exceeds 40 characters. Entry is rejected, input keeps focus. |
| OB-4F | `Your choices` | Review card above the primary action | Lists saved selections, one row each: `Help with: {goal label}` · `Explanations: {style label}` · `Pace: {pace label}` · `Motion: {On/Off}` · `Text size: {percent}%` · `High contrast: {On/Off}` · `Topics: {chips or "None yet"}`. Each row has a `Change` link that returns to that step with selections intact. |
| OB-4G | `Start learning` | Primary action | [MANDATED] Completes onboarding: saves `learner_preferences`, sets `onboarding_version` (contracts §3), redirects to `/dashboard`. |
| OB-4H | `Skip` | Secondary action | OB-C6 — finishes without topics. |

Error behavior (completion): if the preference save fails, show inline status `We couldn't save your preferences. Try again.` with a `Retry` button; the local draft is retained and nothing is lost. Never advance the learner into the dashboard believing prefs saved when they were not.

---

## 5. Dashboard copy spec (route `/dashboard`, protected)

Sections in order: greeting → Continue learning → Recommended next step → Your learning preferences → Recent sessions → Available lab → Future labs. Real state only: every section renders from actual profile/preferences/session data; nothing is decorative, AI-generated, or fabricated.

### 5.1 Greeting

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| DASH-01 | `Good morning, {name}.` | Page heading | 05:00–11:59 local time. |
| DASH-02 | `Good afternoon, {name}.` | Page heading | 12:00–16:59 local time. |
| DASH-03 | `Good evening, {name}.` | Page heading | 17:00–04:59 local time. |
| DASH-04 | (same strings without `, {name}`) | Fallback | If the profile has no display name, drop the name (e.g. `Good evening.`). |

### 5.2 Continue learning

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| DASH-10 | `Continue learning` | Section heading | |
| DASH-11 | `{Lab title}` | Card title | Only the real active lab renders here. |
| DASH-12 | `In progress` | Status chip | Only when an in-progress session exists. |
| DASH-13 | `You last worked on this {relative time}.` | Supporting line | `relative time` = real `updated_at` (e.g. "2 hours ago"). Never an invented progress percentage. |
| DASH-14 | `Resume` | Card action | Restores the session snapshot (contracts §5). |
| DASH-15 | `Nothing in progress right now.` | Empty state | Shown when no in-progress session; paired with a `Start this lab` link (see DASH-33). |

### 5.3 Recommended next step (deterministic rules only — never AI)

One card, computed by these rules in order. Copy must not claim intelligence: no "Recommended for you", no "Based on your profile", no "AI". Where a rule uses the learning goal, the goal is a real stored preference.

| Rule | State | String (exact) | Notes |
|---|---|---|---|
| R1 | In-progress session exists | `Resume your {lab title} session` | Card title; supporting `You last worked on this {relative time}.`; action `Resume`. |
| R2 | No in-progress; ≥1 completed session; goal = `understand_concept` | `Try changing one variable to deepen your understanding.` | Supporting `From your goal: understand a difficult concept.` — states the source honestly. Action `Start this lab`. |
| R3 | No in-progress; ≥1 completed session; goal = `prepare_for_class` | `Run a quick review of the {lab title} lab before class.` | Same supporting/action pattern as R2. |
| R4 | No in-progress; ≥1 completed session; goal = `explore_experiments` | `Explore a new run in the {lab title} lab.` | Same pattern. |
| R5 | No sessions at all | `Start your first lab — the Nuclear Chain Reaction lab is ready now.` | Action `Start this lab`. |
| R6 | No goal stored (onboarding skipped) | `Continue with the Nuclear Chain Reaction lab.` | Fallback; no goal references. |

Never: recommend a planned lab here, invent a reason, or show a placeholder recommendation. If none of R1–R6 applies, hide the section entirely rather than showing filler.

### 5.4 Your learning preferences

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| DASH-20 | `Your learning preferences` | Section heading | |
| DASH-21 | `Goal: {goal label}` / `Explanations: {style label}` / `Pace: {pace label}` | Summary rows | Labels from §4 (e.g. `Goal: Understand a difficult concept`). Accessibility choices (motion, text size, contrast) shown here too when set. |
| DASH-22 | `You can change these anytime.` | Footnote under the rows | Matches OB-1S promise. |
| DASH-23 | `Adjust preferences` | Button | [MANDATED label] → `/settings` (Learning preferences tab). |
| DASH-24 | `No preferences yet.` | Empty state | Shown when onboarding was skipped. |
| DASH-25 | `Set them up now — it takes under a minute — or keep exploring without them.` | Empty-state supporting line | Offers both paths; neither is framed as lesser. |
| DASH-26 | `Set up preferences` | Empty-state button | → `/onboarding`. |

### 5.5 Recent sessions

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| DASH-30 | `Recent sessions` | Section heading | |
| DASH-31 | `{Lab title}` + `Completed` / `In progress` chip | Row per session | Real sessions only, newest first (contracts §3 index). |
| DASH-32 | `{relative time}` | Row meta | Real `updated_at`. |
| DASH-33 | `No sessions yet.` | Empty state | Supporting: `Your lab sessions will appear here once you start one.` + `Start this lab` action. |

### 5.6 Available lab + future labs (no fake marketplace)

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| DASH-40 | `Available lab` | Section heading | Same heading as the homepage (keeps one vocabulary). |
| DASH-41 | `{NUCLEAR_CHAIN_REACTION_EXPERIMENT.title}` | Card title | The only `status: "ready"` lab. |
| DASH-42 | `{pitch}` | Card body | Existing `pitch` string (`Control an invisible chain reaction — see why it can suddenly grow out of proportion.`). |
| DASH-43 | `Interactive lab ready` | Badge | Existing homepage badge copy. |
| DASH-44 | `Start this lab` | Card action | |
| DASH-45 | (existing simulation disclaimer) | Card footnote | Keep `simulationDisclaimer` string verbatim. |
| DASH-46 | `Future labs` | Separate section heading, visually distinct (e.g. muted, bordered) | Clearly labeled as not available. |
| DASH-47 | `{title} — planned` | Row per planned lab | From `PLANNED_EXPERIMENTS` (e.g. `High-Voltage Circuit Failure — planned`). No Start button, no dates, no waitlist, no pricing, no "coming soon" countdowns. |
| DASH-48 | `These labs are in development. You'll see them here when they're ready.` | Note under the future-labs list | Honest; no fabricated ETA. |

---

## 6. Settings copy spec (route `/settings`, protected)

Four tabs, exact labels: `Profile`, `Learning preferences`, `Accessibility`, `Privacy and data`. Nav `aria-label`: `Settings sections`.

### 6.1 Profile

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| SET-10 | `Profile` | Tab label + `h1` | |
| SET-11 | (display name) | Avatar + name row | From Google profile (contracts §3 `handle_new_user`). |
| SET-12 | (email) | Read-only row | From Google profile. |
| SET-13 | `Signed in with Google` | Provider note | Static text. |
| SET-14 | `Sign out` | Button | Ends session; local guest evidence preserved. No confirmation. |

### 6.2 Learning preferences

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| SET-20 | `Learning preferences` | Tab label + `h1` | |
| SET-21 | (summary rows) | Same rows as DASH-21 | Includes topic interests when present. |
| SET-22 | `Adjust preferences` | Button | [MANDATED label] Reopens the 4-step onboarding flow with existing values preselected (edit mode, same `/onboarding` route). |
| SET-23 | `You can change these anytime.` | Footnote | |

### 6.3 Accessibility

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| SET-30 | `Accessibility` | Tab label + `h1` | |
| SET-31 | `Reduce animation motion` / `Text size` / `High contrast` | Controls | Same labels as OB-3D/E/F, same schema fields. |
| SET-32 | `These adjustments apply where the lab supports them.` | Footnote | Honest scope statement; no "works everywhere" overclaim. |
| SET-33 | (existing lab controls: animation speed, information density, one-variable mode) | Additional rows | Reuse existing lab labels where they already exist; do not rename. |

### 6.4 Privacy and data

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| SET-40 | `Privacy and data` | Tab label + `h1` | |
| SET-41 | `We save your learning preferences and lab sessions to your account so you can continue on another device. Your saved learning data is private to your account. We do not ask for diagnosis information.` | Intro paragraph | Echoes AUTH-07 wording; the word "diagnosis" appears only here and in AUTH-07. |
| SET-42 | `Export saved learning data` | Button | [MANDATED label] Downloads a JSON file of preferences + sessions. Non-destructive; no confirmation. Success toast: `Your learning data is ready to download.` |
| SET-43 | `Delete my saved learning data` | Button | [MANDATED label] NOT "Delete account" — account deletion is not implemented and must never be offered or named. |
| SET-44 | `Delete your saved learning data?` | Confirmation dialog heading | `role="alertdialog"`. |
| SET-45 | `This permanently deletes your preferences and session history from your account. You can keep using the lab without an account.` | Confirmation dialog body | States permanence and continuity plainly. |
| SET-46 | `Keep my data` / `Delete my data` | Dialog actions | Cancel default-focused. Delete uses a calm warning style (amber outline) — no flashing, no red alarm. |
| SET-47 | `Your saved learning data was deleted.` | Success toast | After delete, dashboard renders its empty states. |
| SET-48 | `Clear local device data` | Button | [MANDATED label] Destructive-ish (local only) with a confirmation dialog. |
| SET-49 | `Clear data on this device?` | Confirmation dialog heading | |
| SET-50 | `This removes locally stored lab work and preferences from this device only. Data saved to your account is not affected.` | Confirmation dialog body | Scoped promise — device only, cloud untouched. |
| SET-51 | `Cancel` / `Clear data` | Dialog actions | |

---

## 7. Sync + import copy

### 7.1 Sync statuses (lab header, next to the personalization indicator)

| ID | String (exact) | When shown | Behavior / notes |
|---|---|---|---|
| SYNC-01 | `Saved` | Cloud save confirmed | Inline chip, `role="status"`, `aria-live="polite"`. Displayed ~2s, then fades. Muted tone (teal/gray); never green-exclamation. |
| SYNC-02 | `Saving…` | Cloud save in flight | Same placement. Triggered only by meaningful events (prediction, trial completed, proposal decision, counterfactual, clear/complete — contracts §5), never per-frame. |
| SYNC-03 | `Saved on this device` | Signed out, or cloud sync unavailable/disabled | Persistent while signed out. This is the honest truth: work is durable locally. Never phrase as "not saved". |
| SYNC-04 | `Couldn't sync — your work is safe on this device` | Cloud save failed | [MANDATED] Neutral amber/gray chip, same placement. Never red, never styled as an error banner, never the word "Error"/"Failed". Auto-retry on the next meaningful event; no retry button needed. |
| SYNC-05 | `Sign in to save progress across devices.` | Lab, signed-out state | Small text link next to the status chip → auth dialog. |

Transitions: SYNC-02 → SYNC-01 (success) or SYNC-04 (failure); SYNC-03 whenever there is no active cloud session. Announce each change via `aria-live="polite"`.

### 7.2 Guest import dialog (signed-out learner with local session evidence signs in)

Trigger: a signed-out learner who has created evidence in the lab signs in (from the lab header or the auth dialog). Only shown if real local session evidence exists; never auto-upload (contracts §5); idempotent by session id; "Not now" is remembered for the visit.

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| IMP-01 | `Save your current learning session?` | Dialog heading | [MANDATED] |
| IMP-02 | `This will add your current progress to your private account so you can continue on another device.` | Dialog body | [MANDATED] |
| IMP-03 | `Save to my account` | Primary action | Uploads current local session(s) once; success toast: `Your session is saved to your account.` |
| IMP-04 | `Not now` | Secondary action | [MANDATED] Dismisses; dismissal remembered for this visit; work remains on this device. |

Failure during import: toast `We couldn't save your session right now. Your work is safe on this device — you can try again from the lab.` — same calm tone as SYNC-04.

### 7.3 Offline

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| OFF-01 | `You're offline. You can keep working — your progress is saved on this device.` | Lab, network lost | Replaces the sync chip area with SYNC-03 semantics. No red styling. |
| OFF-02 | `You need an internet connection to save to your account. You can try again later.` | Guest import / sign-in attempted while offline | Inline in the relevant dialog; the "Not now" path always remains available. |

---

## 8. Lab personalization indicator

Component in the lab header (opposite the sync status). Shown only when saved learner preferences are active for the session.

| ID | String (exact) | Place | Notes |
|---|---|---|---|
| PER-01 | `Using your saved learning preferences` | Indicator label (button) | Trigger for the accessible detail. `aria-expanded` + `aria-controls` on the disclosure. |
| PER-02 | `Pace: {label} · Explanations: {label} · Motion: {On/Off} · Text size: {percent}% · High contrast: {On/Off}` | Expandable detail panel | Lists only active preferences, plain text, separated by `·`. Panel `aria-label`: `Saved learning preferences`. States facts — never "adapted to you", never any AI or clinical claim. |
| PER-03 | `Adjust for this session` | Secondary button in the indicator row | [MANDATED] Opens the session-adjustment panel (pace, motion, density, representation, text size, contrast). Changes apply to this session only and do not overwrite saved account preferences. |
| PER-04 | `Changes apply to this session and won't update your saved preferences.` | Footnote inside the session-adjustment panel | Sets the scope honestly. |

Notes: signed-out learners never see PER-01 (no saved preferences); they see SYNC-05 instead. If the lab does not support a stored preference in a given context, do not list it as active — list only what genuinely applies.

---

## 9. Error and empty-state bank

| ID | String (exact) | Place | When | Notes |
|---|---|---|---|---|
| ERR-01 | `We couldn't sign you in with Google. Please try again.` | Auth dialog | OAuth failure | See AUTH-E1; `Try again` retries the flow. |
| ERR-02 | `We couldn't open Google sign-in. Your browser may be blocking pop-ups. Please allow pop-ups for this site and try again.` | Auth dialog | Popup blocked | See AUTH-E2. |
| ERR-03 | `Sign-in needs an internet connection. You can keep using the lab without an account.` | Auth dialog | Offline | See AUTH-E3. |
| ERR-04 | `Something went wrong. Please try again in a moment.` | Any surface | Generic unexpected failure | See AUTH-E4. No error codes/stack text to learners. |
| ERR-05 | `Couldn't sync — your work is safe on this device` | Lab header | Cloud save failed | SYNC-04. Calm amber; never red. |
| ERR-06 | `We couldn't save your session right now. Your work is safe on this device — you can try again from the lab.` | Toast | Guest import failed | See IMP failure. |
| ERR-07 | `We couldn't save your preferences. Try again.` | Onboarding step 4 | Preference save failed | Inline + `Retry`; draft retained. |
| ERR-08 | `That topic is not available as an interactive lab yet.` | Hero result card | Unsupported topic | [EXISTING — do not change] Keep; paired with ERR-09. |
| ERR-09 | `The Nuclear Chain Reaction lab is currently ready.` | Hero result card | Unsupported topic | [EXISTING — do not change] Honest unavailability — the closest real option. |
| ERR-10 | `Enter a topic or choose one of the examples.` | Hero input | Empty submit | [EXISTING — do not change] Amber inline error, `role="status"`. |
| EMP-01 | `No sessions yet.` + `Your lab sessions will appear here once you start one.` | Dashboard: Recent sessions | No sessions | Plus `Start this lab` action (DASH-33). |
| EMP-02 | `Nothing in progress right now.` | Dashboard: Continue learning | No in-progress session | Plus `Start this lab` (DASH-15). |
| EMP-03 | `No preferences yet.` + `Set them up now — it takes under a minute — or keep exploring without them.` | Dashboard: Your learning preferences | Onboarding skipped | Plus `Set up preferences` (DASH-24/25/26). |
| EMP-04 | `Topics: None yet` | Onboarding review row | No topics added | Optional state; not an error (OB-4F). |
| EMP-05 | `This lab isn't available yet.` | Future-labs rows | Planned lab hover/tap | Never shown on the active lab. |

Rules: every error names the surface ("sign-in", "sync", "session") and ends with either what still works or what to do next. No red alert dialogs for sync; no "FATAL"/"ERROR" vocabulary; no exclamation points.

---

## 10. No-diagnosis language checklist

Rules (apply to every user-facing string — visible text, placeholder, aria-label, toast, dialog, help text):

1. **Ask what helps, not what condition.** Questions must be about preferences and comfort. Never ask about diagnosis, disability, medication, therapy, IEPs, doctors, or age.
2. **No clinical vocabulary.** Never use: `ADHD`, `ADD`, `autism`, `autistic`, `Asperger's`, `neurodivergent`, `neurodiverse`, `learning disability`, `learning disorder`, `dyslexia`, `dyscalculia`, `dyspraxia`, `diagnosis`, `diagnosed`, `condition`, `symptoms`, `clinical`, `medical`, `special needs`, `accommodation` (use `adjustment` / `adaptation`), `disability documentation`, `evaluate`, `assess` (in the clinical sense).
3. **No identity claims.** Never imply the product knows why a learner prefers something, only what they chose: "Pace: Balanced", not "We detected you need a slower pace". No "your profile suggests", no "typical for learners like you".
4. **The two allowed exceptions are verbatim mandates** — the auth privacy note (AUTH-07) and the existing homepage line `No timer. No diagnosis-based presets. Reduced motion, adjustable pacing, keyboard access, and learner-controlled adaptations.` ([EXISTING — do not change], `src/app/page.tsx`). Both state that we do not use diagnosis; no other string may contain the word or its variants.
5. **Conversion table** for reviewers:

| Never say | Say instead |
|---|---|
| `Do you have {condition}?` / `Select your condition` | `What should the experience feel like?` (OB-3Q) |
| `How do you learn best given your diagnosis?` | `How do explanations make the most sense to you?` (OB-2Q) |
| `Accommodations for {disability}` | `Reduce animation motion`, `Text size`, `High contrast` (OB-3D/E/F) |
| `We adapted this to your {condition}` | `Using your saved learning preferences` (PER-01) |
| `Tell us your age` | (never asked) |

6. **Engineer check before merge:** grep the user-facing strings for the forbidden list (§3 + §10.2), confirm every onboarding question is preference-shaped, and confirm the only "diagnosis" occurrences are AUTH-07 and the homepage accessibility line. Any hit outside those two is a release blocker.

---

## Appendix A — Existing copy that must not change

These strings already ship and stay byte-for-byte (all `[EXISTING]` above): hero question `What topic do you need help with?`, hero supporting line, `Find my learning path`, `Enter a topic or choose one of the examples.`, `Describe the idea that feels unclear. We'll guide you to the closest interactive learning experience.`, `We found an interactive lab for this topic.`, `That topic is not available as an interactive lab yet.`, `The Nuclear Chain Reaction lab is currently ready.`, `Start this lab`, `Edit my topic`, `Try Nuclear Chain Reaction`, `How it works` + its three step titles/bodies, `Available lab`, `Interactive lab ready`, `Future labs`, `— planned` suffixes, the `simulationDisclaimer` footer, and the homepage accessibility line. The homepage hero question is deliberately untouched by the new account-value line (HOME-04), which sits below the main action and is visually quieter (smaller, muted) — it must never outsize or out-color the primary `Find my learning path` button.
