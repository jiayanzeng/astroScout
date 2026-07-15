# AstroScout API

FastAPI service + validated astronomy data adapters.

## Run

```bash
uv sync
uv run uvicorn astroscout_api.main:app --reload   # http://127.0.0.1:8000/docs
```

## Endpoints

- `GET /health` → `{"status": "ok"}`
- `GET /visibility?target=M31&lat=-36.85&lon=174.76` → altitude, transit, moon, rating
- `GET /plan/night?lat=&lon=&when=&f_ratio=&filter=&tier=&sqm=` → dark window,
  ranked catalog, and optional gear/SQM budgets
- `GET /plan/target?name=&lat=&lon=&when=` → one catalog/Simbad target
- `GET /plan/project?name=&lat=&lon=&f_ratio=&filter=&tier=&when=&nights=&sqm=` →
  bounded multi-night projection

Target resolution is catalog-first. Unknown names return 404, known targets that require
a different product flow return a structured 422, and actual Simbad/network failures return
502. The Moon is a moving observing target; Sun/Sol returns the daylight/solar-safety flow
instead of entering the night planner. Projection work runs off the async loop behind
process-local concurrency and request-rate guards. The production Vercel origin adds a
shared WAF limit of six `/api/project` requests per IP per 60 seconds; a self-hosted
multi-worker deployment must provide an equivalent gateway-level limit.

Polar darkness is also explicit. A date on which the Sun never reaches astronomical
darkness returns structured 422 `no_astronomical_darkness`; continuous polar night uses a
labelled, bounded 24-hour planning window instead of passing Astropy's masked twilight
value into the ordinary dusk/dawn flow. Normal-night response shapes are unchanged.

## Data sources

| source | adapter | needs token | notes |
|---|---|---|---|
| Simbad (CDS) name→coords | `datasources/targets.py`, `catalog.py` | no | explicit not-found versus outage errors |
| Visibility / transit | `datasources/visibility.py` | no | local moving/fixed targets, then Simbad; UTC |
| Darkness / moon | `datasources/visibility.py` | no | sun set, astronomical dusk, moon illumination |
| NASA ADS literature | `datasources/literature.py` | **yes** (`ADS_TOKEN`) | free token, rate-limited |
| Light pollution | `bortle/grid.py` | no | committed World Atlas Bortle/SQM grids |

## Verification

`scripts/validate_sources.py` is the component data-source probe. The canonical end-to-end
production journey is [`../../docs/live-acceptance.md`](../../docs/live-acceptance.md); it
keeps auth, planning, projection, saved state, grounded chat, and error semantics in one
dated evidence record. Historical measured results and corrections live in
[`../../STATE.md`](../../STATE.md), not in an unfilled README scorecard.

## Planning behavior

- `GET /plan/night?lat=&lon=&when=&f_ratio=&filter=&tier=&sqm=` → dark window plus a
  scored, ranked catalog, with optional future date and gear-aware budgets.
- `GET /plan/target?name=&lat=&lon=&when=` → detailed night conditions for one target
  (built-in catalog first, else Simbad name resolution).
- `GET /plan/project?name=&lat=&lon=&f_ratio=&filter=&tier=&when=&nights=&sqm=` → a
  rate/concurrency-protected multi-night visibility and integration-time projection
  (maximum 60 nights).

Scoring is a pure, unit-tested function (`scoring.py`): altitude (extinction),
hours above the useful-altitude floor during darkness, and moon interference
(illumination × proximity). The astropy-backed planner (`datasources/planning.py`)
computes the inputs across a time grid spanning the dark window.

## Knowledge base / RAG

Ingest astronomy literature into pgvector so the copilot can answer with grounded,
cited facts instead of hallucinating.

```bash
# requires OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, ADS_TOKEN
# run supabase/migrations/0002_knowledge.sql first
uv run python scripts/ingest_knowledge.py --all          # whole built-in catalog
uv run python scripts/ingest_knowledge.py --target M42 --rows 12
```

Pipeline (`rag/`): `fetch_abstracts` (ADS, most-cited first) → `chunk_text`
(pure, unit-tested) → `embed_texts` (OpenAI `text-embedding-3-small`, 1536-d) →
`upsert_documents` (Supabase PostgREST, service role). Retrieval happens on the web
side via the `hybrid_search` RPC: Postgres full-text and pgvector candidates are fused
with Reciprocal Rank Fusion, deduplicated, and then reranked when a configured reranker is
available. Embeddings remain pinned to the same 1536-dimensional model.

## Light pollution (Bortle) — v0.6

The planner folds the observer's sky brightness into ranking. `bortle/` provides an
**offline, O(1)** lookup from committed 0.25° World Atlas artifacts: `bortle_grid.npy`
is the uint8 class grid and `sqm_grid.npy` is the float16 continuous-SQM sidecar. Both are
satellite-derived from the World Atlas 2015 (Falchi et al. 2016) using 75th-percentile
aggregation. Runtime lookup is pure index arithmetic—no network or per-request cost.
Budget resolution deliberately prefers a user-measured SQM value, then the SQM sidecar,
then the Bortle-class crosswalk. The curated city/population model (`cities.py`) and
Walker-law estimator (`model.py`) remain the offline fallback builder only.

Scoring multiplies each target's score by a light-pollution factor scaled by the
object's surface-brightness sensitivity (`scoring.light_sensitivity_for_kind`): faint
galaxies are crushed under urban skies while clusters barely move, so **rankings flip
between a dark site and a city**. Endpoints accept an optional `when` (ISO date/datetime)
to plan a future night, and both planning and visibility routers validate lat/lon bounds.

> Honest note: the grids are **satellite-derived** from the World Atlas 2015 (Falchi
> et al. 2016), aggregated to 0.25° by 75th percentile. The committed `.npy` files are
> the deliberate seams—swap them and runtime code does not change. City cores can lose
> detail at this resolution, so the UI accepts measured SQM rather than presenting the
> sidecar as site-level truth. Regenerate both with `uv run --with rasterio python
> scripts/build_bortle_grid_viirs.py --src <world_atlas.tif> --units mcd`.
