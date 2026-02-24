const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DB_PATH } = require('./config');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_name TEXT NOT NULL,
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

const insertVideoStmt = db.prepare(`
  INSERT INTO videos (id, title, original_name, status, progress, process_step, error_message)
  VALUES (@id, @title, @original_name, @status, @progress, @process_step, @error_message)
`);

const getVideoStmt = db.prepare(`
  SELECT id, title, original_name, status, progress, process_step, error_message, created_at
  FROM videos
  WHERE id = ?
`);

const listVideosStmt = db.prepare(`
  SELECT id, title, original_name, status, progress, process_step, error_message, created_at
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

function createVideo(video) {
  insertVideoStmt.run(video);
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

module.exports = {
  db,
  createVideo,
  getVideoById,
  listVideos,
  updateVideoStatus,
  updateVideoProgress,
  deleteVideo
};
