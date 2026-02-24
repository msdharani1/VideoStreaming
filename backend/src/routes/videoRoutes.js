const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const mime = require('mime-types');
const { AUTH_TOKEN_EXPIRES_IN, STORAGE_DIR, TMP_DIR } = require('../config');
const { tokenAuth } = require('../middleware/tokenAuth');
const { requireRole } = require('../middleware/userAuth');
const {
  createVideo,
  deleteVideo,
  getVideoById,
  listVideos,
  setVideoDuration,
  updateVideoProgress,
  updateVideoTitle
} = require('../db');
const { signStreamToken } = require('../services/tokenService');
const {
  createRandomThumbnail,
  generateTimelineFrames,
  probeMedia,
  transcodeToBrowserMp4,
  transcodeToHls
} = require('../services/transcoder');

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(STORAGE_DIR, { recursive: true });
const NORMAL_IMPORT_DIR = path.join(STORAGE_DIR, 'normal-import');
fs.mkdirSync(NORMAL_IMPORT_DIR, { recursive: true });

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
const activeTimelineJobs = new Map();
const activeNormalCompatJobs = new Map();

function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  if (typeof value !== 'string') {
    return '';
  }
  return value.split(',')[0].trim();
}

function resolvePublicBaseUrl(req) {
  const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']).toLowerCase();
  const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || req.get('host') || 'localhost';

  let protocol = forwardedProto || req.protocol || 'http';

  // Tunnel domains terminate TLS publicly; force https for generated links.
  if (protocol === 'http' && /(?:^|\.)(ngrok-free\.app|ngrok\.app|trycloudflare\.com)$/i.test(host)) {
    protocol = 'https';
  }

  return `${protocol}://${host}`;
}

function buildAbsoluteUrl(req, pathName) {
  return `${resolvePublicBaseUrl(req)}${pathName}`;
}

function buildThumbnailUrlIfExists(req, videoId) {
  const thumbnailPath = path.resolve(path.join(STORAGE_DIR, videoId, 'thumbnail.jpg'));
  if (!thumbnailPath.startsWith(path.resolve(STORAGE_DIR))) {
    return null;
  }
  if (!fs.existsSync(thumbnailPath)) {
    return null;
  }
  return buildAbsoluteUrl(req, `/thumbnail/${videoId}`);
}

function getTimelineDir(videoId) {
  return path.join(STORAGE_DIR, videoId, 'timeline');
}

function getTimelineMetaPath(videoId) {
  return path.join(getTimelineDir(videoId), 'meta.json');
}

function getTimelineBuildDir(videoId) {
  return path.join(STORAGE_DIR, videoId, `timeline_build_${Date.now()}`);
}

function readTimelineMeta(videoId) {
  const filePath = getTimelineMetaPath(videoId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const frameCount = Number(parsed?.frameCount) || 0;
    const durationSec = Number(parsed?.durationSec) || 0;
    const generatedAt = parsed?.generatedAt || null;
    if (frameCount <= 0) {
      return null;
    }

    return {
      frameCount,
      durationSec,
      generatedAt
    };
  } catch {
    return null;
  }
}

function buildTimelinePayload(req, videoId) {
  const meta = readTimelineMeta(videoId);
  const generating = activeTimelineJobs.has(videoId);
  const available = Boolean(meta?.frameCount);
  const frameCount = meta?.frameCount || 0;
  const maxSecond = Math.max(0, frameCount - 1);

  return {
    available,
    generating,
    frameCount,
    maxSecond,
    durationSec: meta?.durationSec || 0,
    generatedAt: meta?.generatedAt || null,
    frameUrlPattern: available ? buildAbsoluteUrl(req, `/timeline/${videoId}/{second}.jpg`) : null
  };
}

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

function normalizePlaybackType(playbackType) {
  return playbackType === 'normal' ? 'normal' : 'adaptive';
}

function isNormalPlayback(video) {
  return normalizePlaybackType(video?.playback_type) === 'normal';
}

function getVideoRoot(videoId) {
  return path.resolve(path.join(STORAGE_DIR, videoId));
}

function resolveNormalSourcePath(video) {
  const rawRelativePath = typeof video?.storage_path === 'string' ? video.storage_path.trim() : '';
  if (!rawRelativePath) {
    return null;
  }

  const relativePath = sanitizeRelativePath(rawRelativePath);
  if (!relativePath) {
    return null;
  }

  const baseDir = getVideoRoot(video.id);
  const filePath = path.resolve(path.join(baseDir, relativePath));
  if (!filePath.startsWith(baseDir)) {
    return null;
  }

  return filePath;
}

