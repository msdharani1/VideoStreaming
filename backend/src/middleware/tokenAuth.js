const { verifyStreamToken } = require('../services/tokenService');

function extractToken(req) {
  if (req.query && typeof req.query.token === 'string') {
    return req.query.token;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice('Bearer '.length).trim();
}

function tokenAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const payload = verifyStreamToken(token);
    req.auth = payload;
    req.token = token;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  tokenAuth,
  extractToken
};
