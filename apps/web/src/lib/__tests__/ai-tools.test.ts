import { describe, expect, it, vi } from "vitest";

import type { NightPlan, TargetDetail } from "../api";
import {
  planNightInputSchema,
  runPlanNightTool,
  runTargetDetailTool,
  targetDetailInputSchema,
  type ChatToolDependencies,
} from "../ai";
import type { ObserverContext } from "../observer-context";

const plan: NightPlan = {
  dusk_utc: "2026-07-15T06:00:00Z",
  dawn_utc: "2026-07-15T18:00:00Z",
  dark_hours: 10,
  moon_illumination: 0.2,
  bortle: 5,
  targets: [],
};

const detail: TargetDetail = {
  name: "M1",
  common_name: "Crab Nebula",
  kind: "supernova remnant",
  score: 70,
  rating: "good",
  peak_altitude_deg: 45,
  hours_visible: 4,
  moon_separation_deg: 80,
  light_sensitivity: 0.5,
  dark_hours: 10,
  moon_illumination: 0.2,
  bortle: 5,
};

function dependencies() {
  return {
    planNight: vi.fn(async () => plan),
    targetDetail: vi.fn(async () => detail),
    knowledge: vi.fn(async () => []),
  } satisfies ChatToolDependencies;
}

describe("server-bound chat planning tools", () => {
  it("removes coordinates from model-controlled tool arguments", () => {
    expect(() => planNightInputSchema.parse({ lat: 10, lon: 20 })).toThrow();
    expect(() => targetDetailInputSchema.parse({ name: "M1", lat: 10, lon: 20 })).toThrow();
  });

  it("returns structured location_required and never calls planning dependencies", async () => {
    const deps = dependencies();
    await expect(runPlanNightTool(null, deps)).resolves.toMatchObject({
      status: "location_required",
    });
    await expect(runTargetDetailTool("M1", null, deps)).resolves.toMatchObject({
      status: "location_required",
    });
    expect(deps.planNight).not.toHaveBeenCalled();
    expect(deps.targetDetail).not.toHaveBeenCalled();
  });

  it("passes the same trusted coordinates and date to night and detail tools", async () => {
    const deps = dependencies();
    const observer: ObserverContext = {
      lat: 27,
      lon: 119,
      source: "saved_session",
      when: "2026-07-15",
      sessionId: "session-1",
    };

    await runPlanNightTool(observer, deps);
    await runTargetDetailTool("M1", observer, deps);

    expect(deps.planNight).toHaveBeenCalledWith(27, 119, "2026-07-15");
    expect(deps.targetDetail).toHaveBeenCalledWith("M1", 27, 119, "2026-07-15");
  });
});
