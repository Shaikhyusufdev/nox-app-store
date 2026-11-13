const router = require('express').Router();
const { z } = require('zod');
const db = require('../lib/db');
const { requireUser } = require('../lib/auth');

const uidOf = (req) => (req.user && (req.user.id || req.user.sub || req.user.userId)) || null;
const CATS = ['deposit', 'withdrawal', 'match', 'prize', 'account', 'other'];
const COLS = 'id,ticket_no,category,message,status,admin_note,created_at,closed_at';

// Meri requests
router.get('/', requireUser, async (req, res) => {
  try {
    const uid = uidOf(req);
    if (!uid) return res.status(401).json({ error: 'Login karo' });
    const { data, error } = await db.from('support_tickets').select(COLS).eq('user_id', uid)
      .order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    res.json({ tickets: data || [] });
  } catch (e) {
    console.error('support list', e);
    res.status(500).json({ error: 'Requests load nahi hui' });
  }
});

// Nayi request (ID automatic banta hai)
router.post('/', requireUser, async (req, res) => {
  try {
    const uid = uidOf(req);
    if (!uid) return res.status(401).json({ error: 'Login karo' });
    const p = z.object({
      category: z.enum(CATS),
      message: z.string().trim().min(10, 'Problem thodi detail me likho (kam se kam 10 letters)').max(1000),
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const { count } = await db.from('support_tickets').select('id', { count: 'exact', head: true })
      .eq('user_id', uid).eq('status', 'open');
    if ((count || 0) >= 5) return res.status(429).json({ error: 'Aapki 5 requests abhi open hain. Pehle unke close hone ka wait karo' });
    const { data, error } = await db.from('support_tickets')
      .insert({ user_id: uid, category: p.data.category, message: p.data.message })
      .select(COLS).single();
    if (error) throw error;
    res.json({ ticket: data });
  } catch (e) {
    console.error('support create', e);
    res.status(500).json({ error: 'Request nahi bhej paye, dobara try karo' });
  }
});

module.exports = router;