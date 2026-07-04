-- AstroScout v0.1 schema. Two user-owned tables, protected by RLS so each
-- person only ever sees their own rows. Auth is handled by Supabase (auth.users).

-- A saved observation plan: a location + the night it was generated for.
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  latitude     double precision not null check (latitude between -90 and 90),
  longitude    double precision not null check (longitude between -180 and 180),
  planned_for  date not null default current_date,
  created_at   timestamptz not null default now()
);

-- A logged observation against a session (what you actually shot / saw).
create table if not exists public.logged_observations (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  target          text not null,
  score           double precision,
  rating          text check (rating in ('poor', 'marginal', 'good')),
  notes           text,
  observed_at     timestamptz not null default now()
);

create index if not exists sessions_user_idx on public.sessions (user_id, planned_for desc);
create index if not exists obs_session_idx on public.logged_observations (session_id);

-- Row-level security
alter table public.sessions enable row level security;
alter table public.logged_observations enable row level security;

create policy "own sessions - select" on public.sessions
  for select using (auth.uid() = user_id);
create policy "own sessions - insert" on public.sessions
  for insert with check (auth.uid() = user_id);
create policy "own sessions - update" on public.sessions
  for update using (auth.uid() = user_id);
create policy "own sessions - delete" on public.sessions
  for delete using (auth.uid() = user_id);

create policy "own observations - select" on public.logged_observations
  for select using (auth.uid() = user_id);
create policy "own observations - insert" on public.logged_observations
  for insert with check (auth.uid() = user_id);
create policy "own observations - update" on public.logged_observations
  for update using (auth.uid() = user_id);
create policy "own observations - delete" on public.logged_observations
  for delete using (auth.uid() = user_id);
