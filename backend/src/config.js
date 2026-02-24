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

module.exports = {
  HOST: process.env.HOST || '0.0.0.0',
  PORT: Number(process.env.PORT) || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-env',
  JWT_EXPIRES_IN: '5m',
  AUTH_TOKEN_EXPIRES_IN: process.env.AUTH_TOKEN_EXPIRES_IN || '12h',
  ADMIN_OWNER_EMAIL: String(process.env.ADMIN_OWNER_EMAIL || 'msdharaniofficial@gmail.com').trim().toLowerCase(),
  DEFAULT_ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@primeview.local',
  DEFAULT_ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  DEFAULT_USER_EMAIL: process.env.USER_EMAIL || 'user@primeview.local',
  DEFAULT_USER_PASSWORD: process.env.USER_PASSWORD || 'user123',
  SEED_DEFAULT_USERS: String(process.env.SEED_DEFAULT_USERS || '').trim().toLowerCase() === 'true',
  HLS_SEGMENT_SECONDS: Math.max(2, Math.min(12, Number(process.env.HLS_SEGMENT_SECONDS) || 6)),
  CORS_ORIGINS: parseCorsOrigins(),
  STORAGE_DIR: path.resolve(ROOT_DIR, 'storage'),
  TMP_DIR: path.resolve(__dirname, '../tmp'),
  DB_PATH: path.resolve(__dirname, '../data/videos.db')
};
