"""Night-planning engine: dark window, per-target visibility, and ranking.

Wraps astropy/astroplan, feeds the pure scorer in scoring.py, and folds in the
observer's light pollution from the offline Bortle grid. All times UTC.
"""

from __future__ import annotations

import warnings
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import astropy.units as u
import numpy as np
from astroplan import Observer, moon_illumination
from astroplan.exceptions import TargetAlwaysUpWarning, TargetNeverUpWarning
from astropy.coordinates import (
    AltAz,
    EarthLocation,
    SkyCoord,
    get_body,
    get_sun,
)
from astropy.time import Time, TimeDelta

from ..bortle.grid import bortle_at, sqm_at
from ..budget import (
    FilterKind,
    QualityTier,
    hours_needed,
    nights_to_reach,
    usable_hours,
)
from ..scoring import (
    MIN_USEFUL_ALT,
    TargetConditions,
    light_sensitivity_for_kind,
    rate_target,
    score_target,
)
from .dso_catalog import CATALOG, CatalogObject
from .targets import resolve_target


def _observer(lat: float, lon: float) -> Observer:
    return Observer(location=EarthLocation(lat=lat * u.deg, lon=lon * u.deg, height=0 * u.m))


def _fixed_coord(obj: CatalogObject) -> SkyCoord:
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
    status: Literal["normal", "continuous_astronomical_darkness"] = "normal"

    @property
    def hours(self) -> float:
        return float((self.dawn - self.dusk).to(u.hour).value)


class NoAstronomicalDarknessError(RuntimeError):
    """The Sun never reaches astronomical darkness in the requested day."""

    def detail(self) -> dict[str, str]:
        return {
            "code": "no_astronomical_darkness",
            "message": "The Sun does not reach astronomical darkness during this 24-hour period.",
            "state": "no_astronomical_darkness",
            "flow": "daylight_or_twilight_planning_required",
        }


def classify_astronomical_darkness(
    solar_altitudes_deg: Sequence[float] | np.ndarray,
) -> Literal["normal", "no_astronomical_darkness", "continuous_astronomical_darkness"]:
    """Classify a 24-hour solar-altitude sample around the -18 degree boundary."""
    altitudes = np.asarray(solar_altitudes_deg, dtype=float)
    if altitudes.size == 0 or not np.all(np.isfinite(altitudes)):
        raise ValueError("solar altitude samples must be finite and non-empty")
    if np.all(altitudes > -18.0):
        return "no_astronomical_darkness"
    if np.all(altitudes <= -18.0):
        return "continuous_astronomical_darkness"
    return "normal"


def _masked_time(value: Time) -> bool:
    return bool(value.masked and np.any(value.mask))


def _polar_darkness_state(
    location: EarthLocation, t: Time
) -> Literal["normal", "no_astronomical_darkness", "continuous_astronomical_darkness"]:
    samples = t + TimeDelta(np.linspace(0.0, 24.0, 97) * u.hour)
    sun_altitudes = get_sun(samples).transform_to(AltAz(obstime=samples, location=location)).alt.deg
    return classify_astronomical_darkness(sun_altitudes)


