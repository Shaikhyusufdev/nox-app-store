const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const cashfree = require('../lib/cashfree');
const { requireUser } = require('../lib/auth');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const AF_MIN = 10, AF_MAX = 10000; // frontend ke Add Funds limits jaise hi

// Paisa credit karne ka EK hi raasta: DB function confirm_deposit (idempotent -- webhook + verify dono chalein to bhi 1 baar hi credit)
async function creditIfPaid(orderId, cfPaymentId, amount) {
  const { data, error } = await db.rpc('confirm_deposit', { p_order_id: orderId, p_cf_payment_id: String(cfPaymentId), p_paid_amount: Number(amount) });
  if (error) throw error;
  return data;
}

// 1) Order banao -> frontend ko payment_session_id do
router.post('/create', limiter, requireUser, async (req, res) => {
  const parsed = z.object({ amount: z.number().min(AF_MIN).max(AF_MAX), phone: z.string().regex(/^[6-9]\d{9}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: `Amount ${AF_MIN}-${AF_MAX} aur sahi 10 digit mobile number do` });
  if (!cashfree.configured()) return res.status(503).json({ error: 'Payment abhi available nahi hai' });

  const amount = Math.round(parsed.data.amount * 100) / 100;
  const orderId = 'dep_' + crypto.randomBytes(12).toString('hex');

  // pehle pending deposit save (webhook aaye to row mil jaye)
  const { data: dep, error: e1 } = await db.from('deposits')
    .insert({ user_id: req.user.id, amount, method: 'cashfree', cf_order_id: orderId }).select('id').single();
  if (e1) { console.error(e1); return res.status(500).json({ error: 'Could not start payment' }); }

  const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const body = {
    order_id: orderId,
    order_amount: amount,
    order_currency: 'INR',
    customer_details: {
      customer_id: req.user.id.replace(/-/g, ''),
      customer_phone: parsed.data.phone,
      customer_email: req.user.email,
      customer_name: req.user.username,
    },
    order_meta: { return_url: `${base}/?order_id={order_id}#/wallet` },
  };
  if (base.startsWith('https://')) body.order_meta.notify_url = `${base}/api/payments/webhook`; // Cashfree notify_url sirf https

  try {
    const o = await cashfree.createOrder(body);
    res.json({ orderId, paymentSessionId: o.payment_session_id, mode: cashfree.mode });
  } catch (ex) {
    console.error('Cashfree create order failed:', ex.message);
    await db.from('deposits').update({ status: 'failed' }).eq('id', dep.id).eq('status', 'pending');
    res.status(502).json({ error: 'Payment start nahi ho paya, dobara try karo' });
  }
});

// 2) Payment ke baad user wapas aaye to status Cashfree se pooch ke confirm karo (webhook late ho tab bhi balance dikhe)
router.get('/verify', limiter, requireUser, async (req, res) => {
  const orderId = String(req.query.order_id || '');
  if (!/^dep_[a-f0-9]{24}$/.test(orderId)) return res.status(400).json({ error: 'Bad order' });
  const { data: d } = await db.from('deposits').select('id,status,amount').eq('cf_order_id', orderId).eq('user_id', req.user.id).maybeSingle();
  if (!d) return res.status(404).json({ error: 'Order not found' });
  if (d.status === 'success') return res.json({ status: 'success', amount: d.amount });

  try {
    const payments = await cashfree.getPayments(orderId);
    const ok = (Array.isArray(payments) ? payments : []).find((p) => p.payment_status === 'SUCCESS');
    if (ok) {
      await creditIfPaid(orderId, ok.cf_payment_id, ok.payment_amount);
      return res.json({ status: 'success', amount: d.amount });
    }
    const anyFail = Array.isArray(payments) && payments.some((p) => ['FAILED', 'USER_DROPPED', 'CANCELLED'].includes(p.payment_status));
    res.json({ status: anyFail ? 'failed' : 'pending' });
  } catch (ex) {
    console.error('verify error:', ex.message || ex);
    res.status(502).json({ error: 'Status check nahi ho paya' });
  }
});

// 3) Cashfree webhook (server.js me raw body ke saath mount hota hai)
async function webhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!cashfree.verifyWebhook(raw, req.headers['x-webhook-signature'], req.headers['x-webhook-timestamp'])) {
    return res.status(401).json({ error: 'Bad signature' });
  }
  let evt;
  try { evt = JSON.parse(raw); } catch { return res.json({ ok: true }); }
  if (evt.type !== 'PAYMENT_SUCCESS_WEBHOOK') return res.json({ ok: true }); // baaki events ignore

  const orderId = evt.data && evt.data.order && evt.data.order.order_id;
  const pay = evt.data && evt.data.payment;
  if (!orderId || !pay || pay.payment_status !== 'SUCCESS') return res.json({ ok: true });
  try {
    await creditIfPaid(orderId, pay.cf_payment_id, pay.payment_amount);
    res.json({ ok: true });
  } catch (ex) {
    const msg = ex.message || '';
    if (msg === 'DEPOSIT_NOT_FOUND' || msg === 'AMOUNT_MISMATCH') { console.error('Webhook rejected:', msg, orderId); return res.json({ ok: true }); } // retry se theek nahi hoga
    console.error('Webhook error:', ex);
    res.status(500).json({ error: 'retry' }); // Cashfree dobara bhejega
  }
}

module.exports = router;
module.exports.webhook = webhook;
