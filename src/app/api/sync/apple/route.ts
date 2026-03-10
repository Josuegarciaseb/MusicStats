import { NextResponse } from "next/server";

import { syncApple } from "@/lib/sync/apple-sync";
import { ApiError, asErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const result = await syncApple();
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json(
      {
        provider: "apple",
        status: "failed",
        error: asErrorMessage(error)
      },
      { status }
    );
  }
}
