alter table public.machines
alter column code drop not null,
alter column model drop not null,
alter column client drop not null;

alter table public.machine_components
alter column machine_name drop not null,
alter column electrical_project drop not null;
