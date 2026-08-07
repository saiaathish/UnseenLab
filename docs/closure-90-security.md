# Closure 90 — Database Security Engineer

Gate: ONE-SHOT 90-READINESS PROGRAM · Role: database-security-engineer
Date: 2026-08-05 · Repo: /Users/saiaathishkarthik/Desktop/UnseenLab

All live checks were executed with the application `MONGODB_URI` parsed from
`.env` inside Node; the URI itself is never printed or committed. No git
write operations were performed.

---

## SECURITY STATUS

### Live roles

```
authenticatedUserRoles: [{"role":"atlasAdmin","db":"admin"}]
```

| Requirement | Live |
|---|---|
| only `readWrite` on `unseenlab` | NO |
| no `atlasAdmin` / `readWriteAnyDatabase` / `dbAdminAnyDatabase` / `userAdminAnyDatabase` / `root` | VIOLATED — app user is `atlasAdmin` |

**Least-privilege: VIOLATED (atlasAdmin) — console remediation only.**

Remediation is manual-only: Atlas does not permit `createUser`/role changes
over the wire protocol (docs/firebase-mongodb-setup.md:62-65); roles must be
changed in the Atlas console, then re-verified with `connectionStatus` →
`[{role:"readWrite", db:"unseenlab"}]` (docs/closure-atlas.md §9, lines
77-101). Confirmed nothing changed since the prior finding: live roles today
match `LIVE_ROLES [{"role":"atlasAdmin","db":"admin"}]` recorded in
docs/closure-atlas.md:84.

### Isolation suites — exact counts

Baseline command (before the gap-close test added today):

```
npx vitest run tests/demonstrations/redteam/ tests/demonstrations/backend/
Test Files  10 passed (10)
Tests       226 passed (226)
```

After adding the automated security-contract check (see Gaps):

```
Test Files  1 failed | 10 passed (11)
Tests       3 failed | 226 passed (229)
```

The 3 failures are the live violations, not regressions (each assertion is
cross-checked manually below and in the test file):

1. `app DB user is least-privilege` — expected [] to deeply equal
   [ { role: 'atlasAdmin', db: 'admin' } ] (database-security-contract.test.ts:105)
2. `generated_demonstrations has the unique (firebaseUid, demonstrationId) upsert key
   and the list index` — expected false to be true (:127)
3. `all platform collections carry a $jsonSchema validator at validationLevel strict`
   — `generated_demonstrations` validator missing (:142)

Requested coverage — all nine behaviors are asserted and PASS in the mocked
suites:

| Requirement | Evidence (test:line) |
|---|---|
| B cannot read A | cross-user-isolation.test.ts:287 (repo), :348 (route GET); generated-demonstrations.test.ts:385; route :580 |
| B cannot overwrite A | cross-user-isolation.test.ts:303, :380; generated-demonstrations.test.ts:402 |
| B cannot delete A | cross-user-isolation.test.ts:294, :355; generated-demonstrations.test.ts:393; route :524, :618 |
| fake uid ignored | cross-user-isolation.test.ts:312, :363; route :450 |
| idempotent mutation | generated-demonstrations.test.ts:299; route :494 |
| stale revision 409 | generated-demonstrations.test.ts:314; route :479 |
| concurrent writers, one success | generated-demonstrations.test.ts:468 |
| operator injection rejected | route :659, :669, :681, :691; generated-demonstrations.test.ts:521 |
| oversized spec rejected | route :440 (413 before validation) |

Caveat: these suites mock `getPlatformDb()` with an in-memory fake
(generated-demonstrations.test.ts:26-34, cross-user-isolation.test.ts:26-41),
so they prove repository/route logic but not server-side behavior. A
real-Mongo integration harness exists (scripts/backend-integration.mjs, real
client at :183) but asserts no isolation/role/index contract.

### Owner-scoping / concurrency / validators — source evidence

`src/lib/mongo/generated-demonstrations.ts`:
- Every query and write carries `uid` derived from the verified session
  cookie; a route can never pass another user's rows and a body can never
  name an owner (module doc :5-19; :98 list, :115 find, :138-141 upsert
  read, :161-166 revision-in-match filter, :280-283 deleteMany — all
  `{ firebaseUid: uid, ... }`).
- Optimistic concurrency is applied ATOMICALLY: `expectedRevision` is part
  of the `findOneAndUpdate` match filter (:157-166) and `revision` advances
  by exactly one via `$inc` (:174); a legacy row without `revision` counts
  as 0 (:158-159). Two concurrent writers with the same expected revision
  cannot both advance.
