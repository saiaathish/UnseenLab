# RLS Final Audit — UnseenLab platform schema

- **Auditor:** AGENT RLS-AUDIT (independent final deep audit, fresh eyes)
- **Date:** 2026-08-04 02:41 UTC (local stack time)
- **Scope:**
  - `supabase/migrations/20260803193000_platform_schema.sql` (read in full)
  - `supabase/tests/rls-isolation.sql` (read in full; current working-tree version)
  - Live local stack (Postgres 17.6.1.156, PostgREST v14.15, GoTrue v2.194.0) — **read-only**
    verification only; no DML, no suite rerun, no file modifications other than this
    document.
- **Claim under audit:** suite repaired and run for real — 43/43 PASS against the live local
  Postgres.

---

## 1. Verdict

# RLS VERIFIED WITH RESIDUAL RISKS

The RLS layer itself is **correct and live-verified**: all 12 policies are `to authenticated`
own-row policies, all UPDATE policies carry both `USING` and `WITH CHECK`, the SECURITY
DEFINER trigger function is hardened (`search_path=''`, EXECUTE postgres-only, clamped
values), anon is fully revoked at the grant level (confirmed through the real PostgREST
gateway: anon → HTTP 401 `42501`), and the mandatory isolation matrix is covered by 43
assertions whose negative results cannot be passed by a broken-RLS database (in the tested
dimensions, with real user ids — which the 43/43 run used).

Residual risks are **process/coverage, not policy defects**:
1. The committed suite file is not directly runnable — it contains placeholder UUIDs that do
   not exist in `auth.users`; a green run requires the documented `sed` substitution, and
   skipping it weakens (and in one case inverts) test conclusiveness (R1, MEDIUM).
2. The `handle_new_user` auth-trigger path is not exercised by the suite (R2, LOW — assessed
   by inspection + timeline evidence).
3. The suite simulates JWTs via `set_config('request.jwt.claims', …)` rather than real
   tokens; equivalence was demonstrated live through the real PostgREST JWT path (R3, LOW).

---

## 2. Mandatory-test coverage matrix

`supabase/tests/rls-isolation.sql` contains exactly **43 assertions** (verified by
enumeration: 6+3+3+6+6+6+4+7+2), matching the reported 43/43. Scenario numbers below refer
to the suite's numbered sections.

| # | Mandatory isolation test (program) | Suite coverage | Assertions |
|---|---|---|---|
| 1 | anon read denied | S1 "Anonymous: read denied, DML denied" (checks 1–3: profiles, learner_preferences, learning_sessions) | 3 |
| 2 | anon insert denied | S1 check 4 (profile insert) | 1 |
| 3 | anon update denied | S1 check 5 (preferences update) | 1 |
| 4 | anon delete denied | S1 check 6 (sessions delete) | 1 |
| 5 | A reads A | S2 "User A reads own rows" (3 tables) | 3 |
| 6 | A cannot read B | S3 "User A cannot read User B rows" (3 tables) | 3 |
| 7 | A cannot update B | S4 (3 tables, `ok:0` expectation) **+ admin verification** (B unchanged, 3) | 6 |
| 8 | A cannot insert B-owned row | S5 (3 tables, `<> 'ok:1'`) **+ admin verification** (no planted rows, 3) | 6 |
| 9 | A cannot change user_id on UPDATE | S6 (3 tables, `<> 'ok:1'`) **+ admin verification** (rows still owned by A, 3) | 6 |
| 10 | A deletes A | S8 check 1 (own session delete, `ok:1`) + S9 admin verify (A session gone) | 2 |
| 11 | B unaffected | S9 admin verification (B session, B profile, B preferences all exist) | 3 |
| 12 | A cannot delete B | S8 checks 2–3 (B sessions / B profile delete → `ok:0`) | 2 |
| 13 | Constraint enforcement | S11 (bad `learning_goal` enum, unknown `lab_slug`) | 2 |
| — | Positive control (helpers & impersonation work) | S2 (A reads A) + S7 "User A CAN insert and update OWN rows" (4 checks incl. admin verify) | 7 |

Every mandatory test in the program maps to at least one suite assertion. All three tables
are covered per scenario (profiles, learner_preferences, learning_sessions).

---

## 3. Attack findings

### 3.1 Policies

