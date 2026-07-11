import { afterEach, describe, expect, it, vi } from "vitest";

import type { KnowledgePassage } from "@/lib/knowledge";
import {
  BgeReranker,
  type BgeInputs,
  type BgeModel,
  type BgeTokenizer,
} from "@/lib/rerank";

function passage(content: string, similarity: number): KnowledgePassage {
  return {
    target: "M31",
    title: null,
    source: null,
    bibcode: null,
    url: null,
    content,
    similarity,
  };
}

describe("BgeReranker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not load the optional runtime for an empty candidate list", async () => {
    const loadRuntime = vi.fn();
    const reranker = new BgeReranker("test/model", loadRuntime);

    await expect(reranker.rerank("query", [], 5)).resolves.toEqual([]);
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("scores query-passage pairs, normalizes logits, and keeps stable score order", async () => {
    vi.stubEnv("BGE_RERANK_MODEL", "   ");
    const tokenizer = vi.fn<BgeTokenizer>((texts, options): BgeInputs => ({ texts, options }));
    const model = vi.fn<BgeModel>(async () => ({
      logits: { data: new Float32Array([-2, 3, 3]) },
    }));
    const loadRuntime = vi.fn(async () => ({ tokenizer, model }));
    const reranker = new BgeReranker(undefined, loadRuntime);
    const passages = [passage("first", 0.9), passage("second", 0.8), passage("third", 0.7)];

    const result = await reranker.rerank("which passage?", passages, 2);

    expect(loadRuntime).toHaveBeenCalledWith("Xenova/bge-reranker-base");
    expect(tokenizer).toHaveBeenCalledWith(
      ["which passage?", "which passage?", "which passage?"],
      {
        text_pair: ["first", "second", "third"],
        padding: true,
        truncation: true,
        max_length: 512,
      },
    );
    expect(model).toHaveBeenCalledOnce();
    expect(result.map((item) => item.content)).toEqual(["second", "third"]);
    expect(result[0].similarity).toBeCloseTo(1 / (1 + Math.exp(-3)));
    expect(passages.map((item) => item.similarity)).toEqual([0.9, 0.8, 0.7]);
  });
});
