alter table public.service_records
  add column if not exists service_type text not null default 'Acesso remoto',
  add column if not exists customer_name text,
  add column if not exists customer_signature text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_records_service_type_check'
  ) then
    alter table public.service_records
      add constraint service_records_service_type_check
      check (service_type in ('Acesso remoto', 'Visita técnica'))
      not valid;
  end if;
end $$;

alter table public.service_records
  validate constraint service_records_service_type_check;
