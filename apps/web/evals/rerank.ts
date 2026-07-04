/**
 * Retrieve-then-rerank. A reranker re-scores a small candidate set with a richer
 * (query, passage) model than first-stage retrieval used. Offline we use a
 * deterministic TF-cosine stand-in; production uses a real cross-encoder
 * (Cohere) or an LLM scorer — see ../src/lib/rerank.ts.
 */
import type { RetrievedPassage, Retriever } from "./retriever";
import { cosineSparse, stemTokens, tf } from "./text";

export interface Reranker {
  readonly name: string;
  rerank(query: string, passages: RetrievedPassage[], topK: number): Promise<RetrievedPassage[]>;
}

/** Deterministic offline reranker: TF-cosine over stemmed tokens of (query, content). */
export class LexicalReranker implements Reranker {
  readonly name = "rerank(lexical)";
  async rerank(
    query: string,
    passages: RetrievedPassage[],
    topK: number,
  ): Promise<RetrievedPassage[]> {
    const q = tf(stemTokens(query));
    return passages
      .map((p) => ({ ...p, similarity: cosineSparse(q, tf(stemTokens(p.content))) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
}

/** Two-stage retriever: cheap base recall of N candidates, then rerank to top-k. */
export class RerankedRetriever implements Retriever {
  readonly name: string;
  constructor(
    private readonly base: Retriever,
    private readonly reranker: Reranker,
    private readonly candidateN = 8,
  ) {
    this.name = `${base.name}->${reranker.name}`;
  }
  async retrieve(query: string, k: number): Promise<RetrievedPassage[]> {
    const candidates = await this.base.retrieve(query, this.candidateN);
    return this.reranker.rerank(query, candidates, k);
  }
}
