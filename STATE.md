# AstroScout — STATE.md (handoff @ v0.6)

A working vertical slice of an astronomy **observation-planning + knowledge copilot**
for amateur astronomers. Given a location (and optional future date) it ranks what's
worth observing/imaging — accounting for altitude, the dark window, the moon, **and
local light pollution** — lets users save sessions and log observations, and answers
astronomy questions via an AI copilot grounded in a cited literature corpus (hybrid
RAG + cross-encoder rerank). Everything here is built and tested; you supply ADS /
OpenAI / Supabase (+ optional Cohere) keys to run it live.

This document is the source of truth for a fresh session. Read it fully before editing.

---

## 1. Architecture & file structure

### Stack
- **API** (`apps/api`): FastAPI + astropy/astroplan/numpy. Python 3.12, managed by **uv**,
  build backend **hatchling**, src layout, package `astroscout_api`. mypy `strict`.
- **Web** (`apps/web`): **Next.js 16** (App Router) + **React 19** + **Tailwind v4** +
  shadcn/ui + **Vercel AI SDK v6** + **TypeScript 6**. Package name `@astroscout/web`.
- **Data**: **Supabase** — auth (email magic link), Postgres + **pgvector**, RLS.
- **AI**: OpenAI (`gpt-4o-mini` chat + `text-embedding-3-small` embeddings); optional
  **Cohere Rerank** cross-encoder.
- **Monorepo**: pnpm 11.8 workspace (`pnpm-workspace.yaml`), single root `pnpm-lock.yaml`.

### Data flow
```
location (+when) ─► FastAPI /plan/night ─► dark_window + per-target astropy compute
                                          + bortle_at(lat,lon)  ─► scoring.score_target
                                          ─► ranked targets (LP-aware) + bortle
web /plan ─► /api/plan (proxy) ─► table (save session / log observation → Supabase RLS)
copilot /chat ─► /api/chat (AI SDK streamText, 3 tools) ─► planNight / getTargetDetail
                                          / searchKnowledge(embed→hybrid_search→rerank)
ingestion: ADS abstracts ─► chunk ─► embed ─► pgvector (documents)  [Python CLI]
```

