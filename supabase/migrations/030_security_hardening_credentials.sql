alter table public.authorized_users
add column if not exists credential_access_allowed boolean not null default false;

update public.authorized_users
set credential_access_allowed = true,
    updated_at = now()
where role = 'Admin'
   or lower(email) = 'lucas.lessa@tomasoni.ind.br';

create or replace function public.can_edit_machines()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('Admin', 'Diretoria', 'Coordenador', 'Engenharia'), false);
$$;

create or replace function public.can_access_machine_credentials()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (
        role = 'Admin'
        or credential_access_allowed = true
      )
      and (
        lower(email) like '%@tomasoni.ind.br'
        or lower(email) like '%@tomasoni.in.br'
      )
  );
$$;

grant execute on function public.can_edit_machines() to authenticated;
grant execute on function public.can_access_machine_credentials() to authenticated;

revoke execute on function public.authorized_email_exists(text) from anon;
revoke execute on function public.authorized_email_exists(text) from authenticated;
revoke execute on function public.authorized_email_exists(text) from public;

create table if not exists public.machine_credentials (
  machine_id uuid primary key references public.machines(id) on delete cascade,
  vnc_ip text,
  vnc_user text,
  vnc_password text,
  vnc_vm_password text,
  vnc_notes text,
  sinema_url text,
  sinema_user text,
  sinema_password text,
  sinema_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.machine_credentials (
  machine_id,
  vnc_ip,
  vnc_user,
  vnc_password,
  vnc_vm_password,
  vnc_notes,
  sinema_url,
  sinema_user,
  sinema_password,
  sinema_notes
)
select
  id,
  vnc_ip,
  vnc_user,
  vnc_password,
  vnc_vm_password,
  vnc_notes,
  sinema_url,
  sinema_user,
  sinema_password,
  sinema_notes
from public.machines
where coalesce(vnc_ip, vnc_user, vnc_password, vnc_vm_password, vnc_notes, sinema_url, sinema_user, sinema_password, sinema_notes) is not null
on conflict (machine_id) do update
set vnc_ip = excluded.vnc_ip,
    vnc_user = excluded.vnc_user,
    vnc_password = excluded.vnc_password,
    vnc_vm_password = excluded.vnc_vm_password,
    vnc_notes = excluded.vnc_notes,
    sinema_url = excluded.sinema_url,
    sinema_user = excluded.sinema_user,
    sinema_password = excluded.sinema_password,
    sinema_notes = excluded.sinema_notes,
    updated_at = now();

update public.machines
set vnc_ip = null,
    vnc_user = null,
    vnc_password = null,
    vnc_vm_password = null,
    vnc_notes = null,
    sinema_url = null,
    sinema_user = null,
    sinema_password = null,
    sinema_notes = null
where coalesce(vnc_ip, vnc_user, vnc_password, vnc_vm_password, vnc_notes, sinema_url, sinema_user, sinema_password, sinema_notes) is not null;

alter table public.machine_credentials enable row level security;
alter table public.machine_credentials force row level security;
revoke all on public.machine_credentials from anon;
grant select, insert, update, delete on public.machine_credentials to authenticated;

drop policy if exists "Credential users can read machine credentials" on public.machine_credentials;
drop policy if exists "Credential machine editors can insert machine credentials" on public.machine_credentials;
drop policy if exists "Credential machine editors can update machine credentials" on public.machine_credentials;
drop policy if exists "Credential machine editors can delete machine credentials" on public.machine_credentials;

create policy "Credential users can read machine credentials"
on public.machine_credentials for select
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and public.can_access_machine_credentials()
);

create policy "Credential machine editors can insert machine credentials"
on public.machine_credentials for insert
to authenticated
with check (
  public.is_authorized_tomasoni_user()
  and public.can_edit_machines()
  and public.can_access_machine_credentials()
);

