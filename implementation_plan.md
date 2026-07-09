# Implementation Plan

[Overview]
Surface `light_sensitivity` in the `/plan` results table and wire a date picker to the API's `when` param, making the light-pollution-aware ranking legible and enabling future-night planning — all frontend-only with no new dependencies.

The API (`rank_targets` in `planning.py`) already returns `light_sensitivity: number` (0–1) in each target row and already accepts a `when` query param (`YYYY-MM-DD` or full ISO; date-only is biased to the upcoming evening; invalid → 422). However, the web layer does neither: `RankedTarget` in `src/lib/api.ts` is missing the `light_sensitivity` field, `fetchNightPlan`/`fetchTargetDetail` don't accept or pass `when`, the proxy `app/api/plan/route.ts` doesn't read `when`, and `PlanClient.tsx` has no date picker and no LP-sensitivity column. This plan threads `when` through the full web stack (fetcher → proxy → UI), adds a compact "LP sens." badge column that makes ranking flips legible (a Bortle 7 user can SEE why galaxies sank), adds a native `<input type="date">` that re-fetches on change, and surfaces the dark-window dusk/dawn UTC timestamps so users can confirm which night was planned. A 422 from an invalid date is surfaced as a friendly inline error message.

The approach is surgical: (1) add `light_sensitivity` to the `RankedTarget` type and an `ApiError` class to preserve HTTP status through the proxy; (2) thread an optional `when` param through `fetchNightPlan`/`fetchTargetDetail` and the plan proxy route; (3) add a pure `lightSensitivityTier` helper to `format.ts` (unit-tested per STATE.md §2 rule 2) and render it as a shadcn `Badge` in a new table column; (4) add a date input + dusk/dawn display to `PlanClient.tsx`. Server/client component boundaries are unchanged (`page.tsx` stays a server component, `PlanClient.tsx` stays `"use client"`, `actions.ts` stays `"use server"`). The AI tools in `ai.ts` call `fetchNightPlan(lat, lon)` without `when` — the optional param defaults to undefined (tonight), so no caller changes are needed. No new dependencies; `pnpm-lock.yaml` is not modified.

[Types]
One existing type gains a field; one new error class and one new tier type are added; two function signatures gain an optional parameter.

- **`RankedTarget`** (in `apps/web/src/lib/api.ts`): gains `light_sensitivity: number`. The field is already returned by the API (0.0–1.0, where 0 = robust to light pollution, 1 = fragile). This is an additive change — all existing consumers (`PlanClient.tsx`, `TargetDetail` via `& RankedTarget`) are unaffected.
  ```ts
  export type RankedTarget = {
    name: string;
    common_name: string;
    kind: string;
    score: number;
    rating: "poor" | "marginal" | "good";
    peak_altitude_deg: number;
    hours_visible: number;
    moon_separation_deg: number;
    light_sensitivity: number;  // NEW — 0=robust, 1=fragile
  };
  ```

- **`ApiError`** (new class, in `apps/web/src/lib/api.ts`): extends `Error` with a `status: number` field so the proxy route can distinguish a backend 422 from a 502. `ApiError extends Error` means existing `e instanceof Error` checks in other routes still work.
  ```ts
  export class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  }
  ```

- **`LightSensitivityTier`** (new type, in `apps/web/src/lib/format.ts`): `"robust" | "moderate" | "fragile"`. Used by `lightSensitivityTier()` and to select the Badge variant in `PlanClient.tsx`.

- **`fetchNightPlan` signature**: changes from `(lat: number, lon: number) => Promise<NightPlan>` to `(lat: number, lon: number, when?: string) => Promise<NightPlan>`. The third parameter is optional and omitted by all existing callers (`ai.ts`, the plan proxy), so no caller changes are required. When `when` is undefined/empty, it is not added to the query params — today's behavior is untouched.

- **`fetchTargetDetail` signature**: changes from `(name: string, lat: number, lon: number) => Promise<TargetDetail>` to `(name: string, lat: number, lon: number, when?: string) => Promise<TargetDetail>`. Same optional-param pattern. Only caller is `ai.ts` which omits it.

- **`NightPlan`**: unchanged (already has `dusk_utc`, `dawn_utc`, `bortle`, `dark_hours`, `moon_illumination`, `targets`).
- **`TargetDetail`**: unchanged structurally, but inherits `light_sensitivity` from `RankedTarget` via `& RankedTarget`.
- **`Visibility`**: unchanged.

[Files]
Four existing source files are modified; one test file is extended; one documentation file is updated. No files are created, deleted, or moved.

