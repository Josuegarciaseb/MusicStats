import { NextResponse } from "next/server";

import { listConnections } from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(listConnections());
}