### File tree (annotated; excludes node_modules / build artifacts)
```
astroscout/
├── README.md                      # user-facing overview (v0.6)
├── STATE.md                       # this file
├── package.json                   # root: name, packageManager pnpm@11.8.0
├── pnpm-workspace.yaml            # packages: apps/*, packages/*; onlyBuiltDependencies
├── pnpm-lock.yaml                 # committed — CI uses --frozen-lockfile
├── .npmrc                         # verify-deps-before-run=false (see §6)
├── .env.example                   # API keys (ADS / OpenAI / Supabase / CORS)
├── justfile, .pre-commit-config.yaml, .python-version   # Week-1 dev tooling
├── .github/workflows/ci.yml       # api job + web job (see §6)
│
├── apps/api/
│   ├── pyproject.toml             # deps, ruff/mypy/pytest config, hatch wheel artifacts(*.npy)
│   ├── Dockerfile, README.md
│   ├── scripts/
│   │   ├── validate_sources.py        # Week-1: prove data sources reachable
│   │   ├── ingest_knowledge.py        # RAG ingest CLI: --all | --target M31 --rows N
│   │   └── build_bortle_grid.py       # regenerate bortle_grid.npy from the city model
│   └── src/astroscout_api/
│       ├── main.py                    # FastAPI app: CORS + routers (health, visibility, planning)
│       ├── config.py                  # Settings: ads_token, openai_api_key, supabase_url,
│       │                              #   supabase_service_key, cors_origins_raw
│       ├── params.py                  # shared Annotated query types: Lat, Lon, When
│       ├── scoring.py                 # PURE scorer + light-pollution linkage  ★core
│       ├── bortle/                    # OFFLINE light-pollution lookup  ★core (v0.6)
│       │   ├── cities.py              #   82 City(name,lat,lon,population) seed
│       │   ├── model.py               #   PURE: light_index_at, index_to_bortle, haversine_km
│       │   ├── grid.py                #   build_grid / load_grid (mmap) / bortle_at  O(1)
│       │   └── bortle_grid.npy        #   COMMITTED uint8 grid (720×1440, 0.25°, ~1MB)
│       ├── datasources/
│       │   ├── dso_catalog.py         # 15 DSOs: CatalogObject(name,ra_hours,dec_deg,kind,common_name)
│       │   ├── planning.py            # dark_window, conditions_for, rank_targets, target_detail, parse_when ★core
│       │   ├── visibility.py          # get_visibility (Simbad), get_darkness
│       │   ├── catalog.py             # resolve_object via Simbad/astroquery
│       │   └── literature.py          # count_literature, fetch_abstracts (NASA ADS)
│       ├── rag/
│       │   ├── chunking.py            # PURE chunk_text (overlapping)  [unit-tested]
│       │   ├── embeddings.py          # embed_texts via OpenAI (httpx), text-embedding-3-small
│       │   ├── store.py               # upsert_documents via Supabase PostgREST (service role)
│       │   └── ingest.py              # ingest_target / ingest_catalog (fetch→chunk→embed→store)
│       └── routers/
│           ├── health.py              # GET /health
│           ├── visibility.py          # GET /visibility?target=&lat=&lon=   (Lat/Lon validated)
│           └── planning.py            # GET /plan/night, /plan/target  (Lat/Lon/When)
│   └── tests/                         # see §6 for what's CI vs integration
│       ├── test_scoring.py            # scoring + light-pollution (incl. ranking-flip)
│       ├── test_bortle.py             # model, grid index math, bortle_at sanity
│       ├── test_parse_when.py         # date/datetime parsing
│       ├── test_routers.py            # 422 validation (CI) + future-date (integration)
│       ├── test_chunking.py           # RAG chunker
│       ├── test_planning_integration.py / test_datasources_integration.py  # @integration
│       └── conftest.py
│
├── apps/web/
│   ├── package.json                   # scripts: dev/build/start/lint/typecheck/test/eval
│   ├── middleware.ts                  # Supabase auth-session refresh on every request
│   ├── tsconfig.json, eslint.config.mjs (native flat config), vitest.config.ts (@ alias + evals)
│   ├── components.json, postcss.config.mjs, .env.example
│   └── src/
│       ├── app/
│       │   ├── page.tsx               # → redirect /plan
│       │   ├── plan/ page.tsx + PlanClient.tsx + actions.ts   # ranked table, save/log
│       │   ├── sessions/ page.tsx + [id]/page.tsx             # saved sessions + logs
│       │   ├── login/page.tsx         # magic-link sign-in
│       │   ├── auth/callback/route.ts + signout/route.ts
│       │   ├── chat/page.tsx          # copilot: renders typed tool-call cards + sources
│       │   ├── api/{chat,plan,visibility}/route.ts            # AI SDK route + proxies
│       │   ├── layout.tsx, globals.css (Tailwind v4 + shadcn tokens)
│       ├── components/ui/             # button, input, card, badge (shadcn new-york)
│       └── lib/
│           ├── api.ts                 # types Visibility/RankedTarget/NightPlan/TargetDetail + fetchers ★
│           ├── knowledge.ts           # searchKnowledge: embed → hybrid_search(15) → rerank(5) ★
│           ├── rerank.ts              # CohereReranker / LLMReranker / rerankPassages ★
│           ├── ai.ts                  # tools planNight/getTargetDetail/searchKnowledge; ChatMessage type ★
│           ├── format.ts (+__tests__), utils.ts (cn)
│           └── supabase/{client,server,types}.ts
│   └── evals/                         # eval harness (offline-runnable)  ★
│       ├── metrics.ts (+test)         # hit@k, precision@k, recall@k, MRR, nDCG, uniqueInOrder
│       ├── fusion.ts (+test)          # reciprocalRankFusion (RRF)
│       ├── faithfulness.ts (+test)    # claim split + score; MockJudge; judge-openai.ts (OpenAIJudge)
│       ├── text.ts                    # tokens/stem/tf/cosineSparse
│       ├── retriever.ts               # Lexical / Dense / Hybrid / Live retrievers
│       ├── rerank.ts (+test)          # LexicalReranker, RerankedRetriever
│       ├── dataset.ts                 # 8 exact + 6 semantic labelled cases
│       ├── run.ts                     # comparison runner (writes report.json; gitignored)
│       ├── braintrust.ts              # optional forwarder (dynamic import, no hard dep)
│       └── README.md
│
└── supabase/
    ├── README.md
    └── migrations/
        ├── 0001_init.sql              # sessions + logged_observations (+ RLS, user-scoped)
        ├── 0002_knowledge.sql         # vector ext + documents + match_documents RPC (public-read RLS)
        └── 0003_hybrid_search.sql     # fts tsvector + GIN + hybrid_search RRF RPC
```

