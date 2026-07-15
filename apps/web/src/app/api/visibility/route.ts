import { NextResponse, type NextRequest } from "next/server";

import { ApiError, fetchVisibility } from "@/lib/api";
import { coordinates, QueryValidationError, requiredText } from "@/lib/proxy-params";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  try {
    const target = requiredText(searchParams, "target");
    const { lat, lon } = coordinates(searchParams);
    return NextResponse.json(await fetchVisibility(target, lat, lon));
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
