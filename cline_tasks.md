# AstroScout — Remaining Work: Outline & Cline Task Prompts (post v0.6.1 docs update)

Ordering rationale: CI is currently red (Task 0 — nothing ships over a red pipeline);
Task 1 removes the config footgun that caused the 401 hunt; Task 2 verifies the relay
before anything depends on it; Task 3 builds measurement before making retrieval
claims (project rule: eval-driven decisions); Task 4 is the zero-dependency,
high-legibility UI work and can run in parallel with 2–3.

Every task prompt assumes Cline reads `STATE.md` first — it is the source of truth.

---

## Outline

| # | Task | Type | Depends on | Verifiable offline? |
|---|------|------|-----------|---------------------|
| 0 | Fix `rag/embeddings.py` ruff/format regression | fix, ~5 min | — | yes |
| 1 | Env/config hardening (`.env.example` sync + env_file anchoring) | fix/refactor | 0 | yes |
| 2 | Verify relay end-to-end on web (`/chat`, LLM rerank, judge) | verify + possible 3-line change | 1 | needs live keys |
| 3a | Eval harness: isolate rerank (live no-rerank baseline) | feature | 0 | yes |
| 3b | Ingest corpus + measure live rerank lift; record numbers | measurement | 1, 2, 3a | needs live keys |
| 4 | UI: `light_sensitivity` column + `when` date picker | feature | 0 | yes |
| B1–B4 | Backlog: VIIRS raster · retrieval polish · faithfulness gate · planets | later | — | mixed |

---

## Task 0 — Restore CI green: fix `rag/embeddings.py` lint/format

**Prompt for Cline:**

> Read `STATE.md` fully first (§4 "Current status" and §5 item 0).
>
> The 2026-07-02 relay patch to `apps/api/src/astroscout_api/rag/embeddings.py` broke
> the api CI job: `ruff check .` fails E501 (a comment line >100 chars) and
> `ruff format --check .` wants to reformat the file (trailing whitespace after
> `return []`). Fix ONLY the formatting:
>
> 1. Shorten the over-long comment above the `base_url` line to ≤100 chars, e.g.
>    `# Resolve the endpoint at call time; unset -> official OpenAI API.`
> 2. Remove the trailing whitespace on the blank-ish line after `return []`.
> 3. Do NOT change any behavior: `EMBED_MODEL`/`EMBED_DIM` untouched, the
>    `settings.openai_base_url or "https://api.openai.com/v1"` fallback and
>    `f"{base_url.rstrip('/')}/embeddings"` construction must remain identical.
>
> Verify from `apps/api`:
> `uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run pytest -m "not integration"`
> — expect 0 lint errors, 0 reformat candidates, mypy clean, 40 passed / 10 deselected.
> No other files may change.

---

## Task 1 — Env/config hardening

**Prompt for Cline:**

> Read `STATE.md` first (§4 quirks: "pydantic-settings env_file is CWD-relative", and
> §5 item 1). Two changes, api CI must stay green.
>
> **(a) Make the relay knob discoverable in the example env files.**
> - Root `.env.example`: after `OPENAI_API_KEY=`, add:
>   ```
>   # Optional: OpenAI-compatible relay endpoint (default: https://api.openai.com/v1)
>   OPENAI_BASE_URL=
>   ```
> - `apps/web/.env.example`: same two lines after its `OPENAI_API_KEY=`. Note in the
>   comment that `@ai-sdk/openai` reads this env var natively (no code involved).
> - Do NOT touch `.env` / `.env.local` (gitignored, contain secrets).
>
> **(b) Anchor `Settings` env-file loading to the repo root so it no longer depends
> on the process CWD** (this caused a stale-`.env`-copy 401 bug).
> In `apps/api/src/astroscout_api/config.py`:
> - Compute the repo root: `_REPO_ROOT = Path(__file__).resolve().parents[4]`
>   (config.py → astroscout_api → src → api → apps → repo root; verify the depth).
> - Change `model_config` to
>   `SettingsConfigDict(env_file=(_REPO_ROOT / ".env", Path(__file__).resolve().parents[2] / ".env"), extra="ignore")`
>   — in pydantic-settings, **later entries in the tuple take priority**, so a local
>   `apps/api/.env` overrides the repo-root `.env`. Confirm this priority order against
>   the installed pydantic-settings version before finalizing.
> - Keep `mypy --strict` clean (annotate `_REPO_ROOT: Path`; import `pathlib.Path`).
> - Add a small CI-safe unit test `apps/api/tests/test_config.py`: assert the env_file
>   tuple's first entry is an absolute path ending at the repo root `.env` and that
>   instantiating `Settings()` from a temp CWD (`monkeypatch.chdir(tmp_path)`) does not
>   raise and still exposes the expected fields. No network, no real keys.
>
> Verify from `apps/api`:
> `uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run pytest -m "not integration"`.
> Then update `STATE.md`: mark §5 item 1 done, and rewrite the §4 quirk to describe
> the new anchored behavior (root `.env` default, `apps/api/.env` local override).

