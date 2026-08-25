alter table public.service_records
  add column if not exists support_technicians jsonb not null default '[]'::jsonb;

update public.service_records
set support_technicians = '[]'::jsonb
where support_technicians is null;
