-- UnseenLab RLS isolation tests.
--
-- Pure psql + SQL: no psql \set variables, no top-level PL/pgSQL-only
-- statements (perform/raise) — every statement is a plain SQL statement or a
-- DO block, so the file runs identically under psql.
--
-- Run against a local Supabase stack AFTER applying
-- supabase/migrations/20260803193000_platform_schema.sql:
--
--   docker exec -i supabase_db_UnseenLab psql -U postgres -d postgres < supabase/tests/rls-isolation.sql
--
-- (confirm the container name with `docker ps`; the local stack names the DB
-- container `supabase_db_<project-id>`).
--
-- The only psql meta-command retained is `\set ON_ERROR_STOP on`: psql exits
-- 0 on SQL errors by default, so without it a failed suite would still return
-- exit 0. With it, the final verdict (a raised exception when checks failed,
-- a notice otherwise) drives a nonzero exit code on failure.
--
-- For full conclusiveness of tests 5/6 (cross-user insert / user_id
-- reassignment), the two test identities below should be REAL auth.users
-- rows. The suite now attempts to provision them itself (local stacks and
-- SQL editors with auth.users insert permission); where that is blocked
-- (some hosted setups), it prints a warning and the operator can replace
-- the two placeholder uuids with real ids before running, e.g.:
--
--   sed -e 's/00000000-0000-4000-8000-00000000000a/<real-id-a>/g' \
--       -e 's/00000000-0000-4000-8000-00000000000b/<real-id-b>/g' \
--       supabase/tests/rls-isolation.sql > /tmp/rls-run.sql
--   docker exec -i supabase_db_UnseenLab psql -U postgres -d postgres < /tmp/rls-run.sql
--
-- Design (per the platform red-team audit):
-- * Every scenario is self-contained: it first resets state (deletes rows for
--   both test users from all three tables as the admin role), then runs admin
--   setup, an impersonated attempt, and an ADMIN verification that observes
--   the true row effect. Negative assertions therefore never rely on the
--   attacker's own visibility, which would false-pass if RLS were broken.
-- * DML/read attempts run through _test_attempt(), which catches exceptions
--   in a nested block and reports outcome + affected rows. RLS-filtered
--   UPDATE/DELETE affect 0 rows; WITH CHECK violations and permission denials
--   raise ('error:42501'). _test_denied() treats "0 rows" and "permission
--   denied" alike as denial, so the anonymous checks are error-tolerant.
-- * _test_expect() never raises: failures are recorded into the session temp
--   table pg_temp._test_failures, so one failed check cannot abort the rest
--   of the suite. The final verdict block turns any recorded failure into a
--   raised exception (nonzero exit) and otherwise prints the banner.
-- * Test helpers are PUBLIC-execute revoked at creation so a stranded run can
--   never expose a JWT-claims-forgery primitive through PostgREST; EXECUTE is
--   granted only to anon/authenticated (the assertions run WHILE impersonating
--   those roles) and only for the duration of the suite — the helpers are
--   dropped before the final verdict.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- User ids (placeholders). The suite first tries to PROVISION real
-- auth.users identities at these ids (so the file runs as-is on local
-- stacks); if that is blocked, the operator must replace the ids — see
-- header. Placeholder ids that do not exist make tests 5/6 (cross-user
-- insert / user_id reassignment) weaker: the foreign key fires even if RLS
-- were broken. Tests 1/2/3/4/7/8/11 remain conclusive regardless.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       created_at, updated_at)
    values
      ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000000',
       'authenticated', 'authenticated', 'unseenlab_rls_a@test.local',
       crypt('unseenlab-rls-test-pw', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       '{"full_name":"RLS Test A"}',
       '', '', '', '', now(), now()),
      ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000000',
       'authenticated', 'authenticated', 'unseenlab_rls_b@test.local',
       crypt('unseenlab-rls-test-pw', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       '{"full_name":"RLS Test B"}',
       '', '', '', '', now(), now())
    on conflict (id) do nothing;
    raise notice 'INFO: provisioned real auth.users test identities — RLS tests fully conclusive.';
  exception when others then
    raise notice 'INFO: could not provision auth.users identities (%): replace the placeholder uuids with real ids for full conclusiveness.', sqlerrm;
  end;
end $$;

