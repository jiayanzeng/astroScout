# AstroScout project review and recommended next steps

Date: 2026-07-15

**Execution rule (added 2026-07-15):** read this document in full before starting work
from it. Follow the corrected ordering below and preserve measured failures as dated
corrections rather than rewriting the original review.

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

### Documentation and operational cleanup — prerequisite before P1

After the P0 fixes, perform one documentation reconciliation pass:

- update the root README to include migrations `0001` through the latest migration and
  remove shipped features from “future scope”;
- replace the stale API README light-pollution gap and endpoint list;
- replace the stale web README visibility-only/getVisibility description with the current
  `/plan`, `/api/project` → `/plan/project`, three-tool chat, auth, and gear behavior;
- keep `STATE.md` measured and dated, with failed live checks preserved as corrections;
- document a single live acceptance script covering auth, gear CRUD, plan budgets,
  projection, saved sessions, chat trajectory/citations, and error cases.

**Sequencing correction and completion (2026-07-15):** the original review placed this
section after P2 and task 9 in the suggested sequence, so P1 was completed before this
prerequisite. That ordering was wrong. The reconciliation is now complete in the root,
API, and web READMEs; [`docs/live-acceptance.md`](docs/live-acceptance.md) is the canonical
hosted journey; and `STATE.md` records this as documentation-only closeout. The original
failed live checks and P1 deployment corrections remain intact. This completion does not
retroactively claim that reconciliation preceded P1.

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

**Implementation/acceptance status (2026-07-15):** P1 is complete. Planning and
visibility routers distinguish not-found, unsupported/daylight, and upstream failures;
Moon and Sun have deliberate separate product behavior; and every Next proxy validates
presence before numeric conversion. Authenticated chat now has bounded input, atomic
per-user quotas, content-free token/cost/latency accounting, bounded model work, and a
60-second deployment contract. Projection has process-local concurrency/rate guards plus
a production WAF limit. Versioned text-only chat history, Clear conversation, explicit
device-zone labels/UTC tooltips, and their reload/navigation/DST tests are shipped.
Migration `0006`, the two-service Vercel artifact, stable-origin error cases, WAF 429,
signed-in chat, accounting, structured logs, and reload/navigation behavior all passed
hosted acceptance. The insecure TLS override is absent; chat, embeddings, reranking, and
Supabase were re-run with normal validation through a machine-only `NODE_EXTRA_CA_CERTS`
bundle. Exact measured results and the deliberately deferred credential follow-up remain
in `STATE.md`.

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

**Implementation/evidence status (2026-07-15):** repository work, hosted migration, and
production artifact acceptance are complete. Migration `0007` passed rollback-wrapped
owner/cross-user acceptance. Optional non-negative integration minutes now feed an
owner-scoped progress RPC and signed-in plan/session UI. Production browser acceptance
saved 120 minutes for M42, restored the `2.0 h` / `3–6%` aggregate after a hard reload,
displayed `120 min integration` in the saved session, and removed the temporary gear
profile. The acceptance observation is retained but explicitly excluded from calibration.
Polar summer returns structured `no_astronomical_darkness`; continuous polar night uses a
labelled bounded 24-hour window. The live 18-case retrieval A/B measured the actual corpus
at **684 rows / 19 targets**, not 253; 225 rows are exact duplicates. LLM reranking improved
all-case recall@3 from **0.44 to 0.63** and planet recall@3 from **0.75 to 1.00**, so the
production baseline is unchanged and BGE remains opt-in. The dated details are in
[`docs/evidence/2026-07-15-p2-evidence.md`](docs/evidence/2026-07-15-p2-evidence.md).

The evidence pass found no controlled dual-narrowband equal-quality time ratio, so
`dual_nb=0.30` remains explicitly unanchored. The remaining community validation rows now
contain measured model outputs and explicit inconclusive dispositions; they do not support
marketing numerical accuracy. Per-user calibration remains deliberately blocked until
real non-synthetic outcomes and a maintainer-approved sufficiency threshold exist. A finer
city-core grid remains deferred pending measured usage/provenance evidence. The 684-row
corpus duplication itself is a newly measured ingestion/idempotency follow-up, not silently
cleaned as part of P2.

