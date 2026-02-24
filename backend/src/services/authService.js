const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, AUTH_TOKEN_EXPIRES_IN } = require('../config');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const normalizedPassword = String(password || '');
  const hash = crypto.pbkdf2Sync(normalizedPassword, salt, 120000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const candidate = hashPassword(password, salt).hash;
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

function signUserToken(user) {
  return jwt.sign(
    {
      type: 'user',
      userId: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: AUTH_TOKEN_EXPIRES_IN }
  );
}

function verifyUserToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (!payload || payload.type !== 'user') {
    throw new Error('invalid user token');
  }
  return payload;
}

module.exports = {
  normalizeEmail,
  hashPassword,
  verifyPassword,
  signUserToken,
  verifyUserToken
};
