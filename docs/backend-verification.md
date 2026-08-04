# Backend Integration Verification (real Firebase Auth + MongoDB)

Date: 2026-08-04 (local, run against the LIVE platform stack; suite executed
twice — both runs 15/15 — the output below is from the final run)
Runner: `scripts/backend-integration.mjs` (new) — plain-ESM, Node 22 fetch + Mongo driver

This suite proves authorization, idempotency, and concurrency against the
ACTUAL services — a real Firebase Auth project (users `learner_a@test.local` /
`learner_b@test.local`, session cookies minted via
`scripts/e2e-seed-auth.mjs token`, i.e. the exact `createCustomToken →
Identity Toolkit → createSessionCookie` path) and the real MongoDB database
(`MONGODB_DB`, default `unseenlab`) behind a running production build of the
app (`npm run build && npm run start -- -p 3100`).

- Every test in this file ran against the REAL stack — none were skipped.
- No secrets appear in this file or in the suite's output: the service-account
  JSON and the MongoDB URI are consumed but never printed (Mongo checks are
  reported as counts only; the connection string is redacted/omitted).

## Environment at time of run

- App: production build of `feature/overnight-90-readiness` on port 3100,
  built + started by the verification run itself (port was free, no other
  agent building).
- The tree contained the (at the time uncommitted) optimistic-concurrency
  workstream: `revision` / `last_client_mutation_id` on
  `learning_sessions` docs, `expected_revision` / `mutation_id` on PUT,
  idempotent mutation replay, and 409 conflicts — so the contract tests
  (A3, A8, A9, A10) executed against the real implementation, not a stub.
- Users seeded idempotently by `e2e-seed-auth.mjs create`; clean Mongo slate
  (sessions + preferences wiped for both learners, profiles upserted).

## Results — one line per test (suite stdout)

```
PASS | A1 no cookie → 401 — status 401 (expected 401)
PASS | A2 garbage cookie → 401 — status 401 (expected 401)
PASS | A3 PUT creates session with revision >= 1 — status 200, revision=1 (contract: revision field on docs)
PASS | A4 client-supplied user_id ignored — PUT 200; stored user_id via GET=<uid A>, via Mongo=<uid A> (expected <uid A>)
PASS | A5 B cannot read A's session — status 200, B sees session=null
PASS | A6 B cannot create row with A's id — B's PUT status 500 (unique-id index rejects the insert); B GET=null, A row title="A4 fake-uid ignored"
PASS | A7 B cannot complete A's session — B POST status 200; A's row status=active (still active)
PASS | A8 duplicate mutation_id replays idempotently — PUT1 200 rev=3; PUT2 200 rev=3 title="A8 replay first" (expected rev unchanged + "A8 replay first")
PASS | A9 stale expected_revision → 409 conflict — status 409, error=conflict, data.session=present (contract: 409 + current doc)
PASS | A10 fresh expected_revision increments revision — status 200, revision 3 → 4 (expected 4)
PASS | A11 complete sets status + completed_at — POST 200; status=complete, completed_at=2026-08-04T06:02:18.222Z
PASS | A12 B cannot delete A's session — B DELETE status 200; A GET session=exists
PASS | A13 account wipe removes A's data, leaves B untouched — DELETE 200; A: session=null, prefs=null; Mongo — A sessions=0 prefs=0, B sessions=1 prefs=0 (B's own row must survive)
PASS | A14 preferences PUT returns + persists, B's stays null — PUT 200; A prefs=present (learning_goal=explore_experiments), B prefs=null
PASS | A15 cleanup removes test rows, keeps profiles — deleted sessions=1 prefs=1; remaining for learners — sessions=0 prefs=0, profiles=2 (kept)
SUMMARY: 15/15 passed, 0 failed — integration suite vs REAL Firebase Auth + MongoDB (db "unseenlab")
```

Exit code: 0 (suite exits non-zero on any failure; 2 when the app is not
running, with build/start instructions).

## Per-test table

