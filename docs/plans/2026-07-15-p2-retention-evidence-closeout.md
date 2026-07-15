# P2 plan — retention loop and evidence closeout

Date: 2026-07-15
Status: awaiting maintainer sign-off; no live code, schema, calibration, or data edits yet

## Ground truth and scope

- `NEXT_STEPS_RECOMMENDATIONS.md` was read in full before this plan, followed by the
  complete authoritative `STATE.md` and the implementation seams named below.
- P0, the documentation prerequisite, and P1 are already implemented and measured in
  `STATE.md` items 17–20. Do not redo them or rewrite their failed/superseding evidence.
- The executable remaining work is P2: C4(d) observation progress, a grown-corpus
  retrieval rerun with planet cases, calibration evidence review, and structural polar
  dark-window behavior.
- Per-user calibration is still blocked: the database has no `integration_minutes` field
  yet, so no qualifying real outcome history can exist. A finer city-core SQM grid is an
  explicit evidence-gated deferral. Neither will be manufactured in this task.
- The exposed-credential follow-up is outside this request and remains deferred exactly
  as recorded in `STATE.md`.

## Phase 1 — C4(d) observation progress

1. Add immutable migration `0007` with nullable, integer, non-negative
   `logged_observations.integration_minutes`. Preserve all existing owner RLS and grants;
   do not edit applied migrations.
2. Extend the rollback-wrapped Track C SQL acceptance to prove owner insert/read of
   minutes, reject negative values, and preserve cross-user denial and session ownership.
3. Extend the web observation type and `logObservation` action. Validate optional minutes
   as a finite non-negative integer before calling Supabase.
4. Load the signed-in user's target/minute rows on `/plan`, surfacing read errors rather
   than converting them to zero. Add a pure target-normalized aggregator with unit tests.
5. Add a minimal per-target optional minutes input beside **Log** after a session is saved.
   On success, update local progress without a full reload. Display accumulated hours
   against the selected plan's modeled low/high range, with recorded time and modeled time
   clearly labelled as different evidence types.
6. Show integration minutes on session detail. Do not add calibration or silently alter
   any budget constant from the new field.

Acceptance: owner progress survives reload and sums across sessions; empty minutes remain
valid; negative/non-integer inputs fail before mutation; cross-user access remains denied;
gearless/anonymous planning is unchanged.

## Phase 2 — polar dark-window domain behavior

The observed current failure is not hypothetical: at 78.2232° N on 2026-06-21 and at
89.9° in solstice cases, Astroplan returns masked twilight events and `dark_window`
currently crashes with a masked-array `TypeError`, which routers convert to 502.

1. Classify a 24-hour sample of solar altitude relative to astronomical twilight
   (`-18°`) as normal, continuous astronomical darkness, or no astronomical darkness.
2. Preserve the existing dusk/dawn response for normal nights.
3. For continuous astronomical darkness, use a labelled, bounded 24-hour planning window
   and expose a structured status; do not invent dusk/dawn crossings.
4. For no astronomical darkness, raise a dedicated domain condition and map it to a
   structured 422 product-state response rather than 502. Apply the same semantics to
   night ranking, target detail, and projection.
5. Add pure classification tests, router mapping tests, and integration tests at polar
   solstice coordinates. Update the web types/rendering only where the structured status
   needs to be visible.

Acceptance: normal Auckland payloads remain compatible; polar summer is a stable
non-502 product response; continuous darkness is explicitly labelled and bounded; no
masked-time value reaches scoring.

## Phase 3 — retrieval measurement on the actual corpus

1. Add labelled Jupiter, Saturn, Mars, and Venus cases to `evals/dataset.ts` and matching
   explicitly synthetic offline stand-in blurbs/keywords. Keep planet cases separately
   reportable so a larger dataset cannot hide regressions.
2. Make the live raw-hybrid versus LLM-rerank comparison the default live A/B. Keep the
   already-regressing BGE arm behind an explicit eval flag; do not promote it or add a
   dependency.
3. Measure the live corpus row and distinct-target counts before the run instead of
   assuming the historical `253 chunks / 19 targets` label.
4. Run raw hybrid and LLM rerank over one shared first-stage snapshot, once per case, using
   the existing ignored local environment. Record aggregate, exact, semantic, and planet
   subgroup recall@3/MRR/nDCG@5. Keep generated `report.json` ignored.
5. Adopt no retrieval-default change unless the measured harness supports it. A network,
   TLS, credential, or corpus prerequisite failure is reported as a failed live check, not
   replaced with offline numbers.

## Phase 4 — calibration and validation evidence

1. Research traceable community reports for a dual-narrowband comparison that states
   enough of target, sky/SQM or Bortle, optics/f-ratio, filter/bandpass, and integration
   outcome to derive a defensible time ratio. Record links, quoted conditions in
   paraphrase, and comparability limits.
2. Compute the current model output for every unfilled validation row without changing
   constants. Where a report says only “Bortle 8/9” or “typical target,” report a range or
   ambiguity instead of choosing a convenient point/kind.
3. If no qualifying dual-NB anchor exists, retain `0.30` and close the search as
   evidence-not-found with the reviewed sources listed. If a qualifying anchor exists,
   stop and present its derivation for a second maintainer sign-off before changing
   `budget.py`.
4. Do not label the remaining validation cells PASS/FAIL as “human reviewed” without the
   maintainer's explicit verdict. Numerical model cells may be filled as measured model
   output; human verdict cells remain pending when evidence is ambiguous.

## Phase 5 — live rollout and truthful closeout

1. Run focused tests, then the complete API and direct-binary web gates. Do not alter
   `bortle_grid.npy`, `sqm_grid.npy`, dependencies, or the production retrieval default.
2. After repository verification, apply migration `0007` to the configured hosted
   Supabase project and run rollback-wrapped owner/cross-user acceptance without retaining
   fixture rows.
3. Deploy the intended Vercel artifact and exercise signed-in minutes capture, progress
   persistence, normal planning, polar product states, and the canonical error smoke.
4. Update `STATE.md`, all migration/setup references, and
   `NEXT_STEPS_RECOMMENDATIONS.md` with dated observed results. Preserve failures and mark:
   - per-user calibration blocked until a maintainer-approved sufficiency threshold and
     enough real, non-synthetic outcome rows exist;
   - finer city-core SQM resolution deferred pending evidence;
   - calibration verdicts pending if the evidence review cannot honestly close them.
5. Do not bump the `STATE.md` version. Commit and push only the reviewed implementation
   and measured documentation.

## Stop conditions requiring maintainer input

- Any change to `dual_nb=0.30` or another budget/calibration constant.
- A proposed definition of “enough” observations for per-user calibration.
- A request to regenerate or replace either committed light-pollution grid.
- Missing hosted/database authority that prevents migration or production acceptance.
- Ambiguous community evidence that requires a human PASS/FAIL judgment.
