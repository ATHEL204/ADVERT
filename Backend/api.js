/* ============================================
   api.js — Backend API Client
   Connects the frontend to the Express server
   ============================================ */

const API_BASE = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/ws';

// ─── HTTP CLIENT ──────────────────────────────
const API = {
  async get(path) {
    const res = await fetch(API_BASE + path);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  async post(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  async patch(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
};

// ─── WEBSOCKET CLIENT ─────────────────────────
class RealtimeClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.handlers = {};
    this.connected = false;
  }

  connect() {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.connected = true;
        console.log('[WS] Connected to backend');
        updateBackendStatus(true);
        clearTimeout(this.reconnectTimer);
      };

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this._dispatch(msg);
        } catch (err) {
          console.warn('[WS] Bad message:', e.data);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        updateBackendStatus(false);
        console.log('[WS] Disconnected. Reconnecting in 4s...');
        this.reconnectTimer = setTimeout(() => this.connect(), 4000);
      };

      this.ws.onerror = () => {
        // Silently degrade — frontend still works without WS
      };
    } catch (e) {
      // WebSocket not available
    }
  }

  on(type, handler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
    return this;
  }

  _dispatch(msg) {
    const handlers = this.handlers[msg.type] || [];
    handlers.forEach(h => h(msg));

    // Wildcard handlers
    (this.handlers['*'] || []).forEach(h => h(msg));
  }

  send(data) {
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

const realtime = new RealtimeClient();

// ─── BACKEND STATUS INDICATOR ─────────────────
function updateBackendStatus(online) {
  const indicator = document.getElementById('backend-status');
  if (!indicator) return;
  indicator.className = 'backend-status ' + (online ? 'online' : 'offline');
  indicator.title = online ? 'Backend connected' : 'Backend offline (running in demo mode)';
}

// ─── WIRED API ACTIONS ────────────────────────

// Load live telemetry from backend
async function loadBackendTelemetry() {
  try {
    const res = await API.get('/telemetry');
    const s = res.liveStats;

    // Update hero stats if elements exist
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('stat-orders', s.totalOrders);
    setEl('stat-revenue', '$' + Number(s.totalRevenue).toFixed(0));
    setEl('stat-products', s.totalProducts);
    setEl('stat-storefronts', s.totalStorefronts);
    setEl('stat-usdc-vol', '$' + Number(s.usdcVolume || 0).toFixed(0));
  } catch (e) {
    console.info('[API] Backend not reachable — running in demo mode');
  }
}

// Submit an order to the backend
async function submitOrder(orderData) {
  try {
    const res = await API.post('/orders', orderData);
    return res;
  } catch (e) {
    console.error('[API] Order submission failed:', e.message);
    // Graceful fallback — still show success to user in demo mode
    return {
      ok: true,
      data: { id: 'ORD-DEMO-' + Math.floor(Math.random() * 9999), ...orderData },
      message: 'Demo mode — order logged locally',
    };
  }
}

// Update order status (merchant terminal)
async function updateOrderStatus(orderId, status) {
  try {
    const res = await API.patch(`/orders/${orderId}/status`, { status });
    return res;
  } catch (e) {
    console.info('[API] Status update — backend not reachable, UI-only update');
    return null;
  }
}

// Submit inquiry to backend
async function submitInquiry(data) {
  try {
    const res = await API.post('/inquiries', data);
    return res;
  } catch (e) {
    return null;
  }
}

// Launch storefront via wizard
async function launchStorefront(config) {
  try {
    const res = await API.post('/storefronts', config);
    return res;
  } catch (e) {
    return null;
  }
}

// Load orders for merchant terminal
async function loadOrders(storefrontId) {
  try {
    const query = storefrontId ? `?storefront_id=${storefrontId}` : '';
    const res = await API.get(`/orders${query}`);
    return res.data;
  } catch (e) {
    return null; // Fall back to hardcoded seed data
  }
}

// Record frontend performance metric to backend
async function recordMetric(metric, value) {
  try {
    await API.post('/telemetry', { metric, value });
  } catch (e) {
    // Non-critical
  }
}

// ─── REALTIME HANDLERS ────────────────────────

// When backend sends live telemetry over WS
realtime.on('TELEMETRY', (msg) => {
  const d = msg.data;
  const setMetric = (id, val, unit) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val + unit;
  };
  setMetric('metric-dom', d.domLatency, 'ms');
  setMetric('metric-render', d.renderSpeed, 'ms');
  setMetric('metric-payload', d.networkPayload, 'KB');
  setMetric('metric-tx', d.txSpeed, '/s');
});

// When a new Web3 tx arrives via WS
realtime.on('TX_NEW', (msg) => {
  const tx = msg.data;
  const feed = document.getElementById('tx-feed');
  if (!feed) return;

  const addr = (tx.from_addr || '0x????...????').substring(0, 18) + '...';
  const amt = Number(tx.amount_usdc).toFixed(2);
  const time = new Date(tx.recorded_at).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const row = document.createElement('div');
  row.className = 'tx-row';
  row.innerHTML = `
    <span class="tx-hash">${addr}</span>
    <span class="tx-amount">+$${amt} USDC</span>
    <span class="tx-time">${time}</span>
  `;

  feed.insertBefore(row, feed.firstChild);
  if (feed.children.length > 8) feed.removeChild(feed.lastChild);

  // Use existing showToast (defined in app.js)
  if (typeof showToast === 'function') {
    showToast(`⚡ Settlement: +$${amt} USDC`, 'green');
  }
});

// When an order status changes (broadcast from any merchant)
realtime.on('ORDER_STATUS_UPDATE', (msg) => {
  const badge = document.querySelector(`[data-order="${msg.orderId}"]`);
  if (!badge) return;
  const s = msg.status;
  badge.className = `status-badge status-${s}`;
  badge.innerHTML = `<span>●</span> ${s.charAt(0).toUpperCase() + s.slice(1)}`;
});

// When a new order is placed (show notification)
realtime.on('ORDER_NEW', (msg) => {
  if (typeof showToast === 'function') {
    showToast(`🛒 New order ${msg.orderId} — $${Number(msg.subtotal).toFixed(2)}`, 'gold');
  }
});

// ─── BOOT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  realtime.connect();
  loadBackendTelemetry();

  // Record page load performance
  window.addEventListener('load', () => {
    const timing = performance.timing;
    const loadTime = timing.loadEventEnd - timing.navigationStart;
    if (loadTime > 0) recordMetric('page_load_ms', loadTime);
  });
});

// Export for use in app.js
window.BackendAPI = {
  submitOrder,
  updateOrderStatus,
  submitInquiry,
  launchStorefront,
  loadOrders,
  recordMetric,
  realtime,
};
