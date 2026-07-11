# Supabase setup

1. Create a project at https://supabase.com and grab the Project URL + anon key.
2. Run the migrations in order: `0001_init.sql` → `0002_knowledge.sql` →
   `0003_hybrid_search.sql` → `0004_gear_profiles.sql`. Paste each file into the SQL
   editor, or use the Supabase CLI (`supabase db push`).
3. Put the keys in `apps/web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. In Auth settings, enable Email (magic link) and add `http://localhost:3000/auth/callback`
   to the redirect allow-list.

RLS is enabled on all user-owned tables; every row is scoped to `auth.uid()`, so the
anon key is safe to ship to the browser.

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
