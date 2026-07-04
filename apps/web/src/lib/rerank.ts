/**
 * Production reranking. A cross-encoder re-scores (query, passage) pairs jointly,
 * which is far more accurate than the bi-encoder cosine / RRF used for first-stage
 * recall. Pattern: retrieve a larger candidate set, rerank, keep the best few.
 *
 * Pluggable: Cohere Rerank (a real cross-encoder) if COHERE_API_KEY is set, else an
 * LLM scorer via OpenAI, else a pass-through. Server-side only.
 */
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import type { KnowledgePassage } from "./knowledge";

export interface Reranker {
  readonly name: string;
  rerank(query: string, passages: KnowledgePassage[], topK: number): Promise<KnowledgePassage[]>;
}

/** Cohere Rerank — a purpose-built cross-encoder. */
export class CohereReranker implements Reranker {
  readonly name = "cohere";
  constructor(private readonly model = "rerank-v3.5") {}

  async rerank(
    query: string,
    passages: KnowledgePassage[],
    topK: number,
  ): Promise<KnowledgePassage[]> {
    if (passages.length === 0) return [];
    const res = await fetch("https://api.cohere.com/v2/rerank", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        query,
        documents: passages.map((p) => p.content),
        top_n: topK,
      }),
    });
    if (!res.ok) throw new Error(`Cohere rerank ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      results: { index: number; relevance_score: number }[];
    };
    return json.results.map((r) => ({ ...passages[r.index], similarity: r.relevance_score }));
  }
}

/** LLM-as-reranker — scores each (query, passage) pair with a model. No extra vendor. */
export class LLMReranker implements Reranker {
  readonly name = "llm";

  async rerank(
    query: string,
    passages: KnowledgePassage[],
    topK: number,
  ): Promise<KnowledgePassage[]> {
    if (passages.length === 0) return [];
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        ranked: z.array(z.object({ index: z.number(), score: z.number() })),
      }),
      system:
        "Score each passage's relevance to the query from 0 (irrelevant) to 1 " +
        "(directly answers it). Judge the passage text only. Return every index.",
      prompt:
        `QUERY: ${query}\n\nPASSAGES:\n` +
        passages.map((p, i) => `[${i}] ${p.content}`).join("\n"),
    });
    return object.ranked
      .filter((r) => r.index >= 0 && r.index < passages.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => ({ ...passages[r.index], similarity: r.score }));
  }
}

/** Pick the best available reranker; pass through if none configured. */
export async function rerankPassages(
  query: string,
  passages: KnowledgePassage[],
  topK: number,
): Promise<KnowledgePassage[]> {
  if (process.env.COHERE_API_KEY) return new CohereReranker().rerank(query, passages, topK);
  if (process.env.OPENAI_API_KEY) return new LLMReranker().rerank(query, passages, topK);
  return passages.slice(0, topK);
}
