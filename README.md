# MusicStats MVP (Spotify + Apple Music)

Local personal dashboard for Spotify and Apple Music statistics using official APIs.

## Quick start

1. Copy `.env.example` to `.env` and fill credentials.
2. Install dependencies:
   `npm install`
3. Run development server:
   `npm run dev`
4. Open `http://localhost:3000`.

## Required credentials

- Spotify app: Client ID, Client Secret, Redirect URI.
- Apple Developer: Team ID, Key ID, private key (`.p8`) for MusicKit Developer Token.

## Notes

- All data is stored locally in SQLite (`DATABASE_PATH`).
- No telemetry, no monetization, no multi-user support in this MVP.
- Differences between providers are shown in the UI.
