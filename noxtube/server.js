require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const APP_PACKAGE = 'com.noxteam.nox_tube';
const SHORTS_CACHE_MINUTES = 720;
const MAX_SHORT_SECONDS = 60;
const SHORT_TOPICS = [
  '#shorts', 'trending shorts', 'viral shorts', 'funny shorts', 'comedy shorts',
  'music shorts', 'gaming shorts', 'cricket shorts', 'food shorts', 'travel shorts',
  'tech shorts', 'dance shorts', 'news shorts'
];
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Admin se badalne wali settings (sirf yehi keys allowed)
const SETTING_KEYS = [
  'apk_url',
  'maintenance_on', 'maintenance_message',
  'latest_version_code', 'min_version_code', 'update_url', 'update_message',
  'join_enabled', 'telegram_url', 'join_title', 'join_message',
  'broadcast_active', 'broadcast_id', 'broadcast_title', 'broadcast_message',
  'broadcast_btn_text', 'broadcast_btn_url'
];

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function checkAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'];
  if (!process.env.ADMIN_PASSWORD || pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

async function getConfig(key) {
  const { data } = await supabase.from('noxtube_config').select('value').eq('key', key).maybeSingle();
  return data ? data.value : '';
}

async function setConfig(key, value) {
  const { error } = await supabase.from('noxtube_config').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

async function getAllConfig() {
  const { data, error } = await supabase.from('noxtube_config').select('key, value');
  if (error) throw error;
  const out = {};
  (data || []).forEach(r => { out[r.key] = r.value == null ? '' : String(r.value); });
  return out;
}

async function cacheGet(key) {
  try {
    const { data } = await supabase.from('noxtube_cache').select('value, expires_at').eq('key', key).maybeSingle();
    if (data && new Date(data.expires_at) > new Date()) return data.value;
  } catch (_) {}
  return null;
}

async function cacheSet(key, value, minutes) {
  try {
    await supabase.from('noxtube_cache').upsert(
      { key, value, expires_at: new Date(Date.now() + minutes * 60000).toISOString() },
      { onConflict: 'key' }
    );
  } catch (_) {}
}

// YouTube quota har din midnight Pacific Time par reset hota hai.
function nextPacificMidnight() {
  const now = new Date();
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const next = new Date(pt);
  next.setHours(24, 0, 0, 0);
  return new Date(now.getTime() + (next - pt));
}

function parseIsoDuration(iso) {
  const m = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

function isTrue(v) { return String(v) === 'true'; }
function toInt(v) { return parseInt(v, 10) || 0; }

// ---------- Firebase (push notification) ----------
let fcm = null;
function getFcm() {
  if (fcm) return fcm;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    const e = new Error('FIREBASE_SERVICE_ACCOUNT env set nahi hai (Vercel mein add karo)');
    e.status = 503;
    throw e;
  }
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  fcm = admin.messaging();
  return fcm;
}

// ---------- YouTube Data API with key rotation ----------
async function activeKeys() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('noxtube_api_keys')
    .select('*')
    .eq('enabled', true)
    .or(`exhausted_until.is.null,exhausted_until.lt.${nowIso}`)
    .order('uses', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function youtubeGet(endpoint, params) {
  const keys = await activeKeys();
  if (!keys.length) {
    const e = new Error('No active YouTube API key. Add one in admin panel.');
    e.status = 503;
    throw e;
  }
  let lastMsg = 'All keys failed';
  for (const k of keys) {
    let r, j;
    try {
      const qs = new URLSearchParams({ ...params, key: k.api_key });
      r = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`);
      j = await r.json();
    } catch (e) {
      lastMsg = e.message;
      continue;
    }
    if (r.ok) {
      await supabase.from('noxtube_api_keys')
        .update({ uses: (k.uses || 0) + 1, last_error: '' }).eq('id', k.id);
      return j;
    }
    const first = j && j.error && j.error.errors && j.error.errors[0];
    const reason = (first && first.reason) || '';
    const msg = (j && j.error && j.error.message) || `HTTP ${r.status}`;
    lastMsg = msg;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      await supabase.from('noxtube_api_keys')
        .update({ exhausted_until: nextPacificMidnight().toISOString(), last_error: reason }).eq('id', k.id);
    } else {
      await supabase.from('noxtube_api_keys')
        .update({
          last_error: `${reason}: ${msg}`.slice(0, 300),
          exhausted_until: new Date(Date.now() + 3600 * 1000).toISOString()
        }).eq('id', k.id);
    }
  }
  const e = new Error(lastMsg);
  e.status = 502;
  throw e;
}

// ---------- public API ----------

// App ke liye Shorts list. Keys kabhi app ko nahi jati.
app.get('/api/shorts', async (req, res) => {
  try {
    const region = /^[A-Za-z]{2}$/.test(String(req.query.region || ''))
      ? String(req.query.region).toUpperCase() : 'IN';
    const qReq = String(req.query.q || '#shorts').slice(0, 80);
    const q = SHORT_TOPICS.includes(qReq) ? qReq : '#shorts';
    const pageToken = req.query.pageToken ? String(req.query.pageToken).slice(0, 120) : '';

    const cacheKey = `shorts:${region}:${q}:${pageToken}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, s-maxage=300');
      return res.json(cached);
    }

    const params = {
      part: 'snippet', type: 'video', videoDuration: 'short',
      q, regionCode: region, maxResults: '50'
    };
    if (pageToken) params.pageToken = pageToken;
    const search = await youtubeGet('search', params);

    const ids = (search.items || []).map(i => i.id && i.id.videoId).filter(Boolean);
    let items = [];
    if (ids.length) {
      const vids = await youtubeGet('videos', {
        part: 'snippet,contentDetails,statistics', id: ids.join(',')
      });
      items = (vids.items || []).map(v => {
        const th = (v.snippet && v.snippet.thumbnails) || {};
        return {
          id: v.id,
          title: (v.snippet && v.snippet.title) || '',
          channelTitle: (v.snippet && v.snippet.channelTitle) || '',
          channelId: (v.snippet && v.snippet.channelId) || '',
          thumbnailUrl: (th.high || th.medium || th.default || {}).url || '',
          durationSeconds: parseIsoDuration(v.contentDetails && v.contentDetails.duration),
          viewCount: parseInt((v.statistics && v.statistics.viewCount) || '0', 10) || 0,
          publishedAt: (v.snippet && v.snippet.publishedAt) || ''
        };
      }).filter(s => s.durationSeconds > 0 && s.durationSeconds <= MAX_SHORT_SECONDS);
    }

    const out = { items, nextPageToken: search.nextPageToken || null };
    await cacheSet(cacheKey, out, SHORTS_CACHE_MINUTES);
    res.set('Cache-Control', 'public, s-maxage=300');
    res.json(out);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Public config (APK link)
app.get('/api/config', async (req, res) => {
  try {
    res.json({ apk_url: await getConfig('apk_url') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// App open: user register/update + saari app control settings ek call mein.
// Body: { device_id, version_code }
app.post('/api/app/open', async (req, res) => {
  try {
    const body = req.body || {};
    const deviceId = String(body.device_id || '');
    const versionCode = toInt(body.version_code);

    if (DEVICE_ID_RE.test(deviceId)) {
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from('noxtube_users').select('device_id').eq('device_id', deviceId).maybeSingle();
      if (existing) {
        await supabase.from('noxtube_users')
          .update({ last_seen: now, app_version: versionCode }).eq('device_id', deviceId);
      } else {
        await supabase.from('noxtube_users')
          .insert([{ device_id: deviceId, app_version: versionCode, first_seen: now, last_seen: now }]);
      }
    }

    const c = await getAllConfig();
    const latest = toInt(c.latest_version_code);
    const min = toInt(c.min_version_code);
    const hasBroadcast = isTrue(c.broadcast_active) && (c.broadcast_title || c.broadcast_message);

    res.set('Cache-Control', 'no-store');
    res.json({
      maintenance: {
        on: isTrue(c.maintenance_on),
        message: c.maintenance_message || 'App maintenance par hai. Thodi der baad try karo.'
      },
      update: {
        available: latest > versionCode,
        force: min > versionCode,
        latest_code: latest,
        url: c.update_url || c.apk_url || '',
        message: c.update_message || 'Naya version available hai.'
      },
      join: {
        enabled: isTrue(c.join_enabled) && !!c.telegram_url,
        url: c.telegram_url || '',
        title: c.join_title || 'Join our community',
        message: c.join_message || 'Updates aur support ke liye Telegram join karo.'
      },
      broadcast: hasBroadcast ? {
        id: c.broadcast_id || '0',
        title: c.broadcast_title || '',
        message: c.broadcast_message || '',
        button_text: c.broadcast_btn_text || '',
        button_url: c.broadcast_btn_url || ''
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Android App Links verification
app.get('/.well-known/assetlinks.json', (req, res) => {
  const fps = (process.env.ANDROID_SHA256 || '').split(',').map(s => s.trim()).filter(Boolean);
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: APP_PACKAGE,
      sha256_cert_fingerprints: fps
    }
  }]);
});

// Share link landing page: https://tube.noxwinex.store/watch?v=VIDEOID
app.get('/watch', async (req, res) => {
  const id = String(req.query.v || '');
  const valid = VIDEO_ID_RE.test(id);
  let title = 'NOX TUBE';
  if (valid) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`,
        { signal: ctl.signal }
      );
      clearTimeout(timer);
      if (r.ok) {
        const j = await r.json();
        if (j && j.title) title = j.title;
      }
    } catch (_) {}
  }
  const image = valid ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  const url = `https://${req.get('host')}/watch${valid ? '?v=' + id : ''}`;

  let html = fs.readFileSync(path.join(__dirname, 'public', 'watch.html'), 'utf8');
  html = html
    .replace(/__TITLE__/g, () => escapeHtml(title))
    .replace(/__IMAGE__/g, () => escapeHtml(image))
    .replace(/__URL__/g, () => escapeHtml(url));
  res.set('Cache-Control', 'public, s-maxage=3600');
  res.send(html);
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ---------- admin API ----------
app.post('/api/admin/login', (req, res) => {
  const p = process.env.ADMIN_PASSWORD;
  if (p && req.body && req.body.password === p) return res.json({ success: true });
  res.status(401).json({ success: false });
});

app.get('/api/admin/stats', checkAdmin, async (req, res) => {
  try {
    const count = async (since) => {
      let q = supabase.from('noxtube_users').select('device_id', { count: 'exact', head: true });
      if (since) q = q.gte(since.col, since.val);
      const { count: n, error } = await q;
      if (error) throw error;
      return n || 0;
    };
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const [total, active24h, active7d, newToday] = await Promise.all([
      count(null),
      count({ col: 'last_seen', val: ago(86400000) }),
      count({ col: 'last_seen', val: ago(7 * 86400000) }),
      count({ col: 'first_seen', val: startOfDay.toISOString() })
    ]);
    res.json({ total, active24h, active7d, newToday });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/settings', checkAdmin, async (req, res) => {
  try {
    const c = await getAllConfig();
    const out = {};
    SETTING_KEYS.forEach(k => { out[k] = c[k] || ''; });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings', checkAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    for (const k of Object.keys(body)) {
      if (!SETTING_KEYS.includes(k)) continue;
      let v = String(body[k] == null ? '' : body[k]).trim().slice(0, 500);
      if ((k === 'apk_url' || k === 'update_url' || k === 'telegram_url' || k === 'broadcast_btn_url') &&
          v && !/^https:\/\//i.test(v)) {
        return res.status(400).json({ error: `${k}: link https:// se shuru hona chahiye` });
      }
      await setConfig(k, v);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sab users ko in-app popup bhejo (har user ko ek hi baar dikhega)
app.post('/api/admin/broadcast', checkAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 100);
    const message = String(b.message || '').trim().slice(0, 500);
    const btnText = String(b.button_text || '').trim().slice(0, 30);
    const btnUrl = String(b.button_url || '').trim();
    if (!title && !message) return res.status(400).json({ error: 'Title ya message likho' });
    if (btnUrl && !/^https:\/\//i.test(btnUrl)) {
      return res.status(400).json({ error: 'Button link https:// se shuru hona chahiye' });
    }
    await setConfig('broadcast_id', String(Date.now()));
    await setConfig('broadcast_title', title);
    await setConfig('broadcast_message', message);
    await setConfig('broadcast_btn_text', btnText);
    await setConfig('broadcast_btn_url', btnUrl);
    await setConfig('broadcast_active', 'true');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/broadcast/stop', checkAdmin, async (req, res) => {
  try {
    await setConfig('broadcast_active', 'false');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push notification sab users ko (FCM topic "all")
app.post('/api/admin/notify', checkAdmin, async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 100);
  const body = String(b.body || '').trim().slice(0, 300);
  if (!title || !body) return res.status(400).json({ error: 'Title aur message dono chahiye' });
  let status = 'sent';
  try {
    await getFcm().send({
      topic: 'all',
      notification: { title, body },
      android: { priority: 'high', notification: { channelId: 'nox_general' } }
    });
  } catch (err) {
    status = 'failed: ' + String(err.message).slice(0, 150);
    await supabase.from('noxtube_notifications').insert([{ title, body, status }]);
    return res.status(err.status || 500).json({ error: err.message });
  }
  await supabase.from('noxtube_notifications').insert([{ title, body, status }]);
  res.json({ success: true });
});

app.get('/api/admin/notifications', checkAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('noxtube_notifications').select('*').order('id', { ascending: false }).limit(10);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/admin/keys', checkAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('noxtube_api_keys')
    .select('id, label, api_key, enabled, exhausted_until, uses, last_error, created_at')
    .order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(k => ({
    id: k.id,
    label: k.label,
    key_hint: '…' + String(k.api_key).slice(-4),
    enabled: k.enabled,
    exhausted_until: k.exhausted_until,
    uses: k.uses,
    last_error: k.last_error,
    created_at: k.created_at
  })));
});

app.post('/api/admin/keys', checkAdmin, async (req, res) => {
  const body = req.body || {};
  const api_key = String(body.api_key || '').trim();
  const label = String(body.label || '').trim().slice(0, 60);
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(api_key)) {
    return res.status(400).json({ error: 'API key format sahi nahi hai (AIza... se shuru hona chahiye)' });
  }
  const { error } = await supabase.from('noxtube_api_keys').insert([{ label, api_key }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.patch('/api/admin/keys/:id', checkAdmin, async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (body.reset === true) { patch.exhausted_until = null; patch.last_error = ''; }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  const { error } = await supabase.from('noxtube_api_keys').update(patch).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete('/api/admin/keys/:id', checkAdmin, async (req, res) => {
  const { error } = await supabase.from('noxtube_api_keys').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Purana endpoint (admin.html ab /api/admin/settings use karta hai, ye compatibility ke liye)
app.post('/api/admin/config', checkAdmin, async (req, res) => {
  try {
    const apk = String((req.body || {}).apk_url || '').trim();
    if (apk && !/^https:\/\//i.test(apk)) {
      return res.status(400).json({ error: 'APK link https:// se shuru hona chahiye' });
    }
    await setConfig('apk_url', apk);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`NOX TUBE backend on port ${PORT}`));
}

module.exports = app;
