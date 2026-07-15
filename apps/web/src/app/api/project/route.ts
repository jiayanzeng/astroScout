import { NextResponse, type NextRequest } from "next/server";

import { ApiError, fetchProject, type GearPlanParams } from "@/lib/api";
import {
  coordinates,
  finiteNumber,
  optionalFiniteNumber,
  QueryValidationError,
  requiredText,
} from "@/lib/proxy-params";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const when = searchParams.get("when") ?? undefined;

  try {
    const name = requiredText(searchParams, "name");
    const { lat, lon } = coordinates(searchParams);
    const fRatio = finiteNumber(searchParams, "f_ratio", {
      min: 0,
      max: 32,
      minExclusive: true,
    });
    const nights =
      searchParams.get("nights") === null
        ? 30
        : finiteNumber(searchParams, "nights", { min: 1, max: 60, integer: true });
    const sqm = optionalFiniteNumber(searchParams, "sqm", { min: 15, max: 22.1 });
    const gear: GearPlanParams = {
      f_ratio: fRatio,
      filter: (searchParams.get("filter") ?? "broadband") as GearPlanParams["filter"],
      tier: (searchParams.get("tier") ?? "clean") as NonNullable<GearPlanParams["tier"]>,
      ...(sqm === undefined ? {} : { sqm }),
    };
    return NextResponse.json(await fetchProject(name, lat, lon, gear, when, nights));
  } catch (error) {
    if (error instanceof QueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.detail === undefined ? {} : { detail: error.detail }),
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
