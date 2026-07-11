import { NextResponse, type NextRequest } from "next/server";

import { ApiError, fetchProject, type GearPlanParams } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get("name");
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const fRatioParam = searchParams.get("f_ratio");
  const fRatio = Number(fRatioParam);
  const when = searchParams.get("when") ?? undefined;
  const nights = Number(searchParams.get("nights") ?? "30");
  const sqm = searchParams.get("sqm");

  if (
    !name ||
    fRatioParam === null ||
    Number.isNaN(lat) ||
    Number.isNaN(lon) ||
    Number.isNaN(fRatio)
  ) {
    return NextResponse.json(
      { error: "name, lat, lon and f_ratio are required" },
      { status: 400 },
    );
  }

  const gear: GearPlanParams = {
    f_ratio: fRatio,
    filter: (searchParams.get("filter") ?? "broadband") as GearPlanParams["filter"],
    tier: (searchParams.get("tier") ?? "clean") as NonNullable<GearPlanParams["tier"]>,
    ...(sqm === null ? {} : { sqm: Number(sqm) }),
  };

  try {
    return NextResponse.json(await fetchProject(name, lat, lon, gear, when, nights));
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
