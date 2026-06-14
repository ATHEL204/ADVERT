// db/seed.js — Populate database with realistic starter data
'use strict';

require('dotenv').config();
const { v4: uuid } = require('uuid');
const db = require('./schema');

console.log('🌱 Seeding database...');

// ─── STOREFRONTS ─────────────────────────────────────────────
const huhId = 'storefront-huh-001';
const animeId = 'storefront-anime-001';

const insertStorefront = db.prepare(`
  INSERT OR IGNORE INTO storefronts
    (id, name, category, tagline, theme, layout, whatsapp, email)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

insertStorefront.run(
  huhId, 'HUH Collective', 'Fashion & Apparel',
  'Crafted with precision. Worn with intention.',
  'noir', 'editorial', '+1234567890', 'huh@storefront.os'
);

insertStorefront.run(
  animeId, 'Anime Vault', 'Digital Collectibles',
  'Premium figurarts & licensed digital media.',
  'cyber', 'grid', '+1234567891', 'vault@storefront.os'
);

// ─── PRODUCTS ─────────────────────────────────────────────────
const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products
    (id, storefront_id, name, description, price, stock, sizes, tags, icon, category)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// HUH Products
const huhProducts = [
  {
    id: 'prod-huh-001', name: 'Oversized Bomber Jacket',
    desc: 'Structured silhouette, heavy canvas shell, tonal embroidery.',
    price: 249, stock: 12,
    sizes: JSON.stringify(['XS','S','M','L','XL','XXL']),
    tags: JSON.stringify(['outerwear','new','featured']),
    icon: '🧥', cat: 'Outerwear'
  },
  {
    id: 'prod-huh-002', name: 'Silk Crewneck',
    desc: 'Heavyweight silk-cotton blend, dropped shoulder.',
    price: 119, stock: 28,
    sizes: JSON.stringify(['S','M','L','XL']),
    tags: JSON.stringify(['tops','bestseller']),
    icon: '👕', cat: 'Tops'
  },
  {
    id: 'prod-huh-003', name: 'Utility Cargo Trousers',
    desc: 'Six-pocket cargo silhouette, adjustable ankle cuffs.',
    price: 139, stock: 18,
    sizes: JSON.stringify(['XS','S','M','L','XL','XXL']),
    tags: JSON.stringify(['bottoms','new']),
    icon: '👖', cat: 'Bottoms'
  },
  {
    id: 'prod-huh-004', name: 'Merino Scarf',
    desc: '100% merino wool, oversized 200cm drop.',
    price: 79, stock: 40,
    sizes: JSON.stringify(['ONE SIZE']),
    tags: JSON.stringify(['accessories']),
    icon: '🧣', cat: 'Accessories'
  },
  {
    id: 'prod-huh-005', name: 'Canvas Low Sneaker',
    desc: 'Vulcanized sole, unbleached canvas upper, tonal laces.',
    price: 189, stock: 8,
    sizes: JSON.stringify(['EU38','EU39','EU40','EU41','EU42','EU43','EU44']),
    tags: JSON.stringify(['footwear','limited']),
    icon: '👟', cat: 'Footwear'
  },
];

huhProducts.forEach(p => insertProduct.run(
  p.id, huhId, p.name, p.desc, p.price, p.stock, p.sizes, p.tags, p.icon, p.cat
));

// Anime Vault Products
const animeProducts = [
  {
    id: 'prod-av-001', name: 'One Piece S.H.Figuarts',
    desc: 'Monkey D. Luffy · Gear 5 · Ultra Premium Edition. Approx 16cm.',
    price: 89, stock: 5,
    sizes: null, tags: JSON.stringify(['shonen','figurart','bestseller']),
    icon: '🏴‍☠️', cat: 'Figurarts'
  },
  {
    id: 'prod-av-002', name: 'Demon Slayer Digital Art Print',
    desc: 'Tanjiro Kamado · Limited NFT-linked archival print #0042/500.',
    price: 45, stock: 458,
    sizes: null, tags: JSON.stringify(['shonen','digital','exclusive']),
    icon: '⚡', cat: 'Digital'
  },
  {
    id: 'prod-av-003', name: 'Attack on Titan Box Set',
    desc: 'Survey Corps Squad · Complete 3-piece figurart collection.',
    price: 65, stock: 14,
    sizes: null, tags: JSON.stringify(['seinen','figurart']),
    icon: '🔰', cat: 'Figurarts'
  },
  {
    id: 'prod-av-004', name: 'Naruto Sage Mode Figurart',
    desc: 'Sage Mode · Bandai Premium · 1/8 Scale with diorama base.',
    price: 120, stock: 3,
    sizes: null, tags: JSON.stringify(['shonen','figurart','exclusive']),
    icon: '🌀', cat: 'Figurarts'
  },
  {
    id: 'prod-av-005', name: 'Berserk Archival Print',
    desc: 'Guts · Black Swordsman · Gallery-grade archival giclée.',
    price: 38, stock: 200,
    sizes: null, tags: JSON.stringify(['seinen','digital']),
    icon: '🗡️', cat: 'Digital'
  },
  {
    id: 'prod-av-006', name: 'Jujutsu Kaisen: Gojo Collector Edition',
    desc: 'Satoru Gojo · Infinity Form · Hand-numbered collector\'s box.',
    price: 155, stock: 7,
    sizes: null, tags: JSON.stringify(['shonen','figurart','exclusive']),
    icon: '💎', cat: 'Figurarts'
  },
];

animeProducts.forEach(p => insertProduct.run(
  p.id, animeId, p.name, p.desc, p.price, p.stock, p.sizes, p.tags, p.icon, p.cat
));

// ─── ORDERS ───────────────────────────────────────────────────
const insertOrder = db.prepare(`
  INSERT OR IGNORE INTO orders
    (id, storefront_id, customer_name, customer_email, items, subtotal, status, payment_method, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const seedOrders = [
  {
    id: 'ORD-7841', sf: huhId, name: 'Amara D.', email: 'amara@example.com',
    items: JSON.stringify([{ productId: 'prod-huh-001', name: 'Oversized Bomber Jacket', qty: 1, price: 249 }]),
    subtotal: 249, status: 'pending', method: 'standard',
    date: '2026-05-28T10:22:00'
  },
  {
    id: 'ORD-7842', sf: animeId, name: 'Yuki T.', email: 'yuki@example.com',
    items: JSON.stringify([
      { productId: 'prod-av-001', name: 'One Piece S.H.Figuarts', qty: 1, price: 89 },
      { productId: 'prod-av-002', name: 'Demon Slayer Digital Art', qty: 1, price: 45 }
    ]),
    subtotal: 134, status: 'paid', method: 'usdc',
    date: '2026-05-27T14:05:00'
  },
  {
    id: 'ORD-7843', sf: huhId, name: 'Kofi A.', email: 'kofi@example.com',
    items: JSON.stringify([{ productId: 'prod-huh-003', name: 'Utility Cargo Trousers', qty: 2, price: 139 }]),
    subtotal: 278, status: 'shipped', method: 'standard',
    date: '2026-05-26T09:11:00'
  },
  {
    id: 'ORD-7844', sf: animeId, name: 'Maya R.', email: 'maya@example.com',
    items: JSON.stringify([{ productId: 'prod-av-003', name: 'Attack on Titan Box Set', qty: 1, price: 89 }]),
    subtotal: 89, status: 'pending', method: 'standard',
    date: '2026-05-26T16:44:00'
  },
  {
    id: 'ORD-7845', sf: huhId, name: 'Lena V.', email: 'lena@example.com',
    items: JSON.stringify([
      { productId: 'prod-huh-002', name: 'Silk Crewneck', qty: 1, price: 119 },
      { productId: 'prod-huh-003', name: 'Utility Cargo Trousers', qty: 1, price: 139 },
      { productId: 'prod-huh-004', name: 'Merino Scarf', qty: 1, price: 61 }
    ]),
    subtotal: 319, status: 'paid', method: 'usdc',
    date: '2026-05-25T11:30:00'
  },
  {
    id: 'ORD-7846', sf: animeId, name: 'James O.', email: 'james@example.com',
    items: JSON.stringify([{ productId: 'prod-av-003', name: 'Attack on Titan Box Set', qty: 3, price: 65 }]),
    subtotal: 195, status: 'shipped', method: 'standard',
    date: '2026-05-24T08:00:00'
  },
];

seedOrders.forEach(o => insertOrder.run(
  o.id, o.sf, o.name, o.email, o.items, o.subtotal, o.status, o.method, o.date
));

// ─── SAMPLE TRANSACTIONS ──────────────────────────────────────
const insertTx = db.prepare(`
  INSERT OR IGNORE INTO transactions (id, tx_hash, from_addr, amount_usdc, order_id, block_num, recorded_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insertTx.run(uuid(), '0x4f2ac9...c8d122ef', '0x8b71...a332', 134.00, 'ORD-7842', 18204912, '2026-05-27T14:05:44');
insertTx.run(uuid(), '0xd3a7bc...22efab41', '0x1c0e...f9b4', 319.00, 'ORD-7845', 18201340, '2026-05-25T11:30:12');

console.log('✅ Seed complete.');
console.log('   Storefronts : 2');
console.log('   Products    : ' + (huhProducts.length + animeProducts.length));
console.log('   Orders      : ' + seedOrders.length);
console.log('   Transactions: 2');
