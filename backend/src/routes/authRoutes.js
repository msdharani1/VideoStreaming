const crypto = require('crypto');
const express = require('express');
const { ADMIN_OWNER_EMAIL } = require('../config');
const { createUser, getUserByEmail, updateUserRole } = require('../db');
const { requireUser } = require('../middleware/userAuth');
const { hashPassword, normalizeEmail, signUserToken, verifyPassword } = require('../services/authService');

const router = express.Router();

function resolveRoleByEmail(email) {
  return normalizeEmail(email) === ADMIN_OWNER_EMAIL ? 'admin' : 'user';
}

router.post('/auth/signup', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  if (getUserByEmail(email)) {
    return res.status(409).json({ error: 'email already registered' });
  }

  const role = resolveRoleByEmail(email);
  const { hash, salt } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email,
    role
  };

  try {
    createUser({
      id: user.id,
      email: user.email,
      role: user.role,
      passwordHash: hash,
      passwordSalt: salt
    });
  } catch (error) {
    if (String(error.message || '').toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'email already registered' });
    }
    throw error;
  }

  const token = signUserToken(user);
  return res.status(201).json({
    token,
    user
  });
});

router.post('/auth/login', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const resolvedRole = resolveRoleByEmail(user.email);
  if (user.role !== resolvedRole) {
    updateUserRole(user.email, resolvedRole);
    user.role = resolvedRole;
  }

  const token = signUserToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    }
  });
});

router.get('/auth/me', requireUser, (req, res) => {
  return res.json({
    user: {
      id: req.user.userId,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;
