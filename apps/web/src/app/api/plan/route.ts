import { NextResponse, type NextRequest } from "next/server";

import { ApiError, fetchNightPlan, type GearPlanParams } from "@/lib/api";
import {
  coordinates,
  optionalFiniteNumber,
  QueryValidationError,
} from "@/lib/proxy-params";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const when = searchParams.get("when") ?? undefined;
  try {
    const { lat, lon } = coordinates(searchParams);
    const fRatio = optionalFiniteNumber(searchParams, "f_ratio", {
      min: 0,
      max: 32,
      minExclusive: true,
    });
    const sqm = optionalFiniteNumber(searchParams, "sqm", { min: 15, max: 22.1 });
    if (sqm !== undefined && fRatio === undefined) {
      throw new QueryValidationError("sqm requires f_ratio");
    }
    let gear: GearPlanParams | undefined;
    if (fRatio !== undefined) {
      gear = {
        f_ratio: fRatio,
        filter: (searchParams.get("filter") ?? "broadband") as GearPlanParams["filter"],
        tier: (searchParams.get("tier") ?? "clean") as NonNullable<GearPlanParams["tier"]>,
        ...(sqm === undefined ? {} : { sqm }),
      };
    }
    return NextResponse.json(await fetchNightPlan(lat, lon, when, gear));
  } catch (e) {
    if (e instanceof QueryValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof ApiError) {
      return NextResponse.json(
        { error: e.message, ...(e.detail === undefined ? {} : { detail: e.detail }) },
        { status: e.status },
      );
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
