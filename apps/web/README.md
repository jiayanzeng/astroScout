# @astroscout/web

Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui + Vercel AI SDK v6.

## Run (from repo root)

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # API, Supabase, OpenAI, optional reranker
pnpm --filter @astroscout/web dev               # http://localhost:3000
```

The API base URL points at the FastAPI service (default `http://127.0.0.1:8000`),
so run that too (`cd apps/api && uv run uvicorn astroscout_api.main:app --reload`).

## What's wired

- `/plan` — public ranked night planning; signed-in gear create/select/delete;
  measured-SQM, focal-ratio, and filter-aware integration budgets; session save/log; and
  an on-demand **Project** action. Project calls the validated `/api/project` Next.js
  proxy, which forwards to FastAPI `GET /plan/project` for up to 60 nights.
- `/sessions` — authenticated saved sessions and logged observations, protected by RLS
- `/chat` — authenticated, rate-limited Vercel AI SDK tool loop with content-free
  latency/token/cost accounting and versioned text-only browser persistence. Its three
  tools are `planNight`, `getTargetDetail`, and `searchKnowledge`; planning tools use
  trusted observer context, while science answers expose cited titles and bibcodes.
- `/privacy` — the chat storage/provider boundary and what is deliberately not persisted
- `/api/plan`, `/api/project`, `/api/visibility` — presence-first validated FastAPI
  proxies that preserve structured target-resolution errors
- shadcn/ui set up (`components.json`, `lib/utils.ts`, `ui/button|input|card`)

Supabase migrations `0001` through `0006` must be applied in order. Database read errors
are rendered explicitly on the signed-in plan/session pages instead of appearing as empty
state. Migration `0006` is required before chat will accept requests.

If a local relay or HTTPS proxy uses a CA missing from Node's trust store, install a
verified PEM outside the repository and set `NODE_EXTRA_CA_CERTS=/absolute/path/to/ca.pem`
in the machine/shell environment before starting Next.js. Never use
`NODE_TLS_REJECT_UNAUTHORIZED=0`, and never commit either setting to an env file.

Run the single canonical hosted journey in
[`../../docs/live-acceptance.md`](../../docs/live-acceptance.md) before calling a release
accepted. It includes magic-link auth, gear CRUD, budget/projection, saved-session reload,
all three chat trajectories, citations, persistence, accounting, and public error cases.

## Checks (same as CI)

```bash
pnpm --filter @astroscout/web lint
pnpm --filter @astroscout/web typecheck
pnpm --filter @astroscout/web test
pnpm --filter @astroscout/web build
```

`/chat` needs a signed-in Supabase user, migration `0006`, `OPENAI_API_KEY`, and an
ingested corpus for grounded science answers. Planning and projection do not need an
OpenAI key, but they do require the configured FastAPI service.
