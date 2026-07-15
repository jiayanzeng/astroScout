# AstroScout — STATE.md (handoff @ v0.6.1)

A working vertical slice of an astronomy **observation-planning + knowledge copilot**
for amateur astronomers. Given a location (and optional future date) it ranks what's
worth observing/imaging — accounting for altitude, the dark window, the moon, **and
local light pollution** — lets users save sessions and log observations, and answers
astronomy questions via an AI copilot grounded in a cited literature corpus (hybrid
RAG + cross-encoder rerank). The documented vertical slice is substantially built and
locally tested; the post-audit production-closeout work in §5 remains open. You supply
ADS / OpenAI / Supabase (+ optional Cohere) keys to run it live. An opt-in local BGE
ONNX reranker is also implemented. OpenAI calls can be routed through any
OpenAI-compatible relay via `OPENAI_BASE_URL` (v0.6.1).

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
  **Cohere Rerank** or local BAAI **bge-reranker-base** ONNX cross-encoder. Any
  OpenAI-compatible relay works via
  `OPENAI_BASE_URL`: the API reads it from `Settings`, the web reads it natively —
  `@ai-sdk/openai` v3 falls back to the `OPENAI_BASE_URL` env var (verified in the
  package source), so the web side needs **no code change**.
- **Monorepo**: pnpm 11.8 workspace (`pnpm-workspace.yaml`), single root `pnpm-lock.yaml`.

