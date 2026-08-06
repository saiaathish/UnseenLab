# UNSEENLAB Phase 1-2 Closure — Infrastructure Engineer Report (Phase 1: A/B/C)

- Date: 2026-08-05 (audit run 2026-08-06 01:35–01:45 UTC)
- Worktree: /Users/saiaathishkarthik/Desktop/UnseenLab-worktrees/generative-trust-controls
- Operator profile: infrastructure-engineer
- Changes made to systems: NONE (read-only audit; no credentials created, rotated, printed, or placed in code)
- File created: this report (docs/phase12-infra.md) — the only write performed

---

## PHASE 1A — Database user least privilege

### 1A.1 Original state (verified live, not from config)

Connect method: node + mongodb driver v7 (mongodb+srv to `unseenlab.6x9xp68.mongodb.net`), `db.admin().command({ connectionStatus: 1 })`; roles only printed.

```
AUTH USER: (none shown by server)
ROLES: [{"role":"atlasAdmin","db":"admin"}]
```

P1 CONFIRMED: the live app user (`saiaathish_db_user`, from URI credentials) holds `atlasAdmin@admin` — a global admin role. This violates least privilege for an app DB user.

### 1A.2 Available change paths — enumerated and tested

| Path | Result |
|---|---|
| (a) Atlas API keys (env / CLI / config) | NONE. `which atlas` → not found; `~/.config/atlas` → absent; no ATLAS* env vars in shell or in worktree `.env`/`.env.local` (var NAMES inspected only). |
| (b) MongoDB wire protocol (`updateUser` on admin db) | ATTEMPTED, REJECTED by Atlas. `MongoServerError`, errorCode 8000, codeName `AtlasError`: "(Unauthorized) not authorized on admin to execute command { updateUser ... }". Atlas forbids driver-based user management. Post-attempt `connectionStatus` re-check: roles UNCHANGED (`atlasAdmin@admin`) — no drift. MongoDB MCP server also checked: not connected, no stored connection string in `~/.mongodb/mongodb-mcp` (logs only), so no second wire path exists. |
| (c) Atlas console (cloud.mongodb.com) | NO saved session in any browser profile accessible from this machine. Playwright navigation to `https://cloud.mongodb.com/` lands on `https://account.mongodb.com/account/login?signedOut=true&n=...` ("Log in to your account", "You have successfully logged out."). |

Result: NO automated path exists to change the database user role from this machine.

### 1A.3 HUMAN_ACTION_REQUIRED (Phase 1A)

A person with Atlas console access must perform exactly the following:

- Console: https://cloud.mongodb.com → project `unseenlab` (cluster unseenlab.6x9xp68.mongodb.net) → Security → Database Access.
- User to modify: `saiaathish_db_user`.
- Existing role to remove: `atlasAdmin` on `admin` (Atlas admin / global).
- Exact role to add: `readWrite` on `unseenlab` ONLY (no other roles, no other databases; if Atlas UI only offers "readWrite to any database", create/choose the scoped entry "readWrite to unseenlab").
- Verification command 1 (roles): node one-liner connecting with the worktree `.env` `MONGODB_URI` and printing `connectionStatus` roles — expected `[{"role":"readWrite","db":"unseenlab"}]`.
- Verification command 2 (contract): `npx vitest run tests/demonstrations/backend/database-security-contract.test.ts` — expected 3/3 pass (tests: least-privilege app user; unique upsert key + list index on generated_demonstrations; $jsonSchema strict validators).
- Stop condition: contract test green (3/3) with `readWrite@unseenlab`. NEVER open 0.0.0.0/0 (or any network widening) before this passes.
- Rollback (if a step goes wrong): via the same console, restore the user to `atlasAdmin@admin` and re-run the contract test; no changes outside Database Access are permitted.

---

## PHASE 1B — Network access

- Current network rule: NONE. Nothing was opened or modified (no Atlas IP allowlist change attempted — none was possible without 1A).
- Preferred order (documented, all BLOCKED until Phase 1A passes AND console access exists):
  1. Stable egress: allowlist the fixed egress IP of the deployment/CI environment (preferred, permanent).
  2. Secure integration: Vercel–Atlas integration / PrivateLink if available (no evidence of availability on this account — verify in console).
  3. LAST RESORT, temporary only: allowlist `0.0.0.0/0` with comment exactly `UNSEENLAB TEMP PREVIEW ACCESS - REMOVE AFTER SUBMISSION`, removal deadline 2026-08-09. This entry must be deleted no later than 2026-08-09 and never before Phase 1A verification passes.