---

## Task 2 — Verify the relay end-to-end on the web side

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 2). Embedding calls through the relay are proven;
> the chat and rerank paths are not. This is a verify-first task — change code only
> if the verification fails.
>
> Background: `app/api/chat/route.ts` (streamText) and `lib/rerank.ts` LLMReranker
> (generateObject) — and `evals/judge-openai.ts` — all use the default
> `openai("gpt-4o-mini")`. In AI SDK v6 that provider instance targets OpenAI's
> **Responses API** (`/v1/responses`). Relays that only implement
> `/v1/chat/completions` fail with a stream-mismatch error whose message itself
> recommends `openai.chat('model-id')` or `@ai-sdk/openai-compatible`.
>
> Steps:
> 1. With `OPENAI_API_KEY` + `OPENAI_BASE_URL` set in `apps/web/.env.local`
>    (already configured on this machine), start the dev server and exercise `/chat`
>    with a prompt that triggers `searchKnowledge` (so the LLM reranker also runs,
>    unless `COHERE_API_KEY` is set — unset it for this test).
> 2. If both work: no code change. Record the result in `STATE.md` §5 item 2 (mark
>    verified, note the relay supports `/v1/responses`).
> 3. If the Responses-API mismatch occurs: switch `openai("gpt-4o-mini")` →
>    `openai.chat("gpt-4o-mini")` in `app/api/chat/route.ts`, `lib/rerank.ts`, and
>    `evals/judge-openai.ts`. This stays compatible with the official API. Do NOT
>    hardcode any relay URL (STATE.md rule 11).
> 4. Keep web CI green: `pnpm --filter @astroscout/web lint && typecheck && test && build`.
> 5. Never commit `.env.local`; never add `NODE_TLS_REJECT_UNAUTHORIZED` to code or
>    checked-in config (it is a local-only env workaround, see STATE.md §4).
> 6. Update `STATE.md` §5 item 2 with the outcome either way.

---

## Task 3a — Eval harness: isolate the rerank contribution (offline-verifiable)

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 3 and §2 rules 1 & 3). Analysis + minimal change.
>
> Problem: `evals/retriever.ts` `LiveRetriever` wraps `lib/knowledge.ts
> searchKnowledge`, which fuses `hybrid_search` RPC + `rerankPassages` into one call —
> so the live comparison cannot isolate the reranker's lift.
>
> Change:
> 1. In `apps/web/src/lib/knowledge.ts`, add an options parameter to
>    `searchKnowledge(query, target?, opts?: { rerank?: boolean })`, defaulting to
>    `rerank: true` (production behavior unchanged, including the `ai.ts` tool call
>    signature). When `rerank: false`, return the top-5 `hybrid_search` candidates
>    directly (same shape, similarity from the RPC).
> 2. In `evals/retriever.ts`, split `LiveRetriever` into two named variants (e.g.
>    constructor flag): `pgvector-hybrid(live)` (no rerank) and
>    `pgvector-hybrid+rerank(live)`.
> 3. In `evals/run.ts`, when live keys are present, run BOTH live variants so the
>    report shows hybrid vs hybrid+rerank side by side. Offline behavior (no keys)
>    must be byte-identical to today.
> 4. Do not tune anything to make rerank look good — report whatever the harness says
>    (STATE.md rule 1).
>
> Verify offline (sandbox-safe, use direct binaries per STATE.md §4):
> `apps/web/node_modules/.bin/tsc --noEmit`, `.../eslint .`, `.../vitest run`,
> `.../tsx evals/run.ts` (offline table unchanged), `.../next build`.

---

