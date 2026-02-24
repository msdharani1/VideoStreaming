const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');

function signStreamToken(videoId) {
  return jwt.sign({ videoId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyStreamToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signStreamToken,
  verifyStreamToken
};
