import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as plan } from "@/app/api/plan/route";
import { GET as project } from "@/app/api/project/route";
import { GET as visibility } from "@/app/api/visibility/route";

function request(path: string): NextRequest {
  return { nextUrl: new URL(path, "http://localhost") } as NextRequest;
}

async function expectBadRequest(
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  message: RegExp,
) {
  const response = await handler(request(path));
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(message) });
}

describe("proxy query validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects missing coordinates before Number(null) can become zero", async () => {
    await expectBadRequest(plan, "/api/plan?lon=174.76", /lat is required/);
    await expectBadRequest(visibility, "/api/visibility?target=M42&lat=-36.85", /lon is required/);
    await expectBadRequest(
      project,
      "/api/project?name=M42&lat=-36.85&lon=174.76",
      /f_ratio is required/,
    );
  });

  it("rejects non-finite values in every proxy", async () => {
    await expectBadRequest(plan, "/api/plan?lat=Infinity&lon=0", /lat must be a finite number/);
    await expectBadRequest(
      visibility,
      "/api/visibility?target=M42&lat=0&lon=NaN",
      /lon must be a finite number/,
    );
    await expectBadRequest(
      project,
      "/api/project?name=M42&lat=0&lon=0&f_ratio=Infinity",
      /f_ratio must be a finite number/,
    );
  });

  it("rejects out-of-range values before forwarding", async () => {
    await expectBadRequest(plan, "/api/plan?lat=91&lon=0", /lat must be at most 90/);
    await expectBadRequest(
      visibility,
      "/api/visibility?target=M42&lat=0&lon=-181",
      /lon must be at least -180/,
    );
    await expectBadRequest(
      project,
      "/api/project?name=M42&lat=0&lon=0&f_ratio=5&nights=61",
      /nights must be at most 60/,
    );
    await expectBadRequest(
      plan,
      "/api/plan?lat=0&lon=0&sqm=Infinity",
      /sqm must be a finite number/,
    );
  });

  it("preserves structured target errors returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            detail: {
              code: "unsupported_target",
              target: "Sun",
              message: "Use the daylight planner.",
              flow: "solar_daylight_planner_required",
            },
          },
          { status: 422 },
        ),
      ),
    );

    const response = await project(
      request("/api/project?name=Sun&lat=0&lon=0&f_ratio=5"),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: "Use the daylight planner.",
      detail: {
        code: "unsupported_target",
        flow: "solar_daylight_planner_required",
      },
    });
  });
});
