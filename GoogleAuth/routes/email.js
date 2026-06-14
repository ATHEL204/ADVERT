// auth/routes/email.js — Email/password auth (in-memory store)
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db/migrate');
const tokens = require('../services/tokens');
const mailer = require('../services/mailer');
const { requireAuth, logEvent } = require('../middleware/guards');

// ─── HELPERS ──────────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derived = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw)) return 'Must contain at least one uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Must contain at least one number';
  return null;
}

// ─── POST /auth/register ──────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email required' });
  }
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ ok: false, error: pwError });

  if (db.getUserByEmail(email)) {
    return res.status(409).json({ ok: false, error: 'An account with this email already exists' });
  }

  const { token: verifyToken, expiresAt: verifyExp } = tokens.generateVerifyToken();
  const user = db.createUser({
    email,
    displayName: displayName || email.split('@')[0],
    passwordHash: hashPassword(password),
    emailVerified: 0,
  });

  db.setVerifyToken(user.id, verifyToken, verifyExp);
  const freshUser = db.getUserById(user.id);

  mailer.sendVerificationEmail(freshUser, verifyToken).catch(e =>
    console.error('[MAILER]', e.message)
  );
  logEvent(user.id, 'register', req, { email });

  res.status(201).json({
    ok: true,
    message: 'Account created. Please check your email to verify your address.',
    user: { id: user.id, email: user.email, name: user.display_name },
  });
});

// ─── POST /auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password required' });
  }

  const user = db.getUserByEmail(email);
  if (!user || !user.password_hash) {
    logEvent(null, 'failed_login', req, { email, reason: 'not_found' });
    return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  }
  if (!user.is_active) {
    return res.status(403).json({ ok: false, error: 'This account has been deactivated' });
  }

  let valid = false;
  try { valid = verifyPassword(password, user.password_hash); } catch {}

  if (!valid) {
    logEvent(user.id, 'failed_login', req, { email, reason: 'wrong_password' });
    return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  }

  db.updateUser(user.id, { last_login_at: new Date().toISOString() });
  const freshUser = db.getUserById(user.id);

  const accessToken = tokens.generateAccessToken(freshUser);
  const { raw: refreshToken, id: refreshId } = tokens.generateRefreshToken(freshUser.id);
  db.createSession({ id: uuid(), userId: freshUser.id, refreshId, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  tokens.setAuthCookies(res, { accessToken, refreshToken });

  logEvent(user.id, 'login', req, { email });
  mailer.sendLoginAlertEmail(freshUser, { ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => {});

  res.json({
    ok: true,
    accessToken,
    user: { id: freshUser.id, email: freshUser.email, name: freshUser.display_name, avatar: freshUser.avatar_url, role: freshUser.role, verified: Boolean(freshUser.email_verified) },
  });
});

// ─── GET /auth/verify-email ───────────────────────────────────
router.get('/verify-email', async (req, res) => {
  const { token, email } = req.query;
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

  if (!token || !email) return res.redirect(`${FRONTEND_URL}/auth/login.html?error=invalid_verify_link`);

  const user = db.getVerifyToken(token);
  if (!user || user.email !== email.toLowerCase().trim()) {
    return res.redirect(`${FRONTEND_URL}/auth/login.html?error=invalid_verify_token`);
  }
  if (new Date(user.verify_token_exp) < new Date()) {
    return res.redirect(`${FRONTEND_URL}/auth/login.html?error=verify_token_expired&email=${encodeURIComponent(email)}`);
  }

  db.clearVerifyToken(user.id, token);
  logEvent(user.id, 'email_verify', req, { email });
  mailer.sendWelcomeEmail(db.getUserById(user.id)).catch(() => {});

  res.redirect(`${FRONTEND_URL}/auth/login.html?verified=true`);
});

// ─── POST /auth/resend-verification ───────────────────────────
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, error: 'Email required' });

  const user = db.getUserByEmail(email);
  if (user && !user.email_verified) {
    const { token, expiresAt } = tokens.generateVerifyToken();
    db.setVerifyToken(user.id, token, expiresAt);
    mailer.sendVerificationEmail(db.getUserById(user.id), token).catch(() => {});
  }
  res.json({ ok: true, message: 'If the email exists and is unverified, a new link has been sent.' });
});

// ─── POST /auth/forgot-password ───────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const user = db.getUserByEmail(req.body?.email);
  if (user && user.password_hash) {
    const { token, expiresAt } = tokens.generateResetToken();
    db.setResetToken(user.id, token, expiresAt);
    mailer.sendPasswordResetEmail(user, token).catch(() => {});
    logEvent(user.id, 'password_reset_request', req, {});
  }
  res.json({ ok: true, message: 'If an account exists, a reset link has been sent to your email.' });
});

// ─── POST /auth/reset-password ────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, email, newPassword } = req.body;
  if (!token || !email || !newPassword) {
    return res.status(400).json({ ok: false, error: 'token, email, and newPassword required' });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ ok: false, error: pwError });

  const user = db.getResetToken(token);
  if (!user || user.email !== email.toLowerCase().trim()) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired reset link' });
  }
  if (new Date(user.reset_token_exp) < new Date()) {
    return res.status(400).json({ ok: false, error: 'Reset link has expired. Please request a new one.' });
  }

  db.updateUser(user.id, { password_hash: hashPassword(newPassword) });
  db.clearResetToken(user.id, token);
  tokens.revokeAllUserTokens(user.id);
  logEvent(user.id, 'password_reset', req, {});

  res.json({ ok: true, message: 'Password reset successfully. Please log in with your new password.' });
});

// ─── POST /auth/refresh ───────────────────────────────────────
router.post('/refresh', (req, res) => {
  const raw = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!raw) return res.status(401).json({ ok: false, error: 'No refresh token', code: 'NO_REFRESH' });

  const record = tokens.validateRefreshToken(raw);
  if (!record) {
    tokens.clearAuthCookies(res);
    return res.status(401).json({ ok: false, error: 'Refresh token invalid or expired', code: 'REFRESH_INVALID' });
  }

  tokens.revokeRefreshToken(record.id);
  const user = db.getUserById(record.user_id);
  const accessToken = tokens.generateAccessToken(user);
  const { raw: newRefresh, id: newRefreshId } = tokens.generateRefreshToken(user.id);
  db.updateSession(user.id, record.id, newRefreshId);
  tokens.setAuthCookies(res, { accessToken, refreshToken: newRefresh });

  res.json({
    ok: true,
    accessToken,
    user: { id: user.id, email: user.email, name: user.display_name, avatar: user.avatar_url, role: user.role, verified: Boolean(user.email_verified) },
  });
});

// ─── GET /auth/me ─────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.getUserById(req.user.sub);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  res.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.display_name, avatar: user.avatar_url, role: user.role, verified: Boolean(user.email_verified), lastLogin: user.last_login_at, createdAt: user.created_at },
  });
});

// ─── POST /auth/logout ────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
  const raw = req.cookies?.refresh_token || req.body?.refreshToken;
  if (raw) {
    const record = tokens.validateRefreshToken(raw);
    if (record) tokens.revokeRefreshToken(record.id);
  }
  logEvent(req.user.sub, 'logout', req);
  tokens.clearAuthCookies(res);
  res.json({ ok: true, message: 'Logged out' });
});

// ─── POST /auth/logout-all ────────────────────────────────────
router.post('/logout-all', requireAuth, (req, res) => {
  tokens.revokeAllUserTokens(req.user.sub);
  logEvent(req.user.sub, 'logout_all', req);
  tokens.clearAuthCookies(res);
  res.json({ ok: true, message: 'All sessions revoked' });
});

module.exports = router;