def dark_window(lat: float, lon: float, when: Time | None = None) -> DarkWindow:
    """Astronomical-night window following `when` (default: now)."""
    obs = _observer(lat, lon)
    t = when or Time.now()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", TargetAlwaysUpWarning)
        warnings.simplefilter("ignore", TargetNeverUpWarning)
        dusk = obs.twilight_evening_astronomical(t, which="next")
    if _masked_time(dusk):
        state = _polar_darkness_state(obs.location, t)
        if state == "no_astronomical_darkness":
            raise NoAstronomicalDarknessError
        if state == "continuous_astronomical_darkness":
            return DarkWindow(
                dusk=t,
                dawn=t + TimeDelta(24 * u.hour),
                moon_illumination=float(moon_illumination(t)),
                status=state,
            )
        raise RuntimeError("astronomical twilight was masked despite a normal solar-altitude day")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", TargetAlwaysUpWarning)
        warnings.simplefilter("ignore", TargetNeverUpWarning)
        dawn = obs.twilight_morning_astronomical(dusk, which="next")
    if _masked_time(dawn):
        state = _polar_darkness_state(obs.location, dusk)
        if state == "continuous_astronomical_darkness":
            return DarkWindow(
                dusk=dusk,
                dawn=dusk + TimeDelta(24 * u.hour),
                moon_illumination=float(moon_illumination(dusk)),
                status=state,
            )
        raise RuntimeError("astronomical dawn was masked outside continuous darkness")
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

    # Moving bodies use Astropy's built-in solar-system ephemeris. This is
    # planning-grade rather than precision astrometry, and requires no network.
    target_coord = _fixed_coord(obj) if obj.body is None else get_body(obj.body, times, location)
    target_altaz = target_coord.transform_to(frame)
    alts = target_altaz.alt.deg

    # Hours above the useful-altitude floor during darkness.
    step_h = window.hours / (len(times) - 1)
    hours_visible = float(np.sum(alts >= MIN_USEFUL_ALT) * step_h)
    peak_alt = float(np.max(alts))

    # Moon separation at the moment the target peaks (worst-case-ish, simple).
    peak_idx = int(np.argmax(alts))
    moon = get_body("moon", times[peak_idx], location)
    target_at_peak = (
        target_coord if obj.body is None else get_body(obj.body, times[peak_idx], location)
    )
    # Compare in one frame. Fixed catalog coordinates are ICRS while ``get_body``
    # returns GCRS; separating them directly makes the answer depend on transform
    # direction and emits NonRotationTransformationWarning on every plan request.
    target_in_moon_frame = target_at_peak.transform_to(moon.frame)
    sep = float(moon.separation(target_in_moon_frame).deg)

    return TargetConditions(
        altitude_deg=round(peak_alt, 1),
        moon_illumination=round(window.moon_illumination, 2),
        moon_separation_deg=round(sep, 1),
        hours_visible=round(hours_visible, 1),
        bortle=bortle,
        light_sensitivity=light_sensitivity_for_kind(obj.kind),
        is_moon=obj.body == "moon",
    )


def _row(obj: CatalogObject, c: TargetConditions) -> dict[str, object]:
    return {
        "name": obj.name,
        "common_name": obj.common_name,
        "kind": obj.kind,
        "score": score_target(c),
        "rating": rate_target(c.altitude_deg, 0.0 if obj.body == "moon" else c.moon_illumination),
        "peak_altitude_deg": c.altitude_deg,
        "hours_visible": c.hours_visible,
        "moon_separation_deg": c.moon_separation_deg,
        "light_sensitivity": c.light_sensitivity,
    }


def _resolve_sky(lat: float, lon: float, sqm: float | None) -> tuple[float | None, str]:
    """Resolve sky brightness with explicit user > grid > class precedence."""
    if sqm is not None:
        return sqm, "user"
    grid_sqm = sqm_at(lat, lon)
    return grid_sqm, "grid" if grid_sqm is not None else "bortle-class"


def rank_targets(
    lat: float,
    lon: float,
    when: Time | None = None,
    f_ratio: float | None = None,
    filter_kind: FilterKind = "broadband",
    tier: QualityTier = "clean",
    sqm: float | None = None,
) -> dict[str, object]:
    """Rank the built-in catalog for the upcoming night at this location."""
    window = dark_window(lat, lon, when)
    bortle = bortle_at(lat, lon)
    sky_sqm: float | None = None
    sky_source: str | None = None
    if f_ratio is not None:
        sky_sqm, sky_source = _resolve_sky(lat, lon, sqm)

    rows: list[dict[str, object]] = []
    for obj in CATALOG:
        row = _row(obj, conditions_for(obj, lat, lon, window, bortle))
        if f_ratio is not None:
            estimate = hours_needed(obj.kind, bortle, f_ratio, filter_kind, tier, sqm=sky_sqm)
            row.update(
                {
                    "hours_needed_low": estimate.low if estimate is not None else None,
                    "hours_needed_high": estimate.high if estimate is not None else None,
                    "filter_mismatch": (estimate.filter_mismatch if estimate is not None else None),
                    "budget_applicable": estimate is not None,
                }
            )
        rows.append(row)
    rows.sort(key=lambda r: r["score"], reverse=True)  # type: ignore[arg-type, return-value]
    result: dict[str, object] = {
        "dusk_utc": str(window.dusk.iso),
        "dawn_utc": str(window.dawn.iso),
        "dark_hours": round(window.hours, 1),
        "moon_illumination": round(window.moon_illumination, 2),
        "bortle": bortle,
        "targets": rows,
    }
    if window.status != "normal":
        result["dark_window_status"] = window.status
    if f_ratio is not None:
        result.update({"sky_sqm": sky_sqm, "sky_source": sky_source})
    return result


