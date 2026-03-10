import { getDb } from "@/lib/db";
import { rangeStartIso } from "@/lib/range";
import type {
  OverviewResponse,
  ProviderFilter,
  RangeOption,
  TopItemResponse
} from "@/lib/types";

const providerFilterClause = (alias: string, provider: ProviderFilter): string =>
  provider === "all" ? "1=1" : `${alias}.provider = @provider`;

const scoreSources = ["recent", "top_short_term", "heavy_rotation"];

const withProviderParam = <T extends Record<string, unknown>>(
  provider: ProviderFilter,
  params: T
): T | (T & { provider: ProviderFilter }) => {
  if (provider === "all") {
    return params;
  }

  return {
    ...params,
    provider
  };
};

export const getOverview = (range: RangeOption, provider: ProviderFilter): OverviewResponse => {
  const db = getDb();
  const start = rangeStartIso(range);

  const overview = db
    .prepare(
      `
        SELECT
          COUNT(pe.id) AS playCount,
          COUNT(DISTINCT pe.track_id) AS uniqueTracks,
          COUNT(DISTINCT ta.artist_id) AS uniqueArtists
        FROM play_events pe
        LEFT JOIN track_artist ta ON ta.track_id = pe.track_id AND ta.position = 0
        WHERE
          pe.played_at >= @start
          AND pe.source_type = 'recent'
          AND ${providerFilterClause("pe", provider)}
      `
    )
    .get(withProviderParam(provider, { start }) ) as unknown as
    | {
        playCount: number;
        uniqueTracks: number;
        uniqueArtists: number;
      }
    | undefined;

  const lastSyncRow = db
    .prepare(
      `
        SELECT MAX(finished_at) AS lastSyncAt
        FROM snapshot_runs
        WHERE
          status = 'success'
          AND finished_at IS NOT NULL
          AND ${provider === "all" ? "1=1" : "provider = @provider"}
      `
    )
    .get(withProviderParam(provider, {}) ) as unknown as { lastSyncAt: string | null } | undefined;

  return {
    range,
    provider,
    playCount: overview?.playCount ?? 0,
    uniqueArtists: overview?.uniqueArtists ?? 0,
    uniqueTracks: overview?.uniqueTracks ?? 0,
    lastSyncAt: lastSyncRow?.lastSyncAt ?? null
  };
};

export const getTopTracks = (
  range: RangeOption,
  provider: ProviderFilter,
  limit: number
): TopItemResponse[] => {
  const db = getDb();
  const start = rangeStartIso(range);

  const rows = db
    .prepare(
      `
        SELECT
          t.id AS id,
          t.name AS name,
          SUM(pe.weight) AS score,
          SUM(CASE WHEN pe.provider = 'spotify' THEN pe.weight ELSE 0 END) AS spotifyScore,
          SUM(CASE WHEN pe.provider = 'apple' THEN pe.weight ELSE 0 END) AS appleScore
        FROM play_events pe
        INNER JOIN tracks t ON t.id = pe.track_id
        WHERE
          pe.played_at >= @start
          AND pe.source_type IN (${scoreSources.map((source) => `'${source}'`).join(", ")})
          AND ${providerFilterClause("pe", provider)}
        GROUP BY t.id, t.name
        ORDER BY score DESC
        LIMIT @limit
      `
    )
    .all(withProviderParam(provider, { start, limit }) ) as unknown as Array<{
    id: number;
    name: string;
    score: number;
    spotifyScore: number;
    appleScore: number;
  }>;

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    score: Number(row.score.toFixed(3)),
    providerBreakdown: {
      spotify: Number((row.spotifyScore ?? 0).toFixed(3)),
      apple: Number((row.appleScore ?? 0).toFixed(3))
    }
  }));
};

export const getTopArtists = (
  range: RangeOption,
  provider: ProviderFilter,
  limit: number
): TopItemResponse[] => {
  const db = getDb();
  const start = rangeStartIso(range);

  const rows = db
    .prepare(
      `
        SELECT
          a.id AS id,
          a.name AS name,
          SUM(pe.weight) AS score,
          SUM(CASE WHEN pe.provider = 'spotify' THEN pe.weight ELSE 0 END) AS spotifyScore,
          SUM(CASE WHEN pe.provider = 'apple' THEN pe.weight ELSE 0 END) AS appleScore
        FROM play_events pe
        INNER JOIN track_artist ta ON ta.track_id = pe.track_id AND ta.position = 0
        INNER JOIN artists a ON a.id = ta.artist_id
        WHERE
          pe.played_at >= @start
          AND pe.source_type IN (${scoreSources.map((source) => `'${source}'`).join(", ")})
          AND ${providerFilterClause("pe", provider)}
        GROUP BY a.id, a.name
        ORDER BY score DESC
        LIMIT @limit
      `
    )
    .all(withProviderParam(provider, { start, limit }) ) as unknown as Array<{
    id: number;
    name: string;
    score: number;
    spotifyScore: number;
    appleScore: number;
  }>;

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    score: Number(row.score.toFixed(3)),
    providerBreakdown: {
      spotify: Number((row.spotifyScore ?? 0).toFixed(3)),
      apple: Number((row.appleScore ?? 0).toFixed(3))
    }
  }));
};

export const getRecentActivity = (
  provider: ProviderFilter,
  limit: number
): Array<{
  id: string;
  provider: "spotify" | "apple";
  playedAt: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
}> => {
  const db = getDb();

  const rows = db
    .prepare(
      `
        SELECT
          pe.id AS eventId,
          pe.provider AS provider,
          pe.played_at AS playedAt,
          t.name AS trackName,
          t.primary_artist_name AS artistName,
          t.album_name AS albumName
        FROM play_events pe
        INNER JOIN tracks t ON t.id = pe.track_id
        WHERE
          pe.source_type = 'recent'
          AND ${providerFilterClause("pe", provider)}
        ORDER BY pe.played_at DESC
        LIMIT @limit
      `
    )
    .all(withProviderParam(provider, { limit }) ) as unknown as Array<{
    eventId: number;
    provider: "spotify" | "apple";
    playedAt: string;
    trackName: string;
    artistName: string;
    albumName: string | null;
  }>;

  return rows.map((row) => ({
    id: String(row.eventId),
    provider: row.provider,
    playedAt: row.playedAt,
    trackName: row.trackName,
    artistName: row.artistName,
    albumName: row.albumName
  }));
};

