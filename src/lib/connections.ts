import { decryptValue, encryptValue } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import type { ConnectionsResponse, Provider } from "@/lib/types";

interface RawConnectionRow {
  provider: Provider;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  encrypted_user_token: string | null;
  scopes: string | null;
  connected_at: string;
  updated_at: string;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface SpotifyConnectionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scopes: string | null;
}

export const getConnectionRow = (provider: Provider): RawConnectionRow | null => {
  const row = getDb()
    .prepare(
      `
        SELECT
          provider,
          encrypted_access_token,
          encrypted_refresh_token,
          token_expires_at,
          encrypted_user_token,
          scopes,
          connected_at,
          updated_at,
          last_sync_at,
          last_error
        FROM connections
        WHERE provider = ?
      `
    )
    .get(provider) as unknown as RawConnectionRow | undefined;

  return row ?? null;
};

export const saveSpotifyConnection = (input: {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scopes: string | null;
}): void => {
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `
        INSERT INTO connections (
          provider,
          encrypted_access_token,
          encrypted_refresh_token,
          token_expires_at,
          scopes,
          connected_at,
          updated_at,
          last_error
        )
        VALUES ('spotify', ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(provider) DO UPDATE SET
          encrypted_access_token = excluded.encrypted_access_token,
          encrypted_refresh_token = excluded.encrypted_refresh_token,
          token_expires_at = excluded.token_expires_at,
          scopes = excluded.scopes,
          updated_at = excluded.updated_at,
          last_error = NULL
      `
    )
    .run(
      encryptValue(input.accessToken),
      encryptValue(input.refreshToken),
      input.expiresAt,
      input.scopes,
      now,
      now
    );
};

export const saveAppleConnection = (musicUserToken: string): void => {
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `
        INSERT INTO connections (
          provider,
          encrypted_user_token,
          connected_at,
          updated_at,
          last_error
        )
        VALUES ('apple', ?, ?, ?, NULL)
        ON CONFLICT(provider) DO UPDATE SET
          encrypted_user_token = excluded.encrypted_user_token,
          updated_at = excluded.updated_at,
          last_error = NULL
      `
    )
    .run(encryptValue(musicUserToken), now, now);
};

export const updateConnectionSyncState = (input: {
  provider: Provider;
  lastSyncAt?: string;
  lastError?: string | null;
}): void => {
  const now = new Date().toISOString();
  const row = getConnectionRow(input.provider);

  if (!row) {
    return;
  }

  getDb()
    .prepare(
      `
        UPDATE connections
        SET
          last_sync_at = COALESCE(?, last_sync_at),
          last_error = ?,
          updated_at = ?
        WHERE provider = ?
      `
    )
    .run(input.lastSyncAt ?? null, input.lastError ?? null, now, input.provider);
};

export const getSpotifyTokens = (): SpotifyConnectionTokens | null => {
  const row = getConnectionRow("spotify");

  if (!row?.encrypted_access_token || !row.encrypted_refresh_token) {
    return null;
  }

  return {
    accessToken: decryptValue(row.encrypted_access_token) ?? "",
    refreshToken: decryptValue(row.encrypted_refresh_token) ?? "",
    expiresAt: row.token_expires_at,
    scopes: row.scopes
  };
};

export const getAppleMusicUserToken = (): string | null => {
  const row = getConnectionRow("apple");
  return decryptValue(row?.encrypted_user_token ?? null);
};

export const listConnections = (): ConnectionsResponse => {
  const rows = getDb()
    .prepare(
      `
        SELECT
          provider,
          encrypted_access_token,
          encrypted_refresh_token,
          token_expires_at,
          encrypted_user_token,
          scopes,
          connected_at,
          updated_at,
          last_sync_at,
          last_error
        FROM connections
      `
    )
    .all() as unknown as RawConnectionRow[];

  const base: ConnectionsResponse = {
    spotify: {
      provider: "spotify",
      connected: false,
      connectedAt: null,
      lastSyncAt: null,
      lastError: null
    },
    apple: {
      provider: "apple",
      connected: false,
      connectedAt: null,
      lastSyncAt: null,
      lastError: null
    }
  };

  for (const row of rows) {
    if (row.provider === "spotify") {
      base.spotify = {
        provider: "spotify",
        connected: Boolean(row.encrypted_access_token),
        connectedAt: row.connected_at,
        lastSyncAt: row.last_sync_at,
        lastError: row.last_error
      };
      continue;
    }

    base.apple = {
      provider: "apple",
      connected: Boolean(row.encrypted_user_token),
      connectedAt: row.connected_at,
      lastSyncAt: row.last_sync_at,
      lastError: row.last_error
    };
  }

  return base;
};

