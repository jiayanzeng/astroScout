-- AstroScout v0.2: RAG knowledge base (pgvector).
-- A shared, read-only corpus of astronomy literature passages. Writes happen via
-- the service role (ingestion script), which bypasses RLS.

create extension if not exists vector;

create table if not exists public.documents (
  id          bigint generated always as identity primary key,
  target      text,                       -- catalog name this passage is about, e.g. 'M31'
  title       text,
  source      text,                       -- e.g. 'NASA ADS'
  bibcode     text,
  url         text,
  content     text not null,
  embedding   vector(1536),               -- text-embedding-3-small
  created_at  timestamptz not null default now()
);

-- approximate-nearest-neighbour index for cosine similarity
create index if not exists documents_embedding_idx
  on public.documents using hnsw (embedding vector_cosine_ops);
create index if not exists documents_target_idx on public.documents (target);

-- Shared knowledge base: anyone may read; only the service role writes.
alter table public.documents enable row level security;

drop policy if exists "documents are readable" on public.documents;
create policy "documents are readable" on public.documents
  for select using (true);

grant select on public.documents to anon, authenticated;

-- Similarity search. SECURITY INVOKER + the read policy above keep it safe.
create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count int default 5,
  filter_target text default null
)
returns table (
  id bigint,
  target text,
  title text,
  source text,
  bibcode text,
  url text,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    d.id, d.target, d.title, d.source, d.bibcode, d.url, d.content,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where filter_target is null or d.target = filter_target
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_documents to anon, authenticated;
