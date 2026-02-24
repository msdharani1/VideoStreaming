const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');

function signStreamToken(videoId, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign({ videoId }, JWT_SECRET, { expiresIn });
}

function verifyStreamToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signStreamToken,
  verifyStreamToken
};
