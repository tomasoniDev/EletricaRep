create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

insert into public.app_settings (key, value)
values (
  'sharepoint_client_secret_rotation',
  jsonb_build_object(
    'rotated_at', '2026-08-10',
    'rotation_days', 180
  )
)
on conflict (key) do nothing;

drop policy if exists "Full access can read app settings" on public.app_settings;
drop policy if exists "Full access can manage app settings" on public.app_settings;

create policy "Full access can read app settings"
on public.app_settings for select
to authenticated
using (public.has_full_access());

create policy "Full access can manage app settings"
on public.app_settings for all
to authenticated
using (public.has_full_access())
with check (public.has_full_access());
