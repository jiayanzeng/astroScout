# AstroScout — Track C: Feasibility Ranking (integration budget + nights-to-finish)

The paid slice. Given the observer's Bortle sky (already O(1) offline), a target's kind
(already in the catalog), and a minimal gear profile (f-ratio + filter type), estimate
the total integration hours the target needs from *that* sky, project the usable
imaging hours per upcoming night (moon- and filter-aware), and answer the question no
free tool answers: **"how many nights will this take me, and should I start tonight?"**

Ordering rationale: Track C starts only after **Task 0** (CI is red — nothing ships over
a red pipeline) and preferably Task 1. C1 is pure math, offline-verifiable, and demoable
standalone; C2 builds the astropy projection on top of it; C3 is the persistence leg and
runs in parallel with C2; C4 is the UI assembly and additionally depends on Task 4
(the `light_sensitivity` column is the free-tier storefront for this feature).

Every task prompt assumes Cline reads `STATE.md` first. Each task adds/updates a
"Track C" item under STATE.md §5 when done. Project rules that bind hardest here:
rule 1 (honesty over polish — every constant below is a labelled community-anchored
estimate, and outputs are **ranges**, never point estimates) and the eval-before-claims
rule (C1's validation table is the eval; fill it before marketing any number).

Monetization wiring (Stripe, plan gating) is deliberately **not** in Track C. Ship the
value behind the existing Supabase auth first; billing is its own later track.

---

## C-gate — validate in the community before writing code (no-code, ~1 week)

Not a Cline task. Post in Cloudy Nights (Beginning Deep Sky Imaging) and
r/AskAstrophotography with 2–3 mockups of the nights-to-finish table and one direct
question: *"would this have changed what you pointed at last new moon?"*

- Disconfirming signal: the "it depends" culture rejecting any estimate as false
  precision. Mitigation is already designed in — labelled ranges + visible assumptions.
- "My numbers are different" is engagement, not rejection; it seeds the v2 retention
  hook (calibrate estimates from the user's own logged results).
- Proceed to C1 if replies engage with the *concept* even while disputing constants.

---

## Outline

| # | Task | Type | Depends on | Verifiable offline? |
|---|------|------|-----------|---------------------|
| C1 | `budget.py` pure integration-budget module + tests + validation table | feature | Task 0 | yes |
| C2 | Multi-night projection + `GET /plan/project` | feature | C1 | pure parts yes; astropy loop CI-safe, live route `integration`-marked |
| C3 | `gear_profiles` migration + minimal web gear UI | feature | Task 0 (parallel with C2) | SQL by inspection; web checks yes |
| C4 | Hours-needed column in `/plan` + nights-to-finish in target detail (+ progress, stretch) | feature | C2, C3, Task 4 | yes |

---

## Task C1 — `budget.py`: pure integration-time budget estimator (offline-verifiable)

**Prompt for Cline:**

> Read `STATE.md` fully first (§2 rules 1 & 10, §3 `scoring.py`). This task adds ONE new
> pure module plus its tests. No changes to existing behavior, no new dependencies, no
> network. Model it on `scoring.py`: zero-dep deterministic core, constants tunable in
> one place, every approximation labelled in comments/docstrings.
>
> **New file `apps/api/src/astroscout_api/budget.py`** (named `budget`, NOT
> `integration`, to avoid collision with the pytest `integration` marker vocabulary).
> Module docstring: pure integration-time budget estimation; community-anchored
> heuristics, not radiometric truth; outputs are ranges by design.
>
> Constants (all module-level, `ruff` line-length 100, `mypy --strict` clean):
>
> ```python
> from typing import Literal
>
> FilterKind = Literal["broadband", "dual_nb", "mono_nb"]
> QualityTier = Literal["clean", "showcase"]
>
> # APPROXIMATION: Bortle <-> SQM (mag/arcsec^2) is a coarse published mapping with
> # real-world variance of +/-0.3 or more; midpoints chosen here. The Bortle input
> # itself is the modeled grid estimate (see bortle/), so errors compound — this is
> # exactly why hours are reported as ranges.
> BORTLE_TO_SQM: dict[int, float] = {
>     1: 21.9, 2: 21.7, 3: 21.5, 4: 21.0, 5: 20.4, 6: 19.5, 7: 18.8, 8: 18.0, 9: 17.5,
> }
> REF_SQM = 21.5        # Bortle 3 "reasonable dark site" reference
> REF_F_RATIO = 5.0     # reference optics speed
> SNR_TIME_BASE = 2.512 # hours scale as SNR_TIME_BASE ** (REF_SQM - sqm) — the
>                       # community-standard SQM-ratio rule (equal-SNR time scaling)
>
> # Reference integration hours (low, high) for tier="clean" at REF_SQM with an
> # f/REF_F_RATIO broadband rig. Anchored to community consensus bands (see the
> # validation table added by this task), not derived from first principles.
> BASE_HOURS_BY_KIND: dict[str, tuple[float, float]] = {
>     "open cluster": (1.0, 2.0),
>     "globular cluster": (1.5, 3.0),
>     "planetary nebula": (2.0, 4.0),
>     "emission nebula": (2.0, 4.0),
>     "nebula": (2.0, 4.0),
>     "galaxy": (4.0, 8.0),
>     "dark nebula": (6.0, 12.0),
> }
> DEFAULT_BASE_HOURS: tuple[float, float] = (2.0, 4.0)
> SHOWCASE_MULTIPLIER = 2.5  # "showcase" tier vs "clean" tier
>
> # Fraction of the sky-brightness gap a filter still exposes you to, for
> # emission-line targets. 1.0 = broadband (full LP exposure); smaller = the filter
> # rejects most skyglow. Calibrated so mono_nb from Bortle 9 lands near broadband
> # from Bortle 4 — matching the community report that 3nm Ha under a half-moon
> # Bortle 9 sky was indistinguishable from moonless Bortle 4.
> LP_COUPLING: dict[str, float] = {"broadband": 1.0, "dual_nb": 0.30, "mono_nb": 0.12}
>
> # Kinds where narrowband coupling applies. NOTE: the catalog's only "dark nebula"
> # is IC434 (Horsehead), a silhouette against Ha emission, so it is included here;
> # revisit when the catalog gains true broadband-only dust clouds (backlog B4).
> EMISSION_KINDS = frozenset({"emission nebula", "nebula", "planetary nebula", "dark nebula"})
>
> # Per-filter moon-interference weight (consumed by the C2 night projector).
> MOON_WEIGHT: dict[str, float] = {"broadband": 1.0, "dual_nb": 0.35, "mono_nb": 0.15}
> ```
>
> API (all pure, all clamping out-of-range inputs rather than raising):
>
> ```python
> @dataclass(frozen=True)
> class HoursEstimate:
>     low: float                 # rounded to 1 decimal
>     high: float
>     lp_multiplier: float       # factor breakdown kept visible on purpose (rule 1)
>     optics_multiplier: float
>     tier_multiplier: float
>     filter_mismatch: bool      # True when a NB filter was requested for a
>                                # non-emission kind; LP coupling then falls back to
>                                # broadband and the UI should warn.
>
> def sqm_for_bortle(bortle: int) -> float            # clamp bortle to 1..9
> def lp_time_multiplier(bortle: int, filter_kind: FilterKind, kind: str) -> float
>     # coupling = LP_COUPLING[filter_kind] if kind.lower() in EMISSION_KINDS else 1.0
>     # return SNR_TIME_BASE ** (max(0.0, REF_SQM - sqm_for_bortle(bortle)) * coupling)
> def optics_time_multiplier(f_ratio: float) -> float # (clamp(f_ratio,1,32)/REF_F_RATIO)**2
> def usable_hours(hours_visible: float, moon_illumination: float,
>                  moon_separation_deg: float, filter_kind: FilterKind) -> float
>     # mirrors scoring.py's moon_term but filter-weighted:
>     # proximity = max(0, 1 - sep/90); penalty = illum * proximity * MOON_WEIGHT[filter]
>     # return round(hours_visible * max(0.0, 1.0 - penalty), 1)
> def hours_needed(kind: str, bortle: int, f_ratio: float,
>                  filter_kind: FilterKind = "broadband",
>                  tier: QualityTier = "clean") -> HoursEstimate
>     # base = BASE_HOURS_BY_KIND.get(kind.lower(), DEFAULT_BASE_HOURS)
>     # low/high = base * lp_mult * optics_mult * tier_mult, rounded to 1 decimal
> ```
>
> **New file `apps/api/tests/test_budget.py`** (CI-safe, no network, no astropy).
> Cover at minimum:
> 1. SQM-rule exactness: for broadband, `lp_time_multiplier(4,...) /
>    lp_time_multiplier(7,...)`... rather, the B7-vs-B4 multiplier ratio equals
>    `SNR_TIME_BASE ** (sqm_for_bortle(4) - sqm_for_bortle(7))` and lands in the
>    community-reported ~5–9x band.
> 2. Monotonicity: hours never decrease as Bortle worsens (broadband); never
>    increase as f-ratio gets faster; Bortle 1–3 broadband gives lp_multiplier 1.0
>    (never < 1 — dark-site reference is the floor, `max(0.0, ...)`).
> 3. Filter physics: mono_nb on an emission nebula from Bortle 9 yields an
>    lp_multiplier within ~15% of broadband from Bortle 4 (the calibration anchor).
> 4. Mismatch: `hours_needed("galaxy", 7, 5.0, "dual_nb")` sets
>    `filter_mismatch=True` and matches the broadband lp_multiplier exactly.
> 5. Optics: f/8 vs f/4 multiplier ratio == 4.0; f/10 vs f/5 == 4.0.
> 6. `usable_hours`: full moon at 0 deg separation zeroes broadband hours but leaves
>    mono_nb at 85% of `hours_visible`; new moon returns `hours_visible` unchanged.
> 7. Clamps + defaults: bortle 0/10, f_ratio <= 0, unknown kind, low <= high always.
>
> **Validation table (the eval — human-in-the-loop, do not invent rows).** Add a new
> STATE.md §3 subsection "`budget.py` validation (community-reported datapoints)" with
> this schema and ONLY these seed rows; I will fill the rest by hand from forum threads:
>
> | source | target/kind | sky | gear/filter | community-reported | model output | verdict |
> |---|---|---|---|---|---|---|
> | CN 806760 | (ratio check) | SQM 20.6 vs 18.53 | broadband | 6.7x time ratio | `2.512**2.07 = 6.73x` | PASS (formula identity) |
> | CN 803525-adjacent | (ratio check) | same sky | f/8 vs f/4 | 4x time ratio | `optics: 4.0x` | PASS |
> | CN 806760 #17 | emission neb | B9 half-moon vs B4 moonless | 3nm Ha | "no discernible difference" | mono_nb B9 mult ~= broadband B4 mult | fill in |
> | CN 868697 | faint dust (Cocoon) | B8/9 | f/4 broadband | 17.5h "just starting to show dust" | fill in | fill in |
> | CN 868697 | typical target | B4 | f/4.5 broadband | ~6h acceptable minimum | fill in | fill in |
>
> Rule 1 applies: record whatever the comparison says — if a row lands outside the
> model range, the verdict is FAIL and the constant gets a §5 follow-up item, not a
> silent tweak to make the row pass.
>
> Verify from `apps/api`:
> `uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run pytest -m "not integration"`
> — all green, zero changes to existing files except STATE.md. Update STATE.md §5 with
> a new "Track C" item C1 marked done.

---

## Task C2 — Multi-night projection + `GET /plan/project`

**Prompt for Cline:**

> Read `STATE.md` first (§3 `datasources/planning.py`, `params.py`, routers; §2 rule 1).
> Depends on C1 (`budget.py` merged). Extends the planner to project one target across
> the next N nights and expose it as an endpoint. No new dependencies.
>
> **(a) `params.py`** — add validated query types alongside `Lat/Lon/When`:
> `FRatio = Annotated[float, Query(gt=0, le=32, description="Optics focal ratio, e.g. 5.6")]`,
> `Nights = Annotated[int, Query(ge=1, le=60, description="Projection horizon in nights")]`.
> `filter` and `tier` use the `FilterKind` / `QualityTier` Literals from `budget.py`
> directly as parameter annotations (FastAPI validates Literals; invalid -> 422).
>
> **(b) `datasources/planning.py`** — add:
>
> ```python
> def project_target(
>     name: str, lat: float, lon: float,
>     f_ratio: float, filter_kind: FilterKind, tier: QualityTier,
>     when: Time | None = None, nights: int = 30,
> ) -> dict[str, object]
> ```
>
> Behavior:
> - Resolve the object exactly as `target_detail` does (catalog first, Simbad
>   `FixedTarget.from_name` fallback with `kind="unknown"`).
> - `bortle = bortle_at(lat, lon)` once; `estimate = hours_needed(obj.kind, bortle,
>   f_ratio, filter_kind, tier)` from `budget.py`.
> - For night i in range(nights): anchor_i = (when or Time.now()) + i days (use
>   `TimeDelta(i * u.day)`); `window_i = dark_window(lat, lon, anchor_i)`;
>   `c_i = conditions_for(obj, lat, lon, window_i, bortle)`;
>   `usable_i = usable_hours(c_i.hours_visible, c_i.moon_illumination,
>   c_i.moon_separation_deg, filter_kind)` (the pure helper from `budget.py`).
>   Guard against duplicate windows if anchors straddle dusk oddly: if `window_i.dusk`
>   equals the previous night's dusk, advance the anchor by one more day. Performance
>   note for the docstring: ~nights x one `conditions_for` — at the 30-night default
>   this is about 2x the cost of one `rank_targets` call; the `le=60` bound in
>   `params.py` is the guard.
> - Nights list entries: `{date (dusk date, ISO), dusk_utc, dawn_utc, dark_hours,
>   moon_illumination, moon_separation_deg, hours_visible, usable_hours}`.
> - Cumulative logic (pure — put `nights_to_reach(usable: list[float], goal: float)
>   -> int | None` in `budget.py` with unit tests, returning the 1-based count of
>   nights, chronological order, or None if the horizon is insufficient).
> - Return shape:
>   `{target, common_name, kind, bortle, filter_kind, tier, f_ratio,
>   hours_needed: {low, high}, filter_mismatch, nights: [...],
>   nights_to_finish: {low: int|None, high: int|None}, horizon_nights,
>   best_night: date-of-max-usable_hours}`.
>
> **(c) `routers/planning.py`** — `GET /plan/project?name=&lat=&lon=&f_ratio=&filter=
> &tier=&when=&nights=` with the exact 422 (`parse_when` ValueError) / 502 (everything
> else) pattern of the existing handlers. `filter` defaults `"broadband"`, `tier`
> defaults `"clean"`, `nights` defaults 30.
>
> Tests: `nights_to_reach` edge cases (empty, all-zero, exact boundary, insufficient
> horizon) in `test_budget.py`; router 422 checks (bad `when`, `nights=0`,
> `f_ratio=0`, bad `filter` literal) in `test_routers.py` CI section; a full live
> `project_target` round-trip for M42 in `test_planning_integration.py` marked
> `integration` asserting monotone non-negative usable hours and that
> `nights_to_finish.low <= nights_to_finish.high` when both are set.
>
> Verify from `apps/api` (same four commands as C1, all green). Update STATE.md:
> §3 planning/routers subsections + §5 Track C item C2.

---

## Task C3 — `gear_profiles` migration + minimal web gear UI (parallel with C2)

**Prompt for Cline:**

> Read `STATE.md` first (§2 rule 7 RLS model, §3 Supabase migrations, §4 Supabase
> gotchas). Two parts; the web part must keep `lint/typecheck/test/build` green
> (direct `.bin` binaries per STATE.md §4). No new dependencies.
>
> **(a) `supabase/migrations/0004_gear_profiles.sql`** — model it line-for-line on the
> `0001_init.sql` user-scoped pattern:
>
> ```sql
> create table if not exists public.gear_profiles (
>   id           uuid primary key default gen_random_uuid(),
>   user_id      uuid not null references auth.users (id) on delete cascade,
>   name         text not null,
>   f_ratio      double precision not null check (f_ratio > 0 and f_ratio <= 32),
>   filter_kind  text not null check (filter_kind in ('broadband', 'dual_nb', 'mono_nb')),
>   created_at   timestamptz not null default now()
> );
> create index if not exists gear_user_idx on public.gear_profiles (user_id, created_at desc);
> alter table public.gear_profiles enable row level security;
> -- four "own gear - select/insert/update/delete" policies, auth.uid() = user_id,
> -- exactly mirroring 0001's sessions policies.
> ```
>
> Deliberately three meaningful fields only — this is not an equipment database
> (Telescopius owns that game); it is the minimum the budget model consumes. Note the
> run order in `supabase/README.md` (0001 -> 0002 -> 0003 -> 0004). I apply the SQL in
> the dashboard myself — do not attempt to run it.
>
> **(b) Web:**
> - `src/lib/supabase/types.ts`: add `GearProfile { id, user_id, name, f_ratio,
>   filter_kind, created_at }` with `filter_kind: "broadband" | "dual_nb" | "mono_nb"`.
> - New client component `src/app/plan/GearCard.tsx` rendered on `/plan` for
>   signed-in users only (anonymous users see nothing new): lists the user's profiles
>   (select), a create form (name text input, f_ratio number input step 0.1, filter
>   select with human labels "Broadband / OSC", "Dual narrowband", "Mono narrowband"),
>   and a delete button per profile. Reuse existing shadcn `Card/Input/Button/Badge`;
>   server actions in `plan/actions.ts` following the existing save/log action pattern.
> - Persist the *selected* profile id in `localStorage` (client-side preference, not
>   worth a schema column yet); expose the selection to `PlanClient.tsx` via props or
>   context so C4 can consume it. No fetch behavior changes in this task.
>
> Keep server/client component boundaries as they are. Verify web checks green.
> Update STATE.md: §3 migrations list + §5 Track C item C3.

---

## Task C4 — Surface it: hours-needed column, nights-to-finish detail, progress (stretch)

**Prompt for Cline:**

> Read `STATE.md` first. Depends on C2, C3, and Task 4 (the `light_sensitivity`
> column + `when` picker must already be merged). This is the assembly task that makes
> the paid slice legible. Two required parts, one stretch.
>
> **(a) "Est. hours (your sky)" column in `/plan`** — cheap pure math, so it belongs
> on every row:
> - API: `rank_targets` gains optional `f_ratio: float | None = None`,
>   `filter_kind: FilterKind = "broadband"`, `tier: QualityTier = "clean"`; when
>   `f_ratio` is provided, each row additionally carries `hours_needed_low`,
>   `hours_needed_high`, `filter_mismatch` from `budget.py` (pure, no extra astropy
>   cost). When absent, the payload is byte-identical to today. `GET /plan/night`
>   passes the new optional query params through (reuse `FRatio` etc. from C2).
> - Web: `fetchNightPlan` + the `/api/plan` proxy pass gear params only when a
>   profile is selected (omit entirely otherwise). Column renders "~6–12 h";
>   `filter_mismatch` rows get a small warning glyph with a title attribute
>   ("narrowband filter won't help on this target — estimate assumes broadband").
>   Keep the table readable on mobile: this column may collapse under `sm:`.
> - An inline caption under the table when estimates are shown: "Estimates from a
>   modeled sky-brightness grid and community-anchored baselines — ranges, not
>   promises." (rule 1: the honesty label ships with the feature.)
>
> **(b) Nights-to-finish in the target detail view** — astropy-heavy, so it is
> per-target on demand, NOT a `/plan` column:
> - New proxy `app/api/project/route.ts` -> FastAPI `/plan/project`; `fetchProject`
>   in `src/lib/api.ts` with a `ProjectPlan` type mirroring C2's response shape.
> - In the target detail surface, when a gear profile is selected: show
>   `hours_needed` range, `nights_to_finish` ("~3–5 sessions in the next 30 nights",
>   or "won't finish in 30 nights from this sky — consider narrowband or a darker
>   site" when high is None), `best_night`, and a compact per-night usable-hours
>   strip (plain divs/CSS bars, no chart dependency).
>
> **(c) Stretch — progress tracking.** Only if (a)+(b) land cleanly:
> `supabase/migrations/0005_observation_integration.sql` adds nullable
> `integration_minutes int check (integration_minutes >= 0)` to
> `logged_observations`; the log form gains an optional minutes field; the target
> detail sums logged minutes for that target into "captured 14.2 h of ~22 h". Skip
> without guilt if scope grows — file it as a §5 item instead.
>
> Constraints: no new dependencies; existing payloads and component boundaries
> unchanged when no gear profile is selected; add a `format.ts` unit test if you add
> an hours-range formatter. Verify api + web checks green (direct binaries per
> STATE.md §4). Update STATE.md §5 Track C items and the §3 web-lib section.

---

## Follow-ups seeded by this track (add to STATE.md §5 backlog when C1 merges)

- **B1 gains urgency**: the budget model's SQM input inherits the modeled grid's
  error; a real VIIRS/World Atlas raster materially improves the paid feature's
  credibility. Same seam, zero code change.
- **B4 (catalog expansion)** should split `dark nebula` into silhouette-on-emission
  vs broadband dust so `EMISSION_KINDS` stops special-casing IC434, and planets get
  `light_sensitivity ~= 0` / trivially small budgets.
- **v2 retention hook**: per-user calibration — regress the user's own logged
  `integration_minutes` + rated outcomes against model predictions to personalize
  `BASE_HOURS_BY_KIND`. Requires C4(c) data to exist first.
