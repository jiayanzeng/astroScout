# Supabase setup

1. Create a project at https://supabase.com and grab the Project URL + anon key.
2. Run the migrations in order: `0001_init.sql` → `0002_knowledge.sql` →
   `0003_hybrid_search.sql` → `0004_gear_profiles.sql` →
   `0005_privileges_and_rls_repair.sql` → `0006_chat_usage_limits.sql`. Paste each file
   into the SQL editor, or use the Supabase CLI (`supabase db push`). `0005` is safe to
   reapply and is required for both existing and new projects; it makes API-role
   privileges explicit.
3. Put the keys in `apps/web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. In Auth settings, enable Email (magic link) and add `http://localhost:3000/auth/callback`
   to the redirect allow-list.

RLS is enabled on all user-owned tables; every row is scoped to `auth.uid()`, and an
observation can reference only a session owned by that same user. Migration `0005`
revokes anonymous user-table access and grants authenticated CRUD explicitly, so the anon
key remains safe to ship to the browser. Never put the service-role key in the web app.

## Authenticated chat quota and usage records (P1)

`migrations/0006_chat_usage_limits.sql` adds a user-owned, content-free usage table and
two authenticated RPCs. `reserve_chat_request` serializes quota reservations per user so
concurrent requests cannot bypass the configured minute/day caps;
`complete_chat_request` records status, latency, token totals, backend billing units, and
estimated cost. Neither the table nor the RPCs accept prompt text, response text, tool
payloads, emails, or secrets. Authenticated users may read only their own usage rows and
cannot write them directly. Each reservation also returns a random completion capability
that remains server-side; its stored value is not selectable by authenticated clients, so
a browser cannot overwrite the route's real accounting row.

## Knowledge base (v0.2)

`migrations/0002_knowledge.sql` enables the `vector` extension and adds a shared,
read-only `documents` table (RLS: public select, writes via service role) plus the
`match_documents` cosine-similarity RPC. Run it after `0001_init.sql`. The ingestion
script (`apps/api/scripts/ingest_knowledge.py`) populates it; the web copilot's
`searchKnowledge` tool queries it.

## Hybrid search (v0.4)

`migrations/0003_hybrid_search.sql` adds a generated `fts` full-text column (+ GIN index)
to `documents` and a `hybrid_search` RPC that fuses Postgres full-text ranking with
pgvector cosine similarity using Reciprocal Rank Fusion. Run it after `0002`. The
copilot's `searchKnowledge` now calls `hybrid_search`.

## Gear profiles (Track C)

`migrations/0004_gear_profiles.sql` adds user-owned imaging profiles with only the three
inputs consumed by the budget model: name, focal ratio, and filter kind. RLS mirrors the
`sessions` policies from `0001`. Run it after `0003`. SQM is deliberately not stored on
gear because sky brightness belongs to an observing site.

## Privilege and RLS repair (P0)

`migrations/0005_privileges_and_rls_repair.sql` repairs projects where tables exist but
PostgREST returns code 42501 (`permission denied`). It grants only the access required by
`anon`, `authenticated`, and `service_role`, removes implicit public execution from the
search RPCs, and strengthens observation writes against cross-user session references.
Do not replace it with dashboard-only grants: applying the migration keeps hosted state
replayable.

CI boots PostgreSQL 16 with pgvector, applies every migration, reapplies `0005` to prove
idempotency, and runs `tests/track_c_acceptance.sql` plus
`tests/chat_usage_acceptance.sql` for owner CRUD, cross-user denial, quota enforcement,
content-free completion accounting, and authenticated RPC calls.
