# AstroScout API

FastAPI service + validated astronomy data adapters.

## Run

```bash
uv sync
uv run uvicorn astroscout_api.main:app --reload   # http://127.0.0.1:8000/docs
```

## Endpoints (Week 1)

- `GET /health` → `{"status": "ok"}`
- `GET /visibility?target=M31&lat=-36.85&lon=174.76` → altitude, transit, moon, rating

## Data sources

| source | adapter | needs token | notes |
|---|---|---|---|
| Simbad (CDS) name→coords | `datasources/catalog.py` | no | column names vary across astroquery versions |
| Visibility / transit | `datasources/visibility.py` | no | astropy + astroplan; times are UTC |
| Darkness / moon | `datasources/visibility.py` | no | sun set, astronomical dusk, moon illumination |
| NASA ADS literature | `datasources/literature.py` | **yes** (`ADS_TOKEN`) | free token, rate-limited |
| Light pollution | — | — | **known gap: no clean free API.** MVP uses altitude + moon only |

## Day-6 scorecard (fill in after running `scripts/validate_sources.py`)

| target | catalog | visibility | darkness | literature | latency notes |
|---|---|---|---|---|---|
| M31 | | | | | |
| NGC 7000 | | | | | |
| M42 | | | | | |
| Jupiter | | | | | |

## Planning endpoints (v0.1)

- `GET /plan/night?lat=&lon=` → dark window + scored, ranked catalog of targets
  for the upcoming astronomical night.
- `GET /plan/target?name=&lat=&lon=` → detailed night conditions for one target
  (built-in catalog first, else Simbad name resolution).

Scoring is a pure, unit-tested function (`scoring.py`): altitude (extinction),
hours above the useful-altitude floor during darkness, and moon interference
(illumination × proximity). The astropy-backed planner (`datasources/planning.py`)
computes the inputs across a time grid spanning the dark window.

## Knowledge base / RAG (v0.2)

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
side via the `match_documents` RPC, using the same embedding model.

## Light pollution (Bortle) — v0.6

The planner folds the observer's sky brightness into ranking. `bortle/` provides an
**offline, O(1)** Bortle lookup: a curated city/population model (`cities.py`) feeds a
pure light-pollution model (`model.py`, Walker-law falloff -> calibrated thresholds)
that is precomputed into a compact `bortle_grid.npy` (0.25 deg, uint8). Runtime lookup
is pure index arithmetic — no network, no per-request cost.

Scoring multiplies each target's score by a light-pollution factor scaled by the
object's surface-brightness sensitivity (`scoring.light_sensitivity_for_kind`): faint
galaxies are crushed under urban skies while clusters barely move, so **rankings flip
between a dark site and a city**. Endpoints accept an optional `when` (ISO date/datetime)
to plan a future night, and both planning and visibility routers validate lat/lon bounds.

> Honest note: the grid is a *modeled estimate* from city lights, not measured satellite
> data. The `.npy` is the seam where a real World Atlas / VIIRS raster drops in unchanged.
> Regenerate with `uv run python scripts/build_bortle_grid.py`.
