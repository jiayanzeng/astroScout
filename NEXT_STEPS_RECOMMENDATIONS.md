# AstroScout project review and recommended next steps

Date: 2026-07-15

## Scope and evidence

This review covers the repository architecture, API and web implementation, Supabase
migrations and RLS model, automated tests, eval harness, CI workflow, project
documentation, and the maintainer's 2026-07-15 real-machine transcript at
`/Users/yzjia/Documents/MacJia/astroscout test results.md`.

The repository is technically healthy but not yet ready to call the Track C user journey
complete. The deterministic core and build gates are strong; the largest risks are at
integration seams that CI does not currently exercise.

### Verified current baseline

| Area | Measured result | Interpretation |
|---|---:|---|
| API lint/format/types | Ruff, Ruff format, and strict mypy pass | Pure/API code quality is healthy |
| API offline suite | 72 passed, 16 deselected | Current CI-safe behavior is green |
| Planner integration | 8 passed | Local Astropy planning, planets, budgets, and frame handling are green |
| Web suite | 45 passed, 6 live-gated cases skipped | Pure frontend/eval helpers are green |
| Web production build | 13 routes generated | Next.js build is healthy |
| Live planning | `/plan/night` and catalog/Simbad target requests returned 200 | The principal planning path works |
| Planner warnings | No `NonRotationTransformationWarning` in the new transcript | The shared-frame Moon-separation fix is effective |
| Live chat transport | Repeated `/api/chat` requests returned 200, including multi-step turns | The W1 relay-loop fix is holding |

### Material discrepancies found in the real-machine transcript

1. **C3 is not live-complete.** The signed-in `/plan` page displays
   `permission denied for table gear_profiles`; no profile is saved or loaded. A Next.js
   server-action POST returning 200 only means the action executed—the action returned a
   business error. `STATE.md` currently overstates this as a successful live migration.
2. **The core C4 value is consequently inaccessible.** Without a selectable gear profile,
   the hours-needed column, SQM-adjusted budget, and 30-night completion card cannot be
   exercised through the live UI.
3. **Chat does not have an authoritative observing location.** `/plan` reported Auckland
   as Bortle 6 while a later chat turn reported Bortle 2 after the assistant asked for
   coordinates and received `M1`, not a location. The model can currently invent tool
   latitude/longitude because those values are model-supplied arguments.
4. **Grounding policy is not enforced end to end.** The chat made scientific claims about
   M31, M101, Alpha Centauri, and Jupiter without calling `searchKnowledge` or showing
   citations. The canned faithfulness fixture tests answer judging, not whether the live
   agent selects the grounding tool.
5. **Target failures are classified too broadly.** `Moon`, `Sun`, and `AAA` all returned
   502. Unsupported targets, unresolved names, and genuine upstream failures need
   different domain responses.
6. **Chat latency reaches 43 seconds while the route declares `maxDuration = 30`.** Local
   development does not enforce every deployment timeout, so this is a production risk.
7. **Chat state appears volatile.** The transcript's final “issue” shows the chat back at
   its empty starter state after a populated conversation; `useChat` currently has no
   persistence layer.
8. **Local TLS verification is disabled.** Node reports
   `NODE_TLS_REJECT_UNAUTHORIZED=0`, which is acceptable only as a temporary local escape
   hatch.
9. **Several user-facing documents are stale.** The root README omits migration `0004`
   and describes already-shipped retrieval work as future scope; the API and web READMEs
   still describe earlier endpoint sets and an obsolete light-pollution gap.

## Recommended execution order

### P0 — restore the live Track C vertical slice

Implementation status (2026-07-15): the repository-side repair is implemented in
`0005_privileges_and_rls_repair.sql`, the signed-in pages now surface read failures, and
the CI workflow contains a PostgreSQL/pgvector migration-and-RLS acceptance job. Migration
`0005`, its effective privileges, rollback-wrapped owner/cross-user RLS behavior, and the
hybrid RPC were verified in the configured hosted project. Signed-in browser acceptance
also passed profile create, reload/persistence, selection, SQM-aware rank, M42's 30-night
projection, deletion, and cleanup. The P0 Track C vertical slice is live-restored.

#### 1. Repair Supabase table privileges and correct the project record

Root cause: `0004_gear_profiles.sql` creates the table and RLS policies but does not grant
table privileges to `authenticated`. RLS policies do not themselves grant SQL access.
The server loader in `plan/page.tsx` also discards its Supabase select error, making a
permission failure look like an empty list.

