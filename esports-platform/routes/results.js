const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireUser } = require('../lib/auth');

const uidOf = (req) => (req.user && (req.user.id || req.user.sub || req.user.userId)) || null;

// Completed match ka result: kaun jeeta (rank ke saath), baaki players. Koi bhi logged-in user dekh sakta hai.
router.get('/:id', requireUser, async (req, res) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
    const uid = uidOf(req);
    const { data: t, error } = await db.from('tournament_public')
      .select('id,title,status,mode,team_size,team_count,layout,prize_pool,prize_distribution')
      .eq('id', req.params.id).maybeSingle();
    if (error) return res.status(500).json({ error: 'Could not load result' });
    if (!t) return res.status(404).json({ error: 'Match not found' });
    if (t.status !== 'completed') return res.status(400).json({ error: 'Result abhi nahi aaya' });
    const { data: rows, error: e2 } = await db.from('tournament_participants')
      .select('user_id,team_no,slot_no,placement,prize_won,users(username)')
      .eq('tournament_id', t.id)
      .order('team_no', { ascending: true })
      .order('slot_no', { ascending: true });
    if (e2) return res.status(500).json({ error: 'Could not load result' });
    const teams = {};
    (rows || []).forEach((p) => {
      const u = (Array.isArray(p.users) ? p.users[0] : p.users) || {};
      const k = p.team_no;
      if (!teams[k]) teams[k] = { team_no: k, placement: null, prize_total: 0, players: [] };
      if (p.placement) teams[k].placement = p.placement;
      teams[k].prize_total += Number(p.prize_won || 0);
      teams[k].players.push({ username: u.username || '?', prize_won: Number(p.prize_won || 0), is_me: p.user_id === uid });
    });
    const list = Object.values(teams).map((x) => ({ ...x, prize_total: Math.round(x.prize_total * 100) / 100 }));
    res.json({
      layout: t.layout, mode: t.mode, team_size: t.team_size, prize_pool: t.prize_pool,
      teams: list,
    });
  } catch (e) {
    console.error('results', e);
    res.status(500).json({ error: 'Could not load result' });
  }
});

module.exports = router;