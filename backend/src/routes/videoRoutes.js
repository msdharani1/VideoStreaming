const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const mime = require('mime-types');
const { TMP_DIR, WORK_DIR } = require('../config');
const { requireAdmin } = require('../middleware/firebaseAuth');
const {
  createVideo,
  updateVideo,
  getVideo,
  deleteVideo: deleteVideoRecord
} = require('../services/videoStore');
const {
  assertR2Config,
  buildVideoPrefix,
  buildHlsPrefix,
  buildNormalPrefix,
  buildTimelinePrefix,
  buildThumbnailKey,
  buildKey,
  getPublicUrl,
  uploadFile,
  uploadDirectory,
  deletePrefix
} = require('../services/r2');
const {
  createRandomThumbnail,
  generateTimelineFrames,
  probeMedia,
  transcodeToBrowserMp4,
  transcodeToHls
} = require('../services/transcoder');

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });
const NORMAL_IMPORT_DIR = path.join(WORK_DIR, 'normal-import');
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

function nowMeta() {
  const now = new Date();
  return {
    updatedAt: now.toISOString(),
    updatedAtMs: now.getTime()
  };
}

function createBaseVideoRecord({
  videoId,
  title,
  originalName,
  playbackType
}) {
  const now = new Date();
  return {
    id: videoId,
    title,
    originalName,
    playbackType,
    status: 'processing',
    progress: 0,
    processStep: 'Upload completed, starting worker',
    error: null,
    durationSec: 0,
    mimeType: null,
    streamUrl: null,
    sourceUrl: null,
    thumbnailUrl: null,
    timeline: playbackType === 'adaptive'
      ? {
        available: false,
        generating: false,
        frameCount: 0,
        maxSecond: 0,
        durationSec: 0,
        generatedAt: null,
        frameUrlPattern: null
      }
      : null,
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    updatedAt: now.toISOString(),
    updatedAtMs: now.getTime()
  };
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

    void updateVideo(videoId, {
      status,
      progress: normalizedProgress,
      processStep: step,
      error: errorMessage,
      ...nowMeta()
    }).catch((error) => {
      console.error(`[video:${videoId}] progress update failed`, error.message);
    });

    lastProgress = normalizedProgress;
    lastStep = step;
    lastUpdatedAt = now;
  };
}

function ensureWorkDir(videoId) {
  const workDir = path.resolve(path.join(WORK_DIR, videoId));
  if (!workDir.startsWith(path.resolve(WORK_DIR))) {
    throw new Error('invalid work directory');
  }
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  return workDir;
}

function cleanupWorkDir(videoId) {
  const workDir = path.resolve(path.join(WORK_DIR, videoId));
  if (!workDir.startsWith(path.resolve(WORK_DIR))) return;
  fs.rmSync(workDir, { recursive: true, force: true });
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

async function processAdaptiveUpload(videoId, tempFilePath, jobState) {
  const writeProgress = createProgressWriter(videoId);
  assertR2Config();

  const workDir = ensureWorkDir(videoId);
  const hlsDir = path.join(workDir, 'hls');
  const thumbnailPath = path.join(workDir, 'thumbnail.jpg');

  try {
    fs.mkdirSync(hlsDir, { recursive: true });
    writeProgress({ progress: 2, step: 'Queued for processing', force: true });

    let mediaDurationSec = 0;

    await transcodeToHls({
      inputPath: tempFilePath,
      outputDir: hlsDir,
      videoId,
      onProbe: ({ durationSec }) => {
        mediaDurationSec = durationSec;
        if (durationSec > 0) {
          void updateVideo(videoId, { durationSec, ...nowMeta() });
        }
      },
      shouldCancel: () => jobState.deleted,
      onSpawn: (ffmpegProcess) => {
        jobState.ffmpeg = ffmpegProcess;
      },
      onProgress: ({ percent, step }) => {
        writeProgress({ progress: percent, step });
      }
    });

    if (jobState.deleted) {
      return;
    }

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

    writeProgress({ progress: 99, step: 'Uploading segments to R2' });

    const hlsPrefix = buildHlsPrefix(videoId);
    await uploadDirectory({ dir: hlsDir, keyPrefix: hlsPrefix, concurrency: 8 });

    const masterKey = buildKey(hlsPrefix, 'master.m3u8');
    const streamUrl = getPublicUrl(masterKey);

    let thumbnailUrl = null;
    if (fs.existsSync(thumbnailPath)) {
      const thumbKey = buildThumbnailKey(videoId);
      await uploadFile({ key: thumbKey, filePath: thumbnailPath });
      thumbnailUrl = getPublicUrl(thumbKey);
    }

    await updateVideo(videoId, {
      status: 'ready',
      progress: 100,
      processStep: 'Ready to stream',
      streamUrl,
      thumbnailUrl,
      durationSec: mediaDurationSec || 0,
      error: null,
      ...nowMeta(),
      timeline: {
        available: false,
        generating: false,
        frameCount: 0,
        maxSecond: 0,
        durationSec: mediaDurationSec || 0,
        generatedAt: null,
        frameUrlPattern: null
      }
    });

    console.log(`[video:${videoId}] processing complete`);
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
    }
  } finally {
    fs.rmSync(tempFilePath, { force: true });
    cleanupWorkDir(videoId);
    activeJobs.delete(videoId);
  }
}