Actions:

- Immediately amend `STATE.md` to retract the live-C3 success claim and record the
  browser-visible permission failure.
- Add an idempotent repair migration (prefer a new migration over editing applied
  history) granting `SELECT, INSERT, UPDATE, DELETE` on `public.gear_profiles` to
  `authenticated`.
- Audit privileges for `sessions`, `logged_observations`, `gear_profiles`, `documents`,
  and both search RPCs rather than assuming only the newest table is affected.
- Preserve the existing owner-scoped RLS policies; do not use a service-role key in the
  web app to bypass the problem.
- Surface initial Supabase query errors on `/plan`, `/sessions`, and session detail pages
  instead of converting them into false empty states.
- Generate Supabase TypeScript database types after the schema is repaired, replacing
  the manually maintained row-only types where practical.

Acceptance gate:

- A signed-in user can create a profile, reload and still see it, select it, run a plan
  with hours-needed values, open the 30-night projection, and delete the profile.
- A second user cannot select, update, or delete the first user's profiles.
- The UI shows no permission error and no false “No gear profiles yet” state on query
  failure.
- `STATE.md` records the exact live result, not the HTTP wrapper status.

#### 2. Add database/RLS verification to CI

The current API and web jobs cannot catch migration or privilege failures. Add a database
job using a disposable local Supabase/Postgres instance that:

- applies every migration in order;
- verifies table/RPC grants for `anon`, `authenticated`, and `service_role`;
- tests owner CRUD and cross-user denial for all user-owned tables;
- runs one `hybrid_search` call as an allowed client role;
- fails on migration drift or a missing grant.

This is the systemic fix that prevents a repeat of the C3 false-positive closeout.

### P0 — make chat recommendations trustworthy

#### 3. Bind tools to a trusted observer location

Do not let the model invent latitude and longitude. Make location application state:

- Persist the last explicit `/plan` coordinates and their source (`manual`,
  `geolocation`, or saved session).
- Pass that trusted location to `/api/chat` as request context and bind planning tools to
  it server-side; remove lat/lon from model-controlled tool arguments where possible.
- If no trusted location exists, the planning tool must return a structured
  `location_required` result and the assistant must ask for coordinates before calling
  it.
- Display coordinates and location source in every `planNight` and target-detail tool
  card.
- Update starter prompts: the Auckland prompt may carry explicit Auckland coordinates;
  the generic M31/M42 comparison should use saved context or clearly request location.

Acceptance gate:

- Given the same date and coordinates, `/plan` and `/chat` report the same Bortle class,
  dark window, and target conditions.
- Sending `M1` after a location request cannot trigger a plan with invented coordinates.
- A transcript always makes the location used by each tool call auditable.

#### 4. Enforce literature grounding at the agent-trajectory level

The existing faithfulness tests judge canned answers but do not verify live tool choice.
Add a live-gated agent evaluation with assertions over tool traces:

- science/explanation prompts must call `searchKnowledge` before making scientific claims;
- returned claims must cite displayed titles/bibcodes;
- an empty corpus result must produce an explicit “insufficient corpus evidence” answer;
- planning-only prompts may avoid literature retrieval;
- comparison prompts must call the relevant planning/detail tools for each target.

Harden the system prompt, but do not rely on prompting alone. Consider a response policy
that withholds science prose or performs a required retrieval step when no knowledge tool
result is present. Add cases from the real transcript (M31 versus M42, M101, Alpha
Centauri, and a misspelled Jupiter query).

Acceptance gate: every live eval trajectory satisfies its required tool set, citations
are present when science is discussed, and unsupported facts fail the gate.

### P1 — production reliability and error semantics

#### 5. Introduce target-resolution domain errors

- Define explicit `TargetNotFound`, `UnsupportedTarget`, and upstream-resolution errors.
- Map unresolved names such as `AAA` to 404, unsupported night-planning targets to a
  structured 422/400 response, and actual Simbad/network outages to 502.
- Decide product behavior deliberately for the Moon and Sun. The Moon can be modeled as a
  moving observing target; the Sun needs a daylight/safety-specific flow and should not
  silently enter the deep-sky night planner.
- Add router tests for each category and preserve successful catalog/Simbad fallback
  cases such as M4 and Alpha Centauri.

Also fix the Next.js proxy validators: `Number(searchParams.get("lat"))` turns a missing
parameter into zero. Check parameter presence before numeric conversion and add route
tests for missing, non-finite, and out-of-range values.

#### 6. Protect and instrument the chat endpoint

