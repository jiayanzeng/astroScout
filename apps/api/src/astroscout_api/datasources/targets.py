"""Target resolution with explicit product-domain failure semantics."""

from __future__ import annotations

from astroplan import FixedTarget
from astropy.coordinates.name_resolve import NameResolveError

from .dso_catalog import CatalogObject, get


class TargetResolutionError(Exception):
    """Base class for failures while resolving an observing target."""

    code = "target_resolution_error"

    def __init__(self, target: str, message: str) -> None:
        super().__init__(message)
        self.target = target

    def detail(self) -> dict[str, str]:
        return {"code": self.code, "target": self.target, "message": str(self)}


class TargetNotFound(TargetResolutionError):
    """The upstream resolver answered successfully but did not know the name."""

    code = "target_not_found"


class UnsupportedTarget(TargetResolutionError):
    """The name is known, but this planner cannot safely handle its observing flow."""

    code = "unsupported_target"

    def __init__(self, target: str, message: str, flow: str) -> None:
        super().__init__(target, message)
        self.flow = flow

    def detail(self) -> dict[str, str]:
        return {**super().detail(), "flow": self.flow}


class UpstreamResolutionError(TargetResolutionError):
    """The CDS/Simbad name-resolution service could not be reached or failed."""

    code = "upstream_resolution_error"

    def detail(self) -> dict[str, str]:
        return {**super().detail(), "upstream": "simbad"}


def resolve_target(name: str) -> CatalogObject:
    """Resolve locally first, then through CDS/Simbad with stable domain errors."""
    target = name.strip()
    if target.casefold() in {"sun", "sol"}:
        raise UnsupportedTarget(
            target=target or name,
            message=(
                "The Sun requires a daylight and solar-safety planning flow; "
                "it is not supported by the night planner."
            ),
            flow="solar_daylight_planner_required",
        )

    obj = get(target)
    if obj is not None:
        return obj
    if not target:
        raise TargetNotFound(target=name, message="No target name was provided.")

    try:
        resolved = FixedTarget.from_name(target)
    except NameResolveError as exc:
        message = str(exc)
        if "Unable to find coordinates for name" in message:
            raise TargetNotFound(
                target=target,
                message=f"No observing target named {target!r} was found.",
            ) from exc
        raise UpstreamResolutionError(
            target=target,
            message="The Simbad target resolver is temporarily unavailable.",
        ) from exc
    except Exception as exc:
        raise UpstreamResolutionError(
            target=target,
            message="The Simbad target resolver is temporarily unavailable.",
        ) from exc

    return CatalogObject(
        name=target,
        ra_hours=float(resolved.coord.ra.hour),
        dec_deg=float(resolved.coord.dec.deg),
        kind="unknown",
        common_name=target,
    )
