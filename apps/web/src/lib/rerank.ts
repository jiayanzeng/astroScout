/**
 * Production reranking. A cross-encoder re-scores (query, passage) pairs jointly,
 * which is far more accurate than the bi-encoder cosine / RRF used for first-stage
 * recall. Pattern: retrieve a larger candidate set, rerank, keep the best few.
 *
 * Pluggable: an explicitly selected local BGE cross-encoder, otherwise Cohere Rerank
 * when COHERE_API_KEY is set, an LLM scorer via OpenAI, or a pass-through. Server-side only.
 */
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import type { KnowledgePassage } from "./knowledge";

export interface Reranker {
  readonly name: string;
  rerank(query: string, passages: KnowledgePassage[], topK: number): Promise<KnowledgePassage[]>;
}

export type RerankBackend = "auto" | "cohere" | "llm" | "bge" | "none";

const DEFAULT_BGE_MODEL = "Xenova/bge-reranker-base";

export type BgeInputs = Record<string, unknown>;
export type BgeTokenizer = (
  texts: string[],
  options: {
    text_pair: string[];
    padding: boolean;
    truncation: boolean;
    max_length: number;
  },
) => BgeInputs;
export type BgeModel = (inputs: BgeInputs) => Promise<{
  logits: { data: ArrayLike<number | bigint> };
}>;
type TransformersModule = {
  AutoTokenizer: {
    from_pretrained(model: string): Promise<BgeTokenizer>;
  };
  AutoModelForSequenceClassification: {
    from_pretrained(model: string, options: { dtype: "q8" }): Promise<BgeModel>;
  };
};
export type BgeRuntime = { tokenizer: BgeTokenizer; model: BgeModel };

const bgeRuntimes = new Map<string, Promise<BgeRuntime>>();

async function createBgeRuntime(modelName: string): Promise<BgeRuntime> {
  // Keep this optional package outside the typecheck/build graph, like evals/braintrust.ts.
  const specifier = "@huggingface/transformers";
  let transformers: TransformersModule;
  try {
    transformers = (await import(/* webpackIgnore: true */ specifier)) as unknown as TransformersModule;
  } catch (cause) {
    throw new Error(
      "BGE reranking requires the optional @huggingface/transformers package; " +
        "install it with `pnpm --filter @astroscout/web add -D @huggingface/transformers`.",
      { cause },
    );
  }

  const [tokenizer, model] = await Promise.all([
    transformers.AutoTokenizer.from_pretrained(modelName),
    transformers.AutoModelForSequenceClassification.from_pretrained(modelName, {
      dtype: "q8",
    }),
  ]);
  return { tokenizer, model };
}

async function loadBgeRuntime(modelName: string): Promise<BgeRuntime> {
  const existing = bgeRuntimes.get(modelName);
  if (existing) return existing;

  const pending = createBgeRuntime(modelName);
  bgeRuntimes.set(modelName, pending);
  try {
    return await pending;
  } catch (error) {
    bgeRuntimes.delete(modelName);
    throw error;
  }
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

/** Local ONNX conversion of BAAI bge-reranker-base; loaded only on first use. */
export class BgeReranker implements Reranker {
  readonly name = "bge";

  constructor(
    private readonly modelName = process.env.BGE_RERANK_MODEL?.trim() || DEFAULT_BGE_MODEL,
    private readonly runtimeLoader: (modelName: string) => Promise<BgeRuntime> = loadBgeRuntime,
  ) {}

  async rerank(
    query: string,
    passages: KnowledgePassage[],
    topK: number,
  ): Promise<KnowledgePassage[]> {
    if (passages.length === 0) return [];

    const { tokenizer, model } = await this.runtimeLoader(this.modelName);
    const inputs = tokenizer(Array<string>(passages.length).fill(query), {
      text_pair: passages.map((passage) => passage.content),
      padding: true,
      truncation: true,
      max_length: 512,
    });
    const output = await model(inputs);
    const logits = Array.from(output.logits.data, (value) => Number(value));
    if (logits.length !== passages.length) {
      throw new Error(
        `BGE reranker returned ${logits.length} scores for ${passages.length} passages.`,
      );
    }

    return logits
      .map((logit, index) => ({
        index,
        score: 1 / (1 + Math.exp(-logit)),
      }))
      .sort((first, second) => second.score - first.score || first.index - second.index)
      .slice(0, topK)
      .map(({ index, score }) => ({ ...passages[index], similarity: score }));
  }
}

function configuredBackend(): RerankBackend | undefined {
  const value = process.env.RERANK_BACKEND?.trim().toLowerCase();
  if (!value) return undefined;
  if (["auto", "cohere", "llm", "bge", "none"].includes(value)) {
    return value as RerankBackend;
  }
  throw new Error(
    `Unsupported RERANK_BACKEND=${value}; expected auto, cohere, llm, bge, or none.`,
  );
}

/** Pick an explicit backend, or preserve the Cohere -> LLM -> pass-through default. */
export async function rerankPassages(
  query: string,
  passages: KnowledgePassage[],
  topK: number,
  backend?: RerankBackend,
): Promise<KnowledgePassage[]> {
  const selected = backend ?? configuredBackend();
  if (selected === "bge") return new BgeReranker().rerank(query, passages, topK);
  if (selected === "cohere") {
    if (!process.env.COHERE_API_KEY) {
      throw new Error("RERANK_BACKEND=cohere requires COHERE_API_KEY.");
    }
    return new CohereReranker().rerank(query, passages, topK);
  }
  if (selected === "llm") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("RERANK_BACKEND=llm requires OPENAI_API_KEY.");
    }
    return new LLMReranker().rerank(query, passages, topK);
  }
  if (selected === "none") return passages.slice(0, topK);

  if (process.env.COHERE_API_KEY) return new CohereReranker().rerank(query, passages, topK);
  if (process.env.OPENAI_API_KEY) return new LLMReranker().rerank(query, passages, topK);
  return passages.slice(0, topK);
}
