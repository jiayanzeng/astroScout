"""Night-planning engine: dark window, per-target visibility, and ranking.

Wraps astropy/astroplan, feeds the pure scorer in scoring.py, and folds in the
observer's light pollution from the offline Bortle grid. All times UTC.
"""

from __future__ import annotations

from dataclasses import dataclass

import astropy.units as u
import numpy as np
from astroplan import Observer, moon_illumination
from astropy.coordinates import (
    AltAz,
    EarthLocation,
    SkyCoord,
    get_body,
)
from astropy.time import Time, TimeDelta

from ..bortle.grid import bortle_at
from ..scoring import (
    MIN_USEFUL_ALT,
    TargetConditions,
    light_sensitivity_for_kind,
    rate_target,
    score_target,
)
from .dso_catalog import CATALOG, CatalogObject, get


def _observer(lat: float, lon: float) -> Observer:
    return Observer(location=EarthLocation(lat=lat * u.deg, lon=lon * u.deg, height=0 * u.m))


def _coord(obj: CatalogObject) -> SkyCoord:
    return SkyCoord(ra=obj.ra_hours * u.hourangle, dec=obj.dec_deg * u.deg)


def parse_when(when: str | None) -> Time | None:
    """Parse an optional ISO date/datetime into a UTC astropy Time.

    A date-only string ('2026-08-15') is anchored at 12:00 UTC so the planner
    targets the upcoming evening rather than the early hours of that calendar day.
    Raises ValueError on malformed input (routers translate this to HTTP 422).
    """
    if when is None:
        return None
    s = when.strip()
    if not s:
        return None
    if "T" not in s and " " not in s:
        s = f"{s}T12:00:00"
    try:
        return Time(s, scale="utc")
    except Exception as exc:  # astropy raises various types for bad input
        raise ValueError(f"invalid datetime {when!r}: {exc}") from exc


@dataclass(frozen=True)
class DarkWindow:
    dusk: Time  # astronomical dusk (evening)
    dawn: Time  # astronomical dawn (next morning)
    moon_illumination: float

    @property
    def hours(self) -> float:
        return float((self.dawn - self.dusk).to(u.hour).value)


def dark_window(lat: float, lon: float, when: Time | None = None) -> DarkWindow:
    """Astronomical-night window following `when` (default: now)."""
    obs = _observer(lat, lon)
    t = when or Time.now()
    dusk = obs.twilight_evening_astronomical(t, which="next")
    dawn = obs.twilight_morning_astronomical(dusk, which="next")
    return DarkWindow(dusk=dusk, dawn=dawn, moon_illumination=float(moon_illumination(dusk)))


def _grid(window: DarkWindow, step_minutes: int = 20) -> Time:
    """Time samples across the dark window (inclusive of endpoints)."""
    n = max(2, int(round(window.hours * 60 / step_minutes)) + 1)
    offsets = np.linspace(0.0, window.hours, n) * u.hour
    return window.dusk + TimeDelta(offsets)


def conditions_for(
    obj: CatalogObject, lat: float, lon: float, window: DarkWindow, bortle: int
) -> TargetConditions:
    """Compute peak altitude, hours visible, moon separation, and light context."""
    location = EarthLocation(lat=lat * u.deg, lon=lon * u.deg, height=0 * u.m)
    times = _grid(window)
    frame = AltAz(obstime=times, location=location)

    target_altaz = _coord(obj).transform_to(frame)
    alts = target_altaz.alt.deg

    # Hours above the useful-altitude floor during darkness.
    step_h = window.hours / (len(times) - 1)
    hours_visible = float(np.sum(alts >= MIN_USEFUL_ALT) * step_h)
    peak_alt = float(np.max(alts))

    # Moon separation at the moment the target peaks (worst-case-ish, simple).
    peak_idx = int(np.argmax(alts))
    moon = get_body("moon", times[peak_idx], location)
    sep = float(moon.separation(_coord(obj)).deg)

    return TargetConditions(
        altitude_deg=round(peak_alt, 1),
        moon_illumination=round(window.moon_illumination, 2),
        moon_separation_deg=round(sep, 1),
        hours_visible=round(hours_visible, 1),
        bortle=bortle,
        light_sensitivity=light_sensitivity_for_kind(obj.kind),
    )


def _row(obj: CatalogObject, c: TargetConditions) -> dict[str, object]:
    return {
        "name": obj.name,
        "common_name": obj.common_name,
        "kind": obj.kind,
        "score": score_target(c),
        "rating": rate_target(c.altitude_deg, c.moon_illumination),
        "peak_altitude_deg": c.altitude_deg,
        "hours_visible": c.hours_visible,
        "moon_separation_deg": c.moon_separation_deg,
        "light_sensitivity": c.light_sensitivity,
    }


def rank_targets(lat: float, lon: float, when: Time | None = None) -> dict[str, object]:
    """Rank the built-in catalog for the upcoming night at this location."""
    window = dark_window(lat, lon, when)
    bortle = bortle_at(lat, lon)
    rows = [_row(obj, conditions_for(obj, lat, lon, window, bortle)) for obj in CATALOG]
    rows.sort(key=lambda r: r["score"], reverse=True)  # type: ignore[arg-type, return-value]
    return {
        "dusk_utc": str(window.dusk.iso),
        "dawn_utc": str(window.dawn.iso),
        "dark_hours": round(window.hours, 1),
        "moon_illumination": round(window.moon_illumination, 2),
        "bortle": bortle,
        "targets": rows,
    }


def target_detail(name: str, lat: float, lon: float, when: Time | None = None) -> dict[str, object]:
    """Full conditions for one target (catalog first, else Simbad)."""
    obj = get(name)
    if obj is None:
        from astroplan import FixedTarget

        ft = FixedTarget.from_name(name)
        obj = CatalogObject(
            name=name,
            ra_hours=float(ft.coord.ra.hour),
            dec_deg=float(ft.coord.dec.deg),
            kind="unknown",
            common_name=name,
        )
    window = dark_window(lat, lon, when)
    bortle = bortle_at(lat, lon)
    c = conditions_for(obj, lat, lon, window, bortle)
    return {
        **_row(obj, c),
        "dark_hours": round(window.hours, 1),
        "moon_illumination": round(window.moon_illumination, 2),
        "bortle": bortle,
    }
