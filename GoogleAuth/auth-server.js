// auth/auth-server.js — Auth Service Entry Point
// Port: 3005 | No native dependencies required
'use strict';

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Initialize in-memory store
const db = require('./db/migrate');

const app = express();
const PORT = process.env.AUTH_PORT || 3005;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// ─── SECURITY ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: [
    FRONTEND_URL,
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3005storefrontos.com',
    'null'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── RATE LIMITS ──────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { ok: false, error: 'Too many auth attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many login attempts. Please try again later.' },
});

app.use('/auth/', authLimiter);
app.use('/auth/login', loginLimiter);

// ─── SERVE LOGIN PAGE ──────────────────────────────────────────
// Serves login.html directly at /auth/login.html
app.use('/auth', express.static(path.join(__dirname)));

// ─── ROUTES ───────────────────────────────────────────────────
const emailRoutes = require('./routes/email');
const googleRoutes = require('./routes/google');

app.use('/auth', emailRoutes);
app.use('/auth/google', googleRoutes);

// ─── HEALTH ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'storefront-os-auth',
    version: '1.0.0',
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()) + 's',
    store: db.getStats(),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('your-')),
    smtp: Boolean(process.env.SMTP_USER && !process.env.SMTP_USER.includes('your-')),
  });
});

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` });
});

// ─── ERROR ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[AUTH ERROR]', err.message);
  res.status(err.status || 500).json({
    ok: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal error' : err.message,
  });
});

// ─── BOOT ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔════════════════════════════════════════╗');
  console.log('  ║    STOREFRONT OS · AUTH SERVICE        ║');
  console.log('  ║    Built by ATHEL204                   ║');
  console.log('  ╠════════════════════════════════════════╣');
  console.log(`  ║  Running →  http://localhost:${PORT}       ║`);
  console.log(`  ║  Login   →  http://localhost:${PORT}/auth/login.html ║`);
  console.log('  ╠════════════════════════════════════════╣');
  console.log('  ║  POST  /auth/register                  ║');
  console.log('  ║  POST  /auth/login                     ║');
  console.log('  ║  GET   /auth/verify-email              ║');
  console.log('  ║  POST  /auth/resend-verification       ║');
  console.log('  ║  POST  /auth/forgot-password           ║');
  console.log('  ║  POST  /auth/reset-password            ║');
  console.log('  ║  POST  /auth/refresh                   ║');
  console.log('  ║  GET   /auth/me                        ║');
  console.log('  ║  POST  /auth/logout                    ║');
  console.log('  ║  GET   /auth/google                    ║');
  console.log('  ║  GET   /auth/google/callback           ║');
  console.log('  ║  POST  /auth/google/verify             ║');
  console.log('  ╚════════════════════════════════════════╝');
  console.log('');

  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your-')) {
    console.warn('  ⚠  GOOGLE_CLIENT_ID not set — Google login disabled');
    console.warn('     https://console.cloud.google.com → APIs & Services → Credentials\n');
  } else {
    console.log('  ✓  Google OAuth configured');
  }

  if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('your-')) {
    console.warn('  ⚠  SMTP not configured — emails will be skipped (auth still works)\n');
  } else {
    console.log('  ✓  SMTP email configured\n');
  }
});

module.exports = app;
