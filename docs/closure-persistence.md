# Closure — Persistence (Preview + Local End-to-End) — Agent 08

Date: 2026-08-05 (local CDT 17:01; UTC 22:01)
Agent: AGENT 08 (Preview persistence and browser engineer)
Scope: PR #9 — generative demonstration persistence (`/api/demonstrations`,
`/demos/<id>`, guest device saves, account saves, cross-device resume,
two-user isolation, deletion) verified end-to-end in a real browser against
REAL Firebase Auth + REAL MongoDB Atlas, plus the Vercel preview state.

Honesty rules applied: no network interception, no stubs; every claim below
was observed in a real Chromium browser or in the app's own HTTP API over the
wire. Cookies, UIDs and connection strings are never printed here; users are
identified by the labels `learner_a` / `learner_b`.

---

## 1. Vercel preview state (read-only)

### 1.1 Deployment for commit 34dce5b6

- `npx vercel ls` → deployments for `unseen-lab`; the deployment matching
  commit `34dce5b6` was found via the Vercel API
  (`GET /v9/deployments?projectId=…&target=preview`):
  - URL: `https://unseen-gdsvf2dth-sai-aathish-karthiks-projects.vercel.app`
  - State: `READY`, deployment id `dpl_5A2bWcJzYSc1hSnttV8dzjgbsViE`,
    created ~11 h before this check (both from the API; not printed here).

### 1.2 Preview environment variables (Vercel API, values never printed)

`GET /v9/projects/<projectId>/env` — 22 vars total. Relevant two:

