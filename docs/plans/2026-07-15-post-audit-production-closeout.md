# Post-audit production closeout plan

Date: 2026-07-15

Status: planned; implementation has not started. Filing this plan authorizes
documentation only. Credential/provider changes, deployment changes, schema migrations,
and production-data mutations retain their normal explicit authority and evidence gates.

Source record:
[`../evidence/2026-07-15-source-completion-audit.md`](../evidence/2026-07-15-source-completion-audit.md)

## Outcome and release rule

The objective is to move AstroScout from a strong release-candidate beta to a defensible
public-production candidate without weakening its measured honesty, privacy, RLS, or
evaluation boundaries.

Public release should remain blocked until PA-0 through PA-4 are complete and measured.
PA-5 through PA-8 are required for production closeout but can proceed in dependency-safe
parallel after the trust invariants are designed. Deferred product packages enter only
when their stated evidence prerequisites exist.

Every implementation task must:

1. read `NEXT_STEPS_RECOMMENDATIONS.md`, this plan, and the complete `STATE.md` first;
2. preserve failed measurements as dated corrections;
3. add regression tests at the lowest deterministic seam and exercise the built artifact
   where the behavior crosses browser/service boundaries;
4. run the full API and direct-binary web gates before closeout;
5. update the matching `STATE.md` §2/§3/§5 entries without bumping its version;
6. record hosted claims only when the intended deployment was actually exercised; and
7. keep secrets, private message text, tool payloads, cookies, and machine CA paths out of
   committed evidence.

## Work-package ledger

| ID | Priority | Work type | Depends on | Closeout authority |
|---|---|---|---|---|
| PA-0 | release blocker | provider/deployment operations | none | maintainer/provider access |
| PA-1 | P0 | web correctness + persistence validation | none | normal code review; hosted auth acceptance to close |
| PA-2 | P0 | chat trust policy | PA-1 context contract should remain compatible | normal code review + live-gated trajectory acceptance |
| PA-3 | P1 | chat deadlines, accounting, schema/operations | PA-2 action-count contract | migration authority if schema changes; hosted acceptance |
| PA-4 | P1 | planner numerical correctness | none | normal code review + Astropy integration evidence |
| PA-5 | P1 | ingestion design + production-data reconciliation | separate data-plan sign-off | explicit production-data authority |
| PA-6 | P1 | public error and deployment-boundary hardening | PA-1 and PA-3 contracts | normal code review + intended-host smoke |
| PA-7 | P1 | built-artifact browser assurance | stable PA-1–PA-4 behavior | dependency approval if Playwright is added |
| PA-8 | closeout | documentation and live acceptance | PA-0–PA-7 dispositions | maintainer review of final evidence |

## PA-0 — close the credential and key-boundary incident

Priority: release blocker. Nature: provider and deployment operations, not a repository
secret-editing task.

### Objective

Prove that the exposed relay/OpenAI credential is unusable, replace it safely, and verify
that the browser-visible Supabase value is only an anon/publishable credential.

### Scope

- Revoke the earlier relay/OpenAI credential at its provider and obtain provider-side
  confirmation.
- Create a replacement and update Vercel Production and Preview without copying its value
  into a task message, shell transcript, committed file, screenshot, or evidence record.
- Confirm the deployed `NEXT_PUBLIC_SUPABASE_ANON_KEY` is anon/publishable, never
  `service_role` or a Supabase secret key.
- Redeploy and run the canned signed-in chat/accounting/content-free-log smoke.

### Non-goals and safety

- Do not rotate the public Supabase key merely because it is browser-visible.
- Do not put machine CA configuration or credential material in repository env files.
- Do not infer revocation from successful use of the replacement.

### Acceptance criteria

- The provider independently reports the old relay/OpenAI credential revoked or disabled.
- Production and Preview use the replacement and the deployed artifact is identified.
- A signed-in canned chat completes; its numeric usage row reaches a terminal state and
  its structured logs contain no message text, tool payload, or secret fields.
- The Supabase key class is explicitly recorded as publishable/anon, or the wrong-class
  incident is remediated and RLS/privilege acceptance is rerun.
- Evidence records only timestamps, credential labels/fingerprints if provider-safe,
  deployment identifiers, statuses, and test outcomes—never values.

### Rollback and closure evidence