## Task 3b — Ingest the corpus and measure the live rerank lift (human-in-the-loop)

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 3, §6, and §4 Supabase gotchas). Prereqs: Tasks 1,
> 2, 3a merged; live keys available. I will supply keys via env — never print or
> commit them.
>
> 1. Confirm Supabase migrations 0001→0002→0003 are applied (I'll confirm in the
>    dashboard). If ingest later returns HTTP 42501 "permission denied for table
>    documents", stop and show me the GRANT SQL from STATE.md §4 to run manually.
> 2. From `apps/api`: `uv run python scripts/ingest_knowledge.py --all`. Report
>    chunks-stored per target; investigate any target that stores 0 (the ADS resolver
>    falls back to `abs:` on resolver errors — degraded is acceptable, silent-zero is not).
> 3. From `apps/web`, run the live eval:
>    `OPENAI_API_KEY=... OPENAI_BASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node_modules/.bin/tsx evals/run.ts`
>    Run twice: once with the LLM reranker (no COHERE_API_KEY) and, if a Cohere key is
>    available, once with it.
> 4. Record results: add a "live corpus" table under the offline table in `STATE.md`
>    §3 (hybrid vs hybrid+rerank: recall@3 / MRR / nDCG@5, plus which reranker), and
>    update `evals/README.md`. State plainly whether rerank lifts, is flat, or
>    regresses — do not editorialize the numbers (STATE.md rule 1). If rerank does not
>    lift, add a §5 follow-up item to reconsider the prod rerank step.
> 5. Update `STATE.md` §5 item 3 status.

---

## Task 4 — Surface `light_sensitivity` + add a `when` date picker (independent; parallelizable)

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 5, §2 rule 4, §3 "Web lib" and `planning.py`
> sections). Frontend-only; the API already returns everything needed.
>
> **(a) `light_sensitivity` column in the `/plan` results table.**
> - `RankedTarget` rows already include `light_sensitivity: number` (0–1) — add it to
>   the type in `src/lib/api.ts` if it is not yet declared there.
> - In `PlanClient.tsx`, add a compact column (header e.g. "LP sens."). Render as a
>   human-readable badge — e.g. ≤0.3 "robust", ≤0.6 "moderate", >0.6 "fragile" — with
>   the numeric value in a tooltip/title attribute. Reuse the existing shadcn `Badge`.
> - Purpose: make the defining behavior legible — a user in a Bortle 7 city should be
>   able to SEE why galaxies sank. Keep the table readable on mobile widths.
>
> **(b) Date picker wired to the API's `when` param.**
> - The backend accepts `when` (`YYYY-MM-DD` or full ISO; date-only is biased to the
>   upcoming evening; invalid → 422). The web proxy `app/api/plan/route.ts` and
>   `fetchNightPlan` in `src/lib/api.ts` must pass `when` through (add the param;
>   omit it entirely when unset so today's behavior is untouched).
> - In `/plan`, add a plain `<input type="date">` (no new dependency) defaulting to
>   empty = tonight. On change, re-fetch the plan with `when`. Surface a 422 as a
>   friendly inline message.
> - Show the resulting dark window dates (dusk/dawn already in `NightPlan`) so the
>   user can confirm which night was planned.
>
> Constraints: no new dependencies; keep server/client component boundaries as they
> are; keep `lint`, `typecheck`, `test`, `build` green (verify via direct `.bin`
> binaries per STATE.md §4). Add a small unit test if you touch `format.ts`.
> Update `STATE.md` §5 item 5 when done.

---

## Backlog 

- **B1 — VIIRS/World Atlas raster** (STATE §5.4): produce a `uint8 (720,1440)` 0.25°
  `.npy` in the same orientation at the same path; zero code change; re-run the grid
  sanity checks in `test_bortle.py` and update the documented city-core readings.
- **B2 — Retrieval polish** (§5.6): per-passage chunk dedup + a local bge-reranker as a
  third `rerankPassages` backend — A/B in the harness (Task 3a machinery) before adoption.
- **B3 — Live-gated faithfulness pass** (§5.7): wire `OpenAIJudge` over a few canned
  copilot answers; key-gated, excluded from CI by default.
- **B4 — Planets/non-DSO targets** (§5.8): extend the catalog; planets get
  `light_sensitivity ≈ 0` so city rankings behave correctly.

---

## Task B1 — Swap the modeled Bortle grid for a real World Atlas / VIIRS raster

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 4, §2 rule 1, §3 "`bortle/`"). This is a _data_ swap with **zero runtime code change** — `grid.py::bortle_at` and everything downstream stay byte-identical. You are only replacing `apps/api/src/astroscout_api/bortle/bortle_grid.npy` with one derived from measured survey data.
> 
> **Orientation contract (must match exactly — verify against `grid.py`):** `uint8`, shape `(720, 1440)`, 0.25°. Row 0 = lat **+90** (north); row `i` center = `90 − (i+0.5)·0.25`. Col 0 = lon **−180**; col `j` center = `−180 + (j+0.5)·0.25`. Lookup is `row = int((90−lat)/0.25)`, `col = int((lon+180)/0.25)`. A source raster in a different orientation (e.g. row 0 = south, or 0–360° longitude) **must be flipped/rolled** to this convention before saving.
> 
> Steps:
> 
> 1. Add a **new** script `scripts/build_bortle_grid_viirs.py` (do NOT overwrite `build_grid()` in `grid.py` — the city model stays as the documented fallback). It reads the source (World Atlas 2015 artificial sky brightness, or the VIIRS DNB annual composite), resamples to the 0.25° lattice in the orientation above, maps brightness → Bortle 1–9 using a **published calibration** (e.g. Falchi 2016 sky-brightness bins / the standard Bortle↔mag-arcsec⁻² table) — do not invent thresholds — and `np.save`s to `GRID_PATH`. Print the per-class cell histogram like `build_bortle_grid.py` does.
> 2. Data acquisition + conversion runs on a real machine (source rasters are large and the sandbox has no network to them). Commit the script, the calibration mapping, and the regenerated `.npy`.
> 3. **Provenance (rule 1):** once the committed grid is measured data, update the "HONEST FRAMING" docstring in `model.py`, `STATE.md` §2 rule 1, and §3 "`bortle/`" to state the _grid_ is now satellite-derived — while noting the `model.py` estimator remains the offline fallback. Do not claim the estimator itself is measured.
> 4. **Tests:** the grid assertions in `tests/test_bortle.py` are directional (NYC ≥ 6, mid-Pacific ≤ 2, Sahara ≤ 2, shape/dtype, clamp) and should still pass with real data — run them and confirm. Re-measure the documented readings and update §3 (city-core Bortle values — NYC should now read ~9, not 7 — and the "% of cells Bortle 1"). If any directional assertion genuinely fails on real data, report it; do not tune the data to satisfy the test.
> 
> Verify from `apps/api`: `uv run pytest -m "not integration" -k bortle`, then the full `ruff check . && ruff format --check . && mypy src && pytest -m "not integration"`. `pyproject.toml` already ships `*.npy` in the wheel, so packaging is unaffected. Update `STATE.md` §5 item 4 when done.

