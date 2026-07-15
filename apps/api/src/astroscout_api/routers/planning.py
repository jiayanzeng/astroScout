from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from ..budget import FilterKind, QualityTier
from ..datasources.planning import (
    NoAstronomicalDarknessError,
    parse_when,
    project_target,
    rank_targets,
    target_detail,
)
from ..datasources.targets import TargetNotFound, UnsupportedTarget, UpstreamResolutionError
from ..params import FRatio, Lat, Lon, Nights, Sqm, When
from ..protection import ProjectionGuard
from .errors import target_resolution_http_error

router = APIRouter(prefix="/plan", tags=["planning"])
projection_guard = ProjectionGuard()


@router.get("/night")
def plan_night(
    lat: Lat,
    lon: Lon,
    when: When = None,
    f_ratio: FRatio | None = None,
    filter: FilterKind = "broadband",
    tier: QualityTier = "clean",
    sqm: Sqm = None,
) -> dict[str, object]:
    """Rank the built-in catalog for the upcoming astronomical night.

    Pass `when` to plan a future night instead of tonight.
    """
    try:
        parsed = parse_when(when)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return rank_targets(lat, lon, parsed, f_ratio, filter, tier, sqm)
    except NoAstronomicalDarknessError as exc:
        raise HTTPException(status_code=422, detail=exc.detail()) from exc
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
    except NoAstronomicalDarknessError as exc:
        raise HTTPException(status_code=422, detail=exc.detail()) from exc
    except (TargetNotFound, UnsupportedTarget, UpstreamResolutionError) as exc:
        raise target_resolution_http_error(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc


@router.get("/project")
async def plan_project(
    request: Request,
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
    client_key = request.client.host if request.client is not None else "unknown"
    rate = projection_guard.check_rate(client_key)
    if not rate.allowed:
        raise HTTPException(
            status_code=429,
            headers={"Retry-After": str(rate.retry_after_seconds)},
            detail={
                "code": "projection_rate_limited",
                "message": "Too many projection requests; retry later.",
            },
        )
    if not projection_guard.acquire():
        raise HTTPException(
            status_code=503,
            headers={"Retry-After": "2"},
            detail={
                "code": "projection_capacity_exceeded",
                "message": "Projection capacity is busy; retry shortly.",
            },
        )
    try:
        return await run_in_threadpool(
            project_target, name, lat, lon, f_ratio, filter, tier, parsed, nights, sqm
        )
    except NoAstronomicalDarknessError as exc:
        raise HTTPException(status_code=422, detail=exc.detail()) from exc
    except (TargetNotFound, UnsupportedTarget, UpstreamResolutionError) as exc:
        raise target_resolution_http_error(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
    finally:
        projection_guard.release()
