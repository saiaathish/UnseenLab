# UNSEENLAB Phase 1–2 Closure — Browser & End-to-End QA Report (Phase 1D: Deployed Persistence)

- Date: 2026-08-05 (run 2026-08-06 01:45–02:06 UTC)
- Worktree: /Users/saiaathishkarthik/Desktop/UnseenLab-worktrees/generative-trust-controls
- Operator profile: browser-e2e-engineer
- Baseline commit: `0d889572f0c8d5c47545f6e6b041df3ec52460f7` (0d88957) — PR #9 head, `feature/generative-demonstration-engine`
- Changes made to systems: NONE (read-only preview probes; local dev server only). No `git add/commit/push`. No secrets printed; learner identifiers sanitized as `learner_a` / `learner_b`.
- File created: this report (docs/phase12-persistence.md) — the only write performed.

---

## 1. Preview probe (read-only, anonymous)

### 1.1 Newest preview deployment

- URL: `https://unseen-4atjonom5-sai-aathish-karthiks-projects.vercel.app` (newest row of `npx vercel ls`)
- Deployment ID: `dpl_HeWDd4Tg2Czo1xrM65Buyvumhn2u` (via `npx vercel inspect`)
- Status: Ready; Environment: preview; built 2026-08-05 20:18 local
- Git SHA (Vercel API `meta.githubCommitSha`, token used in-process, never printed): `0d889572f0c8d5c47545f6e6b041df3ec52460f7` = `0d88957` — matches current `feature/generative-demonstration-engine` head and this worktree's HEAD
- Alias: `unseen-lab-git-feature-gen-15e842-sai-aathish-karthiks-projects.vercel.app`

### 1.2 Probe A — anonymous curl (no redirects followed)

```
GET https://unseen-4atjonom5-sai-aathish-karthiks-projects.vercel.app/api/demonstrations/health
→ HTTP 302, 0.42s
location: https://vercel.com/sso-api?url=https%3A%2F%2Funseen-4atjonom5-...vercel.app%2Fapi%2Fdemonstrations%2Fhealth&nonce=...
```

### 1.3 Probe B — worktree no-auth node fetch (same mechanism as `scripts/backend-integration.mjs`: plain `fetch`, `redirect: "manual"`, no auth header)

```
STATUS: 302
LOCATION: https://vercel.com/sso-api?url=https%3A%2F%2Funseen-4atjonom5-... (vercel.com SSO)
BODY_PREVIEW: "Redirecting...\n"
```

### 1.4 Conclusion

The deployed preview redirects ALL anonymous traffic (page and API) to Vercel SSO (`vercel.com/sso-api`). The deployed preview CANNOT be exercised anonymously → **PHASE 1D BLOCKED at the SSO boundary**. This matches the known state and `docs/phase12-infra.md` §1C.1 (302 confirmed, `ssoProtection` PRESENT, `protectionBypass` ABSENT). The preview itself built successfully (Ready, 49s) — the block is access policy, not a build failure.

---

## 2. Human unblock path (exact steps)

Order matters: **1A → 1B → 1C → 1D**. All steps are human/console actions; no automated path exists from this machine (verified in `docs/phase12-infra.md`).

### (a) Atlas console — database user downgrade (Phase 1A), then network (Phase 1B)

1. Sign in at https://cloud.mongodb.com (project `unseenlab`, cluster `unseenlab.6x9xp68.mongodb.net`).
2. **Role first**: Security → Database Access → modify `saiaathish_db_user` → REMOVE `atlasAdmin` (on `admin`) → ADD exactly `readWrite` on `unseenlab` ONLY (no other roles/databases).
3. Verify roles: node + mongodb driver, `db.admin().command({ connectionStatus: 1 })` — expected `[{"role":"readWrite","db":"unseenlab"}]`.
4. Verify contract: `npx vitest run tests/demonstrations/backend/database-security-contract.test.ts` — expected 3/3.
5. **Only after step 4 passes** — Network Access → Add IP Address. Preferred: fixed egress IP of the Vercel preview (if stable) or Vercel–Atlas integration/PrivateLink (verify availability in console). LAST RESORT, temporary only: `0.0.0.0/0` with comment exactly `UNSEENLAB TEMP PREVIEW ACCESS - REMOVE AFTER SUBMISSION`, removal deadline 2026-08-09.
6. Never open 0.0.0.0/0 before step 4 passes; rollback via the same console (restore `atlasAdmin@admin`, re-run contract test).

