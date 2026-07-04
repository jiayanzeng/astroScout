-- AstroScout v0.4: hybrid retrieval = Postgres full-text + pgvector, fused with
-- Reciprocal Rank Fusion. Pure vector search blurs exact identifiers (M51, IC 434);
-- full-text catches them. RRF combines both robustly.

-- Generated full-text column over the passage content.
alter table public.documents
  add column if not exists fts tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists documents_fts_idx on public.documents using gin (fts);

create or replace function public.hybrid_search(
  query_text text,
  query_embedding vector(1536),
  match_count int default 5,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50,
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
  with fts_ranked as (
    select
      d.id,
      row_number() over (
        order by ts_rank_cd(d.fts, websearch_to_tsquery('english', query_text)) desc
      ) as rank_ix
    from public.documents d
    where d.fts @@ websearch_to_tsquery('english', query_text)
      and (filter_target is null or d.target = filter_target)
    limit least(match_count, 30) * 2
  ),
  sem_ranked as (
    select
      d.id,
      row_number() over (order by d.embedding <=> query_embedding) as rank_ix
    from public.documents d
    where filter_target is null or d.target = filter_target
    limit least(match_count, 30) * 2
  )
  select
    d.id, d.target, d.title, d.source, d.bibcode, d.url, d.content,
    coalesce(1.0 / (rrf_k + fts_ranked.rank_ix), 0.0) * full_text_weight
      + coalesce(1.0 / (rrf_k + sem_ranked.rank_ix), 0.0) * semantic_weight
      as similarity
  from fts_ranked
  full outer join sem_ranked on fts_ranked.id = sem_ranked.id
  join public.documents d on d.id = coalesce(fts_ranked.id, sem_ranked.id)
  order by similarity desc
  limit least(match_count, 30);
$$;

grant execute on function public.hybrid_search to anon, authenticated;
