\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

do $$
declare
  table_name text;
  privilege_name text;
begin
  foreach table_name in array array['sessions', 'logged_observations', 'gear_profiles']
  loop
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    loop
      if not has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        privilege_name
      ) then
        raise exception 'authenticated lacks % on public.%', privilege_name, table_name;
      end if;
    end loop;

    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT') then
      raise exception 'anon unexpectedly has SELECT on public.%', table_name;
    end if;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'public.hybrid_search(text,vector,integer,double precision,double precision,integer,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks EXECUTE on public.hybrid_search';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.observation_progress()',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks EXECUTE on public.observation_progress';
  end if;

  if has_function_privilege('anon', 'public.observation_progress()', 'EXECUTE') then
    raise exception 'anon unexpectedly has EXECUTE on public.observation_progress';
  end if;
end
$$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.sessions (
  id, user_id, title, latitude, longitude, planned_for
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Track C acceptance',
  -36.85,
  174.76,
  '2026-07-15'
);

insert into public.gear_profiles (
  id, user_id, name, f_ratio, filter_kind
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'Acceptance rig',
  5.0,
  'broadband'
);

insert into public.logged_observations (
  id, session_id, user_id, target, score, rating, integration_minutes
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'M42',
  0.9,
  'good',
  120
);

do $$
declare
  negative_minutes_blocked boolean := false;
  progress_minutes bigint;
begin
  begin
    insert into public.logged_observations (
      session_id, user_id, target, integration_minutes
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'M31',
      -1
    );
  exception
    when check_violation then
      negative_minutes_blocked := true;
  end;

  if not negative_minutes_blocked then
    raise exception 'negative integration minutes were not blocked';
  end if;

  select integration_minutes into progress_minutes
  from public.observation_progress()
  where target = 'M42';
  if progress_minutes <> 120 then
    raise exception 'owner progress returned %, expected 120', progress_minutes;
  end if;
end
$$;

update public.gear_profiles
set f_ratio = 4.8
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

do $$
declare
  session_count integer;
  gear_count integer;
  observation_count integer;
begin
  select count(*) into session_count from public.sessions;
  select count(*) into gear_count from public.gear_profiles;
  select count(*) into observation_count from public.logged_observations;
  if session_count <> 1 or gear_count <> 1 or observation_count <> 1 then
    raise exception 'owner cannot read its Track C rows';
  end if;
end
$$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

do $$
declare
  visible_count integer;
  affected_count integer;
  cross_session_blocked boolean := false;
begin
  select count(*) into visible_count from public.sessions;
  if visible_count <> 0 then
    raise exception 'cross-user session read was not blocked';
  end if;

  select count(*) into visible_count from public.gear_profiles;
  if visible_count <> 0 then
    raise exception 'cross-user gear read was not blocked';
  end if;

  select count(*) into visible_count from public.logged_observations;
  if visible_count <> 0 then
    raise exception 'cross-user observation read was not blocked';
  end if;

  select count(*) into visible_count from public.observation_progress();
  if visible_count <> 0 then
    raise exception 'cross-user progress aggregation was not blocked';
  end if;

  update public.gear_profiles
  set name = 'stolen'
  where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'cross-user gear update was not blocked';
  end if;

  delete from public.sessions
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'cross-user session delete was not blocked';
  end if;

  begin
    insert into public.logged_observations (
      session_id, user_id, target
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'M31'
    );
  exception
    when insufficient_privilege then
      cross_session_blocked := true;
  end;

  if not cross_session_blocked then
    raise exception 'cross-user session reference was not blocked';
  end if;
end
$$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
delete from public.gear_profiles
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from public.sessions
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

reset role;
reset all;

set role service_role;
insert into public.documents (target, title, source, content, embedding)
values (
  'M42',
  'Acceptance passage',
  'Track C CI',
  'Orion nebula acceptance passage',
  array_fill(0.01::real, array[1536])::vector
);

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  result_count integer;
begin
  select count(*) into result_count
  from public.hybrid_search(
    'Orion',
    array_fill(0.01::real, array[1536])::vector,
    5,
    1.0,
    1.0,
    50,
    'M42'
  );
  if result_count <> 1 then
    raise exception 'hybrid_search returned % rows, expected 1', result_count;
  end if;
end
$$;

reset role;
reset all;

do $$
declare
  row_count integer;
begin
  select count(*) into row_count from public.sessions;
  if row_count <> 0 then
    raise exception 'owner session delete did not persist';
  end if;

  select count(*) into row_count from public.gear_profiles;
  if row_count <> 0 then
    raise exception 'owner gear delete did not persist';
  end if;

  select count(*) into row_count from public.logged_observations;
  if row_count <> 0 then
    raise exception 'session cascade did not remove observations';
  end if;
end
$$;

rollback;
