create or replace function public.is_tomasoni_user()
returns boolean
language sql
stable
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) like '%@tomasoni.ind.br'
    or lower(coalesce(auth.jwt() ->> 'email', '')) like '%@tomasoni.in.br';
$$;

drop policy if exists "Authenticated users can read machines" on public.machines;
drop policy if exists "Authenticated users can manage machines" on public.machines;
drop policy if exists "Authenticated users can read machine emails" on public.machine_emails;
drop policy if exists "Authenticated users can manage machine emails" on public.machine_emails;
drop policy if exists "Authenticated users can read technicians" on public.technicians;
drop policy if exists "Authenticated users can manage technicians" on public.technicians;
drop policy if exists "Authenticated users can read service records" on public.service_records;
drop policy if exists "Authenticated users can manage service records" on public.service_records;

create policy "Tomasoni users can read machines"
on public.machines for select
to authenticated
using (public.is_tomasoni_user());

create policy "Tomasoni users can manage machines"
on public.machines for all
to authenticated
using (public.is_tomasoni_user())
with check (public.is_tomasoni_user());

create policy "Tomasoni users can read machine emails"
on public.machine_emails for select
to authenticated
using (public.is_tomasoni_user());

create policy "Tomasoni users can manage machine emails"
on public.machine_emails for all
to authenticated
using (public.is_tomasoni_user())
with check (public.is_tomasoni_user());

create policy "Tomasoni users can read technicians"
on public.technicians for select
to authenticated
using (public.is_tomasoni_user());

create policy "Tomasoni users can manage technicians"
on public.technicians for all
to authenticated
using (public.is_tomasoni_user())
with check (public.is_tomasoni_user());

create policy "Tomasoni users can read service records"
on public.service_records for select
to authenticated
using (public.is_tomasoni_user());

create policy "Tomasoni users can manage service records"
on public.service_records for all
to authenticated
using (public.is_tomasoni_user())
with check (public.is_tomasoni_user());
