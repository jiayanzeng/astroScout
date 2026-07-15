import { describe, expect, it } from "vitest";

import { RETRIEVAL_DATASET } from "./dataset";

describe("retrieval dataset", () => {
  it("keeps one separately labelled case for each supported planet", () => {
    const planetCases = RETRIEVAL_DATASET.filter(
      (retrievalCase) => retrievalCase.group === "planet",
    );

    expect(planetCases).toHaveLength(4);
    expect(planetCases.flatMap((retrievalCase) => retrievalCase.relevantTargets).sort()).toEqual([
      "Jupiter",
      "Mars",
      "Saturn",
      "Venus",
    ]);
  });
});
