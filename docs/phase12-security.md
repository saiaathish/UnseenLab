# PHASE 1-2 CLOSURE - Database Security Engineer Report

- Date: 2026-08-05
- Worktree: `/Users/saiaathishkarthik/Desktop/UnseenLab-worktrees/generative-trust-controls`
- Branch: `fix/generative-trust-controls`
- Scope: least-privilege verification, security contract suite, isolation/injection re-verification, live schema state, secret hygiene
- Credentials: none recorded in this file or any worktree file.

## SECURITY STATUS

- Live roles: `atlasAdmin@admin` | Least-privilege: **VIOLATED** (atlasAdmin) - **HUMAN_ACTION_REQUIRED (Atlas console)**
- Contract test: 2 pass / 1 fail - the role check is the intended signal
- Isolation/injection suites: 9 files / 198 tests passed, 0 failed
- Live indexes/validators: verified (details below)
- Secrets: clean
- UNKNOWN: none for the scoped checks. Out of scope: manual console step itself (requires a human), and post-change re-verification of roles.

## 1. Least-privilege verification (live cluster)

Method: `MONGODB_URI` read from the worktree `.env` (symlinked to repo root) and parsed in Node without printing values; authenticated `connectionStatus` executed over the driver (same path as the contract test). No credentials appear in any output or file.

Result (2026-08-05):

```
AUTH_ROLES: atlasAdmin@admin
```

The application DB user currently holds `atlasAdmin` on `admin` - a global Atlas admin role. This is the P1 OPEN signal.

Required final state (per docs/firebase-mongodb-setup.md and docs/closure-atlas.md):

```
readWrite@unseenlab only
```

Remediation is a manual Atlas console step (`createUser`/role replacement is not permitted over the wire): remove the global `atlasAdmin` role and grant exactly `readWrite` on the `unseenlab` database. The contract test's role check stays red until that console change lands - by design, it is the drift detector.

## 2. Security contract suite (executable evidence)

Command:

```
npx vitest run tests/demonstrations/backend/database-security-contract.test.ts
```

Result:

```
Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

- PASS - `generated_demonstrations` has unique `{ firebaseUid: 1, demonstrationId: 1 }` and `{ firebaseUid: 1, updatedAt: -1 }`
- PASS - all platform collections carry a `$jsonSchema` validator at `validationLevel: strict`
- FAIL - app DB user is least-privilege (`atlasAdmin@admin` matched the forbidden-role list; expected `readWrite@unseenlab`) - intended signal, HUMAN_ACTION_REQUIRED

## 3. Isolation + injection suites (re-verification)

Command:

```
npx vitest run tests/demonstrations/redteam/ tests/demonstrations/backend/generated-demonstrations.test.ts
```

Result:

```
Test Files  9 passed (9)
      Tests  198 passed (198)
```

Covers cross-user isolation, prompt injection, arbitrary execution, resource exhaustion, generation pipeline, store honesty, validator-engine fuzz (redteam), plus the generated-demonstrations repository/route suite. 198/198 pass - no regressions.

## 4. Live cluster state (indexes and validators)

Probe executed against the live cluster (sanitized output; names/keys only, no data):

```
COLLECTION learner_preferences      | validationLevel=strict | hasValidator=true
COLLECTION learning_sessions        | validationLevel=strict | hasValidator=true
COLLECTION profiles                 | validationLevel=strict | hasValidator=true
COLLECTION generated_demonstrations | validationLevel=strict | hasValidator=true
INDEX _id_                              | key={"_id":1}                                | unique=false
INDEX firebaseUid_1_demonstrationId_1   | key={"firebaseUid":1,"demonstrationId":1}    | unique=true
INDEX firebaseUid_1_updatedAt_-1        | key={"firebaseUid":1,"updatedAt":-1}         | unique=false
```

Confirmed already installed (2026-08-05): strict `$jsonSchema` validators on all four platform collections and the composite unique upsert key `{ firebaseUid: 1, demonstrationId: 1 }` that the duplicate-key-conflict path and the atomic concurrency filter depend on.

## 5. Secret hygiene

- `git diff --name-only origin/feature/generative-demonstration-engine` is empty (0 files) - the worktree matches the reference branch.
- Working tree has no committed changes; untracked new files are only `docs/phase12-evidence.md` and `docs/phase12-ledger.md` (other agents), plus this report. A pattern scan of the new files for URI-with-credentials and secret assignments found no matches (verdict only; matched lines never echoed).
- The `MONGODB_URI` value was never printed: Node URL-parsing reported only scheme/host/flag metadata; a single transient Node error string in a shell transcript was the only exposure and it is not reproduced here or in any file.

## 6. Open items

- HUMAN_ACTION_REQUIRED: Atlas console - replace `atlasAdmin@admin` with `readWrite@unseenlab` (exact role `readWrite` on database `unseenlab`). After the change, re-run the contract suite; the role check must go green (3/3).
- Re-verify roles post-change with the same connectionStatus probe; only role names and databases are printed.