If the replacement fails, restore service only with another newly issued credential; do
not reactivate the exposed value. Close PA-0 in `STATE.md` only after provider revocation
and replacement smoke are both evidenced.

### Disposition — complete 2026-07-16

Provider-side disablement, bounded replacement, Production/Preview environment update,
Ready production deployment, publishable Supabase browser-key classification, and signed-in
chat/accounting/content-free-log acceptance all passed. The provider form's unintended
eleven-token creation and immediate containment are preserved rather than hidden. See
`STATE.md` item 23 and `docs/evidence/2026-07-16-pa0-credential-closeout.md`; neither record
contains credential material. The acceptance wording above clarifies the original
`message/tool/secret fields` shorthand as message text, tool payload, and secret fields;
the content-free schema deliberately retains tool names for per-step instrumentation.

## PA-1 — bind planner results, projection, and saved sessions to one request context

Priority: P0 trust/correctness. Nature: Next.js client state, server actions, Supabase
persistence, and browser acceptance.

### Objective

Make it impossible for a displayed ranking, projection, chat observer context, or saved
session to claim coordinates/date/gear different from the request that generated it.

### Implementation scope

- Introduce an immutable plan-request context containing latitude, longitude, observing
  date, location source, selected gear inputs, and measured SQM where applicable.
- Store that context with the successful `NightPlan` client state. Projection, save, and
  observer-context persistence must consume it rather than mutable form controls.
- Invalidate the active plan, projection, and saved-session binding whenever coordinates,
  geolocation, date, gear, or SQM changes, unless a deliberate UI presents the result as a
  historical snapshot and continues to use its original context.
- Extend `saveSession` to accept and validate `planned_for`; persist the exact planned
  date instead of relying on PostgreSQL `current_date`.
- Add shared runtime validation for session, observation, and gear server actions,
  including finite/bounded numbers and bounded text. Return domain outcomes that
  distinguish success, validation failure, database failure, and no affected row.
- Keep the database RLS model and existing user derivation from Supabase auth.

### Non-goals

- No budget/scoring change, session editor, session deletion UI, or observing-site
  timezone lookup.
- Do not use a service-role key in the web app.

### Acceptance criteria

- Plan Auckland for a future date, then edit either coordinate: Project and Save cannot
  use the stale ranking until a new successful plan, or they demonstrably use and display
  the immutable original context.
- Browser geolocation, gear selection, SQM, and date changes satisfy the same invariant.
- Projection request parameters exactly match the successful ranking context.
- A saved future-date session reloads with the exact requested `planned_for` date and the
  exact coordinates used by the ranking.
- Invalid/oversized action inputs fail before Supabase mutation; a delete/update affecting
  zero rows is not reported as success.
- Anonymous planning remains unchanged; owner/cross-user RLS acceptance stays green.
- Tests cover state invalidation/snapshot behavior, future-date save/reload, action
  validation, and no-op mutation outcomes.

### Evidence

Record deterministic test names, SQL acceptance where touched, and one built-artifact
signed-in browser trajectory using a non-private future date/location. Preserve exact
observed values rather than copying the historical Auckland run.

## PA-2 — make chat target policy complete and action-bounded

Priority: P0 trust. Nature: deterministic policy, shared catalog contract, and live-gated
agent trajectories.

### Objective

Ensure every supported target and common alias enters the correct planning/science flow,
while bounding the number of required tool steps so final output cannot be silently cut
off by `stepCountIs(6)`.

### Implementation scope

- Replace the five-name chat map with one authoritative target/alias contract or a
  drift-proof generated/tested projection of the 21-row API catalog.
- Cover catalog designations, common names, four planets, Moon, accepted misspellings,
  and the deliberate Sun/Sol daylight/safety flow.
- Treat catalog-like unknowns and unrecognized bare names conservatively; do not allow a
  supported-looking prompt to fall through to ungrounded memory prose.
- Compute the required action count before model execution. Define a maximum named-target
  comparison size or deterministic batching/partial-result response that always leaves a
  final response step.
- Keep science retrieval mandatory and planning coordinates server-bound.

### Non-goals

- Do not expand the astronomy catalog, add a solar/daylight planner, or weaken the
  corpus-only science response policy.

### Acceptance criteria

- Table-driven tests cover all 21 catalog rows and their supported common names.
- Bare Saturn, Mars, Venus, Moon, Pleiades/M45, Lagoon/M8, and existing M1/Jupiter cases
  require the intended plan/detail actions.
