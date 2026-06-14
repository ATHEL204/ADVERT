// middleware/index.js — All middleware
'use strict';

// ─── ERROR HANDLER ────────────────────────────────────────────
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${req.method} ${req.path} →`, err);
  }

  res.status(status).json({
    ok: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

// ─── NOT FOUND ────────────────────────────────────────────────
function notFound(req, res) {
  res.status(404).json({
    ok: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
}

// ─── ASYNC WRAPPER ────────────────────────────────────────────
// Wraps async route handlers so errors go to errorHandler
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── VALIDATION HELPERS ───────────────────────────────────────
function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => {
      const val = req.body[f];
      return val === undefined || val === null || val === '';
    });
    if (missing.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }
    next();
  };
}

// ─── REQUEST TIMING ───────────────────────────────────────────
function requestTiming(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    res.setHeader('X-Response-Time', `${ms}ms`);
    // Log slow requests
    if (ms > 200 && process.env.NODE_ENV !== 'test') {
      console.warn(`[SLOW] ${req.method} ${req.path} took ${ms}ms`);
    }
  });
  next();
}

module.exports = { errorHandler, notFound, asyncHandler, requireFields, requestTiming };
