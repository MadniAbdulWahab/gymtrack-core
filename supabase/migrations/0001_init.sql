-- GymTrack — initial schema (phase 5: durable backup/sync source of truth)
--
-- Mirrors the on-device Dexie schema. The client is the write authority:
-- it generates ids (text; builtin/starter seeds are not UUIDs) and manages
-- created_at/updated_at/deleted_at. Conflict resolution is last-write-wins
-- per row via plain upsert (single user; PRODUCT_DECISIONS §Data and sync).
--
-- Primary keys are (user_id, id) because seed ids ('builtin-…', 'starter-…')
-- are identical for every user. Referential integrity across tables is
-- maintained by the client; RLS confines any inconsistency to the owner.
-- Rows are soft-deleted (deleted_at) and never hard-deleted by the client.

-- ---------- tables ----------

create table public.exercises (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  is_custom boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.routines (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  position integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.routine_exercises (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  routine_id text not null,
  exercise_id text not null,
  position integer not null,
  target_sets integer not null check (target_sets between 1 and 100),
  rep_min integer not null check (rep_min between 1 and 1000),
  rep_max integer not null check (rep_max between 1 and 1000),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 3600),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.workouts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  routine_id text,
  started_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  paused_at timestamptz,
  paused_duration_ms bigint not null default 0 check (paused_duration_ms >= 0),
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.workout_exercises (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  workout_id text not null,
  exercise_id text not null,
  position integer not null,
  notes text not null default '',
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 3600),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.sets (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  workout_id text not null,
  workout_exercise_id text not null,
  position integer not null,
  type text not null check (type in ('warmup', 'working', 'drop', 'failure')),
  weight numeric not null check (weight >= 0),
  unit text not null check (unit in ('kg', 'lb')),
  weight_kg numeric not null check (weight_kg >= 0),
  reps integer not null check (reps >= 0),
  done boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.body_weight (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  measured_at timestamptz not null,
  weight numeric not null check (weight > 0),
  unit text not null check (unit in ('kg', 'lb')),
  weight_kg numeric not null check (weight_kg > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- One preferences row per user (the local 'app' settings row).
create table public.user_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  unit text not null check (unit in ('kg', 'lb')),
  rest_seconds integer not null check (rest_seconds between 0 and 3600),
  increment_kg numeric not null check (increment_kg > 0),
  increment_lb numeric not null check (increment_lb > 0),
  updated_at timestamptz not null,
  primary key (user_id)
);

-- ---------- indexes (incremental pull: user_id + updated_at cursor) ----------

create index exercises_pull_idx on public.exercises (user_id, updated_at);
create index routines_pull_idx on public.routines (user_id, updated_at);
create index routine_exercises_pull_idx on public.routine_exercises (user_id, updated_at);
create index workouts_pull_idx on public.workouts (user_id, updated_at);
create index workout_exercises_pull_idx on public.workout_exercises (user_id, updated_at);
create index sets_pull_idx on public.sets (user_id, updated_at);
create index body_weight_pull_idx on public.body_weight (user_id, updated_at);

-- ---------- row level security: owner-only, all four verbs ----------
-- (select auth.uid()) is evaluated once per query, not per row.

alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;
alter table public.body_weight enable row level security;
alter table public.user_settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'exercises', 'routines', 'routine_exercises', 'workouts',
    'workout_exercises', 'sets', 'body_weight', 'user_settings'
  ]
  loop
    execute format($p$
      create policy "%1$s_select_own" on public.%1$I
        for select to authenticated
        using ((select auth.uid()) = user_id);
    $p$, t);
    execute format($p$
      create policy "%1$s_insert_own" on public.%1$I
        for insert to authenticated
        with check ((select auth.uid()) = user_id);
    $p$, t);
    execute format($p$
      create policy "%1$s_update_own" on public.%1$I
        for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id);
    $p$, t);
    execute format($p$
      create policy "%1$s_delete_own" on public.%1$I
        for delete to authenticated
        using ((select auth.uid()) = user_id);
    $p$, t);
  end loop;
end
$$;

-- ---------- grants ----------
-- Since 2026-04, new tables are NOT auto-exposed to the Data API; grant
-- table access to signed-in users explicitly. anon gets nothing.

grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.routines to authenticated;
grant select, insert, update, delete on public.routine_exercises to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;
grant select, insert, update, delete on public.workout_exercises to authenticated;
grant select, insert, update, delete on public.sets to authenticated;
grant select, insert, update, delete on public.body_weight to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
