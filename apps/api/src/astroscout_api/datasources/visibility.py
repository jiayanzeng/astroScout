"""Sky-position and sky-condition adapters (astropy + astroplan). All times UTC."""

from __future__ import annotations

import astropy.units as u
from astroplan import FixedTarget, Observer, moon_illumination
from astropy.coordinates import EarthLocation
from astropy.time import Time

from ..scoring import rate_target


def _observer(lat: float, lon: float) -> Observer:
    return Observer(location=EarthLocation(lat=lat * u.deg, lon=lon * u.deg, height=0 * u.m))


def get_visibility(target: str, lat: float, lon: float) -> dict[str, object]:
    """Current altitude/azimuth, next meridian transit, and an imaging rating."""
    obs = _observer(lat, lon)
    tgt = FixedTarget.from_name(target)  # resolves via Simbad
    now = Time.now()
    altaz = obs.altaz(now, tgt)
    transit = obs.target_meridian_transit_time(now, tgt, which="next")
    alt = float(altaz.alt.deg)
    illum = float(moon_illumination(now))
    return {
        "target": target,
        "altitude_deg": round(alt, 1),
        "azimuth_deg": round(float(altaz.az.deg), 1),
        "is_up": bool(obs.target_is_up(now, tgt)),
        "next_transit_utc": str(transit.iso),
        "moon_illumination": round(illum, 2),
        "rating": rate_target(alt, illum),
    }


def get_darkness(lat: float, lon: float) -> dict[str, object]:
    """Sunset, astronomical dusk, and moon illumination — 'is it dark / worth it'."""
    obs = _observer(lat, lon)
    now = Time.now()
    return {
        "sunset_utc": str(obs.sun_set_time(now, which="next").iso),
        "astro_dusk_utc": str(obs.twilight_evening_astronomical(now, which="next").iso),
        "moon_illumination": round(float(moon_illumination(now)), 2),
    }
