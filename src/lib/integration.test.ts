import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { completeSpotifyAuthorization, startSpotifyAuthorization } from "@/lib/auth/spotify-auth";
import { connectAppleMusicToken } from "@/lib/auth/apple-auth";
import { listConnections, saveSpotifyConnection } from "@/lib/connections";
import { createDatabase, setDbForTests, type Database } from "@/lib/db";
import { syncSpotify } from "@/lib/sync/spotify-sync";
import { ensureTestEnv } from "@/lib/test-utils";

describe("integration flows", () => {
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

  it("stores Spotify tokens from oauth callback", async () => {
    const authUrl = startSpotifyAuthorization();
    const state = new URL(authUrl).searchParams.get("state");

    expect(state).toBeTruthy();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            token_type: "Bearer",
            scope: "user-read-recently-played user-top-read",
            expires_in: 3600,
            refresh_token: "refresh-token"
          }),
          { status: 200 }
        );
      })
    );

    await completeSpotifyAuthorization({
      code: "oauth-code",
      state: state as string
    });

    const connections = listConnections();
    expect(connections.spotify.connected).toBe(true);
  });

  it("stores Apple music user token", () => {
    connectAppleMusicToken("apple-user-token");

    const connections = listConnections();
    expect(connections.apple.connected).toBe(true);
  });

  it("runs spotify sync and persists snapshot + events", async () => {
    saveSpotifyConnection({
      accessToken: "token-live",
      refreshToken: "token-refresh",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      scopes: "user-read-recently-played user-top-read"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/me/player/recently-played")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  played_at: "2026-03-09T10:00:00.000Z",
                  track: {
                    id: "sp-track-1",
                    name: "Recent Song",
                    duration_ms: 200000,
                    album: { name: "Recent Album" },
                    artists: [{ name: "Recent Artist" }],
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
                  name: "Top Song",
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

        return new Response("not found", { status: 404 });
      })
    );

    const sync = await syncSpotify();

    expect(sync.status).toBe("success");
    expect(sync.fetched).toBe(2);

    const snapshotCount = (db.prepare("SELECT COUNT(*) AS count FROM snapshot_runs").get() as unknown as { count: number })
      .count;
    const eventCount = (db.prepare("SELECT COUNT(*) AS count FROM play_events").get() as unknown as { count: number })
      .count;

    expect(snapshotCount).toBeGreaterThanOrEqual(1);
    expect(eventCount).toBeGreaterThanOrEqual(2);
  });
});

