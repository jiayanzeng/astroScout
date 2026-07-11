import { NextResponse, type NextRequest } from "next/server";

import { ApiError, fetchNightPlan, type GearPlanParams } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const when = searchParams.get("when") ?? undefined;
  const fRatio = searchParams.get("f_ratio");
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  try {
    let gear: GearPlanParams | undefined;
    if (fRatio !== null) {
      const sqm = searchParams.get("sqm");
      gear = {
        f_ratio: Number(fRatio),
        filter: (searchParams.get("filter") ?? "broadband") as GearPlanParams["filter"],
        tier: (searchParams.get("tier") ?? "clean") as NonNullable<GearPlanParams["tier"]>,
        ...(sqm === null ? {} : { sqm: Number(sqm) }),
      };
    }
    return NextResponse.json(await fetchNightPlan(lat, lon, when, gear));
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
