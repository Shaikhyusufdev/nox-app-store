const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../lib/db');
const { requireAdmin, requireRole } = require('../lib/auth');

// "Delete" = anonymize: email/username/password hat jate hain, account band, transactions waise hi rehte hain
router.delete('/:id', requireAdmin, requireRole('super_admin'), async (req, res) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid id' });
    const { data: u, error } = await db.from('users').select('id,email,username,token_version').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!u) return res.status(404).json({ error: 'User nahi mila' });
    if (String(u.email).endsWith('@deleted.invalid')) return res.status(409).json({ error: 'Ye user pehle hi delete ho chuka hai' });

    const tag = crypto.randomBytes(4).toString('hex');
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10); // koi bhi is password se login nahi kar sakta
    const { error: e2 } = await db.from('users').update({
      email: `deleted_${tag}@deleted.invalid`,
      username: `del_${tag}`,
      password_hash: hash,
      avatar_url: null,
      status: 'blocked',
      token_version: (u.token_version || 0) + 1, // purane login sessions bhi invalid
    }).eq('id', u.id);
    if (e2) throw e2;

    await db.from('password_resets').delete().eq('user_id', u.id);
    await db.from('admin_logs').insert({ admin_id: req.admin.id, action: 'user_delete', target_type: 'user', target_id: u.id, details: null, ip: req.ip });
    res.json({ ok: true });
  } catch (e) {
    console.error('admin user delete', e);
    res.status(500).json({ error: 'User delete nahi ho paya' });
  }
});

module.exports = router;