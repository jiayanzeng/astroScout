/**
 * Retrieval eval runner — compares retrievers on the labelled dataset.
 *
 *   pnpm --filter @astroscout/web eval     # offline: sparse vs dense vs hybrid
 *   OPENAI_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *     pnpm --filter @astroscout/web eval   # live: pgvector-hybrid vs pgvector-hybrid+rerank
 *
 * Writes evals/report.json. Optionally forwards to Braintrust when BRAINTRUST_API_KEY is set.
 */
import { writeFileSync } from "node:fs";

import { RETRIEVAL_DATASET, type EvalCase } from "./dataset";
import { hitAtK, mean, ndcgAtK, recallAtK, reciprocalRank, uniqueInOrder } from "./metrics";
import {
  DenseRetriever,
  HybridRetriever,
  LexicalRetriever,
  LiveRetriever,
  type Retriever,
} from "./retriever";
import { LexicalReranker, RerankedRetriever } from "./rerank";

export type CaseResult = {
  id: string;
  query: string;
  relevant: string[];
  retrievedTargets: string[];
  hitAt1: number;
  recallAt3: number;
  mrr: number;
  ndcgAt5: number;
};

const K = 5;

async function evalRetriever(r: Retriever, cases: EvalCase[]): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (const c of cases) {
    const passages = await r.retrieve(c.query, K);
    const targets = uniqueInOrder(
      passages.map((p) => p.target).filter((t): t is string => !!t),
    );
    const rel = new Set(c.relevantTargets);
    out.push({
      id: c.id,
      query: c.query,
      relevant: c.relevantTargets,
      retrievedTargets: targets,
      hitAt1: hitAtK(targets, rel, 1),
      recallAt3: recallAtK(targets, rel, 3),
      mrr: reciprocalRank(targets, rel),
      ndcgAt5: ndcgAtK(targets, rel, 5),
    });
  }
  return out;
}

function agg(results: CaseResult[]) {
  return {
    "hit@1": mean(results.map((r) => r.hitAt1)),
    "recall@3": mean(results.map((r) => r.recallAt3)),
    MRR: mean(results.map((r) => r.mrr)),
    "nDCG@5": mean(results.map((r) => r.ndcgAt5)),
  };
}

function row(name: string, a: ReturnType<typeof agg>): string {
  return (
    `${name.padEnd(28)} ${a["hit@1"].toFixed(2)}   ${a["recall@3"].toFixed(2)}     ` +
    `${a.MRR.toFixed(2)}  ${a["nDCG@5"].toFixed(2)}`
  );
}

async function main(): Promise<void> {
  const live =
    process.env.OPENAI_API_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const sparse = new LexicalRetriever();
  const dense: Retriever = live ? new LiveRetriever(true) : new DenseRetriever();
  const hybrid = new HybridRetriever(sparse, dense);
  const retrievers: Retriever[] = live
    ? [new LiveRetriever(false), dense]
    : [sparse, dense, hybrid, new RerankedRetriever(hybrid, new LexicalReranker())];

  const exact = RETRIEVAL_DATASET.filter((c) => c.kind === "exact");
  const semantic = RETRIEVAL_DATASET.filter((c) => c.kind === "semantic");

  const report: Record<string, unknown> = { mode: live ? "live" : "offline", retrievers: [] };
  const retrieverReports: { name: string; results: CaseResult[] }[] = [];

  console.log(`\nMode: ${live ? "live (pgvector)" : "offline (lexical + simulated dense)"}\n`);
  console.log("retriever                    hit@1 recall@3  MRR  nDCG@5");
  console.log("─".repeat(64));
  for (const r of retrievers) {
    const all = await evalRetriever(r, RETRIEVAL_DATASET);
    const ex = await evalRetriever(r, exact);
    const se = await evalRetriever(r, semantic);
    console.log(row(r.name + " [all]", agg(all)));
    console.log(row("  ├ exact queries", agg(ex)));
    console.log(row("  └ semantic queries", agg(se)));
    retrieverReports.push({ name: r.name, results: all });
  }
  console.log("─".repeat(64));

  report.retrievers = retrieverReports.map(({ name, results }) => ({
    name,
    aggregate: agg(results),
    aggregate_exact: agg(results.filter((r) => exact.some((e) => e.id === r.id))),
    aggregate_semantic: agg(results.filter((r) => semantic.some((s) => s.id === r.id))),
  }));

  writeFileSync(
    new URL("./report.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log("\nWrote evals/report.json");

  if (process.env.BRAINTRUST_API_KEY) {
    const { pushToBraintrust } = await import("./braintrust");
    const hybrid = retrieverReports[retrieverReports.length - 1];
    const ok = await pushToBraintrust("astroscout-retrieval", hybrid.results);
    console.log(ok ? "Pushed hybrid results to Braintrust." : "Braintrust push skipped.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
