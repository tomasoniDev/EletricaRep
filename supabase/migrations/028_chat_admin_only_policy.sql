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
      and role = 'Admin'
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
      and role = 'Admin'
      and (
        lower(email) like '%@tomasoni.ind.br'
        or lower(email) like '%@tomasoni.in.br'
      )
  );
$$;

grant execute on function public.can_manage_remote_access_contacts() to authenticated;

drop policy if exists "Authorized users can read chat conversations" on public.chat_conversations;
drop policy if exists "Authorized users can manage chat conversations" on public.chat_conversations;
drop policy if exists "Authorized users can update chat conversations" on public.chat_conversations;
drop policy if exists "Admin users can read chat conversations" on public.chat_conversations;
drop policy if exists "Admin users can insert chat conversations" on public.chat_conversations;
drop policy if exists "Admin users can update chat conversations" on public.chat_conversations;

create policy "Admin users can read chat conversations"
on public.chat_conversations for select
to authenticated
using (public.can_access_chat_module());

create policy "Admin users can insert chat conversations"
on public.chat_conversations for insert
to authenticated
with check (public.can_access_chat_module());

create policy "Admin users can update chat conversations"
on public.chat_conversations for update
to authenticated
using (public.can_access_chat_module())
with check (public.can_access_chat_module());

drop policy if exists "Authorized users can read chat messages" on public.chat_messages;
drop policy if exists "Authorized users can create chat messages" on public.chat_messages;
drop policy if exists "Admin users can read chat messages" on public.chat_messages;
drop policy if exists "Admin users can create chat messages" on public.chat_messages;

create policy "Admin users can read chat messages"
on public.chat_messages for select
to authenticated
using (
  public.can_access_chat_module()
  and exists (
    select 1
    from public.chat_conversations conversation
    where conversation.id = chat_messages.conversation_id
  )
);

create policy "Admin users can create chat messages"
on public.chat_messages for insert
to authenticated
with check (
  public.can_access_chat_module()
  and direction in ('outbound', 'system')
);
