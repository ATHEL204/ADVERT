# STOREFRONT OS — Backend API
### Built by [ATHEL204](https://github.com/ATHEL204)

A production-grade Node.js + Express backend powering the Micro-Storefront Platform.
SQLite database, real-time WebSocket server, email notifications, and a Web3 transaction listener.

---

## Architecture

```
backend/
├── server.js              ← Express app + HTTP server boot
├── .env.example           ← Environment variable template
├── package.json
│
├── db/
│   ├── schema.js          ← SQLite schema + WAL mode init
│   └── seed.js            ← Realistic seed data (2 stores, 12 products, 6 orders)
│
├── middleware/
│   └── index.js           ← Error handler, async wrapper, field validator
│
├── routes/
│   ├── storefronts.js     ← Storefront + Product CRUD
│   ├── orders.js          ← Order management + email + WS broadcast
│   └── misc.js            ← Inquiries, telemetry, transactions, health
│
└── services/
    ├── email.js           ← Nodemailer (order confirm + merchant alerts)
    └── websocket.js       ← WS server: real-time telemetry, TX feed, order updates

storefront/
└── js/
    ├── app.js             ← All frontend interactivity
    └── api.js             ← Backend API client + WebSocket listener  ← NEW
```

---

## Quick Start

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — set SMTP credentials and MERCHANT_EMAIL at minimum
```

### 3. Seed the database
```bash
npm run seed
# Creates storefront.db with 2 storefronts, 12 products, 6 orders, 2 USDC transactions
```

### 4. Start the server
```bash
npm run dev      # Development (auto-restart on changes)
npm start        # Production
```

Server boots at **http://localhost:3001**
WebSocket at **ws://localhost:3001/ws**

### 5. Open the frontend
Open `storefront/index.html` directly **or** the backend serves it automatically at `http://localhost:3001`.

Add `api.js` to your HTML (before `app.js`):
```html
<script src="js/api.js"></script>
<script src="js/app.js"></script>
```

---

## API Reference

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server status, DB check, uptime |

### Storefronts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/storefronts` | List all active storefronts |
| POST | `/api/storefronts` | Create storefront (wizard output) |
| GET | `/api/storefronts/:id` | Storefront + products + stats |
| PATCH | `/api/storefronts/:id` | Update storefront config |
| DELETE | `/api/storefronts/:id` | Soft-delete storefront |

### Products
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/storefronts/:id/products` | List products (supports `?tags=shonen,figurart&inStock=true`) |
| POST | `/api/storefronts/:id/products` | Add product |
| PATCH | `/api/storefronts/:id/products/:pid` | Update product / stock |

### Orders
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orders` | List orders (`?status=pending&storefront_id=...`) |
| POST | `/api/orders` | Create order → triggers customer email + merchant alert |
| GET | `/api/orders/:id` | Single order with transactions |
| PATCH | `/api/orders/:id/status` | Update status (pending→paid→shipped) → WS broadcast |
| GET | `/api/orders/stats/summary` | Revenue stats + status breakdown |

### Inquiries (HUH store leads)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/inquiries` | Submit inquiry → email merchant + return WhatsApp link |
| GET | `/api/inquiries` | List inquiries |

### Transactions (Web3)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/transactions` | USDC settlement log |
| POST | `/api/transactions` | Log tx + auto-mark linked order as paid |

### Telemetry
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/telemetry` | Metric history + live stats object |
| POST | `/api/telemetry` | Record a frontend performance metric |

---

## WebSocket Events

Connect to `ws://localhost:3001/ws`

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `CONNECTED` | `{ clientId }` | Sent on connection |
| `TX_HISTORY` | `{ data: tx[] }` | Last 5 USDC transactions |
| `TX_NEW` | `{ data: tx }` | New USDC settlement (every ~6s in sim) |
| `TELEMETRY` | `{ data: metrics }` | Live backend metrics every 2s |
| `ORDER_NEW` | `{ orderId, subtotal }` | New order placed |
| `ORDER_STATUS_UPDATE` | `{ orderId, status }` | Merchant changed order status |

### Client → Server
| Event | Payload |
|-------|---------|
| `PING` | `{}` → server replies `PONG` |
| `SUBSCRIBE_ORDER` | `{ orderId }` → targeted updates |
| `SUBSCRIBE_STOREFRONT` | `{ storefrontId }` |

---

## Database Schema

```sql
storefronts   — Merchant configurations (theme, contact, layout)
products      — Product catalog with JSON sizes/tags
orders        — Customer orders with JSON items array
inquiries     — HUH store lead capture
telemetry     — Time-series performance metrics
transactions  — USDC Web3 settlement log
```

SQLite with WAL mode enabled for concurrent reads.
All JSON columns (items, sizes, tags) are parsed in route handlers.

---

## Email Setup (Gmail)

1. Enable 2FA on your Google account
2. Create an **App Password** at myaccount.google.com → Security → App Passwords
3. Set in `.env`:
```
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx   # the 16-char app password
MERCHANT_EMAIL=merchant@yourdomain.com
```

Emails sent:
- **Customer** — HTML order confirmation on every new order
- **Merchant** — Plain text alert with all order details
- **Merchant** — Inquiry notification from HUH store

---

## Production Checklist

- [ ] Change `JWT_SECRET` to a long random string
- [ ] Set `NODE_ENV=production`
- [ ] Set real `FRONTEND_URL` for CORS
- [ ] Configure SMTP credentials
- [ ] Point `RPC_WS_URL` to a real Base/Ethereum RPC WebSocket endpoint
- [ ] Replace USDC simulator in `services/websocket.js` with `viem` `watchContractEvent`
- [ ] Add HTTPS (reverse proxy: nginx or Caddy)
- [ ] Add authentication middleware for merchant routes

---

## Web3 Production Integration

Replace the `startUsdcSimulator()` in `services/websocket.js` with:

```js
import { createPublicClient, webSocket, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: webSocket(process.env.RPC_WS_URL),
});

client.watchContractEvent({
  address: process.env.USDC_CONTRACT_BASE,
  abi: [parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')],
  eventName: 'Transfer',
  args: { to: process.env.MERCHANT_WALLET },
  onLogs: (logs) => {
    logs.forEach(log => {
      const amountUsdc = Number(log.args.value) / 1e6; // USDC has 6 decimals
      broadcastTransaction({ from_addr: log.args.from, amount_usdc: amountUsdc, tx_hash: log.transactionHash });
    });
  },
});
```

---

*STOREFRONT OS · github.com/ATHEL204*
