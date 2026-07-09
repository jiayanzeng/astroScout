# Implementation Plan — Task 2: Verify Relay End-to-End on the Web Side

[Overview]
Verify that the chat (`streamText`) and LLM-reranker (`generateObject`) OpenAI calls work through the configured relay, then switch from the Responses API to the Chat Completions API only if the relay fails, keeping official-API compatibility.

This task addresses `STATE.md` §5 item 2: embeddings through the relay are already proven (v0.6.1), but the chat path (`app/api/chat/route.ts` using `streamText`) and the LLM reranker (`lib/rerank.ts` using `generateObject`) both use the default `openai("gpt-4o-mini")` provider call, which in AI SDK v6 targets OpenAI's **Responses API** (`/v1/responses`). Many OpenAI-compatible relays only implement `/v1/chat/completions` — the `/v1/responses` endpoint won't exist, causing a stream-mismatch error. The error message itself recommends `openai.chat('model-id')` or `@ai-sdk/openai-compatible`. The `evals/judge-openai.ts` file has the same issue.

The approach is verify-first: start the dev server with the configured relay (`OPENAI_BASE_URL` already set in `apps/web/.env.local`), exercise `/chat` with a prompt that triggers the `searchKnowledge` tool (which chains: embed → hybrid_search → rerank, exercising the LLM reranker's `generateObject`), and observe whether both `streamText` and `generateObject` succeed or fail. If they succeed, no code change is needed — the relay supports `/v1/responses` and we record that in `STATE.md`. If they fail with the Responses-API mismatch, switch all three call sites from `openai("gpt-4o-mini")` to `openai.chat("gpt-4o-mini")`, which stays compatible with the official OpenAI API (it targets `/v1/chat/completions`) and also works with any chat-completions relay. No relay URL is ever hardcoded (STATE.md rule 11); no `.env.local` is committed. Web CI (`lint && typecheck && test && build`) must stay green.

[Types]
No type changes. Both `openai(modelId)` and `openai.chat(modelId)` return `LanguageModelV3` — the type expected by `streamText.model`, `generateObject.model`, and the AI SDK internals. `"gpt-4o-mini"` is in both `OpenAIResponsesModelId` and `OpenAIChatModelId` type unions, confirmed from the installed `@ai-sdk/openai` v3 type definitions (`apps/web/node_modules/@ai-sdk/openai/dist/index.d.ts`). The `openai.embedding(...)` call in `knowledge.ts` is unchanged (already proven through the relay).

- **`OpenAIResponsesModelId`** (the default call target): includes `'gpt-4o-mini'`, uses `/v1/responses`.
- **`OpenAIChatModelId`** (the `.chat()` target): includes `'gpt-4o-mini'`, uses `/v1/chat/completions`.
- **`openai.chat(modelId): LanguageModelV3`**: confirmed in the type definitions, compatible with `streamText` and `generateObject`.

[Files]
Three source files may be modified (only if verification fails); one documentation file is always updated.

- **Modified (conditional):** `apps/web/src/app/api/chat/route.ts`
  - Line 12: `model: openai("gpt-4o-mini")` → `model: openai.chat("gpt-4o-mini")`
  - This is the `streamText` call that powers the copilot chat. The change switches it from the Responses API to the Chat Completions API. No other lines change.
  - Note: the import `import { openai } from "@ai-sdk/openai"` on line 1 stays the same — `openai` is the provider instance, `.chat()` is a method on it.

- **Modified (conditional):** `apps/web/src/lib/rerank.ts`
  - Line 63: `model: openai("gpt-4o-mini")` → `model: openai.chat("gpt-4o-mini")`
  - This is the `generateObject` call in `LLMReranker.rerank()`. It scores passage-query pairs when no `COHERE_API_KEY` is set. Since the task instructs us to unset `COHERE_API_KEY` for the test, this path will be exercised. No other lines change.

- **Modified (conditional):** `apps/web/evals/judge-openai.ts`
  - Line 18: `model: openai("gpt-4o-mini")` → `model: openai.chat("gpt-4o-mini")`
  - This is the `generateObject` call in `OpenAIJudge.judge()` used in the faithfulness eval. It asks a model whether each claim is supported by context passages. No other lines change.

- **Modified (always):** `STATE.md`
  - §5 item 2: update with the verification outcome. Two possible texts:
    - **If the relay works:** mark verified, note the relay supports `/v1/responses`.
    - **If the relay fails:** mark fixed, note switched to `openai.chat("gpt-4o-mini")` for relay compatibility, confirmed Chat Completions API path works through the relay.
  - Format: prepend "✅" and append a date and summary, same style as §5 item 1.

- **Not touched:** `apps/web/src/lib/knowledge.ts` (embedding path, already proven), `apps/web/src/lib/ai.ts` (tool definitions, no OpenAI call), `apps/web/.env.local` (gitignored, contains secrets), `.env.example` (relay knob already added in Task 1), `apps/web/package.json`, `tsconfig.json`, test files.

[Functions]
No function signatures change; only the provider model selector at three call sites is updated.

- **Modified (conditional):** The `streamText()` call in `apps/web/src/app/api/chat/route.ts` POST handler.
  - Current: `model: openai("gpt-4o-mini")` — targets Responses API `/v1/responses`.
  - New: `model: openai.chat("gpt-4o-mini")` — targets Chat Completions API `/v1/chat/completions`.
  - Both return `LanguageModelV3`; the `streamText` function sees no difference. Tools, system prompt, messages, and `stopWhen` are unchanged.

- **Modified (conditional):** The `generateObject()` call in `LLMReranker.rerank()` in `apps/web/src/lib/rerank.ts`.
  - Current: `model: openai("gpt-4o-mini")` — Responses API.
  - New: `model: openai.chat("gpt-4o-mini")` — Chat Completions API.
  - Schema, system prompt, and prompt construction are unchanged. The `generateObject` function works identically with either variant.

- **Modified (conditional):** The `generateObject()` call in `OpenAIJudge.judge()` in `apps/web/evals/judge-openai.ts`.
  - Current: `model: openai("gpt-4o-mini")` — Responses API.
  - New: `model: openai.chat("gpt-4o-mini")` — Chat Completions API.
  - Schema, system prompt, and prompt construction are unchanged.

- **New functions:** none.
- **Removed functions:** none.

[Classes]
No class structural changes.

- **Modified classes:** none (the `LLMReranker` and `OpenAIJudge` classes' only change is the model inside a method — no interface, constructor, or inheritance change).
- **New classes:** none.
- **Removed classes:** none.

[Dependencies]
No dependency changes. The `openai.chat()` method is already part of the installed `@ai-sdk/openai` v3.0.72. No version bumps, no new packages, no lockfile changes. `pnpm-lock.yaml` is not modified.

[Testing]
No new tests are needed. The change is a drop-in model selector replacement that is transparent to the AI SDK.

- **Existing tests:** must remain green. Run `pnpm --filter @astroscout/web lint && typecheck && test && build`.
  - `lint` (eslint): no new violations — the change is one string replacement per file.
  - `typecheck` (tsc): `openai.chat("gpt-4o-mini")` returns `LanguageModelV3`, which satisfies both `streamText.model` and `generateObject.model`. No type errors expected.
  - `test` (vitest): current 29 tests (metrics 12, faithfulness 7, fusion 4, rerank 3, format 3) are offline/standalone — they use `MockJudge`, not `OpenAIJudge`, so they don't exercise this path; no test changes needed.
  - `build` (next build): the change is in server-side code only (route handler + lib); the build should succeed since there are no type or import changes.

- **Live verification:** The actual verification is manual — start the dev server, send a chat message that triggers `searchKnowledge`, observe the stream. The test prompt "Why is the Orion Nebula a good target, and what's the science?" (from the chat page placeholder) is ideal — it will trigger `searchKnowledge` for science background.

- **Verification command:** `pnpm --filter @astroscout/web lint && typecheck && test && build` — must report 0 errors, all tests pass, build succeeds.

[Implementation Order]
This is a verify-first task with two distinct paths. Steps 1–2 are always executed; step 3 is conditional on the verification outcome.

1. **Start the dev server and verify chat + rerank through the relay.**
   - Ensure `apps/web/.env.local` has `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `COHERE_API_KEY` (unset `COHERE_API_KEY` for the test so the LLM reranker path is exercised).
   - From the repo root: `pnpm --filter @astroscout/web dev`
   - Open `http://localhost:3000/chat` and send: "Why is the Orion Nebula a good target, and what's the science?"
   - Observe the stream: if `searchKnowledge` is called and returns results (or even an empty knowledge base — the `LLMReranker` will early-return on empty passages, but `streamText` itself must work), the chat path (including `streamText`) is verified.
   - To strictly exercise the LLM reranker: a Supabase with ingested corpus + `COHERE_API_KEY` unset will cause `rerankPassages` to pick `LLMReranker`, which calls `generateObject` with `openai("gpt-4o-mini")`. If the relay fails on `/v1/responses`, the error will appear in the chat response or server logs.
   - **If no error:** go to step 5a. **If the Responses-API stream-mismatch error occurs:** go to step 3.

2. *(Skipped — renamed to step 3 below)*

3. **Apply the `openai.chat(...)` fix to all three files.**
   - `apps/web/src/app/api/chat/route.ts` line 12: `openai("gpt-4o-mini")` → `openai.chat("gpt-4o-mini")`
   - `apps/web/src/lib/rerank.ts` line 63: `openai("gpt-4o-mini")` → `openai.chat("gpt-4o-mini")`
   - `apps/web/evals/judge-openai.ts` line 18: `openai("gpt-4o-mini")` → `openai.chat("gpt-4o-mini")`

4. **Verify the fix + keep web CI green.**
   - Restart the dev server (if needed) and repeat the chat test from step 1. The chat should now work through the relay.
   - Run: `pnpm --filter @astroscout/web lint && typecheck && test && build`
   - Expect: 0 lint errors, typecheck clean, 29 tests passed, build successful (12 routes).

5. **Update `STATE.md` §5 item 2.**
   - **5a (no fix needed):** Mark §5 item 2 verified (e.g., "✅ Verified (2026-07-09): the configured relay supports the Responses API — both `streamText` and `generateObject` work through `OPENAI_BASE_URL` without code changes.")
   - **5b (fix applied):** Mark §5 item 2 done (e.g., "✅ Fixed (2026-07-09): switched `openai('gpt-4o-mini')` → `openai.chat('gpt-4o-mini')` in chat route, LLM reranker, and OpenAI judge. The relay only supports `/v1/chat/completions`; `.chat()` targets that endpoint and remains compatible with the official OpenAI API.")