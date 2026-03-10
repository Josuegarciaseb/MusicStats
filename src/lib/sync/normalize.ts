import type { Provider } from "@/lib/types";

export interface CanonicalTrackInput {
  provider: Provider;
  providerTrackId: string;
  isrc?: string | null;
  name: string;
  artistNames: string[];
  albumName?: string | null;
  durationMs: number;
}

export interface PlayEventInput {
  provider: Provider;
  track: CanonicalTrackInput;
  playedAt: string;
  sourceType: "recent" | "top_short_term" | "heavy_rotation";
  weight: number;
  rawEventId?: string;
}

const normalizeText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const canonicalKeyForTrack = (track: CanonicalTrackInput): string => {
  const isrc = track.isrc?.trim().toLowerCase();

  if (isrc) {
    return `isrc:${isrc}`;
  }

  const artist = normalizeText(track.artistNames[0] ?? "unknown");
  const title = normalizeText(track.name);
  const durationBucket = Math.round((track.durationMs || 0) / 1000);

  return `fallback:${title}|${artist}|${durationBucket}`;
};

export const sanitizeTrackInput = (track: CanonicalTrackInput): CanonicalTrackInput => {
  const artistNames = track.artistNames.map((artist) => artist.trim()).filter(Boolean);

  return {
    provider: track.provider,
    providerTrackId: track.providerTrackId || `unknown-${Date.now()}`,
    isrc: track.isrc?.trim() || null,
    name: track.name.trim() || "Unknown Track",
    artistNames: artistNames.length > 0 ? artistNames : ["Unknown Artist"],
    albumName: track.albumName?.trim() || null,
    durationMs: Number.isFinite(track.durationMs) ? Math.max(0, Math.floor(track.durationMs)) : 0
  };
};

export const normalizeArtistName = (name: string): string => normalizeText(name);
