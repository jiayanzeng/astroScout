"""Pure light-pollution model: estimate a Bortle class (1-9) from city lights.

HONEST FRAMING: this is a *modeled estimate* derived from a curated set of major
cities (cities.py), NOT measured satellite data (e.g. the World Atlas of Artificial
Night Sky Brightness or VIIRS). It is designed so the precomputed grid file can be
swapped for a real raster later without changing any calling code (see grid.py).

The model: each city contributes artificial sky glow that falls off with distance
following an inverse-power law (Walker's law, exponent ~2.5). Contributions are
summed, then the aggregate index is mapped to a Bortle class via calibrated
log-scale thresholds. Pure and unit-tested.
"""

from __future__ import annotations

import math

from .cities import CITIES, City

# Walker-law falloff: glow ~ population / (distance_km + OFFSET) ** EXPONENT.
FALLOFF_EXPONENT = 2.5
DISTANCE_OFFSET_KM = 8.0  # avoids a singularity at a city's center (~core radius)

# log10(index+1) breakpoints separating Bortle classes 1..9 (ascending).
# Calibrated so dense city cores land at 8-9 and remote sites at 1-2.
BORTLE_LOG_THRESHOLDS: tuple[float, ...] = (0.6, 1.1, 1.6, 2.1, 2.7, 3.3, 4.0, 4.7)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def light_index_at(lat: float, lon: float, cities: tuple[City, ...] = CITIES) -> float:
    """Aggregate artificial-light index at a point (higher = brighter sky)."""
    total = 0.0
    for c in cities:
        d = haversine_km(lat, lon, c.lat, c.lon)
        total += c.population / ((d + DISTANCE_OFFSET_KM) ** FALLOFF_EXPONENT)
    return total


def index_to_bortle(index: float) -> int:
    """Map a light index to a Bortle class in [1, 9]."""
    x = math.log10(max(0.0, index) + 1.0)
    bortle = 1 + sum(1 for t in BORTLE_LOG_THRESHOLDS if x >= t)
    return max(1, min(9, bortle))


def bortle_for_point(lat: float, lon: float) -> int:
    """Convenience: model a single point directly (used to validate the grid)."""
    return index_to_bortle(light_index_at(lat, lon))
