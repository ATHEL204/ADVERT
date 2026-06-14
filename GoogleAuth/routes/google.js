// auth/routes/google.js — Google OAuth 2.0 (in-memory store)
'use strict';

const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const { v4: uuid } = require('uuid');
const db = require('../db/migrate');
const tokens = require('../services/tokens');
const mailer = require('../services/mailer');
const { logEvent } = require('../middleware/guards');

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// ─── GET /auth/google — Redirect to Google ────────────────────
router.get('/', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your-')) {
    return res.status(503).json({ ok: false, error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env' });
  }

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'select_account',
    state: req.query.redirect ? Buffer.from(req.query.redirect).toString('base64') : '',
  });

  res.redirect(authUrl);
});

// ─── GET /auth/google/callback ────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}/auth/login.html?error=google_denied`);
  }

  try {
    const { tokens: googleTokens } = await client.getToken(code);
    client.setCredentials(googleTokens);

    const ticket = await client.verifyIdToken({
      idToken: googleTokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name: displayName, picture: avatarUrl, email_verified: googleVerified } = payload;

    if (!email) return res.redirect(`${FRONTEND_URL}/auth/login.html?error=no_email`);

    let user = db.getUserByGoogleId(googleId) || db.getUserByEmail(email);
    const isNewUser = !user;

    if (!user) {
      user = db.createUser({ email, displayName, avatarUrl, googleId, emailVerified: googleVerified ? 1 : 0 });
      mailer.sendGoogleWelcomeEmail(user).catch(() => {});
    } else if (!user.google_id) {
      user = db.updateUser(user.id, { google_id: googleId, avatar_url: avatarUrl, email_verified: 1, display_name: user.display_name || displayName });
    }

    user = db.updateUser(user.id, { last_login_at: new Date().toISOString(), avatar_url: avatarUrl });

    const accessToken = tokens.generateAccessToken(user);
    const { raw: refreshToken, id: refreshId } = tokens.generateRefreshToken(user.id);
    db.createSession({ id: uuid(), userId: user.id, refreshId, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    tokens.setAuthCookies(res, { accessToken, refreshToken });

    logEvent(user.id, isNewUser ? 'google_signup' : 'google_login', req, { email });

    const redirectTo = state ? Buffer.from(state, 'base64').toString('utf8') : '/';
    res.redirect(`${FRONTEND_URL}${redirectTo}?auth=success&token=${encodeURIComponent(accessToken)}&newUser=${isNewUser}`);

  } catch (err) {
    console.error('[GOOGLE] Callback error:', err.message);
    logEvent(null, 'google_error', req, { error: err.message });
    res.redirect(`${FRONTEND_URL}/auth/login.html?error=google_failed`);
  }
});

// ─── POST /auth/google/verify — Frontend Google Identity Services ─
router.post('/verify', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ ok: false, error: 'No credential provided' });

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name: displayName, picture: avatarUrl, email_verified: googleVerified } = payload;

    let user = db.getUserByGoogleId(googleId) || db.getUserByEmail(email);
    const isNewUser = !user;

    if (!user) {
      user = db.createUser({ email, displayName, avatarUrl, googleId, emailVerified: googleVerified ? 1 : 0 });
      mailer.sendGoogleWelcomeEmail(user).catch(() => {});
    } else if (!user.google_id) {
      user = db.updateUser(user.id, { google_id: googleId, avatar_url: avatarUrl, email_verified: 1 });
    }

    user = db.updateUser(user.id, { last_login_at: new Date().toISOString(), avatar_url: avatarUrl });

    const accessToken = tokens.generateAccessToken(user);
    const { raw: refreshToken, id: refreshId } = tokens.generateRefreshToken(user.id);
    db.createSession({ id: uuid(), userId: user.id, refreshId, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    tokens.setAuthCookies(res, { accessToken, refreshToken });

    logEvent(user.id, isNewUser ? 'google_signup' : 'google_login', req, { email });

    res.json({
      ok: true,
      accessToken,
      user: { id: user.id, email: user.email, name: user.display_name, avatar: user.avatar_url, role: user.role, verified: Boolean(user.email_verified), isNewUser },
    });
  } catch (err) {
    console.error('[GOOGLE] Verify error:', err.message);
    res.status(401).json({ ok: false, error: 'Invalid Google credential' });
  }
});

module.exports = router;
