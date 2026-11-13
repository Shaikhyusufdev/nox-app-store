const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireAdmin, requireRole } = require('../lib/auth');

const STATUSES = ['upcoming', 'registration_open', 'full', 'ongoing', 'completed', 'cancelled'];
const money = z.number().min(0).max(1000000);
const bannerUrl = z.string().trim().max(500).refine((v) => v === '' || /^https:\/\//i.test(v), 'Banner URL https:// se shuru hona chahiye');

const body = z.object({
  game_id: z.string().uuid('Game chuno'),
  title: z.string().trim().min(3, 'Title kam se kam 3 letters').max(100),
  description: z.string().trim().max(2000).optional(),
  rules: z.string().trim().max(4000).optional(),
  banner_url: bannerUrl.optional(),
  entry_fee: money,
  prize_pool: money,
  category_id: z.string().uuid('Category chuno'),
  mode: z.enum(['solo', 'duo', 'squad']),
  team_count: z.number().int().min(2).max(64).optional(),
  prize_distribution: z.array(z.object({
    rank: z.number().int().min(1).max(64),
    amount: z.number().positive('Har rank ka prize 0 se zyada hona chahiye').max(1000000),
  })).max(20).optional(),
  starts_at: z.string().datetime({ message: 'Start date/time sahi nahi hai' }),
  status: z.enum(STATUSES),
});

const log = (req, action, details) =>
  db.from('admin_logs').insert({ admin_id: req.admin.id, action, target_type: 'tournament', target_id: details.id, details, ip: req.ip });

// room_id / room_password list me nahi bhejte (admin ko alag GET /:id/room se milte hain)
const strip = (t) => { const { room_id, room_password, ...rest } = t; return rest; };
const r2 = (n) => Math.round(n * 100) / 100;

// mode se team size fix: solo 1, duo 2, squad 4. CS/Lone Wolf jaisi red_blue category me teams hamesha 2 (Red, Blue).
// BR jaisi category me team_count admin deta hai (Solo 48, Duo 32, Squad 12 suggested).
const SIZE = { solo: 1, duo: 2, squad: 4 };
async function shape(category_id, mode, team_count) {
  const { data: c } = await db.from('match_categories').select('id, layout').eq('id', category_id).maybeSingle();
  if (!c) return { error: 'Category nahi mili' };
  const team_size = SIZE[mode];
  const tc = c.layout === 'red_blue' ? 2 : team_count;
  if (!team_size) return { error: 'Mode sahi nahi hai' };
  if (!tc || tc < 2 || tc > 64) return { error: 'Teams/slots 2 se 64 ke beech hone chahiye' };
  return { category_id, mode, team_size, team_count: tc, max_players: tc * team_size, layout: c.layout };
}

// BR me har rank ka prize (poori team/player ka). prize_pool = sab ranks ka total. Squad/Duo me payout ke time team ke players me barabar bantega.
function prizes(sh, dist, pool) {
  if (sh.layout !== 'br') return { prize_distribution: [], prize_pool: r2(pool || 0) };
  const list = (dist || []).map((x, i) => ({ rank: i + 1, amount: r2(Number(x.amount)) }));
  if (!list.length) return { error: 'BR me kam se kam 1st rank ka prize daalo' };
  if (list.length > sh.team_count) return { error: 'Prize ranks teams/slots se zyada nahi ho sakte' };
  return { prize_distribution: list, prize_pool: r2(list.reduce((a, x) => a + x.amount, 0)) };
}

router.use(requireAdmin, requireRole('super_admin', 'admin'));

router.get('/', async (req, res) => {
  const { data, error } = await db.from('tournaments').select('*, games(name)').order('starts_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: 'Could not load tournaments' });
  const ids = data.map((t) => t.id);
  const counts = {};
  if (ids.length) {
    const { data: pub } = await db.from('tournament_public').select('id, joined_count').in('id', ids);
    (pub || []).forEach((p) => { counts[p.id] = p.joined_count; });
  }
  res.json({
    tournaments: data.map((t) => ({ ...strip(t), game_name: t.games ? t.games.name : '', joined_count: counts[t.id] || 0, games: undefined })),
  });
});

router.post('/', async (req, res) => {
  const p = body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const d = p.data;
  const { data: g } = await db.from('games').select('id').eq('id', d.game_id).maybeSingle();
  if (!g) return res.status(400).json({ error: 'Game nahi mila' });
  const sh = await shape(d.category_id, d.mode, d.team_count);
  if (sh.error) return res.status(400).json({ error: sh.error });
  const pz = prizes(sh, d.prize_distribution, d.prize_pool);
  if (pz.error) return res.status(400).json({ error: pz.error });
  const row = {
    game_id: d.game_id,
    title: d.title,
    description: d.description || null,
    rules: d.rules || null,
    banner_url: d.banner_url || null,
    entry_fee: r2(d.entry_fee),
    prize_pool: pz.prize_pool,
    prize_distribution: pz.prize_distribution,
    category_id: sh.category_id,
    mode: sh.mode,
    team_size: sh.team_size,
    team_count: sh.team_count,
    max_players: sh.max_players,
    starts_at: d.starts_at,
    status: d.status,
    created_by: req.admin.id,
  };
  const { data, error } = await db.from('tournaments').insert(row).select().single();
  if (error) return res.status(500).json({ error: 'Could not add tournament' });
  await log(req, 'tournament_create', { id: data.id, title: data.title });
  res.json({ tournament: strip(data) });
});

router.patch('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const p = body.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const d = p.data;

  const { data: cur } = await db.from('tournaments').select('*').eq('id', req.params.id).maybeSingle();
  if (!cur) return res.status(404).json({ error: 'Tournament not found' });
  const { count } = await db.from('tournament_participants').select('id', { count: 'exact', head: true }).eq('tournament_id', cur.id);
  const joined = count || 0;

  // Paisa/slots ki safety: players join ho chuke hon to ye badalna mana hai
  if (joined > 0) {
    if (d.entry_fee !== undefined && r2(d.entry_fee) !== Number(cur.entry_fee))
      return res.status(400).json({ error: 'Players join kar chuke hain, entry fee nahi badal sakte' });
    if (d.game_id !== undefined && d.game_id !== cur.game_id)
      return res.status(400).json({ error: 'Players join kar chuke hain, game nahi badal sakte' });
    if (d.status === 'cancelled')
      return res.status(400).json({ error: 'Players join kar chuke hain. Cancel + refund feature abhi baaki hai' });
  }
  let sh = null;
  let pz = null;
  if (d.category_id !== undefined || d.mode !== undefined || d.team_count !== undefined || d.prize_distribution !== undefined || d.prize_pool !== undefined) {
    sh = await shape(d.category_id || cur.category_id, d.mode || cur.mode, d.team_count !== undefined ? d.team_count : cur.team_count);
    if (sh.error) return res.status(400).json({ error: sh.error });
    if (joined > 0 && (sh.category_id !== cur.category_id || sh.mode !== cur.mode || sh.team_count !== cur.team_count))
      return res.status(400).json({ error: 'Players join kar chuke hain, category/mode/teams nahi badal sakte' });
    pz = prizes(sh, d.prize_distribution !== undefined ? d.prize_distribution : cur.prize_distribution, d.prize_pool !== undefined ? d.prize_pool : cur.prize_pool);
    if (pz.error) return res.status(400).json({ error: pz.error });
    const amts = (a) => (a || []).map((x) => Number(x.amount));
    if (joined > 0 && sh.layout === 'br' && JSON.stringify(amts(pz.prize_distribution)) !== JSON.stringify(amts(cur.prize_distribution)))
      return res.status(400).json({ error: 'Players join kar chuke hain, BR prizes nahi badal sakte' });
  }
  if (d.game_id !== undefined) {
    const { data: g } = await db.from('games').select('id').eq('id', d.game_id).maybeSingle();
    if (!g) return res.status(400).json({ error: 'Game nahi mila' });
  }

  const upd = {};
  ['game_id', 'title', 'starts_at', 'status'].forEach((k) => { if (d[k] !== undefined) upd[k] = d[k]; });
  if (d.description !== undefined) upd.description = d.description || null;
  if (d.rules !== undefined) upd.rules = d.rules || null;
  if (d.banner_url !== undefined) upd.banner_url = d.banner_url || null;
  if (d.entry_fee !== undefined) upd.entry_fee = r2(d.entry_fee);
  if (pz) { upd.prize_pool = pz.prize_pool; upd.prize_distribution = pz.prize_distribution; }
  if (sh) Object.assign(upd, { category_id: sh.category_id, mode: sh.mode, team_size: sh.team_size, team_count: sh.team_count, max_players: sh.max_players });
  if (!Object.keys(upd).length) return res.status(400).json({ error: 'Kuch badla nahi' });

  const { data, error } = await db.from('tournaments').update(upd).eq('id', cur.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not update tournament' });
  await log(req, 'tournament_update', { id: cur.id, changes: Object.keys(upd) });
  res.json({ tournament: strip(data) });
});

router.delete('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const refund = req.query.refund === '1';
  const { data: cur } = await db.from('tournaments').select('id, title').eq('id', req.params.id).maybeSingle();
  if (!cur) return res.status(404).json({ error: 'Tournament not found' });
  const { count } = await db.from('tournament_participants').select('id', { count: 'exact', head: true }).eq('tournament_id', cur.id);

  if (count > 0 && refund) {
    // refund + participants delete + tournament delete, sab ek transaction me (SQL function)
    const { data, error } = await db.rpc('refund_and_delete_tournament', { p_tournament: cur.id });
    if (error) { console.error(error); return res.status(500).json({ error: 'Refund failed: ' + error.message }); }
    await log(req, 'tournament_refund_delete', { id: cur.id, title: cur.title, refunded: data });
    return res.json({ ok: true, ...(data || {}) });
  }

  if (count > 0) {
    const { error: pe } = await db.from('tournament_participants').delete().eq('tournament_id', cur.id);
    if (pe) { console.error(pe); return res.status(500).json({ error: 'Could not remove participants: ' + pe.message }); }
  }
  const { error } = await db.from('tournaments').delete().eq('id', cur.id);
  if (error) { console.error(error); return res.status(500).json({ error: 'Could not delete tournament: ' + error.message }); }
  await log(req, 'tournament_delete', { id: cur.id, title: cur.title, players: count || 0, refunded: false });
  res.json({ ok: true });
});

// ---------- Room ID / password (admin publish karta hai, sirf joined users ko dikhta hai) ----------
const roomBody = z.object({
  room_id: z.string().trim().min(2, 'Room ID likho').max(40),
  room_password: z.string().trim().min(1, 'Password likho').max(40),
  start: z.boolean().optional(), // true = match ko Ongoing bhi kar do
});

router.get('/:id/room', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const { data, error } = await db.from('tournaments').select('room_id, room_password, room_published').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not load room' });
  if (!data) return res.status(404).json({ error: 'Tournament not found' });
  res.json({ room: data });
});

