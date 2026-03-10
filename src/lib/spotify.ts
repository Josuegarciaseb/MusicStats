import { ApiError } from "@/lib/errors";
import { getServerConfig } from "@/lib/config";

const SPOTIFY_AUTH_BASE = "https://accounts.spotify.com";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = ["user-read-recently-played", "user-top-read"];

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SpotifyTrackSignal {
  providerTrackId: string;
  isrc: string | null;
  name: string;
  artistNames: string[];
  albumName: string | null;
  durationMs: number;
  playedAt?: string;
  rawEventId?: string;
}

const encodeBasicAuth = (username: string, password: string): string => {
  return Buffer.from(`${username}:${password}`).toString("base64");
};

const parseResponseError = async (response: Response): Promise<string> => {
  const text = await response.text();

  if (!text) {
    return `Spotify request failed (${response.status})`;
  }

  try {
    const json = JSON.parse(text) as { error_description?: string; error?: { message?: string } };
    return json.error_description || json.error?.message || text;
  } catch {
    return text;
  }
};

export const buildSpotifyAuthorizationUrl = (state: string): string => {
  const config = getServerConfig();
  const params = new URLSearchParams({
    client_id: config.spotifyClientId,
    response_type: "code",
    redirect_uri: config.spotifyRedirectUri,
    scope: SPOTIFY_SCOPES.join(" "),
    state,
    show_dialog: "false"
  });

  return `${SPOTIFY_AUTH_BASE}/authorize?${params.toString()}`;
};

export const exchangeSpotifyCode = async (code: string): Promise<SpotifyTokenResponse> => {
  const config = getServerConfig();
  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.spotifyRedirectUri
  });

  const response = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeBasicAuth(config.spotifyClientId, config.spotifyClientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload
  });

  if (!response.ok) {
    throw new ApiError(await parseResponseError(response), response.status);
  }

  return (await response.json()) as SpotifyTokenResponse;
};

export const refreshSpotifyToken = async (
  refreshToken: string
): Promise<Pick<SpotifyTokenResponse, "access_token" | "scope" | "expires_in" | "refresh_token">> => {
  const config = getServerConfig();
  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeBasicAuth(config.spotifyClientId, config.spotifyClientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload
  });

  if (!response.ok) {
    throw new ApiError(await parseResponseError(response), response.status);
  }

  return (await response.json()) as Pick<
    SpotifyTokenResponse,
    "access_token" | "scope" | "expires_in" | "refresh_token"
  >;
};

const spotifyApiGet = async <T>(
  accessToken: string,
  path: string,
  params?: Record<string, string>
): Promise<T> => {
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new ApiError(await parseResponseError(response), response.status);
  }

  return (await response.json()) as T;
};

const mapSpotifyTrack = (track: {
  id?: string;
  name?: string;
  duration_ms?: number;
  album?: { name?: string };
  artists?: { name?: string }[];
  external_ids?: { isrc?: string };
}): SpotifyTrackSignal => {
  return {
    providerTrackId: track.id || "unknown",
    isrc: track.external_ids?.isrc?.trim() || null,
    name: track.name || "Unknown Track",
    artistNames: (track.artists ?? []).map((artist) => artist.name || "Unknown Artist"),
    albumName: track.album?.name || null,
    durationMs: track.duration_ms ?? 0
  };
};

export const fetchSpotifyRecentlyPlayed = async (
  accessToken: string,
  limit = 50
): Promise<SpotifyTrackSignal[]> => {
  const payload = await spotifyApiGet<{
    items?: Array<{
      played_at?: string;
      track?: {
        id?: string;
        name?: string;
        duration_ms?: number;
        album?: { name?: string };
        artists?: { name?: string }[];
        external_ids?: { isrc?: string };
      };
    }>;
  }>(accessToken, "/me/player/recently-played", { limit: String(limit) });

  return (payload.items ?? [])
    .filter((item) => item.track)
    .map((item) => {
      const mapped = mapSpotifyTrack(item.track || {});
      return {
        ...mapped,
        playedAt: item.played_at || new Date().toISOString(),
        rawEventId: `${mapped.providerTrackId}:${item.played_at || "unknown"}`
      };
    });
};

export const fetchSpotifyTopTracks = async (
  accessToken: string,
  limit = 50
): Promise<SpotifyTrackSignal[]> => {
  const payload = await spotifyApiGet<{
    items?: Array<{
      id?: string;
      name?: string;
      duration_ms?: number;
      album?: { name?: string };
      artists?: { name?: string }[];
      external_ids?: { isrc?: string };
    }>;
  }>(accessToken, "/me/top/tracks", { time_range: "short_term", limit: String(limit) });

  return (payload.items ?? []).map((track) => mapSpotifyTrack(track));
};
