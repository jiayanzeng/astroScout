"""Planner uses astropy compute (no network for catalog targets)."""

import warnings

import pytest
from astropy.coordinates import NonRotationTransformationWarning
from astropy.time import Time

from astroscout_api.datasources.dso_catalog import get
from astroscout_api.datasources.planning import (
    NoAstronomicalDarknessError,
    conditions_for,
    dark_window,
    project_target,
    rank_targets,
)


@pytest.mark.integration
def test_dark_window_has_positive_hours() -> None:
    w = dark_window(-36.85, 174.76)
    assert w.hours > 0
    assert 0.0 <= w.moon_illumination <= 1.0


@pytest.mark.integration
def test_polar_summer_has_no_astronomical_darkness() -> None:
    with pytest.raises(NoAstronomicalDarknessError):
        dark_window(89.9, 0.0, Time("2026-06-21T12:00:00", scale="utc"))


@pytest.mark.integration
def test_polar_winter_returns_bounded_continuous_darkness() -> None:
    window = dark_window(89.9, 0.0, Time("2026-12-21T12:00:00", scale="utc"))

    assert window.status == "continuous_astronomical_darkness"
    assert window.hours == pytest.approx(24.0)
    assert 0.0 <= window.moon_illumination <= 1.0


@pytest.mark.integration
def test_polar_winter_rank_labels_continuous_darkness() -> None:
    out = rank_targets(89.9, 0.0, Time("2026-12-21T12:00:00", scale="utc"))

    assert out["dark_window_status"] == "continuous_astronomical_darkness"
    assert out["dark_hours"] == 24.0


@pytest.mark.integration
def test_rank_returns_sorted_targets() -> None:
    out = rank_targets(-36.85, 174.76)
    targets = out["targets"]
    assert isinstance(targets, list) and len(targets) > 0
    scores = [t["score"] for t in targets]  # type: ignore[index]
    assert scores == sorted(scores, reverse=True)
    assert "sky_sqm" not in out
    assert "hours_needed_low" not in targets[0]  # type: ignore[operator]
    assert "dark_window_status" not in out


@pytest.mark.integration
def test_rank_with_gear_adds_budget_fields_and_user_sky_provenance() -> None:
    out = rank_targets(-36.85, 174.76, f_ratio=5.0, sqm=18.4)
    assert out["sky_sqm"] == 18.4
    assert out["sky_source"] == "user"

    targets = out["targets"]
    assert isinstance(targets, list)
    m42 = next(target for target in targets if target["name"] == "M42")
    assert m42["budget_applicable"] is True
    assert m42["hours_needed_low"] <= m42["hours_needed_high"]
    jupiter = next(target for target in targets if target["name"] == "Jupiter")
    assert jupiter["budget_applicable"] is False
    assert jupiter["hours_needed_low"] is None


@pytest.mark.integration
def test_jupiter_is_visible_near_opposition() -> None:
    jupiter = get("Jupiter")
    assert jupiter is not None and jupiter.body == "jupiter"

    window = dark_window(30.0, 0.0, Time("2026-01-10T12:00:00", scale="utc"))
    conditions = conditions_for(jupiter, 30.0, 0.0, window, bortle=9)

    assert conditions.altitude_deg > 20.0
    assert conditions.hours_visible > 0.0
    assert conditions.light_sensitivity == 0.0


@pytest.mark.integration
@pytest.mark.parametrize("target_name", ["M42", "Jupiter"])
def test_conditions_compare_moon_and_target_in_one_frame(target_name: str) -> None:
    target = get(target_name)
    assert target is not None
    window = dark_window(-36.85, 174.76, Time("2026-08-15T12:00:00", scale="utc"))

    with warnings.catch_warnings():
        warnings.simplefilter("error", NonRotationTransformationWarning)
        conditions = conditions_for(target, -36.85, 174.76, window, bortle=4)

    assert 0.0 <= conditions.moon_separation_deg <= 180.0


@pytest.mark.integration
def test_project_m42_returns_chronological_non_negative_budget() -> None:
    out = project_target(
        "M42",
        -36.85,
        174.76,
        5.0,
        "broadband",
        "clean",
        when=Time("2026-08-15T12:00:00", scale="utc"),
        nights=5,
    )

    projected = out["nights"]
    assert isinstance(projected, list) and len(projected) == 5
    usable = [float(night["usable_hours"]) for night in projected]
    assert all(hours >= 0.0 for hours in usable)
    cumulative = [sum(usable[: index + 1]) for index in range(len(usable))]
    assert cumulative == sorted(cumulative)

    finish = out["nights_to_finish"]
    assert isinstance(finish, dict)
    if finish["low"] is not None and finish["high"] is not None:
        assert finish["low"] <= finish["high"]


@pytest.mark.integration
def test_project_jupiter_keeps_nights_without_long_integration_budget() -> None:
    out = project_target(
        "Jupiter",
        30.0,
        0.0,
        5.0,
        "broadband",
        "clean",
        when=Time("2026-01-10T12:00:00", scale="utc"),
        nights=3,
    )

    assert out["budget_applicable"] is False
    assert out["hours_needed"] is None
    assert out["filter_mismatch"] is None
    assert out["nights_to_finish"] is None
    assert isinstance(out["nights"], list) and len(out["nights"]) == 3
