from fastapi import HTTPException

from ..datasources.targets import TargetNotFound, UnsupportedTarget, UpstreamResolutionError


def target_resolution_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, TargetNotFound):
        return HTTPException(status_code=404, detail=exc.detail())
    if isinstance(exc, UnsupportedTarget):
        return HTTPException(status_code=422, detail=exc.detail())
    if isinstance(exc, UpstreamResolutionError):
        return HTTPException(status_code=502, detail=exc.detail())
    raise TypeError(f"unexpected target-resolution error: {type(exc).__name__}")
