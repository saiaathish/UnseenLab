-- UnseenLab RLS isolation tests.
--
-- Run against a real Supabase project database (or local `supabase start`
-- stack) AFTER applying supabase/migrations/20260803193000_platform_schema.sql.
--
--   supabase db query -f supabase/tests/rls-isolation.sql   (CLI v2.79+)
--   or run the file in the SQL editor.
--
-- Design (per the platform red-team audit):
-- * Each scenario uses three transactions: admin setup, impersonated attempt,
--   then an ADMIN verification that observes the true row effect. Negative
--   assertions therefore never rely on the attacker's own visibility, which
--   would false-pass if RLS were broken (the attacker cannot see their own
--   planted row either way).
-- * DML attempts run through _test_attempt(), which catches exceptions in a
--   nested block and reports outcome + affected rows. RLS-filtered UPDATE/
--   DELETE affect 0 rows; WITH CHECK violations raise errors — both are
--   asserted explicitly.
-- * Test helpers are PUBLIC-execute revoked at creation so a stranded run can
--   never expose a JWT-claims-forgery primitive through PostgREST.

\set on_error_stop on

-- Two distinct user ids. For full coverage, replace these placeholders with
-- the ids of two REAL users from auth.users (e.g. two test accounts). The
-- placeholder ids make tests 5/6 (cross-user insert / user_id reassignment)
-- less conclusive: with ids that do not exist, the foreign key fires even if
-- RLS were broken, so a PASS there is weaker evidence. Tests 3/4/8 remain
-- conclusive regardless.
\set user_a '00000000-0000-4000-8000-00000000000a'
\set user_b '00000000-0000-4000-8000-00000000000b'

do $$
declare v_a uuid := '00000000-0000-4000-8000-00000000000a';
declare v_b uuid := '00000000-0000-4000-8000-00000000000b';
begin
  if not exists (select 1 from auth.users where id = v_a)
     or not exists (select 1 from auth.users where id = v_b) then
    raise notice 'WARNING: placeholders do not match real auth.users ids — tests 5/6 lose FK-independent conclusiveness. Replace with two real user ids for full coverage.';
  end if;
end $$;

-- Clean slate for repeatable runs.
delete from public.learning_sessions where user_id in (:'user_a', :'user_b');
delete from public.learner_preferences where user_id in (:'user_a', :'user_b');
delete from public.profiles where user_id in (:'user_a', :'user_b');

-- ---------------------------------------------------------------------------
-- Helpers (executed as the SQL-editor role; dropped at the end of the suite)
-- ---------------------------------------------------------------------------
-- EXECUTE is granted to anon/authenticated because the assertions run WHILE
-- impersonating those roles; the helpers exist only for the duration of the
-- suite and are dropped below.

drop function if exists public._test_set_role(text, text);
drop function if exists public._test_attempt(text);
drop function if exists public._test_expect(boolean, text);

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

-- Runs p_sql in a nested block. Returns 'ok:N' (N = rows affected) or
-- 'error:<sqlstate>'. RLS-filtered writes return 'ok:0'; policy violations
-- raise and return 'error:...'.
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