Before public deployment:

- require a valid Supabase user or implement a deliberate anonymous quota;
- add request/message-size limits, per-user rate limits, and cost/token accounting;
- record structured per-step latency and failure reason without logging private message
  text or secrets;
- reconcile the observed 43-second request with `maxDuration = 30`: reduce sequential
  model/rerank work, increase the supported deployment limit, or return partial progress
  with a bounded timeout;
- exercise the built artifact in the intended hosting environment, not only `next dev`.

The FastAPI projection endpoint should receive similar bounded concurrency/rate
protection because a 60-night request performs repeated Astropy calculations.

#### 7. Persist chat state

The smallest useful fix is client-local persistence with a “Clear conversation” action.
The durable signed-in design is user-owned `chat_sessions` and `chat_messages` tables
with RLS. Whichever is chosen:

- restore messages after navigation/reload;
- version or validate stored AI SDK message parts before hydration;
- do not persist tool payloads or user text without an explicit privacy policy;
- add a reload/navigation test matching the reported empty-chat issue.

#### 8. Clarify observing-site time versus device time

The UI currently says “local time” but formats in the browser/device zone, which can be
misleading when planning a remote site. In the short term, display the explicit device
zone/abbreviation. The preferred product behavior is to derive and show the observing
site's IANA timezone, while retaining UTC in the tooltip.

Add tests for an observer planning Auckland from a device in another timezone, including
date rollover and daylight-saving transitions.

#### 9. Remove the insecure TLS escape hatch

Install/export the local proxy CA and set `NODE_EXTRA_CA_CERTS=<proxy-ca.pem>`, then
remove `NODE_TLS_REJECT_UNAUTHORIZED=0`. Re-run chat, embeddings, reranking, and Supabase
traffic. This is machine configuration and must remain outside committed env files.

### P2 — complete the retention loop and recalibrate with evidence

Only after the live gear/profile path is green:

1. Implement C4(d) `integration_minutes` capture and progress aggregation.
2. Use accumulated outcomes for per-user calibration only after enough real observations
   exist; do not personalize from synthetic data.
3. Re-run hybrid versus LLM-rerank on the current 253-chunk/19-target corpus and add
   planet-labelled cases. Keep BGE opt-in unless it beats the production baseline.
4. Find a real dual-narrowband calibration anchor; retain `0.30` as explicitly
   unanchored until then.
5. Complete the remaining human validation-table cells before marketing numerical
   accuracy.
6. Handle polar continuous-darkness/no-dark-window states structurally.
7. Defer a finer city-core SQM grid until usage or measured-SQM data demonstrates that it
   is worth the data/provenance cost.

## Documentation and operational cleanup

After the P0 fixes, perform one documentation reconciliation pass:

- update the root README to include migrations `0001` through the latest migration and
  remove shipped features from “future scope”;
- replace the stale API README light-pollution gap and endpoint list;
- replace the stale web README visibility-only/getVisibility description with the current
  `/plan`, `/project`, three-tool chat, auth, and gear behavior;
- keep `STATE.md` measured and dated, with failed live checks preserved as corrections;
- document a single live acceptance script covering auth, gear CRUD, plan budgets,
  projection, saved sessions, chat trajectory/citations, and error cases.

## Suggested task sequence

1. Correct `STATE.md` and land the gear grant repair migration.
2. Add authenticated gear CRUD/RLS acceptance tests and a database CI job.
3. Complete the live C3→C4 browser path and record exact output.
4. Bind chat tools to trusted location context and add location-consistency tests.
5. Add trajectory-level grounding/citation evals using the real transcript cases.
6. Fix target error taxonomy and proxy parameter validation.
7. Add chat auth/rate/latency controls and test the production artifact.
8. Add chat persistence and explicit time-zone semantics.
9. Reconcile README/STATE documentation.
10. Start C4(d) progress tracking, then revisit calibration and retrieval measurements.

## What not to change yet

- Do not tune the World Atlas grid or swap q3 aggregation to make city readings look
  darker or brighter; the 0.25-degree limitation is already measured and documented.
- Do not promote the BGE reranker to default; it regressed against the LLM reranker in
  the measured A/B.
- Do not silently change budget constants to fit anecdotal results. Preserve ranges,
  visible assumptions, and the single calibration authority.
- Do not implement per-user calibration before progress/outcome data exists.
- Do not treat HTTP 200 from a server action as proof that the underlying mutation
  succeeded; assert the returned domain result and persisted database state.