function inferUploadExtension(file) {
  const extFromName = path.extname(file?.originalname || '').toLowerCase();
  if (extFromName && /^[.][a-z0-9]{1,10}$/i.test(extFromName)) {
    return extFromName;
  }

  const extFromMime = mime.extension(file?.mimetype || '');
  if (extFromMime) {
    return `.${String(extFromMime).toLowerCase()}`;
  }

  return '.mp4';
}

function isSimpleFileName(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  const trimmed = name.trim();
  return Boolean(trimmed) && trimmed === path.basename(trimmed) && !trimmed.includes('..');
}

function isLikelyVideoFile(fileName) {
  const mimeType = mime.lookup(fileName);
  if (typeof mimeType === 'string' && mimeType.startsWith('video/')) {
    return true;
  }
  return /\.(mp4|mov|m4v|webm|mkv|avi|wmv|flv|mpg|mpeg|m3u8)$/i.test(fileName);
}

function isBrowserFriendlyCodec({ videoCodec, audioCodec }) {
  const normalizedVideo = String(videoCodec || '').toLowerCase();
  const normalizedAudio = String(audioCodec || '').toLowerCase();
  const videoSupported = normalizedVideo === 'h264';
  const audioSupported = !normalizedAudio || normalizedAudio === 'aac' || normalizedAudio === 'mp3';
  return videoSupported && audioSupported;
}

function queueNormalVideoMetadataJob({ videoId, sourcePath, thumbnailPath, forceCompatibilityCheck = false }) {
  if (activeNormalCompatJobs.has(videoId)) {
    return;
  }

  activeNormalCompatJobs.set(videoId, { startedAt: Date.now() });

  (async () => {
    let durationSec = 0;
    try {
      updateVideoProgress({
        id: videoId,
        status: 'processing',
        progress: 10,
        processStep: 'Analyzing normal video source',
        errorMessage: null
      });

      let probeResult = await probeMedia(sourcePath);
      durationSec = Number(probeResult?.durationSec) || 0;
      if (durationSec > 0) {
        setVideoDuration(videoId, durationSec);
      }

      const shouldTranscode = forceCompatibilityCheck || !isBrowserFriendlyCodec(probeResult);
      if (shouldTranscode) {
        const tempOutputPath = `${sourcePath}.compat.mp4`;
        updateVideoProgress({
          id: videoId,
          status: 'processing',
          progress: 40,
          processStep: 'Converting to browser-compatible MP4',
          errorMessage: null
        });

        try {
          fs.rmSync(tempOutputPath, { force: true });
          await transcodeToBrowserMp4({
            inputPath: sourcePath,
            outputPath: tempOutputPath,
            videoId
          });
          fs.renameSync(tempOutputPath, sourcePath);
          probeResult = await probeMedia(sourcePath);
          durationSec = Number(probeResult?.durationSec) || durationSec;
          if (durationSec > 0) {
            setVideoDuration(videoId, durationSec);
          }
        } catch (transcodeError) {
          fs.rmSync(tempOutputPath, { force: true });
          console.warn(`[video:${videoId}] compatibility transcode failed`, transcodeError.message);
        }
      }

      updateVideoProgress({
        id: videoId,
        status: 'processing',
        progress: 85,
        processStep: 'Generating thumbnail preview',
        errorMessage: null
      });
    } catch (probeError) {
      console.warn(`[video:${videoId}] duration probe failed for normal upload`, probeError.message);
    }

    try {
      await createRandomThumbnail({
        inputPath: sourcePath,
        outputPath: thumbnailPath,
        durationSec
      });
    } catch (thumbnailError) {
      console.warn(`[video:${videoId}] thumbnail generation failed`, thumbnailError.message);
    } finally {
      updateVideoProgress({
        id: videoId,
        status: 'ready',
        progress: 100,
        processStep: 'Ready for normal playback',
        errorMessage: null
      });
      activeNormalCompatJobs.delete(videoId);
    }
  })();
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
        setVideoDuration(videoId, durationSec);
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

router.post('/upload', requireRole('admin'), upload.single('video'), async (req, res) => {
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
    playback_type: 'adaptive',
    storage_path: null,
    mime_type: null,
    status: 'processing',
    progress: 0,
    process_step: 'Upload completed, starting worker',
    error_message: null,
    duration_sec: null
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
    statusUrl: buildAbsoluteUrl(req, `/upload/${videoId}`)
  });
});

