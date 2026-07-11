"""A small built-in catalog of popular deep-sky objects and bright planets.

Fixed-object coordinates are J2000 (RA hours, Dec degrees). Moving bodies carry an
Astropy body name instead; their RA/Dec fields are unused placeholders. Keeping a
local catalog means the planner works offline and fast, while Simbad resolution
stays available for anything not listed here.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CatalogObject:
    name: str
    ra_hours: float
    dec_deg: float
    kind: str
    common_name: str
    body: str | None = None


CATALOG: tuple[CatalogObject, ...] = (
    CatalogObject("M31", 0.712, 41.27, "galaxy", "Andromeda Galaxy"),
    CatalogObject("M42", 5.588, -5.39, "emission nebula", "Orion Nebula"),
    CatalogObject("M45", 3.790, 24.11, "open cluster", "Pleiades"),
    CatalogObject("M51", 13.498, 47.20, "galaxy", "Whirlpool Galaxy"),
    CatalogObject("M13", 16.695, 36.46, "globular cluster", "Hercules Cluster"),
    CatalogObject("M81", 9.926, 69.07, "galaxy", "Bode's Galaxy"),
    CatalogObject("M101", 14.053, 54.35, "galaxy", "Pinwheel Galaxy"),
    CatalogObject("M27", 19.994, 22.72, "planetary nebula", "Dumbbell Nebula"),
    CatalogObject("M57", 18.893, 33.03, "planetary nebula", "Ring Nebula"),
    CatalogObject("NGC7000", 20.979, 44.53, "emission nebula", "North America Nebula"),
    CatalogObject("NGC869", 2.317, 57.13, "open cluster", "Double Cluster"),
    CatalogObject("IC434", 5.683, -2.46, "dark nebula", "Horsehead Nebula"),
    CatalogObject("M8", 18.060, -24.38, "emission nebula", "Lagoon Nebula"),
    CatalogObject("M20", 18.045, -23.03, "emission nebula", "Trifid Nebula"),
    CatalogObject("M104", 12.667, -11.62, "galaxy", "Sombrero Galaxy"),
    CatalogObject("Jupiter", 0.0, 0.0, "planet", "Jupiter", body="jupiter"),
    CatalogObject("Saturn", 0.0, 0.0, "planet", "Saturn", body="saturn"),
    CatalogObject("Mars", 0.0, 0.0, "planet", "Mars", body="mars"),
    CatalogObject("Venus", 0.0, 0.0, "planet", "Venus", body="venus"),
)

BY_NAME: dict[str, CatalogObject] = {obj.name.upper(): obj for obj in CATALOG}


def get(name: str) -> CatalogObject | None:
    return BY_NAME.get(name.upper().replace(" ", ""))
