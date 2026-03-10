import { NextRequest, NextResponse } from "next/server";

import { getTopArtists } from "@/lib/stats";
import { parseLimit, parseProviderFilter, parseRange } from "@/lib/range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const range = parseRange(request.nextUrl.searchParams.get("range"));
  const provider = parseProviderFilter(request.nextUrl.searchParams.get("provider"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 20, 100);

  return NextResponse.json({
    range,
    provider,
    items: getTopArtists(range, provider, limit)
  });
}