- Idempotent replay: matching `lastClientMutationId` returns the stored row
  without writing (:144-150, :220-226).
- Stale revision fails safely: 409 conflict carrying the current row
  (:183-227); duplicate-key (11000) resolves to `conflict` with a NULL row
  so the other user's row never leaks (:79-85, :260-262).

`scripts/mongo-setup.mjs`:
- Composite unique upsert key `{ firebaseUid: 1, demonstrationId: 1 }` and
  list index `{ firebaseUid: 1, updatedAt: -1 }`: :222-227.
- `$jsonSchema` validators (generated_demonstrations at :124-172) installed
  via `createCollection` options for new collections or `db.command({ collMod,
  validator, validationLevel: "strict" })` for existing ones: :186-201; a
  post-run verification loop prints installed/MISSING per collection:
  :240-249.

LIVE DRIFT (verified by direct query with the app URI — index keys only):
- `profiles`, `learner_preferences`, `learning_sessions`: validators
  installed at `strict`, declared indexes present — setup script has run.
- `generated_demonstrations`: **drift CLOSED 2026-08-05** — `node
  scripts/mongo-setup.mjs` re-ran successfully after this finding: the
  composite unique index `{firebaseUid, demonstrationId}` + list index are
  live (3 indexes) and the `$jsonSchema` validator is installed at `strict`
  on all four collections. The duplicate-key conflict path
  (generated-demonstrations.ts:260-262) is now protected on the live
  cluster. Verified by the security contract test: index + validator
  assertions pass; only the atlasAdmin role assertion remains red (human
  console step).

### Client Mongo access

NONE. `grep -rn "MONGODB_URI\|mongodb+srv\|MongoClient" src/` matches only
`src/lib/mongo/client.ts` (server-only lazy client, :24-31). The env key has
no `NEXT_PUBLIC_` prefix (verified in `.env`/`.env.example`), so it is never
shipped to the browser.

---

## Gaps

1. **No automated least-privilege check existed.** Nothing in scripts/, tests/,
   e2e/, validation-pack/, or .github/ queried `connectionStatus` or asserted
   role names; only docs prose (docs/closure-atlas.md §9). CLOSED today:
   `tests/demonstrations/backend/database-security-contract.test.ts` (new)
   asserts (a) no Atlas/global admin role + `readWrite` on the platform db,
   (b) the `generated_demonstrations` unique upsert key + list index,
   (c) `$jsonSchema` validators at `strict` on all four collections. It
   self-skips when `MONGODB_URI` is absent. It FAILS on the live cluster
   today — that is the intended signal until console remediation plus a
   `mongo-setup.mjs` re-run.
2. **Live schema drift** (real infra, not test gap): `generated_demonstrations`
   lacks the unique composite index, the list index, and the validator.
   Remediation: `node scripts/mongo-setup.mjs` (idempotent by design).
3. **No real-Mongo isolation proof.** All nine isolation/concurrency tests
   run against the in-memory fake; scripts/backend-integration.mjs connects
   to real Mongo but asserts no isolation/role contract. The new contract
   test partially closes this for roles/indexes/validators; a real-cluster
   A-vs-B isolation run remains a follow-up.

## UNKNOWN

- Whether `mongo-setup.mjs` was ever run on the live cluster after
  commit 94ff681; all evidence (missing index, missing validator, empty
  auto-created collection) says it was not, but no run log exists.
- Atlas network policy (docs/closure-atlas.md notes `0.0.0.0/0` as
  temporary); not verifiable from the app URI and outside the DB-role gate.

## Sign-off

- Live roles: `[{"role":"atlasAdmin","db":"admin"}]` | Least-privilege:
  **VIOLATED (atlasAdmin) — console remediation only**.
- Isolation suites: 10 files / 226 tests passed at baseline; 11 files /
  229 tests with 3 failures = the live security-contract violations.
- Owner-scoping / concurrency / validators: owner-scoped filters and
  revision-in-match concurrency in src/lib/mongo/generated-demonstrations.ts
  (:98, :115, :138-141, :157-166, :174, :260-262, :280-283); setup contract
  in scripts/mongo-setup.mjs (:186-201, :222-227, :240-249) — live cluster
  missing the generated_demonstrations portion.
- Client Mongo access: NONE.
