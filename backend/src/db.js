const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  DB_PATH,
  SEED_DEFAULT_USERS,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_USER_EMAIL,
  DEFAULT_USER_PASSWORD
} = require('./config');
const { hashPassword, normalizeEmail } = require('./services/authService');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_name TEXT NOT NULL,
    playback_type TEXT NOT NULL DEFAULT 'adaptive',
    storage_path TEXT,
    mime_type TEXT,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    process_step TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const existingColumns = new Set(db.prepare('PRAGMA table_info(videos)').all().map((column) => column.name));

if (!existingColumns.has('progress')) {
  db.exec('ALTER TABLE videos ADD COLUMN progress INTEGER NOT NULL DEFAULT 0');
}
if (!existingColumns.has('process_step')) {
  db.exec("ALTER TABLE videos ADD COLUMN process_step TEXT NOT NULL DEFAULT 'queued'");
}
if (!existingColumns.has('error_message')) {
  db.exec('ALTER TABLE videos ADD COLUMN error_message TEXT');
}
if (!existingColumns.has('duration_sec')) {
  db.exec('ALTER TABLE videos ADD COLUMN duration_sec REAL');
}
if (!existingColumns.has('playback_type')) {
  db.exec("ALTER TABLE videos ADD COLUMN playback_type TEXT NOT NULL DEFAULT 'adaptive'");
}
if (!existingColumns.has('storage_path')) {
  db.exec('ALTER TABLE videos ADD COLUMN storage_path TEXT');
}
if (!existingColumns.has('mime_type')) {
  db.exec('ALTER TABLE videos ADD COLUMN mime_type TEXT');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertVideoStmt = db.prepare(`
  INSERT INTO videos (
    id,
    title,
    original_name,
    playback_type,
    storage_path,
    mime_type,
    status,
    progress,
    process_step,
    error_message,
    duration_sec
  )
  VALUES (
    @id,
    @title,
    @original_name,
    @playback_type,
    @storage_path,
    @mime_type,
    @status,
    @progress,
    @process_step,
    @error_message,
    @duration_sec
  )
`);

const getVideoStmt = db.prepare(`
  SELECT
    id,
    title,
    original_name,
    playback_type,
    storage_path,
    mime_type,
    status,
    progress,
    process_step,
    error_message,
    duration_sec,
    created_at
  FROM videos
  WHERE id = ?
`);

const listVideosStmt = db.prepare(`
  SELECT
    id,
    title,
    original_name,
    playback_type,
    storage_path,
    mime_type,
    status,
    progress,
    process_step,
    error_message,
    duration_sec,
    created_at
  FROM videos
  ORDER BY datetime(created_at) DESC, rowid DESC
`);

const updateStatusStmt = db.prepare(`
  UPDATE videos
  SET status = ?
  WHERE id = ?
`);

const updateVideoProgressStmt = db.prepare(`
  UPDATE videos
  SET status = @status,
      progress = @progress,
      process_step = @process_step,
      error_message = @error_message
  WHERE id = @id
`);

const deleteVideoStmt = db.prepare(`
  DELETE FROM videos
  WHERE id = ?
`);

const updateVideoTitleStmt = db.prepare(`
  UPDATE videos
  SET title = ?
  WHERE id = ?
`);

const updateVideoDurationStmt = db.prepare(`
  UPDATE videos
  SET duration_sec = ?
  WHERE id = ?
`);

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, email, role, password_hash, password_salt)
  VALUES (@id, @email, @role, @password_hash, @password_salt)
`);

const getUserByEmailStmt = db.prepare(`
  SELECT id, email, role, password_hash, password_salt, created_at
  FROM users
  WHERE email = ?
`);

const updateUserRoleStmt = db.prepare(`
  UPDATE users
  SET role = ?
  WHERE email = ?
`);

function createDefaultUser({ id, email, password, role }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return;
  }

  const existingUser = getUserByEmailStmt.get(normalizedEmail);
  if (existingUser) {
    return;
  }

  const { hash, salt } = hashPassword(password);
  insertUserStmt.run({
    id,
    email: normalizedEmail,
    role,
    password_hash: hash,
    password_salt: salt
  });
}

if (SEED_DEFAULT_USERS) {
  createDefaultUser({
    id: 'admin-default',
    email: DEFAULT_ADMIN_EMAIL,
    password: DEFAULT_ADMIN_PASSWORD,
    role: 'admin'
  });

  createDefaultUser({
    id: 'user-default',
    email: DEFAULT_USER_EMAIL,
    password: DEFAULT_USER_PASSWORD,
    role: 'user'
  });
}

function createVideo(video) {
  insertVideoStmt.run({
    playback_type: 'adaptive',
    storage_path: null,
    mime_type: null,
    ...video
  });
}

function getVideoById(id) {
  return getVideoStmt.get(id);
}

function listVideos() {
  return listVideosStmt.all();
}

function updateVideoStatus(id, status) {
  updateStatusStmt.run(status, id);
}

function updateVideoProgress({
  id,
  status = 'processing',
  progress = 0,
  processStep = 'queued',
  errorMessage = null
}) {
  updateVideoProgressStmt.run({
    id,
    status,
    progress,
    process_step: processStep,
    error_message: errorMessage
  });
}

function deleteVideo(id) {
  deleteVideoStmt.run(id);
}

function updateVideoTitle(id, title) {
  updateVideoTitleStmt.run(title, id);
}

function setVideoDuration(id, durationSec) {
  const normalized = Number(durationSec);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return;
  }
  updateVideoDurationStmt.run(normalized, id);
}

function getUserByEmail(email) {
  return getUserByEmailStmt.get(normalizeEmail(email));
}

function createUser({ id, email, passwordHash, passwordSalt, role }) {
  insertUserStmt.run({
    id,
    email: normalizeEmail(email),
    role,
    password_hash: passwordHash,
    password_salt: passwordSalt
  });
}

function updateUserRole(email, role) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  updateUserRoleStmt.run(role, normalizedEmail);
}

module.exports = {
  db,
  createVideo,
  getVideoById,
  listVideos,
  updateVideoStatus,
  updateVideoProgress,
  deleteVideo,
  updateVideoTitle,
  setVideoDuration,
  getUserByEmail,
  createUser,
  updateUserRole
};
