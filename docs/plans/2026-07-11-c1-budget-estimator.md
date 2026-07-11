# Task C1 plan — pure integration-time budget estimator

Status: approved, implemented, and verified on 2026-07-11. The maintainer corrected the
stale literal mono-NB coupling: it is derived from the Bortle 9 ≈ broadband Bortle 4
calibration anchor, while dual-NB remains the labelled, unanchored `0.30` interpolation
pending a community datapoint.

## Gate and ground truth

- C1a is complete: `bortle/calibration.py` is the single Bortle↔SQM authority and the
  continuous World Atlas SQM sidecar is accepted.
- The maintainer supplied a green-light C-gate report. Linked Reddit and Cloudy Nights
  discussions confirm the required signal: experienced users reject universal point
  estimates, but actively exchange conditional baselines, night counts, sky/f-ratio
  scaling, read-noise math, and total-integration comparisons.
- C1 remains an estimator of community-anchored ranges, not radiometric truth. Every
  multiplier and approximation must stay visible in the result and documentation.

Verified concept references:

- https://www.reddit.com/r/AskAstrophotography/comments/1ni8e8g/how_to_determine_total_exposure_time_needed/
- https://www.reddit.com/r/AskAstrophotography/comments/1p5iw2u/trying_to_use_robin_glovers_math_to_calculate_sub/
- https://www.cloudynights.com/forums/topic/688799-calculating-total-integration-time-for-a-given-object/
- https://www.cloudynights.com/forums/topic/686626-is-osc-a-one-trick-pony/page/5/
- https://www.cloudynights.com/forums/topic/907449-exposure-time/

## Planned implementation

1. Add only `apps/api/src/astroscout_api/budget.py` for the pure estimator. Import
   `BORTLE_TO_SQM`; do not restate the crosswalk or read grid files.
2. Implement the exact C1 constants, `FilterKind`/`QualityTier` literals, immutable
   `HoursEstimate`, sky-source precedence, light-pollution and optics multipliers,
   filter-weighted usable hours, and range-valued `hours_needed`.
3. Preserve honesty boundaries: measured/caller SQM wins over class midpoints; inputs
   are clamped; narrowband on non-emission targets falls back to broadband physics and
   sets `filter_mismatch`; planets return `None` because lucky imaging is not a
   long-integration budget.
4. Add only `apps/api/tests/test_budget.py` for the required identities, monotonicity,
   filter anchor/mismatch, optics ratios, moon weighting, planet exclusion, clamping,
   defaults, source labels, and ordered output ranges.
5. Update only `STATE.md` among existing files. Add the exact five-row validation table
   from the task: retain every unmeasured cell as `fill in`; do not manufacture forum
   outcomes or tune constants to make a row pass. Add the C1 §5 record only after tests.
   Do not bump the STATE version.

## Verification and stop conditions

- First run focused Ruff, strict mypy, and `test_budget.py` checks.
- Run the full API gate and the root-required direct-binary web gate.
- Evaluate and report the executable validation identities exactly as observed.
- Stop and surface any formula/test discrepancy. Do not adjust the specified constants
  unless the maintainer explicitly revises the task after reviewing a failed datapoint.
- Keep the C-gate outcome and the model’s approximation/range framing in `STATE.md` so
  later C2/C4 work cannot market the result as a promise.
