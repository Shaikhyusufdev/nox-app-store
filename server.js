require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Screenshots go through the backend and land in Supabase Storage.
// The APK itself is NOT uploaded here — admin just pastes a link to it.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ---------- helpers ----------
function makeSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// Add a new app: name, version, size, rating, description, apk_url (link) + up to 6 screenshots
app.post(
  '/api/admin/apps',
  checkAdmin,
  upload.fields([{ name: 'screenshots', maxCount: 6 }]),
  async (req, res) => {
    try {
      const { name, version, size, rating, description, apk_url } = req.body;
      if (!name || !apk_url) {
        return res.status(400).json({ error: 'App name and APK link are required' });
      }

      const slug = makeSlug(name);

      // Upload screenshots (if any) to Supabase Storage
      let screenshotUrls = [];
      if (req.files && req.files.screenshots) {
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
          apk_url
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

// ---------- SEO ----------

// robots.txt points crawlers at the sitemap
app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin.html\nSitemap: ${base}/sitemap.xml\n`
  );
});

// Dynamic sitemap.xml — lists home, the apps listing, and every app's own page,
// so every auto-generated app page gets discovered and indexed by Google.
app.get('/sitemap.xml', async (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const { data: apps } = await supabase
    .from('apps')
    .select('slug, created_at')
    .order('created_at', { ascending: false });

  const staticUrls = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/apps.html`, priority: '0.8' }
  ];
  const appUrls = (apps || []).map(a => ({
    loc: `${base}/app/${a.slug}`,
    lastmod: a.created_at ? new Date(a.created_at).toISOString() : undefined,
    priority: '0.7'
  }));

  const urlXml = [...staticUrls, ...appUrls].map(u => `
  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlXml}\n</urlset>`
  );
});

// Fallback route for per-app pretty URLs: /app/some-app-slug -> serves app.html
// with server-rendered <title>/description/Open-Graph tags for that specific app,
// so search engines and link previews (WhatsApp, Instagram, etc.) show the real
// app name, description and screenshot instead of the generic site defaults.
// The page's own JS (app-detail.js) still fetches the full data client-side to
// render the interactive content.
app.get('/app/:slug', async (req, res) => {
  const templatePath = path.join(__dirname, 'public', 'app.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const { data: appData } = await supabase
    .from('apps')
    .select('*')
    .eq('slug', req.params.slug)
    .single();

  if (appData) {
    const base = `${req.protocol}://${req.get('host')}`;
    const url = `${base}/app/${appData.slug}`;
    const title = `${escapeHtml(appData.name)} — Download APK | NOX Store`;
    const desc = escapeHtml(
      (appData.description && appData.description.slice(0, 155)) ||
      `Download ${appData.name} APK v${appData.version || '1.0'} (${appData.size || 'N/A'}) free on NOX Store.`
    );
    const image = (appData.screenshots && appData.screenshots[0]) || '';

    html = html
      .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
      .replace(
        /<meta name="description" content=".*?">/,
        `<meta name="description" content="${desc}">`
      )
      .replace(/<link rel="canonical" href=".*?">/, `<link rel="canonical" href="${url}">`)
      .replace(
        /<meta property="og:site_name" content="NOX STORE">/,
        `<meta property="og:site_name" content="NOX STORE">\n<meta property="og:title" content="${title}">\n<meta property="og:description" content="${desc}">\n<meta property="og:url" content="${url}">${image ? `\n<meta property="og:image" content="${image}">` : ''}`
      );
  }

  res.send(html);
});

// Local dev: run a normal server. On Vercel, the app is exported and Vercel
// wraps it as a serverless function instead of calling .listen().
if (require.main === module) {
  app.listen(PORT, () => console.log(`NOX App Store running on port ${PORT}`));
}

module.exports = app;