router.post('/upload/normal', requireRole('admin'), upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'video file is required' });
  }

  const videoId = crypto.randomUUID();
  const title = (req.body && req.body.title ? String(req.body.title) : req.file.originalname).trim();
  const safeTitle = title || req.file.originalname;
  const videoDir = path.join(STORAGE_DIR, videoId);
  const normalDir = path.join(videoDir, 'normal');
  const thumbnailPath = path.join(videoDir, 'thumbnail.jpg');
  const extension = inferUploadExtension(req.file);
  const sourceFileName = `source${extension}`;
  const sourceRelativePath = path.posix.join('normal', sourceFileName);
  const sourcePath = path.join(normalDir, sourceFileName);

  try {
    fs.mkdirSync(normalDir, { recursive: true });
    fs.renameSync(req.file.path, sourcePath);

    createVideo({
      id: videoId,
      title: safeTitle,
      original_name: req.file.originalname,
      playback_type: 'normal',
      storage_path: sourceRelativePath,
      mime_type: req.file.mimetype || mime.lookup(sourcePath) || 'video/mp4',
      status: 'processing',
      progress: 10,
      process_step: 'Analyzing normal video source',
      error_message: null,
      duration_sec: null
    });

    const payload = {
      videoId,
      status: 'processing',
      playbackType: 'normal',
      processStep: 'Analyzing normal video source'
    };

    // Respond immediately for normal uploads; probe/thumbnail run in background.
    res.status(202).json(payload);

    queueNormalVideoMetadataJob({
      videoId,
      sourcePath,
      thumbnailPath
    });

    return;
  } catch (error) {
    fs.rmSync(req.file.path, { force: true });
    fs.rmSync(videoDir, { recursive: true, force: true });
    console.error(`[video:${videoId}] normal upload failed`, error);
    return res.status(500).json({ error: error.message || 'normal upload failed' });
  }
});

router.get('/upload/normal/import/files', requireRole('admin'), (req, res) => {
  try {
    const files = fs
      .readdirSync(NORMAL_IMPORT_DIR)
      .filter((name) => isSimpleFileName(name) && isLikelyVideoFile(name))
      .map((name) => {
        const absolutePath = path.join(NORMAL_IMPORT_DIR, name);
        const stats = fs.statSync(absolutePath);
        if (!stats.isFile()) {
          return null;
        }
        return {
          name,
          size: stats.size,
          modifiedAt: new Date(stats.mtimeMs || Date.now()).toISOString()
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));

    return res.json({ files });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'could not list import files' });
  }
});

router.post('/upload/normal/import', requireRole('admin'), (req, res) => {
  const fileName = String(req.body?.fileName || '').trim();
  if (!isSimpleFileName(fileName)) {
    return res.status(400).json({ error: 'valid fileName is required' });
  }
  if (!isLikelyVideoFile(fileName)) {
    return res.status(400).json({ error: 'file does not look like a supported video format' });
  }

  const importPath = path.resolve(path.join(NORMAL_IMPORT_DIR, fileName));
  if (!importPath.startsWith(path.resolve(NORMAL_IMPORT_DIR))) {
    return res.status(400).json({ error: 'invalid file path' });
  }
  if (!fs.existsSync(importPath) || !fs.statSync(importPath).isFile()) {
    return res.status(404).json({ error: 'import file not found' });
  }

  const videoId = crypto.randomUUID();
  const defaultTitle = path.parse(fileName).name || fileName;
  const title = String(req.body?.title || '').trim() || defaultTitle;
  const videoDir = path.join(STORAGE_DIR, videoId);
  const normalDir = path.join(videoDir, 'normal');
  const thumbnailPath = path.join(videoDir, 'thumbnail.jpg');
  const extension = path.extname(fileName).toLowerCase() || '.mp4';
  const sourceFileName = `source${extension}`;
  const sourceRelativePath = path.posix.join('normal', sourceFileName);
  const sourcePath = path.join(normalDir, sourceFileName);

  try {
    fs.mkdirSync(normalDir, { recursive: true });
    fs.renameSync(importPath, sourcePath);

    createVideo({
      id: videoId,
      title,
      original_name: fileName,
      playback_type: 'normal',
      storage_path: sourceRelativePath,
      mime_type: mime.lookup(sourcePath) || 'video/mp4',
      status: 'processing',
      progress: 10,
      process_step: 'Analyzing normal video source',
      error_message: null,
      duration_sec: null
    });

    const payload = {
      videoId,
      status: 'processing',
      playbackType: 'normal',
      processStep: 'Analyzing normal video source'
    };

    res.status(202).json(payload);

    queueNormalVideoMetadataJob({
      videoId,
      sourcePath,
      thumbnailPath
    });

    return;
  } catch (error) {
    fs.rmSync(videoDir, { recursive: true, force: true });
    return res.status(500).json({ error: error.message || 'normal import failed' });
  }
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
    playbackType: normalizePlaybackType(video.playback_type),
    status: video.status,
    progress: video.progress,
    processStep: video.process_step,
    error: video.error_message,
    durationSec: Number(video.duration_sec) || 0,
    createdAt: video.created_at,
    thumbnailUrl: buildThumbnailUrlIfExists(req, video.id)
  });
});

