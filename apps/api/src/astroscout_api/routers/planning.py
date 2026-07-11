from fastapi import APIRouter, HTTPException

from ..budget import FilterKind, QualityTier
from ..datasources.planning import parse_when, project_target, rank_targets, target_detail
from ..params import FRatio, Lat, Lon, Nights, Sqm, When

router = APIRouter(prefix="/plan", tags=["planning"])


@router.get("/night")
def plan_night(lat: Lat, lon: Lon, when: When = None) -> dict[str, object]:
    """Rank the built-in catalog for the upcoming astronomical night.

    Pass `when` to plan a future night instead of tonight.
    """
    try:
        parsed = parse_when(when)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return rank_targets(lat, lon, parsed)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc


@router.get("/target")
def plan_target(name: str, lat: Lat, lon: Lon, when: When = None) -> dict[str, object]:
    """Detailed night conditions for one target (catalog or Simbad)."""
    try:
        parsed = parse_when(when)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return target_detail(name, lat, lon, parsed)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc


@router.get("/project")
def plan_project(
    name: str,
    lat: Lat,
    lon: Lon,
    f_ratio: FRatio,
    filter: FilterKind = "broadband",
    tier: QualityTier = "clean",
    when: When = None,
    nights: Nights = 30,
    sqm: Sqm = None,
) -> dict[str, object]:
    """Project one target across a bounded multi-night horizon."""
    try:
        parsed = parse_when(when)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return project_target(name, lat, lon, f_ratio, filter, tier, parsed, nights, sqm)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
