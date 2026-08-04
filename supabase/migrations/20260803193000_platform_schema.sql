-- UnseenLab personalized platform schema (profiles, learner_preferences, learning_sessions).
--
-- Design notes
-- ------------
-- * RLS is enabled on every exposed table; all ownership policies combine
--   `to authenticated` with an explicit `(select auth.uid()) = user_id` predicate.
-- * Authorization never reads `user_metadata` (user-editable). Profile display
--   fields copied from `raw_user_meta_data` are presentation-only.
-- * UPDATE policies carry both USING and WITH CHECK so user_id can never be
--   reassigned.
-- * The `handle_new_user()` trigger function is SECURITY DEFINER because it must
--   write to `public.profiles` from the `auth` schema on signup; it is not
--   callable by any role (EXECUTE revoked from public/anon/authenticated).
-- * Data API exposure: if the project's Data API settings do not auto-expose
--   new tables, the explicit GRANTs below are required. RLS is enforced
--   independently of grants.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_avatar text;
begin
  -- Presentation-only fields. Hostile or oversized metadata must never abort
  -- the auth.users insert, so values are clamped and sanitized here.
  v_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is not null then
    v_name := left(v_name, 60);
  end if;
  v_avatar := nullif(new.raw_user_meta_data ->> 'avatar_url', '');
  if v_avatar is not null
     and not (v_avatar like 'https://%' or v_avatar like 'http://localhost%') then
    v_avatar := null;
  end if;
  if v_avatar is not null then
    v_avatar := left(v_avatar, 2048);
  end if;
  insert into public.profiles (user_id, display_name, avatar_url)
  values (new.id, v_name, v_avatar)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  onboarding_version integer not null default 0,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 60),
  constraint profiles_avatar_url_safe
    check (
      avatar_url is null
      or (
        char_length(avatar_url) <= 2048
        and (avatar_url like 'https://%' or avatar_url like 'http://localhost%')
      )
    ),
  constraint profiles_onboarding_version_valid check (onboarding_version >= 0)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- learner_preferences
-- ---------------------------------------------------------------------------

create table public.learner_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  learning_goal text not null default 'understand_concept',
  preferred_representation text not null default 'animation',
  explanation_style text not null default 'step_by_step',
  learning_pace text not null default 'balanced',
  animation_speed numeric not null default 1,
  information_density text not null default 'medium',
  reduced_motion boolean not null default false,
  high_contrast boolean not null default false,
  text_scale numeric not null default 1,
  one_variable_mode boolean not null default true,
  topic_interests text[] not null default '{}',
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_preferences_goal_valid
    check (learning_goal in ('understand_concept', 'prepare_for_class', 'explore_experiments')),
  constraint learner_preferences_representation_valid
    check (preferred_representation in ('animation', 'graph', 'equation', 'causal', 'plain_language')),
  constraint learner_preferences_explanation_valid
    check (explanation_style in ('visual_first', 'step_by_step', 'concise')),
  constraint learner_preferences_pace_valid
    check (learning_pace in ('calm', 'balanced', 'quick')),
  constraint learner_preferences_density_valid
    check (information_density in ('low', 'medium', 'full')),
  constraint learner_preferences_animation_speed_range
    check (animation_speed between 0.25 and 2),
  constraint learner_preferences_text_scale_range
    check (text_scale between 1 and 1.5),
  constraint learner_preferences_schema_version_valid check (schema_version >= 1),
  constraint learner_preferences_topic_interests_bounded
    check (
      array_length(topic_interests, 1) is null
      or (
        array_length(topic_interests, 1) <= 12
        and char_length(array_to_string(topic_interests, '')) <= 500
      )
    )
);

create trigger learner_preferences_set_updated_at
  before update on public.learner_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- learning_sessions
-- ---------------------------------------------------------------------------

create table public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lab_slug text not null,
  status text not null default 'active',
  title text not null,
  schema_version integer not null default 1,
  evidence jsonb not null default '{}'::jsonb,
  workflow jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint learning_sessions_lab_slug_known
    check (lab_slug in ('nuclear-chain-reaction')),
  constraint learning_sessions_status_known check (status in ('active', 'complete')),
  constraint learning_sessions_title_bounded check (char_length(title) between 1 and 120),
  constraint learning_sessions_schema_version_valid check (schema_version >= 1),
  constraint learning_sessions_evidence_object check (jsonb_typeof(evidence) = 'object'),
  constraint learning_sessions_workflow_object check (jsonb_typeof(workflow) = 'object')
);

create index learning_sessions_user_updated_idx
  on public.learning_sessions (user_id, updated_at desc);

create index learning_sessions_user_lab_updated_idx
  on public.learning_sessions (user_id, lab_slug, updated_at desc);

create trigger learning_sessions_set_updated_at
  before update on public.learning_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth-triggered profile creation
-- ---------------------------------------------------------------------------

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.learner_preferences enable row level security;
alter table public.learning_sessions enable row level security;

-- profiles: own-row access only
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- learner_preferences: own-row access only
create policy "learner_preferences_select_own"
  on public.learner_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "learner_preferences_insert_own"
  on public.learner_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "learner_preferences_update_own"
  on public.learner_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "learner_preferences_delete_own"
  on public.learner_preferences for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- learning_sessions: own-row access only
create policy "learning_sessions_select_own"
  on public.learning_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "learning_sessions_insert_own"
  on public.learning_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "learning_sessions_update_own"
  on public.learning_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "learning_sessions_delete_own"
  on public.learning_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Data API grants (separate from RLS)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.learner_preferences to authenticated;
grant select, insert, update, delete on public.learning_sessions to authenticated;

-- Explicitly revoke anon so grants are unambiguous on projects with default
-- privileges that would otherwise hand the anon role table access. RLS is
-- enforced independently of grants, so this is defense in depth.
revoke all on public.profiles from anon;
revoke all on public.learner_preferences from anon;
revoke all on public.learning_sessions from anon;
