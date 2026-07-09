# Implementation Plan

[Overview]
Add a `rerank?: boolean` option to `searchKnowledge` and split `LiveRetriever` into two constructor-flagged variants so the live eval harness can isolate the cross-encoder reranker's lift over raw hybrid search.

`STATE.md` §5 item 3 identifies the blocker: `LiveRetriever` wraps `searchKnowledge`, which fuses `hybrid_search` RPC + `rerankPassages` into a single call — so the live comparison cannot separate hybrid retrieval quality from reranker quality. The fix is minimal and surgical: (1) `searchKnowledge` gains an optional third parameter `opts?: { rerank?: boolean }` defaulting to `true` (production behavior unchanged, `ai.ts` tool call signature untouched); when `rerank: false`, it returns the top-5 `hybrid_search` candidates directly with the RPC's similarity scores. (2) `LiveRetriever` gains a `rerank` constructor flag producing two named variants: `pgvector-hybrid(live)` (no rerank) and `pgvector-hybrid+rerank(live)` (rerank). (3) `run.ts` runs both live variants side-by-side when keys are present; offline behavior (no keys) is byte-identical to today. No tuning is done — the harness reports whatever it measures (STATE.md §2 rule 1).

The change set touches three source files (`knowledge.ts`, `retriever.ts`, `run.ts`) and updates `STATE.md` annotations. No new files, no dependency changes, no new tests (the changed paths are live/network-gated and can't run in CI). Web CI (`tsc --noEmit`, `eslint .`, `vitest run`, `next build`) must stay green, and the offline eval table (`tsx evals/run.ts`) must be unchanged.

[Types]
One new optional parameter type is added; no existing types change.

- **`SearchKnowledgeOptions`** (inline, in `apps/web/src/lib/knowledge.ts`): `{ rerank?: boolean }`. Optional object passed as the third argument to `searchKnowledge`. When `undefined` or when `rerank` is `undefined`/`true`, behavior is the current production path (embed → hybrid_search(15) → rerankPassages(5)). When `rerank === false`, the top-5 `hybrid_search` candidates are returned directly with the RPC's similarity scores, bypassing `rerankPassages` entirely.
- **`searchKnowledge` signature**: changes from `(query: string, target?: string) => Promise<KnowledgePassage[]>` to `(query: string, target?: string, opts?: { rerank?: boolean }) => Promise<KnowledgePassage[]>`. The third parameter is optional and omitted by all existing callers (`ai.ts`, `retriever.ts`), so no caller signature changes are required.
- **`LiveRetriever` constructor**: gains a `rerank: boolean = true` constructor parameter. The `name` field changes from a hardcoded string literal to a computed value based on the flag. No interface change — `LiveRetriever` still `implements Retriever`.
- **`KnowledgePassage`**: unchanged (`{ target, title, source, bibcode, url, content, similarity }`).
- **`RetrievedPassage`**: unchanged (`Pick<KnowledgePassage, "target" | "content" | "similarity">`).
- **`Retriever` interface**: unchanged.

[Files]
Three existing source files are modified; one documentation file is updated; no files are created, deleted, or moved.

- **Modified:** `apps/web/src/lib/knowledge.ts`
  - Add a third optional parameter `opts?: { rerank?: boolean }` to `searchKnowledge`.
  - After the `hybrid_search` RPC call and the `candidates` cast (line 42), add a conditional: `if (opts?.rerank === false) return candidates.slice(0, 5);` before the `rerankPassages` call.
  - The `rerankPassages(query, candidates, 5)` call (line 43) remains as the default/fallthrough path.
  - The `match_count: 15` RPC parameter is unchanged — both paths retrieve 15 candidates; the no-rerank path simply slices to 5 instead of reranking. This keeps the RPC call identical and the change minimal.
  - The `KnowledgePassage` type, the embed call, and the Supabase client creation are unchanged.

- **Modified:** `apps/web/evals/retriever.ts`
  - `LiveRetriever` class: add a `constructor(private readonly rerank = true)` and change `readonly name` from `"pgvector+rerank(live)"` to a computed value: `this.rerank ? "pgvector-hybrid+rerank(live)" : "pgvector-hybrid(live)"`.
  - In `retrieve()`, change `await searchKnowledge(query)` to `await searchKnowledge(query, undefined, { rerank: this.rerank })`.
  - Update the JSDoc comment from "the real pgvector + hybrid + rerank path" to "the real pgvector hybrid path; rerank flag controls whether rerankPassages is applied".
  - All other classes (`LexicalRetriever`, `DenseRetriever`, `HybridRetriever`) and module-level constants are unchanged.

- **Modified:** `apps/web/evals/run.ts`
  - Update the header comment: `# live: pgvector vs hybrid(sparse+pgvector)` → `# live: pgvector-hybrid vs pgvector-hybrid+rerank`.
  - Change `const dense: Retriever = live ? new LiveRetriever() : new DenseRetriever();` to `const dense: Retriever = live ? new LiveRetriever(true) : new DenseRetriever();` (explicit rerank=true for the rerank variant).
  - Change the live branch of the `retrievers` ternary from `[dense]` to `[new LiveRetriever(false), dense]` — runs the no-rerank baseline first, then the rerank variant.
  - The offline branch `[sparse, dense, hybrid, new RerankedRetriever(hybrid, new LexicalReranker())]` is unchanged — offline behavior is byte-identical.
  - The Braintrust push block is unchanged; it pushes the last retriever's results, which in live mode is the `pgvector-hybrid+rerank(live)` variant (the production path).

- **Modified:** `STATE.md`
  - §1 file tree annotation for `retriever.ts`: update the NOTE from "LiveRetriever wraps searchKnowledge → hybrid+rerank is one black box; no live no-rerank baseline yet (§5 item 3)" to note that `LiveRetriever` now has a constructor flag producing `pgvector-hybrid(live)` (no rerank) and `pgvector-hybrid+rerank(live)` variants; `searchKnowledge` accepts `{ rerank?: boolean }`.
  - §3 Web lib `knowledge.ts` line: update signature from `searchKnowledge(query,target?)` to `searchKnowledge(query,target?,opts?: {rerank?: boolean})` and note the no-rerank path returns top-5 hybrid candidates directly.
  - §5 item 3: mark the harness change as done (the no-rerank live baseline exists); the live run to record numbers is still pending (requires keys).

- **Not touched:** `apps/web/src/lib/ai.ts` (tool call `searchKnowledge(query, target)` — opts defaults to rerank:true, unchanged), `apps/web/src/lib/rerank.ts` (rerankPassages unchanged), `apps/web/src/app/api/chat/route.ts` (uses tools, not searchKnowledge directly), `apps/web/evals/rerank.ts`, `apps/web/evals/dataset.ts`, `apps/web/evals/metrics.ts`, `apps/web/evals/braintrust.ts`, test files, `package.json`, `tsconfig.json`, `vitest.config.ts`, `supabase/migrations/*`.

[Functions]
One function signature changes (gains an optional parameter); one class method's internal call changes.

- **Modified function:** `searchKnowledge` in `apps/web/src/lib/knowledge.ts`.
  - Current signature: `searchKnowledge(query: string, target?: string): Promise<KnowledgePassage[]>`.
  - New signature: `searchKnowledge(query: string, target?: string, opts?: { rerank?: boolean }): Promise<KnowledgePassage[]>`.
  - New logic: after `const candidates = (data ?? []) as KnowledgePassage[];`, add `if (opts?.rerank === false) return candidates.slice(0, 5);`. The existing `return rerankPassages(query, candidates, 5);` follows as the default path.
  - Effect: `opts` undefined or `opts.rerank` undefined/`true` → rerank (production behavior unchanged). `opts.rerank === false` → top-5 hybrid candidates with RPC similarity scores, no reranking.

- **Modified method:** `LiveRetriever.retrieve` in `apps/web/evals/retriever.ts`.
  - Current: `const passages = await searchKnowledge(query);`.
  - New: `const passages = await searchKnowledge(query, undefined, { rerank: this.rerank });`.
  - Passes the constructor's `rerank` flag through to `searchKnowledge`.

- **New functions:** none.
- **Removed functions:** none.
- **Unchanged but relevant:** `rerankPassages` in `src/lib/rerank.ts` (still called by `searchKnowledge` in the default path), `ai.ts` tool `execute: async ({ query, target }) => searchKnowledge(query, target)` (opts omitted → defaults to rerank:true).

[Classes]
One class is modified (constructor + name computation); no new or removed classes.

- **Modified class:** `LiveRetriever` in `apps/web/evals/retriever.ts`.
  - Current: `readonly name = "pgvector+rerank(live)";` (hardcoded), no constructor, `retrieve` calls `searchKnowledge(query)`.
  - New: `constructor(private readonly rerank = true)` sets the rerank flag; `readonly name: string` is computed in the constructor as `this.rerank ? "pgvector-hybrid+rerank(live)" : "pgvector-hybrid(live)"`; `retrieve` calls `searchKnowledge(query, undefined, { rerank: this.rerank })`.
  - Still `implements Retriever` with the same `retrieve(query, k)` signature.
  - Default `new LiveRetriever()` produces the rerank variant (backward-compatible default).

- **New classes:** none.
- **Removed classes:** none.
- **Unchanged classes:** `LexicalRetriever`, `DenseRetriever`, `HybridRetriever` (all in `retriever.ts`), `RerankedRetriever`, `LexicalReranker` (in `evals/rerank.ts`), `CohereReranker`, `LLMReranker` (in `src/lib/rerank.ts`).

[Dependencies]
No dependency changes.

No new packages, no version bumps, no lockfile changes. The `{ rerank?: boolean }` opts type is a plain TypeScript object literal — no zod schema or runtime validation needed (it's an internal API, not a user-facing input). The `ai.ts` tool input schema (`z.object({ query, target })`) is unchanged. `pnpm-lock.yaml` is not modified.

[Testing]
No new tests are needed; existing tests must remain green. The changed paths (`searchKnowledge` with `rerank: false`, `LiveRetriever` variants) are live/network-gated (require OpenAI + Supabase keys) and cannot run in CI or the sandbox.

- **Existing tests:** the 29 current web tests (metrics 12, faithfulness 7, fusion 4, rerank 3, format 3) are all offline/standalone and do not exercise `searchKnowledge` or `LiveRetriever`. They must remain green unchanged.
- **Offline eval:** `tsx evals/run.ts` with no keys must produce the byte-identical offline table (lexical, dense, hybrid, hybrid→rerank(lexical)) — the `live` flag is false, so the `retrievers` array is unchanged.
- **Live eval (manual, requires keys):** `OPENAI_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... tsx evals/run.ts` should now print two live retriever rows: `pgvector-hybrid(live)` and `pgvector-hybrid+rerank(live)`, side by side, showing whether the reranker helps or hurts.
- **Verification commands (run from `apps/web`, direct binaries per STATE.md §4):**
  ```
  node_modules/.bin/tsc --noEmit
  node_modules/.bin/eslint .
  node_modules/.bin/vitest run
  node_modules/.bin/tsx evals/run.ts
  node_modules/.bin/next build
  ```
  Expected: 0 type errors, 0 lint errors, 29 tests passed, offline eval table unchanged (4 retrievers: lexical/dense/hybrid/hybrid→rerank), build successful (12 routes).
- **TypeScript strict notes:** `opts?.rerank === false` uses optional chaining — safe for `undefined` opts. The `LiveRetriever` constructor parameter `private readonly rerank = true` is a TypeScript parameter property (strict-compatible). The `name` field must be declared as `readonly name: string` (not `readonly name = "..."`) since it's assigned in the constructor.
- **ESLint notes:** no new violations expected — the changes are small additions of optional parameters and constructor logic. The `eslint.config.mjs` flat config is unchanged.

[Implementation Order]
Numbered steps in execution order to minimize conflicts and ensure CI stays green.

1. Edit `apps/web/src/lib/knowledge.ts`: add `opts?: { rerank?: boolean }` as the third parameter to `searchKnowledge`; add `if (opts?.rerank === false) return candidates.slice(0, 5);` before the `rerankPassages` call.
2. Edit `apps/web/evals/retriever.ts`: add `constructor(private readonly rerank = true)` to `LiveRetriever`; change `readonly name` to a computed field set in the constructor (`this.rerank ? "pgvector-hybrid+rerank(live)" : "pgvector-hybrid(live)"`); change `searchKnowledge(query)` to `searchKnowledge(query, undefined, { rerank: this.rerank })`; update the JSDoc comment.
3. Edit `apps/web/evals/run.ts`: update the header comment; change `new LiveRetriever()` to `new LiveRetriever(true)` in the `dense` ternary; change the live `retrievers` branch from `[dense]` to `[new LiveRetriever(false), dense]`.
4. Run `apps/web/node_modules/.bin/tsc --noEmit` — expect 0 type errors.
5. Run `apps/web/node_modules/.bin/eslint .` — expect 0 lint errors.
6. Run `apps/web/node_modules/.bin/vitest run` — expect 29 tests passed.
7. Run `apps/web/node_modules/.bin/tsx evals/run.ts` — expect the offline table unchanged (4 retrievers, same numbers as STATE.md §3).
8. Run `apps/web/node_modules/.bin/next build` — expect build successful (12 routes).
9. Update `STATE.md`: §1 file tree annotation for `retriever.ts`; §3 Web lib `knowledge.ts` signature; §5 item 3 mark harness change done.
10. Confirm `git diff --stat` shows exactly: `apps/web/src/lib/knowledge.ts`, `apps/web/evals/retriever.ts`, `apps/web/evals/run.ts`, `STATE.md`.