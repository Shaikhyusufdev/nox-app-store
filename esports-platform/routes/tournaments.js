const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireUser } = require('../lib/auth');

const ERRORS = {
  USER_NOT_ALLOWED: [403, 'Account not allowed'],
  TOURNAMENT_NOT_FOUND: [404, 'Tournament not found'],
  REGISTRATION_CLOSED: [409, 'Registration is closed'],
  ALREADY_JOINED: [409, 'You already joined this tournament'],
  TOURNAMENT_FULL: [409, 'Tournament is full'],
  INVALID_DISCOUNT: [400, 'Discount invalid, used or expired'],
  INSUFFICIENT_BALANCE: [402, 'Insufficient balance. Please add funds.'],
  SLOT_TAKEN: [409, 'Ye slot kisi aur ne le liya, dusra slot chuno'],
  INVALID_SLOT: [400, 'Slot sahi nahi hai'],
};
const isUuid = (v) => z.string().uuid().safeParse(v).success;

router.get('/games', async (req, res) => {
  const { data } = await db.from('games').select('id,name,slug,category,image_url').eq('is_active', true).order('sort_order');
  res.json({ games: data || [] });
});

router.get('/categories', async (req, res) => {
  const { data } = await db.from('match_categories').select('id,name,layout').eq('is_active', true).order('sort_order').order('created_at');
  res.json({ categories: data || [] });
});

router.get('/tournaments', requireUser, async (req, res) => {
  let q = db.from('tournament_public').select('*').neq('status', 'cancelled').order('starts_at');
  if (req.query.game && isUuid(req.query.game)) q = q.eq('game_id', req.query.game);
  if (req.query.status) q = q.eq('status', String(req.query.status));
  if (req.query.mode && ['solo', 'duo', 'squad'].includes(String(req.query.mode))) q = q.eq('mode', String(req.query.mode));
  const { data, error } = await q.limit(100);
  if (error) return res.status(500).json({ error: 'Could not load tournaments' });

  // completed matches: sirf wahi dikhao jisme ye user joined hai
  const doneIds = data.filter((t) => t.status === 'completed').map((t) => t.id);
  let gone = new Set();
  let mine = new Set();

  if (doneIds.length) {
    const { data: mp } = await db.from('tournament_participants').select('tournament_id').eq('user_id', req.user.id).in('tournament_id', doneIds);
    mine = new Set((mp || []).map((r) => r.tournament_id));
  const { data: dl } = await db.from('tournaments').select('id').in('id', doneIds).not('deleted_at', 'is', null);
    gone = new Set((dl || []).map((r) => r.id));
  }
  res.json({ tournaments: data.filter((t) => t.status !== 'completed' || (mine.has(t.id) && !gone.has(t.id))) });
});

// Room ID/Password sirf: joined user + admin ne publish kiya ho
router.get('/tournaments/:id', requireUser, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Bad id' });
  const { data: t } = await db.from('tournament_public').select('*').eq('id', req.params.id).maybeSingle();
  if (!t) return res.status(404).json({ error: 'Not found' });
  const { data: me } = await db.from('tournament_participants').select('id').eq('tournament_id', t.id).eq('user_id', req.user.id).maybeSingle();
  const { data: players } = await db.from('tournament_participants').select('team_no, slot_no, user_id, users(username)').eq('tournament_id', t.id);
  const out = {
    ...t,
    is_joined: !!me,
    participants: (players || []).map((p) => ({ username: p.users.username, team_no: p.team_no, slot_no: p.slot_no, is_me: p.user_id === req.user.id })),
  };
  if (me && t.room_published) {
    const { data: room } = await db.from('tournaments').select('room_id,room_password').eq('id', t.id).single();
    out.room = room;
  }
  res.json({ tournament: out });
});

router.post('/tournaments/:id/join', requireUser, async (req, res) => {
  const parsed = z.object({ team_no: z.number().int().min(1).max(64), slot_no: z.number().int().min(1).max(4), discountId: z.string().uuid().optional() }).safeParse(req.body || {});
  if (!parsed.success || !isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid input' });
  const { data, error } = await db.rpc('join_tournament_slot', {
    p_user: req.user.id, p_tournament: req.params.id, p_team: parsed.data.team_no, p_slot: parsed.data.slot_no, p_discount_id: parsed.data.discountId || null,
  });
  if (error) {
    const known = ERRORS[error.message];
    if (known) return res.status(known[0]).json({ error: known[1] });
    console.error(error);
    return res.status(500).json({ error: 'Could not join tournament' });
  }
  res.json({ joined: true, ...data });
});

router.get('/my/contests', requireUser, async (req, res) => {
  const { data, error } = await db.from('tournament_participants')
    .select('team_no, slot_no, tournaments(id,title,starts_at,status,entry_fee,prize_pool,mode,team_size,team_count,category_id)')
    .eq('user_id', req.user.id).order('joined_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: 'Could not load contests' });
  res.json({ contests: (data || []).filter((r) => r.tournaments) });
});

router.get('/wallet', requireUser, async (req, res) => {
  const { data: w } = await db.from('wallets').select('deposit_balance,winnings_balance,bonus_balance').eq('user_id', req.user.id).single();
  const { data: tx } = await db.from('transactions').select('type,balance_type,direction,amount,note,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
  const total = w ? Number(w.deposit_balance) + Number(w.winnings_balance) + Number(w.bonus_balance) : 0;
  res.json({ wallet: { ...w, total_balance: total }, transactions: tx || [] });
});

module.exports = router;