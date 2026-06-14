// services/email.js — Nodemailer email service
'use strict';

const nodemailer = require('nodemailer');

// Create transporter (lazy — only when first used)
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

// ─── TEMPLATES ────────────────────────────────────────────────

function orderConfirmationTemplate(order) {
  const itemsHtml = JSON.parse(order.items || '[]')
    .map(i => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #222;">${i.icon || ''} ${i.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #222;text-align:center;">${i.qty}</td>
        <td style="padding:8px 0;border-bottom:1px solid #222;text-align:right;color:#C9A84C;">
          $${(i.price * i.qty).toFixed(2)}
        </td>
      </tr>`)
    .join('');

  return {
    subject: `Order Confirmed · ${order.id}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { background:#080A0E; color:#F0EDE6; font-family:'Segoe UI',sans-serif; margin:0; padding:0; }
    .wrapper { max-width:560px; margin:0 auto; padding:40px 20px; }
    .logo { font-size:32px; letter-spacing:6px; color:#C9A84C; font-weight:900; margin-bottom:32px; }
    .card { background:#111620; border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:28px; margin-bottom:20px; }
    .label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#4A5263; margin-bottom:8px; }
    h2 { font-size:22px; margin:0 0 20px; }
    table { width:100%; border-collapse:collapse; }
    .total { font-size:20px; color:#C9A84C; font-weight:700; text-align:right; padding-top:12px; }
    .status { display:inline-block; padding:4px 14px; border-radius:2px; font-size:12px;
              background:rgba(201,168,76,0.1); border:1px solid rgba(201,168,76,0.3); color:#C9A84C; }
    .footer { font-size:11px; color:#4A5263; text-align:center; margin-top:32px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">STOREFRONT OS</div>

    <div class="card">
      <div class="label">Order Confirmation</div>
      <h2>Thank you, ${order.customer_name}.</h2>
      <p style="color:#8B929E;font-size:14px;margin-bottom:20px;">
        Your order <strong style="color:#F0EDE6;">${order.id}</strong> has been received and is being processed.
      </p>

      <table>
        <thead>
          <tr>
            <th style="text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#4A5263;padding-bottom:8px;">Item</th>
            <th style="text-align:center;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#4A5263;padding-bottom:8px;">Qty</th>
            <th style="text-align:right;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#4A5263;padding-bottom:8px;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div class="total">Total: $${Number(order.subtotal).toFixed(2)}</div>
    </div>

    <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div class="label">Status</div>
        <span class="status">● ${(order.status || 'pending').toUpperCase()}</span>
      </div>
      <div style="text-align:right;">
        <div class="label">Payment</div>
        <span style="font-size:13px;color:#8B929E;">${order.payment_method === 'usdc' ? '⚡ USDC Settlement' : '🏦 Standard'}</span>
      </div>
    </div>

    <div class="footer">
      STOREFRONT OS · Built by ATHEL204 ·
      <a href="https://github.com/ATHEL204" style="color:#C9A84C;">github.com/ATHEL204</a>
    </div>
  </div>
</body>
</html>`,
  };
}

function merchantOrderAlert(order) {
  const items = JSON.parse(order.items || '[]');
  const itemsList = items.map(i => `• ${i.name} × ${i.qty} — $${(i.price * i.qty).toFixed(2)}`).join('\n');

  return {
    subject: `🔔 New Order ${order.id} — $${Number(order.subtotal).toFixed(2)}`,
    text: `
NEW ORDER RECEIVED
━━━━━━━━━━━━━━━━━━
Order ID    : ${order.id}
Customer    : ${order.customer_name}
Email       : ${order.customer_email || 'N/A'}
Phone       : ${order.customer_phone || 'N/A'}
Payment     : ${order.payment_method === 'usdc' ? 'USDC (Web3)' : 'Standard'}

ITEMS:
${itemsList}

TOTAL: $${Number(order.subtotal).toFixed(2)}
Notes: ${order.notes || 'None'}

━━━━━━━━━━━━━━━━━━
Placed at: ${new Date().toLocaleString()}
    `.trim(),
  };
}

function inquiryTemplate(inquiry) {
  return {
    subject: `New Inquiry — ${inquiry.customer_name} (${inquiry.channel})`,
    text: `
STOREFRONT INQUIRY
━━━━━━━━━━━━━━━━━━
From      : ${inquiry.customer_name}
Channel   : ${inquiry.channel}
Item      : ${inquiry.item_interest || 'General'}
Size      : ${inquiry.size || 'Not specified'}
Message   : ${inquiry.message || 'No message'}
━━━━━━━━━━━━━━━━━━
Time: ${new Date().toLocaleString()}
    `.trim(),
  };
}

// ─── SEND FUNCTIONS ───────────────────────────────────────────

async function sendOrderConfirmation(order) {
  if (!process.env.SMTP_USER) {
    console.log('[EMAIL] SMTP not configured — skipping customer confirmation');
    return { skipped: true };
  }

  const template = orderConfirmationTemplate(order);
  const info = await getTransporter().sendMail({
    from: `"STOREFRONT OS" <${process.env.SMTP_USER}>`,
    to: order.customer_email,
    ...template,
  });

  console.log(`[EMAIL] Order confirmation sent to ${order.customer_email} — ${info.messageId}`);
  return info;
}

async function sendMerchantAlert(order) {
  if (!process.env.SMTP_USER || !process.env.MERCHANT_EMAIL) {
    console.log('[EMAIL] SMTP not configured — skipping merchant alert');
    return { skipped: true };
  }

  const template = merchantOrderAlert(order);
  const info = await getTransporter().sendMail({
    from: `"STOREFRONT OS" <${process.env.SMTP_USER}>`,
    to: process.env.MERCHANT_EMAIL,
    ...template,
  });

  console.log(`[EMAIL] Merchant alert sent — ${info.messageId}`);
  return info;
}

async function sendInquiryAlert(inquiry) {
  if (!process.env.SMTP_USER || !process.env.MERCHANT_EMAIL) {
    console.log('[EMAIL] SMTP not configured — skipping inquiry alert');
    return { skipped: true };
  }

  const template = inquiryTemplate(inquiry);
  const info = await getTransporter().sendMail({
    from: `"STOREFRONT OS" <${process.env.SMTP_USER}>`,
    to: process.env.MERCHANT_EMAIL,
    ...template,
  });

  return info;
}

module.exports = { sendOrderConfirmation, sendMerchantAlert, sendInquiryAlert };
