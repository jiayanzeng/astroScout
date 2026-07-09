# Evals

A self-contained harness for measuring the copilot's **retrieval quality** and
**answer faithfulness** — so changes can be judged by numbers, not vibes.

## Run

```bash
# offline: lexical baseline, no keys required (a real, imperfect retriever to beat)
pnpm --filter @astroscout/web eval

# live: the real pgvector retrieval used by the copilot
OPENAI_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  pnpm --filter @astroscout/web eval
```

It prints a per-case table + aggregate and writes `evals/report.json`. The pure
metric and faithfulness-aggregation functions are unit-tested and run in CI
(`pnpm --filter @astroscout/web test`).

## What it measures

- **Retrieval** (`metrics.ts`): hit@1, hit@3, recall@3, MRR, nDCG@5 over a labelled
  dataset (`dataset.ts`) where each query maps to the target(s) it's about. Relevance
  is at the object level: did retrieval surface passages about the right object?
- **Faithfulness** (`faithfulness.ts`): split an answer into claims, have a `Judge`
  mark each supported/unsupported by the retrieved contexts, score = supported/total.
  `MockJudge` is deterministic (offline/tests); `OpenAIJudge` (`judge-openai.ts`) is
  the real LLM-as-judge path (needs `OPENAI_API_KEY`).

## What the harness shows (offline run)

It compares three retrievers on the same dataset, split by query type:

```
retriever                        recall@3  MRR  nDCG@5
lexical(sparse)                  0.64      0.64  0.64
dense(offline)                   0.80      0.82  0.81
hybrid (RRF)                     0.88      0.86  0.88   <- best first-stage
hybrid -> rerank(lexical)        0.80      0.84  0.84
```

Two findings, both honest:

1. **Hybrid is the most robust first stage.** Keyword nails exact identifiers (M51, IC
   434) but fails on paraphrase; embeddings do the reverse; RRF fusion gets the best
   recall@3 / nDCG@5 — the metrics that matter for the context you feed the LLM.

2. **A bag-of-words reranker does NOT help — and the harness caught it.** The offline
   `rerank(lexical)` is TF-cosine over passage text, i.e. the *same signal family* as the
   dense retriever, so reranking collapses the hybrid result back toward dense and loses
   its exact-match strength (recall@3 0.88 -> 0.80). This is exactly why reranking needs a
   **true cross-encoder** that jointly attends to query and passage — a fundamentally
   different signal a deterministic stand-in can't fake.

Production therefore uses a real cross-encoder: **Cohere Rerank** (`COHERE_API_KEY`) or an
**LLM scorer** (`OPENAI_API_KEY`), in `src/lib/rerank.ts` — `searchKnowledge` retrieves 15
hybrid candidates then reranks to the top 5. Offline, the "dense" side and the reranker are
deterministic stand-ins so the run needs no keys; run with keys to measure the live
cross-encoder lift over hybrid.

## Live run (real pgvector + reranker, 2026-07-09)

With 203 passage chunks ingested over 15 targets and the LLM reranker (gpt-4o-mini):

```
retriever                         recall@3  MRR  nDCG@5  reranker
pgvector-hybrid(live)             0.36      0.43  0.45    —
pgvector-hybrid+rerank(live)      0.57      0.57  0.61    llm (gpt-4o-mini)
```

**Rerank lifts** — the real cross-encoder improves recall@3 by +21pp and nDCG@5 by
+16pp over raw hybrid. The live run confirms the prod architecture choice that the
offline stand-in could only predict (the offline bag-of-words reranker correctly
showed that a weak reranker regresses). Cohere not tested (no key).

Note: live recall@3 is lower than offline (0.57 vs 0.88) because the real pgvector
embeddings retrieve from actual cited literature — the passages are about the right
targets but don't always match the curated blurb-based query phrasing the dataset uses.

## Extending

- Add cases to `RETRIEVAL_DATASET` in `dataset.ts`.
- Implement a new `Retriever` (e.g. a hybrid keyword+vector reranker) and swap it in
  `run.ts` to A/B against the baseline.

## Braintrust / LangSmith

`braintrust.ts` forwards results when `BRAINTRUST_API_KEY` is set and `braintrust` is
installed (`pnpm add -D braintrust`). It's optional and kept out of the build graph.
For LangSmith, wrap the retriever in a traced run and log the same metric scores —
the `CaseResult[]` from `run.ts` is the data you forward either way.
