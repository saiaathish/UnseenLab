# Closure — Persistence (Phase 2 Re-Verification) — 90-Readiness — Agent 90

Date: 2026-08-05 (UTC 22:57–23:20; local CDT 17:57–18:20)
Commit under test: `fcb5ad3` (HEAD at run start, verified with `git rev-parse --short HEAD`)
Scope: Re-verification of generative demonstration persistence end-to-end in a
real browser against REAL Firebase Auth + REAL MongoDB Atlas (local dev on
port 3100), plus a read-only probe of the latest Vercel preview deployment.

Honesty rules applied: no network interception, no stubs, no auth/database
bypass. Every claim below was observed in a real Chromium browser (Playwright
1.62) or in the app's own HTTP API over the wire. Cookies, UIDs and
connection strings are never printed; users are identified only by the labels
`learner_a` / `learner_b`. Demo id `demo-orbits-001` is content-derived
(public spec id), not a credential.

---

## 1. Preview probe (read-only) — BLOCKED_EXTERNAL

### 1.1 Latest deployment

`npx vercel ls` → newest deployment (15 min old, state Ready):
`https://unseen-2ryyh3f7w-sai-aathish-karthiks-projects.vercel.app`
(project `unseen-lab`, org `sai-aathish-karthiks-projects`).

### 1.2 Reachability (curl, no bypasses attempted)

| Endpoint | Observed |
|---|---|
| `GET <preview>/api/demonstrations/health` | **302** → `https://vercel.com/sso-api?url=…/api/demonstrations/health&nonce=…` |
| `GET <preview>/` (homepage) | **302** → `https://vercel.com/sso-api?url=…/&nonce=…` |
| `GET <preview>/api/demonstrations` | **302** → `https://vercel.com/sso-api?url=…/api/demonstrations&nonce=…` |

All anonymous traffic is intercepted by Vercel SSO deployment protection; the
app's HTML and lambdas are never served externally. No workaround attempted.

### 1.3 Preview environment (Vercel API, values never printed)

`GET /v9/projects/prj_IC3MNoDbUelGKhOQoSIFcPAbH589/env` (22 vars total):

| Key | Target | Presence |
|---|---|---|
| `MONGODB_URI` | preview | PRESENT (value 1284 chars; not printed) |
| `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` | preview | **= 1** (single-char value; only `0`/`1` reported here) |

Delta vs prior closure (docs/closure-persistence.md): the flag was configured
EMPTY on 2026-08-05 22:01 UTC; at this run (≈23:00 UTC) it is `1`. The env
config is therefore consistent with a flag-on build — but the deployed
build's baked flag and lambda behavior remain externally unverifiable because
of the SSO 302 (see 1.2), and per the prior audit the preview lambda's TLS
handshake to Atlas is rejected by the Atlas network access list (unchanged).
Verdict: **PREVIEW_BLOCKED_EXTERNAL**.

---

## 2. Local end-to-end re-verification (core deliverable)

### 2.1 Environment

- Real Firebase project (Auth) + real MongoDB Atlas via the repo's own
  `.env` / `.env.local`. `FIREBASE_SERVICE_ACCOUNT`, `MONGODB_URI`,
  `NEXT_PUBLIC_FIREBASE_*` all live in the local env files.
- `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` is NOT present in `.env.local`, so it
  was exported in the dev command: `PORT=3100 NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 npm run dev`.
- The repo's `.next` dev output is held by the parallel profile's dev server
  on port 3110 (untouched; this run never used 3110). This run therefore
  served the identical working tree from a copy at `/tmp/a90-repo`
  (`node_modules` copied, env files included), on port 3100. Running code =
  commit `fcb5ad3`; no repo files were modified.
- Session cookies: minted by `scripts/e2e-seed-auth.mjs`
  (`create` → users existed, profiles upserted; `token` → custom token →
  Identity Toolkit → `createSessionCookie`). Cookie `unseenlab.session`,
  868 bytes (< 4096 cap), httpOnly; injected into fresh persistent browser
  contexts (one profile dir per role: `/tmp/a90-profile-{guest,a,a2,b}`).
- Pre-clean: `generated_demonstrations` rows for `demo-orbits-001` = 0 before
  the run, so revision numbering starts at 1.
- Browser note (environment honesty): the session's shared Playwright MCP
  browser is contended by the parallel profile (its pages appeared in the
  shared tab list; the browser-use runtime is unavailable in this subagent).
  All testing was therefore isolated in dedicated headless Chromium
  instances driven from the session's Node kernel — real browser, real
  network, per-role cookie jars. Parallel activity on 3110 was never
  touched or observed beyond the tab-list incident.

### 2.2 Guest flow (signed out) — PASS

