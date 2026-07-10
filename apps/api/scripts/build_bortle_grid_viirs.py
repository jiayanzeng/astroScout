"""Regenerate the offline Bortle grid from a measured survey raster (World Atlas 2015).

    uv run python scripts/build_bortle_grid_viirs.py \
        --src /data/world_atlas_2015.tif --units ucd

Reads the World Atlas 2015 artificial zenith sky-brightness GeoTIFF (Falchi et al.
2016, GFZ Data Services doi:10.5880/GFZ.1.4.2016.001; ~2.9 GB, 30 arcsec, geographic),
resamples it (75th-percentile aggregation; see resample_artificial) to the 0.25 deg
(720, 1440) lattice used by grid.py in the SAME orientation (row 0 = lat +90, col 0 =
lon -180), maps sky brightness -> Bortle 1..9
via a published mag/arcsec^2 crosswalk, and np.saves to GRID_PATH. Prints the
per-class histogram like build_bortle_grid.py so the two scripts read alike.

BUILD-ONLY dependency: rasterio. Install ad hoc or in a dev/build group; it must NOT
enter apps/api runtime deps -- the committed .npy is what ships and grid.py stays
byte-identical. Source acquisition + this conversion run on a real machine.

Calibration (do not invent thresholds -- STATE.md Task B1):
  1. The atlas reports ARTIFICIAL brightness only, so the natural background
     (~171 ucd/m^2 ~= 22.0 mag/arcsec^2; Garstang 1989) is added before converting.
  2. mag/arcsec^2 = -2.5 * log10(total_ucd_per_m2) + 27.58
     (12.58 for cd/m^2 per the Garstang/SQM relation + 15 for the ucd->cd 1e6 factor).
   3. Bortle bins are the standard Bortle(2001) <-> SQM table as cited by the IDA.
      This is the SINGLE AUTHORITY for the Bortle↔mag/arcsec² mapping. When
      budget.py is created (Track C Task C1), its BORTLE_TO_SQM midpoints MUST be
      derived from this same table -- do not independently choose midpoints or the
      grid build and the budget estimator will drift.

UNITS TRAP: the GFZ metadata documents values in mcd/m^2 while the +27.58 zero point
assumes ucd/m^2 -- a silent 1000x / 7.5-mag error that flattens the whole grid to one
class. Pass --units explicitly and eyeball the printed per-site sanity report (a real
Bortle-9 core needs artificial ~ 1e3 ucd/m^2) before trusting the output.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from astroscout_api.bortle.grid import GRID_PATH, GRID_RESOLUTION_DEG

# --- calibration constants (single source of truth for the conversion) ---------
NATURAL_UCD_DEFAULT = 171.0  # natural zenith background, ucd/m^2 (~22.0 mag/arcsec^2)
MAG_ZP_UCD = 27.58  # mag/arcsec^2 = -2.5 * log10(brightness in ucd/m^2) + MAG_ZP_UCD
UCD_PER_UNIT: dict[str, float] = {"ucd": 1.0, "mcd": 1000.0}  # source unit -> ucd/m^2

# Inclusive lower mag/arcsec^2 edge of Bortle classes 1..8; anything below the last
# edge is class 9. Bortle(2001) <-> SQM table as cited by the IDA. DO NOT retune to
# make a test pass -- if a directional assertion fails on real data, report it.
BORTLE_MAG_LOWER_EDGES: tuple[float, ...] = (
    22.00,  # mag >= 22.00      -> Bortle 1
    21.75,  # 21.75 <= mag <22  -> 2
    21.50,  # 21.50 .. 21.75    -> 3
    20.50,  # 20.50 .. 21.50    -> 4
    19.50,  # 19.50 .. 20.50    -> 5
    18.50,  # 18.50 .. 19.50    -> 6
    17.50,  # 17.50 .. 18.50    -> 7
    16.00,  # 16.00 .. 17.50    -> 8  (mag < 16.00 -> 9)
)

# Directional spot-checks mirroring tests/test_bortle.py (name, lat, lon).
_SANITY_SITES: tuple[tuple[str, float, float], ...] = (
    ("NYC core", 40.71, -74.01),
    ("mid-Pacific", 0.0, -160.0),
    ("Sahara", 23.0, 13.0),
)


def resample_artificial(src_path: Path, unit_scale: float) -> NDArray[np.float64]:
    """Summarize the native artificial-brightness raster onto the 0.25 deg lattice.

    Aggregation is done in LINEAR brightness space (correct), then scaled to ucd/m^2.
    Each 0.25 deg (~27 km) cell spans ~30x30 native pixels; we take the 75th PERCENTILE
    (``Resampling.q3``), NOT the mean. Averaging washes out city cores at this cell size
    -- a dense core diluted by surrounding dark area reads 1-2 Bortle classes low, which
    under-serves the urban observers the light-pollution ranking exists for. q3 reflects
    "the sky where the lit part of this cell is," lifting major cores back toward their
    true 8-9, yet -- unlike ``max`` -- it ignores isolated bright pixels (a stadium or
    gas flare) so genuinely dark cells stay dark. reproject reads the source CRS +
    transform and emits exactly the contract orientation (row 0 = +90, col 0 = -180).
    """
    import rasterio
    from rasterio.transform import Affine
    from rasterio.warp import Resampling, reproject

    res = GRID_RESOLUTION_DEG
    nlat = int(round(180.0 / res))  # 720
    nlon = int(round(360.0 / res))  # 1440
    # Upper-left origin at (-180, +90); negative dy makes row 0 the northmost row.
    dst_transform = Affine(res, 0.0, -180.0, 0.0, -res, 90.0)
    dst = np.zeros((nlat, nlon), dtype=np.float32)

    with rasterio.open(src_path) as src:
        if src.crs is None or not src.crs.is_geographic:
            raise SystemExit(
                f"source CRS must be geographic lat/lon; got {src.crs!r}. "
                "Reproject to EPSG:4326 before running this script."
            )
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            dst_transform=dst_transform,
            dst_crs="EPSG:4326",
            src_nodata=src.nodata,
            dst_nodata=0.0,  # unmeasured cells (poles/ocean) -> artificial 0 -> pristine
            resampling=Resampling.q3,  # 75th pct: keep city cores, drop outlier pixels
        )

    artificial = np.clip(dst.astype(np.float64), 0.0, None)  # negatives are fill noise
    return artificial * unit_scale


def to_bortle(artificial_ucd: NDArray[np.float64], natural_ucd: float) -> NDArray[np.uint8]:
    """Map artificial brightness (ucd/m^2) + natural background to Bortle 1..9."""
    total = artificial_ucd + natural_ucd  # >= natural_ucd > 0, so log10 is safe
    mag = -2.5 * np.log10(total) + MAG_ZP_UCD
    edges = np.array(BORTLE_MAG_LOWER_EDGES, dtype=np.float64)
    # Bortle = 1 + (count of lower edges the pixel is too bright to reach).
    bortle = 1 + (mag[..., None] < edges).sum(axis=-1)
    return np.clip(bortle, 1, 9).astype(np.uint8)


def report_sanity(
    grid: NDArray[np.uint8], artificial_ucd: NDArray[np.float64], natural_ucd: float
) -> None:
    """Print artificial value + mag + Bortle at known sites so a units error is obvious."""
    nlat, nlon = grid.shape
    res_lat, res_lon = 180.0 / nlat, 360.0 / nlon
    print("sanity (a real Bortle-9 core needs artificial ~ 1e3 ucd/m^2):")
    for name, lat, lon in _SANITY_SITES:
        row = min(nlat - 1, max(0, int((90.0 - lat) / res_lat)))
        col = min(nlon - 1, max(0, int((lon + 180.0) / res_lon)))
        art = float(artificial_ucd[row, col])
        mag = -2.5 * float(np.log10(art + natural_ucd)) + MAG_ZP_UCD
        b = int(grid[row, col])
        print(f"  {name:12s} artificial={art:9.1f} ucd/m^2  mag={mag:5.2f}  Bortle {b}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Bortle grid from a real raster.")
    parser.add_argument("--src", type=Path, required=True, help="World Atlas GeoTIFF path")
    parser.add_argument(
        "--units",
        choices=sorted(UCD_PER_UNIT),
        required=True,
        help="brightness unit of the source raster (GFZ docs say mcd -- VERIFY first)",
    )
    parser.add_argument(
        "--natural",
        type=float,
        default=NATURAL_UCD_DEFAULT,
        help="natural zenith background, ucd/m^2 (pass 0 if the raster is already total)",
    )
    args = parser.parse_args()

    if not args.src.exists():
        raise SystemExit(f"source raster not found: {args.src}")

    artificial = resample_artificial(args.src, UCD_PER_UNIT[args.units])
    grid = to_bortle(artificial, args.natural)

    report_sanity(grid, artificial, args.natural)

    np.save(GRID_PATH, grid)
    print(f"wrote {GRID_PATH} ({GRID_PATH.stat().st_size / 1024:.0f} KB), shape {grid.shape}")
    vals, counts = np.unique(grid, return_counts=True)
    for v, c in zip(vals, counts, strict=True):
        print(f"  Bortle {int(v)}: {100 * c / grid.size:5.1f}% of cells")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