### Web dependency versions (resolved, latest-stable)
`next ^16.2.9 · react ^19.2.7 · ai ^6.0.207 · @ai-sdk/react ^3 · @ai-sdk/openai ^3 ·
@supabase/{ssr ^0.12, supabase-js ^2.108} · tailwindcss ^4.3 · zod ^4.4 · typescript ^6 ·
eslint ^9.39 (NOT 10 — see §2) · vitest ^4.1 · tsx ^4.22`.

---

## 2. Key design decisions & rules (the project "constitution")

1. **Honesty over polish.** Every approximation is labelled, not hidden:
   - The Bortle grid is a **modeled estimate from city lights, not measured satellite
     data**. The `.npy` is the deliberate seam to swap in a real World Atlas/VIIRS raster.
   - The eval harness's offline "dense" retriever and reranker are **deterministic
     stand-ins** for embeddings / a cross-encoder (so it runs with no keys).
   - The bag-of-words reranker **regresses vs hybrid** in the offline eval; this is
     reported (not tuned away) because it correctly shows why a true cross-encoder is
     needed. Don't "fix" the offline number by constructing a winning signal.
2. **Pure core, integration edges.** Deterministic logic (scoring, chunking, metrics,
   fusion, faithfulness aggregation, Bortle model/grid math, parse_when, validation) is
   PURE and unit-tested in CI. Anything touching astropy compute or live network
   (CDS/Simbad, ADS, OpenAI, Supabase) is marked `@pytest.mark.integration` and
   **excluded from CI** (`pytest -m "not integration"`).
3. **Eval-driven decisions.** Retrieval architecture was *chosen by measurement*:
   hybrid (RRF of full-text + vector) beat pure vector on recall@3/nDCG and is the prod
   path; a naive reranker was *rejected* by the harness. New retrieval changes should be
   A/B'd in `evals/run.ts` before adoption.
4. **Light-pollution = multiplicative damping by surface brightness.**
   `score × (1 − LP_MAX_IMPACT·((bortle−1)/8)·light_sensitivity)`. Clusters (low
   sensitivity) barely move; faint galaxies (high sensitivity) are crushed in cities —
   so **rankings flip between a dark site and a city**. This is the defining behaviour;
   preserve it. Bortle is a **location property** (computed once per plan), not per-target.
5. **Validate before astropy.** Shared `Lat`/`Lon` `Annotated` query params (`params.py`)
   enforce bounds (±90 / ±180) on BOTH planning and visibility routers → 422 before any
   astropy call. `when` parse errors → 422; downstream failures → 502.
6. **Embedding model pinned on both sides.** Ingestion (Python) and retrieval (web) both
   use `text-embedding-3-small` (1536-d). A mismatch is a silent RAG bug — never diverge.
7. **RLS model.** `sessions` + `logged_observations` are **user-scoped** (`auth.uid()`).
   `documents` (knowledge base) is **shared**: public-read, writes via service role only.
8. **Versions: latest stable, transparently.** Resolved to Next 16 / AI SDK v6 (the plan
   said Next 15). Flagged in `apps/web/README.md` with a pin-to-15 command. ESLint pinned
   to **9** because eslint-config-next 16's flat config breaks on ESLint 10.
