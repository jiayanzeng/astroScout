# AstroScout — Track C: Feasibility Ranking (integration budget + nights-to-finish)
# + Track W: web fixes & polish (rev 2, 2026-07-11)

The paid slice. Given the observer's sky brightness (now **measured** — World Atlas
2015 q3 grid, B1 done), a target's kind (catalog now includes planets, B4 done), and a
minimal gear profile (f-ratio + filter type), estimate the total integration hours the
target needs from *that* sky, project the usable imaging hours per upcoming night
(moon- and filter-aware), and answer the question no free tool answers: **"how many
nights will this take me, and should I start tonight?"**

**Rev 2 delta (what changed vs the original Track C file, and why):**

1. **`BORTLE_TO_SQM` reconciled with the grid build script.** The original C1 draft
   hardcoded a crosswalk that diverges from `scripts/build_bortle_grid_viirs.py`'s
   `BORTLE_MAG_LOWER_EDGES` (worst at Bortle 7–9: draft said B7=18.8/B8=18.0/B9=17.5;
   the committed authority table gives band midpoints 18.0/16.75/<16). The script's
   docstring already declares itself the single authority. Fix: hoist the table into a
   shared pure module `bortle/calibration.py`; both the script and `budget.py` import
   it; a self-consistency test makes drift impossible. (New Task C1a.)
2. **Continuous-SQM sidecar grid (optimization).** The budget pipeline previously
   round-tripped continuous World Atlas brightness → discrete Bortle class →
   representative SQM. Bortle 4 alone spans 20.50–21.50 mag — a 1.0 mag band is a
   **2.5× integration-time swing hidden inside one class** (`2.512¹`). Since the build
   script already computes per-cell mag/arcsec², it now also emits `sqm_grid.npy`
   (float16, ~2 MB) and `grid.py` gains `sqm_at()`. `budget.py` prefers continuous SQM
   when available and falls back to the class crosswalk. (Tasks C1a/C1/C2.)
3. **User SQM override.** Astrophotographers know their measured SQM, and the grid is
   resolution-limited at 0.25° (STATE §3: city cores read B7 — a Manhattan user's real
   sky is brighter than the cell). An optional `sqm` query param + small UI input is
   the honest, near-zero-cost mitigation, and reads as a pro feature. (C2/C4.)
4. **Planets are n/a, not "tiny budgets."** B4 landed `kind="planet"` in the catalog.
   Planets are lucky-imaging targets (minutes of video, not hours of integration) —
   a 2–4 h `DEFAULT_BASE_HOURS` estimate would be confidently wrong. `hours_needed`
   returns `None` for planet kinds; the UI renders "n/a — lucky imaging". (C1/C2/C4.)
5. **Stale status fixed.** The old header said "Track C starts only after Task 0 (CI is
   red)". Tasks 0–4 and B1–B4 are all done and CI is green (verified against the
   2026-07-11 test transcript). Dependencies in the outline are updated; the "B1 gains
   urgency" follow-up is deleted (B1 shipped).
6. **New Track W (web).** The same test transcript surfaced a P0 chat regression
   (relay multi-step tool calls fail) and confirmed the UI is minimal enough to hurt.
   W1 is a fix and should run **before anything else**; W2 is polish and pairs well
   before C4.

Every task prompt assumes Cline reads `STATE.md` first. Each task adds/updates a
"Track C" / "Track W" item under STATE.md §5 when done. Binding rules: rule 1 (honesty
over polish — every constant below is a labelled community-anchored estimate, and
outputs are **ranges**, never point estimates) and rule 3 (eval-before-claims — C1's
validation table is the eval; fill it before marketing any number).

Monetization wiring (Stripe, plan gating) is deliberately **not** in Track C. Ship the
value behind the existing Supabase auth first; billing is its own later track.

---

## C-gate — validate in the community before writing code (no-code, ~1 week)

**Status: still open — this gate has not been run yet and it still precedes C1.**
(W1/W2 and C1a are exempt: W1 is a bug fix, W2 is general polish, and C1a is
calibration hygiene that improves the already-shipped B1 grid regardless of Track C.)

Not a Cline task. Post in Cloudy Nights (Beginning Deep Sky Imaging) and
r/AskAstrophotography with 2–3 mockups of the nights-to-finish table and one direct
question: *"would this have changed what you pointed at last new moon?"*