- **Modified:** `apps/web/src/lib/api.ts`
  - Add `light_sensitivity: number` to the `RankedTarget` type (after `moon_separation_deg`).
  - Add `ApiError` class (exported) extending `Error` with a `status: number` field.
  - Update `get<T>`: on `!res.ok`, parse the response body for a FastAPI `detail` field (fall back to raw body), and throw `new ApiError(res.status, message)` instead of `new Error(...)`. This preserves the HTTP status and gives cleaner error messages.
  - Update `fetchNightPlan`: add optional `when?: string` third parameter; build params as `{ lat, lon }` and conditionally add `when` only when truthy (empty/undefined → omitted → tonight).
  - Update `fetchTargetDetail`: add optional `when?: string` fourth parameter; same conditional-add pattern.
  - `fetchVisibility`: unchanged (visibility endpoint has no `when` param).

- **Modified:** `apps/web/src/app/api/plan/route.ts`
  - Read `when` from `searchParams` (may be null).
  - Pass `when ?? undefined` to `fetchNightPlan(lat, lon, when ?? undefined)`.
  - In the `catch` block, check `e instanceof ApiError`: if true, return `NextResponse.json({ error: e.message }, { status: e.status })` (preserves 422); otherwise return 502 as today. Import `ApiError` from `@/lib/api`.

- **Modified:** `apps/web/src/lib/format.ts`
  - Add `LightSensitivityTier` type: `"robust" | "moderate" | "fragile"`.
  - Add `lightSensitivityTier(sensitivity: number): LightSensitivityTier`:
    - `sensitivity <= 0.3` → `"robust"`
    - `sensitivity <= 0.6` → `"moderate"`
    - `sensitivity > 0.6` → `"fragile"`
  - Existing `ratingLabel` function is unchanged.

- **Modified:** `apps/web/src/lib/__tests__/format.test.ts`
  - Add a `describe("lightSensitivityTier")` block with tests:
    - `≤ 0.3` → `"robust"` (test 0, 0.15, 0.3)
    - `0.3 < x ≤ 0.6` → `"moderate"` (test 0.31, 0.55, 0.6)
    - `> 0.6` → `"fragile"` (test 0.61, 0.9, 1.0)
  - Existing `ratingLabel` tests are unchanged.

- **Modified:** `apps/web/src/app/plan/PlanClient.tsx`
  - Import `lightSensitivityTier` from `@/lib/format`.
  - Add `when` state: `const [when, setWhen] = useState("");` (empty = tonight).
  - Modify `runPlan` to accept an optional `whenOverride?: string` parameter: `const w = whenOverride ?? when;`. Build `URLSearchParams({ lat, lon })` and conditionally `params.set("when", w)` only when `w` is non-empty. Change the button's `onClick` from `onClick={runPlan}` to `onClick={() => runPlan()}` (since `runPlan` now takes an optional string param — a raw `onClick={runPlan}` would pass the click event as the first argument).
  - Add a date input to the form row: `<Input type="date" value={when} onChange={...} />`. On change: `setWhen(e.target.value)` and auto-call `runPlan(e.target.value)` if `lat` and `lon` are non-empty. Use `flex-wrap` on the form container so it wraps gracefully on mobile.
  - Add a "LP sens." column header (`<th>`) after "Moon sep" and before the optional Log column.
  - Add a `<td>` for each target row: render a `<Badge>` with the tier text and a `title` attribute showing the numeric value (e.g., `title="Light pollution sensitivity: 0.90 (0=robust, 1=fragile)"`). Map tier to Badge variant: `robust` → `"good"` (emerald), `moderate` → `"marginal"` (amber), `fragile` → `"poor"` (muted). This reuses the existing shadcn `Badge` variants — no changes to `badge.tsx`.
  - Display the dark window: add a line below the `CardTitle` in the plan card showing `plan.dusk_utc` and `plan.dawn_utc` truncated to 16 chars (YYYY-MM-DD HH:MM) with a "UTC" suffix, e.g., `"2026-07-10 08:32 → 2026-07-10 18:45 UTC"`. This lets users confirm which night was planned.
  - Error display is unchanged (`{error && <p className="text-destructive text-sm">{error}</p>}`) — 422 messages from the backend (e.g., "invalid datetime '...'") will surface here via the proxy.

- **Modified:** `STATE.md`
  - §5 item 5: mark as done (✅), noting: `light_sensitivity` column added to `/plan` table (badge: robust/moderate/fragile with numeric tooltip); date picker wired to `when` param (re-fetches on change, 422 surfaced inline); `fetchNightPlan`/`fetchTargetDetail` and the plan proxy pass `when` through; `ApiError` class added to preserve backend status codes through the proxy; `lightSensitivityTier` added to `format.ts` with unit tests; dark-window dusk/dawn UTC displayed in the plan card.
  - §3 Web lib `api.ts` line: note `RankedTarget` now includes `light_sensitivity`; `fetchNightPlan`/`fetchTargetDetail` accept optional `when`; `ApiError` class added.
  - §1 file tree annotation for `format.ts`: note `lightSensitivityTier` helper added.

