import astropy.units as u
import pytest
from astroplan import FixedTarget
from astropy.coordinates import SkyCoord
from astropy.coordinates.name_resolve import NameResolveError

from astroscout_api.datasources import targets
from astroscout_api.datasources.targets import (
    TargetNotFound,
    UnsupportedTarget,
    UpstreamResolutionError,
    resolve_target,
)


def test_catalog_targets_resolve_without_upstream() -> None:
    assert resolve_target("M4").common_name == "Messier 4"
    moon = resolve_target("Moon")
    assert moon.body == "moon"
    assert moon.kind == "moon"


def test_sun_requires_a_separate_daylight_safety_flow() -> None:
    with pytest.raises(UnsupportedTarget) as caught:
        resolve_target("Sun")
    assert caught.value.detail()["flow"] == "solar_daylight_planner_required"


def test_unresolved_name_is_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    def not_found(_name: str) -> FixedTarget:
        raise NameResolveError("Unable to find coordinates for name 'AAA' using Simbad")

    monkeypatch.setattr(targets.FixedTarget, "from_name", not_found)
    with pytest.raises(TargetNotFound):
        resolve_target("AAA")


def test_resolver_outage_is_upstream_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def unavailable(_name: str) -> FixedTarget:
        raise NameResolveError("All Sesame queries failed. Unable to retrieve coordinates.")

    monkeypatch.setattr(targets.FixedTarget, "from_name", unavailable)
    with pytest.raises(UpstreamResolutionError):
        resolve_target("Alpha Centauri")


def test_simbad_fallback_preserves_alpha_centauri(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = FixedTarget(
        coord=SkyCoord(ra=14.6608 * u.hourangle, dec=-60.8339 * u.deg),
        name="Alpha Centauri",
    )
    monkeypatch.setattr(targets.FixedTarget, "from_name", lambda _name: expected)

    resolved = resolve_target("Alpha Centauri")

    assert resolved.name == "Alpha Centauri"
    assert resolved.ra_hours == pytest.approx(14.6608)
    assert resolved.dec_deg == pytest.approx(-60.8339)
