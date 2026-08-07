# closure-90-infra.md — UNSEENLAB ONE-SHOT 90-READINESS, Phase 1 SECURITY FIRST

Date: 2026-08-05
Role: infrastructure-engineer
Scope: Atlas user privilege downgrade, preview SSO verification, network rule hygiene.
Status: EXTERNAL BLOCKED — human console steps required in the mandated order below.
No git operations were performed. No credentials are printed in this document.

## INFRA STATUS

- Console/API auth available: NO
  - Evidence: no `~/.config/atlas`; `atlas` CLI not installed (`which atlas` → not found);
    `mongosh` not installed; no shell/env var names matching ATLAS (names-only scan of
    `env` returned nothing); MongoDB MCP logs (`~/.mongodb/mongodb-mcp/.app-logs/*`) show
    server v1.14.0 starts with Atlas Local tools disabled ("Cannot connect to Docker") and
    one `Error executing list-databases: Error: Not connected to MongoDB` — no established
    admin/API session anywhere on this machine. The only credential present is the app-level
    `MONGODB_URI` in `.env` (database access, not console/API admin).
- Live roles: `atlasAdmin@admin` — P1 (via `connectionStatus` over the wire; value not printed)
- Preview SSO: 302 confirmed | bypass: none
  - `GET https://unseen-e0x9vacjv-sai-aathish-karthiks-projects.vercel.app/api/demonstrations/health`
    → 302 `https://vercel.com/sso-api?url=...` → 200 at `https://vercel.com/login`.
  - Vercel API `GET /v9/projects/prj_IC3MNoDbUelGKhOQoSIFcPAbH589` field presence only:
    `ssoProtection: present ["deploymentType"]` (enabled), `protectionBypass: none`,
    `passwordProtection: none`.
- 0.0.0.0/0 used: NO (not added by this session; Atlas network allowlist state itself is
  unverifiable without Atlas console/API auth) | Removal deadline: N/A (planned rule gets
  deadline 2026-08-09 — see step 3)
- Human steps (mandated order): see below.
- BLOCKED_EXTERNAL: YES — wire-protocol user management is forbidden by Atlas:
  `createUser` → code 8000 / AtlasError "(Unauthorized) not authorized on admin to execute
  command { createUser ... }"; `updateUser` → code 8000 / AtlasError. One attempt each was
  made with a throwaway user name; nothing was created or modified.
- Claims that remain UNVERIFIED: deployed persistence (requires an SSO-authenticated browser
  session against the preview plus Atlas console read access — neither available to an
  unauthenticated agent).

## WHY AUTOMATED DOWNGRADE IS IMPOSSIBLE (BLOCKED_EXTERNAL)

Atlas does not permit `createUser`/`updateUser` from MongoDB drivers; role management is
console/API-only. Both attempts returned code 8000 (AtlasError). Therefore the privilege
downgrade cannot be completed by any script on this machine — a human with Atlas console
access must execute the steps below, IN ORDER. Do not reorder.

## HUMAN STEPS (MANDATED ORDER)

Preconditions: an Atlas console session with Project Owner access, and a terminal with the
project checked out at `/Users/saiaathishkarthik/Desktop/UnseenLab`. NEVER print
`MONGODB_URI` or any token. NEVER run `git add` / `git commit` / `git push`.

### STEP 1 — Downgrade saiaathish_db_user (atlasAdmin → readWrite on unseenlab only)

1. Atlas console → project → Database Access → find `saiaathish_db_user` → Edit.
2. Remove `atlasAdmin` (and any `readWriteAnyDatabase` / cluster roles).
3. Add exactly one role: `readWrite` on database `unseenlab` only. Save.
4. Verify (roles only, URI never printed):

   `cd /Users/saiaathishkarthik/Desktop/UnseenLab && node -e "const fs=require('fs');const{MongoClient}=require('mongodb');const u=fs.readFileSync('.env','utf8').match(/^MONGODB_URI\s*=\s*(.+)$/m)[1].trim().replace(/^['\"]|['\"]$/g,'');(async()=>{const c=new MongoClient(u);await c.connect();const s=await c.db('admin').command({connectionStatus:1});console.log((s.authInfo?.authenticatedUserRoles??[]).map(r=>r.role+'@'+r.db).join('\n'));await c.close()})()"`

   EXPECTED OUTPUT: exactly `readWrite@unseenlab`. Any `atlasAdmin@admin` line means the
   change did not take effect — stop and redo Step 1. Do NOT proceed to Step 3 while
   atlasAdmin is still live.

