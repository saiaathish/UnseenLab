# UnseenLab — Participant Session Handoff (one page)

Audit verdict: **PARTICIPANT_READY** (2026-08-06, head `00d2943`, preview deployment `5780793198`).

## 1. The exact session URL

```
https://unseen-krlbio12v-sai-aathish-karthiks-projects.vercel.app
```

- Behind Vercel SSO → **open it in a browser where you are already signed in to Vercel** (the facilitator's session). The learner uses the product only; no accounts, no keys, no terminal.
- Commit: `00d29438407c74df293f251da48b3e3288190a2e` (PR #10 draft head; code frozen until the participant produces evidence).

## 2. The task (verbatim)

> "Ask UnseenLab to help you understand why planets remain in orbit."

On screen: the same idea is one click — the example button **"Show why planets stay in orbit."**

## 3. Session flow (15–20 min)

1. **Consent** (facilitator script, `validation-pack/user-testing-protocol.md:38-39`): participate, anonymous notes, no name, stop anytime; note that screenshots may be taken; no screen recording (by design).
2. **Before** (paper Part B/D — the in-app recorder is nuclear-specific, use paper for the orbits task): explanation, prediction, confidence 1–5, expected mental effort 1–5.
3. **Task**: learner types the sentence (or clicks the example), generates, enters the demonstration.
4. **During** (paper, `validation-pack/facilitator-session-sheet.md`): time to first meaningful action; time to prediction; first variable changed; hesitation; help requests; representation chosen (3D/Timeline/Graph); their interpretation of "Verified simulation"; adaptation accepted/rejected/modified; any accessibility settings used (record in notes).
5. **After** (paper Part B/D): revised explanation, revised prediction, confidence 1–5, actual mental effort 1–5, clearer/confusing, one thing to keep, one thing to remove, **one exact quote**.
6. **One revision only** — after the session, fill exactly one row in `validation-pack/revision-log.md`: observation → evidence → product change → regression test → retest. Never fabricate; never backfill.

## 4. Failure one-liners (if anything misbehaves)

| Situation | Say |
|---|---|
| Generation slow/timeout | "Learners see a calm waiting message; the demo still works offline." |
| Provider down | "The demo is still generated from built-in templates." |
| No internet | "No internet? The built-in catalog still delivers a demo." |
| Account save unavailable | "Account saving is politely unavailable; your work stays on-device." |
| No sign-in wall | "Visitors proceed as guests — no sign-in wall." |
| WebGL absent | "The demo auto-switches to a text/table view." |
| Refresh | "The page returns with every recorded trial intact." |
| Save conflict | "A second-device save is refused; nothing is overwritten." |
| Empty prompt | "A friendly example is shown, never an error." |
| Unrecognized prompt | "A safe default demo appears, never a crash." |

## 5. After the session (before submission)

1. **VoiceOver smoke** — run the 8-item checklist at `docs/closure-90-a11y.md:101-115` (needs macOS Accessibility permission); record VOICEOVER_VERIFIED=YES only if a real run happens.
2. **Video** — record after the participant revision exists (13-beat script `docs/demo-script-generative.md`; closing line verbatim: "UnseenLab lets AI compose the learning experience, but never lets AI invent the science.").
3. **Atlas cleanup (auto-enforced, but verify)**: `0.0.0.0/0` self-removes at `2026-08-09T23:59:59Z`; then revoke the API key (Atlas console → Access Manager → API Keys → delete) and remove `ATLAS_API_*` from `.env`.
4. **Judge-public URL**: preview stays SSO-blocked for non-owners — decide how the judge accesses it (facilitator session) and label it in the submission.
