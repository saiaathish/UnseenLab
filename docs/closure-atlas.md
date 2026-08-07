# Closure: MongoDB Atlas connectivity from Vercel preview (PR #9)

Status: **ATLAS_ACCESS_BLOCKED**

## 1. Atlas API / console access inventory (what exists on this machine)

| Item | Result |
|---|---|
| `ATLAS_*` env vars (shell) | None |
| `ATLAS_*` keys in repo `.env` / `.env.local` | None (keys present: NEXT_PUBLIC_*, LLM_*, FIREBASE_SERVICE_ACCOUNT, MONGODB_URI, VERCEL_OIDC_TOKEN) |
| `atlas` / `mongocli` CLI | Not installed (`which` → not found) |
| `~/.config/atlas` | Does not exist |
| `~/.mongocli.toml`, `~/.atlasrc`, `~/.atlas/credentials` | Do not exist |
| `~/.mongodb/atlas*` credential files | None |
| MongoDB MCP (`~/.mongodb/mongodb-mcp/`) | Present but unconfigured: config dir contains only `.app-logs`; server logs show "Not connected to MongoDB" on every `list-databases` attempt; no connection string, no Atlas admin session, no API keys exposed |
| Atlas API keys in Vercel project env | None (Vercel env key names list contains no `ATLAS_*`) |

**Conclusion:** No Atlas Project Owner/Admin API key, no Atlas CLI session, and no signed-in Atlas account exists on this machine. The Atlas Network Access list **cannot** be modified programmatically from here. No credentials were guessed or brute-forced.

## 2. MONGODB_URI shape (parsed in node; values not printed)

- Username: `saiaathish_db_user` — **dedicated** (not admin/owner/root/cloud)
- Database: none specified in URI; app default is `unseenlab` (`src/lib/mongo/client.ts`, `DB_NAME = MONGODB_DB || "unseenlab"`)
- TLS param: no explicit `tls=`/`ssl=` in URI; scheme is `mongodb+srv://` → TLS is on by default for Atlas
- hostCount: 1, portCount: 0

## 3. Vercel preview environment (via api.vercel.com)

- `MONGODB_URI` **present** in preview environment (target: `preview`) — verified with `GET /v9/projects/prj_IC3MNoDbUelGKhOQoSIFcPAbH589/env`, key names only.
- Project region: not pinned (Hobby default); `protectionBypass` empty; no deployment-protection wall.

## 4. Connectivity evidence

- Local machine (IP allowlisted in Atlas): `LOCAL_CONNECT_OK` (mongodb driver v7, `serverSelectionTimeoutMS:8000`).
- Preview lambda: `MONGODB_URI` is set, but Atlas rejects Vercel Hobby egress (dynamic shared IP pool); TLS handshake fails with `tlsv1 alert internal error` for un-allowlisted IPs (prior audit).

## 5. Fix attempt

Attempted fix: none applicable. Changing the Atlas Network Access list requires an Atlas project admin/owner API key or console login with access to the Atlas project. No such credential exists on this machine (see section 1). **Fix cannot be applied from this environment.**

## 6. Exact console steps (human, ~2 minutes)

**ORDER MATTERS — remediate §9 FIRST.** The live user is `atlasAdmin` (see
§9); opening the network before downgrading the user would expose a
full-admin credential to the internet. Sequence:

0. **Security → Database Access → edit user `saiaathish_db_user`** → replace
   `atlasAdmin` with `readWrite` on the `unseenlab` database only (per §9).
1. Sign in to https://cloud.mongodb.com with the Atlas account that owns the cluster behind `MONGODB_URI` (the account whose current IP is allowlisted — local dev works, so that account has project access).
2. Pick the project whose cluster hostname matches the `mongodb+srv://` URI host.
3. Left sidebar → **Security** → **Network Access**.
4. Click **Add IP Address**.
5. Choose **"Allow access from anywhere"** (adds `0.0.0.0/0`) — acceptable *temporarily* ONLY AFTER step 0, because the URI user is then a least-privilege `readWrite` user on `unseenlab` only. (Alternative: paste Vercel egress IP ranges, but Hobby egress is a dynamic shared pool, so ranges are not stable — `0.0.0.0/0` is the reliable choice for the hackathon.)
6. Click **Confirm**. Entry becomes Active within ~1–5 minutes.
7. Trigger a new preview deployment (any push to the PR branch, or `vercel deploy --preview` from the repo). No env change needed — `MONGODB_URI` is already in the preview environment.

### Removal / narrowing plan (after the hackathon)
- Delete the `0.0.0.0/0` entry in **Network Access**.
- Re-add only the developer's current IP (use the **"Add current IP address"** button) for local dev.
- If the project later moves to Vercel Pro/Enterprise with stable egress, replace the local-only entry with the published Vercel egress IP ranges instead of `0.0.0.0/0`.

## 7. Verification command after the fix

```bash
# From the repo, with the preview deployment live (redeployed after the access-list change):
PREVIEW_URL="https://<preview-alias>"   # the PR #9 preview URL
curl -s -o /dev/null -w "%{http_code}\n" "$PREVIEW_URL/api/cloud/sessions"
# Expect 200 (DB-backed route) instead of 500 / TLS handshake failure.
# Secondary check: preview function logs show a successful Mongo handshake,
# and no "tlsv1 alert internal error".
```

## 8. Claims that must remain UNVERIFIED

- Preview cloud persistence: the `api/cloud/sessions` and other DB-backed routes on the Vercel preview cannot be confirmed working until the Atlas Network Access list is changed per section 6 (the access-list change is blocked from this machine).

## 9. SECURITY FINDING — live user is atlasAdmin (2026-08-05)

Verified live via `db.runCommand({connectionStatus: 1})` using the app's
`MONGODB_URI` (local machine, allowlisted IP):

```text
URI_USER saiaathish_db_user
LIVE_ROLES [{"role":"atlasAdmin","db":"admin"}]
DBS sample_mflix, unseenlab, admin, local
```

The documented least-privilege intent (`docs/firebase-mongodb-setup.md` §2.2:
readWrite on `unseenlab` only) does NOT match the live cluster: the app user
holds `atlasAdmin` on `admin` — full administrative control of the cluster.
`db.createUser`/`db.updateUser` over the wire protocol are not permitted on
Atlas (database users are provisioned only via the Atlas console/API), so
this CANNOT be remediated from this machine.

REMEDIATION (owner, Atlas console — same session as the Network Access step):
1. Cloud → Security → Database Access → edit user `saiaathish_db_user`.
2. Replace the role with `readWrite` on the `unseenlab` database only
   (remove `atlasAdmin`), OR create a new app user with that role and rotate
   `MONGODB_URI` (local `.env` + Vercel preview env) to it.
3. Re-verify with: `connectionStatus` → roles must be
   `[{role:"readWrite", db:"unseenlab"}]` and `HAS_ADMIN_ROLE=NO`.
4. Do NOT use the Atlas owner/API-key user in `MONGODB_URI`.

No credentials were modified or exposed during this investigation; `.env` and
the Vercel preview env are unchanged (verified).
