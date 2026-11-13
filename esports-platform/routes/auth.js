const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { signUser, requireUser, cookieOpts } = require('../lib/auth');
const { sendMail } = require('../lib/mailer');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const WEEK = 7 * 24 * 3600 * 1000;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const registerSchema = z.object({
  email: z.string().email().max(120),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, '3-20 letters/numbers/underscore'),
  password: z.string().min(8).max(100),
  ref: z.string().max(20).optional(),
});

router.post('/register', limiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { email, username, password, ref } = parsed.data;

  const { data: s } = await db.from('settings').select('value').eq('key', 'registration_open').maybeSingle();
  if (s && s.value === false) return res.status(403).json({ error: 'Registration is closed' });

  const hash = await bcrypt.hash(password, 12);
  const { data: user, error } = await db.rpc('register_user', { p_email: email, p_username: username, p_hash: hash, p_ref_code: ref || null });
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email or username already taken' });
    console.error(error);
    return res.status(500).json({ error: 'Could not register' });
  }
  res.cookie('token', signUser(user), cookieOpts(WEEK));
  res.status(201).json({ user: { id: user.id, username: user.username, userCode: user.user_code, referralCode: user.referral_code } });
});

router.post('/login', limiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { data: u } = await db.from('users').select('*').eq('email', parsed.data.email.toLowerCase()).maybeSingle();
  const ok = u && (await bcrypt.compare(parsed.data.password, u.password_hash));
  if (!ok) return res.status(401).json({ error: 'Wrong email or password' });
  if (u.status !== 'active') return res.status(403).json({ error: 'Account blocked' });
  res.cookie('token', signUser(u), cookieOpts(WEEK));
  res.json({ user: { id: u.id, username: u.username, userCode: u.user_code } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireUser, async (req, res) => {
  const { data } = await db.from('users')
    .select('id,user_code,email,username,avatar_url,referral_code,xp,level,login_streak,total_matches,total_wins,total_earnings')
    .eq('id', req.user.id).single();
  res.json({ user: data });
});

// Hamesha same response: email exist karta hai ya nahi ye leak nahi hota
router.post('/forgot-password', limiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (parsed.success) {
    const { data: u } = await db.from('users').select('id,email').eq('email', parsed.data.email.toLowerCase()).maybeSingle();
    if (u) {
      const token = crypto.randomBytes(32).toString('hex');
      await db.from('password_resets').insert({ user_id: u.id, token_hash: sha(token), expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
      const link = `${process.env.APP_URL}/#/reset?token=${token}`;
      sendMail(u.email, 'Reset your password', `<p>Reset link (30 min valid): <a href="${link}">${link}</a></p>`).catch(console.error);
    }
  }
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

router.post('/reset-password', limiter, async (req, res) => {
  const parsed = z.object({ token: z.string().min(32), password: z.string().min(8).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { data: r } = await db.from('password_resets').select('*').eq('token_hash', sha(parsed.data.token)).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (!r) return res.status(400).json({ error: 'Link invalid or expired' });
  const hash = await bcrypt.hash(parsed.data.password, 12);
  const { data: u } = await db.from('users').select('token_version').eq('id', r.user_id).single();
  await db.from('users').update({ password_hash: hash, token_version: u.token_version + 1 }).eq('id', r.user_id); // purane sessions invalid
  await db.from('password_resets').update({ used_at: new Date().toISOString() }).eq('id', r.id);
  res.json({ message: 'Password updated. Please login.' });
});

module.exports = router;
