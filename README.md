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
- FFmpeg HLS transcoding with:
  - 360p, 720p, 1080p renditions
  - 10-second segments
  - generated `master.m3u8`
- JWT-protected stream access (`5 minutes` token)
- Background transcoding using `child_process.spawn` (non-blocking)

## Prerequisites

- Node.js 20+
- npm 10+
- FFmpeg and ffprobe installed and available in PATH

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

## Run

### Run backend + frontend together

```bash
npm run dev
```

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`

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

It binds frontend/backend to LAN hosts, configures CORS for mobile access, and prints the phone URL (same Wi-Fi network).
Default configured LAN IP: `10.134.161.97` (override with `LAN_IP_OVERRIDE` if needed).

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
