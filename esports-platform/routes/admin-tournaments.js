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
  starts_at: z.string().datetime({ message: 'Start date/time sahi nahi hai' }),
  status: z.enum(STATUSES),
});

const log = (req, action, details) =>
  db.from('admin_logs').insert({ admin_id: req.admin.id, action, target_type: 'tournament', target_id: details.id, details, ip: req.ip });

// room_id / room_password abhi list me nahi bhejte (wo agle step me alag publish flow se aayenge)
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
  return { category_id, mode, team_size, team_count: tc, max_players: tc * team_size };
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
  const row = {
    game_id: d.game_id,
    title: d.title,
    description: d.description || null,
    rules: d.rules || null,
    banner_url: d.banner_url || null,
    entry_fee: r2(d.entry_fee),
    prize_pool: r2(d.prize_pool),
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
  if (d.category_id !== undefined || d.mode !== undefined || d.team_count !== undefined) {
    sh = await shape(d.category_id || cur.category_id, d.mode || cur.mode, d.team_count !== undefined ? d.team_count : cur.team_count);
    if (sh.error) return res.status(400).json({ error: sh.error });
    if (joined > 0 && (sh.category_id !== cur.category_id || sh.mode !== cur.mode || sh.team_count !== cur.team_count))
      return res.status(400).json({ error: 'Players join kar chuke hain, category/mode/teams nahi badal sakte' });
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
  if (d.prize_pool !== undefined) upd.prize_pool = r2(d.prize_pool);
  if (sh) Object.assign(upd, { category_id: sh.category_id, mode: sh.mode, team_size: sh.team_size, team_count: sh.team_count, max_players: sh.max_players });
  if (!Object.keys(upd).length) return res.status(400).json({ error: 'Kuch badla nahi' });

  const { data, error } = await db.from('tournaments').update(upd).eq('id', cur.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not update tournament' });
  await log(req, 'tournament_update', { id: cur.id, changes: Object.keys(upd) });
  res.json({ tournament: strip(data) });
});

router.delete('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const { data: cur } = await db.from('tournaments').select('id, title').eq('id', req.params.id).maybeSingle();
  if (!cur) return res.status(404).json({ error: 'Tournament not found' });
  const { count } = await db.from('tournament_participants').select('id', { count: 'exact', head: true }).eq('tournament_id', cur.id);
  if (count > 0) return res.status(400).json({ error: 'Players join kar chuke hain, delete nahi ho sakta (refund feature baaki hai)' });
  const { error } = await db.from('tournaments').delete().eq('id', cur.id);
  if (error) return res.status(500).json({ error: 'Could not delete tournament' });
  await log(req, 'tournament_delete', { id: cur.id, title: cur.title });
  res.json({ ok: true });
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