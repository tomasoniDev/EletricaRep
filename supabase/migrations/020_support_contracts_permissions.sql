create table if not exists public.support_contracts (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references public.machines(id) on delete set null,
  code text,
  client text,
  serial text,
  contract_type text check (contract_type is null or contract_type in ('Seg-Sex', 'Seg-Sab', 'Garantia')),
  status text check (status is null or status in ('Ativo', 'Inativo', 'Em negociação')),
  active boolean,
  support_contract_until date,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_contracts enable row level security;

grant select, insert, update, delete on public.support_contracts to authenticated;

create index if not exists idx_support_contracts_machine_id
on public.support_contracts(machine_id);

create index if not exists idx_support_contracts_serial
on public.support_contracts(serial)
where serial is not null and btrim(serial) <> '';

drop policy if exists "Authorized users can read support contracts" on public.support_contracts;
drop policy if exists "Commercial and full access can manage support contracts" on public.support_contracts;

create policy "Authorized users can read support contracts"
on public.support_contracts for select
to authenticated
using (public.is_authorized_tomasoni_user());

create policy "Commercial and full access can manage support contracts"
on public.support_contracts for all
to authenticated
using (public.has_full_access() or public.current_user_role() = 'Comercial')
with check (public.has_full_access() or public.current_user_role() = 'Comercial');

insert into public.support_contracts (
  machine_id,
  code,
  client,
  serial,
  contract_type,
  status,
  active,
  support_contract_until
)
select
  id,
  code,
  client,
  serial,
  support_contract_type,
  case
    when support_contract_active is true then 'Ativo'
    when support_contract_active is false then 'Inativo'
    else null
  end,
  support_contract_active,
  support_contract_until
from public.machines machine
where (
  support_contract_active is not null
  or support_contract_type is not null
  or support_contract_until is not null
)
and not exists (
  select 1
  from public.support_contracts contract
  where contract.machine_id = machine.id
);

drop policy if exists "Authorized users can manage machines" on public.machines;
create policy "Authorized users can manage machines"
on public.machines for all
to authenticated
using (
  public.has_full_access()
  or public.current_user_role() = 'Engenharia'
)
with check (
  public.has_full_access()
  or public.current_user_role() = 'Engenharia'
);

drop policy if exists "Authorized users can manage machine emails" on public.machine_emails;
create policy "Authorized users can manage machine emails"
on public.machine_emails for all
to authenticated
using (
  public.has_full_access()
  or public.current_user_role() = 'Engenharia'
)
with check (
  public.has_full_access()
  or public.current_user_role() = 'Engenharia'
);
