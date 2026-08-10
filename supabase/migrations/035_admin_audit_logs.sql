create table if not exists public.app_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text,
  entity_id uuid,
  entity_label text,
  user_id uuid,
  user_email text,
  user_name text,
  user_role text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_audit_logs_created_at_idx
  on public.app_audit_logs (created_at desc);

create index if not exists app_audit_logs_user_email_idx
  on public.app_audit_logs (lower(user_email));

create index if not exists app_audit_logs_entity_idx
  on public.app_audit_logs (entity, entity_id);

alter table public.app_audit_logs enable row level security;

revoke all on public.app_audit_logs from anon, authenticated;
