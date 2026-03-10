import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { connectAppleMusicToken } from "@/lib/auth/apple-auth";
import { completeSpotifyAuthorization, startSpotifyAuthorization } from "@/lib/auth/spotify-auth";
import { createDatabase, setDbForTests, type Database } from "@/lib/db";
import { syncApple } from "@/lib/sync/apple-sync";
import { syncSpotify } from "@/lib/sync/spotify-sync";
import { getOverview, getRecentActivity, getTopArtists, getTopTracks } from "@/lib/stats";
import { ensureTestEnv } from "@/lib/test-utils";

describe("e2e service flow", () => {
  let db: Database;

  beforeEach(() => {
    ensureTestEnv();
    db = createDatabase(":memory:");
    setDbForTests(db);
  });

  afterEach(() => {
    db.close();
    setDbForTests(null);
    vi.restoreAllMocks();
  });

  it("connects both providers, syncs, and serves stats", async () => {
    const spotifyAuthUrl = startSpotifyAuthorization();
    const state = new URL(spotifyAuthUrl).searchParams.get("state");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("accounts.spotify.com/api/token")) {
          return new Response(
            JSON.stringify({
              access_token: "spotify-access",
              token_type: "Bearer",
              scope: "user-read-recently-played user-top-read",
              expires_in: 3600,
              refresh_token: "spotify-refresh"
            }),
            { status: 200 }
          );
        }

        if (url.includes("/me/player/recently-played")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  played_at: "2026-03-09T10:00:00.000Z",
                  track: {
                    id: "sp-track-1",
                    name: "Spotify Recent",
                    duration_ms: 200000,
                    album: { name: "Spotify Album" },
                    artists: [{ name: "Spotify Artist" }],
                    external_ids: { isrc: "USRC17607839" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (url.includes("/me/top/tracks")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "sp-track-2",
                  name: "Spotify Top",
                  duration_ms: 180000,
                  album: { name: "Top Album" },
                  artists: [{ name: "Top Artist" }],
                  external_ids: { isrc: "USRC17607840" }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (url.includes("/v1/me/recent/played/tracks")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "am-track-1",
                  attributes: {
                    name: "Apple Recent",
                    artistName: "Apple Artist",
                    albumName: "Apple Album",
                    durationInMillis: 190000,
                    isrc: "USRC17607839",
                    lastPlayedDate: "2026-03-09T09:55:00.000Z"
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (url.includes("/v1/me/history/heavy-rotation")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "am-track-2",
                  attributes: {
                    name: "Apple Heavy",
                    artistName: "Heavy Artist",
                    albumName: "Heavy Album",
                    durationInMillis: 210000,
                    isrc: "USRC17607841"
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        return new Response("not found", { status: 404 });
      })
    );

    await completeSpotifyAuthorization({
      code: "spotify-code",
      state: state as string
    });

    connectAppleMusicToken("apple-user-token");

    const spotifySync = await syncSpotify();
    const appleSync = await syncApple();

    expect(spotifySync.status).toBe("success");
    expect(appleSync.status).toBe("success");

    const overview = getOverview("30d", "all");
    const topTracks = getTopTracks("30d", "all", 10);
    const topArtists = getTopArtists("30d", "all", 10);
    const recent = getRecentActivity("all", 10);

    expect(overview.playCount).toBeGreaterThanOrEqual(2);
    expect(topTracks.length).toBeGreaterThan(0);
    expect(topArtists.length).toBeGreaterThan(0);
    expect(recent.length).toBeGreaterThan(0);
  });
});
