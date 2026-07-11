"""Planner uses astropy compute (no network for catalog targets)."""

import pytest
from astropy.time import Time

from astroscout_api.datasources.dso_catalog import get
from astroscout_api.datasources.planning import (
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
def test_rank_returns_sorted_targets() -> None:
    out = rank_targets(-36.85, 174.76)
    targets = out["targets"]
    assert isinstance(targets, list) and len(targets) > 0
    scores = [t["score"] for t in targets]  # type: ignore[index]
    assert scores == sorted(scores, reverse=True)


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
