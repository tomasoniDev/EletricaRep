alter table public.authorized_users
add column if not exists phone text;

alter table public.service_records
add column if not exists technician_phone text;

update public.service_records sr
set technician_phone = au.phone
from public.authorized_users au
where sr.technician_phone is null
  and lower(sr.technician_email) = lower(au.email)
  and au.phone is not null;

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
      coalesce(nullif(trim(input_role), ''), 'Montagem'),
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
      role = coalesce(nullif(trim(input_role), ''), 'Montagem'),
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
