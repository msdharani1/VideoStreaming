const { verifyUserToken } = require('../services/authService');

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

function requireUser(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'authentication required' });
  }

  try {
    req.user = verifyUserToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired session' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    requireUser(req, res, () => {
      if (!req.user || req.user.role !== role) {
        return res.status(403).json({ error: 'insufficient permissions' });
      }
      return next();
    });
  };
}

module.exports = {
  requireUser,
  requireRole
};
