\set ON_ERROR_STOP on

-- Minimal Supabase auth/API-role surface for replaying migrations in plain
-- PostgreSQL. Production Supabase supplies these roles, schema, and auth.uid().
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
