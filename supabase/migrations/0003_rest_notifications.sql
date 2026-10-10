-- GymTrack — device Web Push subscriptions and durable rest-timer jobs.
--
-- The browser schedules/cancels owner-scoped jobs. A short-lived pg_cron job
-- exists only while at least one rest timer is pending; it invokes the Edge
-- Function through pg_net when a job becomes due. Push credentials stay in
-- Vault/Edge Function secrets and never enter the client bundle.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists gymtrack_private;
revoke all on schema gymtrack_private from public, anon, authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.rest_notification_jobs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  claimed_at timestamptz,
  delivered_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 3),
  last_error text
);

create index rest_notification_jobs_pending_idx
  on public.rest_notification_jobs (due_at)
  where cancelled_at is null and delivered_at is null and attempts < 3;

alter table public.push_subscriptions enable row level security;
alter table public.rest_notification_jobs enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "rest_notification_jobs_select_own"
  on public.rest_notification_jobs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "rest_notification_jobs_insert_own"
  on public.rest_notification_jobs for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and due_at between now() - interval '1 minute' and now() + interval '2 hours'
    and cancelled_at is null
    and claimed_at is null
    and delivered_at is null
    and attempts = 0
  );

create policy "rest_notification_jobs_update_own"
  on public.rest_notification_jobs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and due_at between now() - interval '1 minute' and now() + interval '2 hours'
  );

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update (due_at, updated_at, cancelled_at), delete
  on public.rest_notification_jobs to authenticated;

create or replace function gymtrack_private.dispatch_due_rest_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_secret text;
  function_url text;
  due_job record;
  dispatcher_job_id bigint;
begin
  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets
  where name = 'rest_push_dispatch_secret';

  select decrypted_secret into function_url
  from vault.decrypted_secrets
  where name = 'rest_push_function_url';

  if dispatch_secret is null or function_url is null then
    return;
  end if;

  for due_job in
    with due as (
      select id
      from public.rest_notification_jobs
      where cancelled_at is null
        and delivered_at is null
        and attempts < 3
        and due_at <= clock_timestamp()
        and (claimed_at is null or claimed_at < clock_timestamp() - interval '30 seconds')
      order by due_at
      for update skip locked
      limit 20
    )
    update public.rest_notification_jobs as jobs
    set claimed_at = clock_timestamp(),
        attempts = jobs.attempts + 1,
        updated_at = clock_timestamp()
    from due
    where jobs.id = due.id
    returning jobs.id
  loop
    perform net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-rest-push-secret', dispatch_secret
      ),
      body := jsonb_build_object('job_id', due_job.id),
      timeout_milliseconds := 5000
    );
  end loop;

  -- Serialize this check with the insert trigger so a newly committed timer
  -- cannot be stranded while the temporary dispatcher is being removed.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gymtrack-rest-push'));
  if not exists (
    select 1
    from public.rest_notification_jobs
    where cancelled_at is null and delivered_at is null and attempts < 3
  ) then
    select jobid into dispatcher_job_id
    from cron.job
    where jobname = 'gymtrack-rest-push-dispatcher';

    if dispatcher_job_id is not null then
      perform cron.unschedule(dispatcher_job_id);
    end if;
  end if;
end;
$$;

revoke all on function gymtrack_private.dispatch_due_rest_notifications() from public;

create or replace function gymtrack_private.ensure_rest_notification_dispatcher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gymtrack-rest-push'));

  if new.cancelled_at is null
    and new.delivered_at is null
    and new.attempts < 3
    and not exists (
      select 1 from cron.job where jobname = 'gymtrack-rest-push-dispatcher'
    )
  then
    perform cron.schedule(
      'gymtrack-rest-push-dispatcher',
      '1 second',
      'select gymtrack_private.dispatch_due_rest_notifications()'
    );
  end if;

  return new;
end;
$$;

revoke all on function gymtrack_private.ensure_rest_notification_dispatcher() from public;

create trigger ensure_rest_notification_dispatcher
after insert or update of due_at, cancelled_at
on public.rest_notification_jobs
for each row execute function gymtrack_private.ensure_rest_notification_dispatcher();
