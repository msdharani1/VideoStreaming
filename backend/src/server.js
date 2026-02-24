const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { HOST, PORT, CORS_ORIGINS, STORAGE_DIR } = require('./config');
const { tokenAuth } = require('./middleware/tokenAuth');
const videoRoutes = require('./routes/videoRoutes');

const app = express();

function resolveLanIp() {
  const interfaces = os.networkInterfaces();
  for (const netIf of Object.values(interfaces)) {
    if (!Array.isArray(netIf)) continue;
    for (const info of netIf) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return 'localhost';
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  })
);
app.use(express.json());

function restrictStorageByToken(req, res, next) {
  const relativePath = req.path.replace(/^\/+/, '');
  const requestedVideoId = relativePath.split('/')[0];

  if (!requestedVideoId || req.auth.videoId !== requestedVideoId) {
    return res.status(403).json({ error: 'token does not match requested storage path' });
  }

  return next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use(videoRoutes);
app.use('/storage', tokenAuth, restrictStorageByToken, express.static(path.resolve(STORAGE_DIR)));

app.use((err, req, res, next) => {
  console.error(err);

  if (typeof err.message === 'string' && err.message.startsWith('CORS blocked for origin:')) {
    return res.status(403).json({ error: 'cors origin not allowed' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file too large (max 10GB)' });
  }

  if (err.message === 'Only video files are allowed') {
    return res.status(400).json({ error: err.message });
  }

  return res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, HOST, () => {
  const lanIp = resolveLanIp();
  console.log(`backend listening on http://localhost:${PORT}`);
  console.log(`backend LAN URL: http://${lanIp}:${PORT}`);
  console.log(`allowed CORS origins: ${CORS_ORIGINS.join(', ')}`);
});
