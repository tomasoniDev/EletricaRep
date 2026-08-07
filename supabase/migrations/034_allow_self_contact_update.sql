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
