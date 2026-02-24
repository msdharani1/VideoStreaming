const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const mime = require('mime-types');
const { STORAGE_DIR, TMP_DIR } = require('../config');
const { tokenAuth } = require('../middleware/tokenAuth');
const { createVideo, deleteVideo, getVideoById, listVideos, updateVideoProgress } = require('../db');
const { signStreamToken } = require('../services/tokenService');
const { createRandomThumbnail, transcodeToHls } = require('../services/transcoder');

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) {
      return cb(null, true);
    }

    return cb(new Error('Only video files are allowed'));
  }
});

const router = express.Router();
const activeJobs = new Map();

function appendTokenToPlaylist(playlist, token) {
  return playlist
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      if (trimmed.includes('token=')) {
        return line;
      }

      const separator = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${separator}token=${encodeURIComponent(token)}`;
    })
    .join('\n');
}

function sanitizeRelativePath(relativePath) {
  const normalized = path.normalize(relativePath || 'master.m3u8').replace(/^([.][.][/\\])+/, '');
  if (normalized.includes('..')) {
    return null;
  }

  return normalized;
}

function createProgressWriter(videoId) {
  let lastProgress = -1;
  let lastStep = '';
  let lastUpdatedAt = 0;

  return ({ progress, step, status = 'processing', errorMessage = null, force = false }) => {
    const normalizedProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
    const now = Date.now();

    const shouldPersist =
      force ||
      normalizedProgress !== lastProgress ||
      step !== lastStep ||
      now - lastUpdatedAt >= 1000;

    if (!shouldPersist) {
      return;
    }

    updateVideoProgress({
      id: videoId,
      status,
      progress: normalizedProgress,
      processStep: step,
      errorMessage
    });

    lastProgress = normalizedProgress;
    lastStep = step;
    lastUpdatedAt = now;
  };
}

async function processUpload(videoId, tempFilePath, hlsDir, thumbnailPath, jobState) {
  const writeProgress = createProgressWriter(videoId);

  try {
    writeProgress({ progress: 2, step: 'Queued for processing', force: true });

    let mediaDurationSec = 0;

    await transcodeToHls({
      inputPath: tempFilePath,
      outputDir: hlsDir,
      videoId,
      onProbe: ({ durationSec }) => {
        mediaDurationSec = durationSec;
      },
      shouldCancel: () => jobState.deleted,
      onSpawn: (ffmpegProcess) => {
        jobState.ffmpeg = ffmpegProcess;
      },
      onProgress: ({ percent, step }) => {
        writeProgress({ progress: percent, step });
      }
    });

    if (!jobState.deleted) {
      try {
        writeProgress({ progress: 99, step: 'Generating thumbnail preview' });
        await createRandomThumbnail({
          inputPath: tempFilePath,
          outputPath: thumbnailPath,
          durationSec: mediaDurationSec
        });
      } catch (thumbnailError) {
        console.warn(`[video:${videoId}] thumbnail generation failed`, thumbnailError.message);
      }

      writeProgress({ progress: 100, step: 'Ready to stream', status: 'ready', force: true });
      console.log(`[video:${videoId}] processing complete`);
    }
  } catch (error) {
    if (jobState.deleted) {
      console.log(`[video:${videoId}] processing canceled by delete request`);
    } else {
      console.error(`[video:${videoId}] processing failed`, error);
      writeProgress({
        progress: 0,
        step: 'Processing failed',
        status: 'failed',
        errorMessage: error.message,
        force: true
      });
      fs.rmSync(path.join(STORAGE_DIR, videoId, 'hls'), { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempFilePath, { force: true });
    activeJobs.delete(videoId);
  }
}

router.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'video file is required' });
  }

  const videoId = crypto.randomUUID();
  const title = (req.body && req.body.title ? String(req.body.title) : req.file.originalname).trim();
  const safeTitle = title || req.file.originalname;
  const videoDir = path.join(STORAGE_DIR, videoId);
  const hlsDir = path.join(videoDir, 'hls');
  const thumbnailPath = path.join(videoDir, 'thumbnail.jpg');

  fs.mkdirSync(hlsDir, { recursive: true });

  createVideo({
    id: videoId,
    title: safeTitle,
    original_name: req.file.originalname,
    status: 'processing',
    progress: 0,
    process_step: 'Upload completed, starting worker',
    error_message: null
  });

  const jobState = {
    ffmpeg: null,
    deleted: false
  };
  activeJobs.set(videoId, jobState);

  processUpload(videoId, req.file.path, hlsDir, thumbnailPath, jobState);

  return res.status(202).json({
    videoId,
    status: 'processing',
    progress: 0,
    processStep: 'Upload completed, starting worker',
    statusUrl: `${req.protocol}://${req.get('host')}/upload/${videoId}`
  });
});

