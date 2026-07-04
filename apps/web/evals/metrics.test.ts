import { describe, expect, it } from "vitest";

import {
  hitAtK,
  mean,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  uniqueInOrder,
} from "./metrics";

const rel = new Set(["M42"]);
const relMulti = new Set(["M51", "M101"]);

describe("hitAtK", () => {
  it("hits when relevant in top-k", () => expect(hitAtK(["M31", "M42"], rel, 2)).toBe(1));
  it("misses when relevant outside top-k", () => expect(hitAtK(["M31", "M42"], rel, 1)).toBe(0));
});

describe("precisionAtK", () => {
  it("counts hits over k", () => expect(precisionAtK(["M42", "M31"], rel, 2)).toBeCloseTo(0.5));
});

describe("recallAtK", () => {
  it("fraction of relevant found", () =>
    expect(recallAtK(["M51", "M31", "M101"], relMulti, 3)).toBeCloseTo(1));
  it("partial recall", () => expect(recallAtK(["M51", "M31"], relMulti, 2)).toBeCloseTo(0.5));
});

describe("reciprocalRank", () => {
  it("1 at first position", () => expect(reciprocalRank(["M42"], rel)).toBe(1));
  it("1/2 at second", () => expect(reciprocalRank(["M31", "M42"], rel)).toBeCloseTo(0.5));
  it("0 if absent", () => expect(reciprocalRank(["M31"], rel)).toBe(0));
});

describe("ndcgAtK", () => {
  it("1.0 when ideal ordering", () => expect(ndcgAtK(["M42"], rel, 5)).toBeCloseTo(1));
  it("less than 1 when relevant is lower", () =>
    expect(ndcgAtK(["M31", "M42"], rel, 5)).toBeLessThan(1));
});

describe("helpers", () => {
  it("mean", () => expect(mean([0, 1])).toBeCloseTo(0.5));
  it("uniqueInOrder dedups", () =>
    expect(uniqueInOrder(["M42", "M42", "M31", "M42"])).toEqual(["M42", "M31"]));
});
