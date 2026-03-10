"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ConnectionsResponse,
  OverviewResponse,
  Provider,
  ProviderFilter,
  RangeOption,
  TopItemResponse
} from "@/lib/types";

type RecentItem = {
  id: string;
  provider: Provider;
  playedAt: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
};

declare global {
  interface Window {
    MusicKit?: {
      configure: (options: {
        developerToken: string;
        app: {
          name: string;
          build: string;
        };
      }) => void;
      getInstance: () => {
        authorize: () => Promise<string>;
      };
    };
  }
}

const RANGE_OPTIONS: RangeOption[] = ["7d", "30d", "90d"];
const PROVIDER_OPTIONS: ProviderFilter[] = ["all", "spotify", "apple"];

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
};

const loadAppleMusicKitScript = async (): Promise<void> => {
  if (window.MusicKit) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load MusicKit script."));

    document.head.appendChild(script);
  });
};

export default function Dashboard({ initialMessage }: { initialMessage: string }) {
  const [range, setRange] = useState<RangeOption>("30d");
  const [provider, setProvider] = useState<ProviderFilter>("all");

  const [connections, setConnections] = useState<ConnectionsResponse | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [topTracks, setTopTracks] = useState<TopItemResponse[]>([]);
  const [topArtists, setTopArtists] = useState<TopItemResponse[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [activeSync, setActiveSync] = useState<Provider | null>(null);
  const [message, setMessage] = useState(initialMessage);

  const refreshDashboard = useCallback(async () => {
    setIsLoading(true);

    try {
      const [connectionsPayload, overviewPayload, topTracksPayload, topArtistsPayload, recentPayload] =
        await Promise.all([
          fetchJson<ConnectionsResponse>("/api/connections"),
          fetchJson<OverviewResponse>(`/api/stats/overview?range=${range}&provider=${provider}`),
          fetchJson<{ items: TopItemResponse[] }>(
            `/api/stats/top-tracks?range=${range}&provider=${provider}&limit=15`
          ),
          fetchJson<{ items: TopItemResponse[] }>(
            `/api/stats/top-artists?range=${range}&provider=${provider}&limit=15`
          ),
          fetchJson<{ items: RecentItem[] }>(`/api/stats/recent?provider=${provider}&limit=25`)
        ]);

      setConnections(connectionsPayload);
      setOverview(overviewPayload);
      setTopTracks(topTracksPayload.items);
      setTopArtists(topArtistsPayload.items);
      setRecent(recentPayload.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to refresh dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, [provider, range]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const connectSpotify = async () => {
    try {
      const payload = await fetchJson<{ url: string }>("/api/auth/spotify/start", {
        method: "POST"
      });

      window.location.href = payload.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Spotify connection failed.");
    }
  };

  const connectAppleMusic = async () => {
    try {
      setMessage("");
      const payload = await fetchJson<{
        developerToken: string;
        app: { name: string; build: string };
      }>("/api/auth/apple/developer-token");

      await loadAppleMusicKitScript();

      if (!window.MusicKit) {
        throw new Error("MusicKit did not initialize correctly.");
      }

      window.MusicKit.configure({
        developerToken: payload.developerToken,
        app: payload.app
      });

      const musicUserToken = await window.MusicKit.getInstance().authorize();

      await fetchJson<{ ok: true }>("/api/auth/apple/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ musicUserToken })
      });

      setMessage("Apple Music connected successfully.");
      await refreshDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Apple Music connection failed.");
    }
  };

  const syncProvider = async (target: Provider) => {
    try {
      setActiveSync(target);
      const response = await fetchJson<{ warnings?: string[] }>(`/api/sync/${target}`, {
        method: "POST"
      });

      if (response.warnings && response.warnings.length > 0) {
        setMessage(`Sync completed with warnings: ${response.warnings.join(" | ")}`);
      } else {
        setMessage(`${target === "spotify" ? "Spotify" : "Apple Music"} synced successfully.`);
      }

      await refreshDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setActiveSync(null);
    }
  };

  const syncDisabled = useMemo(() => {
    if (!connections) {
      return { spotify: true, apple: true };
    }

    return {
      spotify: !connections.spotify.connected,
      apple: !connections.apple.connected
    };
  }, [connections]);

  return (
    <main>
      <h1>MusicStats Dashboard</h1>
      <p>
        Local personal analytics for Spotify and Apple Music. Data stays on your machine and uses
        official APIs.
      </p>

      {message ? <div className={`notice ${message.includes("failed") ? "error" : ""}`}>{message}</div> : null}

      <section className="grid cols-2" style={{ marginTop: "1rem" }}>
        <article className="panel">
          <div className="panel-title">
            <h2>Connections</h2>
            <span className="badge">Single-user</span>
          </div>

          <div className="grid cols-2">
            <div className="panel">
              <div className="panel-title">
                <strong>Spotify</strong>
                <span className={`badge ${connections?.spotify.connected ? "ok" : "warn"}`}>
                  {connections?.spotify.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="row">
                <button onClick={connectSpotify}>Connect Spotify</button>
                <button
                  className="secondary"
                  disabled={syncDisabled.spotify || activeSync === "spotify"}
                  onClick={() => void syncProvider("spotify")}
                >
                  {activeSync === "spotify" ? "Syncing..." : "Sync Spotify"}
                </button>
              </div>
              <p className="small mono">
                Last sync: {connections?.spotify.lastSyncAt || "never"}
                {connections?.spotify.lastError ? ` | Error: ${connections.spotify.lastError}` : ""}
              </p>
            </div>

            <div className="panel">
              <div className="panel-title">
                <strong>Apple Music</strong>
                <span className={`badge ${connections?.apple.connected ? "ok" : "warn"}`}>
                  {connections?.apple.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="row">
                <button onClick={() => void connectAppleMusic()}>Connect Apple</button>
                <button
                  className="secondary"
                  disabled={syncDisabled.apple || activeSync === "apple"}
                  onClick={() => void syncProvider("apple")}
                >
                  {activeSync === "apple" ? "Syncing..." : "Sync Apple"}
                </button>
              </div>
              <p className="small mono">
                Last sync: {connections?.apple.lastSyncAt || "never"}
                {connections?.apple.lastError ? ` | Error: ${connections.apple.lastError}` : ""}
              </p>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <h2>Filters</h2>
            <span className="badge">Timezone: America/Mexico_City</span>
          </div>
          <div className="row" style={{ marginBottom: "0.8rem" }}>
            <label htmlFor="range">Range</label>
            <select id="range" value={range} onChange={(event) => setRange(event.target.value as RangeOption)}>
              {RANGE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value as ProviderFilter)}
            >
              {PROVIDER_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button className="secondary" onClick={() => void refreshDashboard()} disabled={isLoading}>
              Refresh
            </button>
          </div>
        </article>
      </section>

      <section className="grid cols-3" style={{ marginTop: "1rem" }}>
        <article className="panel">
          <div className="metric-value">{overview?.playCount ?? 0}</div>
          <div className="metric-sub">Recent plays</div>
        </article>
        <article className="panel">
          <div className="metric-value">{overview?.uniqueTracks ?? 0}</div>
          <div className="metric-sub">Unique tracks</div>
        </article>
        <article className="panel">
          <div className="metric-value">{overview?.uniqueArtists ?? 0}</div>
          <div className="metric-sub">Unique artists</div>
        </article>
      </section>

      <section className="grid cols-2" style={{ marginTop: "1rem" }}>
        <article className="panel">
          <div className="panel-title">
            <h2>Top Tracks</h2>
            <span className="badge">Weighted score</span>
          </div>

          <ul className="list">
            {topTracks.map((item) => (
              <li key={item.id}>
                <div className="list-title">
                  <strong>{item.name}</strong>
                  <span className="mono">{item.score.toFixed(3)}</span>
                </div>
                <div className="list-sub mono">
                  spotify: {item.providerBreakdown.spotify.toFixed(3)} | apple: {item.providerBreakdown.apple.toFixed(3)}
                </div>
              </li>
            ))}
            {topTracks.length === 0 ? <li>No data yet. Connect and run sync.</li> : null}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-title">
            <h2>Top Artists</h2>
            <span className="badge">Primary artist</span>
          </div>

          <ul className="list">
            {topArtists.map((item) => (
              <li key={item.id}>
                <div className="list-title">
                  <strong>{item.name}</strong>
                  <span className="mono">{item.score.toFixed(3)}</span>
                </div>
                <div className="list-sub mono">
                  spotify: {item.providerBreakdown.spotify.toFixed(3)} | apple: {item.providerBreakdown.apple.toFixed(3)}
                </div>
              </li>
            ))}
            {topArtists.length === 0 ? <li>No data yet. Connect and run sync.</li> : null}
          </ul>
        </article>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <div className="panel-title">
          <h2>Recent Activity</h2>
          <span className="badge">Real playback events</span>
        </div>

        <ul className="list">
          {recent.map((item) => (
            <li key={item.id}>
              <div className="list-title">
                <strong>
                  {item.trackName} - {item.artistName}
                </strong>
                <span className={`badge ${item.provider === "spotify" ? "ok" : "warn"}`}>{item.provider}</span>
              </div>
              <div className="list-sub mono">
                {item.playedAt}
                {item.albumName ? ` | ${item.albumName}` : ""}
              </div>
            </li>
          ))}
          {recent.length === 0 ? <li>No recent events yet.</li> : null}
        </ul>
      </section>

      <p className="footer-note">
        Transparency note: top metrics are not perfectly equivalent across providers. Spotify uses
        recent + top data, while Apple Music uses recent + heavy rotation signals from official APIs.
      </p>
    </main>
  );
}
