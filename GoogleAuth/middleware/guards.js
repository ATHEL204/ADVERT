// auth/middleware/guards.js — Route protection middleware (in-memory store)
'use strict';

const { verifyAccessToken } = require('../services/tokens');
const db = require('../db/migrate');

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication required', code: 'NO_TOKEN' });
  }
  try {
    const decoded = verifyAccessToken(token);
    const user = db.getUserById(decoded.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: 'Account not found or deactivated', code: 'USER_INACTIVE' });
    }
    req.user = { ...decoded, ...user };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'Token expired — please refresh', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ ok: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = verifyAccessToken(token);
  } catch {}
  next();
}

function requireVerified(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (!req.user.email_verified) {
    return res.status(403).json({ ok: false, error: 'Email verification required.', code: 'EMAIL_NOT_VERIFIED' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Authentication required', code: 'NO_TOKEN' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: `Requires role: ${roles.join(' or ')}`, code: 'INSUFFICIENT_ROLE' });
    }
    next();
  };
}

function logEvent(userId, eventType, req, metadata = {}) {
  try {
    db.logEvent(userId, eventType, req.ip, req.headers['user-agent'], metadata);
  } catch (e) {}
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  if (req.cookies?.access_token) return req.cookies.access_token;
  if (req.query?.token) return req.query.token;
  return null;
}

module.exports = { requireAuth, optionalAuth, requireVerified, requireRole, logEvent };
