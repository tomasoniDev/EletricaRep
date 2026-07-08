alter table public.machines
add column if not exists mechanical_list text,
add column if not exists remote_access text,
add column if not exists vnc_ip text,
add column if not exists vnc_user text,
add column if not exists vnc_password text,
add column if not exists vnc_vm_password text,
add column if not exists vnc_notes text,
add column if not exists sinema_url text,
add column if not exists sinema_user text,
add column if not exists sinema_password text,
add column if not exists sinema_notes text,
add column if not exists support_contract_active boolean,
add column if not exists support_contract_until date;

create table if not exists public.machine_components (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  machine_name text not null,
  electrical_project text not null,
  project_folder_link text,
  ip_range text,
  created_at timestamptz not null default now()
);

create index if not exists idx_machine_components_machine_id
on public.machine_components(machine_id);

alter table public.machine_components enable row level security;

drop policy if exists "Tomasoni users can read machine components" on public.machine_components;
drop policy if exists "Tomasoni users can manage machine components" on public.machine_components;

create policy "Tomasoni users can read machine components"
on public.machine_components for select
to authenticated
using (public.is_tomasoni_user());

create policy "Tomasoni users can manage machine components"
on public.machine_components for all
to authenticated
using (public.is_tomasoni_user())
with check (public.is_tomasoni_user());
