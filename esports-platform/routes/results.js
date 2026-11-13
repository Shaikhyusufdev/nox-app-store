const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireUser } = require('../lib/auth');

const uidOf = (req) => (req.user && (req.user.id || req.user.sub || req.user.userId)) || null;

const RECENT_MIN = 60; // match khatam hone ke itne minute tak Home par "Just ended" dikhega (sirf joined user ko)

// Joined user ke haal hi me khatam hue matches (Home ke liye)
router.get('/recent', requireUser, async (req, res) => {
  try {
    const uid = uidOf(req);
    if (!uid) return res.status(401).json({ error: 'Login karo' });
    const { data: mine, error } = await db.from('tournament_participants').select('tournament_id,prize_won').eq('user_id', uid);
    if (error) throw error;
    const ids = (mine || []).map((x) => x.tournament_id);
    if (!ids.length) return res.json({ recent: [] });
    const since = new Date(Date.now() - RECENT_MIN * 60000).toISOString();
    const { data: ts, error: e2 } = await db.from('tournaments')
      .select('id,title,mode,starts_at,completed_at,match_categories(name)')
      .in('id', ids).eq('status', 'completed').gte('completed_at', since)
      .order('completed_at', { ascending: false }).limit(10);
    if (e2) throw e2;
    const prize = {};
    (mine || []).forEach((x) => { prize[x.tournament_id] = (prize[x.tournament_id] || 0) + Number(x.prize_won || 0); });
    res.json({ recent: (ts || []).map((t) => {
      const c = Array.isArray(t.match_categories) ? t.match_categories[0] : t.match_categories;
      return { id: t.id, title: t.title, mode: t.mode, starts_at: t.starts_at, category_name: (c && c.name) || '', my_prize: prize[t.id] || 0 };
    }) });
  } catch (e) {
    console.error('recent', e);
    res.json({ recent: [] });
  }
});

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
