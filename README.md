# AstroScout — v0.6.1

An observation-planning & deep-sky knowledge copilot for amateur astronomers.
Tell it your location; it ranks what's worth observing/imaging tonight **and explains
why**, lets you save sessions and log what you saw, and answers astronomy questions
through an AI copilot grounded in real planning data **and a cited literature corpus**.

A working vertical slice — real astropy planning + a pgvector RAG knowledge base → API
→ web UI with auth + persistence → a grounded, auditable AI copilot. Everything is
built and tested; you supply ADS / OpenAI / Supabase keys to run it. OpenAI-compatible
relay endpoints are supported via `OPENAI_BASE_URL` (v0.6.1).

## What's in it

- **Planning engine** (`apps/api`) — astronomical dark window, per-target peak
  altitude / hours-visible / moon separation, plus an **offline satellite-derived
  Bortle (light pollution) lookup** (precomputed grid, O(1)) folded into scoring by
  each object's surface-brightness sensitivity, so rankings flip between dark sites and cities.
  Endpoints take an optional future `when`; coords are bounds-validated. Pure scorer
  and Bortle model are unit-tested.
- **Knowledge base / RAG** (`apps/api/rag` + `supabase/`) — ingest ADS literature
  abstracts → chunk → embed (`text-embedding-3-small`) → pgvector. ADS `object:`
  queries are resolved through the ADS object service into real Solr fields (with a
  plain-abstract fallback), so ingest finds papers tagged by canonical names.
  Retrieval is **hybrid**: Postgres full-text + vector, fused with Reciprocal Rank
  Fusion (`hybrid_search` RPC), then a **cross-encoder rerank** (Cohere or LLM) over
  the top candidates — robust to both exact identifiers and paraphrase.
- **Auth + persistence** — Supabase magic-link auth, Postgres + row-level security,
  saved **sessions** and logged **observations**; chat restores a validated, text-only
  browser-local history with an explicit Clear action and privacy policy.
- **Web UI** — `/plan` rankings and gear-aware budgets, on-demand 30-night
  projections, saved-session list/detail with observation logging, and the authenticated
  `/chat` copilot.
- **AI copilot** — authenticated, quota-protected Vercel AI SDK with three tools:
  `planNight`, `getTargetDetail`, and `searchKnowledge`. The chat UI shows exactly what
  the copilot queried and what came back — including cited literature sources — while
  the server records content-free latency/token/cost data for reliability controls.
- **Eval harness** (`apps/web/evals`) — retrieval metrics (hit@k, recall@k, MRR,
  nDCG) + answer-faithfulness scoring over a labelled dataset, comparing sparse vs
  dense vs hybrid retrieval. Runs offline (no keys) or live; pure metrics + RRF
  fusion are unit-tested in CI. The harness drove real decisions: it showed hybrid
  most robust across query types, and that a bag-of-words reranker regresses vs
  hybrid — so reranking uses a true cross-encoder, not a cheap stand-in.

## Stack

FastAPI + astropy/astroplan/numpy · Next.js 16 / React 19 / Tailwind v4 / shadcn ·
Vercel AI SDK v6 · Supabase (auth + Postgres + pgvector + RLS) · OpenAI embeddings
(or any OpenAI-compatible endpoint via `OPENAI_BASE_URL`).

## Run it

```bash
# 1. Supabase — see supabase/README.md
#    create a project, run migrations 0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006,
#    then enable email auth
#    NOTE: SUPABASE_URL must be the bare project URL (https://<ref>.supabase.co) —
#    do NOT append /rest/v1; the store client adds the REST path itself.

# 2. Backend
cd apps/api
uv sync
cp ../../.env.example ../../.env          # ADS/OpenAI/Supabase keys for ingestion; CORS has a default
                                          # optional: OPENAI_BASE_URL=<relay>/v1 for an OpenAI-compatible relay
uv run uvicorn astroscout_api.main:app --reload   # http://127.0.0.1:8000/docs
uv run python scripts/ingest_knowledge.py --all   # populate the knowledge base (optional, for /chat grounding)

# 3. Frontend (repo root, second terminal)
pnpm install
pnpm --dir apps/web approve-builds                # allow sharp/esbuild native builds (newer pnpm blocks them by default)
cp apps/web/.env.example apps/web/.env.local      # Supabase URL/anon key + OPENAI_API_KEY (+ optional OPENAI_BASE_URL)
pnpm --filter @astroscout/web dev                 # http://localhost:3000
```

`/plan` works without an account. Signing in unlocks saving sessions, logging observations,
and `/chat`. Chat also needs `OPENAI_API_KEY`; grounded answers need the knowledge base
ingested. If ingestion hits `permission denied for table documents` (42501), apply the
canonical migrations rather than adding dashboard-only grants — see `STATE.md` §4.

For a local HTTPS relay whose verified CA is not in Node&apos;s trust store, set
`NODE_EXTRA_CA_CERTS=/absolute/path/to/ca.pem` in the machine/shell environment. Do not put
it in committed env files, and never use `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Tests / checks (mirrors CI)

```bash
# api
cd apps/api && uv run ruff check . && uv run ruff format --check . \
  && uv run mypy src && uv run pytest -m "not integration"
# web (repo root)
pnpm --filter @astroscout/web lint && pnpm --filter @astroscout/web typecheck \
  && pnpm --filter @astroscout/web test && pnpm --filter @astroscout/web build
```

Tests hitting live CDS/Simbad, ADS, or OpenAI are marked `integration` and excluded from CI.

The canonical production journey is [docs/live-acceptance.md](docs/live-acceptance.md).
It covers auth, gear CRUD, budgeted planning, projection, saved sessions, grounded chat,
persistence, accounting, and structured error behavior in one evidence record.

## Layout

```
apps/api      FastAPI: planning engine, data adapters, RAG ingestion, validation script
apps/web      Next.js: auth, /plan, /sessions, /chat copilot (plan + knowledge tools)
supabase      schema + RLS + pgvector migrations, setup notes
docs          implementation plans and the canonical live-acceptance runbook
.github       CI (api + web jobs)
```

## Honest scope notes (deliberately not in this slice)

- Observing-site IANA timezone lookup is not yet bundled; the UI explicitly labels the
  browser/device zone and retains UTC tooltips instead of calling it site-local time.
- Per-target rise/set times surfaced in the UI (computed internally already).
- Background/scheduled ingestion (currently a manual CLI run).
- Projection concurrency and sliding-window guards are per API process. The production
  Vercel deployment also has a shared WAF limit of six `/api/project` requests per IP per
  60 seconds; any other multi-worker host must provide an equivalent gateway-level limit.
