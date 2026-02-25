const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} = require('@aws-sdk/client-s3');
const {
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_REGION,
  R2_PUBLIC_BASE_URL,
  R2_KEY_PREFIX
} = require('../config');

function assertR2Config() {
  const missing = [];
  if (!R2_ENDPOINT) missing.push('R2_ENDPOINT');
  if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!R2_BUCKET) missing.push('R2_BUCKET');
  if (!R2_PUBLIC_BASE_URL) missing.push('R2_PUBLIC_BASE_URL');

  if (missing.length) {
    throw new Error(`Missing R2 configuration: ${missing.join(', ')}`);
  }
}

const s3 = new S3Client({
  region: R2_REGION || 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  },
  forcePathStyle: true
});

function buildKey(...parts) {
  const joined = parts
    .filter(Boolean)
    .map((part) => String(part).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return joined;
}

function getPublicUrl(key) {
  if (!R2_PUBLIC_BASE_URL) return '';
  return `${R2_PUBLIC_BASE_URL}/${key}`;
}

function cacheControlForKey(key) {
  const ext = path.extname(key).toLowerCase();
  if (ext === '.m3u8') {
    return 'public, max-age=30, must-revalidate';
  }
  if (ext === '.ts' || ext === '.m4s' || ext === '.mp4') {
    return 'public, max-age=31536000, immutable';
  }
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    return 'public, max-age=604800, immutable';
  }
  return 'public, max-age=3600';
}

async function uploadFile({ key, filePath, contentType, cacheControl }) {
  const resolvedType = contentType || mime.lookup(filePath) || 'application/octet-stream';
  const resolvedCache = cacheControl || cacheControlForKey(key);
  const body = fs.createReadStream(filePath);

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: resolvedType,
    CacheControl: resolvedCache
  }));
}

function walkDir(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

async function runWithConcurrency(tasks, limit = 6) {
  const executing = new Set();

  for (const task of tasks) {
    const promise = task();
    executing.add(promise);
    promise.finally(() => executing.delete(promise));

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

async function uploadDirectory({ dir, keyPrefix, concurrency = 6, transformKey }) {
  const files = walkDir(dir);
  const tasks = files.map((filePath) => {
    const relative = path.relative(dir, filePath).replace(/\\/g, '/');
    const baseKey = buildKey(keyPrefix, relative);
    const key = transformKey ? transformKey(baseKey, filePath) : baseKey;
    return () => uploadFile({ key, filePath });
  });

  await runWithConcurrency(tasks, concurrency);
  return files.length;
}

async function deletePrefix(prefix) {
  let continuationToken = undefined;

  do {
    const listResponse = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken
    }));

    const objects = (listResponse.Contents || []).map((item) => ({ Key: item.Key }));

    if (objects.length > 0) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: objects, Quiet: true }
      }));
    }

    continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
  } while (continuationToken);
}

function buildVideoPrefix(videoId) {
  return buildKey(R2_KEY_PREFIX, videoId);
}

function buildHlsPrefix(videoId) {
  return buildKey(buildVideoPrefix(videoId), 'hls');
}

function buildNormalPrefix(videoId) {
  return buildKey(buildVideoPrefix(videoId), 'normal');
}

function buildTimelinePrefix(videoId) {
  return buildKey(buildVideoPrefix(videoId), 'timeline');
}

function buildThumbnailKey(videoId) {
  return buildKey(buildVideoPrefix(videoId), 'thumbnail.jpg');
}

module.exports = {
  assertR2Config,
  buildKey,
  getPublicUrl,
  uploadFile,
  uploadDirectory,
  deletePrefix,
  buildVideoPrefix,
  buildHlsPrefix,
  buildNormalPrefix,
  buildTimelinePrefix,
  buildThumbnailKey
};
