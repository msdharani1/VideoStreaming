const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { HLS_SEGMENT_SECONDS } = require('../config');

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `${command} exited with code ${code}`));
      }

      return resolve({ stdout, stderr });
    });
  });
}

async function probeMedia(inputPath) {
  const { stdout } = await runProcess('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,codec_name',
    '-of',
    'json',
    inputPath
  ]);

  const parsed = JSON.parse(stdout);
  const durationSec = Number(parsed?.format?.duration) || 0;
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  const hasAudio = Boolean(audioStream);

  return {
    durationSec,
    hasAudio,
    videoCodec: typeof videoStream?.codec_name === 'string' ? videoStream.codec_name.toLowerCase() : null,
    audioCodec: typeof audioStream?.codec_name === 'string' ? audioStream.codec_name.toLowerCase() : null
  };
}

function getRandomThumbnailSecond(durationSec) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }

  if (durationSec <= 3) {
    return Math.max(durationSec / 2, 0);
  }

  const minSecond = 1;
  const maxSecond = Math.max(Math.floor(durationSec - 1), minSecond);
  return Math.floor(Math.random() * (maxSecond - minSecond + 1)) + minSecond;
}

async function createRandomThumbnail({ inputPath, outputPath, durationSec }) {
  const snapshotSecond = getRandomThumbnailSecond(durationSec);

  await runProcess('ffmpeg', [
    '-y',
    '-ss',
    String(snapshotSecond),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    '-vf',
    'scale=640:-2',
    outputPath
  ]);
}

function buildFfmpegArgs(inputPath, outputDir, hasAudio) {
  const args = [
    '-y',
    '-i',
    inputPath,
    '-filter_complex',
    '[0:v]split=3[v360][v720][v1080];[v360]scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2[v360out];[v720]scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2[v720out];[v1080]scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2[v1080out]',
    '-map',
    '[v360out]'
  ];

  if (hasAudio) {
    args.push('-map', '0:a:0?');
  }

  args.push('-map', '[v720out]');

  if (hasAudio) {
    args.push('-map', '0:a:0?');
  }

  args.push('-map', '[v1080out]');

  if (hasAudio) {
    args.push('-map', '0:a:0?');
  }

  args.push(
    '-pix_fmt',
    'yuv420p',
    '-c:v:0',
    'libx264',
    '-b:v:0',
    '900k',
    '-maxrate:v:0',
    '960k',
    '-bufsize:v:0',
    '1400k',
    '-c:v:1',
    'libx264',
    '-b:v:1',
    '3000k',
    '-maxrate:v:1',
    '3210k',
    '-bufsize:v:1',
    '4500k',
    '-c:v:2',
    'libx264',
    '-b:v:2',
    '6000k',
    '-maxrate:v:2',
    '6420k',
    '-bufsize:v:2',
    '9000k',
    '-preset',
    'veryfast',
    '-sc_threshold',
    '0',
    '-g',
    '48',
    '-keyint_min',
    '48'
  );

  if (hasAudio) {
    args.push('-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k');
  }

  args.push(
    '-f',
    'hls',
    '-hls_time',
    String(HLS_SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_filename',
    path.join(outputDir, '%v', 'segment_%03d.ts'),
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    hasAudio
      ? 'v:0,a:0,name:360p v:1,a:1,name:720p v:2,a:2,name:1080p'
      : 'v:0,name:360p v:1,name:720p v:2,name:1080p',
    '-progress',
    'pipe:1',
    '-nostats',
    path.join(outputDir, '%v', 'index.m3u8')
  );

  return args;
}

function emitProgress(onProgress, percent, step) {
  if (typeof onProgress === 'function') {
    onProgress({ percent, step });
  }
}

function transcodeToHls({ inputPath, outputDir, videoId, onProgress, onSpawn, shouldCancel, onProbe }) {
  return new Promise(async (resolve, reject) => {
    try {
      fs.mkdirSync(path.join(outputDir, '360p'), { recursive: true });
      fs.mkdirSync(path.join(outputDir, '720p'), { recursive: true });
      fs.mkdirSync(path.join(outputDir, '1080p'), { recursive: true });

      emitProgress(onProgress, 5, 'Initializing transcoder');
      const { hasAudio, durationSec } = await probeMedia(inputPath);
      if (typeof onProbe === 'function') {
        onProbe({ hasAudio, durationSec });
      }
      emitProgress(onProgress, 10, 'Preparing adaptive renditions (360p, 720p, 1080p)');

      if (typeof shouldCancel === 'function' && shouldCancel()) {
        return reject(new Error('transcoding canceled'));
      }

      const args = buildFfmpegArgs(inputPath, outputDir, hasAudio);
      const ffmpeg = spawn('ffmpeg', args);
      if (typeof onSpawn === 'function') {
        onSpawn(ffmpeg);
      }

      let stdoutBuffer = '';
      let cancelTimer = null;

      if (typeof shouldCancel === 'function') {
        cancelTimer = setInterval(() => {
          if (shouldCancel() && !ffmpeg.killed) {
            ffmpeg.kill('SIGTERM');
          }
        }, 300);
      }

      ffmpeg.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.includes('=')) {
            continue;
          }

          const [key, value] = line.split('=');

          if (key === 'out_time_ms' && durationSec > 0) {
            const outTimeMs = Number(value);
            if (Number.isFinite(outTimeMs) && outTimeMs >= 0) {
              const ratio = Math.min(outTimeMs / (durationSec * 1000000), 1);
              const percent = 10 + ratio * 85;
              emitProgress(onProgress, percent, 'Transcoding and segmenting HLS');
            }
          }

          if (key === 'progress' && value === 'end') {
            emitProgress(onProgress, 98, 'Finalizing playlists');
          }
        }
      });

      ffmpeg.stderr.on('data', (chunk) => {
        const message = chunk.toString().trim();
        if (message) {
          console.log(`[ffmpeg:${videoId}] ${message}`);
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });

      ffmpeg.on('close', (code) => {
        if (cancelTimer) {
          clearInterval(cancelTimer);
        }

        if (code === 0) {
          return resolve();
        }

        if (code === null) {
          return reject(new Error('ffmpeg terminated before completion'));
        }

        return reject(new Error(`ffmpeg exited with code ${code}`));
      });
    } catch (error) {
      reject(error);
    }
  });
}

