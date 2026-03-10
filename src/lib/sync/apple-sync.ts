import { createAppleDeveloperToken, fetchAppleHeavyRotation, fetchAppleRecentPlayedTracks } from "@/lib/apple";
import { getDb } from "@/lib/db";
import { getAppleMusicUserToken, updateConnectionSyncState } from "@/lib/connections";
import { asErrorMessage, ApiError } from "@/lib/errors";
import { finishSnapshotRun, persistPlaySignals, startSnapshotRun } from "@/lib/sync/store";
import type { PlayEventInput } from "@/lib/sync/normalize";
import type { SyncResponse } from "@/lib/types";

export const syncApple = async (): Promise<SyncResponse> => {
  const provider = "apple" as const;
  const db = getDb();
  const startedAt = new Date().toISOString();
  const snapshotRunId = startSnapshotRun(db, provider, startedAt);
  const warnings: string[] = [];

  try {
    const musicUserToken = getAppleMusicUserToken();

    if (!musicUserToken) {
      throw new ApiError("Apple Music is not connected. Authorize MusicKit first.", 401);
    }

    const developerToken = createAppleDeveloperToken();

    const [recentResult, heavyRotationResult] = await Promise.allSettled([
      fetchAppleRecentPlayedTracks(developerToken, musicUserToken, 25),
      fetchAppleHeavyRotation(developerToken, musicUserToken, 25)
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
      warnings.push(
        `Apple Music recently played unavailable: ${asErrorMessage(recentResult.reason)}`
      );
    }

    if (heavyRotationResult.status === "fulfilled") {
      fetched += heavyRotationResult.value.length;

      heavyRotationResult.value.forEach((item, index) => {
        const playedAt = new Date(Date.parse(startedAt) - index * 1000).toISOString();
        const weight = Number(
          ((heavyRotationResult.value.length - index) / heavyRotationResult.value.length).toFixed(3)
        );

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
          sourceType: "heavy_rotation",
          weight,
          rawEventId: `${item.providerTrackId}:heavy:${index}`
        });
      });
    } else {
      warnings.push(
        `Apple Music heavy rotation unavailable: ${asErrorMessage(heavyRotationResult.reason)}`
      );
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