create or replace function public._test_expect(cond boolean, label text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if cond then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end;
$$;

revoke all on function public._test_set_role(text, text) from public;
revoke all on function public._test_attempt(text) from public;
revoke all on function public._test_expect(boolean, text) from public;
-- Test-only grants so the assertions can run under impersonated roles.
grant execute on function public._test_set_role(text, text) to anon, authenticated;
grant execute on function public._test_attempt(text) to anon, authenticated;
grant execute on function public._test_expect(boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Anonymous: read denied, DML denied
-- ---------------------------------------------------------------------------
begin; -- admin setup
insert into public.profiles (user_id, display_name) values (:'user_a', 'Alice');
insert into public.learner_preferences (user_id, learning_goal) values (:'user_a', 'understand_concept');
insert into public.learning_sessions (user_id, lab_slug, title) values (:'user_a', 'nuclear-chain-reaction', 'A');
commit;

begin; -- anon attempts
select public._test_set_role('anon', :'user_a');
perform public._test_expect(
  not exists (select 1 from public.profiles where user_id = :'user_a'),
  'anon cannot read user A profile'
);
perform public._test_expect(
  not exists (select 1 from public.learner_preferences where user_id = :'user_a'),
  'anon cannot read user A preferences'
);
perform public._test_expect(
  not exists (select 1 from public.learning_sessions where user_id = :'user_a'),
  'anon cannot read user A sessions'
);
perform public._test_expect(
  public._test_attempt(format('insert into public.profiles (user_id, display_name) values (%L, %L)', :'user_a', 'Mallory')) <> 'ok:1',
  'anon cannot insert a profile'
);
perform public._test_expect(
  public._test_attempt(format('update public.learner_preferences set learning_goal = %L where user_id = %L', 'concise', :'user_a')) <> 'ok:1',
  'anon cannot update preferences'
);
perform public._test_expect(
  public._test_attempt(format('delete from public.learning_sessions where user_id = %L', :'user_a')) <> 'ok:1',
  'anon cannot delete sessions'
);
commit;

-- ---------------------------------------------------------------------------
-- 2. User A reads own rows
-- ---------------------------------------------------------------------------
begin;
select public._test_set_role('authenticated', :'user_a');
perform public._test_expect(
  exists (select 1 from public.profiles where user_id = :'user_a'),
  'user A reads own profile'
);
perform public._test_expect(
  exists (select 1 from public.learner_preferences where user_id = :'user_a'),
  'user A reads own preferences'
);
perform public._test_expect(
  exists (select 1 from public.learning_sessions where user_id = :'user_a'),
  'user A reads own session'
);
commit;

-- ---------------------------------------------------------------------------
-- 3. User A cannot read User B rows
-- ---------------------------------------------------------------------------
begin; -- admin setup
insert into public.profiles (user_id, display_name) values (:'user_b', 'Bob');
insert into public.learner_preferences (user_id, learning_goal) values (:'user_b', 'prepare_for_class');
insert into public.learning_sessions (user_id, lab_slug, title) values (:'user_b', 'nuclear-chain-reaction', 'B');
commit;

begin;
select public._test_set_role('authenticated', :'user_a');
perform public._test_expect(
  not exists (select 1 from public.profiles where user_id = :'user_b'),
  'user A cannot read user B profile'
);
perform public._test_expect(
  not exists (select 1 from public.learner_preferences where user_id = :'user_b'),
  'user A cannot read user B preferences'
);
perform public._test_expect(
  not exists (select 1 from public.learning_sessions where user_id = :'user_b'),
  'user A cannot read user B session'
);
commit;

-- ---------------------------------------------------------------------------
-- 4. User A cannot update User B rows (0 rows affected + admin verifies)
-- ---------------------------------------------------------------------------
begin;
select public._test_set_role('authenticated', :'user_a');
perform public._test_expect(
  public._test_attempt(format('update public.profiles set display_name = %L where user_id = %L', 'Mallory', :'user_b')) = 'ok:0',
  'user A update of user B profile affects 0 rows'
);
perform public._test_expect(
  public._test_attempt(format('update public.learner_preferences set learning_goal = %L where user_id = %L', 'explore_experiments', :'user_b')) = 'ok:0',
  'user A update of user B preferences affects 0 rows'
);
perform public._test_expect(
  public._test_attempt(format('update public.learning_sessions set title = %L where user_id = %L', 'HACKED', :'user_b')) = 'ok:0',
  'user A update of user B session affects 0 rows'
);
commit;

begin; -- admin verification: nothing changed
perform public._test_expect(
  (select display_name from public.profiles where user_id = :'user_b') = 'Bob',
  'user B profile unchanged after user A update attempt'
);
perform public._test_expect(
  (select learning_goal from public.learner_preferences where user_id = :'user_b') = 'prepare_for_class',
  'user B preferences unchanged after user A update attempt'
);
perform public._test_expect(
  (select title from public.learning_sessions where user_id = :'user_b') = 'B',
  'user B session unchanged after user A update attempt'
);
commit;

-- ---------------------------------------------------------------------------
-- 5. User A cannot insert a row owned by User B (error + admin verifies)
-- ---------------------------------------------------------------------------
begin;
select public._test_set_role('authenticated', :'user_a');
perform public._test_expect(
  public._test_attempt(format('insert into public.profiles (user_id, display_name) values (%L, %L)', :'user_b', 'Bob')) <> 'ok:1',
  'user A insert of user B profile is rejected'
);
perform public._test_expect(
  public._test_attempt(format('insert into public.learner_preferences (user_id) values (%L)', :'user_b')) <> 'ok:1',
  'user A insert of user B preferences is rejected'
);
perform public._test_expect(
  public._test_attempt(format('insert into public.learning_sessions (user_id, lab_slug, title) values (%L, %L, %L)', :'user_b', 'nuclear-chain-reaction', 'B')) <> 'ok:1',
  'user A insert of user B session is rejected'
);
commit;

begin; -- admin verification: no planted rows exist
perform public._test_expect(
  not exists (select 1 from public.profiles where user_id = :'user_b'),
  'no user B profile was planted'
);
perform public._test_expect(
  not exists (select 1 from public.learner_preferences where user_id = :'user_b'),
  'no user B preferences were planted'
);
perform public._test_expect(
  not exists (select 1 from public.learning_sessions where user_id = :'user_b'),
  'no user B session was planted'
);
commit;

-- ---------------------------------------------------------------------------
-- 6. User A cannot change user_id during UPDATE (error + admin verifies)
-- ---------------------------------------------------------------------------
begin;
select public._test_set_role('authenticated', :'user_a');
perform public._test_expect(
  public._test_attempt(format('update public.profiles set user_id = %L where user_id = %L', :'user_b', :'user_a')) <> 'ok:1',
  'user A cannot reassign profile to user B'
);
perform public._test_expect(
  public._test_attempt(format('update public.learner_preferences set user_id = %L where user_id = %L', :'user_b', :'user_a')) <> 'ok:1',
  'user A cannot reassign preferences to user B'
);
perform public._test_expect(
  public._test_attempt(format('update public.learning_sessions set user_id = %L where user_id = %L', :'user_b', :'user_a')) <> 'ok:1',
  'user A cannot reassign session to user B'
);
commit;

begin; -- admin verification: rows still owned by A
perform public._test_expect(
  exists (select 1 from public.profiles where user_id = :'user_a'),
  'profile still owned by user A'
);
perform public._test_expect(
  exists (select 1 from public.learner_preferences where user_id = :'user_a'),
  'preferences still owned by user A'
);
perform public._test_expect(
  exists (select 1 from public.learning_sessions where user_id = :'user_a'),
  'session still owned by user A'
);
commit;

-- ---------------------------------------------------------------------------
-- 7. User A CAN insert and update OWN rows (positive control)
-- ---------------------------------------------------------------------------
begin;
select public._test_set_role('authenticated', :'user_a');
perform public._test_expect(
  public._test_attempt(format('insert into public.learning_sessions (user_id, lab_slug, title) values (%L, %L, %L)', :'user_a', 'nuclear-chain-reaction', 'A2')) = 'ok:1',
  'user A can insert own session'
);
perform public._test_expect(
  public._test_attempt(format('update public.profiles set display_name = %L where user_id = %L', 'Alice Updated', :'user_a')) = 'ok:1',
  'user A can update own profile'
);
commit;

begin; -- admin verification
perform public._test_expect(
  exists (select 1 from public.learning_sessions where user_id = :'user_a' and title = 'A2'),
  'user A inserted session exists'
);
perform public._test_expect(
  (select display_name from public.profiles where user_id = :'user_a') = 'Alice Updated',
  'user A profile update persisted'
);
commit;

-- ---------------------------------------------------------------------------
-- 8. User A deletes own rows; 9. User B unaffected; 10. A cannot delete B
-- ---------------------------------------------------------------------------
begin;
select public._test_set_role('authenticated', :'user_a');
perform public._test_expect(
  public._test_attempt(format('delete from public.learning_sessions where user_id = %L and title = %L', :'user_a', 'A2')) = 'ok:1',
  'user A deletes own session'
);
perform public._test_expect(
  public._test_attempt(format('delete from public.learning_sessions where user_id = %L', :'user_b')) = 'ok:0',
  'user A delete of user B sessions affects 0 rows'
);
perform public._test_expect(
  public._test_attempt(format('delete from public.profiles where user_id = %L', :'user_b')) = 'ok:0',
  'user A delete of user B profile affects 0 rows'
);
commit;

begin; -- admin verification
perform public._test_expect(
  not exists (select 1 from public.learning_sessions where user_id = :'user_a'),
  'user A session deleted'
);
perform public._test_expect(
  exists (select 1 from public.learning_sessions where user_id = :'user_b'),
  'user B sessions unaffected'
);
perform public._test_expect(
  exists (select 1 from public.profiles where user_id = :'user_b'),
  'user B profile unaffected'
);
perform public._test_expect(
  exists (select 1 from public.learner_preferences where user_id = :'user_b'),
  'user B preferences unaffected'
);
commit;

-- ---------------------------------------------------------------------------
-- 11. Constraints still enforced (valid enums and ranges only)
-- ---------------------------------------------------------------------------
begin;
select public._test_set_role('authenticated', :'user_a');
perform public._test_expect(
  public._test_attempt(format('insert into public.learner_preferences (user_id, learning_goal) values (%L, %L)', :'user_a', 'made_up_goal')) <> 'ok:1',
  'unsupported preference value is rejected'
);
perform public._test_expect(
  public._test_attempt(format('insert into public.learning_sessions (user_id, lab_slug, title) values (%L, %L, %L)', :'user_a', 'not-a-lab', 'X')) <> 'ok:1',
  'unknown lab slug is rejected'
);
commit;

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------
drop function public._test_set_role(text, text);
drop function public._test_attempt(text);
drop function public._test_expect(boolean, text);

raise notice 'RLS ISOLATION SUITE: ALL CHECKS PASSED';