9. **Copilot answers are auditable.** The chat UI renders each tool call (what was queried
   + what came back, incl. cited sources w/ similarity + ADS links). The system prompt
   instructs grounding via `searchKnowledge` and admitting when the corpus is empty.
10. **No emojis/secrets in code; keep CI green.** `ruff`, `ruff format --check`, `mypy
    strict`, `pytest`, plus web `lint/typecheck/test/build` must all stay green.

---

## 3. Exact state of core logic

### `scoring.py` (pure)
- Constants: `MIN_USEFUL_ALT=20.0`, `GOOD_ALT=40.0`, `BRIGHT_MOON=0.7`,
  `CLOSE_MOON_DEG=30.0`, **`LP_MAX_IMPACT=0.8`**.
- `_SENSITIVITY_BY_KIND` (0=robust … 1=fragile): open cluster `0.15`, globular `0.25`,
  planetary nebula `0.30`, emission nebula / nebula `0.55`, galaxy `0.90`, dark nebula
  `1.00`; `DEFAULT_SENSITIVITY=0.55`.
- `@dataclass(frozen=True) TargetConditions(altitude_deg, moon_illumination,
  moon_separation_deg, hours_visible, bortle:int=4, light_sensitivity:float=0.5)`.
  (Defaults keep older constructions valid.)
- `light_sensitivity_for_kind(kind)->float` (case-insensitive, default 0.55).
- `light_pollution_factor(bortle, sensitivity)->float = 1 − 0.8·((clamp(b,1,9)−1)/8)·clamp(s,0,1)`
  ∈ [0.2, 1.0]; Bortle 1 → 1.0 for everything.
- `score_target(c)`: if `altitude<MIN_USEFUL_ALT` → 0.0. Else
  `base = 100·(0.45·alt_term + 0.30·time_term + 0.25·moon_term)` where
  `alt_term=min(1,(alt−20)/40)`, `time_term=min(1,hours/6)`,
  `moon_term=max(0, 1 − illum·max(0,1−sep/90))`; returns `round(base · LP_factor, 1)`.
- `rate_target(altitude_deg, moon_illumination)->str` UNCHANGED (3 buckets, alt+moon
  only). `rank(dict)->sorted list[(name,score)]`.

### `bortle/` (offline, O(1))
- `model.py`: `FALLOFF_EXPONENT=2.5`, `DISTANCE_OFFSET_KM=8.0`,
  `BORTLE_LOG_THRESHOLDS=(0.6,1.1,1.6,2.1,2.7,3.3,4.0,4.7)`.
  `light_index_at(lat,lon,cities)=Σ pop/(d_km+8)^2.5`; `index_to_bortle(i)=
  clamp(1+Σ[log10(i+1)≥t], 1, 9)`; `bortle_for_point(lat,lon)`.
- `grid.py`: `GRID_RESOLUTION_DEG=0.25`; `build_grid()`→`uint8 (720,1440)` (vectorized);
  `load_grid()` = `np.load(GRID_PATH, mmap_mode="r")` (`lru_cache`); **`bortle_at(lat,lon)`**
  → row=`(90−lat)/res`, col=`(lon+180)/res`, clamped → `int(grid[row,col])`.
- Grid validated: NYC/London/Tokyo cores read **7–8**, ~60km→5, ~200km→3, remote→**1**;
  91.5% of cells Bortle 1. Known quantization: city cores read 1–2 classes lower than the
  point model (cell averaging at 0.25°) — acceptable, documented.

### `datasources/planning.py`
- `parse_when(str|None)->Time|None`: None/empty→None; date-only → append `T12:00:00`
  (UTC, biases to upcoming evening); full datetime passthrough; bad → `ValueError`.
- `dark_window(lat,lon,when=None)` → astronomical dusk→dawn + moon illumination.
- `conditions_for(obj,lat,lon,window,bortle)` → samples altitude over the night
  (20-min grid), peak alt + hours-above-floor + moon sep at peak; sets `bortle` and
  `light_sensitivity_for_kind(obj.kind)`.