- Disconfirming signal: the "it depends" culture rejecting any estimate as false
  precision. Mitigation is already designed in — labelled ranges + visible assumptions
  + the new user-SQM override ("your measured sky wins over our grid").
- "My numbers are different" is engagement, not rejection; it seeds the v2 retention
  hook (calibrate estimates from the user's own logged results).
- Proceed to C1 if replies engage with the *concept* even while disputing constants.

---

## Outline

| # | Task | Type | Depends on | Verifiable offline? |
|---|------|------|-----------|---------------------|
| W1 | **P0 fix**: chat multi-step through the relay + chat error UX | fix | — | web checks yes; live chat needs keys |
| W2 | Web polish: app shell/nav, dark default, /plan & /chat UX | feature | W1 | yes |
| C1a | `bortle/calibration.py` (single crosswalk authority) + SQM sidecar grid | fix/feature | — | code+tests yes; grid regen on real machine |
| C1 | `budget.py` pure integration-budget module + tests + validation table | feature | C-gate, C1a | yes |
| C2 | Multi-night projection + `GET /plan/project` (+ `sqm` override) | feature | C1 | pure parts yes; astropy loop CI-safe, live route `integration`-marked |
| C3 | `gear_profiles` migration + minimal web gear UI | feature | C-gate (parallel with C2) | SQL by inspection; web checks yes |
| C4 | Hours-needed column + nights-to-finish detail + SQM input (+ progress, stretch) | feature | C2, C3, W2 preferred | yes |

---

## Task W1 — P0 fix: chat tool loops fail through the relay; chat error handling

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 2, §3 "Web lib" relay note, §2 rule 11). This fixes a
> **live regression** observed in the 2026-07-11 manual test transcript, and corrects a
> STATE.md claim that turned out to be only partially true.
>
> **Observed failure:** on `/chat`, any turn that triggers a multi-step tool loop
> (`stopWhen: stepCountIs(6)`) works for the first step, then every follow-up step
> fails with `AI_APICallError` 400 from `{OPENAI_BASE_URL}/responses`:
> `"Item with id 'fc_…' not found"` / `"Item with id 'msg_…' not found"`, with the
> `input` array growing 4 → 5 → 6 → 7 objects across retries.
>
> **Diagnosis:** the default `openai("gpt-4o-mini")` provider instance in AI SDK v6
> targets the **stateful** Responses API — follow-up steps reference earlier response
> items (`fc_…` function-call items, `msg_…` message items) **by id**. The configured
> relay does not persist those items, so every step after the first 400s. This is why
> STATE §5 item 2's verification passed: `generateObject` (reranker, judge) and
> single-step chat are one-shot and never send item references. "The relay supports
> the Responses API" is true only for single-step calls.
>
> Steps:
>
> 1. **`app/api/chat/route.ts`:** switch `openai("gpt-4o-mini")` →
>    `openai.chat("gpt-4o-mini")` (stateless Chat Completions; fully compatible with
>    the official endpoint, so this is not a relay-specific hack — rule 11 holds; do
>    NOT hardcode any URL). Leave `lib/rerank.ts` and `evals/judge-openai.ts` on the
>    default provider — they are one-shot `generateObject` calls, verified working
>    live; changing them would force re-verification for zero benefit.
> 2. **`src/app/chat/page.tsx` — stop crashing on failed streams.** The transcript
>    shows `[browser] TypeError: Cannot read properties of undefined (reading
>    'state')` during the failing turns. Harden rendering: guard every tool-part
>    component against `part` / `part.state` being undefined; return `null` for
>    unrecognized part types (including `dynamic-tool` and step parts) instead of
>    assuming the four known types are exhaustive.
> 3. **Surface errors instead of dead-ending.** `useChat` exposes `error` and
>    `regenerate`; today neither is used, and `disabled={status !== "ready"}` leaves
>    the send button dead forever after a stream error. Render an inline error row
>    ("Something went wrong talking to the model" + a Retry button calling
>    `regenerate()`), and enable sending when `status` is `"ready"` **or** `"error"`.
> 4. **Correct the record (rule 1).** Amend STATE.md §5 item 2 and the §3 relay note:
>    the relay supports **single-step** Responses API calls; multi-step tool loops
>    require stateless Chat Completions, so the chat route now uses `openai.chat(...)`.
>    Do not delete the original finding — append the correction with today's date.
>
> Verify offline via direct binaries (STATE.md §4): `.bin/tsc --noEmit`, `.bin/eslint .`,
> `.bin/vitest run` (40 passed + 6 skipped unchanged), `.bin/next build` (12 routes).
> Then verify live on a real machine: a `/chat` prompt that chains
> `planNight` → `getTargetDetail` → `searchKnowledge` must complete with **zero**
> `fc_…`/`msg_…` 400s in the dev-server log. Update STATE.md §5 with a Track W item W1.

