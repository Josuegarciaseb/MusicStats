import { getDb } from "@/lib/db";
import { updateConnectionSyncState } from "@/lib/connections";
import { asErrorMessage } from "@/lib/errors";
import { getValidSpotifyAccessToken } from "@/lib/auth/spotify-auth";
import { fetchSpotifyRecentlyPlayed, fetchSpotifyTopTracks } from "@/lib/spotify";
import type { SyncResponse } from "@/lib/types";
import { finishSnapshotRun, persistPlaySignals, startSnapshotRun } from "@/lib/sync/store";
import type { PlayEventInput } from "@/lib/sync/normalize";

export const syncSpotify = async (): Promise<SyncResponse> => {
  const provider = "spotify" as const;
  const db = getDb();
  const startedAt = new Date().toISOString();
  const snapshotRunId = startSnapshotRun(db, provider, startedAt);
  const warnings: string[] = [];

  try {
    const accessToken = await getValidSpotifyAccessToken();

    const [recentResult, topResult] = await Promise.allSettled([
      fetchSpotifyRecentlyPlayed(accessToken, 50),
      fetchSpotifyTopTracks(accessToken, 50)
    ]);

    const events: PlayEventInput[] = [];
    let fetched = 0;

    if (recentResult.status === "fulfilled") {
      fetched += recentResult.value.length;

      for (const item of recentResult.value) {
        events.push({
          provider,
          track: {
            provider,
            providerTrackId: item.providerTrackId,
            isrc: item.isrc,
            name: item.name,
            artistNames: item.artistNames,
            albumName: item.albumName,
            durationMs: item.durationMs
          },
          playedAt: item.playedAt || new Date().toISOString(),
          sourceType: "recent",
          weight: 1,
          rawEventId: item.rawEventId
        });
      }
    } else {
      warnings.push(`Spotify recent playback unavailable: ${asErrorMessage(recentResult.reason)}`);
    }

    if (topResult.status === "fulfilled") {
      fetched += topResult.value.length;

      topResult.value.forEach((item, index) => {
        const playedAt = new Date(Date.parse(startedAt) - index * 1000).toISOString();
        const weight = Number(((topResult.value.length - index) / topResult.value.length).toFixed(3));

        events.push({
          provider,
          track: {
            provider,
            providerTrackId: item.providerTrackId,
            isrc: item.isrc,
            name: item.name,
            artistNames: item.artistNames,
            albumName: item.albumName,
            durationMs: item.durationMs
          },
          playedAt,
          sourceType: "top_short_term",
          weight,
          rawEventId: `${item.providerTrackId}:top:${index}`
        });
      });
    } else {
      warnings.push(`Spotify top tracks unavailable: ${asErrorMessage(topResult.reason)}`);
    }

    const persisted = persistPlaySignals(db, {
      snapshotRunId,
      events
    });

    const finishedAt = new Date().toISOString();

    finishSnapshotRun(db, {
      runId: snapshotRunId,
      status: "success",
      fetched,
      inserted: persisted.inserted,
      updated: persisted.updated,
      warnings,
      finishedAt
    });

    updateConnectionSyncState({
      provider,
      lastSyncAt: finishedAt,
      lastError: warnings.length > 0 ? warnings.join(" | ") : null
    });

    return {
      provider,
      status: "success",
      fetched,
      inserted: persisted.inserted,
      updated: persisted.updated,
      startedAt,
      finishedAt,
      warnings
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = asErrorMessage(error);

    finishSnapshotRun(db, {
      runId: snapshotRunId,
      status: "failed",
      fetched: 0,
      inserted: 0,
      updated: 0,
      warnings,
      errorMessage: message,
      finishedAt
    });

    updateConnectionSyncState({
      provider,
      lastError: message
    });

    throw error;
  }
};
