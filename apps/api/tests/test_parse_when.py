import pytest

from astroscout_api.datasources.planning import parse_when


def test_none_passes_through() -> None:
    assert parse_when(None) is None
    assert parse_when("  ") is None


def test_date_only_anchored_at_noon_utc() -> None:
    t = parse_when("2026-08-15")
    assert t is not None
    assert "2026-08-15 12:00:00" in t.iso


def test_full_datetime_passthrough() -> None:
    t = parse_when("2026-08-15T22:30:00")
    assert t is not None
    assert "22:30:00" in t.iso


def test_invalid_raises_valueerror() -> None:
    with pytest.raises(ValueError):
        parse_when("not-a-date")