### Data flow
```
location (+when, optional gear/SQM) ─► FastAPI /plan/night ─► dark_window + per-target astropy compute
                                          + bortle_at(lat,lon)  ─► scoring.score_target
                                          ─► ranked targets + optional pure budget ranges
web /plan ─► /api/plan (proxy) ─► table (save session / log observation → Supabase RLS)
selected target + gear ─► /api/project ─► /plan/project ─► 30-night completion detail
copilot /chat + trusted /plan observer context ─► /api/chat (AI SDK streamText, 3 tools)
                 ├─► server-bound planNight / getTargetDetail (model never supplies coordinates)
                 └─► required searchKnowledge ─► deterministic cited corpus-only science response
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
│       ├── budget.py                  # PURE integration-time ranges + visible assumptions
│       ├── params.py                  # shared validated query types: coords/time/projection gear
│       ├── protection.py              # projection rate + concurrency guards
│       ├── scoring.py                 # PURE scorer + light-pollution linkage  ★core
│       ├── bortle/                    # OFFLINE light-pollution lookup  ★core (v0.6)
│       │   ├── calibration.py         #   PURE Bortle↔SQM single authority + midpoints
│       │   ├── cities.py              #   82 City(name,lat,lon,population) seed
│       │   ├── model.py               #   PURE: light_index_at, index_to_bortle, haversine_km (fallback)
│       │   ├── grid.py                #   Bortle + optional continuous-SQM mmap lookups O(1)
│       │   ├── bortle_grid.npy        #   COMMITTED uint8 grid (720×1440, 0.25°, ~1MB) — World Atlas 2015 q3
│       │   └── sqm_grid.npy           #   COMMITTED float16 SQM sidecar (720×1440, ~2MB), same run
│       ├── datasources/
│       │   ├── dso_catalog.py         # 16 fixed DSOs + four planets + Moon
│       │   ├── planning.py            # dark window + fixed/moving-body visibility/ranking ★core
│       │   ├── targets.py             # explicit local/Simbad resolution domain errors
│       │   ├── visibility.py          # local/Simbad visibility + moving targets, get_darkness
│       │   ├── catalog.py             # resolve_object via Simbad/astroquery
│       │   └── literature.py          # resolve_object_query (ADS object svc → Solr fields),
│       │                              #   fallback_query, count_literature, fetch_abstracts ★(v0.6.1)
│       ├── rag/
│       │   ├── chunking.py            # PURE chunk_text (overlapping)  [unit-tested]
│       │   ├── embeddings.py          # embed_texts via OpenAI-compatible /embeddings endpoint
│       │   │                          #   (settings.openai_base_url, default api.openai.com/v1)
│       │   ├── store.py               # insert helper historically named upsert_documents;
│       │   │                          #   no conflict key; SUPABASE_URL must be bare
│       │   └── ingest.py              # ingest_target / ingest_catalog (fetch→chunk→embed→store)
│       └── routers/
│           ├── health.py              # GET /health
│           ├── errors.py              # target-domain HTTP mapping
│           ├── visibility.py          # GET /visibility?target=&lat=&lon=   (Lat/Lon validated)
│           └── planning.py            # GET /plan/night, /plan/target, /plan/project
│   └── tests/                         # see §4 for what's CI vs integration
│       ├── test_budget.py             # pure budget identities, ranges, cumulative nights  [16]
│       ├── test_scoring.py            # scoring + light-pollution (incl. planet neutrality)  [14]
│       ├── test_bortle.py             # model, Bortle/SQM grid math + calibration  [11]
│       ├── test_parse_when.py         # date/datetime parsing  [4]
│       ├── test_routers.py            # 422 validation (CI, 13) + future-date (integration, 2)
│       ├── test_target_resolution.py  # catalog/Simbad/error categories
│       ├── test_protection.py         # projection rate/concurrency guards
│       ├── test_chunking.py           # RAG chunker  [6]
│       ├── test_literature.py         # ADS resolver translation + fallbacks (CI, 6)
│       │                              #   + live round-trips (integration, 3)  ★(v0.6.1)
│       ├── test_planning_integration.py / test_datasources_integration.py  # @integration
│       └── conftest.py
│
├── apps/web/
│   ├── package.json                   # scripts: dev/build/start/lint/typecheck/test/eval
│   ├── tsconfig.json, eslint.config.mjs (native flat config), vitest.config.ts (@ alias + evals)
│   ├── components.json, postcss.config.mjs, .env.example
│   └── src/
│       ├── proxy.ts                   # Node-runtime Supabase auth-session refresh (Next 16)
│       ├── app/
│       │   ├── page.tsx               # → redirect /plan
│       │   ├── plan/ page.tsx + PlanClient.tsx + actions.ts   # ranked table, budgets, save/log/gear
│       │   │   ├── GearCard.tsx        # signed-in gear CRUD + local selected-profile seam
│       │   │   └── ProjectDetailCard.tsx # on-demand completion range + usable-hours strip
│       │   ├── sessions/ page.tsx + [id]/page.tsx             # saved sessions + logs
│       │   ├── login/page.tsx         # magic-link sign-in
│       │   ├── auth/callback/route.ts + signout/route.ts
│       │   ├── chat/page.tsx          # authenticated copilot + text-only local history
│       │   ├── privacy/page.tsx       # chat storage/provider/accounting disclosure
│       │   ├── api/{chat,plan,project,visibility}/route.ts    # AI SDK route + proxies
│       │   ├── layout.tsx, globals.css (Tailwind v4 + shadcn tokens)
│       ├── components/ui/             # button, input, card, badge (shadcn new-york)
│       └── lib/
│           ├── api.ts                 # types Visibility/RankedTarget/NightPlan/TargetDetail + fetchers ★
│           ├── knowledge.ts           # hybrid_search(15) → per-document dedup → rerank(5) ★
│           ├── rerank.ts              # Cohere / LLM / lazy local BGE backends ★
│           ├── ai.ts                  # server-bound planning + literature tools; ChatMessage type ★
│           ├── observer-context.ts    # validated persisted /plan coordinates/date/source ★
│           ├── chat-policy.ts         # deterministic required-tool trajectory policy ★
│           ├── grounded-response.ts   # suppress model science prose; cited corpus excerpts ★
│           ├── chat-{guard,persistence,usage,usage-store}.ts # bounds/history/accounting
│           ├── proxy-params.ts, structured-log.ts # proxy validation + content-free events
│           ├── plan-context.ts, action-{result,validation}.ts # immutable requests + actions
│           ├── format.ts, utils.ts + __tests__/ (incl. observer/tool/policy/stream tests)
│           └── supabase/{client,server,types}.ts
│   └── evals/                         # eval harness (offline-runnable)  ★
│       ├── metrics.ts (+test)         # hit@k, precision@k, recall@k, MRR, nDCG, uniqueInOrder
│       ├── fusion.ts (+test)          # reciprocalRankFusion (RRF)
│       ├── faithfulness.ts (+test)    # claim split + score; MockJudge; judge-openai.ts (OpenAIJudge)
│       ├── faithfulness-cases.ts + faithfulness.live.test.ts  # 6 live-gated canned cases
│       ├── agent-trajectory.live.test.ts # 5 opt-in live tool/citation/grounding cases ★
│       ├── text.ts                    # tokens/stem/tf/cosineSparse
│       ├── retriever.ts               # Lexical / Dense / Hybrid / Live retrievers
│       │                              #   variants: raw hybrid, explicit LLM, explicit BGE
│       │                              #   searchKnowledge accepts rerank + backend overrides
│       ├── rerank.ts (+test)          # LexicalReranker, RerankedRetriever
│       ├── dataset.ts                 # 8 exact + 6 semantic + 4 planet-labelled cases
│       ├── run.ts                     # comparison runner (writes report.json; gitignored)
│       ├── braintrust.ts              # optional forwarder (dynamic import, no hard dep)
│       └── README.md
│
├── docs/
│   ├── live-acceptance.md             # canonical intended-host release journey
│   ├── evidence/                      # dated measured records, including the source audit
│   └── plans/                         # signed-off work plans and post-audit roadmap
│
└── supabase/
    ├── README.md
    ├── migrations/
    │   ├── 0001_init.sql              # sessions + logged_observations (+ RLS, user-scoped)
    │   ├── 0002_knowledge.sql         # vector ext + documents + match_documents RPC (public-read RLS)
    │   ├── 0003_hybrid_search.sql     # fts tsvector + GIN + hybrid_search RRF RPC
    │   ├── 0004_gear_profiles.sql     # minimal user-owned f-ratio/filter profiles + RLS
    │   ├── 0005_privileges_and_rls_repair.sql  # explicit API grants + observation ownership
    │   ├── 0006_chat_usage_limits.sql  # authenticated quotas + content-free usage accounting
    │   └── 0007_observation_progress.sql # integration minutes + owner progress RPC
    └── tests/
        ├── bootstrap.sql              # disposable PostgreSQL Supabase-role shim
        ├── track_c_acceptance.sql     # grants + CRUD + cross-user RLS + hybrid/progress RPCs
        └── chat_usage_acceptance.sql  # quota, accounting, and cross-user denial
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
   A/B'd in `evals/run.ts` before adoption. The local BGE backend regressed against the
   LLM reranker in its post-dedup live A/B, so it remains opt-in (§5 item 6).
4. **Light-pollution = multiplicative damping by surface brightness.**
   `score × (1 − LP_MAX_IMPACT·((bortle−1)/8)·light_sensitivity)`. Clusters (low
   sensitivity) barely move; faint galaxies (high sensitivity) are crushed in cities —
   so **rankings flip between a dark site and a city**. This is the defining behaviour;
   preserve it. Bortle is a **location property** (computed once per plan), not per-target.
   Planets have `light_sensitivity=0.0`: their high surface brightness makes the modeled
   light-pollution factor neutral even at Bortle 9.
5. **Validate before astropy.** Shared `Lat`/`Lon` `Annotated` query params (`params.py`)
   enforce bounds (±90 / ±180) on BOTH planning and visibility routers → 422 before any
   astropy call. Projection also validates f-ratio `(0,32]`, nights `[1,60]`, optional SQM
   `[15,22.1]`, and filter/tier Literals before compute. `when` parse errors → 422.
   Target resolution has explicit domain semantics: unresolved names → 404, targets that
   require a different product flow → structured 422, and actual CDS/Simbad/network
   failures → 502. Next proxies validate presence before numeric conversion, so omitted
   coordinates cannot silently become zero. A day with no astronomical darkness is a
   structured 422 product state, while continuous polar darkness is an explicitly labelled,
   bounded 24-hour planning window; neither is treated as an upstream 502.
6. **Embedding model pinned on both sides.** Ingestion (Python) and retrieval (web) both
   use `text-embedding-3-small` (1536-d). A mismatch is a silent RAG bug — never diverge.
   Relay corollary (v0.6.1): if `OPENAI_BASE_URL` points at a relay, the relay must serve
   this exact model on **both** sides; point both sides at the same endpoint.
7. **RLS model.** `sessions` + `logged_observations` + `gear_profiles` +
   `chat_usage_events` are
   **user-scoped** (`auth.uid()`). Observation insert/update also proves that the
   referenced session belongs to the same authenticated user. SQL privileges are
   explicit in `0005`; RLS policies do not replace grants. The security-invoker
   `observation_progress()` RPC repeats the caller-owned predicate and is executable only
   by authenticated/service roles. `documents` (knowledge base) is **shared**:
   public-read, writes via service role only.
8. **Versions: latest stable, transparently.** Resolved to Next 16 / AI SDK v6 (the plan
   said Next 15). Flagged in `apps/web/README.md` with a pin-to-15 command. ESLint pinned
   to **9** because eslint-config-next 16's flat config breaks on ESLint 10.
9. **Copilot answers are auditable and location-bound.** `/plan` persists only explicit
   validated observer coordinates, date, and source (`manual`, `geolocation`, or
   `saved_session`). Chat sends that application state as request context; server-created
   `planNight` / `getTargetDetail` tools have no model-controlled latitude/longitude
   fields and echo the exact context in every card. Missing context returns structured
   `location_required`. Science/explanation trajectories are forced through
   `searchKnowledge`; model-authored science text is removed from the UI stream and
   replaced with short cited corpus excerpts, or the exact insufficient-evidence answer.
10. **No emojis/secrets in code; keep CI green.** `ruff`, `ruff format --check`, `mypy
    strict`, `pytest`, plus web `lint/typecheck/test/build` must all stay green.
    (Green as of 2026-07-10; the transient `rag/embeddings.py` lint regression is fixed.)
11. **Vendor endpoints are configuration, not code.** Relay/base-URL switching lives in
    env (`OPENAI_BASE_URL`) with the official endpoint as the in-code default. Never
    hardcode a relay URL; never commit `.env` / `.env.local`.
12. **Public compute is authenticated and bounded.** Chat requires a verified Supabase
    user, reserves an atomic per-user database quota, caps request/message size and model
    work, and records only numeric usage, bounded failure categories, and content-free
    latency events. Projection has process-local rate and concurrency guards. Production
    also enforces a Vercel WAF fixed-window limit of six `/api/project` requests per IP per
    60 seconds, returning 429 before excess work reaches a service worker.
13. **Successful plans own immutable provenance.** A displayed ranking is paired with the
    exact coordinates, requested/effective date, location source, profile identity and
    gear inputs, and measured SQM that produced it. Projection, observer persistence, and
    save consume that snapshot rather than current form fields. Any coordinate,
    geolocation, date, gear, or SQM edit invalidates the active ranking and its projection/
    saved-session binding; older in-flight responses cannot restore it. Server actions
    validate runtime input and return explicit auth/validation/database/no-row outcomes.

---

## 3. Exact state of core logic

### `scoring.py` (pure)
- Constants: `MIN_USEFUL_ALT=20.0`, `GOOD_ALT=40.0`, `BRIGHT_MOON=0.7`,
  `CLOSE_MOON_DEG=30.0`, **`LP_MAX_IMPACT=0.8`**.
- `_SENSITIVITY_BY_KIND` (0=robust … 1=fragile): planet `0.0`, open cluster `0.15`, globular `0.25`,
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

### `budget.py` (pure integration-time range estimator)
- The C-gate passed 2026-07-11: community feedback rejected false precision but engaged
  with conditional hour/night baselines and the underlying sky, optics, filter, and noise
  variables. Evidence links and the approved implementation contract are recorded in
  `docs/plans/2026-07-11-c1-budget-estimator.md`.
- Outputs are community-anchored **ranges**, not radiometric truth. `HoursEstimate`
  exposes `low/high`, the resolved `sky_sqm` and source, LP/optics/tier multipliers, and
  `filter_mismatch`. Planets return `None` because lucky imaging is outside this model.
- `REF_SQM=21.5`, `REF_F_RATIO=5.0`, `SNR_TIME_BASE=2.512`, SQM clamps to `[10,25]`,
  f-ratio clamps to `[1,32]`, and showcase ranges use `2.5×`. Clean f/5 broadband base
  ranges at the reference sky are open cluster 1–2 h, globular 1.5–3 h, planetary or
  emission nebula 2–4 h, generic nebula 2–4 h, galaxy 4–8 h, dark nebula 6–12 h, and
  unknown 2–4 h.
- `lp_time_multiplier = 2.512 ** (max(0,21.5−sky_sqm) × coupling)`. Broadband coupling
  is 1.0. Mono-NB is derived from the reconciled calibration anchor so Bortle 9 mono-NB
  equals Bortle 4 broadband: `(21.5−21.0)/(21.5−15.5)=1/12`. Dual-NB remains `0.30`, a
  **labelled unanchored interpolation** pending a community datapoint. Narrowband on a
  non-emission kind falls back to broadband coupling and sets `filter_mismatch=True`.
- `optics_time_multiplier=(clamp(f_ratio,1,32)/5)²`. `usable_hours` applies the scoring
  moon-proximity shape with weights broadband 1.0, dual-NB 0.35, mono-NB 0.15 and clamps
  out-of-range visibility/illumination/separation inputs.
- `nights_to_reach(usable,goal)` accumulates chronological non-negative usable hours and
  returns the 1-based finishing night, or `None` when the projection horizon is short.

#### `budget.py` validation (community-reported datapoints)

| source | target/kind | sky | gear/filter | community-reported | model output | verdict |
|---|---|---|---|---|---|---|
| CN 806760 | (ratio check) | SQM 20.6 vs 18.53 | broadband | 6.7x time ratio | `2.512**2.07 = 6.73x` | PASS (executable — test 1) |
| CN 803525-adjacent | (ratio check) | same sky | f/8 vs f/4 | 4x time ratio | `optics: 4.0x` | PASS (executable — test 6) |
| CN 806760 #17 | emission neb | B9 half-moon vs B4 moonless | 3nm Ha | “no discernible difference” | both 3.2–6.3 h at f/5; 1.584929× multiplier | CALIBRATION identity; qualitatively consistent, not independent validation |
| CN 868697 | faint dust (Cocoon) | B8/9 | f/4 broadband | 17.5h “just starting to show dust” | B8 305.1–610.2 h; B9 964.8–1929.7 h | INCONCLUSIVE: different quality threshold + class/SQM ambiguity; large mismatch preserved |
| CN 868697 | typical target | B4 | f/4.5 broadband | ~6h acceptable minimum | supported-kind envelope 1.3–15.4 h; default 2.6–5.1 h | INCONCLUSIVE: target kind and subjective threshold unspecified |

The first two identities are measured executable checks. The three community rows were
reconciled on 2026-07-15 without changing constants; the last two remain explicitly
inconclusive rather than manufactured PASS/FAIL verdicts. Class-midpoint estimates carry
up to ±half-band uncertainty: Bortle 4
alone spans 1.0 mag, about 2.5× time. The SQM sidecar/override avoids that discretization,
though named-city readings remain resolution-limited at 0.25°. For row 3, colloquial
“Bortle 9” likely means SQM around 17.5–18 rather than the open-ended class representative
15.5. At SQM 18.0, derived mono-NB gives `1.31×` versus broadband-B4 `1.58×`—mono is
slightly ahead, still consistent with “no discernible difference.”

The dated evidence and dual-NB source review are in
`docs/evidence/2026-07-15-p2-evidence.md`. No reviewed source supplied a controlled,
equal-quality time ratio across measured sky brightness for a dual-narrowband filter, so
`dual_nb=0.30` remains a labelled unanchored interpolation. These rows do not support
marketing the estimator as numerically validated.

### `bortle/` (offline, O(1))
- `calibration.py` is the **single Bortle↔SQM authority**. It owns
  `BORTLE_MAG_LOWER_EDGES=(22.00,21.75,21.50,20.50,19.50,18.50,17.50,16.00)`, pure
  `bortle_for_sqm`, and programmatically derived representative values
  `BORTLE_TO_SQM={1:22.0,2:21.88,3:21.63,4:21.0,5:20.0,6:19.0,7:18.0,8:16.75,9:15.5}`.
  Class 9 is open-ended; 15.5 is the labelled approximation 0.5 mag below its edge.
- `model.py`: `FALLOFF_EXPONENT=2.5`, `DISTANCE_OFFSET_KM=8.0`,
  `BORTLE_LOG_THRESHOLDS=(0.6,1.1,1.6,2.1,2.7,3.3,4.0,4.7)`.
  `light_index_at(lat,lon,cities)=Σ pop/(d_km+8)^2.5`; `index_to_bortle(i)=
  clamp(1+Σ[log10(i+1)≥t], 1, 9)`; `bortle_for_point(lat,lon)`.
- `grid.py`: `GRID_RESOLUTION_DEG=0.25`; `build_grid()`→`uint8 (720,1440)` (vectorized);
  `load_grid()` = `np.load(GRID_PATH, mmap_mode="r")` (`lru_cache`); **`bortle_at(lat,lon)`**
  uses shared clamped row/column math. `load_sqm_grid()` memory-maps and caches the
  optional float16 `sqm_grid.npy`; **`sqm_at(lat,lon)`** uses the identical index math and
  returns `None` if the sidecar is absent. The World Atlas build script imports the
  calibration edges and emits clipped `[10,25]` float16 SQM beside Bortle. The committed
  sidecar is `(720,1440) float16`, observed range `15.0546875..22.0`, SHA-256
  `755e61e4dc7c97721a962b9da8977f5f55cc8fef8730701ccde64477cd7f0f2d`.
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

### `datasources/dso_catalog.py`
- `CatalogObject(name,ra_hours,dec_deg,kind,common_name,body=None)`. Fixed targets use
  J2000 RA/Dec; a non-null `body` is an Astropy solar-system body name and makes those
  coordinate fields unused placeholders.
- `CATALOG` now has 21 rows: the original 15 DSOs, M4, Jupiter, Saturn, Mars, Venus, and
  the Moon. Planets use `kind="planet"`; the Moon uses `kind="moon"`; all moving targets
  have lowercase Astropy body identifiers. `get(name)` remains case-insensitive and
  resolves these names locally before any Simbad fallback. The Sun is deliberately absent.

### `datasources/planning.py`
- `parse_when(str|None)->Time|None`: None/empty→None; date-only → append `T12:00:00`
  (UTC, biases to upcoming evening); full datetime passthrough; bad → `ValueError`.
- `dark_window(lat,lon,when=None)` normally returns astronomical dusk→dawn + Moon
  illumination. If Astroplan returns a masked twilight, a 15-minute solar-altitude sample
  classifies the next 24 hours: Sun always above −18° raises
  `NoAstronomicalDarknessError`; Sun always at/below −18° returns a bounded 24-hour
  `DarkWindow(status="continuous_astronomical_darkness")`. Expected polar Astroplan
  warnings are suppressed, but an unclassified masked twilight remains an error.
- `conditions_for(obj,lat,lon,window,bortle)` → samples altitude over the night
  (20-min grid), peak alt + hours-above-floor + moon sep at peak. Fixed targets use
  J2000 coordinates; moving bodies use `get_body` across the time grid and again at
  peak for moon separation. Before separation, the target is transformed into the
  Moon's GCRS frame; this removes transform-direction ambiguity and the former
  `NonRotationTransformationWarning` flood. Astropy's built-in ephemeris is
  planning-grade, not precision astrometry, and needs no network. Sets `bortle` and
  kind sensitivity. The Moon is scored as a moving observing target without penalizing
  itself for zero lunar separation; it is excluded from deep-sky integration budgets.
- `rank_targets(lat,lon,when=None, f_ratio=None, filter_kind="broadband", tier="clean",
  sqm=None)` ranks all 21 local targets → `{dusk_utc, dawn_utc, dark_hours,
  moon_illumination, bortle, targets:[{name, common_name, kind, score, rating,
  peak_altitude_deg, hours_visible, moon_separation_deg, light_sensitivity}]}` sorted by score.
  With no f-ratio its payload remains unchanged. With gear, sky is resolved once using
  user SQM → sidecar → class precedence, top-level `sky_sqm/sky_source` are added, and
  every row gains low/high hours, filter mismatch, and budget applicability using pure
  C1 math without another astropy calculation. Normal-night payloads remain unchanged;
  continuous polar darkness adds `dark_window_status`.
- `target_detail(name,lat,lon,when=None)` → same row + dark_hours/moon/bortle. Shared
  `resolve_target` returns local fixed/moving targets first, then uses Simbad for supported
  names. `TargetNotFound`, `UnsupportedTarget`, and `UpstreamResolutionError` distinguish
  missing objects, product-flow exclusions, and resolver outages. Sun/Sol returns the
  structured `solar_daylight_planner_required` flow instead of entering the night planner.
- `project_target(...)` resolves Bortle once, prefers user SQM over the sidecar
  over the Bortle-class crosswalk, records that source, and projects one conditions sample
  per consecutive dusk (duplicate dusk windows are skipped). Each night exposes UTC
  dusk/dawn and, only for continuous polar darkness, the explicit bounded-window status.
  dusk/dawn, dark/visible/usable hours, and lunar conditions; the response also exposes
  budget range, cumulative low/high finishing nights, horizon, and max-usable date.
  Planets keep the nightly visibility list while budget fields remain null.

### Routers (`params.py` + `routers/*`)
- `Lat=Annotated[float,Query(ge=-90,le=90)]`, `Lon=Annotated[float,Query(ge=-180,le=180)]`,
  `When=Annotated[str|None,Query(...)]`, plus bounded `FRatio`, `Nights`, and optional
  measured `Sqm` projection parameters.
- `GET /plan/night?lat&lon&when`, `GET /plan/target?name&lat&lon&when`,
  `GET /plan/project?name&lat&lon&f_ratio&filter&tier&when&nights&sqm`,
  `GET /visibility?target&lat&lon` (now validated), `GET /health`. Projection defaults to
  broadband, clean, 30 nights, and grid/class SQM; Literal and bound failures return 422.
  `/plan/night` also accepts optional `f_ratio/filter/tier/sqm`; omitting f-ratio preserves
  the legacy response exactly, while providing it activates per-row budget fields.
  Target errors map to 404/422/502 with stable structured details. `/plan/project` runs
  Astropy work off the async loop behind a two-request process semaphore plus per-peer and
  process-wide sliding-window limits; saturation returns 503 and quota
  exhaustion returns 429 with `Retry-After`.

### Web `lib`
- `api.ts` types: `NightPlan` includes Bortle plus optional sky provenance and row budget
  fields. `ProjectPlan` mirrors C2's 30-night response. `fetchNightPlan` conditionally
  forwards gear/SQM, while `fetchProject` powers the new `/api/project` proxy;
  `fetchVisibility` and `fetchTargetDetail` remain available to existing consumers.
- `knowledge.ts` `searchKnowledge(query,target?,opts?)`: embed (1536) →
  `supabase.rpc("hybrid_search", {query_text, query_embedding, match_count:15,
  filter_target})`. `rerank:false` still returns the raw top-5 RPC candidates. The
  rerank path first applies pure `deduplicatePassages`: group by `(target,bibcode)`,
  normalize Unicode/case/punctuation/whitespace, and drop exact, token-boundary-prefix,
  or conservative trigram near-matches behind the higher-similarity sibling. Survivors
  retain their original objects/order; response shape is unchanged. An internal
  `rerankBackend` override lets the harness force a fair LLM/BGE comparison.
- `rerank.ts`: unset `RERANK_BACKEND` preserves **Cohere** (if `COHERE_API_KEY`) →
  **LLM** (if `OPENAI_API_KEY`) → pass-through. `RERANK_BACKEND=bge` explicitly selects
  `BgeReranker`, which dynamically imports the optional `@huggingface/transformers`
  package and lazy-loads/caches the quantized `Xenova/bge-reranker-base` ONNX conversion
  of BAAI's model. First use downloads about 300 MB unless cached; inference is local.
- `observer-context.ts`: strict Zod context with latitude/longitude bounds, three source
  labels, optional observing date/session id, and local-storage read/write helpers.
  `PlanClient` restores it, marks manual/geolocation changes, writes only after a
  successful plan, and upgrades the source to `saved_session` after a successful save.
- `plan-context.ts`: strict, frozen successful-request snapshots bind the displayed
  `NightPlan` to coordinates, requested/effective date, location source, selected profile
  identity/name/f-ratio/filter/tier, and optional measured SQM. Shared query builders make
  ranking and projection parameters identical; observer persistence and `saveSession`
  derive from the same snapshot. Control changes clear the result/projection/session
  binding, and a generation guard discards stale async completions.
- `action-validation.ts` + `action-result.ts`: session, observation, gear-create, and
  gear-delete actions share finite/bounded Zod validation and discriminated success,
  auth, validation, database, and no-affected-row outcomes. `saveSession` supplies the
  snapshot's exact `planned_for`; deletes select the affected id instead of treating an
  RLS/no-row mutation as success. Database/RLS ownership remains unchanged.
- `ai.ts`: `createChatTools(observer)` creates `planNight`, `getTargetDetail`, and
  `searchKnowledge`. Planning schemas deliberately exclude coordinates; their execution
  closes over the parsed request context and returns `{status,observer,...}` or
  `location_required`. Typed `ChatMessage` is inferred from that tool factory. Chat uses
  per-send/retry request context, and every planning/detail card prints coordinates,
  source, and date/upcoming-night provenance.
- `chat-policy.ts`: classifies the latest request and deterministically forces required
  tool steps before final prose. Science requires `searchKnowledge`; planning requires
  `planNight`; recognized named planning/comparison targets require one exact detail call
  each. The current explicit name map covers only M31, M42, M101, Alpha Centauri, and
  Jupiter plus designation regexes; the 2026-07-15 source audit records the missing
  Saturn/Mars/Venus/Moon/common-name coverage as open. Bare recognized catalog replies
  (for example `M1`) are planning, so they cannot become an unsupported memory answer.
  `grounded-response.ts` removes all model-authored science
  text chunks while preserving tool cards, then emits at most three 24-word cited corpus
  excerpts. Empty/incompletely attributed results emit the exact insufficient-evidence
  message. Chat route uses
  `await convertToModelMessages(...)` (v6 is async), `stopWhen: stepCountIs(6)`,
  `toUIMessageStreamResponse()`, and the stateless `openai.chat("gpt-4o-mini")` provider
  for multi-step tool loops. It requires `supabase.auth.getUser()`, rejects bodies over
  64 KiB and oversized message histories, atomically reserves the `0006` per-user quota,
  declares a 55-second route timeout within `maxDuration=60`, and accounts for chat,
  embedding, LLM rerank, or Cohere usage. Tool executors do not yet propagate the AI SDK
  abort signal through nested planning/retrieval/rerank work, so the end-to-end bound is a
  post-audit open item rather than a proven invariant. Structured request/step/tool logs contain timing, status,
  and bounded failure reasons only—never message text, tool payloads, keys, or secrets.
  Client uses `useChat<ChatMessage>()` + `sendMessage({text})`, ignores incomplete/
  unrecognized tool parts, and exposes retry plus a fresh-send path after stream errors.
- `proxy-params.ts`: shared presence-first, finite-number, coordinate, f-ratio, night, and
  SQM checks for all Next API proxies; invalid client parameters return structured 400s.
- `chat-persistence.ts`: versioned local text-only history validation. It restores the most
  recent bounded user/assistant text parts after reload/navigation, rejects unknown schema
  versions, never stores tool parts, and backs the visible Clear conversation action.
- `format.ts`: plan dusk/dawn is labelled with the explicit device IANA zone and current
  abbreviation (including a DST transition label when applicable); the exact UTC value
  remains in the tooltip. Observing-site IANA derivation remains an open preferred follow-up.
- Relay note (v0.6.1, corrected 2026-07-11): web OpenAI providers read
  `OPENAI_API_KEY` **and** `OPENAI_BASE_URL` from env — set both in `.env.local` to route
  through a relay. The original live check established that the configured relay supports
  **single-step** Responses API calls. A later multi-step chat test showed that it does not
  persist the prior `fc_...` / `msg_...` response items referenced by follow-up Responses
  calls. The chat route therefore uses stateless Chat Completions via `openai.chat(...)`;
  the one-shot reranker and faithfulness judge remain on the default Responses provider.
  See §5 items 2 and 9.
- Track W2 web shell/UX (2026-07-11): `layout.tsx` is still a server component and now
  renders a sticky one-row Plan/Sessions/Chat shell with Supabase-aware sign-in or
  email/sign-out affordances. The root applies the existing `.dark` token set by default.
  `/plan` adds guarded browser geolocation (coordinates rounded to two decimals), explicit
  device-zone dusk/dawn formatting with the UTC values retained in `title`, a labelled/
  color-coded Bortle badge, kind filters, score bars, top-row emphasis, loading skeletons, and a
  mobile-hidden hours column. Pure `formatLocalDateTime` and `bortleLabel` helpers are
  unit-tested. `/chat` adds three starter prompts and smooth auto-scroll while preserving
  W1's defensive tool rendering and error recovery. No dependencies or API payloads changed.
- Track C3 gear UI (2026-07-11): signed-in `/plan` server-loads the user's gear profiles
  and renders `GearCard`; anonymous users see no new surface. Authenticated server actions
  create and delete name/f-ratio/filter rows. `PlanClient` owns the current profile list
  and selected id, persisting the latter under a client-only `localStorage` key so C4 can
  consume the selected profile without changing C3 planning requests. As of the P0 repair,
  initial profile/session/observation read failures render as errors rather than false
  empty states.
- Track C4 budget UI (2026-07-11): selecting gear activates a mobile-collapsible
  community-range column, grid/user SQM badge, persisted validated SQM override, and the
  required World Atlas resolution/false-precision caption. Details are loaded per target
  through `/api/project`, never in the rank loop, and show hours, completion sessions,
  best night, planet lucky-imaging guidance, and a dependency-free 30-night usable-hours
  strip. Gearless requests and the anonymous five-column plan remain unchanged.
- Track C4(d) progress UI (2026-07-15): a saved-session log accepts optional non-negative
  whole integration minutes. Signed-in gear-aware plans server-load owner totals through
  `observation_progress()`, aggregate normalized target names, and show recorded minutes/
  hours plus percent of the modeled low/high range. Successful logs update the visible
  total immediately; session detail retains the per-observation minutes. Null legacy rows
  remain valid and excluded from totals. Anonymous and gearless plan tables retain their
  prior shapes.

### Supabase migrations
- `0001`: `sessions(id,user_id,title,lat,lon,planned_for,created_at)`,
  `logged_observations(...,session_id,user_id,target,score,rating,notes,observed_at)`;
  RLS = own rows only.
- `0002`: `create extension vector`; `documents(id,target,title,source,bibcode,url,
  content,embedding vector(1536),created_at)`; HNSW cosine index; RLS public-read;
  `match_documents(query_embedding,match_count,filter_target)` RPC.
- `0003`: generated `fts tsvector` + GIN; `hybrid_search(query_text,query_embedding,
  match_count,full_text_weight,semantic_weight,rrf_k,filter_target)` RRF over full-text +
  vector, returns `...,similarity`.
- `0004`: `gear_profiles(id,user_id,name,f_ratio,filter_kind,created_at)` with f-ratio
  `(0,32]`, three budget filter kinds, user/time index, and own-row select/insert/update/
  delete RLS. It deliberately has no SQM column: sky brightness belongs to the site.
- `0005`: explicit `anon`/`authenticated`/`service_role` table, sequence, schema, and RPC
  privileges; removes anonymous access to user-owned tables and public RPC execution;
  strengthens observation insert/update so `session_id` must name the same user's session.
- `0006`: `chat_usage_events` plus security-definer `reserve_chat_request` and
  `complete_chat_request` RPCs. Per-user advisory locks make minute/day reservations atomic;
  RLS exposes only the caller's rows. Stored fields are numeric token/cost/timing totals,
  constrained backend/status values, a short failure reason, and a nonselectable random
  completion capability—no generic JSON or content. The capability stays inside the server
  route so an authenticated browser cannot overwrite a real request's accounting row.
- `0007`: nullable, non-negative `logged_observations.integration_minutes` plus the stable
  security-invoker `observation_progress()` RPC. It sums only the current `auth.uid()` and
  non-null minutes by target; execute is revoked from public/anon and granted to
  authenticated/service roles.
  Run order: 0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007. CI replays the full chain
  in PostgreSQL with pgvector, reapplies `0005` to prove idempotency, tests owner CRUD and
  cross-user/session denial, then tests chat quota/usage and observation-progress isolation.

### Eval harness numbers (offline, deterministic stand-ins)
```
retriever                    recall@3  MRR  nDCG@5
lexical(sparse)              0.64      0.64  0.64   (exact 1.00 / semantic 0.17)
dense(offline)               0.80      0.82  0.81   (exact 0.75 / semantic 0.88)
hybrid (RRF)                 0.88      0.86  0.88   ← best first stage; prod path
hybrid -> rerank(lexical)    0.80      0.84  0.84   ← regresses (bag-of-words ≈ dense)
```

### Historical live corpus numbers (pgvector hybrid, 203 chunks over 15 targets, 2026-07-09)
```
retriever                         recall@3  MRR  nDCG@5  reranker
pgvector-hybrid(live)             0.36      0.43  0.45    —
pgvector-hybrid+rerank(live)      0.57      0.57  0.61    llm (gpt-4o-mini)
```
Rerank lifts. Cohere not tested (no key).

### Task B2 post-dedup LLM vs BGE A/B (203 chunks, 15 targets, 2026-07-11)
```
retriever                              recall@3  MRR  nDCG@5  reranker
pgvector-hybrid(live)                  0.36      0.43  0.45    —
pgvector-hybrid+llm-rerank(live)       0.61      0.58  0.61    llm (gpt-4o-mini)
pgvector-hybrid+bge-rerank(live)       0.55      0.38  0.42    bge-reranker-base (q8)
```
The harness now compares raw hybrid, explicitly forced LLM rerank, and explicitly forced
BGE rerank in one run. A per-query cache gives both rerank arms the same first-stage
candidate snapshot and deterministic dedup result, and each variant is evaluated once.
**BGE regresses versus the LLM reranker on all required metrics:** recall@3 is lower by
about 5.5 percentage points, MRR by about 0.20, and nDCG@5 by about 0.19. It improves raw
hybrid recall@3 but falls below raw hybrid on MRR and nDCG@5. Per rule 3, BGE remains an
explicit opt-in and the production Cohere → LLM → pass-through default is unchanged.

### P2 live grown-corpus A/B (684 rows, 19 targets, 2026-07-15)
```
retriever/subgroup                 hit@1  recall@3  MRR   nDCG@5
raw hybrid — all                    0.39      0.44  0.42     0.42
raw hybrid — planets                0.50      0.75  0.63     0.66
LLM rerank — all                    0.44      0.63  0.55     0.59
LLM rerank — planets                1.00      1.00  1.00     1.00
```
The 18-case dataset adds separately labelled Jupiter, Saturn, Mars, and Venus cases. The
runner measures corpus rows/targets before live scoring and now keeps BGE behind
`RUN_BGE_EVALS=1`; both production arms share one first-stage snapshot per query. LLM
reranking remains the supported baseline: all-case recall@3 improved by 0.19 and planet
recall@3 by 0.25, although exact-query hit@1 fell from 0.63 to 0.38. The assumed
253-row corpus was stale: a separate read-only check measured 459 exact-unique
target/bibcode/content rows and 225 exact duplicate rows. No production rows were changed;
the duplicate ingestion/idempotency issue prevents treating this as a clean longitudinal
comparison. Full output and evidence conditions are recorded in
`docs/evidence/2026-07-15-p2-evidence.md`.

### Faithfulness eval
- `splitClaims(answer)` splits sentence-level claims; `faithfulnessScore` returns the
  supported-claim fraction (empty claim list = 1). `MockJudge` is the deterministic
  offline stand-in and remains covered by seven unit tests.
- `OpenAIJudge` uses `gpt-4o-mini` via the default `@ai-sdk/openai` provider, so it honors
  `OPENAI_BASE_URL`. It marks a claim supported only when the supplied contexts directly
  substantiate it and falls back to unsupported if the model drops a claim.
- `FAITHFULNESS_CASES` has six canned copilot-style answers: three fully grounded and
  three with one planted unsupported number, age, or superlative. The live test is gated
  by `describe.skipIf(!process.env.OPENAI_API_KEY)`; grounded scores must be ≥0.8 and
  planted cases <0.8. Verified live 2026-07-11: **6/6 passed**. With no key, the same six
  cases are skipped and the existing 40 offline tests still pass.
- `agent-trajectory.live.test.ts` is separately gated by
  `RUN_LIVE_AGENT_EVALS=1` plus `OPENAI_API_KEY`. Deterministic planning/literature
  fixtures isolate agent behavior while the real configured model chooses tool calls.
  Cases cover M31 versus M42, M101, Alpha Centauri, empty corpus, and misspelled
  `Jupter`; they assert exact required tool sets, displayed title+bibcode citations,
  no retrieval for planning-only prompts, exact insufficient-evidence behavior, and
  `OpenAIJudge` faithfulness ≥0.8 for every science response.

---

## 4. Verification, CI & environment quirks

- **CI** (`.github/workflows/ci.yml`):
  - `api`: `uv sync` → `ruff check .` → `ruff format --check .` → `mypy src` →
    `pytest -m "not integration"`.
  - `web`: `pnpm install --frozen-lockfile` → `pnpm --filter @astroscout/web
    lint|typecheck|test|build`. Job sets `npm_config_verify_deps_before_run=false`.
- **Current status:** API verified 2026-07-15: **99 unit tests pass**, 19 deselected as
  integration; `ruff check`, `ruff format --check`, and `mypy src` are clean. Current
  web source passes typecheck, lint, and the 14-route production build. No-key Vitest:
  **83 passed + 11 live cases skipped** (six canned faithfulness + five agent trajectory).
  Live B3 remains **6/6 passed**; the new live trajectory gate is **5/5 passed** after
  the corpus-only response policy. The P2 live 18-case A/B is recorded above.
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
  - Migration `0005_privileges_and_rls_repair.sql` is the canonical privilege repair for
    existing and fresh projects. If PostgREST reports code 42501 for gear, sessions,
    observations, documents, or search RPCs, verify that `0005` is applied; do not add an
    undocumented dashboard-only grant.
- **Local-dev quirks (real machines, not the sandbox)**:
  - Newer pnpm blocks dependency build scripts by default
    (`ERR_PNPM_IGNORED_BUILDS` for `sharp`, `esbuild`). Run `pnpm approve-builds` in
    `apps/web` once after install, or Next.js may crash on missing native binaries.
    (In the CI/sandbox environments the warning is cosmetic — prebuilt binaries ship.)
  - If a local HTTPS-intercepting proxy (Clash/VPN) breaks Node TLS
    (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`), export the verified proxy/root CA bundle with
    `NODE_EXTRA_CA_CERTS=<proxy-CA.pem>` in the machine shell or launch environment.
    Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`, and never place machine CA settings in a
    committed env file. On 2026-07-15 this machine verified canned chat, embedding,
    reranking, and Supabase traffic under normal certificate validation with a two-root
    machine-only bundle.
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

**Repository gates are green through item 21. A post-P2 source audit is filed in item 22
and opens a separate production-closeout workstream.** Track C3 live closeout was reopened by
the 2026-07-15 maintainer transcript and restored by the measured P0 database + signed-in
application acceptance in item 17. Item 19's repository implementation, intended-platform
proof, and multi-worker distributed projection guard are verified. Migration `0006` and its
hosted acceptance are verified. A real user magic-link session also passed signed-in
production chat, accounting, structured-log, and reload-persistence acceptance; it was not
replaced with an agent-created auth fixture. Item 21 implements C4(d), applies hosted
migration `0007`, closes the polar failure mode, and records the current retrieval/
calibration evidence. Per-user personalization, city-grid regeneration, dark-nebula
taxonomy, and corpus-ingestion deduplication remain open or deliberately blocked below:

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
   changes — this proved the relay supports **single-step** Responses API calls.
   **Correction (2026-07-11):** multi-step chat tool loops were not covered by that test.
   Follow-up Responses calls reference prior `fc_...` / `msg_...` items by ID, and the
   relay does not persist them, so those turns fail after the first step. Track W1 (§5
   item 9) switches only the chat route to stateless `openai.chat(...)`; the successful
   one-shot reranker and judge paths remain unchanged.
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
6. ✅ **Retrieval polish — dedup + local BGE backend + live A/B (Done 2026-07-11).**
   `knowledge.ts` now deduplicates normalized exact/prefix/conservative trigram-near-match
   chunks within `(target,bibcode)` after the RPC and immediately before reranking; the
   higher-similarity chunk wins. Six pure offline tests cover normalization, group
   boundaries, stable winners, near-matches, and ordinary ingestion overlap. `rerank.ts`
   adds explicit `RERANK_BACKEND=bge`: the optional Transformers.js package is hidden
   behind a variable `import()` with `webpackIgnore`, and the quantized ONNX model loads
   lazily only on first use. It is not a checked-in dependency and normal typecheck,
   Vitest, and Next build paths do not load it. Two fake-runtime unit tests plus a real
   synthetic local smoke test pass. The live harness shares one cached candidate snapshot
   per query across raw/LLM/BGE variants and evaluates each once. Live result: raw hybrid
   recall@3=0.36 / MRR=0.43 / nDCG@5=0.45; LLM=0.61 / 0.58 / 0.61; BGE=0.55 / 0.38 /
   0.42. **BGE regresses versus LLM on all three required metrics**, so it remains opt-in;
   production still defaults to Cohere → LLM → pass-through. Full web gate is green:
   typecheck, lint, 40 tests, unchanged offline eval, and 12-route build. See §3 and
   `evals/README.md`.
7. ✅ **Copilot faithfulness live gate (Done 2026-07-11).** Added six canned cases:
   three fully grounded answers and three with a planted unsupported number, age, or
   superlative. `faithfulness.live.test.ts` reuses `OpenAIJudge`, `splitClaims`, and
   `faithfulnessScore`; `describe.skipIf(!OPENAI_API_KEY)` keeps the no-key path
   network-free. Grounded cases require ≥0.8 and planted cases <0.8. Measured no-key
   result: 40 existing tests pass, 6 live cases skip (the task prompt's old 32-test count
   predated B2). Measured live result through the configured relay: **6/6 pass**. The
   fixture is canned and sends no retrieved corpus or user data. Typecheck, lint, and the
   12-route production build remain green; `MockJudge` stays the offline path.
8. ✅ **Planets / non-DSO targets (Done 2026-07-11).** Added Jupiter, Saturn, Mars,
   and Venus to the local catalog with `body` identifiers; fixed objects retain J2000
   RA/Dec, while planets use Astropy `get_body` over the night and at peak moon
   separation. The built-in ephemeris is explicitly planning-grade. `planet` sensitivity
   is exactly `0.0`, so the light-pollution factor stays `1.0` at Bortle 9. A pure CI test
   covers that invariant; an integration-gated Jupiter-at-opposition test covers moving
   coordinates. No web change was needed: existing rows already render kind `planet` with
   the robust LP badge. Full API gate: Ruff lint/format and mypy clean; 43 passed / 11
   deselected.
9. ✅ **Track W1 — relay-safe chat tool loops + error recovery (Done 2026-07-12).**
   The `/api/chat` route now uses stateless Chat
   Completions (`openai.chat("gpt-4o-mini")`) so follow-up tool steps resend ordinary
   messages instead of relay-missing Responses item IDs. The one-shot LLM reranker and
   faithfulness judge intentionally remain on the already-verified default Responses
   provider. The chat client ignores missing-state and unrecognized tool parts, shows a
   generic inline stream error with Retry (`regenerate()`), and permits a fresh send from
   either `ready` or `error`. Offline web gate is green: typecheck and ESLint clean,
   Vitest **40 passed + 6 skipped**, and the production build emits **12 routes**.
   Live acceptance on 2026-07-12 completed one Auckland/M42 prompt through
   `planNight` → `getTargetDetail` → `searchKnowledge`: all three tool cards and the
   grounded answer rendered, `/api/chat` returned 200, and the server log contained
   zero `fc_...` / `msg_...` 400s.
10. ✅ **Track W2 — shared shell, dark default, and plan/chat polish (Done
    2026-07-11).** Added a sticky mobile-safe app shell with Plan/Sessions/Chat links and
    Supabase-aware auth, removed `/plan`'s duplicate local nav, and applied the existing
    dark tokens at the root. `/plan` now has guarded two-decimal geolocation, labelled
    controls, local dusk/dawn display with UTC tooltips, a contextual Bortle badge, five
    client-side kind filters, score bars, top-result emphasis, loading skeletons, and a
    mobile-hidden hours column. `/chat` gains three starter prompts and smooth auto-scroll;
    W1 error recovery is unchanged. Four new formatter tests cover time-zone conversion,
    Bortle endpoints/intermediate labels, and clamping. Dark-mode visual QA covered
    `/plan`, computed results and all Badge variants, `/chat`, and `/login` at desktop and
    390 px mobile width; `/sessions` correctly redirects anonymous users to the inspected
    login surface. The header stayed on one row, filters and skeletons were exercised, and
    no token adjustment was necessary. Full web gate: typecheck and ESLint clean, Vitest
    **44 passed + 6 skipped**, and the production build emits **12 dynamic routes**. No
    dependencies or backend behavior changed.
11. ✅ **Track C1a — calibration authority + continuous-SQM sidecar (Done
    2026-07-11).** Added pure, numpy-free
    `bortle/calibration.py` as the only crosswalk authority, with drift-proof
    representative midpoints and class round-trip coverage. The World Atlas script now
    imports that table, retains the same vectorized Bortle classification, and is ready to
    save a clipped float16 `(720,1440)` `sqm_grid.npy` while reporting SQM per sanity site
    and both artifacts. Runtime adds cached optional `load_sqm_grid` / `sqm_at` with the
    same factored coordinate math as `bortle_at`; absence returns `None`. Five new CI tests
    cover the crosswalk, missing fallback, float16 lookup, synthetic Bortle/SQM agreement,
    and the production sidecar artifact. Synthetic build conversion matched the previous
    formula exactly. The maintainer regenerated both production artifacts; the Bortle
    output is byte-identical, with SHA-256
    `2e9b98d1537665de6773e273bfaac053cbc1c47e6d4f043ff5ca66bf59c91b91`, shape/dtype
    `(720,1440) uint8`, and histogram remains B2=993,599, B3=17,304, B4=20,403,
    B5=4,019, B6=1,184, B7=263, B8=27, B9=1 (B1=0). The committed `sqm_grid.npy` is
    `(720,1440) float16`, SHA-256
    `755e61e4dc7c97721a962b9da8977f5f55cc8fef8730701ccde64477cd7f0f2d`; observed
    NYC/London/Tokyo/Delhi/Cairo SQM values are respectively
    `17.703125/17.953125/18.0625/17.90625/17.90625`, with all five Bortle readings still
    7. Full gates are green: API Ruff/mypy plus **48 passed / 11 deselected**; web
    typecheck/ESLint, **44 passed + 6 skipped**, and the 12-route production build.
12. ✅ **Track C1 — pure integration-time budget estimator (Done 2026-07-11).** The
    community C-gate passed: users reject universal precision but engage with transparent
    range estimates and their sky/gear assumptions. Added pure `budget.py` and 13 offline
    tests covering the required SQM and optics identities, monotonicity, filter behavior,
    lunar weighting, clamps/defaults, planet exclusion, source labels, and ordered ranges.
    Executable validation measured the SQM ratio at **6.730396×**, f/8 versus f/4 at
    **4.0×**, and the mono-NB B9 / broadband B4 anchor at the identical
    **1.584929×** multiplier. The five-row human validation table is in §3; unknown cells
    remain explicitly unfilled. Full gates are green: API Ruff/format/mypy clean with
    **61 passed / 11 deselected**; web typecheck/ESLint and **44 passed + 6 skipped**, plus
    a successful **12-route** production build. No dependencies, network, grid I/O, or
    existing source modules changed.

    **Correction note (2026-07-11):** Track C rev 2 reconciled the Bortle crosswalk but
    left the old literal `mono_nb=0.12` coupling calibrated against pre-reconciliation
    B9=17.5. That would miss its required acceptance band by 22.46%. Mono-NB coupling is
    now derived as `(REF_SQM−BORTLE_TO_SQM[4])/(REF_SQM−BORTLE_TO_SQM[9]) = 1/12`, so
    crosswalk and anchor cannot drift. The identity test validates derivation wiring; the
    forum claim remains a human-reviewed physics datapoint.

    **Follow-up — dual-NB calibration (open):** find a community datapoint that can anchor
    `dual_nb`. Its current `0.30` is a labelled, unanchored interpolation and was not
    silently rescaled when mono-NB was corrected.

13. ✅ **Track C2 — multi-night projection + `GET /plan/project` (Done
    2026-07-11).** Added bounded f-ratio, horizon, and measured-SQM query types plus
    filter/tier Literal validation. The planner now shares one catalog-first target
    resolver, records user/grid/class sky provenance, projects consecutive unique dusk
    windows, applies filter-aware lunar usable-hours penalties, and reports the estimated
    range, cumulative finishing nights, and best night. Planets intentionally return
    populated visibility nights with null long-integration budget fields. Pure cumulative
    edge cases and all five required 422 cases run offline. API Ruff/format/mypy are clean
    with **69 passed / 13 deselected**; both new local-Astropy integration cases pass
    explicitly (**2 passed**). No dependencies or committed data changed.

14. ✅ **Track C3 — `gear_profiles` migration + minimal web gear UI (Repository
    implementation done 2026-07-11; live repair verified 2026-07-15).** Added the
    three-field user-owned gear schema with the exact f-ratio and
    filter constraints, index, and four `0001`-pattern RLS policies; SQL was not applied
    from the agent environment. Supabase setup now records the 0001→0004 order and the
    deliberate absence of gear SQM. Signed-in `/plan` server-loads profiles and exposes
    create/select/delete through `GearCard`; actions derive the user id from auth, and
    deletion adds an explicit user filter atop RLS. `PlanClient` owns the selected profile
    seam and persists its id client-side; planning fetches are unchanged. Anonymous local
    browser QA confirmed no new card and no app console errors; the available browser had
    no authenticated session, so no live Supabase mutation was attempted. Full web gate:
    typecheck/ESLint clean, **44 passed + 6 skipped**, and a successful **12-route** build.
    API regression gate remains green at **69 passed / 13 deselected**. No dependencies
    changed.

    **Superseding correction (2026-07-15):** the signed-in `/plan` transcript shows
    `permission denied for table gear_profiles`, no saved profiles, and therefore no live
    C4 projection. The observed server-action HTTP 200 was only the Next.js action
    wrapper; `createGearProfile` returned a database business error. The prior paragraph's
    authenticated-create conclusion is retracted. Migration `0005` repairs explicit role
    privileges and the new CI job covers grants/RLS.

    **Hosted repair evidence (2026-07-15):** `0005` executed successfully in the configured
    Supabase project. A read-only SQL check returned true for authenticated gear
    select/insert/update/delete, anonymous gear denial, authenticated `hybrid_search`
    execution, and the observation-to-owned-session policy guard. A rollback-wrapped
    transaction then passed owner CRUD, cross-user read/update/delete denial,
    cross-session observation denial, and an authenticated hybrid RPC call without leaving
    test rows. The application-level acceptance then created `P0 acceptance 2026-07-15`,
    reloaded `/plan` and observed it still selected, ran the SQM 18.4 gear-aware plan,
    opened M42's 30-night projection, deleted the profile, and reloaded to prove cleanup.
    No permission error appeared.

15. ✅ **Track C4 — surface budget ranges, measured SQM, and completion detail (Done
    2026-07-11).** Optional gear parameters now flow through `/plan/night`; their absence
    retains the legacy payload, while their presence adds one resolved sky source and
    pure per-row budget fields. `/plan` shows honest hours ranges, planet/mismatch states,
    the required World Atlas caveat, and a persisted client-validated SQM override. The
    new `/api/project` proxy and typed `ProjectPlan` support an on-demand target card with
    completion-session guidance, best night, and a zero-preserving CSS hours strip.
    Measured local proxy output at SQM 18.4 reported M42 **34.8–69.5 h**, Jupiter budget
    false, and the requested projection horizon. Browser QA confirmed the anonymous
    no-profile table remains the original five columns with no console errors; the
    available browser session was not authenticated, so gear UI mutations were not
    attempted. Full API gate: **72 passed / 14 deselected**, plus the focused gear-rank
    integration check. Full web gate: typecheck/ESLint clean, **45 passed + 6 skipped**,
    and a successful **13-route** build. No dependencies or committed data changed.

    **C4(d) progress tracking (stretch, open):** add nullable non-negative
    `integration_minutes` to observations, collect optional minutes when logging, and sum
    target progress against the modeled range. Deferred because it expands schema,
    authenticated logging UX, and aggregation beyond the cleanly landed required slice.

16. ✅ **Track closeout hardening (Done 2026-07-12).** Moon separation now compares
    targets and the Moon in one GCRS frame instead of suppressing Astropy's transform
    warning; two fixed/moving regression cases promote the former warning to an error.
    Starlette's officially recommended `httpx2>=2.5` is now a dev-only dependency, so
    `TestClient` no longer emits its plain-httpx deprecation warning. The final API gate
    is clean at **72 passed / 16 deselected**, all **8** planner integration cases pass,
    and the web gate remains **45 passed + 6 skipped** with a successful **13-route**
    build. Python 3.12.13 parity was also verified in an isolated environment without
    replacing the maintainer's existing Python 3.13 `.venv`.

17. ✅ **P0 — restore the live Track C vertical slice (Done 2026-07-15).** Added
    immutable migration `0005` instead of
    rewriting applied history. It makes all required API-role privileges explicit,
    removes anonymous user-table access and implicit public RPC execution, and closes the
    cross-user session-reference hole in observation writes. The new CI database job is
    configured with PostgreSQL 16 + pgvector to replay all migrations, reapply `0005`,
    verify privileges, exercise owner create/read/update/delete, prove cross-user and
    cross-session denial, and call `hybrid_search` as `authenticated`. `/plan`, `/sessions`,
    and session detail now display Supabase read errors rather than reporting empty data.
    No service-role key was added to the web app. Measured local gates: API
    Ruff/format/mypy clean with **72 passed / 16 deselected**; web typecheck/ESLint clean,
    **45 passed + 6 skipped**, and a successful **13-route** production build. This machine
    has no PostgreSQL or Docker, so the new database job is executable CI coverage but not
    yet a locally observed pass. Hosted `0005`, effective grants, rollback-wrapped owner/
    cross-user RLS behavior, and the hybrid RPC are directly verified. Signed-in browser
    acceptance also passed create → reload/persist/select → SQM 18.4 rank → M42 30-night
    projection → delete → reload/absent. The API returned 200 for both gear-aware
    `/plan/night` and `/plan/project`; M42 displayed **34.8–69.5 h**, a 30-night horizon,
    and best projected night 2026-08-12. The final reload showed the genuine empty state
    with no permission error, and the acceptance profile was removed.

18. ✅ **P0 — make chat recommendations trustworthy (Done 2026-07-15).** `/plan` now
    persists the last successful explicit observer coordinates, observing date, and
    source; chat passes that validated application state on every send/retry. Server-bound
    planning tools no longer expose latitude/longitude to the model and every plan/detail
    result card audits coordinates, source, and date. Missing context returns a structured
    `location_required` card; the generic comparison starter asks for location, while the
    Auckland starter explicitly binds `-36.85,174.76`. Deterministic trajectory policy
    forces retrieval for science, one plan plus per-target details for comparisons, and
    normalizes `Jupter`; bare `M1` is treated as planning rather than answered from memory.
    The initial live trajectory run correctly failed both science cases at **0.33**
    faithfulness even though tool calls/citations were present. The threshold and fixtures
    were not weakened: the final policy suppresses model-authored science text and emits
    short cited corpus evidence (or the exact insufficient-evidence response). The rerun
    passed **5/5**. Browser acceptance at Auckland measured identical `/plan` and `/chat`
    values: **Bortle 6, 11.1 h dark, 1% Moon**, M31 peak **11.7° / 0 h / score 0**, and
    M42 peak **22.4° / 0.3 h / score 21.1**. A clean-origin `M1` call displayed only
    `planNight · location required` and requested coordinates; no location or object fact
    was invented. A real Orion science turn displayed five literature cards and only
    cited corpus excerpts. Final gates: API **72 passed / 16 deselected**; web typecheck/
    ESLint clean, no-key Vitest **61 passed + 11 skipped**, live agent **5/5**, and the
    **13-route** production build passed. No dependencies or committed data changed.

19. **P1 — production reliability and error semantics (Repository + hosted database +
    production hosting, shared limiter, and signed-in chat acceptance verified
    2026-07-15).** Target
    resolution now has explicit
    `TargetNotFound`, `UnsupportedTarget`, and `UpstreamResolutionError` categories mapped
    by both planning and visibility routers to 404, structured 422, and 502 respectively.
    `AAA` exercises the missing-name path; M4 resolves locally and Alpha Centauri preserves
    the Simbad fallback. The Moon is a moving, self-penalty-free observing target with no
    deep-sky budget; Sun/Sol returns `solar_daylight_planner_required` and never enters the
    night planner. Next plan/project/visibility proxies check presence before conversion
    and reject missing, non-finite, and out-of-range values instead of coercing absence to
    zero.

    `/api/chat` now requires a valid Supabase user, bounds bytes/history/message lengths,
    atomically reserves configurable per-user minute/day quotas through migration `0006`,
    and records numeric token/cost totals plus content-free step/tool latency and bounded
    failure reasons. Model work is capped at 55 seconds inside `maxDuration=60`, individual
    steps and chunks have shorter aborts, retries are disabled, and output is capped. The
    60-night projection path runs Astropy in a worker behind bounded process-local rate and
    concurrency guards. Production adds a shared Vercel WAF fixed-window rule for the
    expensive proxy path: six `/api/project` requests per IP per 60 seconds, then 429.

    Chat restores versioned, validated user/assistant text-only history from local storage;
    tool parts are excluded, unknown versions are discarded, and Clear conversation removes
    the stored copy. `/privacy` documents the local storage/provider boundary. `/plan` now
    labels dusk/dawn as the explicit device IANA zone/abbreviation with UTC tooltips; tests
    cover Auckland viewed from Los Angeles across date rollover and PDT→PST. Deriving the
    observing site's own IANA zone remains the preferred product follow-up.

    The insecure local TLS override was removed. This machine now exports a machine-only
    two-root bundle through `NODE_EXTRA_CA_CERTS`; canned chat, embedding, reranking, and
    Supabase traffic passed with normal certificate validation. Repository gates are clean:
    API Ruff/format/mypy plus **90 passed / 16 deselected**; web typecheck/ESLint plus
    **79 passed + 11 skipped** and a **14-route** optimized production build. Local
    `next start` artifact smoke returned `/plan` 200, `/privacy` 200, invalid proxy 400,
    and anonymous chat 401. The current environment has no local PostgreSQL, but migration
    `0006` was applied successfully to the configured hosted Supabase project on 2026-07-15.
    Its rollback-wrapped live acceptance passed atomic minute quota, completion-capability
    enforcement, numeric usage recording, completion-token column denial, and cross-user
    RLS visibility without retaining fixture rows. Root `vercel.json` now defines one
    Vercel Services deployment: a public Next.js service receives a deployment-aware
    private binding to the otherwise unexposed FastAPI service, whose function duration is
    capped at 60 seconds. Vercel CLI 56.2.0 local-runtime proof started both detected
    services, then measured `/api/plan` 200 with 21 targets, M4 visibility 200, a two-night
    M4 projection 200, missing latitude 400, and anonymous chat 401 through the public web
    surface. Ruff excludes Vercel's generated `.vercel` runtime rather than linting vendored
    code; the full repository gate remained API Ruff/format/mypy + **90 passed / 16
    deselected**, and web typecheck/ESLint + **79 passed / 11 skipped** + the **14-route**
    optimized build.

    The first real Vercel deployment (`c0285fc`, deployment
    `dpl_BdYkzHvq9sSnmXFJW5aeDvwKxjtU`) built both services but correctly failed promotion:
    Vercel Services reject Next's legacy Edge `_middleware` output. Next 16's documented
    migration was applied by moving the session refresh boundary to `src/proxy.ts` and
    renaming the export to `proxy`. Commit `917ab46` then deployed successfully as
    `6BFCcM3ZxTXpAsAbBtDLJowCpen8` in 77 seconds. Vercel Authentication was deliberately
    disabled at the project layer so `/plan` is public; application chat authentication
    remains enforced by Supabase. Production and Preview hold only the public Supabase
    URL/key plus the server-only OpenAI relay configuration; no Supabase service-role key
    was uploaded. The stable public origin is `https://astro-scout-web.vercel.app`.

    Live production smoke returned `/plan` and `/privacy` 200, missing latitude 400,
    local M4 200, Simbad-fallback Alpha Centauri 200, unresolved `AAA` structured 404,
    Sun structured `solar_daylight_planner_required` 422, anonymous chat structured 401,
    and a correctly parameterized two-night M4 projection 200. Supabase Auth now uses the
    stable production origin as its Site URL and allows both the production and localhost
    `/auth/callback` URLs. The published WAF rule was exercised with seven small invalid
    projection requests: six reached the proxy and returned its expected 400, while the
    excess request returned 429.

    Signed-in production acceptance used a real magic-link session and the built-in
    non-private Auckland starter. `/api/chat` returned 200, invoked `planNight`, completed
    two model steps, and rendered an assistant response. The content-free database row was
    `completed` with 1,815 input, 391 output, and 2,206 total tokens, estimated cost
    `$0.00050685`, 21,886 ms duration, and no failure reason. Vercel grouped five structured
    events for the same request: request start, `planNight` completion at 9,899 ms, step 0
    at 12,158 ms, step 1 at 8,609 ms, and request completion at 22,193 ms. The events had no
    prompt, response, message, or secret fields. Observed external calls were Supabase user
    verification, quota reservation, two relay chat-completion steps, the private planning
    service, and quota completion. Reload restored exactly one user and one assistant text
    message while omitting the tool payload; fresh client navigation passed in both
    Plan→Chat and Chat→Plan directions.

    Operationally, the relay credential currently configured in Vercel succeeded in that
    live request. Provider-side revocation of the earlier value cannot be proven from the
    application: Vercel marked it sensitive, but the import form exposed it to the browser
    automation accessibility snapshot, so revocation must remain an explicit maintainer
    confirmation rather than an inferred repository claim. Follow-up is explicitly deferred
    and tracked below.

    **Superseding correction (2026-07-16):** provider-side disablement and replacement are
    now independently verified and recorded in item 23. The paragraph above remains as the
    measured 2026-07-15 state rather than being rewritten after the fact.

20. ✅ **Documentation and operational reconciliation (Done 2026-07-15).** The root,
    API, and web READMEs were checked against the current routes, UI actions, migrations,
    retrieval RPC, production projection guard, auth boundary, gear behavior, and chat
    tools. They now describe migrations `0001`→`0006`, `/plan`, the `/api/project`→
    `/plan/project` path, all three chat tools, current World Atlas light-pollution data,
    and the production WAF instead of leaving shipped features as gaps. The blank API
    scorecard and stale `match_documents` production-retrieval claim were removed.
    `docs/live-acceptance.md` is now the single canonical hosted journey for auth, gear
    CRUD, budgeted planning, projection, saved sessions/observations, chat trajectories and
    citations, text-only persistence, content-free accounting, structured target errors,
    successful local/Simbad resolution, and the shared projection limit.

    **Sequencing correction (2026-07-15):**
    `NEXT_STEPS_RECOMMENDATIONS.md` originally placed this after P1 even though its own
    requirement said to run the pass after P0. P1 was already complete before the ordering
    defect was corrected. The document now makes reconciliation the P0→P1 prerequisite and
    requires agents to read it in full before starting its work. This is documentation-only
    closeout: no new live acceptance run was performed, no prior failure or superseding
    correction was removed, and no application behavior, migration, dependency, or data
    artifact changed. Repository verification remained green: API Ruff/format/mypy plus
    **90 passed / 16 deselected**; web typecheck/ESLint plus **79 passed / 11 skipped** and
    a successful **14-route** optimized build. The first sandboxed build attempt failed
    because Turbopack was not permitted to bind its internal local port; the required
    unsandboxed rerun compiled successfully.

21. ✅ **P2 — retention loop and evidence closeout (Repository, hosted database, and
    production artifact verified 2026-07-15).** Migration `0007` adds nullable,
    non-negative observation integration minutes and an authenticated owner-scoped progress
    RPC. Saved-session logging accepts optional whole minutes; signed-in gear-aware plans
    show persisted per-target totals and modeled-range percentages, while legacy null rows,
    anonymous plans, and gearless payloads remain valid. Hosted migration application
    succeeded. A rollback-wrapped production-database acceptance inserted two synthetic
    auth owners, proved 120-minute owner aggregation, negative-minute rejection, and
    cross-user invisibility, then rolled back all fixtures. The final schema/privilege query
    returned `true` for the column, constraint, authenticated execute grant, and anon revoke.

    Commit `930907d` deployed to Vercel Production as deployment
    `D4TF9i6DjAMRVDXhDtrvLkRMqcYr` (Ready; 1m14s build). At the stable production origin,
    `/plan` returned 200; the dated Auckland plan returned 200 with 10.3 dark hours and 21
    targets; North-Pole summer returned the structured 422
    `no_astronomical_darkness`/`daylight_or_twilight_planning_required` state; and
    North-Pole winter returned 200 with a bounded 24-hour
    `continuous_astronomical_darkness` window and 21 targets.

    Signed-in browser acceptance created a temporary f/5 broadband profile, planned from
    the non-private Auckland starter with SQM 18.4, saved the session, and logged 120 whole
    minutes for M42. The plan immediately showed `2.0 h logged` and `3–6% of modeled
    range`; after a hard reload and fresh ranking, the same owner total returned. The saved
    session detail showed `120 min integration`. The temporary profile was deleted and its
    absence was confirmed after another hard reload. The acceptance session/observation is
    retained per the canonical runbook rather than removed through an unapproved admin
    path; it is synthetic acceptance evidence and must not feed calibration.

    Polar masked twilight no longer becomes a generic 502: no astronomical darkness raises
    a structured 422 product state, while continuous polar darkness returns a labelled,
    bounded 24-hour window. Pure classifier, router mapping, North-Pole solstice, and normal
    payload regression coverage are present. The web labels continuous darkness and explains
    the bounded projection window.

    The live 18-case retrieval A/B measured **684 rows / 19 targets**, correcting the stale
    253-row assumption; **225 rows are exact duplicates**. Raw versus LLM-reranked all-case
    recall@3 was **0.44 → 0.63**, and the four-planet subgroup was **0.75 → 1.00**. BGE was
    not run and remains opt-in. The dual-NB review found no controlled equal-quality time
    ratio, so `0.30` remains unanchored. The two remaining community validation rows now
    expose their current model outputs and inconclusive dispositions; the Cocoon class-only
    output is 305.1–610.2 h at B8 and 964.8–1929.7 h at B9 rather than being tuned toward
    the report. Per-user calibration remains blocked on real outcome data and an approved
    sufficiency threshold; finer city-core grids remain deferred. Evidence and source
    limitations are preserved in `docs/evidence/2026-07-15-p2-evidence.md`.

    Local repository gates are green: API Ruff/format/mypy plus **99 passed / 19
    deselected**; focused polar Astropy integration cases passed; web typecheck/ESLint plus
    **83 passed / 11 skipped** and a successful **14-route** optimized build. Initial
    sandboxed `uv sync` and Turbopack build attempts failed on cache/port permissions; the
    required writable-cache and approved worker-capability reruns passed. No dependency,
    Bortle/SQM artifact, retrieval-default, or budget constant changed.

22. ⚠️ **Post-P2 source completion audit (Filed 2026-07-15; remediation open).** A
    read-only review of the current API, web, chat, migrations, ingestion, CI, deployment
    configuration, and tests concluded that the planned vertical slice is a strong
    release-candidate beta rather than a production-complete public release. The report is
    preserved at
    `docs/evidence/2026-07-15-source-completion-audit.md`; specific objectives,
    dependencies, non-goals, acceptance criteria, evidence requirements, and stop
    conditions are in
    `docs/plans/2026-07-15-post-audit-production-closeout.md`.

    Measured probes exposed two correctness invariants not covered by the earlier hosted
    journey: M81 in a 24-hour polar-darkness window reports 24.3 visible hours, and bare
    Saturn/Mars/Moon/Pleiades prompts receive no deterministic chat tool action while M45
    correctly receives plan + detail. Source inspection also found that editable plan
    controls can diverge from the displayed ranking before projection/save, future
    observing dates are omitted from saved sessions, nested chat tools do not propagate
    the route abort signal, the insert-only ingestion path has no conflict identity, chat
    reservations lack stale recovery, and CI has no built-artifact browser journey.

    This item files evidence and plans only. It does not change application behavior,
    credentials, hosted configuration, schema, dependencies, corpus rows, Bortle/SQM
    artifacts, retrieval defaults, or budget constants. The original ten-item completion
    ledger remains a truthful historical record of its scope; it does not close this new
    workstream. The audit's local baseline was API Ruff/format/mypy plus **99 passed / 19
    deselected**, six focused Astropy cases, web typecheck/ESLint plus **83 passed / 11
    skipped**, and a successful **14-route** build after the preserved sandbox worker-port
    failure and permitted rerun. Hosted services were not re-tested by the audit.

23. ✅ **PA-0 — credential and key-boundary incident closed (Provider and production
    verified 2026-07-16).** The relay provider independently showed the earlier credential
    disabled. A replacement was installed in Vercel's sensitive `OPENAI_API_KEY` row for
    both Production and Preview, and production deployment
    `5kFsEWX3FepoRz3Si9aK4SXoPta8` from commit `5fd3151` reached Ready. The deployed browser
    bundle exactly matched the configured `sb_publishable_` Supabase web key and contained
    no `sb_secret_` key class, so the public key was correctly left unrotated.

    The provider operation had one preserved failure: the form retained numeric defaults
    and created eleven replacement tokens at ¥1,010 each instead of one at ¥10. All ten
    unintended suffixed tokens were disabled immediately, the retained unsuffixed token was
    reduced to ¥10, and final provider state showed exactly one new token enabled; the old
    token remained disabled. No credential value, fingerprint, masked value, screenshot, or
    private text is recorded.

    Signed-in production acceptance used the built-in non-private Auckland starter.
    `planNight` completed two model steps. Its content-free usage row reached `completed`
    with 2,882 input, 425 output, and 3,307 total tokens, estimated cost `$0.00068730`,
    17,072 ms duration, and no failure reason. Five correlated Vercel events covered request
    start, tool completion, two steps, and request completion; their schema contained only
    correlation/status/tool/step/timing/token/cost fields and no prompt, response, message
    content, tool payload, user ID, authorization, cookie, email, API-key, or secret field.
    Full non-secret evidence is preserved in
    `docs/evidence/2026-07-16-pa0-credential-closeout.md`.

    No application code, schema, dependency, corpus row, calibration artifact, or model
    constant changed. Local closeout gates remained green: API Ruff/format/mypy plus
    **99 passed / 19 deselected**; web typecheck/ESLint plus **83 passed / 11 skipped** and
    a successful **14-route** optimized build. The first sandboxed `uv sync` attempt failed
    because the existing uv cache was not readable, and the first sandboxed Turbopack build
    failed because worker port binding was denied; the permitted reruns passed.

24. ⚠️ **PA-1 — immutable planner provenance (Merged and Production Ready 2026-07-16;
    signed-in Production acceptance pending).** The
    web now stores each successful `NightPlan` with a frozen
    request snapshot containing coordinates, requested/effective date, location source,
    selected profile identity and gear inputs, and measured SQM. Ranking and projection
    query builders share that snapshot; projection, observer persistence, and save never
    read mutable controls. Coordinate, browser-geolocation result, date, gear, and SQM
    changes clear the ranking/projection/session binding, while a generation guard prevents
    an older request from restoring stale state.

    `saveSession` now inserts the snapshot's exact `planned_for` and coordinates. Session,
    observation, gear-create, and gear-delete actions share strict runtime bounds and
    discriminated `success`, auth, validation, database, and no-affected-row outcomes.
    Gear deletion selects the affected id, so an RLS/no-row delete is no longer reported
    as success. No migration, RLS policy, dependency, budget/scoring constant, or committed
    data artifact changed.

    Local gates are green: API Ruff/format/mypy plus **99 passed / 19 deselected**; web
    typecheck/ESLint plus **102 passed / 11 skipped** and a successful **14-route** build.
    A local `next start` + FastAPI artifact returned 200 for Auckland. Its snapshot rendered
    `-36.8500, 174.7600`; editing latitude to `-36.80` immediately removed the result/table,
    and reranking rendered `-36.8000, 174.7600`. The browser harness did not emit React's
    date-change event for the native date control, so that local attempt is not counted as
    future-date browser proof. Deterministic future-date/action tests passed.

    Commit `765b4f0` produced Ready Vercel Preview
    `83aghW2DF2SLFTR4uq6UQmWDfMsb` without changing Production. The anonymous Preview
    rendered the exact Auckland snapshot `-36.8500, 174.7600 · 2026-08-20`; changing
    latitude to `-36.84` immediately removed the snapshot/table, and restoring the original
    coordinate plus reranking restored the future-date snapshot. The direct Vercel CLI
    path was unavailable because no local credentials were present and its check ended in
    `Error: fetch failed`, so the approved Git-integrated Preview path was used.

    After explicit approval added the exact ephemeral callback, a real Preview session
    passed gear create/read/selection reload, the exact f/5 broadband + SQM 18.4 snapshot,
    coordinate/date/profile/SQM invalidation, and M42 projection with a matching snapshot.
    Save inserted session `b3b545a5-e3ec-45d1-881b-b8fc6232f35f` with exact date
    `2026-08-20` and Auckland coordinates, but action revalidation remounted `/plan` before
    `Session saved` or logging could persist visibly.

    Commit `1c39cdc` removes only the session/observation revalidation responsible for that
    remount and adds a successful-log regression. Web gates passed with **103 passed / 11
    skipped** and a **14-route** build after the documented sandbox port-binding correction.
    Ready deployment `2FA5YPaigXq25LxL1GmQpAPN1xAT` owns a stable branch alias, whose exact
    callback was added with separate approval. A later retry first reached the measured
    built-in quota of **2 emails/h**, then returned `access_denied` / `otp_expired` after the
    window reset. The quota was not raised and credentials were not copied between hosts.

    The approved recovery first removed only the obsolete ephemeral callback and deleted
    the failed-run session with an exact guarded SQL `RETURNING` result of **1 row**. PR
    **#1** then merged the reviewed tree as `8455b7108f98208b961b733babe17dc02c948bc9`.
    Because an automatic merge deployment did not surface, the exact reviewed artifact at
    `83dc651` was deliberately promoted and rebuilt with Production configuration as Vercel
    deployment `HfyfLLjpFig1hVnb9LGUztLouHbg`; it reached **Ready** at the stable origin.

    The retained session existed only on the obsolete immutable Preview host; a fresh
    Production `/plan` load was signed out. No additional magic link was requested and no
    auth token was copied between hosts. The existing Preview session was used only to
    delete temporary gear `PA-1 acceptance f5`. The stable branch callback and remote
    review branch were then removed. Supabase callback measurement now contains exactly
    localhost and Production. Corrected `Session saved`, 120-minute M42 logging, and
    `/sessions` list/detail reload are still unverified on the Production origin and remain
    required before PA-1 closes. Evidence:
    `docs/evidence/2026-07-16-pa1-repository-evidence.md`.

### Post-audit production-closeout workstream (opened 2026-07-15)

- [x] **PA-0 release operations:** revoke/replace the exposed relay credential and verify
  the deployed Supabase key class, with no credential value recorded.
- [ ] **PA-1 planner provenance (merged/Production Ready; signed-in acceptance pending):**
  bind
  ranking/projection/save to one immutable request context, persist the actual future
  `planned_for` date, and validate mutation outcomes.
- [ ] **PA-2 chat target policy:** cover all supported catalog names/aliases and guarantee
  the required-action set fits a bounded trajectory with final output.
- [ ] **PA-3 chat reliability:** propagate deadlines through nested tools and add durable
  terminal accounting/stale-reservation recovery.
- [ ] **PA-4 numerical bound:** integrate interval occupancy so visible/usable time cannot
  exceed the dark window.
- [ ] **PA-5 ingestion integrity:** after separate data-plan sign-off, add deterministic
  identities, real idempotency/resume, and approved exact-duplicate reconciliation.
- [ ] **PA-6 boundary hardening:** sanitize generic public errors, verify private-service
  limiter identity, harden mutation/reranker outcomes, and control schema-type drift.
- [ ] **PA-7 built-artifact E2E:** automate the non-private core browser journey in CI.
- [ ] **PA-8 truthful closeout:** rerun intended-host acceptance and reconcile every status
  document only after the corresponding behavior is measured.

### P1 production credential follow-up (closed 2026-07-16)

Credential values are intentionally not recorded here, elsewhere in the repository, or in
task output. The maintainer resumed these operations on 2026-07-16; item 23 and its linked
evidence record contain the measured non-secret closure.

- [x] **`OPENAI_API_KEY` / relay credential — rotated and revoked:** the
  server-only value appeared in the Vercel import page's browser accessibility snapshot even
  though the field was marked sensitive. The provider now reports it disabled; the bounded
  replacement is active in Production and Preview, and deployment plus signed-in
  chat/accounting/log acceptance passed without recording either value.
- [x] **`NEXT_PUBLIC_SUPABASE_ANON_KEY` — key class and boundary verified:** this
  client-public value appeared in the same snapshot. Exposure alone is expected for an anon
  or publishable key and is not a secret-key rotation incident. The deployed bundle exactly
  matched the configured `sb_publishable_` web key and contained no `sb_secret_` class;
  existing RLS and explicit grants remain the security boundary.

### Track C follow-up backlog (recorded 2026-07-12)

- **Polar dark-window handling (done 2026-07-15):** no-dark dates return structured 422;
  continuous darkness returns an explicit bounded 24-hour planning window.
- **Grown-corpus retrieval evaluation (done 2026-07-15):** the 18-case raw/LLM run includes
  four planet-labelled cases. Live production measured 684 rows / 19 targets rather than
  253; 225 exact duplicate rows are preserved as a new ingestion/idempotency follow-up.
- **Moon-separation warning noise (done 2026-07-12):** compare target and Moon in one
  GCRS frame. Fixed- and moving-target integration tests now fail on recurrence.
- **Python environment parity (verified; local cleanup optional):** the full gate passes
  under isolated Python 3.12.13. The maintainer's existing `.venv` remains on 3.13.13;
  recreate it only if exact day-to-day CI parity is desired.
- **Dark-nebula taxonomy (open):** split silhouettes on emission from broadband dust
  before expanding the catalog, so filter coupling no longer depends on the IC434 case.
- **City-core SQM resolution (deliberately deferred 2026-07-15):** retain measured-SQM as
  the practical mitigation; propose a provenance/data plan only after usage evidence.
- **Per-user calibration (blocked on outcome evidence):** C4(d) minutes/progress capture is
  implemented, but minutes plus the existing rating are not yet sufficient quality labels.
  Define no sufficiency threshold and personalize nothing until real non-synthetic outcomes
  exist and the maintainer approves the threshold.
- **Corpus ingestion idempotency (open 2026-07-15):** production has 684 document rows but
  only 459 exact-unique target/bibcode/content tuples. Diagnose/reconcile the 225 exact
  duplicates in a separately approved data mutation; retrieval-time dedup remains active.

**Integration tests that need live services** (run manually with keys, excluded from CI):
`test_datasources_integration.py` (CDS/Simbad + ADS), `test_planning_integration.py`
(astropy compute), `test_routers.py::*future*` (astropy compute),
`test_literature.py::*live*` (ADS resolver round-trips). In the sandbox the CDS/Simbad
ones fail purely due to blocked network — expected.

---

## 6. How to run the whole thing (live)

```bash
# 1. Supabase: create project; run migrations 0001→0002→0003→0004→0005→0006→0007;
#    enable email auth;
#    allow http://localhost:3000/auth/callback
#    SUPABASE_URL = bare project URL (no /rest/v1). A 42501 means migration 0005 is
#    missing or the hosted schema has drifted; do not patch privileges out of band.
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
# If a local intercepting proxy needs a private/root CA, export NODE_EXTRA_CA_CERTS to a
# verified machine-only PEM bundle before starting Node. Never disable TLS verification.
# Optional local reranker: install @huggingface/transformers as a dev-only package,
# then set RERANK_BACKEND=bge. First use downloads/caches the quantized public model.
pnpm --filter @astroscout/web dev                        # http://localhost:3000
```
`/plan` works without auth; sign-in (magic link) unlocks save/log/progress and `/chat`.
Chat needs migration `0006`; recorded progress needs `0007`; grounded answers need
`OPENAI_API_KEY` and an ingested corpus.
Use `docs/live-acceptance.md` as the single release-candidate journey; record new live
results as dated evidence and preserve failed checks as corrections.