router.get('/upload/:id', (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);

  if (!video) {
    return res.status(404).json({ error: 'upload not found' });
  }

  return res.json({
    id: video.id,
    title: video.title,
    status: video.status,
    progress: video.progress,
    processStep: video.process_step,
    error: video.error_message,
    createdAt: video.created_at,
    thumbnailUrl: `${req.protocol}://${req.get('host')}/thumbnail/${video.id}`
  });
});

router.get('/videos', (req, res) => {
  const videos = listVideos().map((video) => ({
    id: video.id,
    title: video.title,
    originalName: video.original_name,
    status: video.status,
    progress: video.progress,
    processStep: video.process_step,
    error: video.error_message,
    createdAt: video.created_at,
    thumbnailUrl: `${req.protocol}://${req.get('host')}/thumbnail/${video.id}`
  }));

  return res.json({
    videos
  });
});

router.delete('/video/:id', (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);

  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  const jobState = activeJobs.get(id);
  if (jobState) {
    jobState.deleted = true;
    if (jobState.ffmpeg && !jobState.ffmpeg.killed) {
      jobState.ffmpeg.kill('SIGTERM');
    }
  }

  fs.rmSync(path.join(STORAGE_DIR, id), { recursive: true, force: true });
  deleteVideo(id);

  return res.json({
    deleted: true,
    id
  });
});

router.get('/video/:id', (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);

  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  if (video.status !== 'ready') {
    return res.status(202).json({
      id: video.id,
      title: video.title,
      status: video.status,
      progress: video.progress,
      processStep: video.process_step,
      error: video.error_message,
      thumbnailUrl: `${req.protocol}://${req.get('host')}/thumbnail/${video.id}`
    });
  }

  const token = signStreamToken(video.id);
  const streamUrl = `${req.protocol}://${req.get('host')}/stream/${video.id}/master.m3u8?token=${token}`;

  return res.json({
    id: video.id,
    title: video.title,
    status: video.status,
    thumbnailUrl: `${req.protocol}://${req.get('host')}/thumbnail/${video.id}`,
    streamUrl
  });
});

router.get('/thumbnail/:id', (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);
  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  const thumbnailPath = path.resolve(path.join(STORAGE_DIR, id, 'thumbnail.jpg'));
  if (!thumbnailPath.startsWith(path.resolve(STORAGE_DIR))) {
    return res.status(400).json({ error: 'invalid path' });
  }

  if (!fs.existsSync(thumbnailPath)) {
    return res.status(404).json({ error: 'thumbnail not ready' });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'image/jpeg');
  return res.sendFile(thumbnailPath);
});

router.get('/stream/:videoId/*', tokenAuth, (req, res) => {
  const { videoId } = req.params;

  if (req.auth.videoId !== videoId) {
    return res.status(403).json({ error: 'token does not match requested video' });
  }

  const requested = sanitizeRelativePath(req.params[0]);
  if (!requested) {
    return res.status(400).json({ error: 'invalid path' });
  }

  const baseDir = path.resolve(path.join(STORAGE_DIR, videoId, 'hls'));
  const filePath = path.resolve(path.join(baseDir, requested));

  if (!filePath.startsWith(baseDir)) {
    return res.status(400).json({ error: 'invalid path' });
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'file not found' });
  }

  if (filePath.endsWith('.m3u8')) {
    const playlist = fs.readFileSync(filePath, 'utf8');
    const withToken = appendTokenToPlaylist(playlist, req.token);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(withToken);
  }

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  return res.sendFile(filePath);
});

module.exports = router;
