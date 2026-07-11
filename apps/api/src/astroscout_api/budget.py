"""Pure integration-time budget estimation for deep-sky imaging.

The constants are community-anchored heuristics, not radiometric truth. Results are
ranges by design, and the inputs plus multiplier breakdown remain visible so callers
can present the assumptions instead of implying false precision.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from astroscout_api.bortle.calibration import BORTLE_TO_SQM

FilterKind = Literal["broadband", "dual_nb", "mono_nb"]
QualityTier = Literal["clean", "showcase"]
SkySource = Literal["sqm", "bortle-class"]

# A community round-number dark-site anchor, deliberately not a class midpoint.
REF_SQM = 21.5
REF_F_RATIO = 5.0
SNR_TIME_BASE = 2.512
SQM_CLAMP = (10.0, 25.0)

# APPROXIMATION: clean-image integration ranges at REF_SQM with an f/5 broadband rig.
BASE_HOURS_BY_KIND: dict[str, tuple[float, float]] = {
    "open cluster": (1.0, 2.0),
    "globular cluster": (1.5, 3.0),
    "planetary nebula": (2.0, 4.0),
    "emission nebula": (2.0, 4.0),
    "nebula": (2.0, 4.0),
    "galaxy": (4.0, 8.0),
    "dark nebula": (6.0, 12.0),
}
DEFAULT_BASE_HOURS: tuple[float, float] = (2.0, 4.0)
SHOWCASE_MULTIPLIER = 2.5

NON_BUDGET_KINDS = frozenset({"planet"})

# Fraction of the sky-brightness gap a filter still exposes you to, for
# emission-line targets. 1.0 = broadband (full LP exposure).
# mono_nb is DERIVED from the calibration anchor (CN 806760 #17: 3nm Ha from a
# Bortle 9 sky ~= broadband from a Bortle 4 sky), expressed against the
# reconciled crosswalk so it can never drift from BORTLE_TO_SQM again:
#   (REF_SQM - BORTLE_TO_SQM[9]) * c == (REF_SQM - BORTLE_TO_SQM[4]) * 1.0
# dual_nb has NO community anchor yet -- it is a labelled interpolation between
# broadband and mono (follow-up filed to find a datapoint). Do not rescale it.
_MONO_NB_COUPLING = (REF_SQM - BORTLE_TO_SQM[4]) / (REF_SQM - BORTLE_TO_SQM[9])
LP_COUPLING: dict[str, float] = {
    "broadband": 1.0,
    "dual_nb": 0.30,
    "mono_nb": _MONO_NB_COUPLING,
}

EMISSION_KINDS = frozenset({"emission nebula", "nebula", "planetary nebula", "dark nebula"})
MOON_WEIGHT: dict[str, float] = {"broadband": 1.0, "dual_nb": 0.35, "mono_nb": 0.15}


@dataclass(frozen=True)
class HoursEstimate:
    """Visible integration range and the assumptions that produced it."""

    low: float
    high: float
    sky_sqm: float
    sky_source: SkySource
    lp_multiplier: float
    optics_multiplier: float
    tier_multiplier: float
    filter_mismatch: bool


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def sqm_for_bortle(bortle: int) -> float:
    """Return the representative SQM for a Bortle class, clamped to 1..9."""
    normalized = max(1, min(9, bortle))
    return BORTLE_TO_SQM[normalized]


def _resolved_sky(bortle: int, sqm: float | None) -> tuple[float, SkySource]:
    if sqm is not None:
        return _clamp(sqm, *SQM_CLAMP), "sqm"
    return sqm_for_bortle(bortle), "bortle-class"


def lp_time_multiplier(
    bortle: int,
    filter_kind: FilterKind,
    kind: str,
    sqm: float | None = None,
) -> float:
    """Estimate equal-SNR time growth caused by sky brightness and filtering."""
    sky, _ = _resolved_sky(bortle, sqm)
    coupling = LP_COUPLING[filter_kind] if kind.lower() in EMISSION_KINDS else 1.0
    return float(SNR_TIME_BASE ** (max(0.0, REF_SQM - sky) * coupling))


def optics_time_multiplier(f_ratio: float) -> float:
    """Scale integration time by the square of the clamped focal-ratio change."""
    normalized = _clamp(f_ratio, 1.0, 32.0)
    return (normalized / REF_F_RATIO) ** 2


def usable_hours(
    hours_visible: float,
    moon_illumination: float,
    moon_separation_deg: float,
    filter_kind: FilterKind,
) -> float:
    """Apply a filter-weighted lunar penalty to visible imaging hours."""
    visible = max(0.0, hours_visible)
    illumination = _clamp(moon_illumination, 0.0, 1.0)
    separation = _clamp(moon_separation_deg, 0.0, 180.0)
    proximity = max(0.0, 1.0 - separation / 90.0)
    penalty = illumination * proximity * MOON_WEIGHT[filter_kind]
    return round(visible * max(0.0, 1.0 - penalty), 1)


def hours_needed(
    kind: str,
    bortle: int,
    f_ratio: float,
    filter_kind: FilterKind = "broadband",
    tier: QualityTier = "clean",
    sqm: float | None = None,
) -> HoursEstimate | None:
    """Return an honest integration range, or None for non-budget target kinds."""
    normalized_kind = kind.lower()
    if normalized_kind in NON_BUDGET_KINDS:
        return None

    base_low, base_high = BASE_HOURS_BY_KIND.get(normalized_kind, DEFAULT_BASE_HOURS)
    sky, sky_source = _resolved_sky(bortle, sqm)
    lp_multiplier = lp_time_multiplier(bortle, filter_kind, normalized_kind, sqm=sky)
    optics_multiplier = optics_time_multiplier(f_ratio)
    tier_multiplier = SHOWCASE_MULTIPLIER if tier == "showcase" else 1.0
    combined = lp_multiplier * optics_multiplier * tier_multiplier
    filter_mismatch = filter_kind != "broadband" and normalized_kind not in EMISSION_KINDS
    return HoursEstimate(
        low=round(base_low * combined, 1),
        high=round(base_high * combined, 1),
        sky_sqm=sky,
        sky_source=sky_source,
        lp_multiplier=lp_multiplier,
        optics_multiplier=optics_multiplier,
        tier_multiplier=tier_multiplier,
        filter_mismatch=filter_mismatch,
    )
