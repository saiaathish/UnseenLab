# Platform IA — Route & Journey Architecture (Information Architect review)

Status: Validation of `docs/platform-contracts.md` route map and journeys against the
implemented codebase (`src/app`, `src/proxy.ts`, `src/lib`, `src/components`).
Read-only review; this document is the only artifact produced.

---

## 1. Route map validation

Source of truth: contracts §1. Verified against `src/app/`, `src/proxy.ts`,
`src/app/auth/callback/route.ts`.

| Route | Access (contract) | Code state | Verdict |
|---|---|---|---|
| `/` | public — topic-first hero + auth entry + app header | `src/app/page.tsx`: TopicInputHero + MiniNavbar + how-it-works + available-lab + future labs + a11y section + footer | CONFIRMED |
| `/lab/nuclear-chain-reaction` | public (always) | `src/app/lab/nuclear-chain-reaction/page.tsx` → ExperimentShell; absent from proxy matcher | CONFIRMED (never guarded) |
| `/auth/callback` | public (OAuth) | `src/app/auth/callback/route.ts` — code exchange, safe `next` allowlist, onboarding check, `/?auth=error` fallback | CONFIRMED, two issues (below) |
| `/onboarding` | protected | Not yet built; guarded by `src/proxy.ts` | CONFIRMED (planned surface) |
| `/dashboard` | protected | Not yet built; guarded by `src/proxy.ts` | CONFIRMED (planned surface) |
| `/settings` | protected | Not yet built; guarded by `src/proxy.ts` | CONFIRMED (planned surface) |

The map is accurate and complete at the route level. Findings:

- **GAP G1 — Query-parameter states are real navigable states but absent from the route map.**
  Three documented-in-code states must be added to the map: `/?auth=open` (proxy redirect
  target), `/?auth=error` (callback failure target), and `/lab/nuclear-chain-reaction?topic=…`
  (hero emit). IA and tests need them named.
- **GAP G2 — `?topic=` is emitted but never consumed.** `topic-input-hero.tsx` links to
  `/lab/nuclear-chain-reaction?topic=<normalized>`; no `useSearchParams` exists anywhere.
  The lab silently ignores the learner's typed topic — a dead parameter, and a lost
  personalization moment. Recommend: the lab echoes it as a non-blocking context line
  ("Learning about: chain reaction") or the hero stops emitting it. Do not leave it in limbo.
- **GAP G3 — Homepage auth entry is claimed but not implemented.** Contracts row for `/`
  says "auth entry"; `mini-navbar.tsx` currently renders only brand, section links, and a
  mobile panel. The auth affordance (sign-in button / avatar menu) must be added to the
  header per §2 and §7.
- **GAP G4 — Onboarding gate is enforced only inside the callback.** `src/proxy.ts` checks
  session presence but never `onboarding_version`; a signed-in user with incomplete
  onboarding who navigates directly to `/dashboard` or `/settings` is admitted. See
  Contradiction C2 (§8).
- **GAP G5 — Callback honors `next` before the onboarding check.** `safeNext` short-circuits
  the onboarding redirect. See Contradiction C1 (§8).
- **No unnecessary screens exist in the route map.** All six routes earn their place. The
  surfaces the map deliberately avoids are the right ones (see kill list, §8): no
  standalone auth page, no labs index, no unsupported-topic page, no teacher/parent/admin
  surface of any kind.
- **404:** Next's default `_not-found` is sufficient. Do not build a custom 404 screen; it
  adds surface without journey value.

## 2. Signed-out journey walkthrough

Program rule: "Guest mode must remain fully functional (open homepage, enter topic, run the
complete adaptive multi-trial lab, offline rules, export, accessibility)" and "Auth is
optional — 'Try without an account' always available; no auth wall during an active lab."

**Path A — typed topic (primary).**
1. Land on `/`. Hero: "What topic do you need help with?" (placeholder animation
   suppressed under reduced motion; `maxLength=180`, counter appears past 140).
2. Submit → `routeTopic()` (substring phrase match, capped at 1000 chars after
   normalization):
   - **Supported** → inline result card "We found an interactive lab for this topic." with
     lab title, **Start this lab** (→ `/lab/nuclear-chain-reaction?topic=…`), and **Edit my
     topic** (returns focus to the textarea). Focus moves to the result heading
     (`tabIndex=-1`, inside `aria-live="polite"`).
   - **Unsupported** → inline card "That topic is not available as an interactive lab yet."
     with **Try Nuclear Chain Reaction** and **Edit my topic**. This is a conversation, not
     a dead-end screen: no separate page, no auth prompt.
   - **Empty** → inline status "Enter a topic or choose one of the examples.", focus
     returns to the textarea. No page change.
