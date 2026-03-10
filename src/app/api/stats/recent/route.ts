import { NextRequest, NextResponse } from "next/server";

import { getRecentActivity } from "@/lib/stats";
import { parseLimit, parseProviderFilter } from "@/lib/range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const provider = parseProviderFilter(request.nextUrl.searchParams.get("provider"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 20, 100);

  return NextResponse.json({
    provider,
    items: getRecentActivity(provider, limit)
  });
}
