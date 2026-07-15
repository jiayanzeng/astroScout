# @astroscout/web

Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui + Vercel AI SDK v6.

> The Week-2 plan said "Next.js 15"; the latest stable at build time was **16**, so this
> uses 16. To pin to 15 instead: `pnpm --filter @astroscout/web add next@15 eslint-config-next@15`.

## Run (from repo root)

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # set API_BASE_URL + OPENAI_API_KEY
pnpm --filter @astroscout/web dev               # http://localhost:3000
```

The API base URL points at the Week-1 FastAPI service (default `http://127.0.0.1:8000`),
so run that too (`cd apps/api && uv run uvicorn astroscout_api.main:app --reload`).

## What's wired

- `/plan` — ranked night planning, signed-in gear profiles, integration-time ranges,
  measured SQM override, session saving, and on-demand multi-night projections
- `/sessions` — authenticated saved sessions and logged observations, protected by RLS
- `/chat` — relay-safe Vercel AI SDK tool loop for planning, target detail, and cited
  knowledge search
- shadcn/ui set up (`components.json`, `lib/utils.ts`, `ui/button|input|card`)

Supabase migrations `0001` through `0005` must be applied in order. Database read errors
are rendered explicitly on the signed-in plan/session pages instead of appearing as empty
state.

## Checks (same as CI)

```bash
pnpm --filter @astroscout/web lint
pnpm --filter @astroscout/web typecheck
pnpm --filter @astroscout/web test
pnpm --filter @astroscout/web build
```

`/chat` needs `OPENAI_API_KEY`; everything else runs without it.
