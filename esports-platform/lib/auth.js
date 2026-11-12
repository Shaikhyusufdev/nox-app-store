const jwt = require('jsonwebtoken');
const db = require('./db');

const isProd = process.env.NODE_ENV === 'production';
const cookieOpts = (maxAge, sameSite = 'lax') => ({ httpOnly: true, secure: isProd, sameSite, maxAge, path: '/' });

const signUser = (u) => jwt.sign({ sub: u.id, tv: u.token_version }, process.env.JWT_SECRET, { expiresIn: '7d', audience: 'user' });
const signAdmin = (a) => jwt.sign({ sub: a.id }, process.env.ADMIN_JWT_SECRET, { expiresIn: '8h', audience: 'admin' });

// Har request pe DB se user dobara check hota hai (block ya password reset turant lagu)
async function requireUser(req, res, next) {
  let user;
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Login required' });
    const p = jwt.verify(token, process.env.JWT_SECRET, { audience: 'user' });
    const { data } = await db.from('users').select('id,email,username,user_code,status,token_version').eq('id', p.sub).maybeSingle();
    if (!data || data.token_version !== p.tv) return res.status(401).json({ error: 'Session expired' });
    if (data.status !== 'active') return res.status(403).json({ error: 'Account blocked' });
    user = data;
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
  req.user = user;
  next();
}

// Admin: alag secret + alag cookie + DB role check HAR request pe
async function requireAdmin(req, res, next) {
  let admin;
  try {
    const token = req.cookies.admin_token;
    if (!token) return res.status(401).json({ error: 'Admin login required' });
    const p = jwt.verify(token, process.env.ADMIN_JWT_SECRET, { audience: 'admin' });
    const { data } = await db.from('admins').select('id,email,name,role,is_active').eq('id', p.sub).maybeSingle();
    if (!data || !data.is_active) return res.status(401).json({ error: 'Admin access revoked' });
    admin = data;
  } catch {
    return res.status(401).json({ error: 'Admin session expired' });
  }
  req.admin = admin;
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.admin.role) || req.admin.role === 'super_admin'
    ? next()
    : res.status(403).json({ error: 'Permission denied' });

module.exports = { signUser, signAdmin, requireUser, requireAdmin, requireRole, cookieOpts };
