# Task C1a plan — calibration authority and SQM sidecar

Status: approved, implemented, and accepted on 2026-07-11. The maintainer regenerated
the production artifacts; the Bortle bytes/histogram were unchanged and the SQM sidecar
passed hash, shape/dtype, and site-reading review.

## Ground truth and invariants

- At plan approval, `scripts/build_bortle_grid_viirs.py` owned
  `BORTLE_MAG_LOWER_EDGES` and computes continuous total-sky mag/arcsec² inside
  `to_bortle`, then discards it.
- The committed `bortle_grid.npy` is the production seam. Its bytes, lookup behavior,
  shape, orientation, and histogram must not change in this task.
- `sqm_grid.npy` is not present. Runtime must therefore remain functional before the
  maintainer regenerates and commits the sidecar.
- The World Atlas GeoTIFF regeneration is a maintainer-only real-machine step. This
  implementation will not run the production build script or create either production
  `.npy` file.

## Planned changes

1. Add pure, numpy-free `bortle/calibration.py` with the published lower-edge tuple,
   `bortle_for_sqm`, and programmatically derived representative class midpoints. Keep
   the Bortle 9 value explicitly labelled as the specified open-ended approximation.
2. Refactor the World Atlas build script to import the edge tuple, retain the same
   vectorized classification, preserve Bortle output for identical inputs, and emit a
   clipped float16 SQM lattice alongside the uint8 Bortle lattice. Extend its sanity and
   file reports to show the actual sidecar values and both output artifacts.
3. Add `SQM_GRID_PATH`, cached optional loading, shared coordinate-index math, and
   `sqm_at`. Missing sidecar data returns `None`; `bortle_at` keeps the same public
   behavior.
4. Add pure tests for crosswalk self-consistency, missing-sidecar fallback, float16
   synthetic lookup, and synthetic SQM/Bortle agreement. Clear the loader caches around
   monkeypatched paths so tests do not leak state.
5. Update `STATE.md` §3 and §5 only after observed checks pass. Do not bump its version.

## Verification and stop conditions

- Run the full API gate: `uv sync`, Ruff lint/format, strict mypy, and non-integration
  pytest.
- Run the root-required web gate through direct binaries even though no web behavior is
  changing.
- Record the existing `bortle_grid.npy` SHA-256 before and after implementation; it must
  remain identical because this task does not regenerate it.
- Confirm the repository still has no generated `sqm_grid.npy` and that `sqm_at` returns
  `None` in that state.
- Maintainer regeneration must stop if the resulting Bortle histogram differs from the
  `STATE.md` histogram. Only the maintainer will generate and review `sqm_grid.npy`, its
  site readings, dtype/shape, and file hash before committing it.
