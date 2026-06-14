// routes/storefronts.js — Storefront & Product CRUD
'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/schema');
const { asyncHandler, requireFields } = require('../middleware');

// ─── GET /api/storefronts ──────────────────────────────────────
// List all active storefronts
router.get('/', asyncHandler(async (req, res) => {
  const storefronts = db.prepare(`
    SELECT s.*,
      COUNT(DISTINCT p.id) AS product_count,
      COUNT(DISTINCT o.id) AS order_count
    FROM storefronts s
    LEFT JOIN products p ON p.storefront_id = s.id AND p.is_active = 1
    LEFT JOIN orders o ON o.storefront_id = s.id
    WHERE s.is_active = 1
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all();

  res.json({ ok: true, data: storefronts });
}));

// ─── GET /api/storefronts/:id ──────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const storefront = db.prepare(`SELECT * FROM storefronts WHERE id = ?`).get(req.params.id);
  if (!storefront) return res.status(404).json({ ok: false, error: 'Storefront not found' });

  const products = db.prepare(`
    SELECT * FROM products WHERE storefront_id = ? AND is_active = 1 ORDER BY created_at DESC
  `).all(req.params.id);

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(subtotal) AS total_revenue,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
      COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count,
      COUNT(CASE WHEN status = 'shipped' THEN 1 END) AS shipped_count
    FROM orders WHERE storefront_id = ?
  `).get(req.params.id);

  res.json({
    ok: true,
    data: {
      ...storefront,
      products: products.map(p => ({
        ...p,
        sizes: p.sizes ? JSON.parse(p.sizes) : null,
        tags: p.tags ? JSON.parse(p.tags) : [],
      })),
      stats,
    },
  });
}));

// ─── POST /api/storefronts ─────────────────────────────────────
// Create new storefront (from wizard)
router.post('/', requireFields(['name', 'category']), asyncHandler(async (req, res) => {
  const { name, category, tagline, theme, layout, whatsapp, email } = req.body;
  const id = 'storefront-' + uuid().slice(0, 8);

  db.prepare(`
    INSERT INTO storefronts (id, name, category, tagline, theme, layout, whatsapp, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, category, tagline || null, theme || 'noir', layout || 'grid', whatsapp || null, email || null);

  const created = db.prepare(`SELECT * FROM storefronts WHERE id = ?`).get(id);
  res.status(201).json({ ok: true, data: created });
}));

// ─── PATCH /api/storefronts/:id ────────────────────────────────
router.patch('/:id', asyncHandler(async (req, res) => {
  const exists = db.prepare(`SELECT id FROM storefronts WHERE id = ?`).get(req.params.id);
  if (!exists) return res.status(404).json({ ok: false, error: 'Storefront not found' });

  const allowed = ['name', 'category', 'tagline', 'theme', 'layout', 'whatsapp', 'email', 'is_active'];
  const updates = Object.entries(req.body)
    .filter(([k]) => allowed.includes(k))
    .map(([k, v]) => `${k} = ?`);
  const values = Object.entries(req.body)
    .filter(([k]) => allowed.includes(k))
    .map(([, v]) => v);

  if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No valid fields to update' });

  db.prepare(`
    UPDATE storefronts SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?
  `).run(...values, req.params.id);

  const updated = db.prepare(`SELECT * FROM storefronts WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, data: updated });
}));

// ─── DELETE /api/storefronts/:id ───────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  db.prepare(`UPDATE storefronts SET is_active = 0 WHERE id = ?`).run(req.params.id);
  res.json({ ok: true, message: 'Storefront deactivated' });
}));

// ══════════════════════════════════════════════════════════════
// PRODUCTS (nested under storefronts)
// ══════════════════════════════════════════════════════════════

// ─── GET /api/storefronts/:id/products ────────────────────────
router.get('/:id/products', asyncHandler(async (req, res) => {
  const { tags, category, inStock } = req.query;

  let query = `SELECT * FROM products WHERE storefront_id = ? AND is_active = 1`;
  const params = [req.params.id];

  if (category) { query += ` AND category = ?`; params.push(category); }
  if (inStock === 'true') { query += ` AND stock > 0`; }

  let products = db.prepare(query + ` ORDER BY created_at DESC`).all(...params);

  // Filter by tags (JSON array)
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim().toLowerCase());
    products = products.filter(p => {
      if (!p.tags) return false;
      const ptags = JSON.parse(p.tags).map(t => t.toLowerCase());
      return tagList.some(t => ptags.includes(t));
    });
  }

  res.json({
    ok: true,
    data: products.map(p => ({
      ...p,
      sizes: p.sizes ? JSON.parse(p.sizes) : null,
      tags: p.tags ? JSON.parse(p.tags) : [],
    })),
    count: products.length,
  });
}));

// ─── POST /api/storefronts/:id/products ───────────────────────
router.post('/:id/products', requireFields(['name', 'price']), asyncHandler(async (req, res) => {
  const { name, description, price, stock, sizes, tags, icon, category } = req.body;
  const id = 'prod-' + uuid().slice(0, 8);

  db.prepare(`
    INSERT INTO products (id, storefront_id, name, description, price, stock, sizes, tags, icon, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.params.id, name, description || null,
    parseFloat(price), parseInt(stock || 0),
    sizes ? JSON.stringify(sizes) : null,
    tags ? JSON.stringify(tags) : null,
    icon || '📦', category || null
  );

  const created = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
  res.status(201).json({ ok: true, data: { ...created, sizes: sizes || null, tags: tags || [] } });
}));

// ─── PATCH /api/storefronts/:id/products/:pid ─────────────────
router.patch('/:id/products/:pid', asyncHandler(async (req, res) => {
  const product = db.prepare(`SELECT * FROM products WHERE id = ? AND storefront_id = ?`)
    .get(req.params.pid, req.params.id);
  if (!product) return res.status(404).json({ ok: false, error: 'Product not found' });

  const allowed = ['name', 'description', 'price', 'stock', 'sizes', 'tags', 'icon', 'category', 'is_active'];
  const setClauses = [];
  const values = [];

  for (const [k, v] of Object.entries(req.body)) {
    if (!allowed.includes(k)) continue;
    setClauses.push(`${k} = ?`);
    values.push(['sizes', 'tags'].includes(k) ? JSON.stringify(v) : v);
  }

  if (setClauses.length === 0) return res.status(400).json({ ok: false, error: 'Nothing to update' });

  db.prepare(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`).run(...values, req.params.pid);

  const updated = db.prepare(`SELECT * FROM products WHERE id = ?`).get(req.params.pid);
  res.json({
    ok: true,
    data: {
      ...updated,
      sizes: updated.sizes ? JSON.parse(updated.sizes) : null,
      tags: updated.tags ? JSON.parse(updated.tags) : [],
    },
  });
}));

module.exports = router;
