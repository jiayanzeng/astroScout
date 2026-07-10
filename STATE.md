# AstroScout — STATE.md (handoff @ v0.6.1)

A working vertical slice of an astronomy **observation-planning + knowledge copilot**
for amateur astronomers. Given a location (and optional future date) it ranks what's
worth observing/imaging — accounting for altitude, the dark window, the moon, **and
local light pollution** — lets users save sessions and log observations, and answers
astronomy questions via an AI copilot grounded in a cited literature corpus (hybrid
RAG + cross-encoder rerank). Everything here is built and tested; you supply ADS /
OpenAI / Supabase (+ optional Cohere) keys to run it live. OpenAI calls can be routed
through any OpenAI-compatible relay via `OPENAI_BASE_URL` (v0.6.1).

This document is the source of truth for a fresh session. Read it fully before editing.

**v0.6 → v0.6.1 delta (2026-07-02, see the modification record):**
ADS `object:` queries now resolved via the ADS object service (`resolve_object_query`,
+6 CI unit tests); `openai_base_url` added to `Settings` and honored by
`rag/embeddings.py` (relay support, env-only on the web side); Supabase env fixed
(bare project URL; service-role GRANTs). The relay patch briefly left
`rag/embeddings.py` failing `ruff check` (E501) + `ruff format --check`; that lint
regression was fixed (§5 item 0, 2026-07-10) and CI is green again. Post-v0.6.1,
Tasks 1–5 also landed (env anchoring, relay verification, live rerank numbers, UI) —
see §5.

---

## 1. Architecture & file structure

### Stack
- **API** (`apps/api`): FastAPI + astropy/astroplan/numpy. Python 3.12, managed by **uv**,
  build backend **hatchling**, src layout, package `astroscout_api`. mypy `strict`.
- **Web** (`apps/web`): **Next.js 16** (App Router) + **React 19** + **Tailwind v4** +
  shadcn/ui + **Vercel AI SDK v6** + **TypeScript 6**. Package name `@astroscout/web`.
- **Data**: **Supabase** — auth (email magic link), Postgres + **pgvector**, RLS.
- **AI**: OpenAI (`gpt-4o-mini` chat + `text-embedding-3-small` embeddings); optional
  **Cohere Rerank** cross-encoder. Any OpenAI-compatible relay works via
  `OPENAI_BASE_URL`: the API reads it from `Settings`, the web reads it natively —
  `@ai-sdk/openai` v3 falls back to the `OPENAI_BASE_URL` env var (verified in the
  package source), so the web side needs **no code change**.
- **Monorepo**: pnpm 11.8 workspace (`pnpm-workspace.yaml`), single root `pnpm-lock.yaml`.

### Data flow
```
location (+when) ─► FastAPI /plan/night ─► dark_window + per-target astropy compute
                                          + bortle_at(lat,lon)  ─► scoring.score_target
                                          ─► ranked targets (LP-aware) + bortle
web /plan ─► /api/plan (proxy) ─► table (save session / log observation → Supabase RLS)
copilot /chat ─► /api/chat (AI SDK streamText, 3 tools) ─► planNight / getTargetDetail
                                          / searchKnowledge(embed→hybrid_search→rerank)
ingestion: ADS object resolver ─► abstracts ─► chunk ─► embed (base-URL aware)
                                          ─► pgvector (documents)  [Python CLI]
```

