alter table public.authorized_users
drop constraint if exists authorized_users_role_check;

alter table public.authorized_users
add constraint authorized_users_role_check
check (role in (
  'Admin',
  'Diretoria',
  'Coordenador',
  'Engenharia',
  'Montagem',
  'Montagem Elétrica',
  'Montagem Mecânica',
  'Controladoria',
  'Comercial'
));

alter table public.service_records
add column if not exists technician_role text;

update public.service_records sr
set technician_role = au.role
from public.authorized_users au
where sr.technician_role is null
  and lower(sr.technician_email) = lower(au.email);

create or replace function public.can_emit_service_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in (
    'Admin',
    'Diretoria',
    'Coordenador',
    'Engenharia',
    'Montagem',
    'Montagem Elétrica',
    'Montagem Mecânica'
  ), false);
$$;

grant execute on function public.can_emit_service_reports() to authenticated;

drop policy if exists "Authorized users can insert service records" on public.service_records;
drop policy if exists "Service owners can update service records" on public.service_records;
drop policy if exists "Service owners or full access can delete service records" on public.service_records;

create policy "Authorized users can insert service records"
on public.service_records for insert
to authenticated
with check (
  public.is_authorized_tomasoni_user()
  and public.can_emit_service_reports()
  and coalesce(created_by, auth.uid()) = auth.uid()
);

create policy "Service owners can update service records"
on public.service_records for update
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and public.can_emit_service_reports()
  and created_by = auth.uid()
)
with check (
  public.is_authorized_tomasoni_user()
  and public.can_emit_service_reports()
  and created_by = auth.uid()
);

create policy "Service owners or full access can delete service records"
on public.service_records for delete
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and (
    public.has_full_access()
    or (
      public.can_emit_service_reports()
      and created_by = auth.uid()
    )
  )
);

create or replace function public.guard_authorized_users_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  operator_email text;
  operator_role text;
  is_self_update boolean;
begin
  new.email := lower(trim(new.email));

  if new.email !~ '@(tomasoni\.ind\.br|tomasoni\.in\.br)$' then
    raise exception 'domain_not_allowed' using errcode = '42501';
  end if;

  operator_email := lower(nullif(current_setting('app.operator_email', true), ''));
  if operator_email is null then
    operator_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  end if;

  select role
  into operator_role
  from public.authorized_users
  where lower(email) = operator_email
  limit 1;

  is_self_update := tg_op = 'UPDATE'
    and operator_email <> ''
    and lower(old.email) = operator_email;

  if is_self_update then
    if lower(new.email) <> lower(old.email)
      or new.role is distinct from old.role
      or coalesce(new.remote_access_allowed, false) is distinct from coalesce(old.remote_access_allowed, false)
      or coalesce(new.credential_access_allowed, false) is distinct from coalesce(old.credential_access_allowed, false) then
      raise exception 'self_elevation_forbidden' using errcode = '42501';
    end if;

    new.updated_at := now();
    return new;
  end if;

  if operator_role in ('Admin', 'Diretoria') then
    new.updated_at := now();
    return new;
  end if;

  if operator_role = 'Coordenador' then
    if new.role in ('Admin', 'Diretoria', 'Coordenador') then
      raise exception 'elevation_forbidden' using errcode = '42501';
    end if;

    new.updated_at := now();
    return new;
  end if;

  if new.role in ('Admin', 'Diretoria', 'Coordenador')
    or coalesce(new.remote_access_allowed, false) = true
    or coalesce(new.credential_access_allowed, false) = true then
    raise exception 'elevation_forbidden' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.save_authorized_user_as_operator(
  input_operator_email text,
  input_id uuid,
  input_name text,
  input_email text,
  input_role text,
  input_remote_access_allowed boolean,
  input_credential_access_allowed boolean,
  input_phone text
)
returns public.authorized_users
language plpgsql
security definer
set search_path = public
as $$
declare
  operator_role text;
  saved_user public.authorized_users;
begin
  select role
  into operator_role
  from public.authorized_users
  where lower(email) = lower(trim(input_operator_email))
  limit 1;

  if operator_role not in ('Admin', 'Diretoria', 'Coordenador') then
    raise exception 'manage_users_forbidden' using errcode = '42501';
  end if;

  perform set_config('app.operator_email', lower(trim(input_operator_email)), true);

  if input_id is null then
    insert into public.authorized_users (
      name,
      email,
      role,
      remote_access_allowed,
      credential_access_allowed,
      phone
    )
    values (
      nullif(trim(input_name), ''),
      lower(trim(input_email)),
      coalesce(nullif(trim(input_role), ''), 'Montagem Elétrica'),
      coalesce(input_remote_access_allowed, false),
      coalesce(input_credential_access_allowed, false),
      nullif(regexp_replace(coalesce(input_phone, ''), '\D', '', 'g'), '')
    )
    returning * into saved_user;
  else
    update public.authorized_users
    set
      name = nullif(trim(input_name), ''),
      email = lower(trim(input_email)),
      role = coalesce(nullif(trim(input_role), ''), 'Montagem Elétrica'),
      remote_access_allowed = coalesce(input_remote_access_allowed, false),
      credential_access_allowed = coalesce(input_credential_access_allowed, false),
      phone = nullif(regexp_replace(coalesce(input_phone, ''), '\D', '', 'g'), '')
    where id = input_id
    returning * into saved_user;
  end if;

  if saved_user.id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  return saved_user;
end;
$$;

revoke all on function public.save_authorized_user_as_operator(text, uuid, text, text, text, boolean, boolean, text) from public;
grant execute on function public.save_authorized_user_as_operator(text, uuid, text, text, text, boolean, boolean, text) to service_role;