- Sun/Sol produces the explicit daylight/safety disposition and never enters night
  planning.
- Unknown/catalog-like prompts produce a stable location/unsupported/not-found-safe flow,
  never unsupported model science.
- Multi-target science+planning prompts either complete every declared action plus a final
  response within the step budget or return an explicit bounded partial disposition.
- Live-gated trajectories retain citations and exact observer-context auditing.

### Evidence

Record the full alias/canonical coverage table, offline trajectory results, and opt-in live
results. A prompt-only change without deterministic tests is insufficient.

## PA-3 — enforce end-to-end chat deadlines and durable accounting

Priority: P1 production reliability. Nature: Next.js route, AI SDK tools, external-call
cancellation, Supabase accounting, and operations.

### Objective

Make the declared 55-second budget real across every nested operation and guarantee that
each reserved usage event reaches an auditable terminal or expired state.

### Implementation scope

- Accept the AI SDK tool execution options and propagate `abortSignal` or one absolute
  deadline through planning/detail fetches, embeddings, Supabase retrieval, Cohere, and
  LLM reranking.
- Add explicit timeouts where a client cannot consume the propagated signal. Never leave
  a detached provider request running after the response budget expires.
- Log one terminal request event for invalid observer/messages and every other early exit,
  without logging private content.
- Change usage finalization so a storage failure is retryable/idempotent and cannot be
  hidden by setting an in-memory finalized flag too early.
- Add a reservation lease/expiry or sweeper for abandoned `reserved` rows and compute an
  accurate daily `Retry-After`.
- Record the selected local BGE backend in numeric/content-free accounting if it is used.
- If schema behavior changes, add the next immutable migration and rollback-wrapped
  owner/cross-user acceptance; never rewrite `0006`.

### Non-goals

- Do not store prompts, responses, tool payloads, emails, secrets, or arbitrary JSON.
- Do not raise deployment duration merely to conceal unbounded work.

### Acceptance criteria

- A hanging planning fetch, embedding, Supabase query, Cohere call, and nested LLM call is
  individually faked and shown to abort within the shared deadline plus a small test
  tolerance.
- The route returns a stable timeout/partial-progress disposition before platform
  `maxDuration`, with no detached work observed in the test harness.
- Every accepted request reaches `completed`, `failed`, `timed_out`, or an explicit
  expired status; stale reservations no longer consume quota forever.
- Completion retry is idempotent and capability/owner checks remain intact.
- Each request start has exactly one terminal content-free event, including validation,
  auth, quota, provider, abort, and accounting-store failures.
- Intended-host acceptance measures total and per-step/tool latency under the deployment
  limit and verifies private fields remain absent.

### Evidence and rollback

Preserve the existing 43-second and 22-second historical measurements. Record new timeout
negative controls and hosted latency without private text. A migration must include an
explicit down/rollback strategy for test fixtures even when production rollback is
forward-only.

## PA-4 — make visible-time integration physically bounded

Priority: P1 numerical correctness. Nature: pure/Astropy planning math and regression
tests.

### Objective

Guarantee `0 <= usable_hours <= hours_visible <= dark_hours` for every normal and polar
window without changing unrelated scoring or ephemeris behavior.

### Implementation scope

- Replace inclusive-endpoint sample counting with interval occupancy/integration.
- Document the approximation used at altitude-threshold crossings and keep the sampling
  interval explicit.
- Apply the same bounded result to target detail, ranking, and multi-night projection.
- Add invariant/property-style tests plus focused Astropy cases for always-visible,
  never-visible, threshold-crossing, normal-night, continuous-darkness, and moving targets.

### Non-goals

- No Bortle/SQM artifact, scoring weight, altitude threshold, budget constant, or catalog
  change.

### Acceptance criteria

- The reproduced M81 polar-winter case reports no more than `24.0` visible hours inside a
  `24.0`-hour window.
- All payloads satisfy the bound after rounding, including projection usable hours.
- An always-visible synthetic target converges to the window duration; a never-visible
  target remains zero; threshold crossings have a documented maximum discretization
  error.
- Existing Auckland and planet payload schemas remain compatible, and the full API gate
  plus focused Astropy integration tests pass.

### Evidence

