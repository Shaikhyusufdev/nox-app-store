const nodemailer = require('nodemailer');

let transporter = null;
if (!process.env.RESEND_API_KEY && process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendMail(to, subject, html) {
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html }),
    });
    if (!r.ok) throw new Error('Resend failed: ' + r.status + ' ' + (await r.text()));
    return;
  }
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') console.log(`[MAIL to ${to}] ${subject}\n${html}`);
    return;
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
}

const BRAND = 'NOXHUB';
const ACCENT = '#7c5cff';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Branded email. Sab options optional hain: code, buttonText + buttonUrl, note
function brandedEmail({ title, intro, code, buttonText, buttonUrl, note }) {
  const codeBlock = code
    ? `<div style="margin:24px 0;text-align:center">
         <div style="display:inline-block;background:#f4f2ff;border:1px solid #ddd6ff;border-radius:12px;padding:16px 28px;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#2b1f6b">${esc(code)}</div>
       </div>`
    : '';
  const button = buttonText && buttonUrl
    ? `<div style="margin:24px 0;text-align:center">
         <a href="${esc(buttonUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:10px">${esc(buttonText)}</a>
       </div>`
    : '';
  const noteBlock = note
    ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280">${esc(note)}</p>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
        <tr><td align="center" style="padding:8px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:800;letter-spacing:4px;color:#ffffff">
          ${BRAND}<span style="color:${ACCENT}">.</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif">
          <h1 style="margin:0 0 12px;font-size:22px;color:#111827">${esc(title)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#374151">${esc(intro)}</p>
          ${codeBlock}
          ${button}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px">
          ${noteBlock}
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280">If you did not request this, you can safely ignore this email.</p>
        </td></tr>
        <tr><td align="center" style="padding:20px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8b8ba7">
          &copy; ${new Date().getFullYear()} ${BRAND}. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { sendMail, brandedEmail };