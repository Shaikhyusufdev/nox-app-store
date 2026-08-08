require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store APK + screenshots in memory before uploading to Supabase Storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ---------- helpers ----------
function makeSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

function checkAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'];
  if (pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

async function uploadFile(bucket, file, folder) {
  const fileName = `${folder}/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
  const { error } = await supabase.storage.from(bucket).upload(fileName, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}

// ---------- public API ----------

// All apps, newest first
app.get('/api/apps', async (req, res) => {
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// The single latest app (for home page hero)
app.get('/api/apps/latest', async (req, res) => {
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Single app by slug -> powers the auto-generated per-app page
app.get('/api/apps/:slug', async (req, res) => {
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .eq('slug', req.params.slug)
    .single();
  if (error) return res.status(404).json({ error: 'App not found' });
  res.json(data);
});

// ---------- admin API (password protected) ----------

// Add a new app: name, version, size, rating, description + up to 6 screenshots + 1 apk
app.post(
  '/api/admin/apps',
  checkAdmin,
  upload.fields([{ name: 'screenshots', maxCount: 6 }, { name: 'apk', maxCount: 1 }]),
  async (req, res) => {
    try {
      const { name, version, size, rating, description } = req.body;
      if (!name || !req.files.apk) {
        return res.status(400).json({ error: 'App name and APK file are required' });
      }

      const slug = makeSlug(name);

      // Upload APK
      const apkUrl = await uploadFile('apks', req.files.apk[0], slug);

      // Upload screenshots (if any)
      let screenshotUrls = [];
      if (req.files.screenshots) {
        for (const shot of req.files.screenshots) {
          const url = await uploadFile('screenshots', shot, slug);
          screenshotUrls.push(url);
        }
      }

      const { data, error } = await supabase
        .from('apps')
        .insert([{
          slug,
          name,
          version: version || '1.0',
          size: size || 'N/A',
          rating: rating ? parseFloat(rating) : null,
          description: description || '',
          screenshots: screenshotUrls,
          apk_url: apkUrl
        }])
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, app: data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Delete an app
app.delete('/api/admin/apps/:id', checkAdmin, async (req, res) => {
  const { error } = await supabase.from('apps').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Admin login check (used by admin.html to validate password before showing the form)
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false });
});

// Fallback route for per-app pretty URLs: /app/some-app-slug -> serves app.html,
// which reads the slug from the URL and fetches details via the API.
app.get('/app/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.listen(PORT, () => console.log(`NOX App Store running on port ${PORT}`));
