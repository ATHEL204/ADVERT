// auth/db/migrate.js — In-memory store (no native dependencies required)
// Replaces better-sqlite3 for Windows compatibility
'use strict';

const { v4: uuid } = require('uuid');

// ─── IN-MEMORY STORE ─────────────────────────────────────────
// Survives server restarts only while Node process is running.
// For production, swap this module with a real DB (PostgreSQL, SQLite, etc.)
// All the same method signatures are preserved — just swap the file.

const store = {
  users:          new Map(),  // id → user object
  usersByEmail:   new Map(),  // email → id
  usersByGoogle:  new Map(),  // googleId → id
  refreshTokens:  new Map(),  // tokenHash → record
  sessions:       new Map(),  // id → session
  authEvents:     [],         // append-only log
  verifyTokens:   new Map(),  // token → userId
  resetTokens:    new Map(),  // token → userId
};

// ─── USER METHODS ─────────────────────────────────────────────

function createUser({ email, displayName, passwordHash, googleId, avatarUrl, emailVerified = 0 }) {
  const id = uuid();
  const now = new Date().toISOString();
  const user = {
    id,
    email: email.toLowerCase().trim(),
    display_name: displayName || email.split('@')[0],
    avatar_url: avatarUrl || null,
    password_hash: passwordHash || null,
    google_id: googleId || null,
    email_verified: emailVerified,
    verify_token: null,
    verify_token_exp: null,
    reset_token: null,
    reset_token_exp: null,
    role: 'merchant',
    is_active: 1,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  };
  store.users.set(id, user);
  store.usersByEmail.set(user.email, id);
  if (googleId) store.usersByGoogle.set(googleId, id);
  return { ...user };
}

function getUserById(id) {
  const u = store.users.get(id);
  return u ? { ...u } : null;
}

function getUserByEmail(email) {
  const id = store.usersByEmail.get(email?.toLowerCase().trim());
  return id ? { ...store.users.get(id) } : null;
}

function getUserByGoogleId(googleId) {
  const id = store.usersByGoogle.get(googleId);
  return id ? { ...store.users.get(id) } : null;
}

function updateUser(id, fields) {
  const user = store.users.get(id);
  if (!user) return null;
  const updated = { ...user, ...fields, updated_at: new Date().toISOString() };
  store.users.set(id, updated);
  // Sync index maps
  if (fields.google_id) store.usersByGoogle.set(fields.google_id, id);
  return { ...updated };
}

// ─── REFRESH TOKEN METHODS ────────────────────────────────────

function saveRefreshToken({ id, userId, tokenHash, expiresAt }) {
  store.refreshTokens.set(tokenHash, { id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked: 0, created_at: new Date().toISOString() });
}

function getRefreshToken(tokenHash) {
  return store.refreshTokens.get(tokenHash) || null;
}

function revokeRefreshToken(tokenId) {
  for (const [hash, rec] of store.refreshTokens) {
    if (rec.id === tokenId) { rec.revoked = 1; break; }
  }
}

function revokeAllUserRefreshTokens(userId) {
  for (const rec of store.refreshTokens.values()) {
    if (rec.user_id === userId) rec.revoked = 1;
  }
  // Also clear sessions
  for (const [sid, sess] of store.sessions) {
    if (sess.user_id === userId) store.sessions.delete(sid);
  }
}

// ─── SESSION METHODS ──────────────────────────────────────────

function createSession({ id, userId, refreshId, ipAddress, userAgent }) {
  const now = new Date().toISOString();
  store.sessions.set(id, { id, user_id: userId, refresh_id: refreshId, ip_address: ipAddress, user_agent: userAgent, last_active: now, created_at: now });
}

function updateSession(userId, refreshId, newRefreshId) {
  for (const sess of store.sessions.values()) {
    if (sess.user_id === userId && sess.refresh_id === refreshId) {
      sess.refresh_id = newRefreshId;
      sess.last_active = new Date().toISOString();
      break;
    }
  }
}

// ─── VERIFY TOKEN METHODS ─────────────────────────────────────

function setVerifyToken(userId, token, expiresAt) {
  updateUser(userId, { verify_token: token, verify_token_exp: expiresAt });
  store.verifyTokens.set(token, userId);
}

function getVerifyToken(token) {
  const userId = store.verifyTokens.get(token);
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user || user.verify_token !== token) return null;
  return user;
}

function clearVerifyToken(userId, token) {
  store.verifyTokens.delete(token);
  updateUser(userId, { verify_token: null, verify_token_exp: null, email_verified: 1 });
}

// ─── RESET TOKEN METHODS ──────────────────────────────────────

function setResetToken(userId, token, expiresAt) {
  updateUser(userId, { reset_token: token, reset_token_exp: expiresAt });
  store.resetTokens.set(token, userId);
}

function getResetToken(token) {
  const userId = store.resetTokens.get(token);
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user || user.reset_token !== token) return null;
  return user;
}

function clearResetToken(userId, token) {
  store.resetTokens.delete(token);
  updateUser(userId, { reset_token: null, reset_token_exp: null });
}

// ─── EVENT LOG ────────────────────────────────────────────────

function logEvent(userId, eventType, ipAddress, userAgent, metadata = {}) {
  store.authEvents.push({
    id: store.authEvents.length + 1,
    user_id: userId || null,
    event_type: eventType,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    metadata: JSON.stringify(metadata),
    created_at: new Date().toISOString(),
  });
  // Cap log at 1000 entries in memory
  if (store.authEvents.length > 1000) store.authEvents.shift();
}

// ─── STATS (for health endpoint) ─────────────────────────────

function getStats() {
  return {
    users: store.users.size,
    sessions: store.sessions.size,
    activeRefreshTokens: [...store.refreshTokens.values()].filter(r => !r.revoked).length,
    authEvents: store.authEvents.length,
  };
}

console.log('✅ Auth in-memory store initialized (no native dependencies).');

module.exports = {
  // Users
  createUser, getUserById, getUserByEmail, getUserByGoogleId, updateUser,
  // Refresh tokens
  saveRefreshToken, getRefreshToken, revokeRefreshToken, revokeAllUserRefreshTokens,
  // Sessions
  createSession, updateSession,
  // Verify tokens
  setVerifyToken, getVerifyToken, clearVerifyToken,
  // Reset tokens
  setResetToken, getResetToken, clearResetToken,
  // Events
  logEvent,
  // Stats
  getStats,
  // Raw store (for debugging)
  _store: store,
};
