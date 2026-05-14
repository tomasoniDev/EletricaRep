create or replace function public.auth_email_exists(input_email text)
returns boolean
language sql
stable
security definer
set search_path = auth, pg_temp
as $$
  select case
    when lower(trim(input_email)) not like '%@tomasoni.ind.br'
      and lower(trim(input_email)) not like '%@tomasoni.in.br'
      then false
    else exists (
      select 1
      from users
      where lower(email) = lower(trim(input_email))
    )
  end;
$$;

revoke all on function public.auth_email_exists(text) from public;
grant execute on function public.auth_email_exists(text) to anon, authenticated;
