const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireAdmin, requireRole } = require('../lib/auth');

const PAGE = 20;
const okId = (v) => z.string().uuid().safeParse(v).success;
const pageOf = (v) => Math.max(1, Math.min(10000, parseInt(v, 10) || 1));
const logA = (req, action, targetId, details) =>
  db.from('admin_logs').insert({ admin_id: req.admin.id, action, target_type: 'support_ticket', target_id: targetId, details, ip: req.ip });

// Saari support requests (status filter: open / closed / khali = sab)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const page = pageOf(req.query.page);
    const status = String(req.query.status || '');
    let q = db.from('support_tickets')
      .select('id,ticket_no,category,message,status,admin_note,created_at,closed_at,users(username,email,user_code)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE, page * PAGE - 1);
    if (status === 'open' || status === 'closed') q = q.eq('status', status);
    const { data, count, error } = await q;
    if (error) throw error;
    const { count: openCount } = await db.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open');
    const tickets = (data || []).map((t) => {
      const { users, ...rest } = t;
      const u = (Array.isArray(users) ? users[0] : users) || {};
      return { ...rest, username: u.username || '', email: u.email || '', user_code: u.user_code || '' };
    });
    res.json({ tickets, total: count || 0, page, page_size: PAGE, open_count: openCount || 0 });
  } catch (e) {
    console.error('admin support list', e);
    res.status(500).json({ error: 'Could not load requests' });
  }
});

// Close / reopen (optional reply user ko dikhega)
router.patch('/:id', requireAdmin, requireRole('super_admin', 'admin'), async (req, res) => {
  try {
    if (!okId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const p = z.object({
      status: z.enum(['open', 'closed']),
      note: z.string().trim().max(500).optional(),
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Invalid input' });
    const upd = { status: p.data.status };
    if (p.data.note !== undefined) upd.admin_note = p.data.note || null;
    if (p.data.status === 'closed') { upd.closed_at = new Date().toISOString(); upd.closed_by = req.admin.id; }
    else { upd.closed_at = null; upd.closed_by = null; }
    const { data, error } = await db.from('support_tickets').update(upd).eq('id', req.params.id).select('id,status').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Request nahi mili' });
    await logA(req, p.data.status === 'closed' ? 'support_close' : 'support_reopen', data.id, { note: p.data.note || null });
    res.json({ ok: true, status: data.status });
  } catch (e) {
    console.error('admin support update', e);
    res.status(500).json({ error: 'Could not update request' });
  }
});

module.exports = router;