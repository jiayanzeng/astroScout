import { describe, expect, it } from "vitest";

import {
  aggregateIntegrationMinutes,
  formatIntegrationProgress,
  targetProgressKey,
} from "@/lib/progress";

describe("observation progress", () => {
  it("normalizes targets and sums minutes across sessions", () => {
    expect(
      aggregateIntegrationMinutes([
        { target: "M42", integration_minutes: 90 },
        { target: " m42 ", integration_minutes: 30 },
        { target: "M  31", integration_minutes: 45 },
      ]),
    ).toEqual({ M42: 120, "M 31": 45 });
    expect(targetProgressKey(" alpha   centauri ")).toBe("ALPHA CENTAURI");
  });

  it("ignores malformed rows instead of inventing progress", () => {
    expect(
      aggregateIntegrationMinutes([
        { target: "", integration_minutes: 60 },
        { target: "M42", integration_minutes: -1 },
        { target: "M31", integration_minutes: Number.NaN },
      ]),
    ).toEqual({});
  });

  it("formats recorded time against both modeled endpoints", () => {
    expect(formatIntegrationProgress(120, 4, 8)).toBe(
      "2.0 h logged · 25–50% of modeled range",
    );
    expect(formatIntegrationProgress(30, null, null)).toBe("30 min logged");
    expect(formatIntegrationProgress(600, 4, 8)).toBe(
      "10.0 h logged · 125–250% of modeled range",
    );
  });
});
