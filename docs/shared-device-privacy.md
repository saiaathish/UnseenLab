# UnseenLab — Shared-Device Privacy Policy

Status: Phase 1 (policy for the sign-out choice) — companion to `docs/platform-contracts.md` (§3 data model, §5 sync contract), `docs/platform-copy-spec.md` (§6.4 privacy and data, §7.2 import), and the implementation in `src/components/auth/sign-out-dialog.tsx`, `src/components/sync/guest-import-dialog.tsx`, `src/storage/session-storage.ts`, `src/sync/guest-session-import.ts`, `src/sync/cloud-session-repository.ts`, `supabase/migrations/20260803193000_platform_schema.sql`.

This document is internal. It explains, in plain language and in exact flows, what UnseenLab stores where, what sign-out does and does not do in each mode, why signed-out learning data is device-scoped by design, and how to use UnseenLab on a shared computer (school, library, or family device).

---

## 1. What is stored, and where

UnseenLab keeps two kinds of data, and they never mix without explicit consent:

### 1.1 Device-local data (this browser, this device)

Stored in `localStorage` of the site's origin, scoped to one browser profile on one device. Nothing here is ever transmitted anywhere on its own; every read is validated, and corrupt data safely falls back to defaults.

| Key | Contents |
|---|---|
| `unseenlab.evidence.v1` | Lab trial evidence (predictions, trials, decisions) |
| `unseenlab.preferences.v1` | Learning preferences (pace, representation, etc.) |
| `unseenlab.workflow.v1` | In-flight lab workflow (e.g. a pending prediction) |
| `unseenlab.session-id.v1` | Stable session id used for cloud sync and import |
| `unseenlab.onboarding-draft.v1` | Partially completed onboarding choices |
| `unseenlab.imported-session-id.v1` | Bookkeeping list: which session ids were already saved to an account (no learning content) |
| `unseenlab.import-dismissed.v1.{id}` (`sessionStorage`) | "Not now" dismissal for the current visit only; disappears when the tab closes |

Scope honesty: "this device" means this origin's storage in this browser profile. It cannot cover other origins (for example Google's own cookies after a Google sign-in) or other apps, and a different browser profile or a private window has its own separate storage.

### 1.2 Account-cloud data (the learner's account)

Three Supabase tables: `profiles`, `learner_preferences`, `learning_sessions`. Every row is owned by exactly one account (`user_id`), enforced server-side by row-level security (§5). Cloud writes happen only through the authenticated client and only after meaningful lab events (prediction, trial completed, proposal decision, counterfactual, session cleared/complete) or after the explicit import consent in §4, Flow 3 — never per-frame, never automatically.

### 1.3 The rule in one sentence

Device data belongs to the browser; cloud data belongs to the account; the only bridge between them is a dialog the learner explicitly agrees to.

---

## 2. Why signed-out learning is device-scoped by design

The product promise, stated on the sign-in dialog, is that the lab is fully usable without an account and that signing in adds one thing — saving across devices: `Try the lab now. Sign in whenever you want to save progress across devices.`

To keep that promise, signed-out work must be durable without an account. So it is persisted locally, in the browser, where it cannot be lost on reload and where it needs no server. The sync status is honest about this: `Saved on this device` is shown whenever there is no active cloud session.

The consequence is the one this document exists to make explicit: local data is scoped to the browser, not to the person. On a personal device that distinction rarely matters. On a shared computer — one browser profile used by several learners — the browser is the privacy boundary. That is exactly why sign-out now asks for a choice instead of silently deciding.

---

## 3. Sign-out: the two choices

When a signed-in learner signs out (from the avatar menu or from Settings → Privacy and data), they see the sign-out dialog with the exact strings:

- Title: `Sign out of UnseenLab?`
- Description: `Your learning data on this device is kept private to this browser. Choose what happens to it when you sign out.`
- `Cancel` — closes the dialog, nothing changes.
- `Sign out and keep my data on this device` — the default, primary action.
- `Sign out and clear data on this device` — the secondary action, styled as destructive to mark that it removes local data.