- **[PASS] No `anon`/`service_role` policies.** All 12 policies are `to authenticated`
  (live `pg_policies.roles = {authenticated}` for every row). Anon therefore has no policy
  path, and the grant-level REVOKE removes the table-ACL path as well (defense in depth).
- **[PASS] UPDATE policies carry both USING and WITH CHECK** on all three tables
  (`profiles_update_own`, `learner_preferences_update_own`, `learning_sessions_update_own`).
  `user_id` can never be reassigned: USING passes only for the caller's own row, WITH CHECK
  rejects any row whose `user_id` differs from `auth.uid()`. No UPDATE policy is missing
  WITH CHECK.
- **[PASS] INSERT policies carry WITH CHECK only** (correct — no USING on INSERT), DELETE
  and SELECT carry USING only (correct).
- **[PASS] Authorization primitive.** All predicates are `(select auth.uid()) = user_id`.
  `auth.uid()` reads `request.jwt.claim.sub` (set by PostgREST from the verified JWT) with
  fallback to `request.jwt.claims->>'sub'` — the standard, non-editable-by-client identity
  source. No `auth.jwt()` misuse, no role-claim-based branching.
- **[PASS] No `user_metadata` in authorization.** `raw_user_meta_data` is read only inside
  `handle_new_user` for presentation fields (`display_name`, `avatar_url`), and only after
  clamping (name ≤ 60 chars, avatar URL must match `https://%` or `http://localhost%` and be
  ≤ 2048 chars). Policies never reference metadata.
- **[INFO] `avatar_url` scheme check is loose at the host level.** `like 'http://localhost%'`
  also matches `http://localhost.evil.com/…`. Impact is nil in this app: the value is
  rendered as an `<img>` `src` (no script execution), the same pattern is enforced by the
  CHECK constraint (`profiles_avatar_url_safe`), and the trigger clamps to NULL on
  mismatch. No action required; noted for completeness.

### 3.2 SECURITY DEFINER — `handle_new_user`

- **[PASS] `set search_path = ''`** — confirmed live in `pg_proc.proconfig`
  (`{"search_path=\"\""}`). No search-path hijack possible (e.g., a malicious `profiles`
  table in a writable schema).
- **[PASS] EXECUTE revoked.** Live ACL is `{postgres=X/postgres}` — only the owner
  (postgres) can execute. The migration's `revoke all … from public` is sufficient because
  EXECUTE defaults to PUBLIC at creation; verified the effective state, not just the
  statement.
- **[PASS] Not reachable through PostgREST.** Live RPC probes return 404 for
  `handle_new_user` and `set_updated_at` (`POST /rest/v1/rpc/<fn>` with the anon key).
- **[PASS] Values clamped, failure cannot abort auth signup:** `left(v_name, 60)`,
  avatar scheme/length validation, `on conflict (user_id) do nothing`, `return new`.
- **[PASS] Trigger wiring:** `on_auth_user_created` is AFTER INSERT on `auth.users`
  (live `pg_trigger`), so it fires for any user-creation path (GoTrue admin API, password
  grant signup, direct insert) and any failure would surface as a failed user insert, not a
  silent gap.
- **[INFO] `set_updated_at()` is SECURITY INVOKER with `search_path=''`** and is only
  invoked by table triggers; EXECUTE postgres-only. No issue (trigger invocation does not
  consult EXECUTE privileges).

### 3.3 Surface / grants

- **[PASS] Public schema is minimal.** Live inventory: exactly 3 tables + 5 indexes (pkeys,
  2 session indexes). **No views, no sequences, no other functions.** No view/function
  exposure to attack.
- **[PASS] Table grants match the migration:** `authenticated` has SELECT/INSERT/UPDATE/
  DELETE on all three tables; **anon has zero grants** (verified via
  `information_schema.role_table_grants` — anon absent) and the live gateway confirms the
  effect: `GET /rest/v1/profiles` with the anon key → `HTTP 401` with
  `{"code":"42501","message":"permission denied for table profiles"}`.
- **[INFO] `service_role` has only REFERENCES/TRIGGER/TRUNCATE** on these tables — no DML.
  `service_role` has `bypassrls` but nothing to bypass here. The app never uses
  `service_role` (verified: no references in `src/`). Narrower-than-default surface; fine.