def target_detail(name: str, lat: float, lon: float, when: Time | None = None) -> dict[str, object]:
    """Full conditions for one target (catalog first, else Simbad)."""
    obj = resolve_target(name)
    window = dark_window(lat, lon, when)
    bortle = bortle_at(lat, lon)
    c = conditions_for(obj, lat, lon, window, bortle)
    result: dict[str, object] = {
        **_row(obj, c),
        "dark_hours": round(window.hours, 1),
        "moon_illumination": round(window.moon_illumination, 2),
        "bortle": bortle,
    }
    if window.status != "normal":
        result["dark_window_status"] = window.status
    return result


def project_target(
    name: str,
    lat: float,
    lon: float,
    f_ratio: float,
    filter_kind: FilterKind,
    tier: QualityTier,
    when: Time | None = None,
    nights: int = 30,
    sqm: float | None = None,
) -> dict[str, object]:
    """Project one target over consecutive nights and estimate completion.

    This performs one ``conditions_for`` calculation per night. The 30-night
    default is roughly twice the cost of one ``rank_targets`` call; the router's
    60-night validation bound limits that work.
    """
    obj = resolve_target(name)
    bortle = bortle_at(lat, lon)
    sky_sqm, sky_source = _resolve_sky(lat, lon, sqm)
    estimate = hours_needed(obj.kind, bortle, f_ratio, filter_kind, tier, sqm=sky_sqm)

    anchor = when if when is not None else Time.now()
    projected: list[dict[str, object]] = []
    usable_by_night: list[float] = []
    previous_dusk: Time | None = None
    extra_days = 0

    for night_index in range(nights):
        night_anchor = anchor + TimeDelta((night_index + extra_days) * u.day)
        window = dark_window(lat, lon, night_anchor)
        if previous_dusk is not None and window.dusk == previous_dusk:
            extra_days += 1
            night_anchor = anchor + TimeDelta((night_index + extra_days) * u.day)
            window = dark_window(lat, lon, night_anchor)

        conditions = conditions_for(obj, lat, lon, window, bortle)
        usable = (
            conditions.hours_visible
            if obj.body == "moon"
            else usable_hours(
                conditions.hours_visible,
                conditions.moon_illumination,
                conditions.moon_separation_deg,
                filter_kind,
            )
        )
        usable_by_night.append(usable)
        projected_night: dict[str, object] = {
            "date": str(window.dusk.utc.isot)[:10],
            "dusk_utc": str(window.dusk.utc.isot),
            "dawn_utc": str(window.dawn.utc.isot),
            "dark_hours": round(window.hours, 1),
            "moon_illumination": conditions.moon_illumination,
            "moon_separation_deg": conditions.moon_separation_deg,
            "hours_visible": conditions.hours_visible,
            "usable_hours": usable,
        }
        if window.status != "normal":
            projected_night["dark_window_status"] = window.status
        projected.append(projected_night)
        previous_dusk = window.dusk

    best_index = max(range(len(usable_by_night)), key=usable_by_night.__getitem__)
    best_night = projected[best_index]["date"]
    budget_applicable = estimate is not None
    return {
        "target": obj.name,
        "common_name": obj.common_name,
        "kind": obj.kind,
        "bortle": bortle,
        "sky_sqm": sky_sqm,
        "sky_source": sky_source,
        "filter_kind": filter_kind,
        "tier": tier,
        "f_ratio": f_ratio,
        "hours_needed": (
            {"low": estimate.low, "high": estimate.high} if estimate is not None else None
        ),
        "filter_mismatch": estimate.filter_mismatch if estimate is not None else None,
        "budget_applicable": budget_applicable,
        "nights": projected,
        "nights_to_finish": (
            {
                "low": nights_to_reach(usable_by_night, estimate.low),
                "high": nights_to_reach(usable_by_night, estimate.high),
            }
            if estimate is not None
            else None
        ),
        "horizon_nights": nights,
        "best_night": best_night,
    }
