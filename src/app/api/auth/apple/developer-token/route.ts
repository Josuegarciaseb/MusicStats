import { NextResponse } from "next/server";

import { getAppleDeveloperToken } from "@/lib/auth/apple-auth";
import { ApiError, asErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const developerToken = getAppleDeveloperToken();
    return NextResponse.json({
      developerToken,
      app: {
        name: "MusicStats",
        build: "1.0.0"
      }
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: asErrorMessage(error) }, { status });
  }
}
