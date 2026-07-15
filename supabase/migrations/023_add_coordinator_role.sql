alter table public.authorized_users
drop constraint if exists authorized_users_role_check;

alter table public.authorized_users
add constraint authorized_users_role_check
check (role in ('Admin', 'Diretoria', 'Coordenador', 'Engenharia', 'Montagem', 'Comercial'));

create or replace function public.can_manage_authorized_users()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(public.has_full_access() or public.current_user_role() = 'Coordenador', false);
$$;

grant execute on function public.can_manage_authorized_users() to authenticated;

drop policy if exists "Authorized users can read own user or full access" on public.authorized_users;
drop policy if exists "Full access can manage authorized users" on public.authorized_users;
drop policy if exists "Authorized users can read own user or user managers" on public.authorized_users;
drop policy if exists "User managers can manage authorized users" on public.authorized_users;

create policy "Authorized users can read own user or user managers"
on public.authorized_users for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.can_manage_authorized_users()
);

create policy "User managers can manage authorized users"
on public.authorized_users for all
to authenticated
using (public.can_manage_authorized_users())
with check (public.can_manage_authorized_users());

drop policy if exists "Authorized users can manage machines" on public.machines;
create policy "Authorized users can manage machines"
on public.machines for all
to authenticated
using (
  public.has_full_access()
  or public.current_user_role() in ('Coordenador', 'Engenharia')
)
with check (
  public.has_full_access()
  or public.current_user_role() in ('Coordenador', 'Engenharia')
);

drop policy if exists "Authorized users can manage machine emails" on public.machine_emails;
create policy "Authorized users can manage machine emails"
on public.machine_emails for all
to authenticated
using (
  public.has_full_access()
  or public.current_user_role() in ('Coordenador', 'Engenharia')
)
with check (
  public.has_full_access()
  or public.current_user_role() in ('Coordenador', 'Engenharia')
);