3. **Path B — direct entry (secondary).** "Available lab" card → **Start this lab** →
   `/lab/nuclear-chain-reaction`.
4. **Inside the lab (public, always).** Complete loop, all client-side and local:
   set display preferences ("Accessibility & display" header control) → read the goal →
   prediction + confidence 1–5 (required before every run) → change one variable (one-
   variable mode default) → Run trial → "Running the simulation…" / "Interpreting your
   evidence…" → animation canvas (play/pause/step/reset, speed) → representation tabs →
   adaptation offers (accept/reject/modify; "Offline rules" or "AI interpretation" tag) →
   Counterfactual Microscope (one variable, same seed) → updated prediction gates the next
   trial → loop repeats without reload → Adaptation Replay of the whole journey.
5. **Complete & export.** Research mode → **Export anonymous session data (JSON)** (the
   only way data leaves the device, learner-initiated) and **Clear local session**
   (two-tap confirm). Everything persists to localStorage
   (`unseenlab.preferences.v1`, `unseenlab.evidence.v1`, `unseenlab.workflow.v1`),
   Zod-validated, corrupt data fails safe to defaults.
6. **Offline.** Deterministic adaptation rules run with no API key, no config, no network.
   The homepage, routing, lab, export, and accessibility all work with Supabase absent or
   unreachable (guest-only degradation).

**Auth dialog entry points (signed-out).** The dialog opens on `/`:
- from the header auth affordance (to be added, G3) — the only deliberate entry;
- `/?auth=open` — after a signed-out user hits a protected route (proxy redirect);
- `/?auth=error` — after an OAuth callback failure (calm copy, no alarm);
- optional, non-blocking: "Save your work" style affordance inside the lab header or at a
  session milestone. It must never pause, block, or navigate the learner; the lab remains
  fully usable when dismissed. During an active lab the dialog must never appear
  uninvited.

## 3. Signed-in journey

1. **Sign-in.** Auth dialog (homepage) → **Continue with Google** →
   `signInWithOAuth({ provider: "google", options: { redirectTo: origin + "/auth/callback" } })`.
   "Try without an account" is the always-present dismiss path (rule: auth optional).
   With Supabase unconfigured, `signInWithGoogle` returns "Authentication is not configured
   yet." — the dialog degrades gracefully, guest mode unaffected.
2. **Callback.** `exchangeCodeForSession` → **allowlisted `next` (same-origin relative
   only)** → else onboarding check (`profiles.onboarding_version <
   CURRENT_ONBOARDING_VERSION`) → `/onboarding` or `/dashboard`. Failure → `/?auth=error`.
3. **Onboarding (4 steps, protected).** Schema: `onboarding-schema.ts` (step 1–4; draft
   persisted locally so a refresh resumes at the correct step):
   1. Learning goal (understand_concept / prepare_for_class / explore_experiments)
   2. Explanation style (visual_first / step_by_step / concise)
   3. Learning pace (calm / balanced / quick)
   4. Accessibility prefs (reduced motion, text scale 1–1.5, high contrast) + topic
      interests (≤12)
   Complete → `onboarding_version = 1` → `/dashboard`. A later `CURRENT_ONBOARDING_VERSION`
   bump re-triggers onboarding on next callback (and must also gate the dashboard, G4).
4. **Dashboard (real data only).** Greeting/guidance from `learning_goal` + `topic_interests`
   (real-state rules only — never fabricated content); resume the most recent
   `learning_sessions` row; start a new lab; see sync status. §6.
5. **Lab with saved preferences.** Personalization mapping
   (`profile-to-learner-preferences.ts`, single conversion point): preferred_representation
   → initial representation tab; learning_pace → initial animation speed (calm 0.5 /
   balanced 1 / quick 1.5); explanation_style → lab copy + bounded adaptation context
   (never equations/outcomes); information_density → helper-text/panel density;
   reduced_motion / high_contrast / text_scale / one_variable_mode → applied directly.
   Explicit `animation_speed` overrides persist.
6. **Save.** Cloud save after meaningful events only (prediction, trial, proposal decision,
   counterfactual, session cleared/complete) — never per-frame. Status strings:
   `Saved` / `Saving…` / `Saved on this device` (guest) / `Couldn't sync — your work is safe
   on this device`.
