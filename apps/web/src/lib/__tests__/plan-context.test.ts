import { describe, expect, it } from "vitest";

import type { NightPlan } from "@/lib/api";
import {
  createPlanRequestContext,
  observerContextFromPlan,
  parsePlanRequestInput,
  planRequestMatchesContext,
  planSearchParams,
  projectSearchParams,
  type PlanRequestInput,
} from "@/lib/plan-context";

const request: PlanRequestInput = {
  lat: -36.85,
  lon: 174.76,
  when: "2026-08-15",
  source: "manual",
  gear: {
    profileId: "gear-1",
    profileName: "PA-1 test rig",
    fRatio: 5,
    filter: "broadband",
    tier: "clean",
    sqm: 18.4,
  },
};

const nightPlan: Pick<NightPlan, "dusk_utc"> = {
  dusk_utc: "2026-08-15T06:30:00Z",
};

describe("immutable plan request context", () => {
  it("freezes the successful future-date snapshot and preserves the requested date", () => {
    const context = createPlanRequestContext(request, nightPlan);

    expect(context.plannedFor).toBe("2026-08-15");
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.gear)).toBe(true);
  });

  it("derives every projection parameter from the successful ranking snapshot", () => {
    const context = createPlanRequestContext(request, nightPlan);

    expect(Object.fromEntries(planSearchParams(context))).toEqual({
      lat: "-36.85",
      lon: "174.76",
      when: "2026-08-15",
      f_ratio: "5",
      filter: "broadband",
      tier: "clean",
      sqm: "18.4",
    });
    expect(Object.fromEntries(projectSearchParams(context, "M42", 30) ?? [])).toEqual({
      lat: "-36.85",
      lon: "174.76",
      when: "2026-08-15",
      f_ratio: "5",
      filter: "broadband",
      tier: "clean",
      sqm: "18.4",
      name: "M42",
      nights: "30",
    });
  });

  it.each([
    ["latitude", { ...request, lat: -36.8 }],
    ["longitude", { ...request, lon: 174.7 }],
    ["date", { ...request, when: "2026-08-16" }],
    ["geolocation source", { ...request, source: "geolocation" as const }],
    ["gear selection", { ...request, gear: { ...request.gear!, profileId: "gear-2" } }],
    ["gear", { ...request, gear: { ...request.gear!, fRatio: 4 } }],
    ["SQM", { ...request, gear: { ...request.gear!, sqm: 19.1 } }],
  ])("invalidates the snapshot after a %s change", (_field, changed) => {
    const context = createPlanRequestContext(request, nightPlan);
    expect(planRequestMatchesContext(context, changed)).toBe(false);
  });

  it("builds saved observer state from the snapshot rather than current controls", () => {
    const context = createPlanRequestContext(request, nightPlan);
    expect(
      observerContextFromPlan(context, {
        source: "saved_session",
        sessionId: "session-1",
      }),
    ).toEqual({
      lat: -36.85,
      lon: 174.76,
      when: "2026-08-15",
      source: "saved_session",
      sessionId: "session-1",
    });
  });

  it("uses the returned dusk date for an upcoming-night request", () => {
    const context = createPlanRequestContext({ ...request, when: null }, nightPlan);
    expect(context.plannedFor).toBe("2026-08-15");
    expect(observerContextFromPlan(context)).not.toHaveProperty("when");
  });

  it("rejects invalid dates, coordinates, gear, and SQM before a request", () => {
    expect(parsePlanRequestInput({ ...request, when: "2026-02-30" })).toBeNull();
    expect(parsePlanRequestInput({ ...request, lat: Number.NaN })).toBeNull();
    expect(
      parsePlanRequestInput({ ...request, gear: { ...request.gear!, fRatio: 0 } }),
    ).toBeNull();
    expect(
      parsePlanRequestInput({ ...request, gear: { ...request.gear!, sqm: 22.2 } }),
    ).toBeNull();
  });
});
