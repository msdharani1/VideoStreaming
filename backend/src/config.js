const path = require('path');
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '../../');

function normalizeOriginInput(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return [];
  if (trimmed === '*') return ['*'];
  if (/^https?:\/\//i.test(trimmed)) {
    return [trimmed.replace(/\/+$/, '')];
  }
  const hostOnly = trimmed.replace(/^\/+|\/+$/g, '');
  if (!hostOnly) return [];
  return [`http://${hostOnly}`, `https://${hostOnly}`];
}

function parseOriginList(raw) {
  if (!String(raw || '').trim()) {
    return [];
  }

  return raw
    .split(',')
    .flatMap((value) => normalizeOriginInput(value))
    .filter(Boolean);
}

function parseCorsOrigins() {
  const defaultLocalOrigins = [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
  ];

  const configuredOrigins = parseOriginList(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '');
  const publicHostOrigins = parseOriginList(process.env.PUBLIC_HOSTS || '');
  const combined = [...configuredOrigins, ...publicHostOrigins, ...defaultLocalOrigins];

  if (combined.includes('*')) {
    return ['*'];
  }

  return [...new Set(combined)];
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

module.exports = {
  HOST: process.env.HOST || '0.0.0.0',
  PORT: Number(process.env.PORT) || 5000,
  HLS_SEGMENT_SECONDS: Math.max(2, Math.min(12, Number(process.env.HLS_SEGMENT_SECONDS) || 6)),
  CORS_ORIGINS: parseCorsOrigins(),
  TMP_DIR: path.resolve(__dirname, '../tmp'),
  WORK_DIR: path.resolve(__dirname, '../work'),
  ADMIN_EMAILS: parseCsv(process.env.ADMIN_EMAILS || process.env.ADMIN_OWNER_EMAIL || 'msdharaniofficial@gmail.com'),
  FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || '',
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  R2_ENDPOINT: process.env.R2_ENDPOINT || '',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
  R2_BUCKET: process.env.R2_BUCKET || '',
  R2_REGION: process.env.R2_REGION || 'auto',
  R2_PUBLIC_BASE_URL: normalizeBaseUrl(process.env.R2_PUBLIC_BASE_URL || ''),
  R2_KEY_PREFIX: String(process.env.R2_KEY_PREFIX || 'videos').replace(/^\/+|\/+$/g, ''),
  ROOT_DIR
};