---

## Task B2 — Retrieval polish: chunk dedup + a local bge-reranker backend (A/B first)

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 6, §2 rules 1 & 3, §3 "Web `lib`"). Two changes, and per rule 3 **nothing goes to prod default until the harness says it lifts.**
> 
> **(a) Per-passage dedup** in `apps/web/src/lib/knowledge.ts`. `hybrid_search` can return several near-duplicate chunks from the same document. After the RPC and **before** `rerankPassages`, collapse near-dups so the reranker sees distinct passages: group by `(target, bibcode)` and drop chunks whose normalized content is a prefix/near-match of a higher-similarity sibling; keep the best-scoring one. Factor the dedup into a pure helper and unit-test it (offline, no keys). Production shape unchanged.
> 
> **(b) Local bge cross-encoder** as a third `rerankPassages` backend in `apps/web/src/lib/rerank.ts`. Current dispatch is Cohere (if `COHERE_API_KEY`) → LLM (if `OPENAI_API_KEY`) → pass-through. Add a **local, no-vendor** backend (BAAI `bge-reranker-base` via an ONNX runtime / `@huggingface/transformers`), selected by env (e.g. `RERANK_BACKEND=bge`). It **must lazy-load via dynamic `import()`** so the model is never pulled into CI, `vitest`, or `next build` — no hard dependency on the build/test path. The new package is dev/opt-in.
> 
> **(c) A/B in the harness before adoption** (Task 3a machinery). Add the bge path as an eval reranker variant so `evals/run.ts` can compare LLM-rerank vs bge-rerank on the live corpus. Run it; record recall@3 / MRR / nDCG@5 for both under §3 and in `evals/README.md`. State plainly whether bge lifts, is flat, or regresses vs the current LLM reranker (rule 1). Only make bge the prod default if it wins; otherwise leave it opt-in and say so.
> 
> Verify offline via direct binaries (STATE.md §4): `apps/web/node_modules/.bin/{tsc --noEmit, eslint ., vitest run, next build}` and `.../tsx evals/run.ts` (offline table unchanged, no keys → bge/live paths skipped). Do not hardcode any endpoint (rule 11). Update `STATE.md` §5 item 6.

