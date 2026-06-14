// services/websocket.js — Real-time WebSocket server
'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuid } = require('uuid');
const db = require('../db/schema');

let wss = null;
const clients = new Map(); // clientId → ws

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientId = uuid();
    clients.set(clientId, ws);
    console.log(`[WS] Client connected: ${clientId} (total: ${clients.size})`);

    // Send welcome + current state
    sendToClient(ws, {
      type: 'CONNECTED',
      clientId,
      timestamp: new Date().toISOString(),
    });

    // Send recent transactions on connect
    const recentTxs = db.prepare(`
      SELECT * FROM transactions ORDER BY recorded_at DESC LIMIT 5
    `).all();
    sendToClient(ws, { type: 'TX_HISTORY', data: recentTxs });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(ws, clientId, msg);
      } catch (e) {
        sendToClient(ws, { type: 'ERROR', message: 'Invalid JSON' });
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      console.log(`[WS] Client disconnected: ${clientId} (total: ${clients.size})`);
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error for ${clientId}:`, err.message);
      clients.delete(clientId);
    });
  });

  // Simulate Web3 USDC transaction feed
  startUsdcSimulator();

  // Broadcast real telemetry every 2s
  startTelemetryBroadcast();

  console.log('[WS] WebSocket server initialized at /ws');
  return wss;
}

function handleClientMessage(ws, clientId, msg) {
  switch (msg.type) {
    case 'PING':
      sendToClient(ws, { type: 'PONG', ts: Date.now() });
      break;

    case 'SUBSCRIBE_ORDER':
      // Client wants real-time updates for a specific order
      ws._watchingOrder = msg.orderId;
      sendToClient(ws, { type: 'SUBSCRIBED', orderId: msg.orderId });
      break;

    case 'SUBSCRIBE_STOREFRONT':
      ws._watchingStorefront = msg.storefrontId;
      sendToClient(ws, { type: 'SUBSCRIBED', storefrontId: msg.storefrontId });
      break;

    default:
      sendToClient(ws, { type: 'UNKNOWN_EVENT', received: msg.type });
  }
}

// ─── BROADCAST HELPERS ────────────────────────────────────────

function broadcast(payload, filter = null) {
  const data = JSON.stringify(payload);
  clients.forEach((ws, clientId) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (filter && !filter(ws)) return;
    ws.send(data);
  });
}

function sendToClient(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// Broadcast an order status change to all subscribed clients
function broadcastOrderUpdate(order) {
  broadcast({
    type: 'ORDER_STATUS_UPDATE',
    orderId: order.id,
    status: order.status,
    updatedAt: order.updated_at,
  });
}

// Broadcast a new Web3 transaction
function broadcastTransaction(tx) {
  broadcast({ type: 'TX_NEW', data: tx });
}

// ─── USDC SIMULATOR ───────────────────────────────────────────
// In production, replace with viem watchContractEvent on Base L2

const MOCK_ADDRS = [
  '0x4f2a9c3d...c8d1', '0x8b71f432...a332',
  '0x1c0eab91...f9b4', '0xd3a7bc00...22ef',
  '0x5f89de12...7c11', '0xa214cf8e...3b90',
];
const MOCK_AMOUNTS = [12.50, 22.00, 45.00, 48.00, 65.00, 89.00, 120.00, 134.00, 155.00];

function startUsdcSimulator() {
  // Inject first tx after 3s, then randomly every 4–12s
  setTimeout(injectMockTx, 3000);

  setInterval(() => {
    if (Math.random() > 0.35 && clients.size > 0) {
      injectMockTx();
    }
  }, 6000);
}

function injectMockTx() {
  const addr = MOCK_ADDRS[Math.floor(Math.random() * MOCK_ADDRS.length)];
  const amount = MOCK_AMOUNTS[Math.floor(Math.random() * MOCK_AMOUNTS.length)];
  const txHash = '0x' + Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)).join('');
  const blockNum = 18_200_000 + Math.floor(Math.random() * 10000);

  const tx = {
    id: uuid(),
    tx_hash: txHash,
    from_addr: addr,
    to_addr: process.env.MERCHANT_WALLET || '0xMerchant...vault',
    amount_usdc: amount,
    block_num: blockNum,
    recorded_at: new Date().toISOString(),
  };

  // Persist to DB
  try {
    db.prepare(`
      INSERT INTO transactions (id, tx_hash, from_addr, to_addr, amount_usdc, block_num, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tx.id, tx.tx_hash, tx.from_addr, tx.to_addr, tx.amount_usdc, tx.block_num, tx.recorded_at);
  } catch (e) {
    // Ignore duplicate tx_hash on rare collision
  }

  broadcastTransaction(tx);
}

// ─── TELEMETRY BROADCAST ──────────────────────────────────────

function startTelemetryBroadcast() {
  let domBase = 12, renderBase = 4, payloadBase = 142, txBase = 84;

  setInterval(() => {
    if (clients.size === 0) return;

    // Drift values naturally
    domBase = Math.max(6, Math.min(40, domBase + (Math.random() - 0.5) * 3));
    renderBase = Math.max(2, Math.min(15, renderBase + (Math.random() - 0.5) * 1));
    payloadBase = Math.max(80, Math.min(220, payloadBase + (Math.random() - 0.5) * 5));
    txBase = Math.max(40, Math.min(200, txBase + (Math.random() - 0.5) * 8));

    const metrics = {
      domLatency: Math.round(domBase),
      renderSpeed: Math.round(renderBase * 10) / 10,
      networkPayload: Math.round(payloadBase),
      txSpeed: Math.round(txBase),
      activeClients: clients.size,
      timestamp: new Date().toISOString(),
    };

    // Save snapshot
    const insertMetric = db.prepare(`INSERT INTO telemetry (metric, value) VALUES (?, ?)`);
    insertMetric.run('dom_latency', metrics.domLatency);
    insertMetric.run('tx_speed', metrics.txSpeed);

    broadcast({ type: 'TELEMETRY', data: metrics });
  }, 2000);
}

module.exports = { init, broadcast, broadcastOrderUpdate, broadcastTransaction, sendToClient };
