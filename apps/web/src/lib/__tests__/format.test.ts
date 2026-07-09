import { describe, expect, it } from "vitest";

import { lightSensitivityTier, ratingLabel } from "@/lib/format";

describe("ratingLabel", () => {
  it("maps good", () => expect(ratingLabel("good")).toMatch(/Great/));
  it("maps marginal", () => expect(ratingLabel("marginal")).toMatch(/caveats/));
  it("maps poor", () => expect(ratingLabel("poor")).toMatch(/Skip/));
});

describe("lightSensitivityTier", () => {
  it("returns robust for ≤0.3", () => {
    expect(lightSensitivityTier(0)).toBe("robust");
    expect(lightSensitivityTier(0.15)).toBe("robust");
    expect(lightSensitivityTier(0.3)).toBe("robust");
  });

  it("returns moderate for 0.3<x≤0.6", () => {
    expect(lightSensitivityTier(0.31)).toBe("moderate");
    expect(lightSensitivityTier(0.55)).toBe("moderate");
    expect(lightSensitivityTier(0.6)).toBe("moderate");
  });

  it("returns fragile for >0.6", () => {
    expect(lightSensitivityTier(0.61)).toBe("fragile");
    expect(lightSensitivityTier(0.9)).toBe("fragile");
    expect(lightSensitivityTier(1.0)).toBe("fragile");
  });
});
