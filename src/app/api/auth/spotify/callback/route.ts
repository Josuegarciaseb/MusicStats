import { NextRequest, NextResponse } from "next/server";

import { completeSpotifyAuthorization } from "@/lib/auth/spotify-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`/?spotify=error&message=${encodeURIComponent(oauthError)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?spotify=error&message=Missing+code+or+state", request.url));
  }

  try {
    await completeSpotifyAuthorization({ code, state });
    return NextResponse.redirect(new URL("/?spotify=connected", request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify connection failed";
    return NextResponse.redirect(
      new URL(`/?spotify=error&message=${encodeURIComponent(message)}`, request.url)
    );
  }
}
