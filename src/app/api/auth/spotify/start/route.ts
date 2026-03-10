import { NextResponse } from "next/server";

import { asErrorMessage, ApiError } from "@/lib/errors";
import { startSpotifyAuthorization } from "@/lib/auth/spotify-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const url = startSpotifyAuthorization();
    return NextResponse.json({ url });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: asErrorMessage(error) }, { status });
  }
}
