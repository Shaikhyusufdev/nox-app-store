const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { signUser, requireUser, cookieOpts } = require('../lib/auth');
const { sendMail, brandedEmail } = require('../lib/mailer');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const WEEK = 7 * 24 * 3600 * 1000;
const RESET_MINUTES = 30;
const MAX_CODE_ATTEMPTS = 5;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// code ka hash user id ke saath banta hai, taaki same code do users ka same hash na bane
const codeHash = (userId, code) => sha(userId + ':' + code);

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
      // purane unused codes band karo, sirf naya code chalega
      await db.from('password_resets').update({ used_at: new Date().toISOString() }).eq('user_id', u.id).is('used_at', null);
      const code = String(crypto.randomInt(100000, 1000000)); // 6 digit
      const { error } = await db.from('password_resets').insert({
        user_id: u.id,
        token_hash: codeHash(u.id, code),
        expires_at: new Date(Date.now() + RESET_MINUTES * 60 * 1000).toISOString(),
        attempts: 0,
      });
      if (error) {
        console.error(error);
      } else {
        // await zaroori hai: Vercel par response ke baad function ruk jata hai, bina await mail miss ho sakti hai
        try {
          await sendMail(u.email, 'Your NOXHUB password reset code', brandedEmail({
            title: 'Reset your password',
            intro: 'Use this code to reset your NOXHUB password. It is valid for ' + RESET_MINUTES + ' minutes.',
            code,
            note: 'Never share this code with anyone. NOXHUB will never ask for it.',
          }));
        } catch (e) { console.error(e); }
      }
    }
  }
  res.json({ message: 'If that email exists, a reset code has been sent.' });
});

router.post('/reset-password', limiter, async (req, res) => {
  const parsed = z.object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6 digit code'),
    password: z.string().min(8).max(100),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { email, code, password } = parsed.data;
  const BAD = { error: 'Code is invalid or expired. Please request a new code.' };

  const { data: u } = await db.from('users').select('id,token_version').eq('email', email.toLowerCase()).maybeSingle();
  if (!u) return res.status(400).json(BAD);

  const { data: r } = await db.from('password_resets').select('*')
    .eq('user_id', u.id).is('used_at', null).gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false }).limit(1).maybeSingle();
  if (!r || (r.attempts || 0) >= MAX_CODE_ATTEMPTS) return res.status(400).json(BAD);

  const a = Buffer.from(r.token_hash, 'hex');
  const b = Buffer.from(codeHash(u.id, code), 'hex');
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) {
    await db.from('password_resets').update({ attempts: (r.attempts || 0) + 1 }).eq('id', r.id);
    return res.status(400).json(BAD);
  }

  const hash = await bcrypt.hash(password, 12);
  await db.from('users').update({ password_hash: hash, token_version: u.token_version + 1 }).eq('id', u.id); // purane sessions invalid
  await db.from('password_resets').update({ used_at: new Date().toISOString() }).eq('id', r.id);
  res.json({ message: 'Password updated. Please log in.' });
});

module.exports = router;