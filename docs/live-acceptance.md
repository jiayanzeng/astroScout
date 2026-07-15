# AstroScout live acceptance runbook

Last reconciled: 2026-07-15

This is the single canonical live journey for a release candidate. It exercises the
deployed Next.js artifact, its private FastAPI service, Supabase auth/RLS, planning,
projection, saved state, and grounded chat as one user-visible flow. Component tests and
SQL acceptance tests remain required, but they do not replace this runbook.

The journey is deliberately partly manual: magic-link auth, browser-local persistence,
and rendered citations must be observed in a real browser. Use only the canned,
non-private prompts below. Never put credentials, auth cookies, full provider payloads, or
private message text in the evidence record.

## 1. Prepare one evidence record

Use one origin for the entire run. The production default is shown below; replace it with
the candidate origin when accepting a preview or another intended host.

```bash
export BASE_URL=https://astro-scout-web.vercel.app
date -u +%Y-%m-%dT%H:%M:%SZ
git rev-parse HEAD  # local checkout only; compare it with the host's deployed commit
curl -sS -o /dev/null -w 'plan HTTP %{http_code}\n' "$BASE_URL/plan"
```

Record:

| Field | Observed value |
|---|---|
| UTC start time | |
| local checkout commit | |
| deployed commit | |
| deployment/origin | |
| browser and device IANA zone | |
| Supabase migration head (expected `0007_observation_progress.sql`) | |
| operator | |

Preconditions:

- migrations `0001` through `0007` are applied in order;
- email magic-link auth allows this origin's `/auth/callback`;
- the deployed web service has the public Supabase URL/publishable key and server-only
  OpenAI configuration, with no Supabase service-role key;
- the FastAPI service binding is healthy and the literature corpus is ingested;
- production has the six-per-IP-per-60-second `/api/project` WAF rule;
- local proxy CA configuration, if needed, is supplied only through
  `NODE_EXTRA_CA_CERTS`; TLS verification is not disabled.

If any precondition is unknown, record **not verified**. Do not infer it from a successful
page load.

## 2. Prove the anonymous and signed-in boundaries

1. In a signed-out browser context, open `$BASE_URL/plan`; it must render without auth.
2. Open `$BASE_URL/sessions`; it must redirect to `/login`.
3. Open `$BASE_URL/chat`; it must show the sign-in requirement and keep sending disabled.
4. Request a magic link on `/login`, follow the link, and verify the shell shows the
   signed-in state.
5. Reload `/plan`; the **Imaging gear** card must render. A permission error or a false
   empty state caused by a failed query is a failure.

Record the auth result without recording the email address or cookie.

## 3. Exercise gear CRUD and a budgeted plan

1. In **Imaging gear**, create a profile using:
   - profile name: `Live acceptance <UTC date and hour>`;
   - focal ratio: `5.0`;
   - filter: `Broadband / OSC`.
2. Confirm the profile is selected, reload `/plan`, and confirm it remains present and
   selected. This proves create, read, and client selection persistence. The UI currently
   has no profile editor; owner `UPDATE` and cross-user denial remain mandatory coverage in
   `supabase/tests/track_c_acceptance.sql`, not a claimed browser action.
3. Enter latitude `-36.85`, longitude `174.76`, and measured SQM `18.4`. Choose and record
   an observing date, or explicitly record that the upcoming night was used.
4. Select **Rank targets**.
5. Verify the response shows all of the following:
   - dark hours, Moon percentage, Bortle class, and `your SQM 18.4`;
   - dusk/dawn labelled with the device IANA zone/abbreviation and exact UTC in tooltips;
   - target score, peak altitude, hours visible, light-pollution sensitivity, and
     integration-time range columns;
   - planets show budget `n/a` rather than a deep-sky integration estimate.

Astronomical values change with date. Record the exact observed values; do not hardcode a
past run's M42 hours or best-night date as the pass condition.

## 4. Exercise projection and saved-session persistence

