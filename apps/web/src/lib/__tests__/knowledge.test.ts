import { describe, expect, it } from "vitest";

import { deduplicatePassages, type KnowledgePassage } from "@/lib/knowledge";

function passage(
  content: string,
  similarity: number,
  overrides: Partial<KnowledgePassage> = {},
): KnowledgePassage {
  return {
    target: "M31",
    title: "Andromeda",
    source: "ADS",
    bibcode: "2026Test....1A",
    url: null,
    content,
    similarity,
    ...overrides,
  };
}

describe("deduplicatePassages", () => {
  it("keeps the higher-similarity normalized duplicate without mutating or reordering", () => {
    const lower = passage("M31—HAS   a luminous bulge.\nAnd a wide disk!", 0.4);
    const distinct = passage("M31 also has a population of globular clusters.", 0.8);
    const higher = passage("m31 has a luminous bulge and a wide disk", 0.9);
    const input = [lower, distinct, higher];
    const snapshot = [...input];

    const result = deduplicatePassages(input);

    expect(result).toEqual([distinct, higher]);
    expect(result[1]).toBe(higher);
    expect(input).toEqual(snapshot);
  });

  it("collapses token-boundary prefixes but not partial-token prefixes", () => {
    const short = passage("M31 contains a luminous bulge", 0.5);
    const long = passage("M31 contains a luminous bulge and an extended stellar disk", 0.9);
    const partialToken = passage("M31a contains a luminous bulge", 0.7);

    expect(deduplicatePassages([short, long, partialToken])).toEqual([long, partialToken]);
  });

  it("collapses chained high-overlap trigram near-matches behind the best sibling", () => {
    const originalTokens = Array.from({ length: 100 }, (_, index) => `token${index}`);
    const middleTokens = [...originalTokens];
    middleTokens[20] = "middle-a";
    middleTokens[60] = "middle-b";
    const lowerTokens = [...middleTokens];
    lowerTokens[30] = "lower-a";
    lowerTokens[70] = "lower-b";
    const lower = passage(lowerTokens.join(" "), 0.6);
    const middle = passage(middleTokens.join(" "), 0.8);
    const higher = passage(originalTokens.join(" "), 0.95);

    expect(deduplicatePassages([lower, middle, higher])).toEqual([higher]);
  });

  it("keeps identical content from different target or bibcode groups", () => {
    const content = "A shared description of stellar populations and dust lanes.";
    const m31 = passage(content, 0.9);
    const m42 = passage(content, 0.8, { target: "M42" });
    const otherPaper = passage(content, 0.7, { bibcode: "2026Test....2B" });

    expect(deduplicatePassages([m31, m42, otherPaper])).toEqual([m31, m42, otherPaper]);
  });

  it("keeps ordinary neighboring chunks with a small overlap", () => {
    const shared = Array.from({ length: 20 }, (_, index) => `shared${index}`);
    const left = Array.from({ length: 80 }, (_, index) => `left${index}`);
    const right = Array.from({ length: 80 }, (_, index) => `right${index}`);
    const first = passage([...left, ...shared].join(" "), 0.9);
    const second = passage([...shared, ...right].join(" "), 0.8);

    expect(deduplicatePassages([first, second])).toEqual([first, second]);
  });

  it("uses input order as the tie-breaker and does not treat blank text as a prefix", () => {
    const first = passage("The first version of this passage.", 0.8);
    const tied = passage("the first version of this passage", 0.8);
    const blank = passage("   ", 0.7);
    const nonBlank = passage("A distinct non-blank passage", 0.6);

    expect(deduplicatePassages([first, tied, blank, nonBlank])).toEqual([
      first,
      blank,
      nonBlank,
    ]);
  });
});
