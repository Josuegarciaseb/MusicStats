import type { Database } from "@/lib/db";
import {
  canonicalKeyForTrack,
  normalizeArtistName,
  sanitizeTrackInput,
  type PlayEventInput
} from "@/lib/sync/normalize";
import type { Provider, SyncRunStatus } from "@/lib/types";

export const startSnapshotRun = (db: Database, provider: Provider, startedAt: string): number => {
  const result = db
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
          created_at
        )
        VALUES (?, 'running', 0, 0, 0, '[]', ?, ?)
      `
    )
    .run(provider, startedAt, startedAt);

  return Number(result.lastInsertRowid);
};

export const finishSnapshotRun = (
  db: Database,
  input: {
    runId: number;
    status: SyncRunStatus;
    fetched: number;
    inserted: number;
    updated: number;
    warnings: string[];
    errorMessage?: string;
    finishedAt: string;
  }
): void => {
  db.prepare(
    `
      UPDATE snapshot_runs
      SET
        status = ?,
        fetched_count = ?,
        inserted_count = ?,
        updated_count = ?,
        warnings_json = ?,
        error_message = ?,
        finished_at = ?
      WHERE id = ?
    `
  ).run(
    input.status,
    input.fetched,
    input.inserted,
    input.updated,
    JSON.stringify(input.warnings),
    input.errorMessage ?? null,
    input.finishedAt,
    input.runId
  );
};

const upsertTrack = (db: Database, event: PlayEventInput): { trackId: number; inserted: boolean; updated: boolean } => {
  const track = sanitizeTrackInput(event.track);
  const canonicalKey = canonicalKeyForTrack(track);
  const now = new Date().toISOString();

  const existing = db
    .prepare(
      `
        SELECT id, isrc, name, primary_artist_name, album_name, duration_ms
        FROM tracks
        WHERE canonical_key = ?
      `
    )
    .get(canonicalKey ) as unknown as
    | {
        id: number;
        isrc: string | null;
        name: string;
        primary_artist_name: string;
        album_name: string | null;
        duration_ms: number;
      }
    | undefined;

  let trackId: number;
  let inserted = false;
  let updated = false;

  if (!existing) {
    const insertResult = db
      .prepare(
        `
          INSERT INTO tracks (
            canonical_key,
            isrc,
            name,
            primary_artist_name,
            album_name,
            duration_ms,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        canonicalKey,
        (track.isrc ?? null),
        track.name,
        track.artistNames[0],
        (track.albumName ?? null),
        track.durationMs,
        now,
        now
      );

    trackId = Number(insertResult.lastInsertRowid);
    inserted = true;
  } else {
    trackId = existing.id;

    const requiresUpdate =
      (existing.isrc ?? null) !== ((track.isrc ?? null) ?? null) ||
      existing.name !== track.name ||
      existing.primary_artist_name !== track.artistNames[0] ||
      (existing.album_name ?? null) !== ((track.albumName ?? null) ?? null) ||
      existing.duration_ms !== track.durationMs;

    if (requiresUpdate) {
      db.prepare(
        `
          UPDATE tracks
          SET
            isrc = ?,
            name = ?,
            primary_artist_name = ?,
            album_name = ?,
            duration_ms = ?,
            updated_at = ?
          WHERE id = ?
        `
      ).run(
        (track.isrc ?? null),
        track.name,
        track.artistNames[0],
        (track.albumName ?? null),
        track.durationMs,
        now,
        trackId
      );

      updated = true;
    }
  }

  track.artistNames.forEach((artistName, position) => {
    const normalized = normalizeArtistName(artistName);

    db.prepare(
      `
        INSERT INTO artists (normalized_name, name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(normalized_name) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `
    ).run(normalized, artistName, now, now);

    const artist = db
      .prepare(`SELECT id FROM artists WHERE normalized_name = ?`)
      .get(normalized ) as unknown as { id: number } | undefined;

    if (!artist) {
      return;
    }

    db.prepare(
      `
        INSERT OR IGNORE INTO track_artist (track_id, artist_id, position)
        VALUES (?, ?, ?)
      `
    ).run(trackId, artist.id, position);
  });

  return { trackId, inserted, updated };
};

const insertPlayEvent = (
  db: Database,
  input: {
    provider: Provider;
    trackId: number;
    playedAt: string;
    sourceType: PlayEventInput["sourceType"];
    weight: number;
    snapshotRunId: number;
    rawEventId?: string;
  }
): boolean => {
  const result = db
    .prepare(
      `
        INSERT INTO play_events (
          provider,
          track_id,
          played_at,
          source_type,
          weight,
          snapshot_run_id,
          raw_event_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, source_type, played_at, track_id) DO NOTHING
      `
    )
    .run(
      input.provider,
      input.trackId,
      input.playedAt,
      input.sourceType,
      input.weight,
      input.snapshotRunId,
      input.rawEventId ?? null,
      new Date().toISOString()
    );

  return result.changes > 0;
};

export const persistPlaySignals = (
  db: Database,
  input: {
    snapshotRunId: number;
    events: PlayEventInput[];
  }
): { inserted: number; updated: number } => {
  const insertedTracks = new Set<number>();
  const updatedTracks = new Set<number>();
  let insertedEvents = 0;

  db.exec("BEGIN");

  try {
    for (const event of input.events) {
      const trackResult = upsertTrack(db, event);

      if (trackResult.inserted) {
        insertedTracks.add(trackResult.trackId);
      }

      if (trackResult.updated) {
        updatedTracks.add(trackResult.trackId);
      }

      const inserted = insertPlayEvent(db, {
        provider: event.provider,
        trackId: trackResult.trackId,
        playedAt: event.playedAt,
        sourceType: event.sourceType,
        weight: event.weight,
        snapshotRunId: input.snapshotRunId,
        rawEventId: event.rawEventId
      });

      if (inserted) {
        insertedEvents += 1;
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    inserted: insertedEvents + insertedTracks.size,
    updated: updatedTracks.size
  };
};


