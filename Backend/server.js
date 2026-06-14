// server.js — STOREFRONT OS · Main API Server
// Built by ATHEL204 · github.com/ATHEL204
'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// ─── APP INIT ─────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ─── SECURITY & PARSING ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Relaxed for dev; tighten in prod
}));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:5500',   // Live Server
    'http://127.0.0.1:5500',
    'http://localhost:8080',
    'null',                    // file:// protocol during dev
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── LOGGING ──────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── RATE LIMITING ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please slow down.' },
});

// Stricter limit on order creation
const orderLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { ok: false, error: 'Too many orders from this IP, please wait.' },
});

app.use('/api/', limiter);
app.use('/api/orders', orderLimiter);

// ─── REQUEST TIMING ───────────────────────────────────────────
const { requestTiming, errorHandler, notFound } = require('./middleware');
app.use(requestTiming);

// ─── ROUTES ───────────────────────────────────────────────────
const storefrontsRouter = require('./routes/storefronts');
const ordersRouter = require('./routes/orders');
const miscRouter = require('./routes/misc');

app.use('/api/storefronts', storefrontsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api', miscRouter);

// ─── STATIC FRONTEND (optional) ───────────────────────────────
// If you want to serve the frontend from the same process,
// copy your build here. Otherwise run a separate dev server.
const FRONTEND_DIST = path.join(__dirname, '..', 'storefront');
app.use(express.static(FRONTEND_DIST));

// Fallback: serve index.html for any unmatched non-API route
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// ─── 404 & ERROR ─────────────────────────────────────────────
app.use('/api/*', notFound);
app.use(errorHandler);

// ─── WEBSOCKET ────────────────────────────────────────────────
const wsService = require('./services/websocket');
wsService.init(server);

// ─── BOOT ─────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║    STOREFRONT OS · API SERVER         ║');
  console.log('  ║    Built by ATHEL204                  ║');
  console.log('  ╠═══════════════════════════════════════╣');
  console.log(`  ║  HTTP   →  http://localhost:${PORT}      ║`);
  console.log(`  ║  WS     →  ws://localhost:${PORT}/ws     ║`);
  console.log(`  ║  ENV    →  ${(process.env.NODE_ENV || 'development').padEnd(27)}║`);
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
  console.log('  API Endpoints:');
  console.log('  GET    /api/health');
  console.log('  GET    /api/storefronts');
  console.log('  POST   /api/storefronts');
  console.log('  GET    /api/storefronts/:id');
  console.log('  GET    /api/storefronts/:id/products');
  console.log('  POST   /api/storefronts/:id/products');
  console.log('  GET    /api/orders');
  console.log('  POST   /api/orders');
  console.log('  PATCH  /api/orders/:id/status');
  console.log('  GET    /api/orders/stats/summary');
  console.log('  POST   /api/inquiries');
  console.log('  GET    /api/transactions');
  console.log('  POST   /api/transactions');
  console.log('  GET    /api/telemetry');
  console.log('');
});

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('\n[SERVER] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('[SERVER] HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[SERVER] SIGINT received. Shutting down...');
  server.close(() => process.exit(0));
});

module.exports = { app, server };
