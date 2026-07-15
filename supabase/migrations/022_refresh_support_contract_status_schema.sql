alter table if exists public.support_contracts
add column if not exists status text;

alter table if exists public.support_contracts
drop constraint if exists support_contracts_status_check;

alter table if exists public.support_contracts
add constraint support_contracts_status_check
check (status is null or status in ('Ativo', 'Inativo', 'Em negociação'));

update public.support_contracts
set status = case
  when active is true then 'Ativo'
  when active is false then 'Inativo'
  else null
end
where status is null;

notify pgrst, 'reload schema';
