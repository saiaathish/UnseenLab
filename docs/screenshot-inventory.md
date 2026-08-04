# UnseenLab — Screenshot Inventory (capture tomorrow morning)

**Purpose:** the exact screenshot deck to capture the morning of the deadline, used for the
submission, the video's cutaways, and live-demo backup (`validation-pack/demo-failure-script.md`
references a `step-01..step-08` deck — this inventory is the authoritative capture list).

**Rules**

- Capture against the **production build** (local `npm run build && npm run start -- -p 3100`, or
  the deployed URL once env vars are verified) in a **fresh browser profile** so the deck is
  reproducible.
- File naming: `validation-pack/backups/screenshots/<slug>.png` (e.g. `step-01-landing.png`).
- Mark each row `[ ]` as captured; store one PNG per row.
- Signed-in rows need a real session: use the seeded `learner_a@test.local` cookie path
  (`scripts/e2e-seed-auth.mjs token`) or a real Google sign-in on the deployed domain once
  authorized domains are confirmed (`docs/firebase-mongodb-setup.md` §1.3, §6).
- Seeded hero run for lab shots: prediction "It gets slightly faster", confidence 3, absorber 0.2,
  seed 42 → ceiling 500 at step 28 (verified in `validation-pack/demo-script.md`).

---

## 1. Homepage & auth

| # | Shot | Where to capture (URL/path) | Requires | File slug |
|---|---|---|---|---|
| S01 | Homepage hero — topic input visible | `http://localhost:3100/` (or deployed root) | none | `step-01-landing.png` |
| S02 | Topic routing — after typing "chain reaction" + Enter | `/lab/nuclear-chain-reaction` (note: routes directly; capture the landing URL before/after for the routing story) | none | `s02-topic-routing.png` |
| S03 | Auth dialog | `/?auth=open` (proxy target for protected routes) | none | `s03-auth-dialog.png` |
| S04 | Auth error state | `/?auth=error` | none | `s04-auth-error.png` |

## 2. Onboarding (signed-in; route-protected)

| # | Shot | Where to capture | Requires | File slug |
|---|---|---|---|---|
| S05 | Onboarding step 1 — "What would you like help doing?" | `/onboarding` (fresh account, `onboarding_version` < 1) | signed-in session | `s05-onboarding-step1.png` |
| S06 | Onboarding step 2 — "How do explanations make the most sense to you?" | `/onboarding` step 2 (e.g., choose "Walk me through it step by step") | signed-in session | `s06-onboarding-step2.png` |
| S07 | Onboarding step 3 — "What should the experience feel like?" (pace + "Reduce animation motion" switch) | `/onboarding` step 3 (choose "Balanced pace", reduced motion ON for the cross-device story) | signed-in session | `s07-onboarding-step3.png` |
| S08 | Onboarding step 4 — "What topics are you working on?" + "Start learning" | `/onboarding` step 4 (chip "Nuclear chain reactions" → "Start learning") | signed-in session | `s08-onboarding-step4.png` |

## 3. Dashboard (signed-in, real data)

| # | Shot | Where to capture | Requires | File slug |
|---|---|---|---|---|
| S09 | Dashboard with real rows — greeting, "Your learning preferences", "Continue learning", "Recent sessions" | `/dashboard` after completing onboarding AND after importing a real guest session ("Save to my account") | signed-in session with ≥1 saved session | `s09-dashboard-signed-in.png` |
| S10 | Dashboard empty states (for the isolation story) | `/dashboard` on a fresh second account (`learner_b@test.local`): "Nothing in progress right now.", "No sessions yet." | second signed-in account | `s10-dashboard-empty-account-b.png` |
| S11 | Guest-import consent dialog | lab header "Sign in to save progress across devices." → sign in → "Save your current learning session?" | signed-in + guest evidence present | `s11-import-consent.png` |
| S12 | Session-resume dialog | "Continue learning" → "Resume" → "Continue where you left off?" → "Continue saved session" | signed-in with in-progress session | `s12-resume-dialog.png` |

## 4. Settings (signed-in)

| # | Shot | Where to capture | Requires | File slug |
|---|---|---|---|---|
| S13 | Settings — all four tabs visible | `/settings` (tabs: Profile, Learning preferences, Accessibility, Privacy and data) | signed-in session | `s13-settings-tabs.png` |
| S14 | Settings — Profile tab | `/settings` → Profile | signed-in session | `s14-settings-profile.png` |
| S15 | Settings — Learning preferences tab | `/settings` → Learning preferences | signed-in session | `s15-settings-learning.png` |
| S16 | Settings — Accessibility tab (text scale, high contrast, reduced motion) | `/settings` → Accessibility | signed-in session | `s16-settings-accessibility.png` |
| S17 | Settings — Privacy and data (delete/wipe confirmation) | `/settings` → Privacy and data | signed-in session | `s17-settings-privacy.png` |