### File tree (annotated; excludes node_modules / build artifacts)
```
astroscout/
├── README.md                      # user-facing overview (v0.6.1)
├── STATE.md                       # this file
├── package.json                   # root: name, packageManager pnpm@11.8.0
├── pnpm-workspace.yaml            # packages: apps/*, packages/*; onlyBuiltDependencies
├── pnpm-lock.yaml                 # committed — CI uses --frozen-lockfile
├── .npmrc                         # verify-deps-before-run=false (see §4)
├── .env.example                   # API keys (ADS / OpenAI / Supabase / CORS / OPENAI_BASE_URL)
├── justfile, .pre-commit-config.yaml, .python-version   # Week-1 dev tooling
├── .github/workflows/ci.yml       # api job + web job (see §4)
│
├── apps/api/
│   ├── pyproject.toml             # deps, ruff/mypy/pytest config, hatch wheel artifacts(*.npy)
│   ├── Dockerfile, README.md
│   ├── scripts/
│   │   ├── validate_sources.py        # Week-1: prove data sources reachable
│   │   ├── ingest_knowledge.py        # RAG ingest CLI: --all | --target M31 --rows N
│   │   ├── build_bortle_grid.py       # regenerate bortle_grid.npy from the city model (fallback)
│   │   ├── build_bortle_grid_viirs.py # regenerate bortle_grid.npy from World Atlas 2015 raster (q3)
│   └── src/astroscout_api/
│       ├── main.py                    # FastAPI app: CORS + routers (health, visibility, planning)
│       ├── config.py                  # Settings: ads_token, openai_api_key, openai_base_url,
│       │                              #   supabase_url, supabase_service_key, cors_origins_raw
│       │                              #   env_file anchored to repo root (§4 quirks)
│       ├── params.py                  # shared Annotated query types: Lat, Lon, When
│       ├── scoring.py                 # PURE scorer + light-pollution linkage  ★core
│       ├── bortle/                    # OFFLINE light-pollution lookup  ★core (v0.6)
│       │   ├── cities.py              #   82 City(name,lat,lon,population) seed
│       │   ├── model.py               #   PURE: light_index_at, index_to_bortle, haversine_km (fallback)
│       │   ├── grid.py                #   build_grid / load_grid (mmap) / bortle_at  O(1)
│       │   └── bortle_grid.npy        #   COMMITTED uint8 grid (720×1440, 0.25°, ~1MB) — World Atlas 2015 q3
│       ├── datasources/
│       │   ├── dso_catalog.py         # 15 DSOs: CatalogObject(name,ra_hours,dec_deg,kind,common_name)
│       │   ├── planning.py            # dark_window, conditions_for, rank_targets, target_detail, parse_when ★core
│       │   ├── visibility.py          # get_visibility (Simbad), get_darkness
│       │   ├── catalog.py             # resolve_object via Simbad/astroquery
│       │   └── literature.py          # resolve_object_query (ADS object svc → Solr fields),
│       │                              #   fallback_query, count_literature, fetch_abstracts ★(v0.6.1)
│       ├── rag/
│       │   ├── chunking.py            # PURE chunk_text (overlapping)  [unit-tested]
│       │   ├── embeddings.py          # embed_texts via OpenAI-compatible /embeddings endpoint
│       │   │                          #   (settings.openai_base_url, default api.openai.com/v1)
│       │   ├── store.py               # upsert_documents via Supabase PostgREST (service role);
│       │   │                          #   appends /rest/v1/documents — SUPABASE_URL must be bare
│       │   └── ingest.py              # ingest_target / ingest_catalog (fetch→chunk→embed→store)
│       └── routers/
│           ├── health.py              # GET /health
│           ├── visibility.py          # GET /visibility?target=&lat=&lon=   (Lat/Lon validated)
│           └── planning.py            # GET /plan/night, /plan/target  (Lat/Lon/When)
│   └── tests/                         # see §4 for what's CI vs integration
│       ├── test_scoring.py            # scoring + light-pollution (incl. ranking-flip)  [13]
│       ├── test_bortle.py             # model, grid index math, bortle_at sanity  [6]
│       ├── test_parse_when.py         # date/datetime parsing  [4]
│       ├── test_routers.py            # 422 validation (CI, 5) + future-date (integration, 2)
│       ├── test_chunking.py           # RAG chunker  [6]
│       ├── test_literature.py         # ADS resolver translation + fallbacks (CI, 6)
│       │                              #   + live round-trips (integration, 3)  ★(v0.6.1)
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
│       │                              #   NOTE: LiveRetriever has a constructor flag producing
│       │                              #   pgvector-hybrid(live) (no rerank) and
│       │                              #   pgvector-hybrid+rerank(live) variants;
│       │                              #   searchKnowledge accepts {rerank?: boolean}
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
   - The Bortle grid is now **satellite-derived** from the World Atlas 2015 (Falchi et
     al. 2016, VIIRS DNB + Cinzano–Falchi radiative-transfer model, SQM-calibrated),
     aggregated to 0.25° by 75th percentile. The city model in `model.py` remains the
     offline modeled fallback. NYC core reads Bortle **7** under q3; it also read 7 under
     the city model and the averaged World Atlas grid. q3 was selected to reduce mean
     dilution across a roughly 27 km cell while avoiding `max` sensitivity to isolated
     bright pixels. The NYC cell did not cross the next discrete Bortle boundary; that is
     an observed result, not a value to tune away. The `.npy` is the deliberate seam —
     swap it and nothing else changes.
   - The eval harness's offline "dense" retriever and reranker are **deterministic
     stand-ins** for embeddings / a cross-encoder (so it runs with no keys).
   - The bag-of-words reranker **regresses vs hybrid** in the offline eval; this is
     reported (not tuned away) because it correctly shows why a true cross-encoder is
     needed. Don't "fix" the offline number by constructing a winning signal.
2. **Pure core, integration edges.** Deterministic logic (scoring, chunking, metrics,
   fusion, faithfulness aggregation, Bortle model/grid math, parse_when, validation,
   ADS query translation) is PURE and unit-tested in CI — the ADS resolver is tested
   against a stubbed httpx so its fallback logic runs in CI. Anything touching astropy
   compute or live network (CDS/Simbad, ADS, OpenAI, Supabase) is marked
   `@pytest.mark.integration` and **excluded from CI** (`pytest -m "not integration"`).
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
   Relay corollary (v0.6.1): if `OPENAI_BASE_URL` points at a relay, the relay must serve
   this exact model on **both** sides; point both sides at the same endpoint.
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
    (Green as of 2026-07-10; the transient `rag/embeddings.py` lint regression is fixed.)
11. **Vendor endpoints are configuration, not code.** Relay/base-URL switching lives in
    env (`OPENAI_BASE_URL`) with the official endpoint as the in-code default. Never
    hardcode a relay URL; never commit `.env` / `.env.local`.

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
- **Grid is now World Atlas 2015 satellite-derived** (75th-percentile aggregation;
  `scripts/build_bortle_grid_viirs.py`). City cores (NYC, London, Tokyo, Delhi, Cairo)
  all read **Bortle 7** under q3. Exact committed-grid class histogram:
  ```text
  Bortle 1:       0
  Bortle 2: 993,599
  Bortle 3:  17,304
  Bortle 4:  20,403
  Bortle 5:   4,019
  Bortle 6:   1,184
  Bortle 7:     263
  Bortle 8:      27
  Bortle 9:       1
  ```
  **0% Bortle 1** — the 171 μcd/m² natural-background floor puts pristine sky at
  ~21.998 mag/arcsec² → class 2. At the bright end, under the accepted Bortle↔SQM
  table, class 8 begins above approximately 10,594 μcd/m² artificial brightness and
  class 9 above approximately 42,684 μcd/m². The named q3 city cells remain class 7,
  and only one global cell reaches class 9. NYC also read 7 under the city model and
  under averaged World Atlas aggregation; q3 preserves city cores better than averaging
  without `max`'s sensitivity to outlier pixels, but the NYC 0.25° cell does not cross
  the next discrete boundary. (The old city-model grid was 91.5% Bortle 1 with city
  cores at 7–8 — replaced because modeled population falloff overestimates remote
  darkness and underserves urban observers.)

### `datasources/literature.py` (ADS — v0.6.1)
- `object:` is a **virtual** ADS operator, not a Solr field: sending it straight to
  `/v1/search/query` fails with 400 "undefined field object".
- `resolve_object_query(target)` POSTs `{"query": ['object:"{target}"']}` to
  `/v1/objects/query`, which returns the real-field translation, e.g. for M31:
  `((=abs:"M31" OR simbid:"1575544" OR nedid:"Messier_031") database:astronomy)`.
- On any `httpx.HTTPError`, empty, or non-string translation → `fallback_query(target)`
  = `abs:"{target}"` (degraded but working: fine for catalog designations, misses
  papers tagged only by canonical names). Requires `ADS_TOKEN`.
- `count_literature` / `fetch_abstracts` both route through the resolver. Validated
  live: literature check returns PASS for M31.

### `rag/embeddings.py` (v0.6.1)
- `EMBED_MODEL="text-embedding-3-small"`, `EMBED_DIM=1536` (pinned — rule 6).
- `embed_texts` resolves the endpoint at call time:
  `base_url = settings.openai_base_url or "https://api.openai.com/v1"`, then POSTs to
  `{base_url}/embeddings`. Unset → official API; set → relay. No other code touched.
- Lint clean (fixed 2026-07-10, §5 item 0): the over-long comment was shortened to
  ≤100 chars and trailing whitespace stripped; behavior unchanged (same base-URL
  fallback, no logic touched).

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
- `knowledge.ts` `searchKnowledge(query,target?,opts?: {rerank?: boolean})`: embed
  (1536) → `supabase.rpc("hybrid_search", {query_text, query_embedding,
  match_count:15, filter_target})`. When `opts.rerank === false` returns top-5 hybrid
  candidates directly (RPC similarity scores); otherwise →
  `rerankPassages(query, candidates, 5)`. `KnowledgePassage` has `target,title,source,
  bibcode,url,content,similarity`.
- `rerank.ts`: `rerankPassages` dispatches **Cohere** (if `COHERE_API_KEY`) → **LLM**
  (if `OPENAI_API_KEY`) → pass-through.
- `ai.ts`: tools `planNight`, `getTargetDetail`, `searchKnowledge`; typed `ChatMessage =
  UIMessage<never,UIDataTypes,InferUITools<typeof tools>>`. Chat route uses
  `await convertToModelMessages(...)` (v6 is async), `stopWhen: stepCountIs(6)`,
  `toUIMessageStreamResponse()`. Client uses `useChat<ChatMessage>()` + `sendMessage({text})`.
- Relay note (v0.6.1): all web OpenAI calls use the default `openai` provider instance,
  which reads `OPENAI_API_KEY` **and** `OPENAI_BASE_URL` from env — set both in
  `.env.local` to route through a relay. See §5 item 2 for the Responses-API caveat.

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

### Live corpus numbers (pgvector hybrid, 203 chunks over 15 targets, 2026-07-09)
```
retriever                         recall@3  MRR  nDCG@5  reranker
pgvector-hybrid(live)             0.36      0.43  0.45    —
pgvector-hybrid+rerank(live)      0.57      0.57  0.61    llm (gpt-4o-mini)
```
Rerank lifts. Cohere not tested (no key).

---

## 4. Verification, CI & environment quirks

- **CI** (`.github/workflows/ci.yml`):
  - `api`: `uv sync` → `ruff check .` → `ruff format --check .` → `mypy src` →
    `pytest -m "not integration"`.
  - `web`: `pnpm install --frozen-lockfile` → `pnpm --filter @astroscout/web
    lint|typecheck|test|build`. Job sets `npm_config_verify_deps_before_run=false`.
- **Current status (verified 2026-07-10, fresh env): CI is green.** API **42 unit
  tests pass** (34 @ v0.6 + 6 ADS-resolver + 2 config-anchoring from Task 1), 10
  deselected as integration; `ruff check`, `ruff format --check`, and `mypy src` all
  clean — the 2026-07-02 relay-patch lint regression in `rag/embeddings.py` is fixed
  (§5 item 0). Web (Tasks 3a/4 landed): **32 tests** (metrics 12, faithfulness 7,
  fusion 4, rerank 3, format 6) + typecheck + lint + build (12 routes).
- **How to verify locally**:
  - API: from `apps/api`, `PYTHONPATH=src python -m pytest -m "not integration"`, plus
    `ruff check .`, `ruff format --check .`, `mypy src`.
  - Web: deps via corepack `pnpm`; **verify via direct binaries** to dodge the sandbox
    pnpm-run quirk: `apps/web/node_modules/.bin/{tsc --noEmit, eslint ., vitest run,
    next build}`. Run the eval harness offline: `node_modules/.bin/tsx evals/run.ts`.
  - Regenerate production Bortle grid: `apps/api` → `uv run --with rasterio python
    scripts/build_bortle_grid_viirs.py --src
    /Users/yzjia/Documents/World_Atlas_2015/World_Atlas_2015.tif --units mcd`.
    Offline city-model fallback only: `PYTHONPATH=src python scripts/build_bortle_grid.py`.
- **Supabase environment gotchas (learned live, 2026-07-02)**:
  - `SUPABASE_URL` must be the **bare project URL** (`https://<ref>.supabase.co`) —
    `rag/store.py` appends `/rest/v1/documents` itself; a URL with `/rest/v1` doubles
    the path and fails.
  - **Key selection**: API `SUPABASE_SERVICE_KEY` = the **legacy `service_role`
    secret** (the long JWT); web `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **new
    publishable key** (`sb_publishable_...`).
  - If ingest hits `permission denied for table documents` (code 42501), the tables
    were created under a different owner/role — grant explicitly in the SQL editor:
    ```sql
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO service_role;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
    ```
- **Local-dev quirks (real machines, not the sandbox)**:
  - Newer pnpm blocks dependency build scripts by default
    (`ERR_PNPM_IGNORED_BUILDS` for `sharp`, `esbuild`). Run `pnpm approve-builds` in
    `apps/web` once after install, or Next.js may crash on missing native binaries.
    (In the CI/sandbox environments the warning is cosmetic — prebuilt binaries ship.)
  - If a local HTTPS-intercepting proxy (Clash/VPN) breaks Node TLS
    (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`), `NODE_TLS_REJECT_UNAUTHORIZED=0` in
    `apps/web/.env.local` unblocks dev. **Local-only escape hatch — never commit or
    deploy it**; the clean fix is `NODE_EXTRA_CA_CERTS=<proxy-CA.pem>`.
  - **pydantic-settings env_file anchored to repo root** (fixed 2026-07-09, §5 item 1).
    Env-file paths are absolute, derived from `config.py`'s own location — no longer
    dependent on the process CWD. The tuple `(_REPO_ROOT / ".env", apps/api/.env)` means
    the repo-root `.env` is the default and `apps/api/.env` is a local override (later
    tuple entry wins on pydantic-settings 2.14.2). Stale copies can no longer silently
    override the intended keys.