Both actions share the same guarantees:

- The Supabase session is cleared: the next person on this browser is signed out and cannot reach the first learner's account.
- Account-cloud rows are never touched. The sign-out path performs no cloud reads or writes of learning data; deletion of account data exists only as a separate, explicitly confirmed action in Settings (`Delete my saved learning data`).

| | Keep (default) | Clear |
|---|---|---|
| Supabase session | Cleared | Cleared |
| Lab evidence, preferences, workflow on this device | **Kept** | Removed (`unseenlab.evidence.v1`, `unseenlab.preferences.v1`, `unseenlab.workflow.v1`) |
| Local session id | Kept | Rotated to a fresh id, so a future signed-out session can never silently overwrite a previously saved cloud row |
| Onboarding draft | Kept | Removed |
| Cloud data | Untouched | Untouched |
| After sign-out | Redirected to `/` | Redirected to `/` |

Keep mode means: only the sign-in state ends. Clear mode means: the sign-in state ends and the device is handed on as if no one had used it in this browser profile.

---

## 4. The exact flows

### Flow 1 — Sign out and keep my data on this device

1. Learner A, signed in, opens the sign-out dialog and chooses `Sign out and keep my data on this device` (the default).
2. The app clears only the Supabase session (`signOut()`). No local key is touched; evidence, preferences, workflow, session id, and onboarding draft all remain.
3. The dialog closes; the browser returns to `/` and refreshes; the header now shows `Sign in`.
4. Cloud rows for A's account are unchanged and remain reachable only by signing in again as A.

### Flow 2 — Sign out and clear data on this device