router.get('/videos', (req, res) => {
  const videos = listVideos().map((video) => ({
    id: video.id,
    title: video.title,
    originalName: video.original_name,
    playbackType: normalizePlaybackType(video.playback_type),
    status: video.status,
    progress: video.progress,
    processStep: video.process_step,
    error: video.error_message,
    durationSec: Number(video.duration_sec) || 0,
    createdAt: video.created_at,
    thumbnailUrl: buildThumbnailUrlIfExists(req, video.id),
    timeline: isNormalPlayback(video) ? null : buildTimelinePayload(req, video.id)
  }));

  return res.json({
    videos
  });
});

router.delete('/video/:id', requireRole('admin'), (req, res) => {
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

  const timelineJobState = activeTimelineJobs.get(id);
  if (timelineJobState) {
    timelineJobState.canceled = true;
    if (timelineJobState.ffmpeg && !timelineJobState.ffmpeg.killed) {
      timelineJobState.ffmpeg.kill('SIGTERM');
    }
    activeTimelineJobs.delete(id);
  }

  fs.rmSync(path.join(STORAGE_DIR, id), { recursive: true, force: true });
  deleteVideo(id);

  return res.json({
    deleted: true,
    id
  });
});

router.patch('/video/:id', requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);

  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  const title = String(req.body?.title || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  updateVideoTitle(id, title);
  return res.json({
    updated: true,
    id,
    title
  });
});

router.post('/video/:id/duration/sync', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);

  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  const isNormalVideo = isNormalPlayback(video);
  const mediaPath = isNormalVideo
    ? resolveNormalSourcePath(video)
    : path.join(STORAGE_DIR, id, 'hls', 'master.m3u8');

  if (!mediaPath || !fs.existsSync(mediaPath)) {
    return res.status(404).json({
      error: isNormalVideo
        ? 'normal source file not found for this video'
        : 'hls playlist not found for this video'
    });
  }

  try {
    const { durationSec } = await probeMedia(mediaPath);
    const normalizedDuration = Number(durationSec);

    if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
      return res.status(422).json({ error: 'could not determine duration for this video' });
    }

    setVideoDuration(id, normalizedDuration);
    return res.json({
      updated: true,
      id,
      durationSec: normalizedDuration
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'duration probe failed'
    });
  }
});

router.get('/video/:id', (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);
  const playbackType = normalizePlaybackType(video?.playback_type);

  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  if (video.status !== 'ready') {
    return res.status(202).json({
      id: video.id,
      title: video.title,
      playbackType,
      status: video.status,
      progress: video.progress,
      processStep: video.process_step,
      error: video.error_message,
      durationSec: Number(video.duration_sec) || 0,
      thumbnailUrl: buildThumbnailUrlIfExists(req, video.id),
      timeline: playbackType === 'adaptive' ? buildTimelinePayload(req, video.id) : null
    });
  }

  const token = playbackType === 'normal'
    ? signStreamToken(video.id, AUTH_TOKEN_EXPIRES_IN)
    : signStreamToken(video.id);
  const streamUrl = playbackType === 'normal'
    ? buildAbsoluteUrl(req, `/normal-stream/${video.id}?token=${token}`)
    : buildAbsoluteUrl(req, `/stream/${video.id}/master.m3u8?token=${token}`);

  return res.json({
    id: video.id,
    title: video.title,
    playbackType,
    status: video.status,
    durationSec: Number(video.duration_sec) || 0,
    mimeType: playbackType === 'normal' ? (video.mime_type || null) : null,
    thumbnailUrl: buildThumbnailUrlIfExists(req, video.id),
    streamUrl,
    timeline: playbackType === 'adaptive' ? buildTimelinePayload(req, video.id) : null
  });
});

