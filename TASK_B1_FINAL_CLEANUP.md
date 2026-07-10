# Task B1 Final Documentation Cleanup

## Status and scope

Task B1's technical implementation is accepted as complete:

- the committed grid is the World Atlas 2015 q3 raster;
- the `(720, 1440)` `uint8` orientation contract is preserved;
- `grid.py::bortle_at` and downstream runtime behavior are unchanged;
- the measured five-city readings and artifact histogram are reproducible from the
  committed `.npy`;
- focused and full API verification gates pass; and
- the `.npy` is included unchanged in the wheel.

This cleanup is documentation and diagnostic-text work only. Do **not** change
`BORTLE_MAG_LOWER_EDGES`, `Resampling.q3`, `bortle_grid.npy`, the runtime lookup, or
force NYC to Bortle 9. Do not create `budget.py` or modify `cline_tasks_track_c.md`;
Track C is out of scope.

## Required changes, in order

### 1. Correct the World Atlas build command and bright-end sanity message

File: `apps/api/scripts/build_bortle_grid_viirs.py`

1. Replace the module usage example with the actual supported command:

   ```bash
   uv run --with rasterio python scripts/build_bortle_grid_viirs.py \
     --src /Users/yzjia/Documents/World_Atlas_2015/World_Atlas_2015.tif \
     --units mcd
   ```

   The GFZ World Atlas file is interpreted as `mcd/m^2`; `--units ucd` would apply the
   wrong scale. `--with rasterio` is required because rasterio is deliberately a
   build-only dependency.

2. Replace both claims that a Bortle-9 core needs artificial brightness of about
   `1e3 ucd/m^2` (the module docstring and `report_sanity`). They conflict with the
   accepted table and the implemented conversion.

   With the current constants:

   ```text
   Bortle 8 starts at artificial brightness ~= 10,593.652 ucd/m^2
   Bortle 9 starts at artificial brightness ~= 42,683.852 ucd/m^2
   artificial brightness 1,000 ucd/m^2 -> 19.9086 mag/arcsec^2 -> Bortle 5
   ```

3. Prefer deriving the Bortle-9 diagnostic value from the existing constants inside
   `report_sanity` so the message cannot drift if the chosen table or `--natural`
   value changes:

   ```python
   b9_artificial = (
       10 ** ((MAG_ZP_UCD - BORTLE_MAG_LOWER_EDGES[-1]) / 2.5) - natural_ucd
   )
   ```

   Print the derived value rather than embedding another rounded magic number.

### 2. Complete the authoritative `STATE.md` record

File: `STATE.md`

1. In section 2, Rule 1, record the full comparison:

   - NYC reads Bortle 7 under q3;
   - it also read 7 under the city model and the averaged World Atlas grid; and
   - q3 was selected to reduce mean dilution across a roughly 27 km cell while avoiding
     `max` sensitivity to isolated bright pixels. The NYC cell did not cross the next
     discrete Bortle boundary, which is an observed result rather than a failure to be
     tuned away.

2. In section 3, replace the combined rounded histogram with the exact committed-grid
   counts:

   ```text
   Bortle 1:       0
   Bortle 2: 993,599
   Bortle 3:  17,304
   Bortle 4:  20,403
   Bortle 5:   4,019
   Bortle 6:   1,184
   Bortle 7:     263
   Bortle 8:      27
   Bortle 9:       1
   ```

3. Keep the correct dark-end explanation: the 171 `ucd/m^2` natural floor yields
   approximately 21.998 mag/arcsec^2 and therefore class 2, so the grid has no class-1
   cells.

4. Correct the bright-end explanation. Under the accepted table, class 8 begins above
   approximately 10,594 `ucd/m^2` artificial brightness and class 9 above approximately
   42,684 `ucd/m^2`. State that the five named q3 city cells remain class 7 and only one
   global cell reaches class 9. Remove the incorrect `~1e3` threshold.

5. In section 4, make the World Atlas q3 command from step 1 the primary regeneration
   command. List `scripts/build_bortle_grid.py` separately and explicitly as the offline
   city-model fallback so maintainers do not accidentally overwrite the production
   raster with the fallback grid.

### 3. Align non-authoritative project documentation with `STATE.md`

These inconsistencies do not invalidate B1, but they should be removed so new sessions
do not receive conflicting guidance.

1. `README.md`: remove the World Atlas/VIIRS swap from "deliberately not in this slice"
   and, if useful, mention the completed satellite-derived offline grid in the feature
   overview.
2. `apps/api/README.md`: rewrite the opening Bortle description so it says the committed
   grid comes from World Atlas 2015 q3 aggregation; describe `model.py`/`cities.py` as the
   offline fallback only.
3. `apps/api/src/astroscout_api/bortle/cities.py`: change the module docstring to say the
   city seed powers the fallback model, not the committed production grid.
4. `apps/api/src/astroscout_api/bortle/grid.py`: optionally update only the module
   docstring's first sentence to describe a source-agnostic committed grid and identify
   `build_grid()` as the fallback builder. Do not change executable code.
5. `cline_tasks.md`: preserve the detailed B1 prompt as historical acceptance context.
   Optionally annotate its summary/backlog entry as completed with `STATE.md` section 5,
   item 4 as the authoritative status; do not rewrite the original contract.

### 4. Verify without regenerating the artifact

From `apps/api`, run:

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest -m "not integration" -k bortle
uv run pytest -m "not integration"
```

Then verify:

- `apps/api/src/astroscout_api/bortle/bortle_grid.npy` has not changed;
- the current SHA-256 remains
  `2e9b98d1537665de6773e273bfaac053cbc1c47e6d4f043ff5ca66bf59c91b91`;
- NYC, London, Tokyo, Delhi, and Cairo still return Bortle 7; and
- the exact histogram still matches section 2 above.

Because these corrections do not change conversion behavior, do not rerun the 2.8 GB
source conversion merely to update documentation. A future deliberate regeneration
should use the canonical `--units mcd` q3 command and record its output before replacing
the committed artifact.

## Completion criteria

The cleanup is complete when:

- all commands and unit labels consistently use the World Atlas `mcd` input path;
- no file claims that `1e3 ucd/m^2` maps to Bortle 9;
- `STATE.md` records the exact histogram and the measured q3/average comparison;
- the production and fallback regeneration paths are unambiguous;
- public and module documentation no longer describes the committed grid as city-model
  generated; and
- all verification gates pass with the raster checksum unchanged.
