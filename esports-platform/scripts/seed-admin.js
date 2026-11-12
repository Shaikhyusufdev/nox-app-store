// Usage: .env me ADMIN_EMAIL / ADMIN_PASSWORD daalo, phir: npm run seed-admin
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
(async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars)');
  const { error } = await db.from('admins').insert({
    email: ADMIN_EMAIL.toLowerCase(), name: ADMIN_NAME || 'Super Admin',
    password_hash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'super_admin',
  });
  if (error) throw error;
  console.log('Super admin created. Ab .env se ADMIN_PASSWORD hata do.');
})().catch((e) => { console.error(e.message); process.exit(1); });