1. On the M42 row, select **Project**.
2. Confirm the card reports M42, `30 nights`, the selected f/5 broadband assumptions, an
   hours-needed range, completion guidance, a best night, and a 30-night usable-hours
   strip. A planet projection may have nights but no integration budget; that is expected.
3. Close the projection card, select **Save session**, and confirm **Session saved**.
4. Enter `120` integration minutes and select **Log** on M42 once. Verify the plan row
   immediately reports two logged hours and progress against the modeled range.
5. Open `/sessions`, then open the newly created session. Confirm the observation shows
   `120 min integration`.
6. Record the `/sessions/<id>` URL. Confirm the saved coordinates and the M42 observation
   remain after reloading both the list and detail page.
7. Return to `/plan`, select the same gear, rank again, and confirm the aggregated M42
   progress survives navigation/reload.

The current product fixes the title to `Night plan @ <lat>, <lon>` and has no session
rename/delete control. Identify the acceptance fixture by its recorded session ID and UTC
run time. Remove it later only through an approved owner/admin workflow; do not claim UI
cleanup occurred.

## 5. Exercise all three chat trajectories

Navigate from Plan to Chat without clearing browser storage. The trusted observer card
must show Auckland coordinates and the saved-session source.

Send these three canned prompts, waiting for each response before sending the next:

1. `What should I observe tonight from Auckland (-36.85, 174.76)?`
   - must call `planNight`;
   - tool coordinates/source/date and plan conditions must agree with the plan context.
2. `Compare M31 and M42 for imaging tonight using my saved observer context.`
   - must call `planNight` once and `getTargetDetail` once for each named target;
   - each detail card must display the same trusted observer context.
3. `Why is the Orion Nebula scientifically interesting?`
   - must call `searchKnowledge` before science prose;
   - results must display source titles and bibcodes;
   - final science text must be short cited corpus evidence, or the exact
     insufficient-evidence response when the corpus has no attributed result.

Then verify persistence:

1. Reload `/chat`: user/assistant text must return, while tool cards/payloads must not.
2. Navigate Chat → Plan → Chat and confirm the same text-only history remains.
3. Select **Clear conversation**, reload, and confirm the starter state returns.

Do not copy full chat text into the evidence record. Record the required tool names,
citation count, displayed bibcodes, observer context, HTTP outcome, and verdict.

## 6. Verify content-free accounting and logs

For one chat request, correlate the hosting log request ID with the caller's newest
`chat_usage_events` row. Record only:

- request status and bounded failure reason;
- total/step/tool latency;
- input, output, and total tokens;
- backend billing units and estimated cost.

Pass only if the row completes and the structured logs contain no prompt, response,
message text, tool payload, key, cookie, email, or secret field. The completion capability
must not be selectable by the authenticated client.

## 7. Run the public error and fallback script

Run these from a shell with no browser cookies. Each command prints its body and status.

