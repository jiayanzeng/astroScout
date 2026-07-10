"""Precomputed global Bortle grid: committed data with O(1) lookups.

The grid is a uint8 array over a regular lat/lon lattice, persisted as a compact
.npy binary committed alongside the package. Runtime lookup is pure index
arithmetic — constant time, independent of how the grid was produced. The current
.npy is World Atlas 2015-derived; build_grid() remains the city-model fallback.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from .cities import CITIES
from .model import (
    BORTLE_LOG_THRESHOLDS,
    DISTANCE_OFFSET_KM,
    FALLOFF_EXPONENT,
)

GRID_RESOLUTION_DEG = 0.25
GRID_PATH = Path(__file__).resolve().parent / "bortle_grid.npy"

_EARTH_RADIUS_KM = 6371.0
_THRESHOLDS = np.array(BORTLE_LOG_THRESHOLDS, dtype=np.float64)


def _haversine_vec(
    lat: NDArray[np.float64],
    lon: NDArray[np.float64],
    clat: float,
    clon: float,
) -> NDArray[np.float64]:
    p1 = np.radians(lat)
    p2 = np.radians(clat)
    dphi = np.radians(clat - lat)
    dlmb = np.radians(clon - lon)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    out: NDArray[np.float64] = 2 * _EARTH_RADIUS_KM * np.arcsin(np.minimum(1.0, np.sqrt(a)))
    return out


def build_grid(resolution_deg: float = GRID_RESOLUTION_DEG) -> NDArray[np.uint8]:
    """Generate the global Bortle grid from the city model (vectorized)."""
    nlat = int(round(180.0 / resolution_deg))
    nlon = int(round(360.0 / resolution_deg))
    lats = 90.0 - (np.arange(nlat) + 0.5) * resolution_deg
    lons = -180.0 + (np.arange(nlon) + 0.5) * resolution_deg
    lon_grid, lat_grid = np.meshgrid(lons, lats)

    index = np.zeros((nlat, nlon), dtype=np.float64)
    for c in CITIES:
        d = _haversine_vec(lat_grid, lon_grid, c.lat, c.lon)
        index += c.population / ((d + DISTANCE_OFFSET_KM) ** FALLOFF_EXPONENT)

    x = np.log10(index + 1.0)
    bortle = 1 + np.searchsorted(_THRESHOLDS, x, side="right")
    return np.clip(bortle, 1, 9).astype(np.uint8)


@lru_cache(maxsize=1)
def load_grid() -> NDArray[np.uint8]:
    """Load the committed grid (memory-mapped, cached)."""
    grid: NDArray[np.uint8] = np.load(GRID_PATH, mmap_mode="r")
    return grid


def bortle_at(lat: float, lon: float) -> int:
    """O(1) Bortle lookup for an observer location."""
    grid = load_grid()
    nlat, nlon = grid.shape
    res_lat = 180.0 / nlat
    res_lon = 360.0 / nlon
    row = int((90.0 - lat) / res_lat)
    col = int((lon + 180.0) / res_lon)
    row = max(0, min(nlat - 1, row))
    col = max(0, min(nlon - 1, col))
    return int(grid[row, col])