- **[PASS] RLS enabled on all three tables** (live `relrowsecurity = t` for all).
  `relforcerowsecurity = f` — the owner (postgres) bypasses RLS; that is the migration/admin
  role only, standard and acceptable.
- **[INFO] `jsonb evidence/workflow` fields are size-unbounded** (Postgres per-value cap
  only). A user could bloat their own rows; self-DoS only. Noted.
- **[INFO] Default ACLs in the stack** grant future `postgres`-created tables to
  anon/authenticated — this is precisely why the migration's explicit
  `revoke all … from anon` / `grant … to authenticated` statements exist and why they must
  not be dropped in later migrations.

---

## 4. Can a broken-RLS database pass the suite?

Attempted breakage matrix (logic analysis of the suite against candidate faults):

| Sabotage | Suite reaction | Result |
|---|---|---|
| Drop all policies (RLS on, grants intact) | S3/S4/S8 cross-user reads/updates/deletes return `ok:1` ≠ `ok:0` | **FAILS** |
| `alter table … disable row level security` | Same as above (authenticated cross-user visibility) | **FAILS** |
| Drop WITH CHECK from UPDATE policies | S6 `set user_id = B` succeeds → `ok:1` ≠ `<> 'ok:1'` (with real ids) | **FAILS** |
| Add permissive `to anon` SELECT policy | S1 anon read returns `ok:1` → not denied | **FAILS** |
| Re-grant anon table DML | S1 anon DML succeeds → `ok:1` | **FAILS** |
| Migration not applied (tables absent) | attempts return `error:42P01`; `_test_denied` treats only `ok:0`/`error:42501` as denial → assertion FAILS; admin setup aborts under `ON_ERROR_STOP` | **FAILS** |
| Placeholder ids used with an otherwise broken RLS | S1–S4, S7–S10 catch it; S5/S6/S11 degrade to FK/check-constraint evidence (weak), S7 (positive control) fails outright | **FAILS (or at best non-conclusive on 3 tests)** |
| Break `auth.uid()` / impersonation | Positive controls S2/S7 fail (`ok:0` vs `ok:1`) | **FAILS** |

**Negative-control methodology (verdict DO block):** `_test_expect()` never raises; a failed
assertion records the label into `pg_temp._test_failures` and prints FAIL. The final DO
block counts the ledger; `> 0` → `raise exception` → `ON_ERROR_STOP` → **nonzero exit**. A
single sabotaged assertion therefore fails the run. Cleanup (helper drops) executes *before*
the verdict block, so even a red run leaves no helpers behind — confirmed live: only
`handle_new_user` and `set_updated_at` exist in `public`; all `_test_*` functions are gone.

**Failure ledger scoping (`pg_temp._test_failures`):** the `grant all … to anon,
authenticated` targets *this session's* temp schema; `pg_temp` is resolved per-session, so
no other session can read or truncate the ledger, and no attacker-controlled SQL exists in
the suite (all statements are hard-coded `format()`/`%L` literals). If the ledger INSERT
ever failed inside `_test_expect`, it would raise and abort the run loudly — never a silent
pass.

**`_test_denied` semantics:** treats `ok:0` (RLS-filtered) and `error:42501`
(privilege/policy denial) both as denial, which is the correct error-tolerant model for the
anon checks (anon is revoked, so PostgREST/psql raise 42501; if the revoke were dropped,
RLS would filter to `ok:0` — either way denial is detected). It does **not** conflate
"0 rows" with "missing policy" in the wrong direction: a permissive-but-useless policy
(e.g., `to anon using (auth.uid() = user_id)`, which anon can never satisfy) would yield
`ok:0` and pass — but such a policy grants anon nothing, so this blind spot is benign.

**Can live artifacts prove the run was green?** No — a red run still executes all admin
resets and the pre-verdict cleanup, leaving the same observable state (empty tables, no
helpers). The 43/43 claim is taken from the coordinator's run report; the live state is
fully consistent with a completed run (all three tables empty post-final-reset, all helpers
dropped, no leftover test rows, real users alice/bob present).

---

## 5. Live evidence (read-only, verbatim)

### 5.1 `pg_policies` — public schema (12 rows)

