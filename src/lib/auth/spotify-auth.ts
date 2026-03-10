import { ensureProviderConfigured } from "@/lib/config";
import { createOAuthState, validateOAuthState } from "@/lib/oauth-state";
import {
  buildSpotifyAuthorizationUrl,
  exchangeSpotifyCode,
  refreshSpotifyToken
} from "@/lib/spotify";
import {
  getSpotifyTokens,
  saveSpotifyConnection
} from "@/lib/connections";
import { ApiError } from "@/lib/errors";

export const startSpotifyAuthorization = (): string => {
  ensureProviderConfigured("spotify");

  const state = createOAuthState("spotify");
  return buildSpotifyAuthorizationUrl(state);
};

export const completeSpotifyAuthorization = async (params: {
  code: string;
  state: string;
}): Promise<void> => {
  ensureProviderConfigured("spotify");

  const isValidState = validateOAuthState(params.state, "spotify");

  if (!isValidState) {
    throw new ApiError("Spotify OAuth state is invalid or expired.", 400);
  }

  const tokens = await exchangeSpotifyCode(params.code);

  if (!tokens.refresh_token) {
    throw new ApiError("Spotify did not return a refresh token.", 400);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  saveSpotifyConnection({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    scopes: tokens.scope
  });
};

export const getValidSpotifyAccessToken = async (): Promise<string> => {
  const current = getSpotifyTokens();

  if (!current?.accessToken || !current.refreshToken) {
    throw new ApiError("Spotify is not connected. Complete authorization first.", 401);
  }

  const expiresAtMs = current.expiresAt ? Date.parse(current.expiresAt) : Number.NaN;
  const shouldRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() <= 60_000;

  if (!shouldRefresh) {
    return current.accessToken;
  }

  const refreshed = await refreshSpotifyToken(current.refreshToken);
  const accessToken = refreshed.access_token;
  const refreshToken = refreshed.refresh_token || current.refreshToken;
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  saveSpotifyConnection({
    accessToken,
    refreshToken,
    expiresAt,
    scopes: refreshed.scope || current.scopes
  });

  return accessToken;
};
