import { NextRequest, NextResponse } from "next/server";

import { getOverview } from "@/lib/stats";
import { parseProviderFilter, parseRange } from "@/lib/range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const range = parseRange(request.nextUrl.searchParams.get("range"));
  const provider = parseProviderFilter(request.nextUrl.searchParams.get("provider"));

  return NextResponse.json(getOverview(range, provider));
}