function generateTimelineFrames({ inputPath, outputDir, videoId, onProgress, onSpawn, shouldCancel }) {
  return new Promise(async (resolve, reject) => {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      const { durationSec } = await probeMedia(inputPath);
      emitProgress(onProgress, 5, 'Preparing timeline extraction');

      if (typeof shouldCancel === 'function' && shouldCancel()) {
        return reject(new Error('timeline generation canceled'));
      }

      const ffmpegArgs = [
        '-y',
        '-i',
        inputPath,
        '-vf',
        'fps=1,scale=320:-2',
        '-q:v',
        '4',
        '-start_number',
        '0',
        '-progress',
        'pipe:1',
        '-nostats',
        path.join(outputDir, 'frame_%06d.jpg')
      ];

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      if (typeof onSpawn === 'function') {
        onSpawn(ffmpeg);
      }

      let stdoutBuffer = '';
      let cancelTimer = null;

      if (typeof shouldCancel === 'function') {
        cancelTimer = setInterval(() => {
          if (shouldCancel() && !ffmpeg.killed) {
            ffmpeg.kill('SIGTERM');
          }
        }, 300);
      }

      ffmpeg.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.includes('=')) {
            continue;
          }

          const [key, value] = line.split('=');
          if (key === 'out_time_ms' && durationSec > 0) {
            const outTimeMs = Number(value);
            if (Number.isFinite(outTimeMs) && outTimeMs >= 0) {
              const ratio = Math.min(outTimeMs / (durationSec * 1000000), 1);
              emitProgress(onProgress, 5 + ratio * 90, 'Extracting timeline frames');
            }
          }

          if (key === 'progress' && value === 'end') {
            emitProgress(onProgress, 100, 'Timeline ready');
          }
        }
      });

      ffmpeg.stderr.on('data', (chunk) => {
        const message = chunk.toString().trim();
        if (message) {
          console.log(`[ffmpeg-timeline:${videoId}] ${message}`);
        }
      });

      ffmpeg.on('error', (error) => reject(error));

      ffmpeg.on('close', (code) => {
        if (cancelTimer) {
          clearInterval(cancelTimer);
        }

        if (code === 0) {
          return resolve({ durationSec });
        }

        if (code === null) {
          return reject(new Error('timeline ffmpeg terminated before completion'));
        }

        return reject(new Error(`timeline ffmpeg exited with code ${code}`));
      });
    } catch (error) {
      reject(error);
    }
  });
}

function transcodeToBrowserMp4({ inputPath, outputPath, videoId }) {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-y',
      '-i',
      inputPath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    let lastError = '';

    ffmpeg.stderr.on('data', (chunk) => {
      const message = chunk.toString();
      if (message) {
        lastError = message.slice(-3000);
        const trimmed = message.trim();
        if (trimmed) {
          console.log(`[ffmpeg-normal:${videoId}] ${trimmed}`);
        }
      }
    });

    ffmpeg.on('error', (error) => reject(error));
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        return resolve();
      }
      return reject(new Error(lastError || `ffmpeg exited with code ${code}`));
    });
  });
}

module.exports = {
  transcodeToHls,
  createRandomThumbnail,
  generateTimelineFrames,
  probeMedia,
  transcodeToBrowserMp4
};