### (b) Vercel — authenticated session or preview-only protection adjustment (Phase 1C)

The standard path for a judge/grader session is an **authenticated Vercel browser session** (SSO login). Alternative: a **preview-only protection adjustment** in the Vercel console (human-only; no API/CLI automation). Do NOT create a protection-bypass secret token; do NOT touch production protection.

### (c) Then run the FULL Phase 1D flow (section 3) against the deployed preview.

---

## 3. Full Phase 1D deployed-flow script (to run AFTER the unblock; not runnable now)

Four fresh browser contexts + cleanup. Every request's status code, page screenshots, console errors, and UTC timestamps must be captured; identifiers kept sanitized (`learner_a`, `learner_b`).

### 3.1 Guest (fresh context, no sign-in)

1. Homepage → ask "Why do planets remain in orbit?" → Generate demonstration.
   - Expected: "Your demonstration is ready" → "Why Planets Remain in Orbit" (trust badge Verified simulation, controls: Initial speed / Gravity strength / Play-Pause / Reset).
2. Enter demonstration → submit a prediction radio.
   - Expected: "Prediction recorded — controls unlocked." Sliders enabled. Trial log (1).
3. Modify one control (e.g. Initial speed 1.0 → 1.2 via keyboard arrows on the focused slider).
4. Check an observation, add a note, "Save observations to my trial log" → Trial log (2).
5. Save device → "Saved on this device" (button becomes "Save again").
6. Reload → expected: "Saved on this device" persists; Trial log (2) with parameters incl. the modified speed (e.g. `speed 1.2`); "Restore these parameters" re-applies the values to the controls.
   - Note: the live session (prediction/checkboxes/notes) starts fresh after reload; persistence is via the saved record + trial log + restore action. This matches local behavior (section 4) and is the verified device-save contract.

### 3.2 User A (sign-in context)

1. Sign in as `learner_a` → save the account → PUT `/api/cloud/sessions` → expected 2xx; sanitized session ID (never printed raw); revision 1.
2. Reload → same state (status/trials/parameters).

### 3.3 Second browser (fresh context, User A's ID)

1. Open A's saved ID → cloud restore → same trust/spec and parameters.
2. Modify a control → save with `expected_revision` → revision increments exactly once (1 → 2); reload → still 2 (idempotent re-send of the same `mutation_id` must NOT bump revision).

### 3.4 User B (fresh context, signed in as `learner_b`)

1. Read A's ID → no leak (rejected/404; never returns A's data to B).
2. Overwrite attempt on A's ID → rejected (409 conflict or separate row; A's revision unchanged).
3. Delete → A's row unchanged.

### 3.5 User A cleanup

1. Delete own session → confirmed; User B's data unaffected.

---

## 4. Local fallback smoke re-run (guest only) — executed, PASS

Because the deployed preview is SSO-blocked, the fallback evidence is a local re-run against the exact committed baseline that the preview deployed: main repo clean tree at `0d88957` (byte-identical build input; the preview built from this SHA).