router.get('/video/:id/normal', async (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);

  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  if (!isNormalPlayback(video)) {
    return res.status(409).json({ error: 'video is not configured for normal playback' });
  }

  if (video.status !== 'ready') {
    return res.status(202).json({
      id: video.id,
      title: video.title,
      playbackType: 'normal',
      status: video.status,
      progress: video.progress,
      processStep: video.process_step,
      error: video.error_message,
      durationSec: Number(video.duration_sec) || 0,
      thumbnailUrl: buildThumbnailUrlIfExists(req, video.id)
    });
  }

  const sourcePath = resolveNormalSourcePath(video);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'normal source file not found' });
  }

  if (activeNormalCompatJobs.has(id)) {
    return res.status(202).json({
      id: video.id,
      title: video.title,
      playbackType: 'normal',
      status: 'processing',
      progress: 50,
      processStep: 'Converting to browser-compatible MP4',
      error: null,
      durationSec: Number(video.duration_sec) || 0,
      thumbnailUrl: buildThumbnailUrlIfExists(req, video.id)
    });
  }

  try {
    const probeResult = await probeMedia(sourcePath);
    if (!isBrowserFriendlyCodec(probeResult)) {
      updateVideoProgress({
        id,
        status: 'processing',
        progress: 15,
        processStep: 'Converting to browser-compatible MP4',
        errorMessage: null
      });

      queueNormalVideoMetadataJob({
        videoId: id,
        sourcePath,
        thumbnailPath: path.join(STORAGE_DIR, id, 'thumbnail.jpg'),
        forceCompatibilityCheck: true
      });

      return res.status(202).json({
        id: video.id,
        title: video.title,
        playbackType: 'normal',
        status: 'processing',
        progress: 15,
        processStep: 'Converting to browser-compatible MP4',
        error: null,
        durationSec: Number(video.duration_sec) || 0,
        thumbnailUrl: buildThumbnailUrlIfExists(req, video.id)
      });
    }
  } catch (probeError) {
    console.warn(`[video:${id}] normal probe failed`, probeError.message);
  }

  const token = signStreamToken(video.id, AUTH_TOKEN_EXPIRES_IN);
  const sourceUrl = buildAbsoluteUrl(req, `/normal-stream/${video.id}?token=${token}`);

  return res.json({
    id: video.id,
    title: video.title,
    playbackType: 'normal',
    status: video.status,
    durationSec: Number(video.duration_sec) || 0,
    mimeType: video.mime_type || null,
    thumbnailUrl: buildThumbnailUrlIfExists(req, video.id),
    sourceUrl
  });
});

router.post('/video/:id/timeline/generate', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const video = getVideoById(id);

  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  if (isNormalPlayback(video)) {
    return res.status(409).json({ error: 'timeline generation is only supported for adaptive videos' });
  }

  if (video.status !== 'ready') {
    return res.status(409).json({ error: 'video is not ready for timeline generation' });
  }

  if (activeTimelineJobs.has(id)) {
    return res.status(202).json({
      started: false,
      message: 'timeline generation already running',
      timeline: buildTimelinePayload(req, id)
    });
  }

  const masterPlaylistPath = path.join(STORAGE_DIR, id, 'hls', 'master.m3u8');
  if (!fs.existsSync(masterPlaylistPath)) {
    return res.status(404).json({ error: 'hls playlist not found' });
  }

  const timelineDir = getTimelineDir(id);
  const buildDir = getTimelineBuildDir(id);
  const jobState = { ffmpeg: null, canceled: false };
  activeTimelineJobs.set(id, jobState);

  (async () => {
    try {
      fs.rmSync(buildDir, { recursive: true, force: true });
      fs.mkdirSync(buildDir, { recursive: true });

      const { durationSec } = await generateTimelineFrames({
        inputPath: masterPlaylistPath,
        outputDir: buildDir,
        videoId: id,
        onSpawn: (ffmpegProcess) => {
          jobState.ffmpeg = ffmpegProcess;
        },
        shouldCancel: () => jobState.canceled
      });

      const frameCount = fs
        .readdirSync(buildDir)
        .filter((name) => /^frame_\d{6}\.jpg$/i.test(name))
        .length;

      if (frameCount <= 0) {
        throw new Error('no timeline frames generated');
      }

      fs.writeFileSync(path.join(buildDir, 'meta.json'), JSON.stringify({
        frameCount,
        durationSec,
        generatedAt: new Date().toISOString()
      }, null, 2));

      fs.rmSync(timelineDir, { recursive: true, force: true });
      fs.renameSync(buildDir, timelineDir);
      console.log(`[video:${id}] timeline generation complete (${frameCount} frames)`);
    } catch (error) {
      fs.rmSync(buildDir, { recursive: true, force: true });
      console.error(`[video:${id}] timeline generation failed`, error.message);
    } finally {
      activeTimelineJobs.delete(id);
    }
  })();

  return res.status(202).json({
    started: true,
    timeline: buildTimelinePayload(req, id)
  });
});