7. **Resume.** Dashboard → continue session → lab restores the cloud workflow snapshot
   (evidence + workflow JSONB); the multi-trial loop and replay continue where they were.

## 4. Guest-conversion journey

1. Guest completes trials locally (evidence ids exist in localStorage; sync status "Saved
   on this device").
2. Sign-in (dialog) → callback → onboarding → dashboard.
3. **Import dialog (consent only).** The dashboard (or lab, on a saved milestone) offers
   "Import your work from this device" with a plain-language summary of what will be saved
   and that it is not automatic. Actions: **Save** (import) or **Not now**.
   - Never auto-upload; **dismissal is remembered only for the visit** (contracts §5) —
     the invitation may reappear on a later visit, which is intended.
   - Duplicate prevention: idempotent by stable session UUID. Same id → schema-version +
     `updated_at` comparison, newer wins, local unsynced copy preserved. Different ids →
     both preserved. Original evidence IDs are retained on import.
4. **Explicit re-trigger path.** Because dismissal expires, a deterministic re-entry point
   must exist: dashboard "Import from this device" (shown whenever a signed-in account has
   local unsynced evidence), and a lab-header "Save to your account" for a signed-in
   learner mid-session. These are the only two surfaces allowed to host the import
   affordance; the dialog itself must not spawn from anywhere else.

## 5. Failure-state map

Copy principle (from the brief and the existing product): **calm, honest, never alarming**.
Existing exemplars to reuse: "Couldn't sync — your work is safe on this device",
"Something went wrong while preparing suggestions — your experiment ran normally.",
"This is a hypothesis, not a grade." No error copy may imply failure of the learner, loss
of data that has not actually been lost, or a system fault where a graceful degradation
exists.

| Screen | Loading | Empty | Error / unsupported | Offline |
|---|---|---|---|---|
| `/` hero | (static; no fetch) | Empty topic → inline "Enter a topic or choose one of the examples." | Unsupported topic → inline "not available… yet" card with **Try Nuclear Chain Reaction** / **Edit my topic**; auth error → `/?auth=error` dialog state | Fully functional (all local); no visual difference — by design |
| Lab | "Running the simulation…" / "Interpreting your evidence…" (`role="status"`) | No prediction yet → prediction panel ("This is a hypothesis, not a grade."); run blocked by notice "Make a prediction first, then run the experiment." | Adaptation provider failure → calm notice, experiment unaffected; no counterfactual chosen → "Run the main experiment before comparing one change."; corrupt/absent localStorage → fail-safe defaults; no replay history → replay shows nothing to review, not an error | "Offline rules" badge on proposals; deterministic provider always present |
| `/auth/callback` | (route, not a screen) | — | → `/?auth=error` (dialog with calm copy; no session lost, guest work untouched) | Not reachable in a meaningful way; OAuth requires network — failure lands on `/?auth=error`, guest mode unaffected |
| `/onboarding` | Skeleton on step load | Draft resume (refresh-safe) — not an empty state | Save failure → inline "Couldn't save — your answers are safe on this device. Try again."; version bump → calm note that preferences were refreshed | Works locally; save defers and reports `Couldn't sync…` |
| `/dashboard` | Skeleton cards | No sessions → guidance copy + primary "Start a new experiment" (never fabricated data — "real data only" rule) | Fetch failure → "Couldn't load your sessions — they're safe on this device. Retry." (inline retry) | Sessions visible from local cache with "Saved on this device"; cloud ops degrade to `Couldn't sync…` |
| `/settings` | Skeleton | Not applicable (form always populated) | Save failure → inline `Couldn't sync…`; sign-out failure → calm inline message | Edits stay local; `Saving…` → `Couldn't sync — your work is safe on this device` |

## 6. Dashboard & settings IA

**Dashboard — one primary action per screen, at most two competing secondaries.**
- **Hierarchy:** header (brand, avatar menu) → guidance strip → Resume section → New
  experiment → Import affordance → footer (disclaimer).
- **Sections:**
  1. *Guidance* — greeting + learning-goal copy + future-topic chips (labeled, from
     `topic_interests`). Real-state rules only; no fabricated stats.
  2. *Resume* — most recent `learning_sessions` rows (title, lab, `updated_at`, status
     active/complete). **Primary action: "Continue" the most recent active session.**
  3. *New experiment* — topic input or lab card → `/lab/nuclear-chain-reaction` (secondary:
     "Start a new lab").
  4. *Import from this device* — appears only when signed-in account has local unsynced
     evidence (§4). Secondary (2 max: Continue + Start new lab are the two; Import is a
     contextual third — allowed only while an unsynced-evidence condition is true, so at
     most two are ever visible at once).
- Sign-out, settings, and other account functions do not live on the dashboard — one
  avatar menu, one route (`/settings`).

**Settings — sections and one primary action each.**
- **Hierarchy:** tabs or stacked sections (Profile → Preferences → Accessibility & display
  → Privacy & data), one primary action per section, never more than two competing
  secondaries on screen.
  1. *Profile* — display name, avatar, **Sign out** (clears session; local guest evidence
     preserved — never offers to delete it without explicit confirmation). Primary action:
     **Rerun onboarding** (program rule: "Settings allows rerunning onboarding" — this is
     the sanctioned location; it writes a version bump and routes to `/onboarding`).
  2. *Preferences* — learning goal, preferred representation, explanation style, pace
     (values mapped via `profile-to-learner-preferences.ts`; UI never maps directly).
     Primary: **Save changes**.
  3. *Accessibility & display* — reduced motion, high contrast, text scale, information
     density, one-variable mode, animation speed. These mirror the lab's "Accessibility &
     display" panel; keep the same control order and labels so the two surfaces agree.
     Primary: **Save changes**. Secondary (1): **Reset to defaults**.
  4. *Privacy & data* — export JSON, clear cloud sessions, guest-evidence note. Primary:
     **Export my data**. Secondary: **Clear cloud sessions** (confirm step).
- One primary action per screen: if tabs are used, each tab carries its own primary
  button; never two identical "Save" actions visible simultaneously.

## 7. Accessibility-relevant IA notes

- **Skip link.** Today only the homepage `<main id="main-content">` exists; the lab page
  has no main id, and onboarding/dashboard/settings are unbuilt. All new screens must
  render a consistent skip-to-main control and a `main` with a stable id. Focus order per
  screen: skip link → header (brand, auth) → primary content → primary action → secondary.
- **Focus management.** The hero already does the right pattern: after topic routing,
  focus moves to the result heading (`tabIndex=-1`), announced via `aria-live="polite"`
  — never yanked to the top of the page. The lab uses `inert` on background content while
  Adaptation Replay is open (focus trapped, restored on close — keep this pattern for the
  auth dialog and any confirm dialog). The prediction/reflection section receives focus
  after an "ask prediction again" adaptation.
- **Dialog vs page for auth on mobile.** Do not build a separate `/auth` route (kill list,
  §8). On desktop, the auth surface is a modal dialog over the homepage. On mobile, the
  same dialog must render as a full-screen bottom sheet (or full-screen dialog) with the
  same DOM and copy — same component, responsive layout, never a second page. Rationale:
  one state machine, one focus-trap implementation, no duplicate route to protect, and no
  risk of the dialog being treated as a distinct destination by the proxy or tests.
- **Motion & announcements.** Placeholder animation and hero wave must honor
  `prefers-reduced-motion` plus the in-app override (implemented today in the hero — keep
  it for the auth dialog's entrance). Lab playback summary doubles as the screen-reader
  state summary; no per-frame `aria-live`. New surfaces: dialog open/close must announce
  the dialog title; sync status changes announce via `aria-live="polite"` only on state
  transitions (Saved ↔ Saving… ↔ Couldn't sync), never continuously.
- **Dialog timing.** The auth dialog never opens automatically over an active lab; it only
  opens on explicit user action, `/?auth=open`, or `/?auth=error` — and on the homepage,
  never during topic typing (it must not steal focus from the topic input).

## 8. Kill list

**CUT LIST exclusions that must never appear in the IA** (program rule: "cut list forbids
teacher/parent/admin dashboards, billing, social, etc."; product-spec "Out of scope"
confirms: "teacher dashboard, full course system, additional complete labs, VR, webcam
analysis, diagnosis detection, social features, … authoring platform"):

- Teacher / parent / admin dashboards or role-based views of any kind — there is one
  surface type: the learner's own. No roles exist in the data model (own-row RLS only).
- Billing, pricing, plans, subscription, or payment surfaces.
- Social features: profiles as public content, sharing, feeds, leaderboards, XP,
  gamification, comments. (Social is cut; keep social-adjacent affordances like "share
  my export" out of the IA too.)
- Generic chat / unrestricted AI chat (also an NFR: "No generic unrestricted chat
  endpoint").
- Diagnosis detection, clinical labels, diagnosis-based presets (judge-qa: "no
  diagnosis-based presets"; the product speaks of "possible conceptual friction", never
  diagnosis).
- Authoring platform for new labs (labs are registered in code,
  `src/domain/experiments.ts`).
- VR / webcam / AR experiences; real dangerous laboratory instructions.
- Paid API runtime dependencies.

**Duplicates within the current IA plan — kill or merge:**

| Duplicate surface | Recommendation |
|---|---|
| Standalone auth page (`/auth` or `/login`) vs homepage auth dialog | **Kill the page.** One dialog component (responsive: modal → full-screen sheet on mobile) hosted on `/`; state-driven via `?auth=open` / `?auth=error`. One implementation, one focus trap, one test suite. |
| `/labs` index page vs homepage "Available lab" section | **Kill the page.** With one ready lab, a labs index duplicates the homepage section and the hero routing. Revisit only when a second lab is `ready`. |
| Unsupported-topic "page" vs inline result card in the hero | **Kill the page.** The inline card ("That topic is not available…" + Try/Edit) is a conversation, not a dead end, and is already implemented and tested. |
| "Design evidence" panel on the landing page vs `docs/user-research.md` | **Keep killed** (already dropped per `rubric-strategy.md`); evidence claims belong in docs, not the IA. |
| Email/password sign-up form vs Google OAuth only | **Kill any sign-up form.** Contracts define Google OAuth + PKCE only; the auth dialog has exactly one identity provider. |
| Dashboard analytics/stats block vs "real data only" guidance | **Kill any stats/fabricated metrics.** Dashboard shows real sessions and real-state guidance; an empty dashboard is an honest empty state, not a reason to invent charts. |

**Contradictions with program rules (quoted):**

- **C1 — Callback `next` ordering.** Rule: "Signed-in users with incomplete onboarding go
  to /onboarding; complete → /dashboard." In `auth/callback/route.ts`, an allowlisted
  `next` short-circuits the onboarding check, so `?next=/dashboard` (or `/settings`) can
  deliver an onboarding-incomplete user straight to a protected page. **Required change:**
  resolve onboarding completion *before* honoring `next` when `next` is a protected path;
  `next` should remain for public destinations (e.g. returning into the lab).
- **C2 — Proxy never enforces onboarding.** Rule (same quote above). `src/proxy.ts` gates
  only on session presence; a direct visit to `/dashboard` by an incomplete-onboarding
  user is admitted. **Required change:** the proxy (or the dashboard page on first render)
  must redirect incomplete-onboarding users to `/onboarding`, mirroring the callback
  logic. Otherwise the rule holds only for the OAuth entry path.
- **Confirmed, no conflict:** "Never redirect an unauthenticated learner away from an
  active lab" — the lab is absent from `PROTECTED_PREFIXES` and the matcher; verified in
  `src/proxy.ts`. "Signed-out visitors hitting protected routes → /?auth=open" — verified,
  all three redirect branches. "Auth is optional — 'Try without an account' always
  available; no auth wall during an active lab" — the lab has no auth dependency today;
  the conversion affordance must stay non-blocking (§2, §7).

## Verdict

**IA CONDITIONALLY CONFIRMED.** The contracts route map is sound, guest mode is genuinely
complete, and the lab is provably never guarded. Five required changes before build-out of
the protected surfaces:

1. **C1/C2:** Enforce the onboarding gate at the callback (`next` ordering) *and* at the
   proxy/dashboard, so "incomplete onboarding → /onboarding" holds for every entry path.
2. **G1:** Add `?auth=open`, `?auth=error`, and `?topic=` to the route map as first-class
   states; define their copy in the dialog/hero.
3. **G2:** Consume `?topic=` in the lab (echo as a context line) or stop emitting it —
   no dead parameters.
4. **G3:** Implement the homepage header auth entry (MiniNavbar) and the responsive auth
   dialog as a single component (modal → full-screen sheet on mobile); no `/auth` route.
5. **G4/G5 (build-time):** Dashboard and settings must be built to the §5/§6 IA — real
   data only, one primary action per screen, Import affordance conditioned on unsynced
   local evidence, "Rerun onboarding" in Settings → Profile, skip links on every new main.
