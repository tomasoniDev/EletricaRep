create or replace function public.can_access_chat_module()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (
        role = 'Admin'
        or remote_access_allowed = true
      )
      and (
        lower(email) like '%@tomasoni.ind.br'
        or lower(email) like '%@tomasoni.in.br'
      )
  );
$$;

grant execute on function public.can_access_chat_module() to authenticated;

create or replace function public.can_manage_remote_access_contacts()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (
        role = 'Admin'
        or remote_access_allowed = true
      )
      and (
        lower(email) like '%@tomasoni.ind.br'
        or lower(email) like '%@tomasoni.in.br'
      )
  );
$$;

grant execute on function public.can_manage_remote_access_contacts() to authenticated;

update public.authorized_users
set remote_access_allowed = true,
    updated_at = now()
where lower(email) in (
  'yuri.steinmetz@tomasoni.ind.br',
  'jean@tomasoni.ind.br'
);