router.get('/timeline/:id/:second.jpg', (req, res) => {
  const { id, second } = req.params;
  const video = getVideoById(id);
  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }
  if (isNormalPlayback(video)) {
    return res.status(404).json({ error: 'timeline is not available for normal playback videos' });
  }

  const meta = readTimelineMeta(id);
  if (!meta) {
    return res.status(404).json({ error: 'timeline not ready' });
  }

  const requestedSecond = Math.max(0, Number.parseInt(String(second), 10) || 0);
  const clampedSecond = Math.min(requestedSecond, Math.max(0, meta.frameCount - 1));
  const fileName = `frame_${String(clampedSecond).padStart(6, '0')}.jpg`;
  const framePath = path.resolve(path.join(getTimelineDir(id), fileName));

  if (!framePath.startsWith(path.resolve(getTimelineDir(id)))) {
    return res.status(400).json({ error: 'invalid path' });
  }

  if (!fs.existsSync(framePath)) {
    return res.status(404).json({ error: 'timeline frame not found' });
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Type', 'image/jpeg');
  return res.sendFile(framePath);
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

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Type', 'image/jpeg');
  return res.sendFile(thumbnailPath);
});

router.get('/normal-stream/:videoId', tokenAuth, (req, res) => {
  const { videoId } = req.params;

  if (req.auth.videoId !== videoId) {
    return res.status(403).json({ error: 'token does not match requested video' });
  }

  const video = getVideoById(videoId);
  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }
  if (!isNormalPlayback(video)) {
    return res.status(409).json({ error: 'video is not configured for normal playback' });
  }

  const filePath = resolveNormalSourcePath(video);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'source file not found' });
  }

  const stats = fs.statSync(filePath);
  const totalSize = stats.size;
  const mimeType = video.mime_type || mime.lookup(filePath) || 'application/octet-stream';

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', totalSize);
    return fs.createReadStream(filePath).pipe(res);
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(range).trim());
  if (!match) {
    res.setHeader('Content-Range', `bytes */${totalSize}`);
    return res.status(416).end();
  }

  let start = match[1] ? Number.parseInt(match[1], 10) : 0;
  let end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    res.setHeader('Content-Range', `bytes */${totalSize}`);
    return res.status(416).end();
  }

  if (!match[1] && match[2]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      return res.status(416).end();
    }
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  }

  if (start < 0 || end < start || start >= totalSize) {
    res.setHeader('Content-Range', `bytes */${totalSize}`);
    return res.status(416).end();
  }

  end = Math.min(end, totalSize - 1);
  const chunkSize = end - start + 1;

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
  res.setHeader('Content-Length', chunkSize);

  return fs.createReadStream(filePath, { start, end }).pipe(res);
});

router.get('/stream/:videoId/*', tokenAuth, (req, res) => {
  const { videoId } = req.params;

  if (req.auth.videoId !== videoId) {
    return res.status(403).json({ error: 'token does not match requested video' });
  }

  const video = getVideoById(videoId);
  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }
  if (isNormalPlayback(video)) {
    return res.status(409).json({ error: 'use normal-stream endpoint for this video type' });
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
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.send(withToken);
  }

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  if (/\.(ts|m4s|mp4)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  return res.sendFile(filePath);
});

module.exports = router;