async function processNormalUpload({ videoId, sourcePath, sourceName, jobState }) {
  const writeProgress = createProgressWriter(videoId);
  assertR2Config();

  try {
    writeProgress({ progress: 10, step: 'Analyzing normal video source', force: true });

    let durationSec = 0;
    let probeResult = await probeMedia(sourcePath);
    durationSec = Number(probeResult?.durationSec) || 0;

    if (durationSec > 0) {
      await updateVideo(videoId, { durationSec, ...nowMeta() });
    }

    const shouldTranscode = !isBrowserFriendlyCodec(probeResult);
    let finalSourcePath = sourcePath;
    let finalFileName = sourceName || path.basename(sourcePath);
    let finalMime = mime.lookup(sourcePath) || 'video/mp4';

    if (shouldTranscode) {
      writeProgress({ progress: 40, step: 'Converting to browser-compatible MP4' });
      const tempOutputPath = path.join(path.dirname(sourcePath), 'source.transcoded.mp4');
      const mp4Path = path.join(path.dirname(sourcePath), 'source.mp4');

      try {
        fs.rmSync(tempOutputPath, { force: true });
        await transcodeToBrowserMp4({
          inputPath: sourcePath,
          outputPath: tempOutputPath,
          videoId
        });
        fs.rmSync(mp4Path, { force: true });
        fs.renameSync(tempOutputPath, mp4Path);
        finalSourcePath = mp4Path;
        finalFileName = path.basename(mp4Path);
        finalMime = 'video/mp4';
        probeResult = await probeMedia(finalSourcePath);
        durationSec = Number(probeResult?.durationSec) || durationSec;
        if (durationSec > 0) {
          await updateVideo(videoId, { durationSec, ...nowMeta() });
        }
      } catch (transcodeError) {
        fs.rmSync(tempOutputPath, { force: true });
        console.warn(`[video:${videoId}] compatibility transcode failed`, transcodeError.message);
      }
    }

    writeProgress({ progress: 80, step: 'Generating thumbnail preview' });
    const thumbnailPath = path.join(path.dirname(finalSourcePath), 'thumbnail.jpg');
    try {
      await createRandomThumbnail({
        inputPath: finalSourcePath,
        outputPath: thumbnailPath,
        durationSec
      });
    } catch (thumbnailError) {
      console.warn(`[video:${videoId}] thumbnail generation failed`, thumbnailError.message);
    }

    if (jobState.deleted) {
      return;
    }

    writeProgress({ progress: 90, step: 'Uploading normal video to R2' });

    const normalPrefix = buildNormalPrefix(videoId);
    const sourceExt = path.extname(finalFileName || finalSourcePath) || '.mp4';
    const sourceKey = buildKey(normalPrefix, `source${sourceExt.toLowerCase()}`);
    await uploadFile({ key: sourceKey, filePath: finalSourcePath, contentType: finalMime });

    const sourceUrl = getPublicUrl(sourceKey);

    let thumbnailUrl = null;
    if (fs.existsSync(thumbnailPath)) {
      const thumbKey = buildThumbnailKey(videoId);
      await uploadFile({ key: thumbKey, filePath: thumbnailPath });
      thumbnailUrl = getPublicUrl(thumbKey);
    }

    await updateVideo(videoId, {
      status: 'ready',
      progress: 100,
      processStep: 'Ready for normal playback',
      sourceUrl,
      mimeType: finalMime,
      thumbnailUrl,
      durationSec: durationSec || 0,
      error: null,
      ...nowMeta()
    });
  } catch (error) {
    if (jobState.deleted) {
      console.log(`[video:${videoId}] normal processing canceled by delete request`);
    } else {
      console.error(`[video:${videoId}] normal upload failed`, error);
      writeProgress({
        progress: 0,
        step: 'Processing failed',
        status: 'failed',
        errorMessage: error.message,
        force: true
      });
    }
  } finally {
    cleanupWorkDir(videoId);
    activeJobs.delete(videoId);
  }
}

