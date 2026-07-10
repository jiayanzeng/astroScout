# AGENTS.md — apps/api

Python API (`astroscout_api`). Read the repo-root `AGENTS.md` and `STATE.md` first; this
file covers only API-local specifics.

## Tooling

- **uv** + Python 3.12, src layout, package `astroscout_api`, hatchling backend.
- **ruff**: rules `E/F/I/UP/B`, line-length **100**, `astroscout_api` is first-party
  (import order: `__future__` → stdlib → third-party → `astroscout_api`).
- **mypy**: `strict`, run on `src` only. Scripts are not type-checked but must stay
  ruff-clean.

## Verify (from `apps/api/`)

`uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy src` ·
`uv run pytest -m "not integration"`. Tests marked `@pytest.mark.integration` (live network
/ astropy compute) are excluded from CI — don't run them in the sandbox.

## Bortle subsystem (`bortle/`)

- **`grid.py::bortle_at(lat,lon)`** is the O(1) runtime lookup (`row=(90-lat)/res`,
  `col=(lon+180)/res`, clamped). It is data-source-agnostic — **do not change it when the
  grid data changes.**
- **`bortle_grid.npy`** (uint8, 720×1440, 0.25°) is committed and is the production grid,
  **World Atlas 2015-derived** via `scripts/build_bortle_grid_viirs.py` (75th-percentile
  `Resampling.q3`). `scripts/build_bortle_grid.py` regenerates the **city-model fallback**
  only — not the production grid.
- **`model.py`** is the offline modeled fallback (Walker-law falloff), not the production
  grid. Keep its `HONEST FRAMING` docstring consistent with STATE.md §3.
- Regenerate the production grid (build-only rasterio) only when a task asks:
  `uv run --with rasterio python scripts/build_bortle_grid_viirs.py --src <geotiff> --units mcd`
  then report SHA-256 + city readings + histogram.
- Calibration authority: `BORTLE_MAG_LOWER_EDGES` in `build_bortle_grid_viirs.py`. A future
  `budget.py` (Track C) must derive its `BORTLE_TO_SQM` from it, not choose its own midpoints.

## Known limitation — don't re-litigate

City-core Bortle is **resolution-limited at 0.25°** (~27 km cells): NYC / London / Tokyo /
Delhi / Cairo all read **Bortle 7** under *any* aggregation (city model, `average`, and
`q3` all agree). This is a documented, measured outcome, **not** a bug to fix by swapping
the resampling mode. A finer lattice is the only real lever, and that is a separate future
task with its own scope.