- **Worktree note**: the worktree's working tree is currently mid-edit by in-flight Phase 2B writers (untracked `src/demonstrations/generation/controls/materialize.ts` imports `./catalog`, which does not exist yet → `Module not found: Can't resolve './catalog'` breaks `pipeline.ts`/`/api/demonstrations/generate`). That is uncommitted in-flight work, NOT part of the committed baseline; the deployed preview (built from 0d88957) is unaffected. The local re-run therefore used the clean main-repo tree at the same SHA (0d88957) — the faithful baseline.
- Environment: `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1`, dev server port 3105 (`npx next dev -p 3105`), real Firebase + Atlas env (same as the verified prior runs). Avoided 3100/3110.
- Browser: Playwright MCP; guest context only.

### 4.1 Steps, results, timestamps (UTC)

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Ask "Why do planets remain in orbit?" → Generate demonstration | PASS — "Your demonstration is ready", demo "Why Planets Remain in Orbit", controls Initial speed / Gravity strength / Play-Pause / Reset | DOM snapshot 02:02:14–22Z; screenshot `phase12d-tp1a-home-generative.png` |
| 2 | Enter demonstration → submit prediction | PASS — "Prediction recorded — controls unlocked."; sliders enabled; Trial log (1) | DOM snapshot 02:02:40Z |
| 3 | Modify control: Initial speed 1.0 → 1.2 (keyboard) | PASS — slider `aria-valuenow` 1 → 1.2, `aria-valuetext "1.2 m/s"` | DOM/attr read 02:03:05Z |
| 4 | Observation + note → save to trial log | PASS — "Observations recorded to your trial log."; Trial log (2) | DOM snapshot 02:03:19Z |
| 5 | Save device | PASS — "Saved on this device"; button → "Save again" | DOM snapshot 02:03:33Z |
| 6 | Reload | PASS — "Saved on this device" persists; Trial log (2): Entry 1 Prediction ("The orbit becomes more elliptical and may escape.", `Parameters: g 1, speed 1, bodyMass 1, eccentricity 0, distance 5`) and Entry 2 Observation (`Parameters: g 1, speed 1.2, ...`, readouts `Period 44.5 s; Speed 4.0; Distance 46`); "Restore these parameters" re-applies speed 1.2 to the slider | DOM snapshots 02:04:36–02:05:13Z |

### 4.2 Network and console evidence

- Dev-server log: `POST /api/demonstrations/generate 200` (14.6s), `GET /api/auth/me 200` ×3. No 4xx/5xx.
- Browser console: 0 errors in the baseline run (the only errors seen — `Module not found ./catalog`, `ERR_EMPTY_RESPONSE`, `ERR_CONNECTION_REFUSED /api/demonstrations/generate` — belonged to the earlier, broken worktree dev server session on the same port, before the baseline server was started; they are not part of this run).
- Screenshot limitation (recorded honestly): pages with the live WebGL stage could not be captured by this runtime (screenshot compositor times out while the canvas animates; homepage screenshot succeeded). All page states are evidenced by DOM snapshots at each step; the one visual screenshot is saved at `/Users/saiaathishkarthik/Desktop/UnseenLab/.playwright-mcp/phase12d/phase12d-tp1a-home-generative.png` (gitignored evidence dir).

### 4.3 Result

**LOCAL GUEST SMOKE: PASS** — ask → generated demo → prediction → control change → observation → save → reload → status/trials/parameters persist and restore.

---

## 5. PHASE 1D STATUS

- Preview probe: **302 SSO — BLOCKED at the boundary** (both anonymous probes; vercel.com/sso-api; matches `docs/phase12-infra.md` 1C.1)
- Local guest smoke: **PASS** (baseline 0d88957, port 3105, real Firebase+Atlas env; details in §4)
- Deployed flow: **BLOCKED** (requires human SSO/Atlas unblock — exact steps in §2; full flow script in §3)
- PHASE_1_RESULT: **BLOCKED**
- UNKNOWN: see §6

---

## 6. UNKNOWN

1. `ssoProtection.deploymentType` value (standard vs preview-only) — not inspected per the field-names-only policy in `docs/phase12-infra.md`; immaterial to the 302 outcome.
2. Whether the preview environment carries `MONGODB_URI`/`FIREBASE_SERVICE_ACCOUNT` and whether Atlas would accept Vercel preview egress after 1B — unverifiable until the SSO/Atlas unblock.
3. Whether `GET /api/demonstrations/health` on the preview returns `provider: ok`/`offline`/`unavailable` (LLM_API_KEY presence in preview env) — cannot be probed past SSO.
4. Whether the human will run the deployed flow via an authenticated Vercel session or a preview-only protection adjustment (operator decision).
5. When the in-flight Phase 2B worktree edits (controls/catalog) land, the worktree tree will become runnable locally; until then the local fallback baseline is the clean `0d88957` tree (identical to the preview build input).
6. Whether the judge/grader session will re-verify the deployed flow after the unblock, and whether the 0.0.0.0/0 removal deadline (2026-08-09) applies.
