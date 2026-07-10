# AGENTS.md — AstroScout

Operating manual for any coding agent (Codex, Cline, …) working in this repo. **Read
`STATE.md` in full before editing anything** — it is the source of truth for architecture,
current state, and the project "constitution" (§2). This file is the short manual; STATE.md
is the detail.

There is a human + reviewer layer above you. Your job is faithful execution and making
discrepancies visible for review — not autonomous scope expansion.

## Golden rules

1. **STATE.md is authoritative.** Read it first. When you change behavior or data, update
   the matching §2/§3/§5 entry in the same task. Do **not** bump the STATE.md version
   yourself — propose the bump and let the maintainer decide.
2. **Verify against ground truth before you document.** Read the actual source files and
   run the code; never describe intended behavior as if it were observed. If a docstring,
   README, or comment conflicts with STATE.md's measured record, **the measurement wins** —
   fix the prose, not the record.
3. **Surface discrepancies; don't paper over them.** If a measured result contradicts a
   task's stated expectation (e.g. "NYC should read 9" but it reads 7), report it and its
   cause. Never silently accept it, and never silently "tune it away." Observed results are
   data, not bugs to hide.
4. **Honesty over polish.** Every approximation is labelled, not hidden (STATE.md §2.1).
5. **Keep CI green.** The gate below must pass before you call a task done.
6. **Respect the seams.** Do not regenerate `bortle_grid.npy` or change the runtime lookup
   (`bortle/grid.py::bortle_at`) unless the task explicitly says so. The committed `.npy` is
   the deliberate swap point; runtime is byte-identical regardless of how it was built.
7. **Plan first for provenance / calibration / data tasks.** Produce a short written plan
   (see `docs/plans/`) and get sign-off before editing live.

## Verification gate (must pass to close a task)

API — from `apps/api/`:

```
uv sync
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest -m "not integration"
```

Web — via direct binaries (see quirks), from `apps/web/`: `node_modules/.bin/tsc --noEmit`,
`node_modules/.bin/eslint .`, `node_modules/.bin/vitest run`, `node_modules/.bin/next build`.

## Data-task closeout report

For any task touching `bortle_grid.npy` (or other committed data), end with: the file
**SHA-256**, shape/dtype, spot readings at known sites (NYC/London/Tokyo/Delhi/Cairo for
Bortle), and the **full class histogram**. That is what makes the result reviewable.

## Environment & sandbox quirks (STATE.md §4)

- Python is managed by **uv** (3.12). Never add build-only tooling to runtime deps — e.g.
  `rasterio` is build-only: run the grid script with `uv run --with rasterio …`, do not add
  it to `apps/api` deps.
- **`pnpm run` / `pnpm exec` are unreliable in the sandbox** (pre-run auto-install check).
  Verify the web app through the `node_modules/.bin/` binaries directly.
- **No network** to OpenAI / Supabase / ADS / CDS in the sandbox — those paths can't run
  here; they are covered by `@integration` tests and offline stand-ins.
- Working from a **repomix snapshot**? Build a line index first
  (`grep -n '<file path=' repomix-output.xml`) before extracting, and remember binary files
  (`.npy`) must be regenerated from their build script, not read out of the XML.

## Boundaries

- Never commit `.env` / `.env.local`; relay/base-URL switching is env, not code (§2.11).
- The Bortle↔mag/arcsec² table in `scripts/build_bortle_grid_viirs.py`
  (`BORTLE_MAG_LOWER_EDGES`) is the **single calibration authority**. Anything needing a
  Bortle↔SQM mapping (e.g. Track C `budget.py`) must derive from it, not re-invent it.
- Plan/handoff documents live in `docs/plans/` (or are gitignored) — don't leave them
  untracked at repo root.
