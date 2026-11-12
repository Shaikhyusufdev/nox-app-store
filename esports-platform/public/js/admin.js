(function () {
  const root = document.getElementById('admin-root');
  const toastEl = document.getElementById('admin-toast');
  let toastTimer;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }
  async function call(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
    return data;
  }

  function showLogin() {
    root.innerHTML =
      '<div class="a-wrap"><div class="a-card">' +
      '<h1>NOX Admin</h1><p class="sub">Sirf admin ke liye. Login karke aage badho.</p>' +
      '<label for="a-email">Email</label><input id="a-email" type="email" autocomplete="username">' +
      '<label for="a-pass">Password</label><input id="a-pass" type="password" autocomplete="current-password">' +
      '<div class="err" id="a-err"></div>' +
      '<button class="btn" id="a-login">Login</button>' +
      '</div></div>';
    const email = document.getElementById('a-email');
    const pass = document.getElementById('a-pass');
    const err = document.getElementById('a-err');
    const btn = document.getElementById('a-login');
    async function submit() {
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Please wait...';
      try {
        const out = await call('POST', '/api/admin/login', { email: email.value.trim(), password: pass.value });
        pass.value = '';
        showDash(out.admin);
      } catch (e) {
        err.textContent = e.message;
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    }
    btn.addEventListener('click', submit);
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    email.focus();
  }

  function showDash(admin) {
    root.innerHTML =
      '<div class="a-wrap wide"><div class="top"><div><h1>Welcome, ' + esc(admin.name) + '</h1>' +
      '<span class="pill">' + esc(admin.role) + '</span></div>' +
      '<button class="btn ghost" id="a-logout">Logout</button></div>' +
      '<div class="a-card" id="games-form"></div>' +
      '<div class="a-card"><h2>Games</h2><div id="games-list"><div class="empty">Loading...</div></div></div></div>';
    document.getElementById('a-logout').addEventListener('click', async () => {
      try { await call('POST', '/api/admin/logout'); } catch (e) { /* ignore */ }
      toast('Logged out');
      showLogin();
    });
    initGames();
  }

  // ---------- Games ----------
  let games = [];
  let editing = null; // game object ya null

  function renderForm() {
    const g = editing || { name: '', slug: '', category: '', image_url: '', sort_order: 0, is_active: true };
    const box = document.getElementById('games-form');
    box.innerHTML =
      '<h2>' + (editing ? 'Edit game' : 'Add game') + '</h2>' +
      '<div class="grid2"><div><label for="g-name">Name</label><input id="g-name" maxlength="60" value="' + esc(g.name) + '"></div>' +
      '<div><label for="g-cat">Category</label><input id="g-cat" maxlength="40" placeholder="Battle Royale, MOBA..." value="' + esc(g.category) + '"></div>' +
      '<div><label for="g-slug">Slug (khali chhodo to auto)</label><input id="g-slug" maxlength="60" value="' + esc(g.slug) + '"></div>' +
      '<div><label for="g-sort">Sort order</label><input id="g-sort" type="number" min="0" max="9999" value="' + esc(g.sort_order) + '"></div></div>' +
      '<label for="g-img">Image URL (https://)</label><input id="g-img" maxlength="500" value="' + esc(g.image_url) + '">' +
      '<label for="g-active">Status</label><select id="g-active"><option value="1"' + (g.is_active ? ' selected' : '') + '>Active (users ko dikhega)</option><option value="0"' + (g.is_active ? '' : ' selected') + '>Hidden</option></select>' +
      '<div class="err" id="g-err"></div>' +
      '<button class="btn" id="g-save">' + (editing ? 'Save changes' : 'Add game') + '</button>' +
      (editing ? '<button class="btn ghost" id="g-cancel" style="margin-top:10px;width:100%">Cancel</button>' : '');
    document.getElementById('g-save').addEventListener('click', saveGame);
    const c = document.getElementById('g-cancel');
    if (c) c.addEventListener('click', () => { editing = null; renderForm(); });
  }

  async function saveGame() {
    const err = document.getElementById('g-err');
    const btn = document.getElementById('g-save');
    err.textContent = '';
    const payload = {
      name: document.getElementById('g-name').value.trim(),
      category: document.getElementById('g-cat').value.trim(),
      image_url: document.getElementById('g-img').value.trim(),
      sort_order: parseInt(document.getElementById('g-sort').value, 10) || 0,
      is_active: document.getElementById('g-active').value === '1',
    };
    const slug = document.getElementById('g-slug').value.trim();
    if (slug) payload.slug = slug;
    btn.disabled = true;
    try {
      if (editing) await call('PATCH', '/api/admin/games/' + editing.id, payload);
      else await call('POST', '/api/admin/games', payload);
      toast(editing ? 'Saved' : 'Game added');
      editing = null;
      renderForm();
      await loadGames();
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  }

  function renderList() {
    const box = document.getElementById('games-list');
    if (!games.length) { box.innerHTML = '<div class="empty">Abhi koi game nahi. Upar form se pehla game add karo.</div>'; return; }
    box.innerHTML = games.map((g) =>
      '<div class="row">' +
      (g.image_url ? '<img class="thumb" src="' + esc(g.image_url) + '" alt="" referrerpolicy="no-referrer">' : '<div class="thumb"></div>') +
      '<div class="info"><b>' + esc(g.name) + '</b><span>' + esc(g.category || 'No category') + ' | /' + esc(g.slug) + ' | order ' + esc(g.sort_order) + '</span></div>' +
      '<span class="pill' + (g.is_active ? '' : ' off') + '">' + (g.is_active ? 'Active' : 'Hidden') + '</span>' +
      '<button class="btn ghost small" data-edit="' + esc(g.id) + '">Edit</button>' +
      '<button class="btn ghost small" data-toggle="' + esc(g.id) + '">' + (g.is_active ? 'Hide' : 'Show') + '</button></div>'
    ).join('');
    box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      editing = games.find((x) => x.id === b.getAttribute('data-edit')) || null;
      renderForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    box.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const g = games.find((x) => x.id === b.getAttribute('data-toggle'));
      if (!g) return;
      b.disabled = true;
      try { await call('PATCH', '/api/admin/games/' + g.id, { is_active: !g.is_active }); await loadGames(); }
      catch (e) { toast(e.message); b.disabled = false; }
    }));
  }

  async function loadGames() {
    try { games = (await call('GET', '/api/admin/games')).games || []; renderList(); }
    catch (e) { document.getElementById('games-list').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
  }

  function initGames() { editing = null; renderForm(); loadGames(); }

  call('GET', '/api/admin/me').then((out) => showDash(out.admin)).catch(showLogin);
})();