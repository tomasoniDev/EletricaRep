create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Tomasoni users can read own profile" on public.profiles;
create policy "Tomasoni users can read own profile"
on public.profiles for select
to authenticated
using (
  public.is_tomasoni_user()
  and user_id = (select auth.uid())
);

drop policy if exists "Tomasoni users can insert own profile" on public.profiles;
create policy "Tomasoni users can insert own profile"
on public.profiles for insert
to authenticated
with check (
  public.is_tomasoni_user()
  and user_id = (select auth.uid())
);

drop policy if exists "Tomasoni users can update own profile" on public.profiles;
create policy "Tomasoni users can update own profile"
on public.profiles for update
to authenticated
using (
  public.is_tomasoni_user()
  and user_id = (select auth.uid())
)
with check (
  public.is_tomasoni_user()
  and user_id = (select auth.uid())
);
