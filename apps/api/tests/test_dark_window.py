import numpy as np
import pytest

from astroscout_api.datasources.planning import classify_astronomical_darkness


@pytest.mark.parametrize(
    ("altitudes", "expected"),
    [
        ([-12.0, -8.0, -4.0], "no_astronomical_darkness"),
        ([-25.0, -20.0, -18.0], "continuous_astronomical_darkness"),
        ([-20.0, -17.0, -10.0], "normal"),
    ],
)
def test_classify_astronomical_darkness(altitudes: list[float], expected: str) -> None:
    assert classify_astronomical_darkness(altitudes) == expected


@pytest.mark.parametrize("altitudes", [[], [np.nan, -20.0], [np.inf]])
def test_classify_astronomical_darkness_rejects_invalid_samples(
    altitudes: list[float],
) -> None:
    with pytest.raises(ValueError, match="finite and non-empty"):
        classify_astronomical_darkness(altitudes)