## 5. Lab — the WINNING EDGE sequence (guest, seed 42)

| # | Shot | Where to capture | Requires | File slug |
|---|---|---|---|---|
| S18 | Lab ready state — "Predict first", variables, "Accessibility & display" | `/lab/nuclear-chain-reaction` (fresh session) | none | `step-02-prediction.png` (prediction panel) |
| S19 | Prediction submitted — "Your prediction" card | lab, after "Submit prediction" ("It gets slightly faster", confidence 3) | none | `s19-prediction-submitted.png` |
| S20 | Variables at absorber 0.2 | lab, "Change one thing" — "Absorber position" slider at 0.2 | none | `step-04-variables-at-02.png` |
| S21 | Result — stop banner "The simulation stopped at the safety ceiling: 500 free neutrons." | lab, after "Run trial" (absorber 0.2, seed 42) | none | `step-03-result-ceiling.png` |
| S22 | "Suggested adaptation" card with reason + source badge + Accept/Reject/Modify | lab, after the run (rules path: `show_graph` expected; hosted path: any card with a badge) | none | `step-05-adaptation-card.png` |
| S23 | Graph representation open (accepted adaptation applied) | lab, Graph tab open after Accept | none | `s23-graph-view.png` |
| S24 | Counterfactual — "Compare one change" → "Run comparison" result (absorber 0.2 → 0.9, same seed) | lab, Counterfactual Microscope panel | ≥1 completed trial | `step-07-counterfactual.png` |
| S25 | Updated prediction prompt | lab, after first trial ("Updated prediction" + confidence) | ≥1 completed trial | `s25-updated-prediction.png` |
| S26 | Second trial in progress / completed (loop) | lab, second "Run trial" after updated prediction | ≥1 completed trial | `s26-second-trial.png` |
| S27 | Adaptation Replay dialog listing both trials | lab, "Adaptation Replay" button | ≥2 trials | `step-08-replay-dialog.png` |
| S28 | "Using your saved learning preferences" indicator (signed-in) | lab header strip on `/lab/nuclear-chain-reaction` | signed-in with saved preferences | `s28-saved-preferences-indicator.png` |
| S29 | "Accessibility & display" panel open | lab, "Accessibility & display" button | none | `s29-accessibility-panel.png` |
| S30 | Safety disclaimer in the lab header | lab header (always visible regardless of density) | none | `s30-disclaimer.png` |

## 6. Research mode & export

| # | Shot | Where to capture | Requires | File slug |
|---|---|---|---|---|
| S31 | Research consent + pre-use questionnaire | lab, "Research mode" → "Before you used the lab" (confidence/effort sliders) | none | `s31-research-pre.png` |
| S32 | Post-use questionnaire + placeholder impact block | lab, "Research mode" → "After you used the lab" ("What became clearer?", "What remained confusing?", "What should we remove or change?") | none | `s32-research-post.png` |
| S33 | Export dialog / downloaded file | "Research mode" → "Export anonymous session data (JSON)" → open `unseenlab-session.json`; capture the file + the label "Initial design case study evidence. Not a statistically validated learning study." | ≥1 trial completed | `s33-export-json.png` |

## 7. Deployment proof

| # | Shot | Where to capture | Requires | File slug |
|---|---|---|---|---|
| S34 | Deployed homepage (production URL) | `https://unseen-lab.vercel.app/` (or submitted domain) | Vercel env vars set (morning checklist §5) | `s34-deployed-home.png` |
| S35 | Signed-in on the deployed domain (authorized-domains proof) | deployed root → "Continue with Google" → dashboard | authorized domain + Google account | `s35-deployed-signed-in.png` |

---

## Capture order (recommended)

1. Guest shots S01–S04, S18–S27, S29–S33 (no auth needed) — do these first, in one clean pass.
2. Signed-in shots S05–S17, S28 (seed `learner_a` via `scripts/e2e-seed-auth.mjs`, or real
   Google sign-in).
3. Isolation shot S10 (second account `learner_b`).
4. Deployment shots S34–S35 last (after env vars + authorized domains are confirmed).

## Post-capture checks

- [ ] Every slug exists as a PNG in `validation-pack/backups/screenshots/`.
- [ ] The two seeded facts are visible in the deck: ceiling banner "500 free neutrons" (S21) and
      counterfactual delta (S24).
- [ ] The source badge ("Offline rules" or "AI interpretation") is legible in S22.
- [ ] No shot contains a timer, a console, or an address bar with local dev ports if used in the
      video (crop or re-capture against the deployed URL).
