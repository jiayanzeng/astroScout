import { describe, expect, it } from "vitest";

import {
  bortleLabel,
  deviceTimeZoneLabel,
  formatHoursRange,
  formatLocalDateTime,
  lightSensitivityTier,
  ratingLabel,
} from "@/lib/format";

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

describe("formatLocalDateTime", () => {
  it("formats an ISO timestamp in the requested time zone", () => {
    expect(formatLocalDateTime("2026-07-11T20:05:00Z", "UTC")).toBe("Jul 11, 8:05 PM");
  });

  it("converts the timestamp instead of slicing the UTC text", () => {
    expect(formatLocalDateTime("2026-07-11T20:05:00Z", "Pacific/Auckland")).toBe(
      "Jul 12, 8:05 AM",
    );
  });

  it("makes Auckland planning rollover explicit on a device in another zone", () => {
    // Auckland dusk is Sep 26 local, while the same instant is still Sep 25 on the device.
    expect(formatLocalDateTime("2026-09-26T06:00:00Z", "America/Los_Angeles")).toBe(
      "Sep 25, 11:00 PM",
    );
    expect(
      deviceTimeZoneLabel(
        "2026-09-26T06:00:00Z",
        "2026-09-26T17:00:00Z",
        "America/Los_Angeles",
      ),
    ).toBe("America/Los_Angeles (PDT)");
  });

  it("shows daylight-saving abbreviation changes instead of saying local time", () => {
    expect(
      deviceTimeZoneLabel(
        "2026-11-01T08:30:00Z",
        "2026-11-01T10:30:00Z",
        "America/Los_Angeles",
      ),
    ).toBe("America/Los_Angeles (PDT → PST)");
  });
});

describe("bortleLabel", () => {
  it("labels the dark and bright endpoints", () => {
    expect(bortleLabel(1)).toBe("excellent-dark");
    expect(bortleLabel(9)).toBe("inner-city");
  });

  it("labels intermediate classes and clamps out-of-range values", () => {
    expect(bortleLabel(5)).toBe("suburban");
    expect(bortleLabel(0)).toBe("excellent-dark");
    expect(bortleLabel(10)).toBe("inner-city");
  });
});

describe("formatHoursRange", () => {
  it("keeps both community-anchored endpoints visible", () => {
    expect(formatHoursRange(6, 12)).toBe("~6–12 h");
    expect(formatHoursRange(1.5, 3)).toBe("~1.5–3 h");
  });
});