- **Not touched:** `apps/web/src/lib/ai.ts` (tool calls omit `when` → defaults to tonight; no change needed), `apps/web/src/app/api/visibility/route.ts` (visibility endpoint has no `when`; `get<T>` now throws `ApiError` but the visibility proxy's `catch` still returns 502 via `e instanceof Error ? e.message : String(e)` — `ApiError extends Error` so this works; no code change needed), `apps/web/src/components/ui/badge.tsx` (existing variants reused), `apps/web/src/components/ui/input.tsx`, `apps/web/src/app/plan/page.tsx` (server component boundary unchanged), `apps/web/src/app/plan/actions.ts`, `apps/web/package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `pnpm-lock.yaml`, `supabase/migrations/*`.

[Functions]
Two function signatures change (gain optional parameters); one function's error-throwing behavior changes; one new pure function is added.

- **New function:** `lightSensitivityTier` in `apps/web/src/lib/format.ts`.
  - Signature: `lightSensitivityTier(sensitivity: number): LightSensitivityTier`
  - Logic: `≤ 0.3` → `"robust"`, `≤ 0.6` → `"moderate"`, `> 0.6` → `"fragile"`.
  - Pure, deterministic, unit-tested (STATE.md §2 rule 2).

- **Modified function:** `fetchNightPlan` in `apps/web/src/lib/api.ts`.
  - Current: `fetchNightPlan(lat: number, lon: number): Promise<NightPlan>` — calls `get<NightPlan>("/plan/night", { lat, lon })`.
  - New: `fetchNightPlan(lat: number, lon: number, when?: string): Promise<NightPlan>` — builds params as `{ lat, lon }`, conditionally adds `when` when truthy, calls `get<NightPlan>("/plan/night", params)`. When `when` is undefined/empty, the params object is `{ lat, lon }` — byte-identical to today.

- **Modified function:** `fetchTargetDetail` in `apps/web/src/lib/api.ts`.
  - Current: `fetchTargetDetail(name: string, lat: number, lon: number): Promise<TargetDetail>` — calls `get<TargetDetail>("/plan/target", { name, lat, lon })`.
  - New: `fetchTargetDetail(name: string, lat: number, lon: number, when?: string): Promise<TargetDetail>` — same conditional-add pattern as `fetchNightPlan`.

- **Modified function:** `get<T>` in `apps/web/src/lib/api.ts`.
  - Current: throws `new Error(`API ${res.status}: ${await res.text()}`)` on `!res.ok`.
  - New: reads the response body, attempts to parse JSON and extract `detail` (FastAPI's error format), falls back to raw body; throws `new ApiError(res.status, message)`. The `ApiError` extends `Error`, so existing `e instanceof Error` checks in other routes still work. The status code is preserved on the error object.

- **Modified function:** `runPlan` in `apps/web/src/app/plan/PlanClient.tsx`.
  - Current: `async function runPlan()` — builds `URLSearchParams({ lat, lon })`, fetches `/api/plan?${params}`.
  - New: `async function runPlan(whenOverride?: string)` — resolves `const w = whenOverride ?? when;`, builds `URLSearchParams({ lat, lon })`, conditionally `params.set("when", w)` when `w` is non-empty. The rest (fetch, error handling, state updates) is unchanged.

- **New functions:** `lightSensitivityTier` (above).
- **Removed functions:** none.
- **Unchanged but relevant:** `fetchVisibility` (no `when` param), `ratingLabel` in `format.ts` (unchanged), `saveSession`/`logObservation` in `actions.ts` (unchanged).

[Classes]
One new error class is added; no existing classes are structurally modified.

- **New class:** `ApiError` in `apps/web/src/lib/api.ts`.
  - `class ApiError extends Error { constructor(public status: number, message: string) { super(message); this.name = "ApiError"; } }`
  - Key methods: none (data carrier). Inherits `message` from `Error`.
  - Inheritance: extends `Error`. This ensures `e instanceof Error` remains true in all existing catch blocks (visibility proxy, PlanClient catch).
  - Exported so the plan proxy route can `import { ApiError }` and check `e instanceof ApiError`.

- **Modified classes:** none.
- **Removed classes:** none.
- **Unchanged classes:** `Badge` (in `badge.tsx`), `Input` (in `input.tsx`), `PlanClient` (function component, not a class — modified in place but no class structure change).

[Dependencies]
No dependency changes.

No new packages, no version bumps, no lockfile changes. The `<input type="date">` is a native HTML element styled with the existing shadcn `Input` component — no datepicker library. The `ApiError` class is plain TypeScript. The `lightSensitivityTier` function is pure TypeScript. `pnpm-lock.yaml` is not modified. STATE.md rule 10 (no new dependencies) is respected.

[Testing]
One new test block is added; existing tests must remain green. The verification commands use direct `.bin` binaries per STATE.md §4 to dodge the sandbox pnpm-run quirk.

- **New tests:** `describe("lightSensitivityTier")` in `apps/web/src/lib/__tests__/format.test.ts`:
  - `it("returns robust for ≤0.3")` — tests 0, 0.15, 0.3
  - `it("returns moderate for 0.3<x≤0.6")` — tests 0.31, 0.55, 0.6
  - `it("returns fragile for >0.6")` — tests 0.61, 0.9, 1.0
  - Total: 3 new test cases (format tests go from 3 → 6; total web tests go from 29 → 32).

- **Existing tests:** must remain green. The 29 current tests (metrics 12, faithfulness 7, fusion 4, rerank 3, format 3) are all offline/standalone and do not exercise `fetchNightPlan`, `get<T>`, or `PlanClient`. The `format.test.ts` changes are purely additive (new `describe` block; existing `ratingLabel` tests untouched).

- **Type safety notes:**
  - `ApiError` uses a TypeScript parameter property (`public status: number`) — strict-compatible.
  - `fetchNightPlan`/`fetchTargetDetail` optional `when?: string` — callers that omit it (`ai.ts`) are unaffected.
  - `lightSensitivityTier` returns a union type `"robust" | "moderate" | "fragile"` — used to index the Badge variant.
  - The Badge `variant` prop accepts `"good" | "marginal" | "poor" | null | undefined`. The tier-to-variant mapping (`robust→"good"`, `moderate→"marginal"`, `fragile→"poor"`) must be type-safe. A ternary chain or a `Record<LightSensitivityTier, "good"|"marginal"|"poor">` map both work.

- **Verification commands (run from `apps/web`, direct binaries per STATE.md §4):**
  ```
  node_modules/.bin/tsc --noEmit
  node_modules/.bin/eslint .
  node_modules/.bin/vitest run
  node_modules/.bin/next build
  ```
  Expected: 0 type errors, 0 lint errors, 32 tests passed (29 existing + 3 new), build successful (12 routes).

- **Manual verification (requires running API + web dev server):**
  - Load `/plan`, enter a Bortle 7 location (e.g., lat=40.71, lon=-74.01 for NYC), click "Rank targets" — the "LP sens." column should show "fragile" badges (red/muted) for galaxies and "robust" (green) for clusters.
  - Pick a future date — the plan should re-fetch and the dark-window line should show the new night's dusk/dawn UTC.
  - Type an invalid date via URL manipulation (e.g., `?when=2026-13-45`) — a 422 error message should appear inline.

[Implementation Order]
Numbered steps in execution order to minimize conflicts and ensure CI stays green.

1. Edit `apps/web/src/lib/api.ts`: add `light_sensitivity: number` to `RankedTarget`; add `ApiError` class; update `get<T>` to throw `ApiError` with extracted detail; update `fetchNightPlan` and `fetchTargetDetail` to accept optional `when` and conditionally add it to params.
2. Edit `apps/web/src/lib/format.ts`: add `LightSensitivityTier` type and `lightSensitivityTier` function.
3. Edit `apps/web/src/lib/__tests__/format.test.ts`: add `describe("lightSensitivityTier")` block with 3 test cases.
4. Edit `apps/web/src/app/api/plan/route.ts`: read `when` from searchParams; pass to `fetchNightPlan`; check `instanceof ApiError` in catch to preserve 422 status.
5. Edit `apps/web/src/app/plan/PlanClient.tsx`: add `when` state; modify `runPlan` to accept `whenOverride` and include `when` in params; add date `<Input type="date">`; add "LP sens." column with Badge; add dark-window dusk/dawn display; change button `onClick` to `() => runPlan()`.
6. Run `apps/web/node_modules/.bin/tsc --noEmit` — expect 0 type errors.
7. Run `apps/web/node_modules/.bin/eslint .` — expect 0 lint errors.
8. Run `apps/web/node_modules/.bin/vitest run` — expect 32 tests passed.
9. Run `apps/web/node_modules/.bin/next build` — expect build successful (12 routes).
10. Update `STATE.md`: §5 item 5 mark done; §3 `api.ts`/`format.ts` annotations; §1 file tree note.
11. Confirm `git diff --stat` shows exactly: `apps/web/src/lib/api.ts`, `apps/web/src/lib/format.ts`, `apps/web/src/lib/__tests__/format.test.ts`, `apps/web/src/app/api/plan/route.ts`, `apps/web/src/app/plan/PlanClient.tsx`, `STATE.md`.