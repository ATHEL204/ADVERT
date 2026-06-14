// routes/orders.js — Order management with email + WS broadcast
'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/schema');
const { asyncHandler, requireFields } = require('../middleware');
const email = require('../services/email');
const ws = require('../services/websocket');

const VALID_STATUSES = ['pending', 'paid', 'shipped', 'cancelled'];

// ─── GET /api/orders ──────────────────────────────────────────
// List orders with optional filters
router.get('/', asyncHandler(async (req, res) => {
  const { status, storefront_id, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT o.*,
      s.name AS storefront_name
    FROM orders o
    LEFT JOIN storefronts s ON s.id = o.storefront_id
    WHERE 1=1
  `;
  const params = [];

  if (status) { query += ` AND o.status = ?`; params.push(status); }
  if (storefront_id) { query += ` AND o.storefront_id = ?`; params.push(storefront_id); }

  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM orders WHERE 1=1
    ${status ? ' AND status = ?' : ''}
    ${storefront_id ? ' AND storefront_id = ?' : ''}`
  ).get(...params);

  query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const orders = db.prepare(query).all(...params).map(o => ({
    ...o,
    items: JSON.parse(o.items || '[]'),
  }));

  res.json({
    ok: true,
    data: orders,
    pagination: {
      total: countRow.total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    },
  });
}));

// ─── GET /api/orders/:id ──────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const order = db.prepare(`
    SELECT o.*, s.name AS storefront_name, s.whatsapp AS merchant_whatsapp
    FROM orders o
    LEFT JOIN storefronts s ON s.id = o.storefront_id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });

  // Attach transactions if USDC
  const transactions = order.payment_method === 'usdc'
    ? db.prepare(`SELECT * FROM transactions WHERE order_id = ? ORDER BY recorded_at DESC`).all(order.id)
    : [];

  res.json({
    ok: true,
    data: {
      ...order,
      items: JSON.parse(order.items || '[]'),
      transactions,
    },
  });
}));

// ─── POST /api/orders ─────────────────────────────────────────
// Create new order — fires email + WS broadcast
router.post('/',
  requireFields(['customer_name', 'items', 'subtotal']),
  asyncHandler(async (req, res) => {
    const {
      storefront_id, customer_name, customer_email, customer_phone,
      items, subtotal, payment_method = 'standard', notes,
    } = req.body;

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'items must be a non-empty array' });
    }

    const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO orders
        (id, storefront_id, customer_name, customer_email, customer_phone,
         items, subtotal, status, payment_method, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(
      orderId, storefront_id || null,
      customer_name, customer_email || null, customer_phone || null,
      JSON.stringify(items), parseFloat(subtotal),
      payment_method, notes || null, now, now
    );

    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);

    // ── Fire emails (non-blocking) ──
    Promise.all([
      customer_email ? email.sendOrderConfirmation(order).catch(e => console.error('[EMAIL]', e.message)) : null,
      email.sendMerchantAlert(order).catch(e => console.error('[EMAIL]', e.message)),
    ]);

    // ── Broadcast via WebSocket ──
    ws.broadcast({
      type: 'ORDER_NEW',
      orderId: order.id,
      storefrontId: storefront_id,
      customerName: customer_name,
      subtotal: parseFloat(subtotal),
      status: 'pending',
      timestamp: now,
    });

    res.status(201).json({
      ok: true,
      data: { ...order, items: JSON.parse(order.items) },
      message: 'Order placed successfully',
    });
  })
);

// ─── PATCH /api/orders/:id/status ─────────────────────────────
// Update order status — key merchant action
router.patch('/:id/status', requireFields(['status']), asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });

  const now = new Date().toISOString();
  db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`)
    .run(status, now, req.params.id);

  const updated = { ...order, status, updated_at: now };

  // Broadcast status change via WebSocket
  ws.broadcastOrderUpdate(updated);

  // Email customer on ship
  if (status === 'shipped' && order.customer_email) {
    const shipEmail = {
      subject: `Your order ${order.id} has shipped! 📦`,
      html: `<p style="font-family:sans-serif;color:#333;">
        Hi ${order.customer_name},<br><br>
        Your order <strong>${order.id}</strong> is on its way!<br><br>
        — STOREFRONT OS
      </p>`,
    };
    email.sendOrderConfirmation({ ...updated, _override: shipEmail }).catch(() => {});
  }

  res.json({ ok: true, data: { ...updated, items: JSON.parse(updated.items || '[]') } });
}));

// ─── GET /api/orders/stats/summary ────────────────────────────
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const { storefront_id } = req.query;
  const clause = storefront_id ? 'WHERE storefront_id = ?' : 'WHERE 1=1';
  const params = storefront_id ? [storefront_id] : [];

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_orders,
      COALESCE(SUM(subtotal), 0) AS total_revenue,
      COALESCE(AVG(subtotal), 0) AS avg_order_value,
      COUNT(CASE WHEN status = 'pending'   THEN 1 END) AS pending_count,
      COUNT(CASE WHEN status = 'paid'      THEN 1 END) AS paid_count,
      COUNT(CASE WHEN status = 'shipped'   THEN 1 END) AS shipped_count,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_count,
      COUNT(CASE WHEN payment_method = 'usdc' THEN 1 END) AS usdc_count
    FROM orders ${clause}
  `).get(...params);

  const recentRevenue = db.prepare(`
    SELECT DATE(created_at) AS day, SUM(subtotal) AS revenue
    FROM orders ${clause}
    GROUP BY DATE(created_at)
    ORDER BY day DESC
    LIMIT 7
  `).all(...params);

  res.json({ ok: true, data: { ...stats, recentRevenue } });
}));

module.exports = router;
