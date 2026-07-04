import { describe, expect, it } from "vitest";

import type { RetrievedPassage, Retriever } from "./retriever";
import { LexicalReranker, RerankedRetriever } from "./rerank";

const passages: RetrievedPassage[] = [
  { target: "M31", content: "M31 — andromeda spiral galaxy island universe", similarity: 0.9 },
  { target: "M42", content: "M42 — orion nebula glowing stellar nursery young stars", similarity: 0.8 },
  { target: "M13", content: "M13 — ancient globular cluster of old stars", similarity: 0.7 },
];

describe("LexicalReranker", () => {
  it("promotes the passage best matching the query", async () => {
    const out = await new LexicalReranker().rerank("orion nebula young stars", passages, 3);
    expect(out[0].target).toBe("M42");
  });

  it("respects topK", async () => {
    const out = await new LexicalReranker().rerank("galaxy", passages, 1);
    expect(out).toHaveLength(1);
  });
});

describe("RerankedRetriever", () => {
  it("reorders a base retriever's candidates", async () => {
    const base: Retriever = {
      name: "stub",
      // base returns a deliberately bad order (M13 first)
      retrieve: async () => [passages[2], passages[0], passages[1]],
    };
    const rr = new RerankedRetriever(base, new LexicalReranker(), 3);
    const out = await rr.retrieve("orion nebula stellar nursery", 2);
    expect(out[0].target).toBe("M42"); // reranker fixes the order
    expect(out).toHaveLength(2);
  });
});
