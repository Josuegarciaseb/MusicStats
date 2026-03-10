export type Provider = "spotify" | "apple";
export type ProviderFilter = Provider | "all";
export type RangeOption = "7d" | "30d" | "90d";

export interface CanonicalTrack {
  id: number;
  provider: Provider;
  providerTrackId: string;
  isrc?: string | null;
  name: string;
  artistNames: string[];
  albumName?: string | null;
  durationMs: number;
}

export interface PlayEvent {
  provider: Provider;
  canonicalTrackId: number;
  playedAt: string;
  sourceType: "recent" | "top_short_term" | "heavy_rotation";
  weight: number;
}

export type SyncRunStatus = "success" | "failed";

export interface OverviewResponse {
  range: RangeOption;
  provider: ProviderFilter;
  playCount: number;
  uniqueArtists: number;
  uniqueTracks: number;
  lastSyncAt: string | null;
}

export interface TopItemResponse {
  id: string;
  name: string;
  score: number;
  providerBreakdown: {
    spotify: number;
    apple: number;
  };
}

export interface SyncResponse {
  provider: Provider;
  status: SyncRunStatus;
  fetched: number;
  inserted: number;
  updated: number;
  startedAt: string;
  finishedAt: string;
  warnings: string[];
}

export interface ConnectionSummary {
  provider: Provider;
  connected: boolean;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface ConnectionsResponse {
  spotify: ConnectionSummary;
  apple: ConnectionSummary;
}
