create extension if not exists pgcrypto;

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  model text not null,
  client text not null,
  serial text,
  software_version text,
  access_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machine_emails (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  technician_id uuid references public.technicians(id) on delete set null,
  technician_name text not null,
  technician_email text,
  service_date date not null,
  equipment text,
  request text not null,
  diagnosis text not null,
  service_done text not null,
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_machines_updated_at on public.machines;
create trigger set_machines_updated_at
before update on public.machines
for each row execute function public.set_updated_at();

drop trigger if exists set_technicians_updated_at on public.technicians;
create trigger set_technicians_updated_at
before update on public.technicians
for each row execute function public.set_updated_at();

drop trigger if exists set_service_records_updated_at on public.service_records;
create trigger set_service_records_updated_at
before update on public.service_records
for each row execute function public.set_updated_at();

create index if not exists idx_machine_emails_machine_id on public.machine_emails(machine_id);
create index if not exists idx_service_records_machine_id on public.service_records(machine_id);
create index if not exists idx_service_records_service_date on public.service_records(service_date desc);

alter table public.machines enable row level security;
alter table public.machine_emails enable row level security;
alter table public.technicians enable row level security;
alter table public.service_records enable row level security;

create policy "Authenticated users can read machines"
on public.machines for select
to authenticated
using (true);

create policy "Authenticated users can manage machines"
on public.machines for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read machine emails"
on public.machine_emails for select
to authenticated
using (true);

create policy "Authenticated users can manage machine emails"
on public.machine_emails for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read technicians"
on public.technicians for select
to authenticated
using (true);

create policy "Authenticated users can manage technicians"
on public.technicians for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read service records"
on public.service_records for select
to authenticated
using (true);

create policy "Authenticated users can manage service records"
on public.service_records for all
to authenticated
using (true)
with check (true);
