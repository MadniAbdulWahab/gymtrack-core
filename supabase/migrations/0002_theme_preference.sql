-- GymTrack — synced interface appearance preference.
--
-- Additive and idempotent so it is safe to run after 0001_init.sql whether or
-- not a user_settings row already exists.

alter table public.user_settings
  add column if not exists theme text not null default 'system';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_settings'::regclass
      and conname = 'user_settings_theme_valid'
  ) then
    alter table public.user_settings
      add constraint user_settings_theme_valid
      check (theme in ('system', 'light', 'dark'));
  end if;
end
$$;
