-- Minimal user-owned imaging profiles for the integration-time budget model.
-- Sky brightness belongs to the observing site and is deliberately not stored here.

create table if not exists public.gear_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  f_ratio      double precision not null check (f_ratio > 0 and f_ratio <= 32),
  filter_kind  text not null check (filter_kind in ('broadband', 'dual_nb', 'mono_nb')),
  created_at   timestamptz not null default now()
);

create index if not exists gear_user_idx on public.gear_profiles (user_id, created_at desc);

alter table public.gear_profiles enable row level security;

create policy "own gear - select" on public.gear_profiles
  for select using (auth.uid() = user_id);
create policy "own gear - insert" on public.gear_profiles
  for insert with check (auth.uid() = user_id);
create policy "own gear - update" on public.gear_profiles
  for update using (auth.uid() = user_id);
create policy "own gear - delete" on public.gear_profiles
  for delete using (auth.uid() = user_id);