| Key | Targets | Presence/value |
|---|---|---|
| `MONGODB_URI` | preview | PRESENT (type `encrypted`, ciphertext 1284 bytes; the API reports `decrypted: false` — this project's values are not decryptable via the API, so the plaintext was never exposed or printed) |
| `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` | preview | EXISTS but its configured `value` is EMPTY (0-byte ciphertext). It is therefore NOT `"1"` in the preview environment. (The prior audit's expectation of a flag build is thus not satisfiable on this deployment; see 1.3.) |

Other preview-target vars: `FIREBASE_SERVICE_ACCOUNT`,
`NEXT_PUBLIC_FIREBASE_APP_ID/PROJECT_ID/AUTH_DOMAIN/API_KEY`, `LLM_API_KEY`,
`LLM_MODEL`, `LLM_API_BASE_URL`, `NEXT_PUBLIC_LLM_ENABLED` (names only).

### 1.3 Preview reachability probe (read-only, no bypasses attempted)

Anonymous requests to the preview are intercepted by Vercel **SSO
deployment protection** (the project owner has "Vercel Authentication"
enabled for this environment):

- `GET <preview>/api/demonstrations/health` → `302` with
  `location: https://vercel.com/sso-api?url=…<preview>…/api/demonstrations/health&nonce=…`
  (observed, 2026-08-05).
- `GET <preview>/api/demonstrations` (unauthenticated) → `302` to the same
  `vercel.com/sso-api` flow.
- `GET <preview>/` (homepage) → `302` → `vercel.com/login`; the app's HTML is
  never served to anonymous callers, so the baked flag state could not be
  read from the homepage either.

Consequence: **the preview lambda is not reachable without interactive Vercel
account auth**, and the health endpoint does not report Mongo reachability
(its body covers only the LLM provider + circuit breaker). Consistent with
the prior audit, the preview therefore remains externally unverifiable:
`PREVIEW_BLOCKED_EXTERNAL`. Two independent blockers:

1. Edge: SSO deployment protection redirects all anonymous traffic (this
   run's finding).
2. Lambda→Atlas: per the prior audit (and unchanged access-list config), the
   preview lambda's TLS handshake to the Atlas cluster is rejected
   ("tlsv1 alert internal error") because Atlas Network Access allowlists
   only the local machine IP.

No workarounds were attempted (no SSO bypass, no access-list change), per
the closure rules.

---

## 2. Local end-to-end verification (core deliverable)

### 2.1 Environment

- Real Firebase project (Auth) + real MongoDB Atlas, via the repo's own
  `.env` / `.env.local` (server secrets: `FIREBASE_SERVICE_ACCOUNT`,
  `MONGODB_URI`; publishable `NEXT_PUBLIC_FIREBASE_*`).
- `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 PORT=3100 npm run dev` — the flag is
  NOT present in `.env.local`, so it was exported in the dev command.
- Method note: the repo's `.next` dev lock is held by another agent's dev
  server on port 3110 (PID observed; left untouched). This agent therefore
  ran the identical working tree from a copy at `/tmp/a08-repo` (env files
  included, `node_modules` cloned), serving on port 3100 as required. The
  running code is the repo at commit `34dce5b6`; no repo files were modified.
- Browser: Playwright 1.62 Chromium (real browser, real network). Learners
  signed in with real Firebase session cookies minted by
  `scripts/e2e-seed-auth.mjs` (custom token → Identity Toolkit →
  `createSessionCookie`, 868 bytes, < 4096 cap) and injected into fresh
  browser contexts (`context.addCookies`) — the cookie is httpOnly, so page
  JS cannot forge it.
- Pre-clean: leftover rows for the deterministic demo id
  `demo-orbits-001` were deleted for both learners so revision numbers start
  at 1 in this run.

### 2.2 Guest flow (signed out) — PASS

| Step | Observed |
|---|---|
| Home page, signed out | "Ask for a demonstration" section visible (flag ON) |
| Ask "Why do planets remain in orbit?" | `POST /api/demonstrations/generate` → **HTTP 200**, `outcome=spec`, `source=model` (real LLM path); summary card "Why Planets Remain in Orbit" |
| Demo id | `demo-orbits-001` (stable, content-derived; generationId `gen-orbits-001`) |
| Trust badge | `aria-label="Trust: Verified simulation"` rendered |
| Prediction | 4 options; selected one; "Submit prediction" → "Prediction locked in" |
| Change one variable | `speed` slider 1 → **1.2** (aria "Initial speed" / "Tangential speed" per model spec); then "Save observations to my trial log" → trial 2 snapshots the CHANGED parameters |
| Save to device | "Save" → status **"Saved on this device"**; localStorage blob: `savedToDevice=true`, `trials=2`, `entry1.params.speed=1.2` |
| Reload | Status **"Saved on this device"** persists; trial log shows 2 entries; entry contains `speed 1.2` → trials and the changed parameter value are intact after reload |

Evidence: `/tmp/a08-02-summary.png` … `/tmp/a08-05-after-reload.png` (run
logs in `/tmp/a08-e2e-output.log`).

### 2.3 Signed-in user A — save to account — PASS

- Injected `learner_a` session cookie → reload → `GET /api/auth/me` **200**
  (server-side cookie session active).
- "Save again" → `PUT /api/demonstrations` → **HTTP 200**, `revision=1`,
  `demonstrationId=demo-orbits-001`; UI status **"Saved to your account"**.
- Idempotent replay: re-PUT of the identical body (same `mutation_id`) →
  **HTTP 200, revision stays 1** (no duplicate row, no revision drift).

Evidence: `/tmp/a08-06-a-saved-cloud.png`.

### 2.4 Second browser, user A — cloud resume — PASS

- Fresh browser context + `learner_a` cookie, no device copy:
  `GET /api/demonstrations/demo-orbits-001` → **200, row present** → page
  restores from the account: status **"Saved to your account"**, button
  "Saved".
- Prediction gate applies to restored sessions (empty trial log) — submitted
  a prediction, then changed `g` 1 → 1.1.
- Save after the change → `PUT /api/demonstrations` **200, revision=1**.
  NOTE (honest design finding): the cloud row stores the generated SPEC only;
  the spec for a given demo id is immutable (id is derived from the
  normalized query), and the UI re-sends the same `mutation_id`
  (`demo-<generationId>`), so a control-change re-save is an IDEMPOTENT
  REPLAY by design — live control state is device-local (trial log), not part
  of the cloud row. Revision does not bump from a UI re-save.
- Reload → **"Saved to your account" persists**.

### 2.5 Revision mechanism (API level) — PASS (rev N → N+1)

The optimistic-concurrency revision path is exercised when a PUT carries a
new write (no replay conditions):

1. UI save → rev 1.
2. `PUT` with the same spec and NO `mutation_id` → **200, revision=2**.
3. `PUT` with `expected_revision=2` → **200, revision=3** (advance by exactly
   one; the atomic revision match filter is enforced).

### 2.6 User B isolation — PASS

- Fresh context + `learner_b` cookie → `GET /demos/demo-orbits-001` →
  **"No demonstration found"** (user A's row invisible; page then redirects
  home as designed).
- API: `GET /api/demonstrations/demo-orbits-001` → **200 with
  `demonstration: null`** — owner-safe (empty, no leakage; the route derives
  the owner from the verified cookie).
- Same-id own row: `PUT /api/demonstrations` with user A's spec →
  **200, revision=1, demonstrationId=demo-orbits-001** — the composite key
  `{firebaseUid, demonstrationId}` permits user B to hold their own row for
  the same demonstration id (no cross-user conflict).
- Lists: B's list = 1 row (own); A's list = 1 row (own, `allOwn=true`).

### 2.7 Deletion — PASS

- `DELETE /api/demonstrations/demo-orbits-001` as user A → **200
  `{"ok":true}`**; A's `GET` by id → `demonstration: null` (gone).
- User B: same id still present (unaffected). Cleanup: B's row deleted the
  same way.

### 2.8 Console errors

`NONE` across all contexts (console errors, page errors, failed requests;
favicon noise excluded).

---

## 3. Verdict

- Local: **LOCAL_VERIFIED** — guest save/reload, user-A account save
  (PUT 200 rev 1), second-browser cloud resume, idempotent replay, revision
  N→N+1 (API-level optimistic concurrency), user-B isolation with no
  leakage, same-id own row for user B, and owner-scoped deletion all PASS in
  a real browser against real Firebase + real Atlas, with zero console
  errors.
- Preview: **PREVIEW_BLOCKED_EXTERNAL** — two independent blockers:
  (1) SSO deployment protection redirects every anonymous request to
  `vercel.com/sso-api` (this run), and (2) per the prior audit the preview
  lambda's TLS handshake to Atlas is rejected by the Atlas access list.
  Additionally `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` is configured EMPTY in
  the preview environment (not "1"). No workarounds attempted.

## 4. UNKNOWN / limitations

- Preview: the deployment's baked flag value and lambda behavior remain
  UNVERIFIED (SSO block); no Mongo-reachability field exists on
  `/api/demonstrations/health` (provider + circuit only).
- The LLM generation is nondeterministic across runs (parameter labels vary,
  e.g. "Initial speed" vs "Orbital speed"); assertions were made
  spec-driven, and the demo id stayed stable (`demo-orbits-001`) for the
  verified query in every run.
- Deletion UI (a visible "delete" control in the demo page) was not in
  scope; deletion was verified through the implemented
  `DELETE /api/demonstrations/[id]` and `DELETE /api/demonstrations` routes.
- The dev server ran from a /tmp copy of the tree because the repo's `.next`
  dev lock is held by the other agent's server on 3110; the served code is
  identical (commit 34dce5b6).

## 5. Artifacts

- Script: `/tmp/a08-repo/a08-e2e.mjs` (deleted after closure), run log
  `/tmp/a08-e2e-output.log` (deleted after closure), results JSON
  `/tmp/a08-results.json` (deleted after closure).
- Screenshots (this run): `/tmp/a08-02-summary.png`,
  `/tmp/a08-03-demo.png`, `/tmp/a08-04-guest-saved.png`,
  `/tmp/a08-05-after-reload.png`, `/tmp/a08-06-a-saved-cloud.png`,
  `/tmp/a08-07-a-second-browser.png`, `/tmp/a08-08-b-missing.png`.
- Sanitization: no cookies, UIDs, connection strings or tokens appear in
  this document.