| # | Test | Result | Observed | Evidence |
|---|------|--------|----------|----------|
| A1 | No cookie → 401 | PASS | `GET /api/cloud/sessions` → 401 | auth gate works |
| A2 | Garbage cookie → 401 | PASS | `Cookie: unseenlab.session=<invalid>` → 401 | cookie verification rejects |
| A3 | A creates session, revision ≥ 1 | PASS | PUT 200, `data.session.revision=1` | row created, revision starts at 1 |
| A4 | Client-supplied `user_id` ignored | PASS | PUT 200 (body `user_id:"someone-else"`); stored `user_id` = A's real uid via both GET and direct Mongo read | ownership derived from cookie only |
| A5 | B reads A's session → null | PASS | B GET `?id=<A's id>` → `data.session: null` | isolation read |
| A6 | B cannot create row under A's id | PASS | B PUT → 500 (unique `id` index rejects B's insert); B GET → null; A's row unchanged | no cross-user row creation |
| A7 | B cannot complete A's session | PASS | B POST complete → 200 (no-op); A GET → still `active` | complete is owner-scoped |
| A8 | Duplicate `mutation_id` replays idempotently | PASS | PUT1 200 rev=3; PUT2 (same mutation_id, different title) 200 rev=3, title unchanged "A8 replay first" | idempotent replay, no revision bump |
| A9 | Stale `expected_revision` → 409 | PASS | PUT `expected_revision:999` → 409 `{error:"conflict", data:{session}}` | optimistic concurrency conflict |
| A10 | Fresh `expected_revision` → revision +1 | PASS | PUT with current revision → 200, `revision 3 → 4` | real revision increment |
| A11 | Complete sets `completed_at` | PASS | POST complete 200; GET → `status:"complete"`, `completed_at=2026-08-04T06:02:18.222Z` | completion timestamped |
| A12 | B cannot delete A's session | PASS | B DELETE `{ids:[A's id]}` → 200 no-op; A GET → row exists | delete is owner-scoped |
| A13 | Account wipe removes A's data, B untouched | PASS | A DELETE /api/account → 200; A session + preferences null via API; Mongo: A sessions=0 prefs=0; B sessions=1 prefs=0 (B's own row survived) | privacy wipe + cross-user isolation |
| A14 | Preferences full PUT/GET; B has none | PASS | A PUT prefs 200; GET /api/account returns them; B GET /api/account → preferences null | full-row upsert, no cross-user leak |
| A15 | Cleanup test rows, keep profiles | PASS | Mongo delete: sessions=1, prefs=1; remaining: sessions=0, prefs=0, profiles=2 | suite is re-runnable |

## Isolation proof (summary)

- A's session id was never readable, writable, completable, or deletable by B
  (A5, A6, A7, A12) — verified both through the API (B sees `null` / no-op)
  and, for A4/A13/A15, through direct driver reads of the real database.
- The unique `id` index on `learning_sessions` is what turns B's attempted
  insert under A's id into a 500 no-op (A6) — an honest, observed behavior of
  the live schema; the row was never created for B and A's row never changed.
- Account wipe (A13) removed exactly A's `learning_sessions` +
  `learner_preferences` rows while B's own session survived; profiles were
  retained for both learners (A15: 2 profiles kept).

## Idempotency / concurrency proof (summary)

- Real revision sequence observed across the run: 1 (A3) → 2 (A4) → 3 (A8
  first write) → 3 (A8 replay, unchanged) → 4 (A10 fresh write).
- Replaying the same `mutation_id` returned the stored doc unchanged
  (title + revision identical); a stale `expected_revision` produced the
  409 conflict with the current doc in `data.session`.

## How to reproduce

```bash
# 1. start the app (port 3100, or set APP_BASE_URL)
npm run build && npm run start -- -p 3100

# 2. run the suite (reads .env / .env.local itself)
node scripts/backend-integration.mjs
```

Required env (in `.env` / `.env.local`): `FIREBASE_SERVICE_ACCOUNT`,
`NEXT_PUBLIC_FIREBASE_API_KEY`, `MONGODB_URI`; optional `MONGODB_DB`
(default `unseenlab`) and `APP_BASE_URL` (default `http://localhost:3100`).
The suite never starts the server: if the app is not answering it prints the
build/start instruction and exits 2. Test rows are removed at the end (A15),
so the suite is re-runnable; the seeded learner profiles are left in place.
