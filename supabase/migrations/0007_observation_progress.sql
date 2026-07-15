-- Track C4(d): optional recorded integration time and owner-scoped progress totals.

alter table public.logged_observations
  add column if not exists integration_minutes integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'logged_observations_integration_minutes_check'
      and conrelid = 'public.logged_observations'::regclass
  ) then
    alter table public.logged_observations
      add constraint logged_observations_integration_minutes_check
      check (integration_minutes is null or integration_minutes >= 0);
  end if;
end
$$;

create or replace function public.observation_progress()
returns table (
  target text,
  integration_minutes bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    logged_observations.target,
    sum(logged_observations.integration_minutes)::bigint as integration_minutes
  from public.logged_observations
  where logged_observations.user_id = auth.uid()
    and logged_observations.integration_minutes is not null
  group by logged_observations.target
  order by logged_observations.target;
$$;

revoke execute on function public.observation_progress() from public, anon;
grant execute on function public.observation_progress() to authenticated, service_role;
