create table if not exists public.chat_contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_contacts enable row level security;

grant select, insert, update on public.chat_contacts to authenticated;

drop policy if exists "Authorized users can read chat contacts" on public.chat_contacts;
drop policy if exists "Authorized users can manage chat contacts" on public.chat_contacts;

create policy "Authorized users can read chat contacts"
on public.chat_contacts for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Authorized users can manage chat contacts"
on public.chat_contacts for all
to authenticated
using (public.is_authorized_tomasoni_user())
with check (public.is_authorized_tomasoni_user());

alter table public.chat_conversations
add column if not exists contact_id uuid references public.chat_contacts(id) on delete set null,
add column if not exists customer_company text,
add column if not exists machine_id uuid references public.machines(id) on delete set null,
add column if not exists machine_code text,
add column if not exists machine_serial text,
add column if not exists identification_status text not null default 'pending_customer'
  check (identification_status in ('pending_customer', 'pending_machine', 'identified'));

alter table public.chat_messages
add column if not exists message_type text not null default 'text'
  check (message_type in ('text', 'image', 'video', 'audio', 'document', 'unknown')),
add column if not exists media_id text,
add column if not exists media_mime_type text,
add column if not exists media_sha256 text,
add column if not exists media_filename text,
add column if not exists media_caption text;

create index if not exists idx_chat_contacts_phone
on public.chat_contacts(phone);

create index if not exists idx_chat_conversations_contact
on public.chat_conversations(contact_id);

create index if not exists idx_chat_conversations_machine_code
on public.chat_conversations(machine_code);

create index if not exists idx_chat_messages_media_id
on public.chat_messages(media_id)
where media_id is not null and btrim(media_id) <> '';
