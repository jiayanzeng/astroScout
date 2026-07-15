# PA-0 credential and key-boundary closeout — 2026-07-16

This record contains operational statuses and non-private acceptance results only. It does
not contain a credential value, fingerprint, masked value, screenshot, private chat text,
cookie, or authorization material.

## Relay credential containment and replacement

- The relay provider independently showed the earlier `jyz8270202 initial token`
  credential as disabled.
- A replacement labelled `AstroScout PA0 20260716` was created. The provider form retained
  its numeric defaults during the first successful submission and created eleven tokens at
  a ¥1,010 per-token quota instead of the intended one token at ¥10. This failed operation
  is preserved rather than omitted.
- All ten unintended suffixed tokens were disabled immediately. The retained unsuffixed
  replacement was reduced to a ¥10 quota. Final provider state was eleven new tokens:
  ten disabled and exactly one enabled; the earlier credential also remained disabled.
- The replacement was transferred directly from the provider UI to the sensitive Vercel
  field. Its value was not written to the repository, task output, shell transcript,
  screenshot, or this record.

## Deployment and public-key boundary

- Vercel's sensitive `OPENAI_API_KEY` environment row was updated for both Production and
  Preview. The public Supabase URL/key and relay base URL scopes were unchanged.
- Production deployment `5kFsEWX3FepoRz3Si9aK4SXoPta8`, built from commit `5fd3151`,
  reached Ready and served the stable production origin.
- The deployed browser bundle's Supabase key exactly matched the configured public web
  key and had the `sb_publishable_` class. No `sb_secret_` key class was present. The
  public key was therefore not rotated; existing RLS and explicit grants remain the
  security boundary.

## Signed-in production acceptance

The built-in non-private Auckland chat starter completed on 2026-07-15 from
16:54:49–16:55:06 UTC. It invoked `planNight`, completed two model steps, rendered an
assistant response, and returned no visible stream, authentication, rate, or relay error.

The corresponding content-free usage row reached `completed` with 2,882 input tokens,
425 output tokens, 3,307 total tokens, estimated cost `$0.00068730`, 17,072 ms duration,
and no failure reason.

Vercel recorded five correlated structured events: request start, `planNight` completion,
two completed model steps, and request completion. The completion event recorded 17,363 ms,
2,882 input tokens, 425 output tokens, and estimated cost `$0.0006873`. Across the five
events, the recorded fields were limited to event/request correlation, status, tool name,
step, timing, finish reason, token totals, and estimated cost. No prompt, response, message
content, tool payload, user ID, authorization, cookie, email, API key, or secret field was
present.

## Repository verification

No application code, schema, dependency, corpus row, calibration artifact, or model constant
changed. The full closeout gate produced these results:

- API: Ruff, format, and mypy passed; pytest reported **99 passed / 19 deselected**.
- Web: typecheck and ESLint passed; Vitest reported **83 passed / 11 skipped**; the optimized
  build completed with **14 routes**.
- The first sandboxed `uv sync` attempt failed because `/Users/yzjia/.cache/uv` was not
  readable. The permitted rerun used the existing cache successfully and completed the API
  gate.
- The first sandboxed Turbopack build failed because its worker could not bind a local port.
  The permitted rerun compiled and generated all routes successfully.

## Disposition

PA-0 is complete as of 2026-07-16 CST: provider-side disablement is independently visible,
only the intended bounded replacement remains enabled, Production and Preview reference the
replacement, the production redeploy is identified and Ready, the Supabase browser key is
publishable, and signed-in chat/accounting/content-free-log acceptance passed.