Record before/after probe output and the invariant tests. A cosmetically clamped response
without correcting the integration is not acceptance.

## PA-5 — make corpus ingestion idempotent, resumable, and reconcilable

Priority: P1 data integrity/cost. Nature: provenance-sensitive schema and production-data
work. This package requires its own short plan and maintainer sign-off before any live
write, even though this roadmap defines the objective.

### Objective

Prevent duplicate chunks on rerun, make partial ingestion recoverable, and reconcile the
225 measured exact duplicates without losing distinct literature evidence.

### Phase A — read-only design and inventory

- Re-measure total rows, exact-unique `(target,bibcode,content)` tuples, null bibcodes,
  duplicate groups, near-duplicates, targets, and ingestion metadata available today.
- Define a deterministic normalized content/chunk fingerprint and prove collision and
  source-identity behavior on fixtures.
- Decide whether identity is global or scoped by target/bibcode/source and document how
  changed abstracts/chunking versions create new identities.
- Specify an ingestion-run manifest with status, model/chunker version, target progress,
  retry count, and content-free failure categories.
- Produce a dry-run survivor/delete/backfill manifest and rollback approach. Stop for
  maintainer approval before Phase B.

### Phase B — approved implementation and reconciliation

- Add an immutable migration for the fingerprint/unique constraint and run metadata.
- Convert the misleading insert helper into a real conflict-safe upsert with bounded
  batches, retries, and resume semantics.
- Backfill fingerprints, reconcile only approved exact duplicates, and retain a before/
  after audit. Do not treat near-duplicates as exact without separate evidence.
- Re-run raw/LLM retrieval on one shared candidate snapshot; do not change the production
  backend unless the measured gate supports it.

### Acceptance criteria

- Running identical ingestion twice leaves the second run with zero net new document rows.
- Killing ingestion mid-target and resuming produces the same final identities as one
  uninterrupted run.
- The approved exact-duplicate count reaches zero under the chosen key; distinct sources
  and changed content remain present.
- Writes still require service role; anon/authenticated remain read-only under explicit
  grants and RLS.
- Before/after row counts, hashes/manifests, target counts, retrieval metrics, cost impact,
  and rollback evidence are recorded. No production deletion occurs without a reviewed
  manifest.
- BGE stays opt-in and no budget/Bortle data changes are bundled with this work.

## PA-6 — harden public errors, action outcomes, and private-service identity

Priority: P1 defense in depth. Nature: API/Next error envelopes, server-action contracts,
Supabase types, and deployment topology.

### Objective

Expose stable, non-sensitive public failures and make rate/action identity semantics match
the intended Vercel service architecture.

### Implementation scope

- Replace raw generic exception text in FastAPI and Next proxy 502 responses with stable
  codes/messages; retain exception type/detail only in content-free server logs.
- Verify what `request.client.host` represents across the Vercel private service binding.
  Either pass a trusted, tamper-resistant request identity from the web proxy or define the
  private guard as process/global capacity while the WAF owns per-origin-IP enforcement.
- Reject untrusted forwarded identity headers and document the trust boundary.
- Reuse PA-1's domain mutation outcomes rather than treating wrapper success as database
  success.
- Replace or continuously verify handwritten Supabase schema types with generated types
  where practical.
- Validate LLM reranker indices/scores as bounded integers, deduplicate indices, and define
  deterministic fill/failure behavior for omitted results.

### Acceptance criteria

- Unexpected exceptions return stable 502 bodies with no class name, URL, credential,
  provider body, stack, or raw database message.
- Structured domain errors for target-not-found, unsupported Sun, no-darkness, validation,
  rate, and capacity remain unchanged.
- Intended-host tests prove two originating clients do not accidentally share a per-client
  bucket unless that behavior is explicitly documented; spoofed identity headers fail.
- Server actions distinguish success, not-found/no-op, validation, auth, and database
  failure.
- Generated/schema types have a reproducible command and CI drift check, or the reason for
  retaining manual types is documented with an equivalent drift test.

## PA-7 — automate the built-artifact user journey

Priority: P1 assurance. Nature: browser E2E, local services/fixtures, and CI.

### Objective

Catch cross-component regressions that unit, SQL, and build checks currently miss while
keeping live providers opt-in and private data out of fixtures.

### Implementation scope

