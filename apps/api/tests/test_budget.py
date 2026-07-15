import pytest

from astroscout_api.budget import (
    LP_COUPLING,
    REF_SQM,
    SNR_TIME_BASE,
    hours_needed,
    lp_time_multiplier,
    nights_to_reach,
    optics_time_multiplier,
    sqm_for_bortle,
    usable_hours,
)


def test_nights_to_reach_empty_and_all_zero_horizons() -> None:
    assert nights_to_reach([], 1.0) is None
    assert nights_to_reach([0.0, 0.0, 0.0], 1.0) is None
    assert nights_to_reach([0.0], 0.0) == 1


def test_nights_to_reach_exact_boundary_is_one_based() -> None:
    assert nights_to_reach([1.5, 2.5, 3.0], 4.0) == 2


def test_nights_to_reach_returns_none_for_insufficient_horizon() -> None:
    assert nights_to_reach([1.0, 2.0, 3.0], 6.1) is None


def test_sqm_formula_identity_and_bortle_is_ignored_for_override() -> None:
    bright = lp_time_multiplier(4, "broadband", "galaxy", sqm=18.53)
    dark = lp_time_multiplier(4, "broadband", "galaxy", sqm=20.6)
    assert bright / dark == pytest.approx(SNR_TIME_BASE**2.07, rel=1e-3)
    assert lp_time_multiplier(1, "broadband", "galaxy", sqm=18.53) == bright
    assert lp_time_multiplier(9, "broadband", "galaxy", sqm=18.53) == bright


def test_class_midpoint_ratio_uses_authoritative_crosswalk() -> None:
    b7 = lp_time_multiplier(7, "broadband", "galaxy")
    b4 = lp_time_multiplier(4, "broadband", "galaxy")
    expected = SNR_TIME_BASE ** (sqm_for_bortle(4) - sqm_for_bortle(7))
    assert b7 / b4 == pytest.approx(expected, rel=1e-12)


def test_broadband_hours_are_monotonic_as_bortle_worsens() -> None:
    lows = []
    for bortle in range(1, 10):
        estimate = hours_needed("galaxy", bortle, 5.0)
        assert estimate is not None
        lows.append(estimate.low)
    assert lows == sorted(lows)


def test_faster_optics_never_increase_hours() -> None:
    fast = hours_needed("galaxy", 5, 4.0)
    slow = hours_needed("galaxy", 5, 8.0)
    assert fast is not None and slow is not None
    assert fast.low <= slow.low
    assert fast.high <= slow.high


def test_sky_at_or_darker_than_reference_has_no_lp_penalty() -> None:
    assert lp_time_multiplier(1, "broadband", "galaxy", sqm=REF_SQM) == 1.0
    assert lp_time_multiplier(1, "broadband", "galaxy", sqm=22.0) == 1.0
    assert lp_time_multiplier(1, "broadband", "galaxy", sqm=25.0) == 1.0


def test_mono_nb_calibration_identity() -> None:
    # This validates derivation wiring; the physics is checked by the human table row.
    mono_b9 = lp_time_multiplier(9, "mono_nb", "emission nebula")
    broadband_b4 = lp_time_multiplier(4, "broadband", "emission nebula")
    assert mono_b9 == pytest.approx(broadband_b4, rel=1e-9)


def test_dual_nb_remains_the_labelled_unanchored_interpolation() -> None:
    assert LP_COUPLING["dual_nb"] == 0.30


def test_narrowband_mismatch_falls_back_to_broadband_for_galaxy() -> None:
    dual = hours_needed("galaxy", 7, 5.0, "dual_nb")
    broadband = hours_needed("galaxy", 7, 5.0, "broadband")
    assert dual is not None and broadband is not None
    assert dual.filter_mismatch is True
    assert dual.lp_multiplier == broadband.lp_multiplier
    assert dual.low == broadband.low
    assert dual.high == broadband.high


def test_optics_multiplier_inverse_speed_ratios() -> None:
    assert optics_time_multiplier(8.0) / optics_time_multiplier(4.0) == 4.0
    assert optics_time_multiplier(10.0) / optics_time_multiplier(5.0) == 4.0


def test_usable_hours_applies_filter_weighted_moon_penalty() -> None:
    assert usable_hours(10.0, 1.0, 0.0, "broadband") == 0.0
    assert usable_hours(10.0, 1.0, 0.0, "mono_nb") == 8.5
    assert usable_hours(10.0, 0.0, 0.0, "broadband") == 10.0


def test_planets_are_not_long_integration_budget_targets() -> None:
    assert hours_needed("planet", 9, 5.0) is None


def test_moon_is_not_a_deep_sky_integration_budget_target() -> None:
    assert hours_needed("moon", 4, 5.0) is None
    assert hours_needed("PLANET", 9, 5.0) is None


def test_clamps_defaults_sources_and_ordered_ranges() -> None:
    assert sqm_for_bortle(0) == sqm_for_bortle(1)
    assert sqm_for_bortle(10) == sqm_for_bortle(9)
    assert optics_time_multiplier(0.0) == optics_time_multiplier(1.0)

    class_sky = hours_needed("unknown", 0, 0.0)
    measured_dark = hours_needed("unknown", 10, 100.0, sqm=100.0)
    measured_bright = hours_needed("unknown", 10, 5.0, sqm=-100.0)
    assert class_sky is not None and measured_dark is not None and measured_bright is not None
    assert class_sky.sky_source == "bortle-class"
    assert measured_dark.sky_source == "sqm"
    assert measured_dark.sky_sqm == 25.0
    assert measured_bright.sky_sqm == 10.0
    for estimate in (class_sky, measured_dark, measured_bright):
        assert estimate.low <= estimate.high


def test_showcase_tier_exposes_multiplier_and_scales_range() -> None:
    clean = hours_needed("galaxy", 4, 5.0, tier="clean")
    showcase = hours_needed("galaxy", 4, 5.0, tier="showcase")
    assert clean is not None and showcase is not None
    assert clean.tier_multiplier == 1.0
    assert showcase.tier_multiplier == 2.5
    combined = showcase.lp_multiplier * showcase.optics_multiplier * showcase.tier_multiplier
    assert showcase.low == round(4.0 * combined, 1)
    assert showcase.high == round(8.0 * combined, 1)