do $$
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  if not exists (select 1 from auth.users where id = v_a)
     or not exists (select 1 from auth.users where id = v_b) then
    raise notice 'WARNING: placeholder ids do not match real auth.users ids — tests 5/6 lose FK-independent conclusiveness. Replace both placeholder uuids with two real auth.users ids for full coverage.';
  end if;
end $$;

-- Clean slate for repeatable runs (admin role).
delete from public.profiles where user_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
delete from public.learner_preferences where user_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
delete from public.learning_sessions where user_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');

-- Session failure ledger. Dropped with the session; granted to
-- anon/authenticated because _test_expect() records into it WHILE
-- impersonating those roles.
create temp table _test_failures (label text);
grant all on pg_temp._test_failures to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (executed as the connection role; dropped at the end of the suite)
-- ---------------------------------------------------------------------------

drop function if exists public._test_set_role(text, text);
drop function if exists public._test_attempt(text);
drop function if exists public._test_expect(boolean, text);
drop function if exists public._test_denied(text);
drop function if exists public._test_reset();

-- Switches the current transaction to anon/authenticated and sets the JWT
-- subject so auth.uid() reflects the impersonated user.
create or replace function public._test_set_role(role text, sub text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if role = 'anon' then
    set local role anon;
    perform set_config('request.jwt.claims', '{"sub": "' || sub || '"}'::text, true);
  else
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub": "' || sub || '"}'::text, true);
  end if;
end;
$$;

-- Runs p_sql in a nested block. Returns 'ok:N' (N = rows affected/returned)
-- or 'error:<sqlstate>'. RLS-filtered writes return 'ok:0'; policy violations
-- and permission denials raise and return 'error:42501'.
create or replace function public._test_attempt(p_sql text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_rows integer := 0;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    return 'ok:' || v_rows;
  exception when others then
    return 'error:' || sqlstate;
  end;
end;
$$;

-- True when p_sql was denied: either nothing was visible/affected ('ok:0') or
-- the role lacks privileges / violates a policy ('error:42501'). This keeps
-- the anonymous checks error-tolerant: "permission denied" and "0 rows" both
-- count as denial.
create or replace function public._test_denied(p_sql text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_res text;
begin
  v_res := public._test_attempt(p_sql);
  return v_res = 'ok:0' or v_res = 'error:42501';
end;
$$;

-- Prints a PASS notice or records the failure into pg_temp._test_failures and
-- prints a FAIL notice. Never raises, so one failed check cannot abort the
-- rest of the suite; the final verdict block turns any recorded failure into
-- a nonzero exit.
create or replace function public._test_expect(cond boolean, label text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if cond then
    raise notice 'PASS  %', label;
  else
    insert into pg_temp._test_failures values (label);
    raise notice 'FAIL  %', label;
  end if;
end;
$$;

-- Self-containment: deletes every row owned by either test user from all
-- three tables. Runs as the admin (connection) role at the start of every
-- scenario so each test block starts from a known state.
create or replace function public._test_reset()
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.profiles where user_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
  delete from public.learner_preferences where user_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
  delete from public.learning_sessions where user_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
end;
$$;

revoke all on function public._test_set_role(text, text) from public;
revoke all on function public._test_attempt(text) from public;
revoke all on function public._test_denied(text) from public;
revoke all on function public._test_expect(boolean, text) from public;
revoke all on function public._test_reset() from public;
-- Test-only grants so the assertions can run under impersonated roles.
grant execute on function public._test_set_role(text, text) to anon, authenticated;
grant execute on function public._test_attempt(text) to anon, authenticated;
grant execute on function public._test_denied(text) to anon, authenticated;
grant execute on function public._test_expect(boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Anonymous: read denied, DML denied
-- ---------------------------------------------------------------------------
do $$ -- admin setup
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_reset();
  insert into public.profiles (user_id, display_name) values (v_a, 'Alice');
  insert into public.learner_preferences (user_id, learning_goal) values (v_a, 'understand_concept');
  insert into public.learning_sessions (user_id, lab_slug, title) values (v_a, 'nuclear-chain-reaction', 'A');
end $$;

do $$ -- anon attempts (error-tolerant: 0 rows or permission denied both count)
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_set_role('anon', v_a::text);
  perform public._test_expect(
    public._test_denied(format('select 1 from public.profiles where user_id = %L limit 1', v_a)),
    'anon cannot read user A profile');
  perform public._test_expect(
    public._test_denied(format('select 1 from public.learner_preferences where user_id = %L limit 1', v_a)),
    'anon cannot read user A preferences');
  perform public._test_expect(
    public._test_denied(format('select 1 from public.learning_sessions where user_id = %L limit 1', v_a)),
    'anon cannot read user A sessions');
  perform public._test_expect(
    public._test_denied(format('insert into public.profiles (user_id, display_name) values (%L, %L)', v_a, 'Mallory')),
    'anon cannot insert a profile');
  perform public._test_expect(
    public._test_denied(format('update public.learner_preferences set learning_goal = %L where user_id = %L', 'concise', v_a)),
    'anon cannot update preferences');
  perform public._test_expect(
    public._test_denied(format('delete from public.learning_sessions where user_id = %L', v_a)),
    'anon cannot delete sessions');
end $$;

-- ---------------------------------------------------------------------------
-- 2. User A reads own rows
-- ---------------------------------------------------------------------------
do $$ -- admin setup
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_reset();
  insert into public.profiles (user_id, display_name) values (v_a, 'Alice');
  insert into public.learner_preferences (user_id, learning_goal) values (v_a, 'understand_concept');
  insert into public.learning_sessions (user_id, lab_slug, title) values (v_a, 'nuclear-chain-reaction', 'A');
end $$;

do $$ -- user A attempts
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_set_role('authenticated', v_a::text);
  perform public._test_expect(
    public._test_attempt(format('select 1 from public.profiles where user_id = %L limit 1', v_a)) = 'ok:1',
    'user A reads own profile');
  perform public._test_expect(
    public._test_attempt(format('select 1 from public.learner_preferences where user_id = %L limit 1', v_a)) = 'ok:1',
    'user A reads own preferences');
  perform public._test_expect(
    public._test_attempt(format('select 1 from public.learning_sessions where user_id = %L limit 1', v_a)) = 'ok:1',
    'user A reads own session');
end $$;

-- ---------------------------------------------------------------------------
-- 3. User A cannot read User B rows
-- ---------------------------------------------------------------------------
do $$ -- admin setup
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_reset();
  insert into public.profiles (user_id, display_name) values (v_b, 'Bob');
  insert into public.learner_preferences (user_id, learning_goal) values (v_b, 'prepare_for_class');
  insert into public.learning_sessions (user_id, lab_slug, title) values (v_b, 'nuclear-chain-reaction', 'B');
end $$;

do $$ -- user A attempts to read user B rows
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_set_role('authenticated', v_a::text);
  perform public._test_expect(
    public._test_attempt(format('select 1 from public.profiles where user_id = %L limit 1', v_b)) = 'ok:0',
    'user A cannot read user B profile');
  perform public._test_expect(
    public._test_attempt(format('select 1 from public.learner_preferences where user_id = %L limit 1', v_b)) = 'ok:0',
    'user A cannot read user B preferences');
  perform public._test_expect(
    public._test_attempt(format('select 1 from public.learning_sessions where user_id = %L limit 1', v_b)) = 'ok:0',
    'user A cannot read user B session');
end $$;

-- ---------------------------------------------------------------------------
-- 4. User A cannot update User B rows (0 rows affected + admin verifies)
-- ---------------------------------------------------------------------------
do $$ -- admin setup
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_reset();
  insert into public.profiles (user_id, display_name) values (v_b, 'Bob');
  insert into public.learner_preferences (user_id, learning_goal) values (v_b, 'prepare_for_class');
  insert into public.learning_sessions (user_id, lab_slug, title) values (v_b, 'nuclear-chain-reaction', 'B');
end $$;

do $$ -- user A attempts to update user B rows
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_set_role('authenticated', v_a::text);
  perform public._test_expect(
    public._test_attempt(format('update public.profiles set display_name = %L where user_id = %L', 'Mallory', v_b)) = 'ok:0',
    'user A update of user B profile affects 0 rows');
  perform public._test_expect(
    public._test_attempt(format('update public.learner_preferences set learning_goal = %L where user_id = %L', 'explore_experiments', v_b)) = 'ok:0',
    'user A update of user B preferences affects 0 rows');
  perform public._test_expect(
    public._test_attempt(format('update public.learning_sessions set title = %L where user_id = %L', 'HACKED', v_b)) = 'ok:0',
    'user A update of user B session affects 0 rows');
end $$;

do $$ -- admin verification: nothing changed
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_expect(
    (select display_name from public.profiles where user_id = v_b) = 'Bob',
    'user B profile unchanged after user A update attempt');
  perform public._test_expect(
    (select learning_goal from public.learner_preferences where user_id = v_b) = 'prepare_for_class',
    'user B preferences unchanged after user A update attempt');
  perform public._test_expect(
    (select title from public.learning_sessions where user_id = v_b) = 'B',
    'user B session unchanged after user A update attempt');
end $$;

-- ---------------------------------------------------------------------------
-- 5. User A cannot insert a row owned by User B (error + admin verifies)
-- ---------------------------------------------------------------------------
do $$ -- admin setup (reset only: nothing for A or B may exist)
begin
  perform public._test_reset();
end $$;

do $$ -- user A attempts to insert rows owned by user B
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_set_role('authenticated', v_a::text);
  perform public._test_expect(
    public._test_attempt(format('insert into public.profiles (user_id, display_name) values (%L, %L)', v_b, 'Bob')) <> 'ok:1',
    'user A insert of user B profile is rejected');
  perform public._test_expect(
    public._test_attempt(format('insert into public.learner_preferences (user_id) values (%L)', v_b)) <> 'ok:1',
    'user A insert of user B preferences is rejected');
  perform public._test_expect(
    public._test_attempt(format('insert into public.learning_sessions (user_id, lab_slug, title) values (%L, %L, %L)', v_b, 'nuclear-chain-reaction', 'B')) <> 'ok:1',
    'user A insert of user B session is rejected');
end $$;

do $$ -- admin verification: no planted rows exist
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_expect(
    not exists (select 1 from public.profiles where user_id = v_b),
    'no user B profile was planted');
  perform public._test_expect(
    not exists (select 1 from public.learner_preferences where user_id = v_b),
    'no user B preferences were planted');
  perform public._test_expect(
    not exists (select 1 from public.learning_sessions where user_id = v_b),
    'no user B session was planted');
end $$;

-- ---------------------------------------------------------------------------
-- 6. User A cannot change user_id during UPDATE (error + admin verifies)
-- ---------------------------------------------------------------------------
do $$ -- admin setup
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_reset();
  insert into public.profiles (user_id, display_name) values (v_a, 'Alice');
  insert into public.learner_preferences (user_id, learning_goal) values (v_a, 'understand_concept');
  insert into public.learning_sessions (user_id, lab_slug, title) values (v_a, 'nuclear-chain-reaction', 'A');
end $$;

do $$ -- user A attempts to reassign own rows to user B
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_set_role('authenticated', v_a::text);
  perform public._test_expect(
    public._test_attempt(format('update public.profiles set user_id = %L where user_id = %L', v_b, v_a)) <> 'ok:1',
    'user A cannot reassign profile to user B');
  perform public._test_expect(
    public._test_attempt(format('update public.learner_preferences set user_id = %L where user_id = %L', v_b, v_a)) <> 'ok:1',
    'user A cannot reassign preferences to user B');
  perform public._test_expect(
    public._test_attempt(format('update public.learning_sessions set user_id = %L where user_id = %L', v_b, v_a)) <> 'ok:1',
    'user A cannot reassign session to user B');
end $$;

do $$ -- admin verification: rows still owned by A
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_expect(
    exists (select 1 from public.profiles where user_id = v_a),
    'profile still owned by user A');
  perform public._test_expect(
    exists (select 1 from public.learner_preferences where user_id = v_a),
    'preferences still owned by user A');
  perform public._test_expect(
    exists (select 1 from public.learning_sessions where user_id = v_a),
    'session still owned by user A');
end $$;

-- ---------------------------------------------------------------------------
-- 7. User A CAN insert and update OWN rows (positive control)
-- ---------------------------------------------------------------------------
do $$ -- admin setup: user A profile exists; no session yet
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_reset();
  insert into public.profiles (user_id, display_name) values (v_a, 'Alice');
end $$;

do $$ -- user A attempts: insert own session, update own profile
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_set_role('authenticated', v_a::text);
  perform public._test_expect(
    public._test_attempt(format('insert into public.learning_sessions (user_id, lab_slug, title) values (%L, %L, %L)', v_a, 'nuclear-chain-reaction', 'A2')) = 'ok:1',
    'user A can insert own session');
  perform public._test_expect(
    public._test_attempt(format('update public.profiles set display_name = %L where user_id = %L', 'Alice Updated', v_a)) = 'ok:1',
    'user A can update own profile');
end $$;

do $$ -- admin verification
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_expect(
    exists (select 1 from public.learning_sessions where user_id = v_a and title = 'A2'),
    'user A inserted session exists');
  perform public._test_expect(
    (select display_name from public.profiles where user_id = v_a) = 'Alice Updated',
    'user A profile update persisted');
end $$;

-- ---------------------------------------------------------------------------
-- 8. User A deletes own rows; 9. User B unaffected; 10. A cannot delete B
-- ---------------------------------------------------------------------------
do $$ -- admin setup: A owns a session, B owns profile/preferences/session
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_reset();
  insert into public.learning_sessions (user_id, lab_slug, title) values (v_a, 'nuclear-chain-reaction', 'A2');
  insert into public.profiles (user_id, display_name) values (v_b, 'Bob');
  insert into public.learner_preferences (user_id, learning_goal) values (v_b, 'prepare_for_class');
  insert into public.learning_sessions (user_id, lab_slug, title) values (v_b, 'nuclear-chain-reaction', 'B');
end $$;

do $$ -- user A attempts: delete own session, delete user B rows
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_set_role('authenticated', v_a::text);
  perform public._test_expect(
    public._test_attempt(format('delete from public.learning_sessions where user_id = %L and title = %L', v_a, 'A2')) = 'ok:1',
    'user A deletes own session');
  perform public._test_expect(
    public._test_attempt(format('delete from public.learning_sessions where user_id = %L', v_b)) = 'ok:0',
    'user A delete of user B sessions affects 0 rows');
  perform public._test_expect(
    public._test_attempt(format('delete from public.profiles where user_id = %L', v_b)) = 'ok:0',
    'user A delete of user B profile affects 0 rows');
end $$;

do $$ -- admin verification
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  perform public._test_expect(
    not exists (select 1 from public.learning_sessions where user_id = v_a),
    'user A session deleted');
  perform public._test_expect(
    exists (select 1 from public.learning_sessions where user_id = v_b),
    'user B sessions unaffected');
  perform public._test_expect(
    exists (select 1 from public.profiles where user_id = v_b),
    'user B profile unaffected');
  perform public._test_expect(
    exists (select 1 from public.learner_preferences where user_id = v_b),
    'user B preferences unaffected');
end $$;

-- ---------------------------------------------------------------------------
-- 11. Constraints still enforced (valid enums and ranges only)
-- ---------------------------------------------------------------------------
do $$ -- admin setup (reset only)
begin
  perform public._test_reset();
end $$;

do $$ -- user A attempts constraint-violating inserts
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
begin
  perform public._test_set_role('authenticated', v_a::text);
  perform public._test_expect(
    public._test_attempt(format('insert into public.learner_preferences (user_id, learning_goal) values (%L, %L)', v_a, 'made_up_goal')) <> 'ok:1',
    'unsupported preference value is rejected');
  perform public._test_expect(
    public._test_attempt(format('insert into public.learning_sessions (user_id, lab_slug, title) values (%L, %L, %L)', v_a, 'not-a-lab', 'X')) <> 'ok:1',
    'unknown lab slug is rejected');
end $$;

-- ---------------------------------------------------------------------------
-- Cleanup (runs before the verdict so the drops happen even when the verdict
-- below raises)
-- ---------------------------------------------------------------------------
drop function public._test_set_role(text, text);
drop function public._test_attempt(text);
drop function public._test_denied(text);
drop function public._test_expect(boolean, text);
drop function public._test_reset();

-- ---------------------------------------------------------------------------
-- Verdict: banner on green; raised exception (nonzero exit) on any failure
-- ---------------------------------------------------------------------------
do $$
declare
  v_failed int;
begin
  select count(*) into v_failed from pg_temp._test_failures;
  if v_failed > 0 then
    raise exception 'RLS ISOLATION SUITE: % CHECK(S) FAILED — see FAIL notices above', v_failed;
  else
    raise notice 'RLS ISOLATION SUITE: ALL CHECKS PASSED';
  end if;
end $$;

drop table pg_temp._test_failures;
