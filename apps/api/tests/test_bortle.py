from pathlib import Path

import numpy as np
import pytest

import astroscout_api.bortle.grid as grid_module
from astroscout_api.bortle.calibration import BORTLE_TO_SQM, bortle_for_sqm
from astroscout_api.bortle.grid import bortle_at, load_grid, load_sqm_grid, sqm_at
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


def test_sqm_grid_loads_and_has_expected_shape() -> None:
    grid = load_sqm_grid()
    assert grid is not None
    assert grid.shape == (720, 1440)
    assert grid.dtype.name == "float16"


def test_bortle_at_urban_vs_remote() -> None:
    assert bortle_at(40.71, -74.01) >= 6  # NYC
    assert bortle_at(0.0, -150.0) <= 2  # mid-Pacific
    assert bortle_at(23.0, 13.0) <= 2  # central Sahara


def test_bortle_at_clamps_extremes() -> None:
    for lat, lon in [(90.0, 180.0), (-90.0, -180.0), (90.0, -180.0)]:
        b = bortle_at(lat, lon)
        assert 1 <= b <= 9


def test_bortle_sqm_crosswalk_is_self_consistent() -> None:
    assert BORTLE_TO_SQM == {
        1: 22.0,
        2: 21.88,
        3: 21.63,
        4: 21.0,
        5: 20.0,
        6: 19.0,
        7: 18.0,
        8: 16.75,
        9: 15.5,
    }
    for bortle, sqm in BORTLE_TO_SQM.items():
        assert bortle_for_sqm(sqm) == bortle


def test_sqm_at_returns_none_when_sidecar_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(grid_module, "SQM_GRID_PATH", tmp_path / "missing.npy")
    load_sqm_grid.cache_clear()
    try:
        assert sqm_at(0.0, 0.0) is None
    finally:
        load_sqm_grid.cache_clear()


def test_sqm_at_reads_synthetic_float16_grid(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    path = tmp_path / "sqm_grid.npy"
    synthetic = np.full((2, 4), 21.5, dtype=np.float16)
    synthetic[1, 2] = np.float16(19.25)
    np.save(path, synthetic)
    monkeypatch.setattr(grid_module, "SQM_GRID_PATH", path)
    load_sqm_grid.cache_clear()
    try:
        assert sqm_at(0.0, 0.0) == 19.25
    finally:
        load_sqm_grid.cache_clear()


def test_synthetic_sqm_and_bortle_grids_agree(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    sqm_path = tmp_path / "sqm_grid.npy"
    bortle_path = tmp_path / "bortle_grid.npy"
    synthetic_sqm = np.array(
        [[22.0, 21.88, 18.0, 15.5], [21.63, 21.0, 20.0, 16.75]], dtype=np.float16
    )
    synthetic_bortle = np.array(
        [[bortle_for_sqm(float(value)) for value in row] for row in synthetic_sqm],
        dtype=np.uint8,
    )
    np.save(sqm_path, synthetic_sqm)
    np.save(bortle_path, synthetic_bortle)
    monkeypatch.setattr(grid_module, "SQM_GRID_PATH", sqm_path)
    monkeypatch.setattr(grid_module, "GRID_PATH", bortle_path)
    load_sqm_grid.cache_clear()
    load_grid.cache_clear()
    try:
        sqm = sqm_at(45.0, 45.0)
        assert sqm is not None
        assert bortle_for_sqm(sqm) == bortle_at(45.0, 45.0)
    finally:
        load_sqm_grid.cache_clear()
        load_grid.cache_clear()
