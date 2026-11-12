const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireAdmin, requireRole } = require('../lib/auth');

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const imageUrl = z.string().trim().max(500).refine((v) => v === '' || /^https:\/\//i.test(v), 'Image URL https:// se shuru hona chahiye').optional();
const body = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().max(60).optional(),
  category: z.string().trim().max(40).optional(),
  image_url: imageUrl,
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

const log = (req, action, details) =>
  db.from('admin_logs').insert({ admin_id: req.admin.id, action, details, ip: req.ip });

router.use(requireAdmin, requireRole('super_admin', 'admin'));

router.get('/', async (req, res) => {
  const { data, error } = await db.from('games').select('*').order('sort_order').order('created_at');
  if (error) return res.status(500).json({ error: 'Could not load games' });
  res.json({ games: data });
});

router.post('/', async (req, res) => {
  const p = body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const d = p.data;
  const row = {
    name: d.name,
    slug: slugify(d.slug || d.name),
    category: d.category || null,
    image_url: d.image_url || null,
    is_active: d.is_active !== false,
    sort_order: d.sort_order || 0,
  };
  if (!row.slug) return res.status(400).json({ error: 'Valid slug nahi ban paya' });
  const { data, error } = await db.from('games').insert(row).select().single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'Is slug ka game pehle se hai' : 'Could not add game' });
  await log(req, 'game_create', { id: data.id, name: data.name });
  res.json({ game: data });
});

router.patch('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
  const p = body.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const d = p.data;
  const upd = {};
  if (d.name !== undefined) upd.name = d.name;
  if (d.slug !== undefined) upd.slug = slugify(d.slug);
  if (d.category !== undefined) upd.category = d.category || null;
  if (d.image_url !== undefined) upd.image_url = d.image_url || null;
  if (d.is_active !== undefined) upd.is_active = d.is_active;
  if (d.sort_order !== undefined) upd.sort_order = d.sort_order;
  if (!Object.keys(upd).length) return res.status(400).json({ error: 'Kuch badla nahi' });
  const { data, error } = await db.from('games').update(upd).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'Is slug ka game pehle se hai' : 'Could not update game' });
  if (!data) return res.status(404).json({ error: 'Game not found' });
  await log(req, 'game_update', { id: data.id, changes: Object.keys(upd) });
  res.json({ game: data });
});

module.exports = router;