router.post('/upload', requireAdmin, upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'video file is required' });
  }

  const videoId = crypto.randomUUID();
  const title = (req.body && req.body.title ? String(req.body.title) : req.file.originalname).trim();
  const safeTitle = title || req.file.originalname;

  const record = createBaseVideoRecord({
    videoId,
    title: safeTitle,
    originalName: req.file.originalname,
    playbackType: 'adaptive'
  });

  await createVideo(videoId, record);

  const jobState = {
    ffmpeg: null,
    deleted: false
  };

  activeJobs.set(videoId, jobState);

  processAdaptiveUpload(videoId, req.file.path, jobState);

  return res.status(202).json({
    videoId,
    status: 'processing',
    progress: 0,
    processStep: 'Upload completed, starting worker'
  });
});

router.post('/upload/normal', requireAdmin, upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'video file is required' });
  }

  const videoId = crypto.randomUUID();
  const title = (req.body && req.body.title ? String(req.body.title) : req.file.originalname).trim();
  const safeTitle = title || req.file.originalname;
  const extension = inferUploadExtension(req.file);

  const workDir = ensureWorkDir(videoId);
  const normalDir = path.join(workDir, 'normal');
  fs.mkdirSync(normalDir, { recursive: true });
  const sourceFileName = `source${extension}`;
  const sourcePath = path.join(normalDir, sourceFileName);
  fs.renameSync(req.file.path, sourcePath);

  const record = createBaseVideoRecord({
    videoId,
    title: safeTitle,
    originalName: req.file.originalname,
    playbackType: 'normal'
  });
  record.mimeType = req.file.mimetype || mime.lookup(sourcePath) || 'video/mp4';
  record.processStep = 'Analyzing normal video source';
  record.progress = 10;

  await createVideo(videoId, record);

  const jobState = {
    ffmpeg: null,
    deleted: false
  };

  activeJobs.set(videoId, jobState);

  processNormalUpload({ videoId, sourcePath, sourceName: sourceFileName, jobState });

  return res.status(202).json({
    videoId,
    status: 'processing',
    playbackType: 'normal',
    processStep: 'Analyzing normal video source'
  });
});

router.get('/upload/normal/import/files', requireAdmin, (req, res) => {
  const files = fs
    .readdirSync(NORMAL_IMPORT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isSimpleFileName(name) && isLikelyVideoFile(name))
    .map((name) => {
      const fullPath = path.join(NORMAL_IMPORT_DIR, name);
      const stats = fs.statSync(fullPath);
      return {
        name,
        size: stats.size,
        createdAt: stats.birthtime || stats.ctime
      };
    })
    .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));

  res.json({ files });
});

router.post('/upload/normal/import', requireAdmin, async (req, res) => {
  const fileName = String(req.body?.fileName || '').trim();
  const title = String(req.body?.title || '').trim();

  if (!isSimpleFileName(fileName)) {
    return res.status(400).json({ error: 'invalid file name' });
  }

  if (!isLikelyVideoFile(fileName)) {
    return res.status(400).json({ error: 'file does not look like a supported video format' });
  }

  const sourcePath = path.join(NORMAL_IMPORT_DIR, fileName);
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'file not found' });
  }

  const videoId = crypto.randomUUID();
  const safeTitle = title || fileName;

  const workDir = ensureWorkDir(videoId);
  const normalDir = path.join(workDir, 'normal');
  fs.mkdirSync(normalDir, { recursive: true });
  const extension = path.extname(fileName) || '.mp4';
  const destName = `source${extension}`;
  const destPath = path.join(normalDir, destName);
  fs.renameSync(sourcePath, destPath);

  const record = createBaseVideoRecord({
    videoId,
    title: safeTitle,
    originalName: fileName,
    playbackType: 'normal'
  });
  record.mimeType = mime.lookup(destPath) || 'video/mp4';
  record.processStep = 'Analyzing normal video source';
  record.progress = 10;

  await createVideo(videoId, record);

  const jobState = {
    ffmpeg: null,
    deleted: false
  };
  activeJobs.set(videoId, jobState);

  processNormalUpload({ videoId, sourcePath: destPath, sourceName: destName, jobState });

  return res.status(202).json({
    videoId,
    status: 'processing',
    playbackType: 'normal',
    processStep: 'Analyzing normal video source'
  });
});

router.patch('/video/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const title = String(req.body?.title || '').trim();

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const video = await getVideo(id);
  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  await updateVideo(id, { title, ...nowMeta() });
  return res.json({ ok: true });
});

