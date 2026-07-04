"""Planner uses astropy compute (no network for catalog targets)."""

import pytest

from astroscout_api.datasources.planning import dark_window, rank_targets


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
