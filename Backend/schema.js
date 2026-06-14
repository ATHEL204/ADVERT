// db/schema.js — Database initialization & schema
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'storefront.db');

// Ensure directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── SCHEMA ──────────────────────────────────────────────────
db.exec(`
  -- Storefronts (merchant configurations)
  CREATE TABLE IF NOT EXISTS storefronts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    tagline     TEXT,
    theme       TEXT DEFAULT 'noir',
    layout      TEXT DEFAULT 'grid',
    whatsapp    TEXT,
    email       TEXT,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- Products
  CREATE TABLE IF NOT EXISTS products (
    id             TEXT PRIMARY KEY,
    storefront_id  TEXT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    description    TEXT,
    price          REAL NOT NULL,
    stock          INTEGER DEFAULT 0,
    sizes          TEXT,          -- JSON array: ["XS","S","M","L","XL"]
    tags           TEXT,          -- JSON array: ["shonen","figurart"]
    icon           TEXT DEFAULT '📦',
    category       TEXT,
    is_active      INTEGER DEFAULT 1,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  -- Orders
  CREATE TABLE IF NOT EXISTS orders (
    id              TEXT PRIMARY KEY,
    storefront_id   TEXT REFERENCES storefronts(id),
    customer_name   TEXT NOT NULL,
    customer_email  TEXT,
    customer_phone  TEXT,
    items           TEXT NOT NULL,   -- JSON array of {productId, name, qty, price}
    subtotal        REAL NOT NULL,
    status          TEXT DEFAULT 'pending',   -- pending | paid | shipped | cancelled
    payment_method  TEXT DEFAULT 'standard',  -- standard | usdc
    tx_hash         TEXT,            -- Web3 tx hash if USDC
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  -- Inquiries (HUH store WhatsApp/email leads)
  CREATE TABLE IF NOT EXISTS inquiries (
    id            TEXT PRIMARY KEY,
    storefront_id TEXT REFERENCES storefronts(id),
    customer_name TEXT NOT NULL,
    item_interest TEXT,
    size          TEXT,
    message       TEXT,
    channel       TEXT DEFAULT 'email',  -- email | whatsapp
    created_at    TEXT DEFAULT (datetime('now'))
  );

  -- Telemetry snapshots (real backend metrics)
  CREATE TABLE IF NOT EXISTS telemetry (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    metric      TEXT NOT NULL,
    value       REAL NOT NULL,
    recorded_at TEXT DEFAULT (datetime('now'))
  );

  -- Web3 transactions log
  CREATE TABLE IF NOT EXISTS transactions (
    id          TEXT PRIMARY KEY,
    tx_hash     TEXT UNIQUE,
    from_addr   TEXT,
    to_addr     TEXT,
    amount_usdc REAL,
    order_id    TEXT REFERENCES orders(id),
    status      TEXT DEFAULT 'confirmed',
    block_num   INTEGER,
    recorded_at TEXT DEFAULT (datetime('now'))
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_orders_storefront ON orders(storefront_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_products_storefront ON products(storefront_id);
  CREATE INDEX IF NOT EXISTS idx_telemetry_metric ON telemetry(metric);
  CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);
`);

module.exports = db;
