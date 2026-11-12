const router = require('express').Router();
const db = require('../lib/db');
const { requireUser } = require('../lib/auth');

const uidOf = (req) => (req.user && (req.user.id || req.user.sub || req.user.userId)) || null;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// IST (UTC+5:30) ke hisab se aaj ka din shuru
const istDayStart = () => new Date(Math.floor((Date.now() + 19800000) / 86400000) * 86400000 - 19800000);

router.use(requireUser);

// Refer & Earn + Spin ka saara data ek call me
router.get('/', async (req, res) => {
  const uid = uidOf(req);
  if (!uid) return res.status(401).json({ error: 'Login karo' });
  const [u, st, refs, discs, spins] = await Promise.all([
    db.from('users').select('referral_code').eq('id', uid).maybeSingle(),
    db.from('settings').select('key,value').in('key', ['referral_friend_bonus', 'referral_referrer_bonus', 'spin_daily_limit', 'spin_rewards']),
    db.from('referrals').select('status,reward_amount').eq('referrer_id', uid),
    db.from('user_discounts').select('id,type,value,expires_at').eq('user_id', uid).is('used_at', null)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString()).order('created_at', { ascending: false }).limit(50),
    db.from('spin_history').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', istDayStart().toISOString()),
  ]);
  if (u.error || !u.data) return res.status(500).json({ error: 'Could not load earn data' });
  const S = {};
  (st.data || []).forEach((r) => { S[r.key] = r.value; });
  const limit = num(S.spin_daily_limit, 1);
  const used = spins.count || 0;
  const rewards = (Array.isArray(S.spin_rewards) ? S.spin_rewards : []).map((r) => ({ label: r.label, type: r.type, value: r.value }));
  const refRows = refs.data || [];
  res.json({
    referral_code: u.data.referral_code,
    friend_bonus: num(S.referral_friend_bonus, 0),
    referrer_bonus: num(S.referral_referrer_bonus, 0),
    referral: {
      total: refRows.length,
      rewarded: refRows.filter((r) => r.status === 'rewarded').length,
      earned: refRows.reduce((a, r) => a + num(r.reward_amount, 0), 0),
    },
    spin: { rewards, limit, spins_left: Math.max(0, limit - used) },
    discounts: discs.data || [],
  });
});

router.post('/spin', async (req, res) => {
  const uid = uidOf(req);
  if (!uid) return res.status(401).json({ error: 'Login karo' });
  const { data, error } = await db.rpc('spin_wheel', { p_user: uid });
  if (error) {
    const m = String(error.message || '');
    if (m.includes('SPIN_LIMIT')) return res.status(429).json({ error: 'Aaj ka spin ho chuka hai, kal phir aao' });
    if (m.includes('USER_NOT_ALLOWED')) return res.status(403).json({ error: 'Account allowed nahi hai' });
    return res.status(500).json({ error: 'Spin nahi ho paya, dobara try karo' });
  }
  res.json(data);
});

module.exports = router;