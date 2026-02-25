# CloudStream (React + VPS Backend + Firebase RTDB + Cloudflare R2)

## Architecture

- **Frontend**: React (Vite) hosted on **Cloudflare Pages**
- **Backend**: Node.js + Express running on a **VPS**
  - Handles **video upload + FFmpeg processing** only
  - Admin-only actions (upload, delete, title edit, timeline generation)
- **Metadata DB**: **Firebase Realtime Database** (client reads directly)
- **Auth**: **Firebase Auth** (admin allowlist in backend)
- **Storage/CDN**: **Cloudflare R2** (HLS playlists + segments + thumbnails + timeline frames)

## What this project provides

- React frontend with:
  - Firebase Auth login/signup
  - Guest browsing
  - Direct RTDB reads for lists + watch pages
- Backend that:
  - Accepts uploads from admins
  - Transcodes to HLS (360p/720p/1080p)
  - Uploads outputs to R2
  - Writes metadata to Firebase RTDB

## Prerequisites

- Node.js 20+
- npm 10+
- FFmpeg + ffprobe installed on the VPS
- Firebase project with:
  - Realtime Database enabled
  - Email/password Auth enabled
  - Admin service account JSON
- Cloudflare R2 bucket + API keys + public domain/URL

## Setup

### Backend (VPS)

1. Install dependencies:

```bash
npm install
```

2. Create backend env:

```bash
cp backend/.env.example backend/.env
```

3. Fill these required values in `backend/.env`:

- Firebase Admin:
  - `FIREBASE_DATABASE_URL`
  - `FIREBASE_SERVICE_ACCOUNT_JSON` **or** `FIREBASE_SERVICE_ACCOUNT_PATH`
- Admin allowlist:
  - `ADMIN_EMAILS=admin1@example.com,admin2@example.com`
- R2:
  - `R2_ENDPOINT`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET`
  - `R2_PUBLIC_BASE_URL`

4. Run backend:

```bash
npm run dev:backend
```

### Frontend (local + Cloudflare Pages)

1. Create frontend env:

```bash
cp frontend/.env.example frontend/.env
```

2. Fill these required values in `frontend/.env`:

- `VITE_API_BASE_URL` (your VPS backend URL)
- Firebase client config:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_DATABASE_URL`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
- Admin allowlist for UI gating:
  - `VITE_ADMIN_EMAILS=admin1@example.com,admin2@example.com`

3. Run frontend:

```bash
npm run dev:frontend
```

### Cloudflare Pages

Build command:

```bash
npm run build --workspace frontend
```

Output directory:

```
frontend/dist
```

## API (Admin-only, VPS backend)

### `POST /upload`
- Multipart form: `video` (file), optional `title`
- Creates HLS + thumbnail, writes metadata to RTDB

### `POST /upload/normal`
- Multipart form: `video` (file), optional `title`
- Stores a direct MP4 in R2 (browser-native playback)

### `GET /upload/normal/import/files`
- Lists files in `backend/work/normal-import` on the VPS

### `POST /upload/normal/import`
- Body: `{ "fileName": "file.mp4", "title": "optional" }`

### `PATCH /video/:id`
- Body: `{ "title": "New Title" }`

### `DELETE /video/:id`
- Deletes RTDB record + all R2 objects for the video

### `POST /video/:id/timeline/generate`
- Generates timeline frames from the HLS master playlist

### `POST /video/:id/duration/sync`
- Re-probes duration from R2 source

## Firebase RTDB Schema (videos)

Each `videos/<videoId>` record contains:

```json
{
  "id": "uuid",
  "title": "Video Title",
  "originalName": "source.mp4",
  "playbackType": "adaptive" | "normal",
  "status": "processing" | "ready" | "failed",
  "progress": 0,
  "processStep": "...",
  "error": null,
  "durationSec": 0,
  "mimeType": "video/mp4",
  "streamUrl": "https://r2-domain/.../master.m3u8",
  "sourceUrl": "https://r2-domain/.../source.mp4",
  "thumbnailUrl": "https://r2-domain/.../thumbnail.jpg",
  "timeline": {
    "available": false,
    "generating": false,
    "frameCount": 0,
    "maxSecond": 0,
    "durationSec": 0,
    "generatedAt": null,
    "frameUrlPattern": "https://r2-domain/.../frame_{second}.jpg"
  },
  "createdAt": "2026-02-25T00:00:00.000Z",
  "createdAtMs": 0,
  "updatedAt": "2026-02-25T00:00:00.000Z",
  "updatedAtMs": 0
}
```

## Notes

- Frontend reads directly from Firebase RTDB for **cost-efficient real-time updates**.
- Backend is used **only for admin operations** and FFmpeg processing.
- R2 `R2_PUBLIC_BASE_URL` should point to a public bucket URL or custom domain so Cloudflare CDN serves the stream.
