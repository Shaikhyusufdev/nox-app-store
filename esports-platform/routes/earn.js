const router = require('express').Router();
const db = require('../lib/db');
const { requireUser } = require('../lib/auth');

const uidOf = (req) => (req.user && (req.user.id || req.user.sub || req.user.userId)) || null;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

router.use(requireUser);

// Refer & Earn ka data
router.get('/', async (req, res) => {
  const uid = uidOf(req);
  if (!uid) return res.status(401).json({ error: 'Login karo' });
  const [u, st, refs] = await Promise.all([
    db.from('users').select('referral_code').eq('id', uid).maybeSingle(),
    db.from('settings').select('key,value').in('key', ['referral_friend_bonus', 'referral_referrer_bonus']),
    db.from('referrals').select('status,reward_amount').eq('referrer_id', uid),
  ]);
  if (u.error || !u.data) return res.status(500).json({ error: 'Could not load earn data' });
  const S = {};
  (st.data || []).forEach((r) => { S[r.key] = r.value; });
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
  });
});

// Rank: sabse zyada matches join karne wale top par
router.get('/rank', async (req, res) => {
  const uid = uidOf(req);
  if (!uid) return res.status(401).json({ error: 'Login karo' });
  try {
    const { data, error } = await db.rpc('leaderboard', { p_user: uid, p_limit: 50 });
    if (error) throw error;
    const rows = (data || []).map((r) => ({
      rank: Number(r.rnk),
      username: r.username,
      matches: Number(r.matches),
      is_me: r.user_id === uid,
    }));
    res.json({ leaders: rows, me: rows.find((r) => r.is_me) || null });
  } catch (e) {
    console.error('rank error', e);
    res.status(500).json({ error: 'Rank load nahi hua' });
  }
});

module.exports = router;