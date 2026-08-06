create or replace function public.guard_authorized_users_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  operator_email text;
  operator_role text;
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

  if tg_op = 'UPDATE' and operator_email <> '' and lower(old.email) = operator_email then
    raise exception 'self_modification_forbidden' using errcode = '42501';
  end if;

  if coalesce(operator_role not in ('Admin', 'Diretoria'), true) then
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

create or replace function public.save_authorized_user_as_operator(
  input_operator_email text,
  input_id uuid,
  input_name text,
  input_email text,
  input_role text,
  input_remote_access_allowed boolean,
  input_credential_access_allowed boolean
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
      credential_access_allowed
    )
    values (
      nullif(trim(input_name), ''),
      lower(trim(input_email)),
      coalesce(nullif(trim(input_role), ''), 'Montagem'),
      coalesce(input_remote_access_allowed, false),
      coalesce(input_credential_access_allowed, false)
    )
    returning * into saved_user;
  else
    update public.authorized_users
    set
      name = nullif(trim(input_name), ''),
      email = lower(trim(input_email)),
      role = coalesce(nullif(trim(input_role), ''), 'Montagem'),
      remote_access_allowed = coalesce(input_remote_access_allowed, false),
      credential_access_allowed = coalesce(input_credential_access_allowed, false)
    where id = input_id
    returning * into saved_user;
  end if;

  if saved_user.id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  return saved_user;
end;
$$;

revoke all on function public.save_authorized_user_as_operator(text, uuid, text, text, text, boolean, boolean) from public;
grant execute on function public.save_authorized_user_as_operator(text, uuid, text, text, text, boolean, boolean) to service_role;
