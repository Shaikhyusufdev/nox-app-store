// Cashfree Payment Gateway helper (koi extra npm package nahi, Node ka built-in fetch)
const crypto = require('crypto');

const isProd = process.env.CASHFREE_ENV === 'production';
const BASE = isProd ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
const mode = isProd ? 'production' : 'sandbox';
const configured = () => !!(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);

async function cf(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'x-client-id': process.env.CASHFREE_APP_ID,
      'x-client-secret': process.env.CASHFREE_SECRET_KEY,
      'x-api-version': '2023-08-01',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.message || 'Cashfree error');
    e.status = res.status;
    throw e;
  }
  return data;
}

const createOrder = (body) => cf('POST', '/orders', body);
const getPayments = (orderId) => cf('GET', `/orders/${encodeURIComponent(orderId)}/payments`);

// Webhook signature = base64( HMAC-SHA256( timestamp + rawBody, SECRET ) )
function verifyWebhook(rawBody, signature, timestamp) {
  if (!signature || !timestamp || !process.env.CASHFREE_SECRET_KEY) return false;
  const expected = crypto.createHmac('sha256', process.env.CASHFREE_SECRET_KEY).update(timestamp + rawBody).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { mode, configured, createOrder, getPayments, verifyWebhook };
