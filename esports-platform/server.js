require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET', 'ADMIN_JWT_SECRET']) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

const app = express();
app.set('trust proxy', 1); // Vercel proxy ke peeche
// CSP: admin jo image URL dega (game/tournament banner) wo https se load ho sake, isliye img-src me https: add kiya
const cspDirectives = { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'img-src': ["'self'", 'data:', 'https:'] };
if (process.env.NODE_ENV !== 'production') delete cspDirectives['upgrade-insecure-requests']; // local http pe CSS/JS load hone ke liye
app.use(helmet({ contentSecurityPolicy: { directives: cspDirectives } }));

// NOTE Phase 3: Cashfree webhook ko raw body chahiye (signature verify) -- usse json parser se PEHLE mount karenge
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Extra CSRF guard: state-changing requests sirf same-origin se
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
    const allowed = new URL(process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).origin;
    if (req.headers.origin !== allowed) return res.status(403).json({ error: 'Bad origin' });
  }
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin-auth'));
app.use('/api', require('./routes/tournaments'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

if (!process.env.VERCEL) app.listen(process.env.PORT || 3000, () => console.log('Server running'));
module.exports = app;
