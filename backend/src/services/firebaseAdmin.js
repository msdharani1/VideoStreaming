const fs = require('fs');
const admin = require('firebase-admin');
const {
  FIREBASE_DATABASE_URL,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_SERVICE_ACCOUNT_PATH
} = require('../config');

let appInstance = null;

function parseServiceAccount(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  let jsonPayload = trimmed;
  if (!trimmed.startsWith('{')) {
    try {
      jsonPayload = Buffer.from(trimmed, 'base64').toString('utf8');
    } catch {
      jsonPayload = trimmed;
    }
  }

  const parsed = JSON.parse(jsonPayload);
  if (parsed.private_key && typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

function resolveServiceAccount() {
  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccount(FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
    const raw = fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8');
    return parseServiceAccount(raw);
  }

  return null;
}

function initFirebase() {
  if (appInstance) return appInstance;

  const serviceAccount = resolveServiceAccount();

  if (!FIREBASE_DATABASE_URL) {
    throw new Error('FIREBASE_DATABASE_URL is required');
  }

  const options = {
    databaseURL: FIREBASE_DATABASE_URL
  };

  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount);
  }

  appInstance = admin.initializeApp(options);
  return appInstance;
}

function getDatabase() {
  const app = initFirebase();
  return app.database();
}

async function verifyIdToken(token) {
  const app = initFirebase();
  return app.auth().verifyIdToken(token);
}

module.exports = {
  getDatabase,
  verifyIdToken
};
