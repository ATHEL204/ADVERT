// routes/misc.js — Inquiries, Telemetry, Transactions
'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/schema');
const { asyncHandler, requireFields } = require('../middleware');
const email = require('../services/email');

// ══════════════════════════════════════════════════════════════
// INQUIRIES — HUH store lead capture
// ══════════════════════════════════════════════════════════════

// POST /api/inquiries
router.post('/inquiries', requireFields(['customer_name']), asyncHandler(async (req, res) => {
  const { storefront_id, customer_name, item_interest, size, message, channel } = req.body;
  const id = 'inq-' + uuid().slice(0, 8);

  db.prepare(`
    INSERT INTO inquiries (id, storefront_id, customer_name, item_interest, size, message, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    storefront_id || null,
    customer_name,
    item_interest || null,
    size || null,
    message || null,
    channel || 'email'
  );

  // Non-blocking email to merchant
  const inquiry = db.prepare(`SELECT * FROM inquiries WHERE id = ?`).get(id);
  email.sendInquiryAlert(inquiry).catch(e => console.error('[EMAIL] Inquiry alert failed:', e.message));

  // Generate WhatsApp link if requested
  const waLink = channel === 'whatsapp' && process.env.MERCHANT_WHATSAPP
    ? `https://wa.me/${process.env.MERCHANT_WHATSAPP.replace(/[^0-9]/g, '')}?text=${
        encodeURIComponent(`Hi! I'm interested in ${item_interest || 'an item'} · Size: ${size || 'N/A'} · Name: ${customer_name}`)
      }`
    : null;

  res.status(201).json({
    ok: true,
    data: inquiry,
    whatsappLink: waLink,
    message: 'Inquiry submitted. The merchant has been notified.',
  });
}));

// GET /api/inquiries
router.get('/inquiries', asyncHandler(async (req, res) => {
  const { storefront_id, limit = 20 } = req.query;
  let query = `SELECT * FROM inquiries WHERE 1=1`;
  const params = [];

  if (storefront_id) { query += ` AND storefront_id = ?`; params.push(storefront_id); }
  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(parseInt(limit));

  res.json({ ok: true, data: db.prepare(query).all(...params) });
}));

// ══════════════════════════════════════════════════════════════
// TELEMETRY — Real backend metrics
// ══════════════════════════════════════════════════════════════

// GET /api/telemetry
router.get('/telemetry', asyncHandler(async (req, res) => {
  const { metric, limit = 100 } = req.query;

  let query = `SELECT * FROM telemetry WHERE 1=1`;
  const params = [];

  if (metric) { query += ` AND metric = ?`; params.push(metric); }
  query += ` ORDER BY recorded_at DESC LIMIT ?`;
  params.push(parseInt(limit));

  const rows = db.prepare(query).all(...params);

  // Also compute live stats
  const liveStats = {
    totalOrders: db.prepare(`SELECT COUNT(*) AS c FROM orders`).get().c,
    totalRevenue: db.prepare(`SELECT COALESCE(SUM(subtotal),0) AS s FROM orders WHERE status != 'cancelled'`).get().s,
    totalProducts: db.prepare(`SELECT COUNT(*) AS c FROM products WHERE is_active=1`).get().c,
    totalStorefronts: db.prepare(`SELECT COUNT(*) AS c FROM storefronts WHERE is_active=1`).get().c,
    pendingOrders: db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE status='pending'`).get().c,
    usdcTransactions: db.prepare(`SELECT COUNT(*) AS c FROM transactions`).get().c,
    usdcVolume: db.prepare(`SELECT COALESCE(SUM(amount_usdc),0) AS s FROM transactions`).get().s,
  };

  res.json({ ok: true, data: rows, liveStats });
}));

// POST /api/telemetry — record a metric (called from frontend performance API)
router.post('/telemetry', asyncHandler(async (req, res) => {
  const { metric, value } = req.body;
  if (!metric || value === undefined) {
    return res.status(400).json({ ok: false, error: 'metric and value required' });
  }

  db.prepare(`INSERT INTO telemetry (metric, value) VALUES (?, ?)`).run(metric, parseFloat(value));
  res.status(201).json({ ok: true });
}));

// ══════════════════════════════════════════════════════════════
// TRANSACTIONS — Web3 USDC settlement log
// ══════════════════════════════════════════════════════════════

// GET /api/transactions
router.get('/transactions', asyncHandler(async (req, res) => {
  const { limit = 20, order_id } = req.query;
  let query = `SELECT * FROM transactions WHERE 1=1`;
  const params = [];

  if (order_id) { query += ` AND order_id = ?`; params.push(order_id); }
  query += ` ORDER BY recorded_at DESC LIMIT ?`;
  params.push(parseInt(limit));

  const txs = db.prepare(query).all(...params);

  const summary = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount_usdc), 0) AS volume
    FROM transactions
  `).get();

  res.json({ ok: true, data: txs, summary });
}));

// POST /api/transactions — Log a new Web3 tx (called by RPC listener or webhook)
router.post('/transactions', requireFields(['tx_hash', 'amount_usdc']), asyncHandler(async (req, res) => {
  const { tx_hash, from_addr, to_addr, amount_usdc, order_id, block_num } = req.body;
  const id = uuid();

  try {
    db.prepare(`
      INSERT INTO transactions (id, tx_hash, from_addr, to_addr, amount_usdc, order_id, block_num)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, tx_hash, from_addr || null, to_addr || null, parseFloat(amount_usdc), order_id || null, block_num || null);
  } catch (e) {
    if (e.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ ok: false, error: 'Transaction already recorded' });
    }
    throw e;
  }

  // If linked to an order, auto-mark as paid
  if (order_id) {
    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order_id);
    if (order && order.status === 'pending') {
      db.prepare(`UPDATE orders SET status = 'paid', payment_method = 'usdc', tx_hash = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(tx_hash, order_id);
    }
  }

  const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id);
  res.status(201).json({ ok: true, data: tx });
}));

// ══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════════════════════════════

router.get('/health', (req, res) => {
  const dbCheck = db.prepare(`SELECT 1 AS ok`).get();
  res.json({
    ok: true,
    status: 'ONLINE',
    version: '1.0.0',
    database: dbCheck ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()) + 's',
    environment: process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