---

## Task B3 — Live-gated copilot faithfulness pass over canned answers

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 7, §2 rules 1 & 9). `OpenAIJudge` already exists in `apps/web/evals/judge-openai.ts` (verified through the relay, §5 item 2); this task exercises it over a fixture, **key-gated and excluded from CI**.
> 
> Steps:
> 
> 1. Add a small fixture `apps/web/evals/faithfulness-cases.ts`: ~5–8 tuples of `{ question, answer, contexts: string[] }` styled after real copilot output. Include **both** fully-grounded answers and a few with a deliberately ungrounded claim (e.g. an invented number or an unsupported superlative) so the pass can catch a regression.
> 2. Add `apps/web/evals/faithfulness.live.test.ts` that runs `OpenAIJudge` over the fixture, gated with `describe.skipIf(!process.env.OPENAI_API_KEY)` (Vitest). With no key it is **skipped, not failed** — offline `vitest run` output must be unchanged (still 32 tests). Assert grounded cases score ≥ a threshold (e.g. 0.8 via `faithfulnessScore`) and each planted-ungrounded case scores below it.
> 3. Reuse the existing `splitClaims` / `faithfulnessScore` from `faithfulness.ts`; keep the offline `MockJudge` tests as-is. `OpenAIJudge` uses `openai("gpt-4o-mini")`, which honors `OPENAI_BASE_URL` — do not hardcode a relay (rule 11).
> 4. (Optional) a tiny `evals/faithfulness-run.ts` that prints per-case scores when a key is present, mirroring `evals/run.ts`.
> 
> Verify offline via direct binaries (STATE.md §4): `.bin/tsc --noEmit`, `.bin/eslint .`, `.bin/vitest run` (live test skipped), `.bin/next build`. Update `STATE.md` §5 item 7 (note the pass is live-gated, CI-excluded, MockJudge stays the offline path).

---

## Task B4 — Add planets / non-DSO targets (`light_sensitivity ≈ 0`)

**Prompt for Cline:**

> Read `STATE.md` first (§5 item 8, §2 rule 4, §3 "`scoring.py`" and "`planning.py`"). Planets **move**, so they can't be fixed-RA/Dec catalog rows — the seam is `get_body`, already imported and used for the moon in `conditions_for`.
> 
> Steps:
> 
> 1. **`dso_catalog.py`:** add an optional field `body: str | None = None` to `CatalogObject` (an astropy `get_body` name, e.g. `"mars"`). When set, `ra_hours`/`dec_deg` are unused placeholders. Add planet rows (Jupiter, Saturn, Mars, Venus) with `kind="planet"`.
> 2. **`scoring.py` (PURE — the CI-tested part):** add `"planet": 0.0` (or ~0.05) to `_SENSITIVITY_BY_KIND`. High surface brightness → `light_sensitivity ≈ 0` → `light_pollution_factor` ≈ 1.0 even at Bortle 9, so planets don't sink in city rankings. Add a `tests/test_scoring.py` case: `light_sensitivity_for_kind("planet") ≈ 0` and `light_pollution_factor(9, that) ≈ 1.0`.
> 3. **`planning.py::conditions_for`:** branch on `obj.body`. If set, compute the night-grid AltAz via `get_body(obj.body, times, location)` instead of `_coord(obj).transform_to(frame)`, and take moon separation from the body's coord at peak. This is astropy-backed → stays on the **integration** side (like the rest of `conditions_for`). Add an `@pytest.mark.integration` planning test for one planet (up on some night at some latitude). Builtin ephemeris is planning-grade — note the approximation; seasonal visibility is handled by the existing altitude/hours logic.
> 4. No web change needed — rows already carry `kind` + `light_sensitivity`, so planets render with a "planet" kind and a "robust" LP badge (≤0.3). Mention this in STATE.
> 
> Verify from `apps/api`: `uv run ruff check . && ruff format --check . && mypy src && pytest -m "not integration"` (the pure scoring test runs in CI; the planet planning test is integration-excluded). Update `STATE.md` §5 item 8, the §3 catalog note, and the §3 `scoring.py` sensitivity list.

---
