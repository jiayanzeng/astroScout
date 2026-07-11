"""Bortle class calibration against sky brightness in mag/arcsec².

This module is the single authority for the Bortle (2001) to SQM crosswalk cited
by the International Dark-Sky Association. Build and budget code must import these
values rather than restating them.
"""

from __future__ import annotations

# Inclusive lower mag/arcsec² edges of Bortle classes 1..8. Values below the final
# edge are class 9.
BORTLE_MAG_LOWER_EDGES: tuple[float, ...] = (
    22.00,
    21.75,
    21.50,
    20.50,
    19.50,
    18.50,
    17.50,
    16.00,
)

_BORTLE_9_OPEN_BAND_OFFSET = 0.5


def bortle_for_sqm(mag: float) -> int:
    """Map sky brightness in mag/arcsec² to a Bortle class from 1 through 9."""
    bortle = 1 + sum(mag < edge for edge in BORTLE_MAG_LOWER_EDGES)
    return max(1, min(9, bortle))


def _round_to_hundredth(value: float) -> float:
    """Round a positive midpoint half-up for stable two-decimal presentation."""
    return int(value * 100 + 0.5) / 100


def _build_representative_sqm() -> dict[int, float]:
    """Derive one representative SQM value for each Bortle class."""
    representatives = {1: BORTLE_MAG_LOWER_EDGES[0]}
    for bortle in range(2, 9):
        darker_edge = BORTLE_MAG_LOWER_EDGES[bortle - 2]
        brighter_edge = BORTLE_MAG_LOWER_EDGES[bortle - 1]
        representatives[bortle] = _round_to_hundredth((darker_edge + brighter_edge) / 2)

    # APPROXIMATION: class 9 is open-ended, so represent it as 0.5 mag below its edge.
    representatives[9] = BORTLE_MAG_LOWER_EDGES[-1] - _BORTLE_9_OPEN_BAND_OFFSET
    return representatives


BORTLE_TO_SQM: dict[int, float] = _build_representative_sqm()
