import { NextResponse, type NextRequest } from "next/server";

import { fetchVisibility } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const target = searchParams.get("target");
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!target || Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "target, lat and lon are required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await fetchVisibility(target, lat, lon));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
