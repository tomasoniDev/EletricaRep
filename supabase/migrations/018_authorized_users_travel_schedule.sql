create table if not exists public.authorized_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null check (role in ('Admin', 'Diretoria', 'Engenharia', 'Montagem', 'Comercial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.authorized_users enable row level security;

insert into public.authorized_users (name, email, role)
values ('Lucas Lessa', 'lucas.lessa@tomasoni.ind.br', 'Admin')
on conflict (email) do update
set name = excluded.name,
    role = excluded.role,
    updated_at = now();

create or replace function public.is_authorized_tomasoni_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (
        lower(email) like '%@tomasoni.ind.br'
        or lower(email) like '%@tomasoni.in.br'
      )
  );
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.authorized_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.has_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('Admin', 'Diretoria'), false);
$$;

create or replace function public.authorized_email_exists(input_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.authorized_users
    where lower(email) = lower(trim(input_email))
      and (
        lower(email) like '%@tomasoni.ind.br'
        or lower(email) like '%@tomasoni.in.br'
      )
  );
$$;

grant execute on function public.authorized_email_exists(text) to anon, authenticated;

drop policy if exists "Authorized users can read own user or full access" on public.authorized_users;
drop policy if exists "Full access can manage authorized users" on public.authorized_users;

create policy "Authorized users can read own user or full access"
on public.authorized_users for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.has_full_access()
);

create policy "Full access can manage authorized users"
on public.authorized_users for all
to authenticated
using (public.has_full_access())
with check (public.has_full_access());

alter table public.service_records
add column if not exists service_start text,
add column if not exists service_end text;

create table if not exists public.travel_schedules (
  id uuid primary key default gen_random_uuid(),
  start_date text not null default '',
  end_date text not null default '',
  code text,
  client text,
  technicians text,
  status text,
  reason text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.travel_schedules enable row level security;

drop policy if exists "Authorized users can read travel schedules" on public.travel_schedules;
drop policy if exists "Commercial and full access can manage travel schedules" on public.travel_schedules;

create policy "Authorized users can read travel schedules"
on public.travel_schedules for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Commercial and full access can manage travel schedules"
on public.travel_schedules for all
to authenticated
using (public.has_full_access() or public.current_user_role() = 'Comercial')
with check (public.has_full_access() or public.current_user_role() = 'Comercial');

drop policy if exists "Tomasoni users can read machines" on public.machines;
drop policy if exists "Tomasoni users can manage machines" on public.machines;
drop policy if exists "Tomasoni users can read machine emails" on public.machine_emails;
drop policy if exists "Tomasoni users can manage machine emails" on public.machine_emails;
drop policy if exists "Tomasoni users can read technicians" on public.technicians;
drop policy if exists "Tomasoni users can manage technicians" on public.technicians;
drop policy if exists "Tomasoni users can read service records" on public.service_records;
drop policy if exists "Tomasoni users can insert service records" on public.service_records;
drop policy if exists "Service owners can update service records" on public.service_records;
drop policy if exists "Service owners can delete service records" on public.service_records;

create policy "Authorized users can read machines"
on public.machines for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Authorized users can manage machines"
on public.machines for all
to authenticated
using (
  public.has_full_access()
  or public.current_user_role() in ('Engenharia', 'Comercial')
)
with check (
  public.has_full_access()
  or public.current_user_role() in ('Engenharia', 'Comercial')
);

create policy "Authorized users can read machine emails"
on public.machine_emails for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Authorized users can manage machine emails"
on public.machine_emails for all
to authenticated
using (
  public.has_full_access()
  or public.current_user_role() in ('Engenharia', 'Comercial')
)
with check (
  public.has_full_access()
  or public.current_user_role() in ('Engenharia', 'Comercial')
);

create policy "Authorized users can read technicians"
on public.technicians for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Full access can manage technicians"
on public.technicians for all
to authenticated
using (public.has_full_access())
with check (public.has_full_access());

create policy "Authorized users can read service records"
on public.service_records for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Authorized users can insert service records"
on public.service_records for insert
to authenticated
with check (
  public.is_authorized_tomasoni_user()
  and public.current_user_role() <> 'Comercial'
  and coalesce(created_by, auth.uid()) = auth.uid()
);

create policy "Service owners can update service records"
on public.service_records for update
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and created_by = auth.uid()
)
with check (
  public.is_authorized_tomasoni_user()
  and created_by = auth.uid()
);

create policy "Service owners or full access can delete service records"
on public.service_records for delete
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and (created_by = auth.uid() or public.has_full_access())
);

create unique index if not exists machines_serial_unique_not_blank
on public.machines (serial)
where serial is not null and btrim(serial) <> '';

create unique index if not exists machines_mechanical_list_unique_not_blank
on public.machines (mechanical_list)
where mechanical_list is not null and btrim(mechanical_list) <> '';

create unique index if not exists machines_software_code_unique_not_blank
on public.machines (software_code)
where software_code is not null and btrim(software_code) <> '';
