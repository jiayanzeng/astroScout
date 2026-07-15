# PA-1 immutable planner-context evidence — 2026-07-16

This record covers the repository implementation and local built artifact. It does not
claim the signed-in hosted save/reload acceptance required to close PA-1.

## Implemented contract

- A successful `NightPlan` is stored with a frozen request snapshot containing coordinates,
  requested date, location source, selected profile identity/name/f-ratio/filter/tier, and
  measured SQM when supplied. Its resolved `plannedFor` date is the explicit requested date
  or, for an upcoming-night request, the returned UTC dusk date.
- Ranking and projection query strings are generated from the same snapshot. Projection,
  save, and observer-context persistence no longer read mutable form controls.
- Latitude, longitude, browser-geolocation result, date, gear selection, and SQM changes
  clear the active result, projection, and saved-session binding. A generation guard prevents
  an older request from restoring state or observer context after a later edit.
- `saveSession` now inserts the exact snapshot `planned_for` date and coordinates.
- Session, observation, gear-create, and gear-delete actions share strict runtime validation
  for finite/bounded numbers, real calendar dates, UUIDs, enums, and bounded text.
- Server actions return discriminated `success`, `auth_required`, `validation_error`,
  `database_error`, or `no_affected_rows` outcomes. Gear deletion selects the affected ID,
  so an RLS/no-row delete is not reported as success.

No migration, RLS policy, dependency, API behavior, budget/scoring constant, or committed
data artifact changed.

## Deterministic verification

The new tests cover:

- freezing and exact future-date preservation;
- ranking/projection parameter equality;
- invalidation for latitude, longitude, geolocation source, date, profile selection,
  focal ratio, and SQM changes;
- observer-context derivation and upcoming-night date resolution;
- invalid date/coordinate/gear/SQM rejection;
- exact future `planned_for` insertion;
- oversized/invalid session, observation, gear, and delete input before Supabase access;
- zero-row delete and database-failure outcomes.

Measured gates:

- API Ruff, format, and strict mypy passed; pytest reported **99 passed / 19 deselected**.
- Web typecheck and ESLint passed; Vitest reported **102 passed / 11 skipped**.
- The optimized Next.js build compiled and generated **14 routes**.

## Local built-artifact trajectory

The optimized artifact ran with `next start` on local port 3100 and the local FastAPI
service. `/plan` returned 200. An anonymous Auckland upcoming-night request at
`-36.85, 174.76` returned 200 and rendered:

`Plan snapshot: -36.8500, 174.7600 · 2026-07-16 (upcoming-night request) · manual coordinates · no gear profile`

Editing latitude to `-36.80` immediately removed the plan snapshot and target table. A new
rank request returned 200 and rendered the replacement snapshot at `-36.8000, 174.7600`.
Anonymous planning therefore remained available while the stale-result boundary held in
the built artifact.

The browser harness could set the native date input's DOM value but did not emit the React
date-change event in this run, so that interaction was not counted as future-date browser
evidence. The deterministic date/action tests passed, but the required signed-in candidate
deployment trajectory—future-date rank, projection, save, `/sessions` reload, and exact
date/coordinate comparison—remains pending deployment authority.

## Disposition

Repository implementation is complete on 2026-07-16. PA-1 remains open until an authorized
candidate artifact passes the signed-in future-date and changed-input acceptance in
`docs/live-acceptance.md`.