| Step | Observed |
|---|---|
| Home, signed out | "Ask for a demonstration" section visible (flag ON) |
| Ask "Why do planets remain in orbit?" | `POST /api/demonstrations/generate` → **200** in 15.2 s (dev log: `outcome: 'spec', source: 'model'` — real LLM path) |
| Summary card | "Why Planets Remain in Orbit" + "Enter demonstration" |
| Demo page | `/demos/demo-orbits-001` (stable content-derived id; generationId `gen-orbits-001`) |
| Trust badge | `aria-label="Trust: Verified simulation"` rendered |
| Prediction | 4 options; selected one; submit → "PREDICTION LOCKED IN" / "Prediction recorded — controls unlocked" |
| Change one variable | "Orbital speed" slider 1 → **1.2** |
| Trial log | "Save observations to my trial log" → trial 2 snapshots the changed parameters |
| Save to device | "Save" → status **"Saved on this device"**; localStorage key `unseenlab.demo.demo-orbits-001` |
| Reload | Status **"Saved on this device"** persists; UI "TRIAL LOG (2)"; localStorage blob: `trials` = 2 entries, `entry2.parameters.speed = 1.2` (changed parameter intact) |

Evidence: `/tmp/a90-01-guest-question.png` … `/tmp/a90-08-guest-trial-log-expanded.png`.
Test artifact (transparent disclosure): after the reload evidence was
captured, a test-side mis-click on "Save observations to my trial log"
recorded an extra trial 3 — this happened after the persistence assertion and
is not an app defect.

### 2.3 Signed-in user A — save to account — PASS