- `rank_targets(lat,lon,when=None)` → `{dusk_utc, dawn_utc, dark_hours,
  moon_illumination, bortle, targets:[{name, common_name, kind, score, rating,
  peak_altitude_deg, hours_visible, moon_separation_deg, light_sensitivity}]}` sorted by score.
- `target_detail(name,lat,lon,when=None)` → same row + dark_hours/moon/bortle; falls back
  to `FixedTarget.from_name` (Simbad) for non-catalog names.

### Routers (`params.py` + `routers/*`)
- `Lat=Annotated[float,Query(ge=-90,le=90)]`, `Lon=Annotated[float,Query(ge=-180,le=180)]`,
  `When=Annotated[str|None,Query(...)]`.
- `GET /plan/night?lat&lon&when`, `GET /plan/target?name&lat&lon&when`,
  `GET /visibility?target&lat&lon` (now validated), `GET /health`.

### Web `lib`
- `api.ts` types: `NightPlan` now includes **`bortle:number`** (and `RankedTarget`,
  `TargetDetail`, `Visibility`). `fetchVisibility/fetchNightPlan/fetchTargetDetail`.
- `knowledge.ts` `searchKnowledge(query,target?)`: embed (1536) → `supabase.rpc(
  "hybrid_search", {query_text, query_embedding, match_count:15, filter_target})` →
  `rerankPassages(query, candidates, 5)`. `KnowledgePassage` has `target,title,source,
  bibcode,url,content,similarity`.
- `rerank.ts`: `rerankPassages` dispatches **Cohere** (if `COHERE_API_KEY`) → **LLM**
  (if `OPENAI_API_KEY`) → pass-through.
- `ai.ts`: tools `planNight`, `getTargetDetail`, `searchKnowledge`; typed `ChatMessage =
  UIMessage<never,UIDataTypes,InferUITools<typeof tools>>`. Chat route uses
  `await convertToModelMessages(...)` (v6 is async), `stopWhen: stepCountIs(6)`,
  `toUIMessageStreamResponse()`. Client uses `useChat<ChatMessage>()` + `sendMessage({text})`.

### Supabase migrations
- `0001`: `sessions(id,user_id,title,lat,lon,planned_for,created_at)`,
  `logged_observations(...,session_id,user_id,target,score,rating,notes,observed_at)`;
  RLS = own rows only.
- `0002`: `create extension vector`; `documents(id,target,title,source,bibcode,url,
  content,embedding vector(1536),created_at)`; HNSW cosine index; RLS public-read;
  `match_documents(query_embedding,match_count,filter_target)` RPC.
- `0003`: generated `fts tsvector` + GIN; `hybrid_search(query_text,query_embedding,
  match_count,full_text_weight,semantic_weight,rrf_k,filter_target)` RRF over full-text +
  vector, returns `...,similarity`. (Run order: 0001 → 0002 → 0003.)

### Eval harness numbers (offline, deterministic stand-ins)
```
retriever                    recall@3  MRR  nDCG@5
lexical(sparse)              0.64      0.64  0.64   (exact 1.00 / semantic 0.17)
dense(offline)               0.80      0.82  0.81   (exact 0.75 / semantic 0.88)
hybrid (RRF)                 0.88      0.86  0.88   ← best first stage; prod path
hybrid -> rerank(lexical)    0.80      0.84  0.84   ← regresses (bag-of-words ≈ dense)
```

---

## 4. Verification, CI & environment quirks

- **CI** (`.github/workflows/ci.yml`):
  - `api`: `uv sync` → `ruff check .` → `ruff format --check .` → `mypy src` →
    `pytest -m "not integration"`.
  - `web`: `pnpm install --frozen-lockfile` → `pnpm --filter @astroscout/web
    lint|typecheck|test|build`. Job sets `npm_config_verify_deps_before_run=false`.
- **Current green status**: API **34 unit tests** pass (ruff/format/mypy clean); web
  **29 tests** pass (metrics 12, faithfulness 7, fusion 4, rerank 3, format 3) + typecheck
  + lint + build (12 routes).