```bash
# Presence, finite-number, and coordinate-range validation: all 400.
curl -sS -w '\nHTTP %{http_code}\n' "$BASE_URL/api/plan?lon=174.76"
curl -sS -w '\nHTTP %{http_code}\n' "$BASE_URL/api/plan?lat=Infinity&lon=174.76"
curl -sS -w '\nHTTP %{http_code}\n' "$BASE_URL/api/plan?lat=91&lon=174.76"

# Local catalog and deliberate moving-target behavior: all 200.
curl -sS -w '\nHTTP %{http_code}\n' \
  "$BASE_URL/api/visibility?target=M4&lat=-36.85&lon=174.76"
curl -sS -w '\nHTTP %{http_code}\n' \
  "$BASE_URL/api/visibility?target=Moon&lat=-36.85&lon=174.76"

# Healthy Simbad fallback: 200. A real resolver outage is a 502 and fails this fallback check.
curl -sS -G -w '\nHTTP %{http_code}\n' "$BASE_URL/api/visibility" \
  --data-urlencode 'target=Alpha Centauri' \
  --data-urlencode 'lat=-36.85' \
  --data-urlencode 'lon=174.76'

# Unresolved name: 404 with detail.code=target_not_found.
curl -sS -w '\nHTTP %{http_code}\n' \
  "$BASE_URL/api/visibility?target=AAA&lat=-36.85&lon=174.76"

# Solar target: 422 with detail.code=unsupported_target and
# detail.flow=solar_daylight_planner_required.
curl -sS -G -w '\nHTTP %{http_code}\n' "$BASE_URL/api/project" \
  --data-urlencode 'name=Sun' \
  --data-urlencode 'lat=-36.85' \
  --data-urlencode 'lon=174.76' \
  --data-urlencode 'f_ratio=5'

# Polar summer: 422 with detail.code=no_astronomical_darkness.
curl -sS -G -w '\nHTTP %{http_code}\n' "$BASE_URL/api/plan" \
  --data-urlencode 'lat=89.9' \
  --data-urlencode 'lon=0' \
  --data-urlencode 'when=2026-06-21'

# Polar winter: 200 with dark_window_status=continuous_astronomical_darkness and a
# bounded 24-hour dusk_utc -> dawn_utc interval.
curl -sS -G -w '\nHTTP %{http_code}\n' "$BASE_URL/api/plan" \
  --data-urlencode 'lat=89.9' \
  --data-urlencode 'lon=0' \
  --data-urlencode 'when=2026-12-21'

# No auth cookie: 401 with error.code=authentication_required.
curl -sS -w '\nHTTP %{http_code}\n' -H 'Content-Type: application/json' \
  --data '{"messages":[],"observer":null}' "$BASE_URL/api/chat"
```

For production shared-rate acceptance, wait until the projection WAF window is clear,
then run this once at the end. It intentionally consumes the current IP's projection
quota. The first six invalid requests must reach the proxy and return 400; the seventh
must be rejected by the shared WAF with 429.

```bash
for i in 1 2 3 4 5 6 7; do
  curl -sS -o /dev/null -w "$i HTTP %{http_code}\n" \
    "$BASE_URL/api/project?name=M4&lat=-36.85&lon=174.76"
done
```

Do not reinterpret Alpha Centauri's 502 as “not found”: that status proves the upstream
failure category but does not satisfy the successful Simbad-fallback acceptance.
Deliberately disabling Simbad in production is not part of this run; the controlled 502
mapping remains mandatory router-test coverage.

## 8. Close the run truthfully

Delete the acceptance gear profile in `/plan`, reload, and confirm it is absent. Retain
the recorded session ID until it is removed through an approved workflow.

Complete one table; link evidence rather than pasting secrets or private content:

| Check | Expected | Observed | UTC/evidence | Verdict |
|---|---|---|---|---|
| anonymous/auth boundary | public plan; protected sessions/chat | | | |
| gear create/reload/delete | own profile persists, then is absent | | | |
| Auckland budgeted plan | gear/SQM fields and device-zone label | | | |
| M42 projection | bounded 30-night detail | | | |
| saved session/observation | 120 min + aggregate survive reload | | | |
| planning chat | `planNight`, consistent observer | | | |
| comparison chat | plan + exact M31/M42 details | | | |
| science chat | `searchKnowledge`, title/bibcode citations | | | |
| chat reload/navigation/clear | validated text only; clear works | | | |
| accounting/log privacy | numeric/content-free completion | | | |
| validation and target errors | 400/404/422/401 as specified | | | |
| polar summer/winter | structured 422 / labelled bounded 200 | | | |
| M4/Moon/Simbad success | 200/200/200 | | | |
| shared projection limit | six 400, then 429 | | | |

Any failed live check remains failed. Add a dated correction to `STATE.md` with the
observed response and cause; do not overwrite the earlier claim or weaken an acceptance
condition. A rerun gets its own UTC evidence row and superseding correction.