### STEP 2 — Only if a NEW user was created instead (e.g., you chose "Create New" by accident)

If the downgrade was done by creating a new user rather than editing the existing one:
1. Rotate the credential: generate a new password, create/update the user in Atlas
   Database Access (readWrite on `unseenlab` only), then replace `MONGODB_URI` in the
   project `.env` and in Vercel preview env vars (never commit it):
   `vercel env add MONGODB_URI preview`
2. Verify both targets use the rotated URI (names/state only, values never printed):
   `vercel env ls preview` → confirm `MONGODB_URI` is present (and was updated);
   re-run the Step 1 node command → expect `readWrite@unseenlab` only.

### STEP 3 — Network Access: add 0.0.0.0/0 (ONLY AFTER Step 1 verifies clean)

NEVER before Step 1. This rule is required only if the preview runtime cannot reach Atlas
through the current allowlist during the readiness window.
1. Atlas console → Network Access → Add IP Address → `0.0.0.0/0` → comment
   `UNSEENLAB 90-readiness TEMP - remove by 2026-08-09` → confirm.
2. Record the exact start time (UTC) here when done: start time: _______________
3. REMOVAL DEADLINE: 2026-08-09 (hard). Mark the calendar.
4. Verify: Atlas console Network Access list shows the `0.0.0.0/0` entry as ACTIVE, and
   the Step 1 connection test still returns `readWrite@unseenlab`.

### STEP 4 — Redeploy the preview

1. Trigger a deployment (push to the preview branch or):
   `cd /Users/saiaathishkarthik/Desktop/UnseenLab && vercel deploy --preview`
2. Verify the deployment is live and still SSO-protected:
   `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://<preview-url>/api/demonstrations/health`
   EXPECTED: `302 https://vercel.com/sso-api?...` (SSO must still be on — it was confirmed
   on the current deployment).

### STEP 5 — Verify deployed persistence (the unverified claim)

Requires an SSO-authenticated browser session (owner login):
1. Open the preview URL in the logged-in browser, trigger one demonstration flow that
   writes to `unseenlab` (create/update an entity).
2. Verify the write landed: Atlas console → Browse Collections → `unseenlab` database →
   confirm the new/updated document, and/or read it back via the app UI.
3. Function-side confirmation (optional):
   `cd /Users/saiaathishkarthik/Desktop/UnseenLab && vercel logs <preview-deployment-url>`
   → look for successful DB write/read log lines with no `MongoServerError` / 13 / 8000.

### STEP 6 — Remove / narrow the 0.0.0.0/0 rule (BY 2026-08-09, sooner if readiness done)

1. Atlas console → Network Access → delete the `0.0.0.0/0` entry (or replace with the
   narrowest rule that still passes: e.g., the preview provider's egress IP range if
   known, or per-IP entries).
2. Verify: Network Access list shows NO `0.0.0.0/0` entry; re-run the Step 1 node command
   → still `readWrite@unseenlab`; re-run Step 4 curl → still 302 to SSO.
3. Record the rule removal time here when done: removed at: _______________

## CHANGE LOG / OBSERVATIONS

- 2026-08-05: inventory — no Atlas CLI, no mongosh, no ATLAS env names, MCP not connected.
- 2026-08-05: connectionStatus over the wire → live role `atlasAdmin@admin` (P1).
- 2026-08-05: createUser + updateUser attempted once each via wire protocol → code 8000
  AtlasError both times; nothing created/modified. BLOCKED_EXTERNAL confirmed.
- 2026-08-05: preview health endpoint → 302 → vercel.com/login (SSO active; no bypass, no
  password protection per Vercel API).
- 2026-08-05: no 0.0.0.0/0 rule was added by this session; removal deadline N/A until Step 3.

## EXTERNAL BLOCKER

Atlas user/role management is console/API-only (drivers return code 8000 AtlasError).
All console steps above must be executed by a human with Atlas Project Owner access.
Deployed-persistence verification additionally requires an SSO-authenticated browser
session. Rollback: if any step regresses connectivity, revert the last change (delete the
0.0.0.0/0 entry immediately; restore the prior MONGODB_URI only if Step 2 was in progress).
