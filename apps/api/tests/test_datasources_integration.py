"""Live checks against real services. Run explicitly with: pytest -m integration"""

import pytest

from astroscout_api.datasources.catalog import resolve_object
from astroscout_api.datasources.visibility import get_darkness, get_visibility


@pytest.mark.integration
def test_resolve_m31() -> None:
    out = resolve_object("M31")
    assert out["columns"]


@pytest.mark.integration
def test_visibility_m31() -> None:
    out = get_visibility("M31", -36.85, 174.76)
    assert -90 <= float(out["altitude_deg"]) <= 90  # type: ignore[arg-type]
    assert out["rating"] in {"poor", "marginal", "good"}


@pytest.mark.integration
def test_darkness() -> None:
    out = get_darkness(-36.85, 174.76)
    assert 0.0 <= float(out["moon_illumination"]) <= 1.0  # type: ignore[arg-type]
