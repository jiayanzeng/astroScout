from fastapi import APIRouter, HTTPException

from ..datasources.planning import parse_when, rank_targets, target_detail
from ..params import Lat, Lon, When

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
