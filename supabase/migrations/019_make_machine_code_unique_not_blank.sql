alter table public.machines
drop constraint if exists machines_code_key;

create unique index if not exists machines_code_unique_not_blank
on public.machines (code)
where code is not null and btrim(code) <> '';
