const { ADMIN_EMAILS } = require('../config');
const { verifyIdToken } = require('../services/firebaseAdmin');

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

function isAdminUser(decoded) {
  if (!decoded) return false;
  if (decoded.admin === true || decoded?.claims?.admin === true) return true;
  const email = String(decoded.email || '').trim().toLowerCase();
  if (!email) return false;
  return ADMIN_EMAILS.map((entry) => entry.toLowerCase()).includes(email);
}

async function requireFirebaseAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'authentication required' });
  }

  try {
    const decoded = await verifyIdToken(token);
    req.user = decoded;
    return next();
  } catch (error) {
    console.error('[firebaseAuth] token verification failed:', error);
    return res.status(401).json({ error: 'invalid or expired session' });
  }
}

function requireAdmin(req, res, next) {
  return requireFirebaseAuth(req, res, () => {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ error: 'insufficient permissions' });
    }
    return next();
  });
}

module.exports = {
  requireFirebaseAuth,
  requireAdmin,
  isAdminUser
};