```
          policyname           |      tablename      |   cmd   |      roles      |                  qual                   |               with_check
-------------------------------+---------------------+---------+-----------------+-----------------------------------------+-----------------------------------------
 learner_preferences_delete_own | learner_preferences | DELETE  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) |
 learner_preferences_insert_own | learner_preferences | INSERT  | {authenticated} |                                         | (( SELECT auth.uid() AS uid) = user_id)
 learner_preferences_select_own | learner_preferences | SELECT  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) |
 learner_preferences_update_own | learner_preferences | UPDATE  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) | (( SELECT auth.uid() AS uid) = user_id)
 learning_sessions_delete_own   | learning_sessions   | DELETE  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) |
 learning_sessions_insert_own   | learning_sessions   | INSERT  | {authenticated} |                                         | (( SELECT auth.uid() AS uid) = user_id)
 learning_sessions_select_own   | learning_sessions   | SELECT  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) |
 learning_sessions_update_own   | learning_sessions   | UPDATE  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) | (( SELECT auth.uid() AS uid) = user_id)
 profiles_delete_own            | profiles            | DELETE  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) |
 profiles_insert_own            | profiles            | INSERT  | {authenticated} |                                         | (( SELECT auth.uid() AS uid) = user_id)
 profiles_select_own            | profiles            | SELECT  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) |
 profiles_update_own            | profiles            | UPDATE  | {authenticated} | (( SELECT auth.uid() AS uid) = user_id) | (( SELECT auth.uid() AS uid) = user_id)
```

### 5.2 Tables, functions, grants

- `relrowsecurity = t` on `profiles`, `learner_preferences`, `learning_sessions`; owner
  `postgres`; no other tables/views/sequences in `public`.
- Functions in `public`: only `handle_new_user` (SECURITY DEFINER, `proconfig` =
  `{"search_path=\"\""}`, ACL `{postgres=X/postgres}`) and `set_updated_at` (invoker, same
  search_path and ACL).
- Table grants: `authenticated` = SELECT/INSERT/UPDATE/DELETE on all three; **anon = none**;
  `service_role` = REFERENCES/TRIGGER/TRUNCATE only; `postgres` = all.
- Roles: `anon`/`authenticated` do **not** bypass RLS; `anon` is **not** a member of
  `authenticated` (no `set role` escalation); `postgres` is a member of both (stack default,
  how the suite impersonates).
- Triggers live: `on_auth_user_created` (AFTER INSERT on `auth.users` → `handle_new_user()`)
  plus the three `*_set_updated_at` BEFORE UPDATE triggers.

### 5.3 Real end-to-end path (PostgREST, read-only GETs)

- Anon key → `GET /rest/v1/profiles?select=user_id` → **HTTP 401**
  `{"code":"42501","message":"permission denied for table profiles"}` — the migration's
  `revoke all from anon` is effective through the real gateway.
- Minted HS256 JWTs (signed with the stack's local `JWT_SECRET`, `role=authenticated`,
  `sub=<user id>`):
  - alice (`fdcce085-4659-462e-a14f-2e845998722c`) → profiles/preferences/sessions: HTTP
    200 `[]`
  - bob (`56917472-7dd7-46d5-adee-a1d3a1a91d38`) → profiles: HTTP 200 `[]`
  - ghost uuid (not in `auth.users`) → profiles: HTTP 200 `[]`
  - (Tables are empty post-suite, so 200+`[]` demonstrates the authenticated role passes
    RLS and is not privilege-denied, while anon is denied at 401.)
- RPC probes (anon key): `handle_new_user`, `set_updated_at`, `_test_attempt`,
  `_test_set_role` → all **404** (no RPC surface).

### 5.4 Timeline (trigger-path evidence)

- CLI migration sync snapshot (`supabase/.temp/pgdelta`): **2026-08-04 02:11:50 UTC** —
  migration `20260803193000_platform_schema` recorded in `supabase_migrations`.
- `auth.users`: alice@unseenlab.test and bob@unseenlab.test created **2026-08-04
  02:12:49 UTC** (this stack session).
- Audit at 02:41 UTC. Migration (incl. `on_auth_user_created` trigger) was therefore in
  place **before** both users were created; the trigger must have fired on their inserts
  (any insert into `auth.users` fires an AFTER INSERT trigger). The resulting `profiles`
  rows are no longer present because the suite's per-scenario `_test_reset()` deletes both
  test users' rows from all three tables — the final scenario leaves all three tables empty
  (verified live). Direct proof (e.g., audit logs) is unavailable: `auth.audit_log_entries`
  is empty and `track_functions = none`.

