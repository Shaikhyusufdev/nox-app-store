const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireAdmin, requireRole } = require('../lib/auth');

const okId = (v) => z.string().uuid().safeParse(v).success;

// Match ke joined players (team/slot ke saath) - admin result ke liye
router.get('/:id/participants', requireAdmin, async (req, res) => {
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const { data: t, error } = await db.from('tournament_public')
    .select('id,title,status,mode,team_size,team_count,layout,prize_pool,prize_distribution,joined_count')
    .eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not load match' });
  if (!t) return res.status(404).json({ error: 'Match not found' });
  const { data: rows, error: e2 } = await db.from('tournament_participants')
    .select('team_no,slot_no,placement,prize_won,users(username)')
    .eq('tournament_id', t.id)
    .order('team_no', { ascending: true })
    .order('slot_no', { ascending: true });
  if (e2) return res.status(500).json({ error: 'Could not load players' });
  const participants = (rows || []).map((p) => {
    const u = (Array.isArray(p.users) ? p.users[0] : p.users) || {};
    return { team_no: p.team_no, slot_no: p.slot_no, placement: p.placement, prize_won: p.prize_won, username: u.username || '?' };
  });
  res.json({ tournament: t, participants });
});

// Result: rank -> team. Prize DB function (atomic + ek hi baar) se bantta hai.
router.post('/:id/payout', requireAdmin, requireRole('super_admin', 'admin'), async (req, res) => {
  try {
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const p = z.object({
    results: z.array(z.object({
      rank: z.number().int().min(1).max(50),
      team_no: z.number().int().min(1).max(64),
    })).min(1).max(50),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Invalid result' });
  const { data, error } = await db.rpc('award_prizes', { p_tournament: req.params.id, p_results: p.data.results });
  if (error) {
    const m = String(error.message || '');
    const map = [
      ['ALREADY_PAID', 409, 'Is match ka prize pehle hi mil chuka hai'],
      ['NOT_LIVE', 400, 'Pehle match ko Ongoing karo (Room / Start), phir result do'],
      ['CANCELLED', 400, 'Cancelled match me prize nahi diya ja sakta'],
      ['INVALID_RANK', 400, 'Is rank ka prize set nahi hai'],
      ['DUPLICATE', 400, 'Ek rank ya ek team do baar chuni gayi hai'],
      ['TEAM_EMPTY', 400, 'Chuni hui team me koi player nahi hai'],
      ['NO_RESULTS', 400, 'Kam se kam ek rank chuno'],
      ['NOT_FOUND', 404, 'Match nahi mila'],
    ];
    const hit = map.find((x) => m.includes(x[0]));
    if (hit) return res.status(hit[1]).json({ error: hit[2] });
    console.error('award_prizes', error);
    return res.status(500).json({ error: 'Prize nahi mil paya' });
  }
  await db.from('admin_logs').insert({
    admin_id: req.admin.id, action: 'award_prizes', target_type: 'tournament', target_id: req.params.id,
    details: { results: p.data.results, paid_total: data && data.paid_total }, ip: req.ip,
  });
  res.json({ ok: true, result: data });
  } catch (e) {
    console.error('payout', e);
    res.status(500).json({ error: 'Prize nahi mil paya, dobara try karo' });
  }
});

module.exports = router;