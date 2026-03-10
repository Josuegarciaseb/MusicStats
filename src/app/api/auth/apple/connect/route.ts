import { NextRequest, NextResponse } from "next/server";

import { connectAppleMusicToken } from "@/lib/auth/apple-auth";
import { ApiError, asErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { musicUserToken?: string };

    if (!body.musicUserToken) {
      throw new ApiError("musicUserToken is required.", 400);
    }

    connectAppleMusicToken(body.musicUserToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: asErrorMessage(error) }, { status });
  }
}
