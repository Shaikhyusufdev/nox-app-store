const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { signAdmin, requireAdmin, cookieOpts } = require('../lib/auth');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/login', limiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { data: a } = await db.from('admins').select('*').eq('email', parsed.data.email.toLowerCase()).maybeSingle();
  const ok = a && a.is_active && (await bcrypt.compare(parsed.data.password, a.password_hash));
  await db.from('admin_logs').insert({ admin_id: a ? a.id : null, action: ok ? 'login_success' : 'login_failed', details: { email: parsed.data.email }, ip: req.ip });
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  res.cookie('admin_token', signAdmin(a), cookieOpts(8 * 3600 * 1000, 'strict'));
  res.json({ admin: { id: a.id, name: a.name, role: a.role } });
});

router.post('/logout', (req, res) => { res.clearCookie('admin_token', { path: '/' }); res.json({ ok: true }); });
router.get('/me', requireAdmin, (req, res) => res.json({ admin: req.admin }));

module.exports = router;
