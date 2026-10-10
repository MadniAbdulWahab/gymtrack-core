-- First-class cardio tracking. Cardio entries are intentionally separate from
-- strength sets so distance/time analytics never depend on fake reps or weight.

alter table public.exercises
  add column if not exists tracking_type text not null default 'strength';

alter table public.exercises
  drop constraint if exists exercises_tracking_type_check;
alter table public.exercises
  add constraint exercises_tracking_type_check
  check (tracking_type in ('strength', 'cardio'));

alter table public.routine_exercises
  add column if not exists target_duration_seconds integer not null default 0,
  add column if not exists target_distance_meters numeric not null default 0;

alter table public.routine_exercises
  drop constraint if exists routine_exercises_target_duration_seconds_check;
alter table public.routine_exercises
  add constraint routine_exercises_target_duration_seconds_check
  check (target_duration_seconds >= 0);
alter table public.routine_exercises
  drop constraint if exists routine_exercises_target_distance_meters_check;
alter table public.routine_exercises
  add constraint routine_exercises_target_distance_meters_check
  check (target_distance_meters >= 0);

alter table public.workout_exercises
  add column if not exists target_duration_seconds integer not null default 0,
  add column if not exists target_distance_meters numeric not null default 0;

alter table public.workout_exercises
  drop constraint if exists workout_exercises_target_duration_seconds_check;
alter table public.workout_exercises
  add constraint workout_exercises_target_duration_seconds_check
  check (target_duration_seconds >= 0);
alter table public.workout_exercises
  drop constraint if exists workout_exercises_target_distance_meters_check;
alter table public.workout_exercises
  add constraint workout_exercises_target_distance_meters_check
  check (target_distance_meters >= 0);

create table if not exists public.cardio_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  workout_id text not null,
  workout_exercise_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  paused_at timestamptz,
  paused_duration_ms bigint not null default 0 check (paused_duration_ms >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  distance_meters numeric not null default 0 check (distance_meters >= 0),
  calories numeric not null default 0 check (calories >= 0),
  incline numeric not null default 0 check (incline >= 0),
  resistance numeric not null default 0 check (resistance >= 0),
  done boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists cardio_entries_pull_idx
  on public.cardio_entries (user_id, updated_at);
create index if not exists cardio_entries_workout_idx
  on public.cardio_entries (user_id, workout_id);

alter table public.cardio_entries enable row level security;

drop policy if exists "cardio_entries_select_own" on public.cardio_entries;
create policy "cardio_entries_select_own" on public.cardio_entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "cardio_entries_insert_own" on public.cardio_entries;
create policy "cardio_entries_insert_own" on public.cardio_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "cardio_entries_update_own" on public.cardio_entries;
create policy "cardio_entries_update_own" on public.cardio_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "cardio_entries_delete_own" on public.cardio_entries;
create policy "cardio_entries_delete_own" on public.cardio_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.cardio_entries to authenticated;

