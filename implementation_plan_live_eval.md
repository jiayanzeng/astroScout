# Implementation Plan — Live Eval: Measure Cross-Encoder Rerank Lift

[Overview]
Run the live retrieval eval against a populated Supabase corpus to measure whether the cross-encoder reranker (Cohere or LLM) lifts hybrid retrieval quality over raw hybrid search, then record the results in STATE.md §3 and update evals/README.md.

The harness changes from Tasks 1/2/3a are already merged: `searchKnowledge` accepts `{ rerank?: boolean }`, `LiveRetriever` has a constructor flag producing `pgvector-hybrid(live)` and `pgvector-hybrid+rerank(live)` variants, and `run.ts` runs both side-by-side when live keys are present. This task is purely execution + documentation — no code changes. The workflow is: (1) verify Supabase migrations are applied, (2) populate the RAG corpus via `ingest_knowledge.py --all`, (3) run the live eval, (4) record the numbers in STATE.md and update README.

The task fills the gap identified in STATE.md §5 item 3: the offline eval shows hybrid beats pure dense/lexical, but the offline "dense" retriever is a deterministic stand-in (stemmed-token Jaccard over curated blurbs), and the offline reranker (TF-cosine) regresses — neither proxies the real pgvector embedding + cross-encoder pipeline. Only a live run with the real embeddings and reranker can confirm or refute the prod architecture choice.

The task has conditional branching for the second eval run: if `COHERE_API_KEY` is available, run twice (LLM reranker + Cohere reranker); otherwise, run once (LLM reranker only). The live corpus table in STATE.md §3 will show whichever reranker(s) were tested, with a note about the missing one if applicable.

No files are created beyond the documentation updates. No code is written. The git diff will show only `STATE.md` and `apps/web/evals/README.md`.

[Types]
No type changes. All types (`searchKnowledge` options, `LiveRetriever` constructor flag, `CaseResult`, `EvalCase`) were added in Tasks 1/2/3a and are already in the codebase.

[Files]
Two existing documentation files are modified; no source files change; no files are created or deleted.

- **Modified: `STATE.md`**
  - §3: Add a "live corpus" table directly under the existing "offline" eval numbers table. The table has columns: `retriever`, `recall@3`, `MRR`, `nDCG@5`, and `reranker`. Rows are `pgvector-hybrid(live)` and `pgvector-hybrid+rerank(live)`. If both LLM and Cohere rerankers were tested, add two rerank rows (or a single row with a combined note). The table format mirrors the offline table exactly.
    - Format:
      ```
      retriever                        recall@3  MRR  nDCG@5  reranker
      pgvector-hybrid(live)            0.XX      0.XX  0.XX    —
      pgvector-hybrid+rerank(live)     0.XX      0.XX  0.XX    llm (gpt-4o-mini)
      ```
    - If Cohere was also run, add a third row: `pgvector-hybrid+rerank(live)` with `cohere (rerank-v3.5)`.
    - After the table, a one-sentence plain statement: "Rerank lifts / is flat / regresses." No editorializing (STATE.md rule 1).
    - If rerank does NOT lift, add a §5 follow-up item: "Reconsider the prod rerank step — live eval shows no lift over raw hybrid." 
  - §5 item 3: Update status from "Remaining: run migrations 0001–0003, ingest, eval, record numbers" to "✅ Done (date): live eval recorded at §3; [rerank lifts / is flat / regresses]." If no Cohere key was available, append a sub-item: "Re-run with Cohere when a key is available."
  - §1 file tree annotation for `run.ts` and `evals/README.md`: update the note to mention the live results are now recorded at §3.

- **Modified: `apps/web/evals/README.md`**
  - Under "What the harness shows (offline run)", add a "Live run" section after the offline table. The section includes:
    - The live corpus table (same data as STATE.md §3, formatted as a markdown table).
    - A brief explanation that live results measure the real pgvector hybrid + rerank pipeline against the same labelled dataset.
    - If rerank lifts: note that the live run confirms the prod architecture choice.
    - If rerank does not lift: note that the offline reranker regression was a correct signal, and the live cross-encoder reranker similarly fails to improve over raw hybrid for this dataset.
    - The note about "Production therefore uses a real cross-encoder" remains but is updated to reference the live numbers.
  - No other sections of the README change.

- **Not touched:** All source files (`apps/api/*`, `apps/web/src/*`, `apps/web/evals/*` except README.md), `supabase/migrations/*`, `package.json`, `tsconfig.json`, `.env` files, `pnpm-lock.yaml`.

[Functions]
No function changes. This is a documentation-only task.

[Classes]
No class changes.

[Dependencies]
No dependency changes.

[Testing]
No code changes means no test changes. The existing 29 web tests and 40 API unit tests remain green.

Verification checklist after the task (manual, requires keys):
- `apps/web/node_modules/.bin/tsc --noEmit` — 0 type errors.
- `apps/web/node_modules/.bin/eslint .` — 0 lint errors.
- `apps/web/node_modules/.bin/vitest run` — 29 tests passed.
- `apps/api` → `PYTHONPATH=src python -m pytest -m "not integration"` — 40 tests passed.
- `apps/web/node_modules/.bin/tsx evals/run.ts` (no keys) — offline table unchanged (4 retrievers).
- `OPENAI_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node_modules/.bin/tsx evals/run.ts` — live table shows 2+ rows.

[Implementation Order]
Numbered steps in execution order.

1. Confirm with user that Supabase migrations 0001→0002→0003 are applied (dashboard check). If not, the task cannot proceed.
2. From `apps/api`, run `uv run python scripts/ingest_knowledge.py --all`. Report chunks-stored per target; investigate any target that stores 0 chunks. (If ingest returns HTTP 42501, show the GRANT SQL from STATE.md §4 and stop.)
3. From `apps/web`, run the live eval with the LLM reranker (unset `COHERE_API_KEY`):
   `OPENAI_API_KEY=... OPENAI_BASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node_modules/.bin/tsx evals/run.ts`
   Save the output.
4. If `COHERE_API_KEY` is available, run the live eval a second time with it set:
   `OPENAI_API_KEY=... OPENAI_BASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... COHERE_API_KEY=... node_modules/.bin/tsx evals/run.ts`
   Save the output.
5. Compute the aggregate metrics (recall@3, MRR, nDCG@5) from both runs. Compare: does rerank lift, stay flat, or regress vs raw hybrid?
6. Update `STATE.md` §3: add the live corpus table under the offline table with the actual numbers.
7. Update `STATE.md` §5 item 3: mark done with date and summary.
8. If rerank does not lift: add a §5 follow-up item to reconsider the prod rerank step.
9. Update `apps/web/evals/README.md`: add the "Live run" section with the live corpus table and conclusions.
10. Run `git diff --stat` to confirm only `STATE.md` and `apps/web/evals/README.md` changed.