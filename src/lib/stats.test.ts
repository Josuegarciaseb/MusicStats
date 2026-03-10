import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, setDbForTests, type Database } from "@/lib/db";
import { getOverview, getRecentActivity, getTopArtists, getTopTracks } from "@/lib/stats";
import { persistPlaySignals } from "@/lib/sync/store";
import { ensureTestEnv } from "@/lib/test-utils";

describe("stats aggregation", () => {
  let db: Database;

  beforeEach(() => {
    ensureTestEnv();
    db = createDatabase(":memory:");
    setDbForTests(db);
  });

  afterEach(() => {
    db.close();
    setDbForTests(null);
  });

  it("computes overview and top entities by range/provider", () => {
    const now = new Date().toISOString();

    const runId = Number(
      db
        .prepare(
          `
            INSERT INTO snapshot_runs (
              provider,
              status,
              fetched_count,
              inserted_count,
              updated_count,
              warnings_json,
              started_at,
              finished_at,
              created_at
            )
            VALUES ('spotify', 'success', 1, 1, 0, '[]', ?, ?, ?)
          `
        )
        .run(now, now, now).lastInsertRowid
    );

    persistPlaySignals(db, {
      snapshotRunId: runId,
      events: [
        {
          provider: "spotify",
          track: {
            provider: "spotify",
            providerTrackId: "sp-1",
            isrc: "USRC17607839",
            name: "Song One",
            artistNames: ["Artist One"],
            albumName: "Album One",
            durationMs: 210000
          },
          playedAt: now,
          sourceType: "recent",
          weight: 1
        },
        {
          provider: "spotify",
          track: {
            provider: "spotify",
            providerTrackId: "sp-2",
            isrc: null,
            name: "Song Two",
            artistNames: ["Artist Two"],
            albumName: "Album Two",
            durationMs: 200000
          },
          playedAt: now,
          sourceType: "top_short_term",
          weight: 0.8
        }
      ]
    });

    const overview = getOverview("30d", "all");
    expect(overview.playCount).toBe(1);
    expect(overview.uniqueTracks).toBe(1);
    expect(overview.uniqueArtists).toBe(1);
    expect(overview.lastSyncAt).not.toBeNull();

    const topTracks = getTopTracks("30d", "all", 10);
    expect(topTracks.length).toBeGreaterThanOrEqual(2);

    const topArtists = getTopArtists("30d", "spotify", 10);
    expect(topArtists.length).toBeGreaterThanOrEqual(2);

    const recent = getRecentActivity("spotify", 10);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.trackName).toBe("Song One");
  });
});
