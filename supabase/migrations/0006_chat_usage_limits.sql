-- Authenticated chat quota and content-free usage accounting.
-- No prompt, response, tool payload, email, or secret is stored here.

create table if not exists public.chat_usage_events (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  completion_token     uuid not null default gen_random_uuid(),
  requested_at         timestamptz not null default now(),
  completed_at         timestamptz,
  status               text not null default 'reserved'
                         check (status in ('reserved', 'completed', 'failed', 'timed_out')),
  input_tokens         integer not null default 0 check (input_tokens >= 0),
  output_tokens        integer not null default 0 check (output_tokens >= 0),
  total_tokens         integer not null default 0 check (total_tokens >= 0),
  chat_input_tokens    integer not null default 0 check (chat_input_tokens >= 0),
  chat_output_tokens   integer not null default 0 check (chat_output_tokens >= 0),
  embedding_tokens     integer not null default 0 check (embedding_tokens >= 0),
  rerank_input_tokens  integer not null default 0 check (rerank_input_tokens >= 0),
  rerank_output_tokens integer not null default 0 check (rerank_output_tokens >= 0),
  rerank_backend       text check (rerank_backend in ('cohere', 'llm', 'bge')),
  cohere_search_units  integer not null default 0 check (cohere_search_units >= 0),
  estimated_cost_usd   numeric(12, 8) not null default 0 check (estimated_cost_usd >= 0),
  duration_ms          integer check (duration_ms is null or duration_ms >= 0),
  failure_reason       text check (failure_reason is null or length(failure_reason) <= 64)
);

create index if not exists chat_usage_user_requested_idx
  on public.chat_usage_events (user_id, requested_at desc);

alter table public.chat_usage_events enable row level security;

drop policy if exists "own chat usage - select" on public.chat_usage_events;
create policy "own chat usage - select" on public.chat_usage_events
  for select using (auth.uid() = user_id);

revoke all privileges on table public.chat_usage_events from anon, authenticated;
grant select (
  id, user_id, requested_at, completed_at, status, input_tokens, output_tokens,
  total_tokens, chat_input_tokens, chat_output_tokens, embedding_tokens,
  rerank_input_tokens, rerank_output_tokens, rerank_backend, cohere_search_units,
  estimated_cost_usd, duration_ms, failure_reason
) on public.chat_usage_events to authenticated;
grant all privileges on table public.chat_usage_events to service_role;

create or replace function public.reserve_chat_request(
  p_max_per_minute integer default 6,
  p_max_per_day integer default 100
)
returns table (
  allowed boolean,
  event_id uuid,
  completion_token uuid,
  retry_after_seconds integer,
  reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_completion_token uuid;
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'authentication required';
  end if;
  if p_max_per_minute < 1 or p_max_per_day < 1 then
    raise invalid_parameter_value using message = 'chat limits must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if (
    select count(*) from public.chat_usage_events
    where user_id = v_user_id and requested_at >= now() - interval '1 minute'
  ) >= p_max_per_minute then
    return query select false, null::uuid, null::uuid, 60, 'minute_limit';
    return;
  end if;

  if (
    select count(*) from public.chat_usage_events
    where user_id = v_user_id and requested_at >= now() - interval '1 day'
  ) >= p_max_per_day then
    return query select false, null::uuid, null::uuid, 3600, 'daily_limit';
    return;
  end if;

  insert into public.chat_usage_events (user_id)
  values (v_user_id)
  returning id, chat_usage_events.completion_token
  into v_event_id, v_completion_token;

  return query select true, v_event_id, v_completion_token, 0, null::text;
end;
$$;

create or replace function public.complete_chat_request(
  p_event_id uuid,
  p_completion_token uuid,
  p_status text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_chat_input_tokens integer,
  p_chat_output_tokens integer,
  p_embedding_tokens integer,
  p_rerank_input_tokens integer,
  p_rerank_output_tokens integer,
  p_rerank_backend text,
  p_cohere_search_units integer,
  p_estimated_cost_usd numeric,
  p_duration_ms integer,
  p_failure_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'authentication required';
  end if;
  if p_status not in ('completed', 'failed', 'timed_out') then
    raise invalid_parameter_value using message = 'invalid chat completion status';
  end if;
  if p_rerank_backend is not null and p_rerank_backend not in ('cohere', 'llm', 'bge') then
    raise invalid_parameter_value using message = 'invalid rerank backend';
  end if;

  update public.chat_usage_events
  set completed_at = now(),
      status = p_status,
      input_tokens = greatest(0, p_input_tokens),
      output_tokens = greatest(0, p_output_tokens),
      total_tokens = greatest(0, p_total_tokens),
      chat_input_tokens = greatest(0, p_chat_input_tokens),
      chat_output_tokens = greatest(0, p_chat_output_tokens),
      embedding_tokens = greatest(0, p_embedding_tokens),
      rerank_input_tokens = greatest(0, p_rerank_input_tokens),
      rerank_output_tokens = greatest(0, p_rerank_output_tokens),
      rerank_backend = p_rerank_backend,
      cohere_search_units = greatest(0, p_cohere_search_units),
      estimated_cost_usd = greatest(0, p_estimated_cost_usd),
      duration_ms = greatest(0, p_duration_ms),
      failure_reason = left(p_failure_reason, 64)
  where id = p_event_id
    and user_id = auth.uid()
    and completion_token = p_completion_token
    and status = 'reserved';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.reserve_chat_request(integer, integer) from public;
revoke execute on function public.complete_chat_request(
  uuid, uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  text, integer, numeric, integer, text
) from public;
grant execute on function public.reserve_chat_request(integer, integer) to authenticated;
grant execute on function public.complete_chat_request(
  uuid, uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  text, integer, numeric, integer, text
) to authenticated;
grant execute on function public.reserve_chat_request(integer, integer) to service_role;
grant execute on function public.complete_chat_request(
  uuid, uuid, text, integer, integer, integer, integer, integer, integer, integer, integer,
  text, integer, numeric, integer, text
) to service_role;
