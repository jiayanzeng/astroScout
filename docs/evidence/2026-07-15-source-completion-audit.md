# Source completion audit — 2026-07-15

Status: filed source-review record; no application, schema, credential, or production-data
change was made by this audit.

Checkout reviewed: `main` at `306cd7422b62216c21934d86e1551884adb25348`, aligned
with `origin/main` when the review began.

## Purpose and evidence boundary

This record answers whether the repository is complete enough for public production. It
reviews the current implementation rather than treating the completion labels in
`STATE.md` or `NEXT_STEPS_RECOMMENDATIONS.md` as proof by themselves.

The review covered the FastAPI planning and target-resolution paths, the Next.js planner,
session and gear actions, chat policy and tools, RAG ingestion/retrieval, Supabase
migrations and RLS, deployment configuration, CI, tests, and the reconciled project
documentation. Local source and executable checks are current to this checkout. Hosted
Supabase, OpenAI/relay, Simbad, and Vercel behavior was not re-exercised during the audit;
hosted statements remain dated evidence from `STATE.md`, not newly observed live state.

No credential value, private prompt, tool payload, auth material, or secret was read into
or written to this record.

## Overall judgment

AstroScout is a strong release-candidate beta, not a production-complete public release.
The planned P0–P2 vertical slice is substantially implemented: planning, moving targets,
target-domain errors, gear-aware budgets, multi-night projection, Supabase auth/RLS,
saved sessions and observations, progress, grounded chat, quotas/accounting, local chat
persistence, and deployment configuration all exist. The local gates are healthy.

Public-release confidence is nevertheless blocked by the deferred credential incident
follow-up and by source-level trust/reliability gaps that the dated acceptance journey did
not exercise. The original ten-item completion ledger remains valid for its historical
scope; this audit opens a separate post-audit workstream rather than rewriting that history.

## Current executable evidence

The following results were measured from the reviewed checkout:

| Check | Result |
|---|---:|
| API dependency resolution | `uv sync` succeeded |
| Ruff lint | passed |
| Ruff format check | 48 files already formatted |
| strict mypy | 29 source files clean |
| API CI-safe tests | 99 passed, 19 deselected |
| focused Astropy polar/moving-target integration | 6 passed, 5 deselected |
| web TypeScript | passed |
| web ESLint | passed |
| web Vitest | 83 passed, 11 live-gated cases skipped |
| Next.js production build | passed, 14 routes |

The first sandboxed Next.js build attempt failed because Turbopack could not bind an
internal worker port (`Operation not permitted`). The permitted worker-capability rerun
compiled and generated all 14 routes. That correction is part of the measured record and
is not presented as a first-attempt pass.

## Material findings

| ID | Priority | Finding | Direct evidence | Consequence |
|---|---|---|---|---|
| A1 | release blocker | Relay/OpenAI revocation and deployed Supabase key-class confirmation remain deferred | `STATE.md` §5 credential follow-up | Public release lacks provider-side incident closure |
| A2 | P0 trust | Planner results are not bound to an immutable request context | latitude/longitude/geolocation changes do not clear the plan; projection and save read current controls | displayed targets can be projected or saved under different coordinates |
| A3 | P0 correctness | Saved sessions omit the selected observing date | `saveSession` sends title/coordinates only; `sessions.planned_for` defaults to `current_date` | a future plan is persisted as the save date |
| A4 | P0 trust | Deterministic chat target extraction covers only a subset of the 21-target catalog | the map names M31, M42, M101, Alpha Centauri, and Jupiter; a probe gave no required tools for bare Saturn, Mars, Moon, or Pleiades | supported targets can bypass required detail/planning tools |
| A5 | P1 reliability | The declared 55-second chat timeout is not propagated through nested tools | AI SDK tool executors receive an abort signal, but current executors and downstream fetch/model/RPC work ignore it | nested planning, embedding, retrieval, and reranking can outlive the intended budget |
| A6 | P1 data | Knowledge ingestion is insert-only and non-resumable despite the helper name `upsert_documents` | PostgREST uses plain `Prefer: return=minimal`; `documents` has no deterministic fingerprint/unique constraint | reruns created 225 measured exact duplicates and partial failures cannot resume safely |
| A7 | P1 numerical | Inclusive endpoint sampling overcounts visible duration | a targeted M81/polar-winter probe returned `24.3` visible hours inside a `24.0`-hour dark window | API and projection payloads violate a basic time bound |
| A8 | P1 durability | Chat reservations can remain `reserved` and some early validation exits lack terminal request logs | no reservation lease/sweeper; completion is single-attempt; invalid observer/messages return without terminal logging | quota/accounting and latency records can become incomplete |
| A9 | P1 deployment | FastAPI's per-peer projection key may represent the private web service rather than the originating client | limiter uses `request.client.host` behind a Vercel private service binding | the nominal per-client limit may collapse into a per-worker/shared bucket |
| A10 | P1 assurance | Core user journeys have no automated built-artifact browser test | CI has database, API, web unit, and build jobs but no Playwright/Cypress journey | future-date save, stale-input provenance, navigation, and rendered chat regressions can escape CI |

Targeted audit probes preserved with this finding set:

```text
Saturn       -> no classified target, no required tool action
Mars         -> no classified target, no required tool action
Moon         -> no classified target, no required tool action
Pleiades     -> no classified target, no required tool action
M45          -> planNight + getTargetDetail(M45)
M81 @ 89.9N  -> dark_hours=24.0, hours_visible=24.3
```

## Secondary hardening and documentation drift

- Generic FastAPI and Next proxy 502 paths expose raw exception messages rather than a
  stable public error envelope with private server-side diagnostics.
- Authenticated server actions have incomplete runtime validation and text-size bounds;
  gear deletion returns success without proving that a row was affected.
- The LLM reranker accepts non-integer, duplicate, omitted, or unbounded ranking entries;
  malformed provider output can silently shorten or duplicate results.
- The local BGE reranker does not add a backend usage record, leaving accounting backend
  attribution incomplete even though its monetary cost is zero.
- The `STATE.md` file tree omitted migration `0007` and described the eval dataset as 14
  cases even though the current dataset has 18 including four planet cases. Those entries
  are corrected as part of filing this record.
- The root README and the opening of `STATE.md` used an over-broad “everything is built
  and tested” claim. The authoritative state is narrowed now; the public README should be
  reconciled only after the post-audit fixes are measured.

## Deliberate non-findings and preserved boundaries

- The Moon/Sun product split, target-domain 404/422/502 mapping, proxy presence-first
  numeric validation, public `/plan`, authenticated chat, RLS ownership, text-only local
  chat persistence, device-zone labeling, and the committed `0001`–`0007` migration chain
  are implemented and covered by existing tests/evidence.
- This audit does not justify changing the Bortle/SQM artifacts, budget constants,
  `dual_nb=0.30`, or the production reranker. BGE remains opt-in because the measured A/B
  regressed against the LLM reranker.
- Per-user calibration remains blocked until real non-synthetic outcome-quality evidence
  and a maintainer-approved sufficiency threshold exist.
- Corpus deduplication is a production-data mutation. Diagnosis may be read-only, but no
  row deletion, backfill, or uniqueness migration may occur without a separate approved
  data/provenance plan and rollback evidence.

## Planned response

The specific work packages, dependencies, non-goals, acceptance criteria, and evidence
requirements are filed in
[`../plans/2026-07-15-post-audit-production-closeout.md`](../plans/2026-07-15-post-audit-production-closeout.md).
`NEXT_STEPS_RECOMMENDATIONS.md` retains its original completion history and now points to
that post-audit workstream. `STATE.md` remains the authoritative status board.