---

## 6. Residual risks

### R1 — [MEDIUM, process/reproducibility] Committed suite file is not directly runnable

The committed `rls-isolation.sql` still contains placeholder UUIDs
(`…00000000-0000-4000-8000-00000000000a/b`) that **do not exist** in `auth.users`
(verified live — only alice/bob exist). Run as-committed, the suite **cannot** pass:
scenario 1's admin setup inserts hit the `profiles.user_id → auth.users.id` foreign key
(`error:23503`) and abort under `ON_ERROR_STOP`; test 7's positive control would fail even
if setup somehow proceeded. The 43/43 run therefore necessarily used the documented
`sed`-substitution with the two real ids. Consequences if substitution is skipped: S5/S6/S11
(and the admin verifications) pass via FK/check-constraint errors instead of RLS evidence —
the header and `docs/supabase-setup.md` disclose this. Recommendation: make the suite
self-contained by seeding two `auth.users` rows with the placeholder ids as part of the run
setup, or commit a runner script that performs the substitution and reports the warning.

### R2 — [LOW] `handle_new_user` trigger path not exercised by the suite

The suite cannot (and does not) insert into `auth.users` (GoTrue-owned, no DML grants for
the test roles). Assessment by inspection is clean (SECURITY DEFINER + `search_path=''` +
postgres-only EXECUTE + clamped values + `on conflict do nothing`), and timeline evidence
(§5.4) shows the trigger was in place before the two real users were created, i.e., it
fired during real user creation; the rows it created were subsequently removed by the
suite's resets. This is strong circumstantial evidence but not a direct test. Residual gap:
a regression that makes `handle_new_user` raise would break signup (loud failure), a
regression that silently skips profile creation would only be caught by an auth-path smoke
test (Flow B in `docs/supabase-setup.md` §4).

### R3 — [LOW] `set_config` impersonation vs real JWTs

The suite impersonates via `set_config('request.jwt.claims', …, true)` (transaction-local),
which is exactly the GUC PostgREST populates from the verified JWT; `auth.uid()` prefers
`request.jwt.claim.sub` (PostgREST sets both) and falls back to `request.jwt.claims` — the
suite exercises the fallback path, the live gateway the primary path, and both resolve to
the same uid. Demonstrated live: real signed JWTs behave identically to the suite's
impersonation (authenticated → 200, anon → 401). The DB layer cannot distinguish them, so
the difference does **not** matter for RLS correctness. What remains untested at the DB
level is JWT signature verification, expiry, and session revocation — these live in
PostgREST/GoTrue and are outside the DB audit's scope; no DB change could test them anyway.

### R4 — [INFO] Edge cases deliberately out of scope

- Anon policy that filters anon to zero rows would be invisible to S1 (benign — grants anon
  nothing).
- `FORCE ROW LEVEL SECURITY` is not set (owner postgres bypasses; acceptable).
- Storage/realtime/auth-schema RLS untouched by this migration (storage objects/buckets
  have RLS enabled with 0 policies = denied by default; verified).
- The suite cannot prove the *green* status of a historical run from persisted state (§4);
  reproducibility requires re-running with real ids.

---

## 7. Conclusion

- The platform schema's RLS is **correct**: own-row-only access for `authenticated`,
  bidirectional user_id immutability on UPDATE, no anon/service_role policy paths, no
  metadata-based authorization, hardened trigger function, minimal exposed surface.
- The suite is **methodologically sound**: 43 assertions with admin-verified ground truth,
  error-tolerant denial semantics that still fail on unapplied migrations, session-scoped
  failure ledger, verdict-driven nonzero exit, and cleanup that runs even on red runs.
  Positive controls anchor the impersonation machinery, so a broken-RLS database cannot
  pass it in the mandatory dimensions (verified by breakage analysis and the live
  policy/ACL state).
- Live verification independently confirms policies, grants, RLS flags, function ACLs, and
  the real gateway behavior (anon 401 / authenticated 200).

**FINAL VERDICT: RLS VERIFIED WITH RESIDUAL RISKS** — the residual risks are
reproducibility of the committed artifact (R1), direct trigger-path coverage (R2), and
real-token validation which lives outside the database (R3). None of them indicate an RLS
defect; the policies and their enforcement are verified and sound as deployed.
