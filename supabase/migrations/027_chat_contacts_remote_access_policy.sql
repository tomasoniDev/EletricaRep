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
      and coalesce(remote_access_allowed, false) = true
      and (
        lower(email) like '%@tomasoni.ind.br'
        or lower(email) like '%@tomasoni.in.br'
      )
  );
$$;

grant execute on function public.can_manage_remote_access_contacts() to authenticated;

grant select, insert, update, delete on public.chat_contacts to authenticated;

drop policy if exists "Authorized users can read chat contacts" on public.chat_contacts;
drop policy if exists "Authorized users can manage chat contacts" on public.chat_contacts;
drop policy if exists "Remote access users can read chat contacts" on public.chat_contacts;
drop policy if exists "Remote access users can manage chat contacts" on public.chat_contacts;

create policy "Remote access users can read chat contacts"
on public.chat_contacts for select
to authenticated
using (public.can_manage_remote_access_contacts());

create policy "Remote access users can manage chat contacts"
on public.chat_contacts for all
to authenticated
using (public.can_manage_remote_access_contacts())
with check (public.can_manage_remote_access_contacts());
