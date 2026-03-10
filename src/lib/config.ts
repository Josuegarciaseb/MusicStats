import type { Provider } from "@/lib/types";

export interface ServerConfig {
  appBaseUrl: string;
  databasePath: string;
  appEncryptionKey: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
  spotifyRedirectUri: string;
  appleTeamId: string;
  appleKeyId: string;
  applePrivateKey: string;
  defaultTimezone: string;
  oauthStateTtlMinutes: number;
}

const loadServerConfig = (): ServerConfig => {
  const env = process.env;
  const isProduction = env.NODE_ENV === "production";

  const appBaseUrl = env.APP_BASE_URL?.trim() || "http://localhost:3000";
  const appEncryptionKey = env.APP_ENCRYPTION_KEY?.trim() || "dev-only-change-me";

  if (!env.APP_BASE_URL?.trim()) {
    console.warn("[config] APP_BASE_URL is missing; using default http://localhost:3000");
  }

  if (!env.APP_ENCRYPTION_KEY?.trim()) {
    if (isProduction) {
      throw new Error(
        "APP_ENCRYPTION_KEY is required in production. Set it in your environment before starting the app."
      );
    }

    console.warn("[config] APP_ENCRYPTION_KEY is missing; using local development fallback key.");
  }

  const pickOptional = (key: string) => env[key]?.trim() || "";

  return {
    appBaseUrl,
    databasePath: env.DATABASE_PATH?.trim() || "./data/musicstats.sqlite",
    appEncryptionKey,
    spotifyClientId: pickOptional("SPOTIFY_CLIENT_ID"),
    spotifyClientSecret: pickOptional("SPOTIFY_CLIENT_SECRET"),
    spotifyRedirectUri: pickOptional("SPOTIFY_REDIRECT_URI"),
    appleTeamId: pickOptional("APPLE_TEAM_ID"),
    appleKeyId: pickOptional("APPLE_KEY_ID"),
    applePrivateKey: pickOptional("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    defaultTimezone: "America/Mexico_City",
    oauthStateTtlMinutes: 10
  };
};

let cachedConfig: ServerConfig | null = null;

export const getServerConfig = (): ServerConfig => {
  if (!cachedConfig) {
    cachedConfig = loadServerConfig();
  }

  return cachedConfig;
};

export const ensureProviderConfigured = (provider: Provider): void => {
  const config = getServerConfig();

  if (provider === "spotify") {
    if (!config.spotifyClientId || !config.spotifyClientSecret || !config.spotifyRedirectUri) {
      throw new Error(
        "Spotify credentials are missing. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REDIRECT_URI in .env."
      );
    }

    return;
  }

  if (!config.appleTeamId || !config.appleKeyId || !config.applePrivateKey) {
    throw new Error(
      "Apple Music credentials are missing. Set APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY in .env."
    );
  }
};
