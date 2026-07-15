\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

do $$
declare
  reservation record;
  first_event uuid;
  first_token uuid;
  request_number integer;
  completed boolean;
begin
  for request_number in 1..2 loop
    select * into reservation from public.reserve_chat_request(2, 10);
    if not reservation.allowed or reservation.event_id is null then
      raise exception 'request % was unexpectedly rate limited', request_number;
    end if;
    if first_event is null then
      first_event := reservation.event_id;
      first_token := reservation.completion_token;
    end if;
  end loop;

  select * into reservation from public.reserve_chat_request(2, 10);
  if reservation.allowed or reservation.reason <> 'minute_limit' then
    raise exception 'third request did not hit the minute limit';
  end if;

  select public.complete_chat_request(
    first_event,
    gen_random_uuid(),
    'completed',
    0, 0, 0, 0, 0, 0, 0, 0,
    null,
    0,
    0,
    0,
    null
  ) into completed;
  if completed then
    raise exception 'an invalid completion token modified a usage reservation';
  end if;

  select public.complete_chat_request(
    first_event,
    first_token,
    'completed',
    120,
    30,
    150,
    100,
    20,
    10,
    10,
    10,
    'llm',
    0,
    0.000036,
    1234,
    null
  ) into completed;
  if not completed then
    raise exception 'owner could not complete its usage reservation';
  end if;
end
$$;

do $$
begin
  if has_column_privilege(
    'authenticated', 'public.chat_usage_events', 'completion_token', 'select'
  ) then
    raise exception 'authenticated may read server-held completion tokens';
  end if;
end
$$;

do $$
declare
  matching integer;
begin
  select count(*) into matching
  from public.chat_usage_events
  where status = 'completed'
    and input_tokens = 120
    and output_tokens = 30
    and total_tokens = 150
    and chat_input_tokens = 100
    and chat_output_tokens = 20
    and embedding_tokens = 10
    and rerank_input_tokens = 10
    and rerank_output_tokens = 10
    and rerank_backend = 'llm'
    and estimated_cost_usd = 0.000036
    and duration_ms = 1234;
  if matching <> 1 then
    raise exception 'completed chat usage accounting was not recorded';
  end if;
end
$$;

set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

do $$
declare
  visible integer;
begin
  select count(*) into visible from public.chat_usage_events;
  if visible <> 0 then
    raise exception 'cross-user chat usage was visible';
  end if;
end
$$;

rollback;
