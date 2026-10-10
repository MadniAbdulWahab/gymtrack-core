-- Existing routines were already treated as saved. New clients explicitly
-- send null for recoverable drafts and a timestamp after Save/Start.
alter table public.routines
  add column if not exists saved_at timestamptz;

update public.routines
set saved_at = created_at
where saved_at is null;

-- Older clients omit this column, so keep their newly inserted routines saved.
-- The new client sends an explicit null when it intentionally creates a draft.
alter table public.routines
  alter column saved_at set default now();

comment on column public.routines.saved_at is
  'Null while a newly created routine is a recoverable draft; set after explicit save or start.';
