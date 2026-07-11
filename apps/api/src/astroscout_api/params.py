"""Reusable, validated query parameters shared across routers.

Bounds are enforced by FastAPI before any handler runs, so malformed coordinates
return HTTP 422 and never reach astropy (which would otherwise crash or produce
nonsense for out-of-range inputs).
"""

from typing import Annotated

from fastapi import Query

Lat = Annotated[float, Query(ge=-90, le=90, description="Latitude in degrees")]
Lon = Annotated[float, Query(ge=-180, le=180, description="Longitude in degrees")]
FRatio = Annotated[float, Query(gt=0, le=32, description="Optics focal ratio, e.g. 5.6")]
Nights = Annotated[int, Query(ge=1, le=60, description="Projection horizon in nights")]
Sqm = Annotated[
    float | None,
    Query(
        ge=15.0,
        le=22.1,
        description="Measured sky brightness (mag/arcsec^2); overrides the grid",
    ),
]
When = Annotated[
    str | None,
    Query(description="Optional ISO date (2026-08-15) or datetime (2026-08-15T22:00:00) UTC"),
]