router.put('/:id/room', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const p = roomBody.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { data: cur } = await db.from('tournaments').select('id, status').eq('id', req.params.id).maybeSingle();
  if (!cur) return res.status(404).json({ error: 'Tournament not found' });
  if (cur.status === 'completed' || cur.status === 'cancelled') return res.status(400).json({ error: 'Is match ka room ab publish nahi ho sakta' });
  const upd = { room_id: p.data.room_id, room_password: p.data.room_password, room_published: true };
  const startNow = !!p.data.start && ['upcoming', 'registration_open', 'full'].includes(cur.status);
  if (startNow) upd.status = 'ongoing';
  const { data, error } = await db.from('tournaments').update(upd).eq('id', cur.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not publish room' });
  await log(req, 'tournament_room_publish', { id: cur.id, started: startNow }); // room ID/password log me save nahi karte
  res.json({ ok: true, started: startNow, tournament: strip(data) });
});

// ---------- Match categories (BR, CS, Lone Wolf...) ----------
const catBody = z.object({
  name: z.string().trim().min(2, 'Name kam se kam 2 letters').max(30),
  layout: z.enum(['red_blue', 'br']),
});

router.get('/categories', async (req, res) => {
  const { data, error } = await db.from('match_categories').select('*').order('sort_order').order('created_at');
  if (error) return res.status(500).json({ error: 'Could not load categories' });
  res.json({ categories: data });
});

router.post('/categories', async (req, res) => {
  const p = catBody.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { data, error } = await db.from('match_categories').insert({ name: p.data.name, layout: p.data.layout, sort_order: 100 }).select().single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'Is naam ki category pehle se hai' : 'Could not add category' });
  await log(req, 'category_create', { id: data.id, name: data.name });
  res.json({ category: data });
});

router.patch('/categories/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const p = z.object({ is_active: z.boolean() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Invalid input' });
  const { data, error } = await db.from('match_categories').update({ is_active: p.data.is_active }).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not update category' });
  if (!data) return res.status(404).json({ error: 'Category not found' });
  await log(req, 'category_update', { id: data.id, is_active: data.is_active });
  res.json({ category: data });
});

module.exports = router;