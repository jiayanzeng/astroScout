# Evals

A self-contained harness for measuring the copilot's **retrieval quality** and
**answer faithfulness** — so changes can be judged by numbers, not vibes.

## Run

```bash
# offline: lexical baseline, no keys required (a real, imperfect retriever to beat)
pnpm --filter @astroscout/web eval

# live: the real pgvector retrieval used by the copilot
# Opt-in local install; this updates manifests, so do not commit it unless policy changes.
pnpm --filter @astroscout/web add -D @huggingface/transformers
cd apps/web
# Load the existing ignored local env file, then let Node's tsx loader run TypeScript.
node --env-file=.env.local --import tsx evals/run.ts
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

It compares four retrieval variants on the same dataset, split by query type:

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

Production can therefore use a stronger second stage: **Cohere Rerank**
(`COHERE_API_KEY`), an **LLM scorer** (`OPENAI_API_KEY`), or the explicitly selected local
**BAAI bge-reranker-base** ONNX conversion (`RERANK_BACKEND=bge`) in
`src/lib/rerank.ts`. `searchKnowledge` retrieves 15 hybrid candidates, removes
near-duplicate chunks within each `(target, bibcode)` group, then reranks to the top 5.
With no explicit backend, the production dispatch remains Cohere -> LLM -> pass-through.

The BGE runtime is deliberately opt-in: install `@huggingface/transformers` as a local dev
package before selecting it. The package is dynamically imported and the model is loaded
only on the first BGE request, so offline tests and `next build` do not require it. Inference
is local/no-vendor after the model is present, but first use downloads and caches roughly
300 MB of public model/tokenizer artifacts from Hugging Face.

## Historical live run (real pgvector + LLM reranker, 2026-07-09)

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

## Task B2 post-dedup LLM vs BGE A/B (2026-07-11)

The harness now runs raw pgvector hybrid, an explicitly forced LLM reranker, and an
explicitly forced BGE reranker in one live invocation. The LLM and BGE arms receive the
same cached first-stage candidate snapshot and deterministic dedup result, and each arm is
evaluated once so stochastic subgroup rows cannot diverge from the recorded aggregate.

With the same 203-chunk, 15-target live corpus:

```
retriever                              recall@3  MRR  nDCG@5  reranker
pgvector-hybrid(live)                  0.36      0.43  0.45    —
pgvector-hybrid+llm-rerank(live)       0.61      0.58  0.61    llm (gpt-4o-mini)
pgvector-hybrid+bge-rerank(live)       0.55      0.38  0.42    bge-reranker-base (q8)
```

**BGE regresses versus the LLM reranker on all required metrics:** recall@3 is about
5.5 percentage points lower, MRR about 0.20 lower, and nDCG@5 about 0.19 lower. BGE does
raise recall@3 above raw hybrid, but its MRR and nDCG@5 fall below even the raw baseline.
Per the eval-driven adoption rule, BGE stays explicitly opt-in and the production
Cohere -> LLM -> pass-through default remains unchanged.

## Extending

- Add cases to `RETRIEVAL_DATASET` in `dataset.ts`.
- Implement a new `Retriever` (e.g. a hybrid keyword+vector reranker) and swap it in
  `run.ts` to A/B against the baseline.

## Braintrust / LangSmith

`braintrust.ts` forwards results when `BRAINTRUST_API_KEY` is set and `braintrust` is
installed (`pnpm add -D braintrust`). It's optional and kept out of the build graph.
For LangSmith, wrap the retriever in a traced run and log the same metric scores —
the `CaseResult[]` from `run.ts` is the data you forward either way.