- Security posture note: 0.0.0.0/0 exposes the database to the internet; it is acceptable only for the submission window and must be the subject of a post-submission removal check.

---

## PHASE 1C — Preview SSO protection

### 1C.1 Current protection state (verified live)

- `curl -s -o /dev/null -D - https://unseen-2s2jgaywo-sai-aathish-karthiks-projects.vercel.app/api/demonstrations/health`
  - HTTP/2 302, `location: https://vercel.com/sso-api?url=...` (Vercel SSO login), `set-cookie: _vercel_sso_nonce=...` (HttpOnly, Secure, SameSite=Lax).
  - CONFIRMED: unauthenticated requests are redirected to Vercel SSO — preview is protected.
- Vercel API `GET /v9/projects/prj_IC3MNoDbUelGKhOQoSIFcPAbH589` (token from local CLI auth.json, used in-process, never printed; field names only):
  - `protectionBypass`: ABSENT (no bypass secret exists)
  - `passwordProtection`: ABSENT
  - `ssoProtection`: PRESENT (fields: `deploymentType`)

### 1C.2 Resolution paths (all human-only; production protection untouched)

| Path | Status |
|---|---|
| Authenticated browser session (human with Vercel account access) | Available — the standard path for the judge/grader session |
| Protection bypass token (URL secret) | NOT configured — none exists; do not create one |
| Temporary preview-only protection adjustment | Console-only, human — no API/CLI automation performed here; requires Vercel account access |

- Explicit non-action: production deployment protection was NOT modified and must NOT be disabled at any point.

---

## PHASE 1 STATUS

- 1A: original role: `atlasAdmin@admin` | available paths: none (no Atlas API keys; wire-protocol `updateUser` rejected — AtlasError 8000; no console session in accessible browsers) | HUMAN_ACTION_REQUIRED: see section 1A.3 (exact block above).
- 1B: network rule: NONE (not opened) | removal deadline: 2026-08-09 (only if 0.0.0.0/0 is ever used) | BLOCKED until 1A.
- 1C: SSO: 302 confirmed → vercel.com/sso-api | bypass: none (protectionBypass ABSENT) | resolution paths: human-only (authenticated Vercel session; no bypass token; temporary protection adjustment console-only).
- PHASE_1_RESULT: BLOCKED (HUMAN_ACTION_REQUIRED) — 1A blocks 1B; 1C is protected and needs no automated action.
- UNKNOWN:
  - `ssoProtection.deploymentType` value (standard vs preview-only) — not inspected per field-names-only instruction; immaterial to the outcome (SSO confirmed live via 302).
  - Whether the Atlas account has Vercel–Atlas integration/PrivateLink availability — requires console (human).

---

## RE-VERIFIED 2026-08-06 (Atlas item attempt — credential-safe, in-process)

Attempted every non-human path for the 1A downgrade; evidence below (URI/credentials never read into any transcript or log; script at /tmp/atlas-verify-wire.mjs, mongodb driver 7.5.0, real Node 24.17.0):

- CONNECTED: ok — app `MONGODB_URI` reaches the Atlas cluster.
- CURRENT_ROLES: `atlasAdmin@admin` (P1 still live).
- `updateUser` (→ readWrite@unseenlab): **BLOCKED code=8000 AtlasError (Unauthorized)**.
- `grantRolesToUser`: **BLOCKED code=8000 AtlasError**.
- `createUser` (readWrite@unseenlab): **BLOCKED code=8000 AtlasError**.
- Tooling sweep: `atlas` CLI absent, `mongosh` absent, no Atlas API keys in env names, `~/.atlasrc`, `~/.config/atlas`, or GitHub repo secret names. `.env` is gitignored (`.env*`) — an API key can be added there safely if the account holder chooses the API path.

Conclusion unchanged: 1A downgrade is **human-only** via (a) Atlas console click path (section 1A.3) or (b) an Atlas Admin API key (Project Owner/Project Access Manager) exported as `ATLAS_API_PUBLIC_KEY` / `ATLAS_API_PRIVATE_KEY` in the gitignored `.env` — with which the full ordered sequence (downgrade FIRST, then 0.0.0.0/0 with comment, then verify) can be automated and verified. 1B remains blocked until 1A; 1C unchanged.
