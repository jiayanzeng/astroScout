import { describe, expect, it } from "vitest";

import { faithfulnessScore, MockJudge, splitClaims } from "./faithfulness";

describe("faithfulnessScore", () => {
  it("empty = 1", () => expect(faithfulnessScore([])).toBe(1));
  it("all supported = 1", () =>
    expect(faithfulnessScore([{ text: "a", supported: true }])).toBe(1));
  it("none supported = 0", () =>
    expect(faithfulnessScore([{ text: "a", supported: false }])).toBe(0));
  it("half = 0.5", () =>
    expect(
      faithfulnessScore([
        { text: "a", supported: true },
        { text: "b", supported: false },
      ]),
    ).toBeCloseTo(0.5));
});

describe("splitClaims", () => {
  it("splits on sentence boundaries", () =>
    expect(splitClaims("The nebula glows. It is ionized.")).toHaveLength(2));
});

describe("MockJudge", () => {
  it("supports claims whose words appear in context", async () => {
    const judge = new MockJudge();
    const claims = await judge.judge("The Orion Nebula is an emission nebula.", [
      "orion nebula emission ionized hydrogen region",
    ]);
    expect(faithfulnessScore(claims)).toBe(1);
  });

  it("flags unsupported claims", async () => {
    const judge = new MockJudge();
    const claims = await judge.judge("Andromeda contains exactly seven black holes.", [
      "the andromeda galaxy is a spiral galaxy",
    ]);
    expect(faithfulnessScore(claims)).toBe(0);
  });
});
