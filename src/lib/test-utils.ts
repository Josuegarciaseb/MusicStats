import { generateKeyPairSync } from "node:crypto";

let cachedPrivateKey: string | null = null;

export const ensureTestEnv = (): void => {
  if (!cachedPrivateKey) {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1"
    });

    cachedPrivateKey = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  }

  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_PATH = ":memory:";
  process.env.APP_ENCRYPTION_KEY = "test-local-encryption-key-for-musicstats";
  process.env.SPOTIFY_CLIENT_ID = "spotify-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "spotify-client-secret";
  process.env.SPOTIFY_REDIRECT_URI = "http://localhost:3000/api/auth/spotify/callback";
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY1234567";
  process.env.APPLE_PRIVATE_KEY = cachedPrivateKey;
};
