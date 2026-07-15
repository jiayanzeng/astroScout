"""Pure scoring/quality helpers for observation planning.

Zero external dependencies and no network — this is the deterministic core that
CI unit-tests. The astropy-backed code in datasources/ feeds these numbers, and
the Bortle lookup in bortle/ supplies the light-pollution context.
"""

from __future__ import annotations

from dataclasses import dataclass

# Rating thresholds (degrees / fractions). Tunable in one place.
MIN_USEFUL_ALT = 20.0
GOOD_ALT = 40.0
BRIGHT_MOON = 0.7
CLOSE_MOON_DEG = 30.0

# Light pollution: at the worst Bortle (9), a maximally light-sensitive object
# (light_sensitivity = 1.0) loses up to this fraction of its score.
LP_MAX_IMPACT = 0.8

# How strongly light pollution washes out each object kind (0 = robust like a
# bright cluster, 1 = fragile like a faint galaxy or dark nebula). Driven by
# surface brightness: concentrated stars survive a bright sky; diffuse low
# surface-brightness objects do not.
_SENSITIVITY_BY_KIND: dict[str, float] = {
    "planet": 0.0,
    "moon": 0.0,
    "open cluster": 0.15,
    "globular cluster": 0.25,
    "planetary nebula": 0.30,
    "emission nebula": 0.55,
    "nebula": 0.55,
    "galaxy": 0.90,
    "dark nebula": 1.00,
}
DEFAULT_SENSITIVITY = 0.55


def light_sensitivity_for_kind(kind: str) -> float:
    """Map an object kind to how much light pollution degrades it (0..1)."""
    return _SENSITIVITY_BY_KIND.get(kind.lower(), DEFAULT_SENSITIVITY)


def light_pollution_factor(bortle: int, sensitivity: float) -> float:
    """Multiplicative score factor in [1 - LP_MAX_IMPACT, 1].

    Bortle 1 (pristine) -> 1.0 for everything. Higher Bortle penalizes in
    proportion to the object's sensitivity, so clusters barely move while faint
    galaxies are crushed in urban skies.
    """
    b = max(1, min(9, bortle))
    s = max(0.0, min(1.0, sensitivity))
    lp = (b - 1) / 8.0  # 0 at Bortle 1, 1 at Bortle 9
    return 1.0 - LP_MAX_IMPACT * lp * s


@dataclass(frozen=True)
class TargetConditions:
    """Everything the scorer needs about one target at one moment."""

    altitude_deg: float
    moon_illumination: float  # 0..1
    moon_separation_deg: float  # angular distance from the Moon
    hours_visible: float  # hours above MIN_USEFUL_ALT during the dark window
    bortle: int = 4  # observer sky brightness, 1 (pristine) .. 9 (inner city)
    light_sensitivity: float = 0.5  # how much light pollution degrades this object
    is_moon: bool = False  # lunar observing is not penalized by the Moon itself


def rate_target(altitude_deg: float, moon_illumination: float) -> str:
    """Coarse 3-bucket rating (kept for the simple /visibility endpoint)."""
    if altitude_deg < MIN_USEFUL_ALT:
        return "poor"
    if moon_illumination > BRIGHT_MOON and altitude_deg < GOOD_ALT:
        return "marginal"
    if altitude_deg >= GOOD_ALT:
        return "good"
    return "marginal"


def score_target(c: TargetConditions) -> float:
    """Continuous 0-100 score for ranking targets on a given night.

    Combines altitude (extinction), how long it stays up, moon interference, and
    light pollution scaled by the object's surface-brightness sensitivity.
    Deterministic and monotonic in the obvious directions.
    """
    if c.altitude_deg < MIN_USEFUL_ALT:
        return 0.0

    # Altitude term: 0 at the horizon-ish floor, ~1 by 60 deg.
    alt_term = min(1.0, (c.altitude_deg - MIN_USEFUL_ALT) / (60.0 - MIN_USEFUL_ALT))

    # Time-up term: saturates at 6h of usable darkness on target.
    time_term = min(1.0, c.hours_visible / 6.0)

    # Moon term: penalty grows with illumination and shrinks with separation.
    proximity = max(0.0, 1.0 - c.moon_separation_deg / 90.0)
    moon_penalty = 0.0 if c.is_moon else c.moon_illumination * proximity
    moon_term = max(0.0, 1.0 - moon_penalty)

    base = 100.0 * (0.45 * alt_term + 0.30 * time_term + 0.25 * moon_term)
    score = base * light_pollution_factor(c.bortle, c.light_sensitivity)
    return round(score, 1)


def rank(conditions: dict[str, TargetConditions]) -> list[tuple[str, float]]:
    """Rank target-name -> conditions, best first."""
    scored = [(name, score_target(c)) for name, c in conditions.items()]
    scored.sort(key=lambda kv: kv[1], reverse=True)
    return scored