## Suggested task sequence — completion ledger

All executable items in this dated sequence completed on 2026-07-15. Item 10 closed with
measured implementation and explicit evidence-based deferrals rather than unsupported
calibration or data tuning.

1. ✅ Correct `STATE.md` and land the gear grant repair migration.
2. ✅ Add authenticated gear CRUD/RLS acceptance tests and a database CI job.
3. ✅ Complete the live C3→C4 browser path and record exact output.
4. ✅ Bind chat tools to trusted location context and add location-consistency tests.
5. ✅ Add trajectory-level grounding/citation evals using the real transcript cases.
6. ✅ Reconcile README/STATE documentation and land the canonical live-acceptance runbook.
7. ✅ Fix target error taxonomy and proxy parameter validation.
8. ✅ Add chat auth/rate/latency controls and test the production artifact.
9. ✅ Add chat persistence and explicit time-zone semantics.
10. ✅ Implement C4(d) progress tracking and complete the evidence-based calibration and
    retrieval review, preserving the documented blocks/deferrals.

## Post-audit production-closeout workstream — open 2026-07-15

The completion ledger above remains the measured history of the original review. A later
source-completion audit found additional correctness and reliability gaps that were not in
that ten-item acceptance scope; it does not retroactively mark the original work undone.

Read the filed evidence first:
[`docs/evidence/2026-07-15-source-completion-audit.md`](docs/evidence/2026-07-15-source-completion-audit.md).
The implementation contract for every new task—including objective, dependencies,
non-goals, acceptance criteria, evidence, rollback, and stop conditions—is:
[`docs/plans/2026-07-15-post-audit-production-closeout.md`](docs/plans/2026-07-15-post-audit-production-closeout.md).

The new ledger is deliberately open:

1. [ ] **PA-0 — credential/key-boundary incident closure:** obtain provider-side relay
   credential revocation, deploy a replacement without recording it, verify the Supabase
   browser key is publishable/anon, and rerun signed-in chat/accounting/log acceptance.
2. [ ] **PA-1 — immutable plan provenance and saved date:** bind ranking, projection,
   observer context, and save to one request snapshot; persist the requested
   `planned_for`; validate server-action input and affected-row outcomes.
3. [ ] **PA-2 — complete/bounded chat target policy:** cover all 21 supported targets and
   common aliases, preserve Sun/Moon behavior, and ensure required actions plus final
   output fit the declared trajectory budget.
4. [ ] **PA-3 — real chat deadline and durable accounting:** propagate abort/deadline
   through every nested planning/retrieval/rerank call, terminally log all exits, and add
   idempotent completion plus stale-reservation recovery.
5. [ ] **PA-4 — bounded visible-time integration:** replace inclusive endpoint counting
   and prove `0 <= usable_hours <= hours_visible <= dark_hours` for normal, moving-target,
   threshold-crossing, and polar cases.
6. [ ] **PA-5 — idempotent/resumable ingestion and corpus reconciliation:** complete a
   read-only duplicate/fingerprint design and approved dry-run manifest before any schema
   or production-data mutation; then prove reruns and resumes add no duplicates.
7. [ ] **PA-6 — public/deployment boundary hardening:** sanitize generic errors, verify
   private-service client identity, make action/reranker outcomes explicit, and control
   Supabase type drift.
8. [ ] **PA-7 — built-artifact browser assurance:** add deterministic CI coverage for
   auth boundaries, gear, future-date plan/save, changed-input invalidation, projection,
   sessions/progress, chat persistence, timezone labels, and stable errors.
9. [ ] **PA-8 — measured documentation and release closeout:** rerun the full local,
   database, browser, live-agent, and intended-host gates; preserve failures; reconcile
   README/STATE/runbook claims; and state the final release decision and residual risks.

PA-0 through PA-4 block an unconditional public-release claim. PA-5 requires the separate
data/provenance sign-off mandated by `AGENTS.md`; filing this roadmap is not authority to
delete or backfill production rows. Observing-site timezone lookup, dark-nebula taxonomy,
per-user calibration, and city-grid work remain evidence-gated product packages with entry
criteria in the detailed plan.

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
