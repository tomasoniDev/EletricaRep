alter table public.authorized_users
add column if not exists remote_access_allowed boolean not null default false;

update public.authorized_users
set remote_access_allowed = true,
    updated_at = now()
where lower(email) = 'lucas.lessa@tomasoni.ind.br';
