import jwt from "jsonwebtoken";

import { ApiError } from "@/lib/errors";
import { getServerConfig } from "@/lib/config";

const APPLE_API_BASE = "https://api.music.apple.com/v1";

export interface AppleTrackSignal {
  providerTrackId: string;
  isrc: string | null;
  name: string;
  artistNames: string[];
  albumName: string | null;
  durationMs: number;
  playedAt?: string;
  rawEventId?: string;
}

const parseResponseError = async (response: Response): Promise<string> => {
  const text = await response.text();

  if (!text) {
    return `Apple Music request failed (${response.status})`;
  }

  try {
    const json = JSON.parse(text) as { errors?: Array<{ detail?: string; title?: string }> };
    return json.errors?.[0]?.detail || json.errors?.[0]?.title || text;
  } catch {
    return text;
  }
};

export const createAppleDeveloperToken = (): string => {
  const config = getServerConfig();

  const token = jwt.sign({}, config.applePrivateKey, {
    algorithm: "ES256",
    issuer: config.appleTeamId,
    expiresIn: "30d",
    header: {
      alg: "ES256",
      kid: config.appleKeyId,
      typ: "JWT"
    }
  });

  return token;
};

const appleMusicGet = async <T>(
  developerToken: string,
  userToken: string,
  path: string,
  params?: Record<string, string>
): Promise<T> => {
  const url = new URL(`${APPLE_API_BASE}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${developerToken}`,
      "Music-User-Token": userToken
    }
  });

  if (!response.ok) {
    throw new ApiError(await parseResponseError(response), response.status);
  }

  return (await response.json()) as T;
};

const mapAppleTrack = (item: {
  id?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
    lastPlayedDate?: string;
  };
  relationships?: {
    artists?: {
      data?: Array<{
        attributes?: {
          name?: string;
        };
      }>;
    };
  };
}): AppleTrackSignal => {
  const relationshipArtists =
    item.relationships?.artists?.data
      ?.map((artist) => artist.attributes?.name)
      .filter((name): name is string => Boolean(name)) ?? [];

  const fallbackArtist = item.attributes?.artistName?.trim();

  const artistNames =
    relationshipArtists.length > 0
      ? relationshipArtists
      : fallbackArtist
      ? [fallbackArtist]
      : ["Unknown Artist"];

  return {
    providerTrackId: item.id || "unknown",
    isrc: item.attributes?.isrc?.trim() || null,
    name: item.attributes?.name || "Unknown Track",
    artistNames,
    albumName: item.attributes?.albumName || null,
    durationMs: item.attributes?.durationInMillis ?? 0,
    playedAt: item.attributes?.lastPlayedDate,
    rawEventId: item.id
  };
};

export const fetchAppleRecentPlayedTracks = async (
  developerToken: string,
  userToken: string,
  limit = 25
): Promise<AppleTrackSignal[]> => {
  const payload = await appleMusicGet<{
    data?: Array<{
      id?: string;
      attributes?: {
        name?: string;
        artistName?: string;
        albumName?: string;
        durationInMillis?: number;
        isrc?: string;
        lastPlayedDate?: string;
      };
      relationships?: {
        artists?: {
          data?: Array<{
            attributes?: {
              name?: string;
            };
          }>;
        };
      };
    }>;
  }>(developerToken, userToken, "/me/recent/played/tracks", {
    limit: String(limit)
  });

  return (payload.data ?? []).map((item, index) => {
    const mapped = mapAppleTrack(item);

    if (!mapped.playedAt) {
      mapped.playedAt = new Date(Date.now() - index * 60_000).toISOString();
    }

    mapped.rawEventId = mapped.rawEventId || `${mapped.providerTrackId}:${mapped.playedAt}`;
    return mapped;
  });
};

export const fetchAppleHeavyRotation = async (
  developerToken: string,
  userToken: string,
  limit = 25
): Promise<AppleTrackSignal[]> => {
  const payload = await appleMusicGet<{
    data?: Array<{
      id?: string;
      attributes?: {
        name?: string;
        artistName?: string;
        albumName?: string;
        durationInMillis?: number;
        isrc?: string;
      };
      relationships?: {
        artists?: {
          data?: Array<{
            attributes?: {
              name?: string;
            };
          }>;
        };
      };
    }>;
  }>(developerToken, userToken, "/me/history/heavy-rotation", {
    limit: String(limit)
  });

  return (payload.data ?? []).map((item) => mapAppleTrack(item));
};
