create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_tomasoni_user()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) like '%@tomasoni.ind.br'
    or lower(coalesce(auth.jwt() ->> 'email', '')) like '%@tomasoni.in.br';
$$;