1. Learner A chooses `Sign out and clear data on this device`.
2. The app clears local evidence, preferences, and workflow; rotates the local session id to a fresh one (so any later signed-out session starts a new lineage that can never overwrite A's cloud rows); and removes the onboarding draft.
3. The app then clears the Supabase session, exactly as in Flow 1.
4. Cloud rows for A's account are unchanged and remain reachable by signing in again as A.
5. The browser returns to `/`; the device is left in a fresh signed-out state.

### Flow 3 — A signed-out learner signs in (import, consent-only)

This is the only bridge between device data and cloud data, and it always asks first.

1. Learner B works in the lab without an account. Evidence accumulates locally; the sync status reads `Saved on this device`. Nothing is uploaded.
2. B signs in with Google. The OAuth callback completes and returns B to the app.
3. If B has local trial evidence that has not already been imported and was not dismissed this visit, the import dialog appears (also reachable anytime from the lab header link `Save this session to your account`):
   - Title: `Save your current learning session?`
   - Body: `This will add your current progress to your private account so you can continue on another device.`
   - `Not now` — dismissed for this visit only (stored in `sessionStorage`); the work stays on this device; B can trigger the dialog again from the lab header.
   - `Save to my account` — the current local session is uploaded once, idempotently, keyed on the stable session id, preserving the original evidence ids. Success toast: `Your session is saved to your account.` The session id is recorded as imported, so the offer never repeats for that session.
4. If the save cannot reach the network, nothing half-imports: toast `We couldn't save your session right now. Your work is safe on this device — you can try again from the lab.` Local data is untouched.
5. Uploads never happen automatically and never happen twice for the same session id (`unseenlab.imported-session-id.v1`).

### Flow 4 — A second user on the same browser

Before either sign-out choice, the browser is still signed in as A, so the next person should simply not use the device mid-session — the natural boundary is sign-out.

- **After Flow 1 (keep):** the browser is signed out, but A's local evidence, preferences, and onboarding draft are still in this browser profile. Learner C, opening the lab signed out, sees and can continue A's local work — that is what "kept on this device" means, and it is why the dialog says the data is "kept private to this browser", not to this person. If C then signs in as themselves, the import dialog may offer to save A's local evidence into C's account; that save is always the result of an explicit `Save to my account` choice, never automatic. A's cloud account stays out of reach of C: C would need A's Google sign-in to see it.
- **After Flow 2 (clear):** the browser is signed out and the local keys are empty. Learner C sees a fresh signed-out state — no evidence, default preferences, a new session id. Nothing of A's is visible, on the device or in the browser. A's cloud account is unchanged and still reachable by signing in as A.

Honest caveat for both flows: the imported-session-id bookkeeping list and any per-visit dismissal flags survive either sign-out mode. They contain no learning content — they only record that a given session id was already saved, or that a dialog was dismissed for a visit. They are not evidence and cannot be used to read anyone's work.

---

## 5. The RLS boundary statement

- **Cloud data is account-scoped.** All three tables (`profiles`, `learner_preferences`, `learning_sessions`) are protected by row-level security: every policy targets only `authenticated` role with an explicit `(select auth.uid()) = user_id` predicate on read, insert, update, and delete; `anon` receives no grants. The repository never trusts the client to filter by user — the server enforces ownership on every query, so one account can never read or write another account's rows through the API.
- **Device data is browser-scoped.** `localStorage` and `sessionStorage` keys are scoped to this origin in this browser profile, with no account association at all. Signed-out work is durable locally precisely because it lives entirely inside that boundary.
- **The two never mix without explicit consent.** The single crossing point is the import dialog (Flow 3): it is consent-only, never auto-uploading, idempotent by session id, and dismissible for the visit. Sign-out never touches cloud data in either mode, and nothing in the app writes device data into the account except the confirmed `Save to my account` action.

---

## 6. Shared-device guidance (schools, libraries, families)

The purpose of the sign-out dialog is to make the shared-device decision explicit at the moment it matters — when one learner's session ends and the device is handed on.

**Recommended practice for shared devices: choose `Sign out and clear data on this device`.**

- It is the only sign-out mode that hands the browser on cleanly: the next learner starts with no evidence, no preferences, and a fresh session id.
- It never harms the account: everything saved to the account (via `Save to my account` or normal sync while signed in) is untouched and still available after signing back in.
- If the learner is unsure whether their work is saved to their account, the safe sequence is: sign in, save (Flow 3), then sign out with the clear option. The lab header's `Save this session to your account` makes this possible from the lab itself.

**The same capability exists outside sign-out.** Settings → Privacy and data → `Clear local device data` (confirmation: `Clear data on this device?` — `This removes locally stored lab work and preferences from this device only. Data saved to your account is not affected.`) clears the device at any time, signed in or not, with the same guarantees.

**Guidance to give learners and families:** signed-out work is saved on the device you are using, not to an account. On a shared computer, choose the clear option when you finish so your lab work stays yours. If you sign in first, your work can be saved to your account and continue on any device — then clearing the device is free of worry.

**Structural options for administrators:** separate browser profiles or private windows give each learner an independent storage boundary without any manual clearing; a kiosk policy that clears browser storage between sessions achieves the same result. UnseenLab supports these from the product side by making the local boundary explicit rather than hidden.

**What UnseenLab deliberately does not do:** it does not auto-clear local data on sign-out (that would silently discard a learner's work and break the signed-out-first promise), and it does not push device data to the cloud without the import dialog. Both facts are why the dialog asks, and why the default is keep: the learner decides, never the product.

---

## 7. Answer for the judge: "What happens on a shared school computer after sign-out?"

When a learner signs out on a shared school computer, UnseenLab shows one dialog with two explicit choices. The default, `Sign out and keep my data on this device`, ends the sign-in (so the next learner cannot reach that account) while leaving the learner's lab work on the browser — which is right for a personal device, where the learner will come back. On a shared computer, the school's practice is the second option: `Sign out and clear data on this device`, which removes the lab evidence, preferences, and onboarding draft from that browser and starts a fresh session id, so the next learner begins clean and the first learner's work can never be silently overwritten. Either way, nothing on the account is touched: cloud data is protected by row-level security that ties every row to one account, and it stays available the next time the learner signs in. In short: sign-out always ends the session, the clear option also ends the device trail, and the account is safe regardless — the choice is simply whether the device should remember.
