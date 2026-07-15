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
date-change event in this local run, so that interaction was not counted as future-date
browser evidence. The deterministic date/action tests passed.

## Hosted Preview trajectory

Commit `765b4f0` on branch `codex/pa1-immutable-plan-context` produced Vercel Preview
deployment `83aghW2DF2SLFTR4uq6UQmWDfMsb`, which reached **Ready** at
`https://astro-scout-ixdlskoie-jiayz.vercel.app`. Production was not promoted or changed.
The direct CLI route was unavailable: `npx --yes vercel@56.2.0 whoami` reported that no
Vercel credentials were present and then ended with `Error: fetch failed`, so the approved
Git-integrated Preview path was used.

The anonymous Preview accepted native future-date entry and rendered:

`Plan snapshot: -36.8500, 174.7600 · 2026-08-20 · manual coordinates · no gear profile`

The returned night reported **10.2 h dark**, **61% Moon**, and Bortle 6. Changing latitude
to `-36.84` immediately removed both the snapshot and target table. Restoring `-36.85` and
reranking restored the exact `2026-08-20` snapshot, so the hosted future-date and stale-input
boundaries passed without an account.

The first magic-link attempt resolved on Production because the ephemeral Preview callback
was not allowlisted. With explicit approval, that exact callback was added while the Site
URL remained Production. A fresh link then established a real Preview session. The signed-in
run created and reloaded the temporary `PA-1 acceptance f5` broadband profile, restored SQM
18.4 and the future date, and rendered:

`Plan snapshot: -36.8500, 174.7600 · 2026-08-20 · manual coordinates · PA-1 acceptance f5 · f/5 · broadband · SQM 18.4`

Coordinate, date, profile-selection, and SQM edits each removed the result, target table,
Save control, and any projection before reranking. M42 projection returned a 30-night strip,
`~34.8–69.5 h`, `~16–27 sessions`, best night `2026-09-12`, and the exact same Plan
snapshot as ranking.

Saving exposed a hosted discrepancy instead of the expected acknowledgement: the database
insert succeeded as session `b3b545a5-e3ec-45d1-881b-b8fc6232f35f` with `planned_for`
`2026-08-20` and coordinates `-36.85, 174.76`, but server-action path revalidation
remounted `/plan` before `Session saved` or post-save logging could remain visible.

Commit `1c39cdc` removes session/observation revalidation that remounted the planner while
retaining gear revalidation. Its action tests assert no revalidation after successful save
or observation logging. Focused tests reported **20 passed**; the full web suite reported
**103 passed / 11 skipped**. The first Turbopack build again failed on sandbox worker-port
binding; the permitted rerun generated all **14 routes**. Vercel deployment
`2FA5YPaigXq25LxL1GmQpAPN1xAT` reached Ready and owns the stable branch alias
`https://astro-scout-web-git-codex-pa1-immutable-plan-context-jiayz.vercel.app`.

With separate approval, the exact stable-alias callback was added to Supabase. The final
sign-in request was then rejected with `email rate limit exceeded`. The dashboard measured
the built-in project email quota as **2 emails/h**; it was exhausted by the two earlier
Preview authentication attempts. The quota was not raised and session credentials were not
copied between hosts. Corrected save/log/list/detail/reload acceptance therefore remains
pending the email window reset.

After that window reset, one fresh stable-alias link was sent, but its callback returned
`access_denied` / `otp_expired`. Work stopped immediately: no further email, deployment,
configuration, or data mutation occurred until the maintainer approved a recovery path.
The first approved cleanup then:

- removed only the obsolete ephemeral callback and measured **3** remaining URLs:
  localhost, Production, and the stable branch callback;
- deleted only failed-run session `b3b545a5-e3ec-45d1-881b-b8fc6232f35f`, guarded by its
  exact future date and coordinates; SQL `RETURNING` measured **1 row**;
- retained temporary gear `PA-1 acceptance f5` for the authorized Production acceptance.

## Merge, Production deployment, and final cleanup

GitHub PR #1 merged the reviewed branch as
`8455b7108f98208b961b733babe17dc02c948bc9`; its second parent is the final reviewed PA-1
commit `83dc651`. An automatic merge deployment did not surface in Vercel. The exact
reviewed `83dc651` artifact was therefore manually promoted and rebuilt with Production
configuration. Vercel deployment `HfyfLLjpFig1hVnb9LGUztLouHbg` reached **Ready** and owns
the stable `https://astro-scout-web.vercel.app` origin. The deployment source remains the
review branch because the promoted artifact is the reviewed second-parent tree; no
unreviewed source change was introduced.

A fresh Production `/plan` load returned the application but showed `Sign in`: the
browser's retained Supabase session existed only on the obsolete immutable Preview host.
No further magic link was requested and no session token was copied between origins. The
retained Preview session was used only to delete the `PA-1 acceptance f5` gear fixture; the
profile list then measured `No gear profiles yet`.

The obsolete stable branch callback was removed after merge. The Supabase callback list
then measured exactly **2** URLs: localhost and Production. The remote
`codex/pa1-immutable-plan-context` branch was deleted through the merged PR and the PR UI
measured `Restore branch`. The guarded failed-run session had already been deleted, so no
PA-1 temporary session or gear fixture remains.

The anonymous Production planner route returned healthy ranked output for Auckland. The
browser automation again did not dispatch React's native-date change event, so this run is
not claimed as exact `2026-08-20` Production evidence. The exact future-date boundary
remains covered by deterministic tests and the earlier Ready Preview trajectory.

## Disposition

Repository implementation, merge, Ready Production deployment, anonymous hosted
acceptance, signed-in Preview ranking/invalidation/projection, exact database insertion,
and temporary-resource cleanup are complete on 2026-07-16. PA-1 remains open because no
authenticated Production session was available to verify `Session saved`, 120-minute M42
logging, and `/sessions` list/detail reload acceptance in `docs/live-acceptance.md`.
