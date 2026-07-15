-- Track C live-path repair.
--
-- Supabase projects normally install default privileges for API roles, but those
-- defaults are project state rather than part of this repository. Make every
-- privilege needed by AstroScout explicit so a migration replay and an existing
-- project converge on the same access model.

grant usage on schema public to anon, authenticated, service_role;

revoke all privileges on table public.sessions from anon;
revoke all privileges on table public.logged_observations from anon;
revoke all privileges on table public.gear_profiles from anon;

grant select, insert, update, delete on table public.sessions to authenticated;
grant select, insert, update, delete on table public.logged_observations to authenticated;
grant select, insert, update, delete on table public.gear_profiles to authenticated;

grant all privileges on table public.sessions to service_role;
grant all privileges on table public.logged_observations to service_role;
grant all privileges on table public.gear_profiles to service_role;

revoke insert, update, delete on table public.documents from anon, authenticated;
grant select on table public.documents to anon, authenticated;
grant all privileges on table public.documents to service_role;
grant usage, select on sequence public.documents_id_seq to service_role;

revoke execute on function public.match_documents(vector, integer, text) from public;
grant execute on function public.match_documents(vector, integer, text)
  to anon, authenticated, service_role;
revoke execute on function public.hybrid_search(
  text, vector, integer, double precision, double precision, integer, text
) from public;
grant execute on function public.hybrid_search(
  text, vector, integer, double precision, double precision, integer, text
) to anon, authenticated, service_role;

-- A user-owned observation must also belong to a session owned by that user.
-- The original policy checked user_id only, which allowed a crafted row to point
-- at another user's session if its UUID was known.
drop policy if exists "own observations - insert" on public.logged_observations;
create policy "own observations - insert" on public.logged_observations
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.sessions
      where sessions.id = logged_observations.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists "own observations - update" on public.logged_observations;
create policy "own observations - update" on public.logged_observations
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.sessions
      where sessions.id = logged_observations.session_id
        and sessions.user_id = auth.uid()
    )
  );
