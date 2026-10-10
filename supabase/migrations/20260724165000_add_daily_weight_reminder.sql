-- Synced opt-out for the daily body-weight check-in.
-- Additive and idempotent so it is safe for existing user_settings rows.

alter table public.user_settings
  add column if not exists daily_weight_reminder boolean not null default true;

comment on column public.user_settings.daily_weight_reminder is
  'Whether GymTrack shows the daily in-app body-weight check-in.';

notify pgrst, 'reload schema';