- **How to verify locally**:
  - API: from `apps/api`, `PYTHONPATH=src python -m pytest -m "not integration"`, plus
    `ruff check .`, `ruff format --check .`, `mypy src`.
  - Web: deps via corepack `pnpm`; **verify via direct binaries** to dodge the sandbox
    pnpm-run quirk: `apps/web/node_modules/.bin/{tsc --noEmit, eslint ., vitest run,
    next build}`. Run the eval harness offline: `node_modules/.bin/tsx evals/run.ts`.
  - Regenerate Bortle grid: `apps/api` → `PYTHONPATH=src python scripts/build_bortle_grid.py`.
- **Sandbox quirks (NOT bugs; won't affect real CI)**:
  - `pnpm run`/`pnpm exec` trips a pre-run auto-install check due to a *global*
    supply-chain policy in this container → verify web via direct `.bin` binaries; real
    CI uses the `.npmrc`/env disable.
  - "Ignored build scripts" warning (sharp, unrs-resolver) is cosmetic — they ship
    prebuilt binaries; `pnpm install` still exits 0.
  - No network to OpenAI/Supabase/ADS/CDS in the sandbox → those paths can't execute
    here; covered by integration tests + offline stand-ins.

---

## 5. Immediate next steps & unresolved items

**No known functional bugs.** The pipeline is end-to-end green. Open work, roughly by value:

1. **Measure the live cross-encoder rerank lift.** The single number the offline harness
   can't produce: run `evals/run.ts` with `OPENAI_API_KEY` (+ Supabase, or `COHERE_API_KEY`)
   to quantify hybrid → hybrid+rerank on the live corpus. This *confirms or refutes* the
   prod choice. Requires ingesting the knowledge base first (`scripts/ingest_knowledge.py
   --all`) and running migrations 0001–0003.
2. **Higher-fidelity light pollution.** Swap the modeled grid for a real World Atlas /
   VIIRS raster (downsampled to a `uint8 (720,1440)` 0.25° `.npy` at the same path/
   orientation) — *zero code change*. This also fixes the city-core quantization
   (NYC currently reads 7, not 9).
3. **Surface `light_sensitivity` in the web UI** so users see *why* a galaxy dropped in
   ranking (the data is already in each plan row). Add a **date picker** to `/plan` to
   exercise the new `when` param (the API supports it; the UI doesn't send it yet).
4. **Retrieval polish** (A/B in the harness first): per-passage chunk dedup; a local
   no-vendor cross-encoder (e.g. bge-reranker) as a third `rerankPassages` backend.
5. **Copilot faithfulness in CI-adjacent form.** `OpenAIJudge` exists; wire a small
   live-gated faithfulness pass over a few canned copilot answers to catch ungrounded
   claims (offline uses `MockJudge`).
6. **Planets / non-DSO targets.** Catalog is DSO-only; planets (high surface brightness,
   ~0 light sensitivity) aren't modelled. If added, give them `light_sensitivity ≈ 0`.

**Integration tests that need live services** (run manually with keys, excluded from CI):
`test_datasources_integration.py` (CDS/Simbad + ADS), `test_planning_integration.py`
(astropy compute), `test_routers.py::*future*` (astropy compute). In the sandbox the
CDS/Simbad ones fail purely due to blocked network — expected.

---

## 6. How to run the whole thing (live)

```bash
# 1. Supabase: create project; run migrations 0001→0002→0003; enable email auth;
#    allow http://localhost:3000/auth/callback
# 2. API
cd apps/api && uv sync
cp ../../.env.example ../../.env         # ADS/OpenAI/Supabase keys; CORS has a default
uv run uvicorn astroscout_api.main:app --reload          # http://127.0.0.1:8000/docs
uv run python scripts/ingest_knowledge.py --all          # populate the RAG corpus
# 3. Web (repo root, 2nd terminal)
pnpm install
cp apps/web/.env.example apps/web/.env.local             # Supabase URL/anon + OPENAI (+ COHERE)
pnpm --filter @astroscout/web dev                        # http://localhost:3000
```
`/plan` works without auth; sign-in (magic link) unlocks save/log; `/chat` needs
`OPENAI_API_KEY` and an ingested corpus for grounded answers.
