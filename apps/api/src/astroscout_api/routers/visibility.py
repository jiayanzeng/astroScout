from fastapi import APIRouter, HTTPException

from ..datasources.targets import TargetNotFound, UnsupportedTarget, UpstreamResolutionError
from ..datasources.visibility import get_visibility
from ..params import Lat, Lon
from .errors import target_resolution_http_error

router = APIRouter()


@router.get("/visibility")
def visibility(target: str, lat: Lat, lon: Lon) -> dict[str, object]:
    try:
        return get_visibility(target, lat, lon)
    except (TargetNotFound, UnsupportedTarget, UpstreamResolutionError) as exc:
        raise target_resolution_http_error(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
