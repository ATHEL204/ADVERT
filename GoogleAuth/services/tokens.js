// auth/services/tokens.js — JWT + Refresh Token management (in-memory store)
'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db/migrate');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-please';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ─── ACCESS TOKEN ─────────────────────────────────────────────

function generateAccessToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.display_name,
    avatar: user.avatar_url,
    role: user.role,
    verified: Boolean(user.email_verified),
    iat: Math.floor(Date.now() / 1000),
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'storefront-os',
    audience: 'storefront-client',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: 'storefront-os',
    audience: 'storefront-client',
  });
}

// ─── REFRESH TOKEN ────────────────────────────────────────────

function generateRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const id = uuid();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  db.saveRefreshToken({ id, userId, tokenHash: hash, expiresAt: expiresAt.toISOString() });
  return { raw, id };
}

function validateRefreshToken(raw) {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const record = db.getRefreshToken(hash);
  if (!record || record.revoked) return null;
  if (new Date(record.expires_at) < new Date()) {
    db.revokeRefreshToken(record.id);
    return null;
  }
  const user = db.getUserById(record.user_id);
  if (!user || !user.is_active) return null;
  return { ...record };
}

function revokeRefreshToken(tokenId) { db.revokeRefreshToken(tokenId); }
function revokeAllUserTokens(userId) { db.revokeAllUserRefreshTokens(userId); }

// ─── VERIFY / RESET TOKENS ────────────────────────────────────

function generateVerifyToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + parseInt(process.env.EMAIL_TOKEN_EXPIRES_MINUTES || '60'));
  return { token, expiresAt: expiresAt.toISOString() };
}

function generateResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + parseInt(process.env.RESET_TOKEN_EXPIRES_MINUTES || '15'));
  return { token, expiresAt: expiresAt.toISOString() };
}

// ─── COOKIES ──────────────────────────────────────────────────

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax',
};

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('access_token', accessToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 * 1000, path: '/auth/refresh' });
}

function clearAuthCookies(res) {
  res.clearCookie('access_token', COOKIE_OPTS);
  res.clearCookie('refresh_token', { ...COOKIE_OPTS, path: '/auth/refresh' });
}

module.exports = {
  generateAccessToken, verifyAccessToken,
  generateRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllUserTokens,
  generateVerifyToken, generateResetToken,
  setAuthCookies, clearAuthCookies,
};