create policy "Credential machine editors can update machine credentials"
on public.machine_credentials for update
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and public.can_edit_machines()
  and public.can_access_machine_credentials()
)
with check (
  public.is_authorized_tomasoni_user()
  and public.can_edit_machines()
  and public.can_access_machine_credentials()
);

create policy "Credential machine editors can delete machine credentials"
on public.machine_credentials for delete
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and public.can_edit_machines()
  and public.can_access_machine_credentials()
);

drop policy if exists "Authorized users can read machines" on public.machines;
drop policy if exists "Authorized users can manage machines" on public.machines;
drop policy if exists "Machine editors can insert machines" on public.machines;
drop policy if exists "Machine editors can update machines" on public.machines;
drop policy if exists "Machine editors can delete machines" on public.machines;

create policy "Authorized users can read machines"
on public.machines for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Machine editors can insert machines"
on public.machines for insert
to authenticated
with check (
  public.is_authorized_tomasoni_user()
  and public.can_edit_machines()
);

create policy "Machine editors can update machines"
on public.machines for update
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and public.can_edit_machines()
)
with check (
  public.is_authorized_tomasoni_user()
  and public.can_edit_machines()
);

create policy "Machine editors can delete machines"
on public.machines for delete
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and public.can_edit_machines()
);

drop policy if exists "Authorized users can read own user or user managers" on public.authorized_users;
drop policy if exists "User managers can manage authorized users" on public.authorized_users;
drop policy if exists "User managers can insert authorized users" on public.authorized_users;
drop policy if exists "User managers can update authorized users" on public.authorized_users;
drop policy if exists "User managers can delete authorized users" on public.authorized_users;

create policy "Authorized users can read own user or user managers"
on public.authorized_users for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.can_manage_authorized_users()
);

create policy "User managers can insert authorized users"
on public.authorized_users for insert
to authenticated
with check (public.can_manage_authorized_users());

create policy "User managers can update authorized users"
on public.authorized_users for update
to authenticated
using (public.can_manage_authorized_users())
with check (public.can_manage_authorized_users());

create policy "User managers can delete authorized users"
on public.authorized_users for delete
to authenticated
using (public.can_manage_authorized_users());

create or replace function public.guard_authorized_users_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email := lower(trim(new.email));

  if new.email !~ '@(tomasoni\.ind\.br|tomasoni\.in\.br)$' then
    raise exception 'domain_not_allowed' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and lower(old.email) = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'self_modification_forbidden' using errcode = '42501';
  end if;

  if coalesce(public.current_user_role() not in ('Admin', 'Diretoria'), true) then
    if new.role in ('Admin', 'Diretoria')
      or coalesce(new.remote_access_allowed, false) = true
      or coalesce(new.credential_access_allowed, false) = true then
      raise exception 'elevation_forbidden' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists authorized_users_security_guard on public.authorized_users;
create trigger authorized_users_security_guard
before insert or update on public.authorized_users
for each row execute function public.guard_authorized_users_security();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'machines',
    'machine_emails',
    'technicians',
    'service_records',
    'authorized_users',
    'travel_schedules',
    'support_contracts',
    'profiles',
    'chat_contacts',
    'chat_conversations',
    'chat_messages',
    'machine_credentials'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
    end if;
  end loop;
end $$;

-- ROLLBACK
-- drop trigger if exists authorized_users_security_guard on public.authorized_users;
-- drop function if exists public.guard_authorized_users_security();
-- drop policy if exists "Credential users can read machine credentials" on public.machine_credentials;
-- drop policy if exists "Credential machine editors can insert machine credentials" on public.machine_credentials;
-- drop policy if exists "Credential machine editors can update machine credentials" on public.machine_credentials;
-- drop policy if exists "Credential machine editors can delete machine credentials" on public.machine_credentials;
-- drop table if exists public.machine_credentials;
-- drop function if exists public.can_access_machine_credentials();
-- drop function if exists public.can_edit_machines();
-- alter table public.authorized_users drop column if exists credential_access_allowed;