---

## Task W2 — Web polish: app shell, dark default, /plan & /chat UX

**Prompt for Cline:**

> Read `STATE.md` first (§3 "Web lib", §2 rules 4 & 10). Frontend-only, **no new
> dependencies**, keep server/client component boundaries as they are, keep
> lint/typecheck/test/build green (direct `.bin` binaries per STATE.md §4). The API
> already returns everything needed. Grounded in the current code: `layout.tsx` has no
> nav (the four pages are unlinked islands), `.dark` tokens exist in `globals.css` but
> nothing applies them, `/plan` renders dusk/dawn as raw UTC string slices, and the
> results table has no loading or visual hierarchy.
>
> **(a) App shell.** Add a slim sticky header to `layout.tsx` (server component):
> wordmark "AstroScout" linking to `/plan`, nav links to `/plan`, `/sessions`, `/chat`,
> and a right-aligned auth affordance (Sign in → `/login` when anonymous; email +
> sign-out form posting to `/auth/signout` when signed in — read the Supabase session
> the same way `plan/page.tsx` does). Keep it one row, `text-sm`, mobile-safe.
>
> **(b) Dark by default.** This app is used outdoors at night. Set
> `<html lang="en" className="dark">` so the existing `.dark` token block applies.
> Verify every page (incl. `/login`) and the shadcn `Badge` variants for contrast in
> dark mode; adjust token values only if contrast genuinely fails. A light/dark toggle
> is NOT in scope (needs persistence — file as a follow-up if tempted). Stretch, only
> if trivial: a "red night-vision" class that layers `filter: sepia + hue-rotate` on
> `<body>` behind a small toggle held in React state (no persistence).
>
> **(c) `/plan` legibility.**
> - "Use my location" button beside the lat/lon inputs via
>   `navigator.geolocation.getCurrentPosition` (guard unsupported/denied with the
>   existing inline error pattern; round to 2 decimals).
> - Render dusk/dawn in the user's local time via `Intl.DateTimeFormat` (keep UTC in a
>   `title` attribute). Add a pure formatter in `format.ts` + unit test.
> - Bortle context: render `plan.bortle` as a colored badge with a short label
>   (1 excellent-dark … 9 inner-city; add `bortleLabel(n)` in `format.ts` + test).
> - Score bar: a subtle CSS width-percentage bar behind/beside the score cell
>   (plain div, no chart dep) so ranking is scannable; highlight the top row.
> - Kind filter chips above the table (All / galaxies / nebulae / clusters / planets)
>   — pure client-side filter of `plan.targets`.
> - Loading skeleton rows while fetching (the current UI blanks); keep the table
>   readable at mobile widths (drop "Hrs up" under `sm:` if needed).
>
> **(d) `/chat` niceties** (after W1's fixes): 2–3 starter-prompt chips shown when the
> thread is empty (each calls `sendMessage`), and auto-scroll to the newest message.
>
> Add `format.ts` unit tests for every new pure formatter. Update STATE.md §5 Track W
> item W2 and the §3 web-lib section.

---

## Task C1a — Single crosswalk authority + continuous-SQM sidecar grid

**Prompt for Cline:**

> Read `STATE.md` first (§2 rule 1, §3 "`bortle/`", §4 grid-regeneration command).
> Two related changes that keep the grid build and the future budget estimator from
> ever drifting apart, and remove a hidden 2.5× discretization error. Runtime behavior
> of `bortle_at` is untouched.
>
> **(a) Hoist the Bortle↔SQM table into `apps/api/src/astroscout_api/bortle/calibration.py`**
> (new file, PURE, **numpy-free** — plain tuples/dicts/functions, `mypy --strict`):
>
> ```python
> # Bortle(2001) <-> SQM table as cited by the IDA — the SINGLE AUTHORITY for the
> # Bortle <-> mag/arcsec^2 mapping. build_bortle_grid_viirs.py and budget.py both
> # import from here; do NOT restate these numbers anywhere else.
> BORTLE_MAG_LOWER_EDGES: tuple[float, ...] = (
>     22.00, 21.75, 21.50, 20.50, 19.50, 18.50, 17.50, 16.00,
> )
>
> def bortle_for_sqm(mag: float) -> int:
>     # 1 + count of lower edges the sky is too bright to reach; clamp 1..9.
>     # Must agree exactly with the vectorized comparison in the build script.
>
> # Representative SQM per class = band midpoint. B1 is capped by the natural sky
> # (~22.0); B9 is open-ended — representative value 0.5 mag below the B8/B9 edge,
> # a labelled APPROXIMATION. Derive programmatically from the edges (no literals):
> # {1: 22.0, 2: 21.88, 3: 21.63, 4: 21.0, 5: 20.0, 6: 19.0, 7: 18.0, 8: 16.75, 9: 15.5}
> BORTLE_TO_SQM: dict[int, float]
> ```
>
> Refactor `scripts/build_bortle_grid_viirs.py` to import `BORTLE_MAG_LOWER_EDGES`
> from this module (delete its local copy; the vectorized numpy comparison stays in
> the script). Keep the script's docstring pointer, updated to say the authority now
> lives in `bortle/calibration.py`. **Import-only refactor — the emitted Bortle grid
> must be bit-identical for the same inputs.**
>
> **(b) Emit + load a continuous-SQM sidecar grid.** The script already computes
> per-cell total-sky `mag` in `to_bortle`; the discrete class then throws that
> precision away (Bortle 4 spans a full 1.0 mag ≈ a 2.512× time factor). Changes:
>
> 1. Script: alongside the Bortle grid, `np.save` `sqm_grid.npy` — the total-sky
>    mag/arcsec² lattice as `float16`, same `(720, 1440)` shape and orientation,
>    clipped to `[10.0, 25.0]` for safety (~2 MB; `pyproject.toml`'s `*.npy` wheel
>    artifact glob already covers it). Extend `report_sanity` to print the SQM value
>    per site, and print both files' paths/sizes at the end.
> 2. `bortle/grid.py`: add `SQM_GRID_PATH`, `load_sqm_grid()` (mirroring
>    `load_grid()`'s `lru_cache` + `mmap_mode="r"`), and
>    `sqm_at(lat, lon) -> float | None` using the same row/col math as `bortle_at`
>    (factor a tiny shared index helper). Return `None` when the sidecar file does
>    not exist — the repo must keep working before regeneration, and callers fall
>    back to the class crosswalk. Handle the missing-file case inside `load_sqm_grid`
>    (cache the `None`).
> 3. Tests (`tests/test_bortle.py`): crosswalk self-consistency —
>    `bortle_for_sqm(BORTLE_TO_SQM[b]) == b` for b in 1..9 (this is the drift-proof
>    reconciliation test); `sqm_at` missing-file → `None` (monkeypatch the path);
>    `sqm_at` round-trip on a small synthetic `float16` grid written to `tmp_path`;
>    and agreement: for a synthetic cell, `bortle_for_sqm(sqm_at(...)) ==
>    bortle_at(...)`-style consistency using the same synthetic data.
>
> 4. **Real-machine step (I run this, not you):** regenerate both grids —
>    `uv run --with rasterio python scripts/build_bortle_grid_viirs.py --src
>    /Users/yzjia/Documents/World_Atlas_2015/World_Atlas_2015.tif --units mcd` —
>    and confirm the Bortle histogram is unchanged from STATE §3 before committing
>    `sqm_grid.npy`. Stop and flag if it differs.
>
> Verify from `apps/api`:
> `uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run pytest -m "not integration"`.
> Update STATE.md §3 "`bortle/`" (sidecar grid + calibration module) and §5 with a
> Track C item C1a.

---

## Task C1 — `budget.py`: pure integration-time budget estimator (offline-verifiable)

**Prompt for Cline:**

> Read `STATE.md` fully first (§2 rules 1 & 10, §3 `scoring.py` and `bortle/`).
> Depends on C1a (`bortle/calibration.py` merged). This task adds ONE new pure module
> plus its tests; the only existing file it may touch is `STATE.md`. No new
> dependencies, no network, no I/O — `budget.py` never reads the grid files itself
> (callers pass sky values in; that keeps it as pure as `scoring.py`).
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
> from astroscout_api.bortle.calibration import BORTLE_TO_SQM  # single authority (C1a)
>
> FilterKind = Literal["broadband", "dual_nb", "mono_nb"]
> QualityTier = Literal["clean", "showcase"]
>
> # Sky input precedence (all mag/arcsec^2): a caller-supplied measured/looked-up SQM
> # beats the class midpoint. The grid is satellite-measured (World Atlas 2015, q3)
> # but resolution-limited at 0.25 deg — city cores can be brighter than their cell —
> # and class midpoints add up to +/- half a band (Bortle 4 spans 1.0 mag ~= 2.5x
> # time). This is exactly why hours are reported as ranges.
> REF_SQM = 21.5        # "reasonable dark site" anchor for BASE_HOURS_BY_KIND.
>                       # Deliberately a literal (the community's round number), NOT a
>                       # class midpoint — do not tie it to BORTLE_TO_SQM.
> REF_F_RATIO = 5.0     # reference optics speed
> SNR_TIME_BASE = 2.512 # hours scale as SNR_TIME_BASE ** (REF_SQM - sqm) — the
>                       # community-standard SQM-ratio rule (equal-SNR time scaling)
> SQM_CLAMP = (10.0, 25.0)  # sanity clamp for caller-supplied sky values
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
> # Kinds where long-exposure integration budgeting does NOT apply: planets are
> # lucky-imaging targets (minutes of high-framerate video; LP-neutral, rule 4).
> # hours_needed returns None for these — "n/a" is honest, a tiny budget is not.
> NON_BUDGET_KINDS = frozenset({"planet"})
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
> # revisit when the catalog gains true broadband-only dust clouds (see follow-ups).
> EMISSION_KINDS = frozenset({"emission nebula", "nebula", "planetary nebula", "dark nebula"})
>
> # Per-filter moon-interference weight (consumed by the C2 night projector).
> MOON_WEIGHT: dict[str, float] = {"broadband": 1.0, "dual_nb": 0.35, "mono_nb": 0.15}
> ```
>
> API (all pure; clamp out-of-range inputs rather than raising):
>
> ```python
> @dataclass(frozen=True)
> class HoursEstimate:
>     low: float                 # rounded to 1 decimal
>     high: float
>     sky_sqm: float             # the sky value actually used (rule 1: show the input)
>     sky_source: Literal["sqm", "bortle-class"]
>     lp_multiplier: float       # factor breakdown kept visible on purpose (rule 1)
>     optics_multiplier: float
>     tier_multiplier: float
>     filter_mismatch: bool      # True when a NB filter was requested for a
>                                # non-emission kind; LP coupling then falls back to
>                                # broadband and the UI should warn.
>
> def sqm_for_bortle(bortle: int) -> float            # clamp bortle to 1..9, table lookup
> def lp_time_multiplier(bortle: int, filter_kind: FilterKind, kind: str,
>                        sqm: float | None = None) -> float
>     # sky = clamp(sqm, *SQM_CLAMP) if sqm is not None else sqm_for_bortle(bortle)
>     # coupling = LP_COUPLING[filter_kind] if kind.lower() in EMISSION_KINDS else 1.0
>     # return SNR_TIME_BASE ** (max(0.0, REF_SQM - sky) * coupling)
> def optics_time_multiplier(f_ratio: float) -> float # (clamp(f_ratio,1,32)/REF_F_RATIO)**2
> def usable_hours(hours_visible: float, moon_illumination: float,
>                  moon_separation_deg: float, filter_kind: FilterKind) -> float
>     # mirrors scoring.py's moon_term but filter-weighted:
>     # proximity = max(0, 1 - sep/90); penalty = illum * proximity * MOON_WEIGHT[filter]
>     # return round(hours_visible * max(0.0, 1.0 - penalty), 1)
> def hours_needed(kind: str, bortle: int, f_ratio: float,
>                  filter_kind: FilterKind = "broadband",
>                  tier: QualityTier = "clean",
>                  sqm: float | None = None) -> HoursEstimate | None
>     # None when kind.lower() in NON_BUDGET_KINDS (planets: lucky imaging, n/a).
>     # base = BASE_HOURS_BY_KIND.get(kind.lower(), DEFAULT_BASE_HOURS)
>     # low/high = base * lp_mult * optics_mult * tier_mult, rounded to 1 decimal
> ```
>
> **New file `apps/api/tests/test_budget.py`** (CI-safe, no network, no astropy).
> Cover at minimum:
> 1. **Formula identity (SQM-denominated — this row of the validation table becomes
>    executable):** `lp_time_multiplier(4, "broadband", "galaxy", sqm=18.53) /
>    lp_time_multiplier(4, "broadband", "galaxy", sqm=20.6)` ≈ `2.512 ** 2.07` ≈ 6.73
>    (rel tol 1e-3). Note the `bortle` arg is ignored when `sqm` is given — assert
>    that too.
> 2. **Class-midpoint identity:** the Bortle-7-vs-4 broadband multiplier ratio equals
>    `SNR_TIME_BASE ** (sqm_for_bortle(4) - sqm_for_bortle(7))` **exactly** — do NOT
>    assert a hardcoded "5–9×" band; under the reconciled authority table the B4↔B7
>    midpoint gap is 3.0 mag (~15.9×), and the table, not the test, is the authority.
> 3. Monotonicity: hours never decrease as Bortle worsens (broadband); never increase
>    as f-ratio gets faster; any sky at or darker than `REF_SQM` gives
>    lp_multiplier exactly 1.0 (the `max(0.0, …)` floor).
> 4. Filter physics: mono_nb on an emission nebula from Bortle 9 yields an
>    lp_multiplier within ~15% of broadband from Bortle 4 (the calibration anchor).
> 5. Mismatch: `hours_needed("galaxy", 7, 5.0, "dual_nb")` sets
>    `filter_mismatch=True` and matches the broadband lp_multiplier exactly.
> 6. Optics: f/8 vs f/4 multiplier ratio == 4.0; f/10 vs f/5 == 4.0.
> 7. `usable_hours`: full moon at 0° separation zeroes broadband hours but leaves
>    mono_nb at 85% of `hours_visible`; new moon returns `hours_visible` unchanged.
> 8. Planets: `hours_needed("planet", 9, 5.0)` is `None`; case-insensitive.
> 9. Clamps + defaults: bortle 0/10, f_ratio ≤ 0, unknown kind, absurd sqm (clamped),
>    `low <= high` always; `sky_source` is `"sqm"` iff sqm was supplied.
>
> **Validation table (the eval — human-in-the-loop, do not invent rows).** Add a new
> STATE.md §3 subsection "`budget.py` validation (community-reported datapoints)" with
> this schema and ONLY these seed rows; I will fill the rest by hand from forum
> threads. Note under the table: class-midpoint estimates carry up to ±half-band
> uncertainty (Bortle 4's band alone is 1.0 mag ≈ 2.5× time) — the SQM sidecar/override
> path avoids this; sky readings for named cities are additionally resolution-limited
> at 0.25° (STATE §3).
>
> | source | target/kind | sky | gear/filter | community-reported | model output | verdict |
> |---|---|---|---|---|---|---|
> | CN 806760 | (ratio check) | SQM 20.6 vs 18.53 | broadband | 6.7x time ratio | `2.512**2.07 = 6.73x` | PASS (executable — test 1) |
> | CN 803525-adjacent | (ratio check) | same sky | f/8 vs f/4 | 4x time ratio | `optics: 4.0x` | PASS (executable — test 6) |
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
> — all green; the only existing file that changes is STATE.md. Update STATE.md §5
> with a new "Track C" item C1 marked done.

---

## Task C2 — Multi-night projection + `GET /plan/project`

**Prompt for Cline:**

> Read `STATE.md` first (§3 `datasources/planning.py`, `params.py`, routers, `bortle/`;
> §2 rule 1). Depends on C1 (`budget.py` merged; C1a gave you `sqm_at`). Extends the
> planner to project one target across the next N nights and expose it as an endpoint.
> No new dependencies.
>
> **(a) `params.py`** — add validated query types alongside `Lat/Lon/When`:
> `FRatio = Annotated[float, Query(gt=0, le=32, description="Optics focal ratio, e.g. 5.6")]`,
> `Nights = Annotated[int, Query(ge=1, le=60, description="Projection horizon in nights")]`,
> `Sqm = Annotated[float | None, Query(ge=15.0, le=22.1,
> description="Measured sky brightness (mag/arcsec^2); overrides the grid")]`.
> `filter` and `tier` use the `FilterKind` / `QualityTier` Literals from `budget.py`
> directly as parameter annotations (FastAPI validates Literals; invalid -> 422).
>
> **(b) `datasources/planning.py`** — add:
>
> ```python
> def project_target(
>     name: str, lat: float, lon: float,
>     f_ratio: float, filter_kind: FilterKind, tier: QualityTier,
>     when: Time | None = None, nights: int = 30, sqm: float | None = None,
> ) -> dict[str, object]
> ```
>
> Behavior:
> - Resolve the object exactly as `target_detail` does (catalog first, Simbad
>   `FixedTarget.from_name` fallback with `kind="unknown"`).
> - **Sky resolution (rule 1 — record which source won):**
>   `bortle = bortle_at(lat, lon)` once; `sky_sqm = sqm if sqm is not None else
>   sqm_at(lat, lon)`; `sky_source = "user" | "grid" | "bortle-class"` (the last when
>   both are None — budget falls back to the crosswalk internally).
>   `estimate = hours_needed(obj.kind, bortle, f_ratio, filter_kind, tier,
>   sqm=sky_sqm)` — may be `None` for planets.
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
>   `{target, common_name, kind, bortle, sky_sqm: float | None, sky_source,
>   filter_kind, tier, f_ratio, hours_needed: {low, high} | None, filter_mismatch:
>   bool | None, budget_applicable: bool, nights: [...],
>   nights_to_finish: {low: int|None, high: int|None} | None, horizon_nights,
>   best_night: date-of-max-usable_hours}`.
>   For planets (`estimate is None`): `budget_applicable=False`, `hours_needed`,
>   `filter_mismatch` and `nights_to_finish` are null, and the nights list is still
>   returned — per-night visibility remains useful; the UI says "lucky imaging".
>
> **(c) `routers/planning.py`** — `GET /plan/project?name=&lat=&lon=&f_ratio=&filter=
> &tier=&when=&nights=&sqm=` with the exact 422 (`parse_when` ValueError) / 502
> (everything else) pattern of the existing handlers. `filter` defaults `"broadband"`,
> `tier` defaults `"clean"`, `nights` defaults 30, `sqm` defaults None.
>
> Tests: `nights_to_reach` edge cases (empty, all-zero, exact boundary, insufficient
> horizon) in `test_budget.py`; router 422 checks (bad `when`, `nights=0`,
> `f_ratio=0`, bad `filter` literal, `sqm=30`) in `test_routers.py` CI section; a full
> live `project_target` round-trip for M42 in `test_planning_integration.py` marked
> `integration` asserting monotone non-negative usable hours and that
> `nights_to_finish.low <= nights_to_finish.high` when both are set; and one
> integration case for Jupiter asserting `budget_applicable is False` with a
> populated nights list.
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
> (Telescopius owns that game); it is the minimum the budget model consumes. There is
> deliberately **no SQM column**: sky brightness is a property of the site, not the
> gear — the user SQM override lives client-side next to the location inputs (C4).
> Note the run order in `supabase/README.md` (0001 -> 0002 -> 0003 -> 0004). I apply
> the SQL in the dashboard myself — do not attempt to run it.
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

## Task C4 — Surface it: hours-needed column, nights-to-finish detail, SQM input, progress (stretch)

**Prompt for Cline:**

> Read `STATE.md` first. Depends on C2 and C3 (W2's polish is strongly preferred first
> so this lands on the improved table). This is the assembly task that makes the paid
> slice legible. Three required parts, one stretch.
>
> **(a) "Est. hours (your sky)" column in `/plan`** — cheap pure math, so it belongs
> on every row:
> - API: `rank_targets` gains optional `f_ratio: float | None = None`,
>   `filter_kind: FilterKind = "broadband"`, `tier: QualityTier = "clean"`,
>   `sqm: float | None = None`; when `f_ratio` is provided, each row additionally
>   carries `hours_needed_low`, `hours_needed_high`, `filter_mismatch`,
>   `budget_applicable` from `budget.py` (pure, no extra astropy cost; sky resolved
>   once per plan exactly as in C2 — user `sqm` > `sqm_at` grid > class crosswalk —
>   and the plan payload gains top-level `sky_sqm`/`sky_source`). When `f_ratio` is
>   absent, the payload is byte-identical to today. `GET /plan/night` passes the new
>   optional query params through (reuse `FRatio`/`Sqm` etc. from C2).
> - Web: `fetchNightPlan` + the `/api/plan` proxy pass gear params only when a
>   profile is selected (omit entirely otherwise). Column renders "~6–12 h";
>   planets render "n/a" with title "lucky imaging — integration budgeting doesn't
>   apply"; `filter_mismatch` rows get a small warning glyph with a title attribute
>   ("narrowband filter won't help on this target — estimate assumes broadband").
>   This column may collapse under `sm:`.
> - An inline caption under the table when estimates are shown: "Sky estimate from
>   the World Atlas 2015 satellite survey at ~27 km cells — dense city cores can read
>   darker than reality; enter your measured SQM to refine. Hours are
>   community-anchored ranges, not promises." (rule 1: the honesty label ships with
>   the feature.)
>
> **(b) "My sky (SQM)" override input.** A small optional number input (step 0.1,
> client-validated 15.0–22.1) next to the location inputs, visible whenever a gear
> profile is selected; persisted in `localStorage` alongside the profile selection;
> passed as `sqm` to `/api/plan` and `/api/project` only when set. When active, show
> the resolved sky next to the Bortle badge: "your SQM 18.4" vs "grid SQM 20.1" —
> `sky_source` from the payload decides the wording.
>
> **(c) Nights-to-finish in the target detail view** — astropy-heavy, so it is
> per-target on demand, NOT a `/plan` column:
> - New proxy `app/api/project/route.ts` -> FastAPI `/plan/project`; `fetchProject`
>   in `src/lib/api.ts` with a `ProjectPlan` type mirroring C2's response shape.
> - In the target detail surface, when a gear profile is selected: show
>   `hours_needed` range, `nights_to_finish` ("~3–5 sessions in the next 30 nights",
>   or "won't finish in 30 nights from this sky — consider narrowband or a darker
>   site" when high is None, or "lucky-imaging target — any clear night works" when
>   `budget_applicable` is false), `best_night`, and a compact per-night usable-hours
>   strip (plain divs/CSS bars, no chart dependency).
>
> **(d) Stretch — progress tracking.** Only if (a)+(b)+(c) land cleanly:
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

## Follow-ups seeded by this review + track (file under STATE.md §5 backlog)

- **Polar dark-window handling:** `GET /plan/night` at |lat| ≥ ~89 returns 502
  (astroplan `TargetNeverUpWarning` — the sun never crosses −18° within 24 h:
  continuous darkness or no astronomical night). Verified in the 2026-07-11 transcript
  (lat −89/−90 → 502; −80 → 200). Rule 5 makes 502 "correct", but this is a
  predictable domain condition, not a failure — return a structured "no dark window /
  continuous darkness" response instead. Low priority, real robustness.
- **Re-run the live retrieval eval on the grown corpus.** All recorded numbers
  (STATE §3) were measured on 203 chunks / 15 targets; the corpus is now 253 / 19
  (planets ingested 2026-07-11). Re-run hybrid vs LLM-rerank once, and consider adding
  planet-labelled cases to `evals/dataset.ts` so retrieval quality on the new rows is
  measured, not assumed.
- **Warning noise:** `NonRotationTransformationWarning` floods the server log on every
  plan (moon-separation transforms in `conditions_for`). Cosmetic; a targeted
  `warnings.filterwarnings` scoped to that astropy category in `planning.py` with a
  comment would clean logs without hiding real issues.
- **Local venv drift:** the 2026-07-11 pytest run executed on Python 3.13
  (`.venv/lib/python3.13/...`) while the project pins 3.12 (`.python-version`, CI,
  Dockerfile, mypy). `requires-python = ">=3.12"` permits it, but recreate the venv
  with `uv venv --python 3.12 && uv sync` for CI parity.
- **Dark-nebula split (was the B4 note; B4 itself is done):** split `dark nebula` into
  silhouette-on-emission vs broadband dust so `EMISSION_KINDS` stops special-casing
  IC434 when the catalog gains true dust clouds.
- **City-core resolution limit:** q3 aggregation keeps major cores at Bortle 7
  (resolution-limited at 0.25°, per STATE §3 — not fixable by aggregation choice).
  The C4 user-SQM override is the practical mitigation; a finer-resolution sidecar
  near population centers is a possible future refinement, not currently justified.
- **v2 retention hook:** per-user calibration — regress the user's own logged
  `integration_minutes` + rated outcomes against model predictions to personalize
  `BASE_HOURS_BY_KIND`. Requires C4(d) data to exist first.
