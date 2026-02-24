const path = require('path');
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '../../');

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '';
  if (!raw.trim()) {
    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }

  return [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
}

module.exports = {
  HOST: process.env.HOST || '0.0.0.0',
  PORT: Number(process.env.PORT) || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-env',
  JWT_EXPIRES_IN: '5m',
  CORS_ORIGINS: parseCorsOrigins(),
  STORAGE_DIR: path.resolve(ROOT_DIR, 'storage'),
  TMP_DIR: path.resolve(__dirname, '../tmp'),
  DB_PATH: path.resolve(__dirname, '../data/videos.db')
};
