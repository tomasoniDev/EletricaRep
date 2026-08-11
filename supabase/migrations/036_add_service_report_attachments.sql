alter table public.service_records
  add column if not exists attachments jsonb default '[]'::jsonb;

update public.service_records
set attachments = '[]'::jsonb
where attachments is null;

alter table public.service_records
  alter column attachments set default '[]'::jsonb;
