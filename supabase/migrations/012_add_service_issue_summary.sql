alter table public.service_records
  add column if not exists issue_summary text;