router.delete('/video/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const video = await getVideo(id);
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

  const timelineState = activeTimelineJobs.get(id);
  if (timelineState) {
    timelineState.canceled = true;
    if (timelineState.ffmpeg && !timelineState.ffmpeg.killed) {
      timelineState.ffmpeg.kill('SIGTERM');
    }
  }

  try {
    await deletePrefix(buildVideoPrefix(id));
  } catch (error) {
    console.warn(`[video:${id}] failed to delete R2 objects`, error.message);
  }

  await deleteVideoRecord(id);
  cleanupWorkDir(id);

  return res.json({ ok: true });
});

router.post('/video/:id/duration/sync', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const video = await getVideo(id);
  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  const sourceUrl = video.playbackType === 'normal' ? video.sourceUrl : video.streamUrl;
  if (!sourceUrl) {
    return res.status(422).json({ error: 'video source url not available' });
  }

  try {
    const { durationSec } = await probeMedia(sourceUrl);
    if (!durationSec) {
      return res.status(422).json({ error: 'could not determine duration for this video' });
    }

    const nextPayload = { durationSec, ...nowMeta() };
    if (video.timeline && typeof video.timeline === 'object') {
      nextPayload.timeline = {
        ...video.timeline,
        durationSec
      };
    }

    await updateVideo(id, nextPayload);
    return res.json({ ok: true, durationSec });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'duration probe failed' });
  }
});

router.post('/video/:id/timeline/generate', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const video = await getVideo(id);

  if (!video) {
    return res.status(404).json({ error: 'video not found' });
  }

  if (video.playbackType === 'normal') {
    return res.status(409).json({ error: 'timeline generation is only supported for adaptive videos' });
  }

  if (video.status !== 'ready') {
    return res.status(409).json({ error: 'video is not ready for timeline generation' });
  }

  if (activeTimelineJobs.has(id)) {
    return res.status(202).json({ started: false, message: 'timeline generation already running' });
  }

  if (!video.streamUrl) {
    return res.status(422).json({ error: 'stream url not available' });
  }

  const timelineDir = path.join(WORK_DIR, `${id}_timeline_${Date.now()}`);
  fs.mkdirSync(timelineDir, { recursive: true });

  const jobState = { ffmpeg: null, canceled: false };
  activeTimelineJobs.set(id, jobState);

  await updateVideo(id, {
    timeline: {
      ...(video.timeline || {}),
      generating: true
    },
    ...nowMeta()
  });

  (async () => {
    try {
      const { durationSec } = await generateTimelineFrames({
        inputPath: video.streamUrl,
        outputDir: timelineDir,
        videoId: id,
        onSpawn: (ffmpegProcess) => {
          jobState.ffmpeg = ffmpegProcess;
        },
        shouldCancel: () => jobState.canceled
      });

      const frames = fs
        .readdirSync(timelineDir)
        .filter((name) => /^frame_\d{6}\.jpg$/i.test(name));

      const frameCount = frames.length;
      if (frameCount <= 0) {
        throw new Error('no timeline frames generated');
      }

      const timelinePrefix = buildTimelinePrefix(id);
      const tasks = frames.map((name) => {
        const filePath = path.join(timelineDir, name);
        const match = name.match(/^frame_(\d{6})\.jpg$/i);
        const index = match ? Number.parseInt(match[1], 10) : null;
        const safeIndex = Number.isFinite(index) ? index : name.replace(/^frame_/, '').replace(/\.jpg$/i, '');
        const key = buildKey(timelinePrefix, `frame_${safeIndex}.jpg`);
        return uploadFile({ key, filePath });
      });

      await Promise.all(tasks);

      const frameUrlPattern = `${getPublicUrl(buildKey(timelinePrefix, 'frame_{second}.jpg'))}`;

      await updateVideo(id, {
        timeline: {
          available: true,
          generating: false,
          frameCount,
          maxSecond: Math.max(0, frameCount - 1),
          durationSec: durationSec || 0,
          generatedAt: new Date().toISOString(),
          frameUrlPattern
        },
        ...nowMeta()
      });

      console.log(`[video:${id}] timeline generation complete (${frameCount} frames)`);
    } catch (error) {
      console.error(`[video:${id}] timeline generation failed`, error.message);
      await updateVideo(id, {
        timeline: {
          ...(video.timeline || {}),
          generating: false
        },
        ...nowMeta()
      });
    } finally {
      fs.rmSync(timelineDir, { recursive: true, force: true });
      activeTimelineJobs.delete(id);
    }
  })();

  return res.status(202).json({ started: true });
});

module.exports = router;