- Add the smallest maintainable browser runner, subject to dependency review.
- Exercise `next build` plus `next start`, a deterministic FastAPI service, and a
  disposable/seeded database or faithful local auth/data stand-in.
- Cover anonymous/signed-in boundaries, gear CRUD, future-date planning, input
  invalidation, projection-context equality, session save/reload, observation minutes,
  chat text restoration/Clear, device-zone rendering, and stable public error cases.
- Keep real OpenAI/relay, Simbad, magic-link delivery, and hosted WAF tests in the canonical
  opt-in live runbook; deterministic E2E should stub them at documented seams.

### Acceptance criteria

- CI runs the built artifact and fails on the A2/A3 provenance regressions.
- Reload/navigation tests prove saved-session and text-only chat persistence without
  storing tool payloads.
- Tests are timezone-explicit, deterministic, non-private, and do not require external
  network or production credentials.
- Failure artifacts redact cookies, tokens, email, prompt text beyond canned fixtures,
  provider payloads, and secrets.
- Existing API/web/database gates remain independent and green.

## PA-8 — reconcile documentation and perform final acceptance

Priority: production closeout. Nature: documentation, hosted acceptance, and status
truthfulness.

### Objective

Make the public and authoritative records match measured post-audit behavior and produce
one release decision with explicit residual risk.

### Scope

- Update root/API/web READMEs, `STATE.md`, `NEXT_STEPS_RECOMMENDATIONS.md`, the live
  runbook, and this ledger only after their associated behavior is measured.
- Add future-date saved-session and changed-location invalidation checks to the canonical
  live journey.
- Record credential closure, migration head, deployed commit/origin, browser/device zone,
  corpus counts, chat timeout/accounting evidence, and public error behavior without
  secrets or private text.
- Preserve every earlier failed check and superseding correction.

### Acceptance criteria

- PA-0 through PA-7 each has a dated disposition: complete with evidence, explicitly
  deferred with owner/entry criterion, or blocked with the exact missing prerequisite.
- The full API, web, database, focused Astropy, deterministic browser, opt-in live agent,
  and canonical intended-host acceptance results are recorded separately; skipped/live
  cases are not counted as local passes.
- README claims no longer say “everything” is complete while a release blocker remains.
- `STATE.md` stays measured and dated, its version is not bumped by the agent, and its
  file tree/migration/eval counts match the checkout.
- The final release decision states whether public deployment is accepted, conditionally
  accepted, or rejected and names every residual risk.

## Deferred product packages and entry criteria

These are not part of the production-reliability critical path unless new evidence changes
their priority.

### PD-1 — observing-site IANA timezone

Objective: derive and display the observing site's timezone while retaining device time
and UTC provenance. Entry criterion: approve an offline dataset or bounded service and its
update/privacy behavior. Acceptance must cover Auckland viewed elsewhere, international
date rollover, both hemispheres, DST transitions, ocean/border coordinates, lookup
failure, and an explicit fallback. Do not relabel device time as site-local before lookup
succeeds.

### PD-2 — dark-nebula taxonomy

Objective: separate emission-background silhouettes from broadband dust so filter coupling
does not depend on the IC434 special case. Entry criterion: approve the taxonomy and a
catalog migration/mapping plan. Acceptance requires pure kind/filter tests, unchanged
legacy identity mapping, and measured budget effects without tuning constants to anecdotes.

### PD-3 — calibration and city-grid work

Objective: improve estimates only when evidence supports it. Entry criterion for per-user
calibration is enough real non-synthetic outcome-quality rows plus a maintainer-approved
sufficiency threshold. Entry criterion for a finer city grid is measured usage/SQM error
evidence plus a provenance plan. Any grid task requires the AGENTS.md data-task plan,
sign-off, SHA-256, shape/dtype, named-city readings, and full histogram. Until then,
measured SQM remains the mitigation and no constants/artifacts change.

## Stop conditions

Stop and request maintainer direction before:

- any provider credential, Vercel environment, WAF, or hosted migration mutation without
  the required authority;
- any production corpus delete/backfill/unique-constraint application before the PA-5
  dry-run manifest is approved;
- changing `dual_nb=0.30`, another budget/scoring constant, the reranker default, or a
  Bortle/SQM artifact;
- defining a calibration sufficiency threshold or human evidence verdict; or
- expanding scope into a solar/daylight planner, durable server-side chat storage, or a
  new external timezone service without a product decision.
