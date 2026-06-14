// auth/services/mailer.js — Auth email service
'use strict';

const nodemailer = require('nodemailer');

let _transport = null;

function getTransport() {
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transport;
}

const FROM = `"${process.env.EMAIL_FROM_NAME || 'STOREFRONT OS'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER}>`;
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── SHARED STYLES ────────────────────────────────────────────
const emailBase = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#080A0E; color:#F0EDE6; font-family:'Segoe UI',Arial,sans-serif; }
    .wrap { max-width:520px; margin:0 auto; padding:48px 24px; }
    .logo { font-size:28px; letter-spacing:6px; color:#C9A84C; font-weight:900; margin-bottom:40px; }
    .card { background:#111620; border:1px solid rgba(255,255,255,0.06); border-radius:8px; overflow:hidden; }
    .card-top { height:4px; background:linear-gradient(90deg,#00E5FF,#C9A84C); }
    .card-body { padding:32px; }
    h1 { font-size:22px; font-weight:600; margin-bottom:12px; color:#F0EDE6; }
    p { font-size:14px; color:#8B929E; line-height:1.7; margin-bottom:16px; }
    .btn {
      display:inline-block; padding:14px 32px; background:#C9A84C; color:#000;
      font-weight:700; font-size:13px; letter-spacing:1px; text-transform:uppercase;
      text-decoration:none; border-radius:4px; margin:8px 0 20px;
    }
    .btn-electric { background:#00E5FF; }
    .code-block {
      background:#080A0E; border:1px solid rgba(255,255,255,0.06); border-radius:4px;
      padding:16px 20px; font-family:monospace; font-size:22px; letter-spacing:6px;
      color:#00E5FF; text-align:center; margin:16px 0;
    }
    .divider { height:1px; background:rgba(255,255,255,0.06); margin:20px 0; }
    .small { font-size:12px; color:#4A5263; }
    .footer { margin-top:32px; text-align:center; font-size:11px; color:#4A5263; }
    .footer a { color:#C9A84C; text-decoration:none; }
    .warning { background:rgba(255,59,92,0.08); border:1px solid rgba(255,59,92,0.2); border-radius:4px; padding:12px 16px; }
    .warning p { color:#FF3B5C; margin:0; font-size:13px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">STOREFRONT OS</div>
    <div class="card">
      <div class="card-top"></div>
      <div class="card-body">
        ${content}
      </div>
    </div>
    <div class="footer">
      STOREFRONT OS · Built by <a href="https://github.com/ATHEL204">ATHEL204</a><br>
      <span style="margin-top:6px;display:block;">If you didn't request this, you can safely ignore this email.</span>
    </div>
  </div>
</body>
</html>
`;

// ─── EMAIL: VERIFY ADDRESS ────────────────────────────────────
async function sendVerificationEmail(user, token) {
  const verifyUrl = `${BASE_URL}/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;

  const html = emailBase(`
    <h1>Verify your email address</h1>
    <p>Hi ${user.display_name || 'there'},</p>
    <p>Click the button below to verify your email address and activate your STOREFRONT OS merchant account.</p>
    <a href="${verifyUrl}" class="btn">✦ Verify Email Address</a>
    <div class="divider"></div>
    <p class="small">Or copy and paste this link into your browser:</p>
    <p class="small" style="word-break:break-all;color:#00E5FF;">${verifyUrl}</p>
    <div class="divider"></div>
    <div class="warning">
      <p>⏱ This link expires in ${process.env.EMAIL_TOKEN_EXPIRES_MINUTES || 60} minutes.</p>
    </div>
  `);

  return sendMail({
    to: user.email,
    subject: 'Verify your STOREFRONT OS account',
    html,
  });
}

// ─── EMAIL: WELCOME (after verify) ───────────────────────────
async function sendWelcomeEmail(user) {
  const html = emailBase(`
    <h1>Welcome to STOREFRONT OS ✦</h1>
    <p>Hi ${user.display_name || 'there'},</p>
    <p>Your account is verified and ready. You can now create storefronts, manage inventory, track orders, and accept Web3 settlements.</p>
    <a href="${BASE_URL}/dashboard" class="btn">Open Dashboard →</a>
    <div class="divider"></div>
    <p class="small">Account: <strong style="color:#F0EDE6;">${user.email}</strong></p>
  `);

  return sendMail({
    to: user.email,
    subject: 'Your STOREFRONT OS account is active',
    html,
  });
}

// ─── EMAIL: GOOGLE WELCOME (no verification needed) ───────────
async function sendGoogleWelcomeEmail(user) {
  const html = emailBase(`
    <h1>Account connected ✦</h1>
    <p>Hi ${user.display_name || 'there'},</p>
    <p>Your Google account has been connected to STOREFRONT OS. You're all set — no password needed.</p>
    <a href="${BASE_URL}/dashboard" class="btn btn-electric" style="color:#000;">Open Dashboard →</a>
    <div class="divider"></div>
    <p class="small">Signed in via: <strong style="color:#F0EDE6;">Google OAuth</strong></p>
    <p class="small">Email: <strong style="color:#F0EDE6;">${user.email}</strong></p>
  `);

  return sendMail({
    to: user.email,
    subject: 'Google account connected — STOREFRONT OS',
    html,
  });
}

// ─── EMAIL: PASSWORD RESET ────────────────────────────────────
async function sendPasswordResetEmail(user, token) {
  const resetUrl = `${BASE_URL}/auth/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

  const html = emailBase(`
    <h1>Reset your password</h1>
    <p>Hi ${user.display_name || 'there'},</p>
    <p>We received a request to reset the password for your STOREFRONT OS account.</p>
    <a href="${resetUrl}" class="btn">Reset Password →</a>
    <div class="divider"></div>
    <p class="small">Or copy this link:</p>
    <p class="small" style="word-break:break-all;color:#00E5FF;">${resetUrl}</p>
    <div class="divider"></div>
    <div class="warning">
      <p>⏱ This link expires in ${process.env.RESET_TOKEN_EXPIRES_MINUTES || 15} minutes.</p>
    </div>
    <div class="divider"></div>
    <p class="small">If you didn't request a password reset, your account is safe — someone may have mistyped their email address.</p>
  `);

  return sendMail({
    to: user.email,
    subject: 'Password reset — STOREFRONT OS',
    html,
  });
}

// ─── EMAIL: LOGIN ALERT ───────────────────────────────────────
async function sendLoginAlertEmail(user, { ipAddress, userAgent }) {
  const html = emailBase(`
    <h1>New login detected</h1>
    <p>Hi ${user.display_name || 'there'},</p>
    <p>A new login was detected on your STOREFRONT OS account.</p>
    <div class="code-block" style="font-size:12px;letter-spacing:1px;text-align:left;padding:16px;">
      <div>Time: ${new Date().toLocaleString()}</div>
      <div>IP: ${ipAddress || 'Unknown'}</div>
      <div style="word-break:break-all;">Device: ${(userAgent || 'Unknown').substring(0, 60)}</div>
    </div>
    <div class="warning">
      <p>Not you? <a href="${BASE_URL}/auth/logout-all" style="color:#FF3B5C;">Revoke all sessions immediately →</a></p>
    </div>
  `);

  return sendMail({
    to: user.email,
    subject: '⚠ New login to your STOREFRONT OS account',
    html,
  });
}

// ─── CORE SEND ────────────────────────────────────────────────
async function sendMail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER) {
    console.log(`[MAILER] SMTP not configured — skipping email to ${to}`);
    console.log(`[MAILER] Subject: ${subject}`);
    return { skipped: true };
  }

  try {
    const info = await getTransport().sendMail({ from: FROM, to, subject, html, text });
    console.log(`[MAILER] Sent: ${subject} → ${to} (${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[MAILER] Failed to send to ${to}:`, err.message);
    throw err;
  }
}

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendGoogleWelcomeEmail,
  sendPasswordResetEmail,
  sendLoginAlertEmail,
};
