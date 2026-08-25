alter table public.service_records
  add column if not exists report_status text not null default 'Finalizado',
  add column if not exists report_recipients text[] not null default '{}'::text[];

update public.service_records
set report_status = 'Finalizado'
where report_status is null;

update public.service_records
set report_recipients = '{}'::text[]
where report_recipients is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_records_report_status_check'
  ) then
    alter table public.service_records
      add constraint service_records_report_status_check
      check (report_status in ('Rascunho', 'Finalizado'));
  end if;
end $$;

alter table public.service_records
  validate constraint service_records_report_status_check;
