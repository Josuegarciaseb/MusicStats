import { NextResponse } from "next/server";

import { syncSpotify } from "@/lib/sync/spotify-sync";
import { ApiError, asErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const result = await syncSpotify();
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json(
      {
        provider: "spotify",
        status: "failed",
        error: asErrorMessage(error)
      },
      { status }
    );
  }
}
