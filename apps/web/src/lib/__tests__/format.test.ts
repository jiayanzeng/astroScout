import { describe, expect, it } from "vitest";

import { ratingLabel } from "@/lib/format";

describe("ratingLabel", () => {
  it("maps good", () => expect(ratingLabel("good")).toMatch(/Great/));
  it("maps marginal", () => expect(ratingLabel("marginal")).toMatch(/caveats/));
  it("maps poor", () => expect(ratingLabel("poor")).toMatch(/Skip/));
});