- **Sandbox quirks (NOT bugs; won't affect real CI)**:
  - `pnpm run`/`pnpm exec` trips a pre-run auto-install check due to a *global*
    supply-chain policy in this container → verify web via direct `.bin` binaries; real
    CI uses the `.npmrc`/env disable.
  - No network to OpenAI/Supabase/ADS/CDS in the sandbox → those paths can't execute
    here; covered by integration tests + offline stand-ins.

---

## 5. Immediate next steps & unresolved items

**CI is green.** Items 0, 1, 2, 3, and 5 are done (lint fix, env/config hardening,
relay verification, live rerank measurement, UI). The remaining open work is the
data / retrieval / catalog backlog — items 4, 6, 7, 8:

0. ✅ **Restore CI green — `rag/embeddings.py` lint/format fixed (Done 2026-07-10).**
   The over-long comment was shortened (now ≤100 chars) and trailing whitespace
   stripped; `ruff check .`, `ruff format --check .`, `mypy src`, and the unit tests
   (now 42) all pass. Behavior unchanged (same base-URL fallback).
1. ✅ **Harden relay/env configuration (Done 2026-07-09).** (a) `OPENAI_BASE_URL=`
   added to root `.env.example` and `apps/web/.env.example` — the relay knob is now
   discoverable. (b) `Settings.model_config.env_file` anchored to the repo root via
   `(_REPO_ROOT / ".env", Path(__file__).resolve().parents[2] / ".env")` so loading no
   longer depends on CWD and stale copies can't recur. Two CI-safe unit tests in
   `test_config.py` assert the anchored shape and CWD-independence.
2. ✅ **Verify the relay end-to-end on the web side (Done 2026-07-09).** Both
   `streamText` (`/chat`) and `generateObject` (LLM reranker, `judge-openai.ts`) were
   tested through the configured relay (`OPENAI_BASE_URL=https://www.dmxapi.cn/v1`) using
   `openai("gpt-4o-mini")` (Responses API, `/v1/responses`). Both succeeded without code
   changes — the relay supports the Responses API. No switch to `openai.chat(...)` needed.
3. ✅ **Measure the live cross-encoder rerank lift (Done 2026-07-09).** Ingest: 203
   chunks across 15 targets (no zeros). Live eval (LLM reranker, gpt-4o-mini):
   hybrid recall@3=0.36 / MRR=0.43 / nDCG@5=0.45; hybrid+rerank recall@3=0.57 /
   MRR=0.57 / nDCG@5=0.61. Rerank lifts — the prod choice is confirmed. Cohere not
   tested (no key). Results recorded at §3.
4. ✅ **Higher-fidelity light pollution (Done 2026-07-10).** Swapped the modeled grid
   for a World Atlas 2015 raster (75th-percentile aggregation, 0.25°, `bortle_grid.npy`
   regenerated via `scripts/build_bortle_grid_viirs.py`) — **zero code change**.
   City cores read Bortle 7 (NYC, London, Tokyo, Delhi, Cairo). Exact histogram:
   B1=0, B2=993,599, B3=17,304, B4=20,403, B5=4,019, B6=1,184, B7=263, B8=27,
   B9=1. The `model.py` Walker-law estimator remains the offline fallback.
5. ✅ **Surface `light_sensitivity` in the web UI + date picker (Done 2026-07-10).**
   `light_sensitivity` column added to `/plan` table (badge: robust/moderate/fragile
   with numeric tooltip; thresholds ≤0.3/≤0.6/>0.6). Date picker wired to `when` param
   (native `<input type="date">`, re-fetches on change, 422 surfaced inline). Dark-window
   dusk/dawn UTC displayed in the plan card. `ApiError` class added to `api.ts` to
   preserve backend status codes through the proxy. `lightSensitivityTier` in `format.ts`
   with unit tests (32 total, +3). `RankedTarget` gains `light_sensitivity: number`;
   `fetchNightPlan`/`fetchTargetDetail` accept optional `when`; plan proxy reads and
   passes `when`. No new dependencies.
6. **Retrieval polish** (A/B in the harness first): per-passage chunk dedup; a local
   no-vendor cross-encoder (e.g. bge-reranker) as a third `rerankPassages` backend.
7. **Copilot faithfulness in CI-adjacent form.** `OpenAIJudge` exists; wire a small
   live-gated faithfulness pass over a few canned copilot answers to catch ungrounded
   claims (offline uses `MockJudge`).
8. **Planets / non-DSO targets.** Catalog is DSO-only; planets (high surface brightness,
   ~0 light sensitivity) aren't modelled. If added, give them `light_sensitivity ≈ 0`.

**Integration tests that need live services** (run manually with keys, excluded from CI):
`test_datasources_integration.py` (CDS/Simbad + ADS), `test_planning_integration.py`
(astropy compute), `test_routers.py::*future*` (astropy compute),
`test_literature.py::*live*` (ADS resolver round-trips). In the sandbox the CDS/Simbad
ones fail purely due to blocked network — expected.

---

## 6. How to run the whole thing (live)

```bash
# 1. Supabase: create project; run migrations 0001→0002→0003; enable email auth;
#    allow http://localhost:3000/auth/callback
#    SUPABASE_URL = bare project URL (no /rest/v1); if ingest hits 42501, run the
#    GRANT statements in §4.
# 2. API
cd apps/api && uv sync
cp ../../.env.example ../../.env         # ADS/OpenAI/Supabase keys; CORS has a default
                                         # optional: OPENAI_BASE_URL=<relay>/v1
uv run uvicorn astroscout_api.main:app --reload          # http://127.0.0.1:8000/docs
uv run python scripts/ingest_knowledge.py --all          # populate the RAG corpus
# 3. Web (repo root, 2nd terminal)
pnpm install
pnpm --dir apps/web approve-builds                       # sharp/esbuild native builds (local machines)
cp apps/web/.env.example apps/web/.env.local             # Supabase URL/anon + OPENAI (+ COHERE)
                                                         # optional: OPENAI_BASE_URL=<relay>/v1
pnpm --filter @astroscout/web dev                        # http://localhost:3000
```
`/plan` works without auth; sign-in (magic link) unlocks save/log; `/chat` needs
`OPENAI_API_KEY` and an ingested corpus for grounded answers.