- Fresh context + `learner_a` cookie → `GET /api/auth/me` **200** (server-side
  cookie session active; row's `firebaseUid` matched learner_a, never printed).
- Save → `PUT /api/demonstrations` → **200**, `revision=1`,
  `demonstrationId=demo-orbits-001`, `lastClientMutationId=demo-gen-orbits-001`;
  UI status **"Saved to your account"**.
- `GET /api/demonstrations/demo-orbits-001` → **200** with the row
  (revision 1). (Response path is `data.demonstration`; a first read using the
  wrong path reported `null` — test-side parse error, corrected.)

Evidence: `/tmp/a90-10-a-saved-account.png`.

### 2.4 Second browser, user A — cloud resume — PASS

- Fresh context (new profile dir = "second device") + `learner_a` cookie →
  `GET /demos/demo-orbits-001` → row fetched (200) → restored status
  **"Saved to your account"** (no device copy present).
- Prediction gate applies to restored sessions; submitted a prediction, then
  changed "Orbital speed" 1 → **1.1**.
- Save after the change → `PUT /api/demonstrations` **200**, revision **stays
  1** — idempotent REPLAY by design (the UI re-sends the same `mutation_id`
  `demo-gen-orbits-001`; live control state is device/trial-local, not part of
  the cloud row). Honest finding, consistent with the prior closure.
- Reload → **"Saved to your account" persists**.

Evidence: `/tmp/a90-11-a2-restored.png`, `/tmp/a90-12-a2-changed.png`,
`/tmp/a90-13-a2-after-reload.png`.

### 2.5 Revision mechanism (API level) — PASS (rev N → N+1)

Authenticated as learner_a (second-browser context, app's own API; payload
shape is `{ demonstration: <spec> }` per the client contract):

| Call | Result |
|---|---|
| PUT without `mutation_id` | **200, revision 2** (advance by one) |
| PUT with `expected_revision=2` | **200, revision 3** (atomic revision match) |
| PUT with stale `expected_revision=1` | **409 conflict** |
| PUT with stored `mutation_id` (replay) | **200, revision stays 4** |
| PUT with new `mutation_id` | **200, revision 5** |

### 2.6 User B isolation — PASS

- Fresh context + `learner_b` cookie → `GET /demos/demo-orbits-001` →
  **"No demonstration found"** (learner_a's row invisible; no leakage).
- API `GET /api/demonstrations/demo-orbits-001` → **200,
  `demonstration: null`** — owner-safe.
- Same-id own row: PUT with the same spec → **200, revision=1,
  demonstrationId=demo-orbits-001** — composite key
  `{firebaseUid, demonstrationId}` permits B's own row.
- B DELETE attempt on the id → **200 `{"ok":true}`**; learner_a's row
  **unaffected (revision 5 still present)**. Note (expected semantics): the
  id-scoped delete is owner-scoped — it removed B's OWN row, never A's.
- B's list: 0 rows at that point (own row already removed by B's delete);
  A's list/row intact.

Evidence: `/tmp/a90-14-b-missing.png`.

### 2.7 Deletion (user A) — PASS

- B's own row recreated (rev 1) so "unaffected" is measurable.
- `DELETE /api/demonstrations/demo-orbits-001` as learner_a → **200
  `{"ok":true}`**; A's `GET` by id → `demonstration: null`; A's UI →
  **"No demonstration found"**.
- Learner_b: `GET` own row → **200, revision 1**; UI loads with
  **"Saved to your account"** — B unaffected by A's delete.
- Cleanup: B's row deleted (200); final DB state: 0 rows for
  `demo-orbits-001` (verified via Mongo driver; `totalRows: 0`).

Evidence: `/tmp/a90-15-b-unaffected.png`, `/tmp/a90-16-a-after-delete.png`.

### 2.8 Console errors

**NONE** across all four contexts (guest, learner_a, learner_a-second-device,
learner_b): no console errors, no page errors, no failed API requests. All
observed API statuses: generate 200, auth/me 200, PUT 200, GET 200, DELETE
200, 409 (intentional stale-revision test).

---

## 3. PERSISTENCE STATUS

- Preview probe: **302 SSO — BLOCKED_EXTERNAL** (health, homepage, list all
  302 → `vercel.com/sso-api`; env config: `MONGODB_URI` present, flag = 1).
- Guest save/reload: **PASS** (status + 2 trials + changed parameter intact
  after reload; localStorage blob verified).
- User A save: **PASS** (`PUT /api/demonstrations` 200, revision 1, row
  readable; UI "Saved to your account").
- Second-browser resume: **PASS** (fresh device restores "Saved to your
  account"; control change; save; reload persists).
- Revision update: **PASS** (rev N→N+1 at API level: 1→2→3 with atomic
  expected_revision; stale → 409; UI re-save is an idempotent replay by
  design — revision unchanged, reported honestly).
- User B isolation: **PASS** (no read — "No demonstration found" + API null;
  own same-id row rev 1; delete attempt did not affect A's row).
- User A delete: **PASS** (200 `{"ok":true}`, gone for A; B unaffected).
- Console errors: **NONE**.
- Verdict: **LOCAL_VERIFIED | PREVIEW_BLOCKED_EXTERNAL**.

## 4. UNKNOWN / limitations

- Preview: the deployed build's baked flag and lambda behavior remain
  UNVERIFIED (SSO blocks all external reads); lambda→Atlas reachability
  remains unverifiable externally (per prior audit: Atlas access list rejects
  the preview lambda's TLS handshake; unchanged).
- Visual note: screenshots were captured and preserved for every state
  (`/tmp/a90-01..16`, 1440×900, valid PNGs), but pixel-level inspection could
  not be performed by the executing model this session (no image input
  support); all assertions are corroborated by DOM/accessibility-tree and
  HTTP-level observations. Screenshots remain available for human/visual
  review.
- LLM generation is nondeterministic across runs (this run's spec:
  "Gravity and orbital motion", controls "Orbital speed"/"Planet mass"; prior
  run had different labels). The demo id stayed stable (`demo-orbits-001`)
  for the verified query in every run.
- UI re-save after a control change does not bump the cloud revision
  (idempotent replay by design); the N→N+1 path was verified at the API
  level with new writes.
- Deletion UI control was not in scope; deletion verified through the
  `DELETE /api/demonstrations/[id]` route (and B's same-id delete semantics
  documented).
- One extra trial (3) was recorded by a test-side mis-click after the reload
  evidence was captured (see 2.2); the persistence assertion (2 trials at
  reload) was captured before that.

## 5. Artifacts

- Screenshots: `/tmp/a90-01-guest-question.png`, `/tmp/a90-02-guest-summary-card.png`,
  `/tmp/a90-03-guest-demo.png`, `/tmp/a90-04-guest-locked.png`,
  `/tmp/a90-05-guest-speed-1-2.png`, `/tmp/a90-06-guest-saved-device.png`,
  `/tmp/a90-07-guest-after-reload.png`, `/tmp/a90-08-guest-trial-log-expanded.png`,
  `/tmp/a90-10-a-saved-account.png`, `/tmp/a90-11-a2-restored.png`,
  `/tmp/a90-12-a2-changed.png`, `/tmp/a90-13-a2-after-reload.png`,
  `/tmp/a90-14-b-missing.png`, `/tmp/a90-15-b-unaffected.png`,
  `/tmp/a90-16-a-after-delete.png`.
- Scratch deleted after closure: `/tmp/a90-repo` (env-bearing tree copy),
  `/tmp/a90-cookies.json` (session cookies), `/tmp/a90-mint.mjs`,
  `/tmp/a90-clean.mjs`, `/tmp/a90-dev.log`, browser profile dirs.
- Sanitization: no cookies, UIDs, connection strings or tokens appear in
  this document.
