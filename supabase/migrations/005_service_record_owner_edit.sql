alter table public.service_records
add column if not exists created_by uuid references auth.users(id) default auth.uid();

drop policy if exists "Tomasoni users can manage service records" on public.service_records;

create policy "Tomasoni users can insert service records"
on public.service_records for insert
to authenticated
with check (
  public.is_tomasoni_user()
  and coalesce(created_by, auth.uid()) = auth.uid()
);

create policy "Service owners can update service records"
on public.service_records for update
to authenticated
using (
  public.is_tomasoni_user()
  and created_by = auth.uid()
)
with check (
  public.is_tomasoni_user()
  and created_by = auth.uid()
);

create policy "Service owners can delete service records"
on public.service_records for delete
to authenticated
using (
  public.is_tomasoni_user()
  and created_by = auth.uid()
);
