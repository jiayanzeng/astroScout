"""Regenerate the offline Bortle grid from the city model.

    uv run python scripts/build_bortle_grid.py

Writes bortle_grid.npy next to the bortle package. Re-run after editing
cities.py or the model. To use real survey data instead, produce a uint8 grid of
the same shape/orientation and save it to the same path — no other code changes.
"""

from __future__ import annotations

import numpy as np

from astroscout_api.bortle.grid import GRID_PATH, build_grid


def main() -> int:
    grid = build_grid()
    np.save(GRID_PATH, grid)
    vals, counts = np.unique(grid, return_counts=True)
    print(f"wrote {GRID_PATH} ({GRID_PATH.stat().st_size / 1024:.0f} KB), shape {grid.shape}")
    for v, c in zip(vals, counts, strict=True):
        print(f"  Bortle {int(v)}: {100 * c / grid.size:5.1f}% of cells")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
