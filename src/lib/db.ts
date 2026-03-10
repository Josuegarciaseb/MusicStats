import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { getServerConfig } from "@/lib/config";

type DatabaseSync = import("node:sqlite").DatabaseSync;

const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => DatabaseSync;
};

export type Database = DatabaseSync;

const isInMemoryDatabase = (databasePath: string): boolean => databasePath.trim() === ":memory:";

const isMalformedDatabaseError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : "";
  const errstr =
    typeof error === "object" && error !== null && "errstr" in error
      ? String((error as { errstr?: unknown }).errstr ?? "")
      : "";

  return (
    message.toLowerCase().includes("database disk image is malformed") ||
    errstr.toLowerCase().includes("database disk image is malformed")
  );
};

const quarantineCorruptedDatabaseFiles = (databasePath: string): void => {
  const resolvedPath = path.resolve(databasePath);
  const suffix = new Date().toISOString().replace(/[:.]/g, "-");

  const candidates = [resolvedPath, `${resolvedPath}-wal`, `${resolvedPath}-shm`];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const quarantined = `${candidate}.corrupt-${suffix}`;
    fs.renameSync(candidate, quarantined);
  }
};

const initSchema = (db: Database): void => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS connections (
      provider TEXT PRIMARY KEY CHECK(provider IN ('spotify', 'apple')),
      encrypted_access_token TEXT,
      encrypted_refresh_token TEXT,
      token_expires_at TEXT,
      encrypted_user_token TEXT,
      scopes TEXT,
      connected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_sync_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_key TEXT NOT NULL UNIQUE,
      isrc TEXT,
      name TEXT NOT NULL,
      primary_artist_name TEXT NOT NULL,
      album_name TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_name TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS track_artist (
      track_id INTEGER NOT NULL,
      artist_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(track_id, artist_id),
      FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
      FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS snapshot_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('spotify', 'apple')),
      status TEXT NOT NULL,
      fetched_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS play_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('spotify', 'apple')),
      track_id INTEGER NOT NULL,
      played_at TEXT NOT NULL,
      source_type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      snapshot_run_id INTEGER,
      raw_event_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(provider, source_type, played_at, track_id),
      FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
      FOREIGN KEY(snapshot_run_id) REFERENCES snapshot_runs(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_play_events_played_at ON play_events(played_at);
    CREATE INDEX IF NOT EXISTS idx_play_events_provider ON play_events(provider);
    CREATE INDEX IF NOT EXISTS idx_snapshot_runs_provider_finished ON snapshot_runs(provider, finished_at);
  `);
};

const ensureDatabaseDirectory = (databasePath: string): void => {
  if (isInMemoryDatabase(databasePath)) {
    return;
  }

  const resolvedPath = path.resolve(databasePath);
  const directory = path.dirname(resolvedPath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

export const createDatabase = (databasePath: string): Database => {
  ensureDatabaseDirectory(databasePath);

  let db: Database | null = null;

  try {
    db = new DatabaseSyncCtor(databasePath);
    initSchema(db);
    return db;
  } catch (error) {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore close errors while recovering
      }
    }

    if (!isInMemoryDatabase(databasePath) && isMalformedDatabaseError(error)) {
      const resolvedPath = path.resolve(databasePath);
      console.warn(
        `[db] Detected malformed SQLite database at ${resolvedPath}. Creating a fresh DB and preserving corrupted files with .corrupt-* suffix.`
      );

      quarantineCorruptedDatabaseFiles(databasePath);

      const recoveredDb = new DatabaseSyncCtor(databasePath);
      initSchema(recoveredDb);
      return recoveredDb;
    }

    throw error;
  }
};

let cachedDb: Database | null = null;

export const getDb = (): Database => {
  if (!cachedDb) {
    cachedDb = createDatabase(getServerConfig().databasePath);
  }

  return cachedDb;
};

export const setDbForTests = (db: Database | null): void => {
  cachedDb = db;
};
