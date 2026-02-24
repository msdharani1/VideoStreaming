# Local Video Streaming (React + Express + SQLite + FFmpeg HLS)

## Folder Structure

```text
root/
  backend/
  frontend/
  storage/
  package.json
  README.md
```

## What this project provides

- React (Vite) frontend with upload and watch pages
- Node.js + Express backend
- SQLite metadata DB via `better-sqlite3`
- Email/password login with role-based access
  - `admin`: upload, edit title, delete
  - `user`: browse and watch only
  - `guest`: browse and watch only (no account)
- FFmpeg HLS transcoding with:
  - 360p, 720p, 1080p renditions
  - configurable segment length (default 6 seconds)
  - generated `master.m3u8`
- JWT-protected stream access (`5 minutes` token)
- Background transcoding using `child_process.spawn` (non-blocking)

## Prerequisites

- Node.js 20+
- npm 10+
- FFmpeg and ffprobe installed and available in PATH
- ngrok CLI installed and authenticated (`ngrok config add-authtoken <token>`)
- cloudflared installed for Cloudflare Tunnel HTTPS (quick tunnel)
- Nginx installed for local high-performance reverse proxy mode

### FFmpeg install notes

- macOS (Homebrew): `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt update && sudo apt install -y ffmpeg`
- Windows (winget): `winget install Gyan.FFmpeg`

## Setup

1. Install dependencies from repo root:

```bash
npm install
```

2. Create backend env file:

```bash
cp backend/.env.example backend/.env
```

3. Optional frontend env (if backend is not `http://localhost:5000`):

```bash
cp frontend/.env.example frontend/.env
```

4. Auth behavior:
- Sign up and sign in are available from `/login`
- "Continue as Guest" is available from `/login` for watch-only access
- `msdharaniofficial@gmail.com` is always treated as `admin` (owner email)
- Optional seeded defaults can be enabled with `SEED_DEFAULT_USERS=true` and configured via:
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
  - `USER_EMAIL`, `USER_PASSWORD`
  - `ADMIN_OWNER_EMAIL`

## Run

### Run backend + frontend together

```bash
npm run dev
```

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`
- App routes:
  - `/login`
  - `/videos` (guest + user + admin)
  - `/admin` (admin only)
  - `/watch/:id` (guest + user + admin)
  - `/process/:id` (admin only)

### Run separately

```bash
npm run dev:backend
npm run dev:frontend
```

### Run with mobile/LAN access

Use the root helper script:

```bash
./run-dev.sh
```

It now runs a full ngrok preview setup:
- starts ngrok for the frontend
- auto-updates `backend/.env` CORS origins (includes current ngrok URL)
- auto-updates `frontend/.env` API/proxy/allowed-host settings
- starts backend + frontend and prints:
  - local frontend URL
  - LAN frontend URL
  - backend health URL
  - ngrok preview URL (share this)

Optional overrides:
- `LAN_IP_OVERRIDE=<your-ip> ./run-dev.sh`
- `SKIP_INSTALL=1 ./run-dev.sh` (skip `npm install` check)

### Run with Cloudflare Tunnel (alternate HTTPS flow)

Use:

```bash
./run-dev-cloudflare.sh
```

It starts backend + frontend on different ports, launches:

```bash
cloudflared tunnel --url http://127.0.0.1:<frontend-port>
```

Then it auto-updates backend/frontend env values, CORS, allowed hosts, and prints the Cloudflare HTTPS preview URL.

### Run with Nginx Accelerator (no cloud)

Use:

```bash
./run-dev-nginx.sh
```

This mode:
- builds frontend as static files
- starts backend on `PORT` (from `backend/.env`)
- starts Nginx on `NGINX_PORT` (default `8080`)
- starts Cloudflare quick tunnel to Nginx and prints HTTPS preview URL
- serves frontend directly from Nginx
- proxies API/media through Nginx with caching tuned for:
  - HLS segments (`.ts/.m4s/.mp4`): long cache
  - thumbnails/timeline frames: medium cache
  - playlists (`.m3u8`): no-cache

Optional overrides:
- `NGINX_PORT=8081 ./run-dev-nginx.sh`
- `PORT=5600 NGINX_PORT=8080 ./run-dev-nginx.sh`
- `SKIP_INSTALL=1 ./run-dev-nginx.sh`
- `ENABLE_CLOUDFLARE=0 ./run-dev-nginx.sh` (disable tunnel and run local/LAN only)

## API

### `POST /upload`

- Form field: `video` (single file)
- Optional form field: `title`
- Returns `202`:

```json
{
  "videoId": "<uuid>",
  "status": "processing",
  "progress": 0,
  "processStep": "Upload completed, starting worker",
  "statusUrl": "http://localhost:5000/upload/<videoId>"
}
```

### `GET /upload/:id`

- Returns current processing progress and step text:

```json
{
  "id": "<videoId>",
  "title": "<title>",
  "status": "processing",
  "progress": 42,
  "processStep": "Transcoding and segmenting HLS",
  "error": null
}
```

### `GET /videos`

- Returns all uploaded videos (ready, processing, failed), including live progress fields:

```json
{
  "videos": [
    {
      "id": "<videoId>",
      "title": "<title>",
      "originalName": "<original file>",
      "status": "processing",
      "progress": 57,
      "processStep": "Transcoding and segmenting HLS",
      "error": null,
      "createdAt": "2026-02-23 23:45:00",
      "thumbnailUrl": "http://localhost:5000/thumbnail/<videoId>"
    }
  ]
}
```

### `GET /video/:id`

- If still processing: `202`
- If ready: `200` with short-lived stream URL

```json
{
  "id": "<videoId>",
  "title": "<title>",
  "status": "ready",
  "thumbnailUrl": "http://localhost:5000/thumbnail/<videoId>",
  "streamUrl": "http://localhost:5000/stream/<videoId>/master.m3u8?token=<jwt>"
}
```

### `GET /thumbnail/:id`

- Returns a JPEG preview frame extracted from a random second of the original video.

### `GET /stream/:videoId/*`

- Token required (`?token=` or `Authorization: Bearer ...`)
- Serves HLS master/variant playlists and segments from:
  - `storage/<videoId>/hls/`

### `DELETE /video/:id`

- Deletes the video metadata and local storage folder:
  - `storage/<videoId>/`
- If processing is active, the worker is terminated first.

## Notes

- Uploaded files are processed asynchronously; server remains responsive.
- Frontend flow: dashboard (header + upload + live videos list) -> processing page (optional) -> watch page.
- Failed transcoding marks upload as failed and clears generated HLS output.
- SQLite file is created at `backend/data/videos.db`.
- Supports large video uploads up to 10GB.
- FFmpeg transcoder maps segment outputs directly to `360p`, `720p`, and `1080p` directories.
- Automatically pads odd resolution dimensions to fix H.264 "height not divisible by 2" encoding errors.
- HLS segment length is configurable via `HLS_SEGMENT_SECONDS` (`backend/.env`, default `6`).
