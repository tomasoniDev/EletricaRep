create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_phone text not null,
  customer_name text,
  status text not null default 'open' check (status in ('open', 'assigned', 'closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_to_email text,
  assigned_to_name text,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  body text not null default '',
  whatsapp_message_id text,
  sender_phone text,
  sender_name text,
  sender_email text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

grant select, insert, update on public.chat_conversations to authenticated;
grant select, insert on public.chat_messages to authenticated;

create index if not exists idx_chat_conversations_status
on public.chat_conversations(status);

create index if not exists idx_chat_conversations_assigned_to
on public.chat_conversations(assigned_to);

create index if not exists idx_chat_conversations_last_message_at
on public.chat_conversations(last_message_at desc);

create index if not exists idx_chat_messages_conversation_created
on public.chat_messages(conversation_id, created_at);

create unique index if not exists idx_chat_messages_whatsapp_id
on public.chat_messages(whatsapp_message_id)
where whatsapp_message_id is not null and btrim(whatsapp_message_id) <> '';

drop policy if exists "Authorized users can read chat conversations" on public.chat_conversations;
drop policy if exists "Authorized users can manage chat conversations" on public.chat_conversations;
drop policy if exists "Authorized users can read chat messages" on public.chat_messages;
drop policy if exists "Authorized users can create chat messages" on public.chat_messages;

create policy "Authorized users can read chat conversations"
on public.chat_conversations for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Authorized users can manage chat conversations"
on public.chat_conversations for insert
to authenticated
with check (public.is_authorized_tomasoni_user());

create policy "Authorized users can update chat conversations"
on public.chat_conversations for update
to authenticated
using (public.is_authorized_tomasoni_user())
with check (public.is_authorized_tomasoni_user());

create policy "Authorized users can read chat messages"
on public.chat_messages for select
to authenticated
using (
  public.is_authorized_tomasoni_user()
  and exists (
    select 1
    from public.chat_conversations conversation
    where conversation.id = chat_messages.conversation_id
  )
);

create policy "Authorized users can create chat messages"
on public.chat_messages for insert
to authenticated
with check (
  public.is_authorized_tomasoni_user()
  and direction in ('outbound', 'system')
);
