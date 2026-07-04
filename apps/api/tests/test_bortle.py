from astroscout_api.bortle.grid import bortle_at, load_grid
from astroscout_api.bortle.model import (
    bortle_for_point,
    index_to_bortle,
    light_index_at,
)


def test_light_index_higher_nearer_a_city() -> None:
    near_nyc = light_index_at(40.7, -74.0)
    remote = light_index_at(0.0, -150.0)  # mid-Pacific
    assert near_nyc > remote
    assert remote >= 0.0


def test_index_to_bortle_bounds_and_monotonic() -> None:
    assert index_to_bortle(0.0) == 1
    assert index_to_bortle(1e12) == 9
    assert index_to_bortle(1e6) >= index_to_bortle(1e2)
    assert 1 <= index_to_bortle(500.0) <= 9


def test_model_points_are_sensible() -> None:
    assert bortle_for_point(40.71, -74.01) >= 7  # NYC: bright
    assert bortle_for_point(0.0, -150.0) <= 2  # mid-Pacific: pristine


def test_grid_loads_and_has_expected_shape() -> None:
    grid = load_grid()
    assert grid.shape == (720, 1440)
    assert grid.dtype.name == "uint8"


def test_bortle_at_urban_vs_remote() -> None:
    assert bortle_at(40.71, -74.01) >= 6  # NYC
    assert bortle_at(0.0, -150.0) <= 2  # mid-Pacific
    assert bortle_at(23.0, 13.0) <= 2  # central Sahara


def test_bortle_at_clamps_extremes() -> None:
    for lat, lon in [(90.0, 180.0), (-90.0, -180.0), (90.0, -180.0)]:
        b = bortle_at(lat, lon)
        assert 1 <= b <= 9
