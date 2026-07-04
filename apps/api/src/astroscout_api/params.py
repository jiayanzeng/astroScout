"""Reusable, validated query parameters shared across routers.

Bounds are enforced by FastAPI before any handler runs, so malformed coordinates
return HTTP 422 and never reach astropy (which would otherwise crash or produce
nonsense for out-of-range inputs).
"""

from typing import Annotated

from fastapi import Query

Lat = Annotated[float, Query(ge=-90, le=90, description="Latitude in degrees")]
Lon = Annotated[float, Query(ge=-180, le=180, description="Longitude in degrees")]
When = Annotated[
    str | None,
    Query(description="Optional ISO date (2026-08-15) or datetime (2026-08-15T22:00:00) UTC"),
]
