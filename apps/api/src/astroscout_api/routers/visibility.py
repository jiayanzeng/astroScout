from fastapi import APIRouter, HTTPException

from ..datasources.visibility import get_visibility
from ..params import Lat, Lon

router = APIRouter()


@router.get("/visibility")
def visibility(target: str, lat: Lat, lon: Lon) -> dict[str, object]:
    try:
        return get_visibility(target, lat, lon)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"{type(exc).__name__}: {exc}") from exc
