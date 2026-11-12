const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireAdmin, requireRole } = require('../lib/auth');

const PAGE = 20;
const r2 = (n) => Math.round(n * 100) / 100;
const okId = (v) => z.string().uuid().safeParse(v).success;
const pageOf = (v) => Math.max(1, Math.min(10000, parseInt(v, 10) || 1));
const logA = (req, action, targetType, targetId, details) =>
  db.from('admin_logs').insert({ admin_id: req.admin.id, action, target_type: targetType, target_id: targetId, details, ip: req.ip });

router.use(requireAdmin);

// ---------- Dashboard numbers (SQL function admin_dashboard_stats) ----------
router.get('/stats', async (req, res) => {
  const { data, error } = await db.rpc('admin_dashboard_stats');
  if (error) return res.status(500).json({ error: 'Could not load stats' });
  res.json({ stats: data });
});

// ---------- Users ----------
const WALLET_COLS = 'wallets(deposit_balance,winnings_balance,bonus_balance)';
const flatUser = (u) => {
  const { wallets, ...rest } = u;
  const w = (Array.isArray(wallets) ? wallets[0] : wallets) || {};
  return {
    ...rest,
    deposit_balance: Number(w.deposit_balance || 0),
    winnings_balance: Number(w.winnings_balance || 0),
    bonus_balance: Number(w.bonus_balance || 0),
  };
};

router.get('/users', async (req, res) => {
  const page = pageOf(req.query.page);
  const q = String(req.query.q || '').replace(/[^\w@.\-]/g, '').slice(0, 40);
  let query = db.from('users')
    .select('id,user_code,email,username,status,total_matches,total_wins,total_earnings,created_at,' + WALLET_COLS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or('email.ilike.%' + q + '%,username.ilike.%' + q + '%,user_code.ilike.%' + q + '%');
  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: 'Could not load users' });
  res.json({ users: (data || []).map(flatUser), total: count || 0, page, page_size: PAGE });
});

router.get('/users/:id', async (req, res) => {
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const { data: u, error } = await db.from('users')
    .select('id,user_code,email,username,status,xp,level,total_matches,total_wins,total_earnings,referral_code,created_at,' + WALLET_COLS)
    .eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not load user' });
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { data: tx } = await db.from('transactions')
    .select('type,balance_type,direction,amount,note,created_at')
    .eq('user_id', u.id).order('created_at', { ascending: false }).limit(10);
  res.json({ user: flatUser(u), transactions: tx || [] });
});

// Block / unblock. Block karne par token_version badhta hai (purane login session band ho jaate hain).
router.patch('/users/:id/status', requireRole('super_admin', 'admin'), async (req, res) => {
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const p = z.object({ status: z.enum(['active', 'blocked']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Invalid input' });
  const { data: cur } = await db.from('users').select('id,status,token_version').eq('id', req.params.id).maybeSingle();
  if (!cur) return res.status(404).json({ error: 'User not found' });
  const upd = { status: p.data.status };
  if (p.data.status === 'blocked') upd.token_version = (cur.token_version || 0) + 1;
  const { error } = await db.from('users').update(upd).eq('id', cur.id);
  if (error) return res.status(500).json({ error: 'Could not update user' });
  await logA(req, p.data.status === 'blocked' ? 'user_block' : 'user_unblock', 'user', cur.id, { from: cur.status, to: p.data.status });
  res.json({ ok: true, status: p.data.status });
});

// Manual balance add/cut (ledger me 'admin_adjust' entry ke saath). Sirf super_admin.
router.post('/users/:id/adjust', requireRole('super_admin'), async (req, res) => {
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const p = z.object({
    balance_type: z.enum(['deposit', 'winnings', 'bonus']),
    direction: z.enum(['credit', 'debit']),
    amount: z.number().positive('Amount 0 se zyada ho').max(100000),
    note: z.string().trim().min(3, 'Reason kam se kam 3 letters').max(100),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const d = p.data;
  const { data: u } = await db.from('users').select('id').eq('id', req.params.id).maybeSingle();
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { data: newBal, error } = await db.rpc('wallet_apply', {
    p_user: u.id, p_bal: d.balance_type, p_dir: d.direction, p_amount: r2(d.amount),
    p_type: 'admin_adjust', p_ref_type: 'admin', p_ref_id: null, p_note: 'Admin: ' + d.note,
  });
  if (error) {
    const m = String(error.message || '');
    if (/check|violates/i.test(m)) return res.status(400).json({ error: 'Itna balance nahi hai, cut nahi ho sakta' });
    return res.status(500).json({ error: 'Could not adjust balance' });
  }
  await logA(req, 'balance_adjust', 'user', u.id, { balance_type: d.balance_type, direction: d.direction, amount: r2(d.amount), note: d.note });
  res.json({ ok: true, balance_after: newBal });
});

// ---------- Deposits ----------
router.get('/deposits', async (req, res) => {
  const page = pageOf(req.query.page);
  const status = String(req.query.status || '');
  let query = db.from('deposits')
    .select('id,amount,method,status,cf_order_id,created_at,verified_at,users(username,email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (['pending', 'success', 'failed', 'rejected'].includes(status)) query = query.eq('status', status);
  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: 'Could not load deposits' });
  const deposits = (data || []).map((d) => {
    const { users, ...rest } = d;
    const u = (Array.isArray(users) ? users[0] : users) || {};
    return { ...rest, username: u.username || '', email: u.email || '' };
  });
  res.json({ deposits, total: count || 0, page, page_size: PAGE });
});

module.exports = router;