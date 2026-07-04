import { describe, expect, it } from "vitest";

import { reciprocalRankFusion } from "./fusion";

describe("reciprocalRankFusion", () => {
  it("returns the single list unchanged", () => {
    expect(reciprocalRankFusion([["a", "b", "c"]])).toEqual(["a", "b", "c"]);
  });

  it("ranks an item appearing high in both lists first", () => {
    const fused = reciprocalRankFusion([
      ["x", "a", "b"],
      ["y", "a", "c"],
    ]);
    // 'a' is 2nd in both; no other id appears twice, so 'a' wins
    expect(fused[0]).toBe("a");
  });

  it("an item in both lists beats one in only one list", () => {
    const fused = reciprocalRankFusion([
      ["a", "b"],
      ["a", "c"],
    ]);
    expect(fused.indexOf("a")).toBeLessThan(fused.indexOf("b"));
    expect(fused.indexOf("a")).toBeLessThan(fused.indexOf("c"));
  });

  it("dedups ids across lists", () => {
    const fused = reciprocalRankFusion([["a", "b"], ["b", "a"]]);
    expect([...fused].sort()).toEqual(["a", "b"]);
  });
});
