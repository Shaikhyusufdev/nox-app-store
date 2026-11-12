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
      '<div class="a-card"><h2>Games</h2><div id="games-list"><div class="empty">Loading...</div></div></div>' +
      '<div class="a-card" id="t-form"></div>' +
      '<div class="a-card"><h2>Tournaments</h2><div id="t-list"><div class="empty">Loading...</div></div></div></div>';
    document.getElementById('a-logout').addEventListener('click', async () => {
      try { await call('POST', '/api/admin/logout'); } catch (e) { /* ignore */ }
      toast('Logged out');
      showLogin();
    });
    initGames();
    initTournaments();
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

  // ---------- Tournaments ----------
  const T_STATUS = [
    ['upcoming', 'Upcoming (join band)'],
    ['registration_open', 'Registration open (join chalu)'],
    ['full', 'Full'],
    ['ongoing', 'Ongoing'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
  ];
  let tournaments = [];
  let tGames = [];
  let tEditing = null;

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; }
  }

  function renderTForm() {
    const t = tEditing || { game_id: '', title: '', description: '', rules: '', banner_url: '', entry_fee: 0, prize_pool: 0, max_players: 50, starts_at: '', status: 'upcoming' };
    const box = document.getElementById('t-form');
    const gameOpts = '<option value="">-- Game chuno --</option>' + tGames.map((g) =>
      '<option value="' + esc(g.id) + '"' + (g.id === t.game_id ? ' selected' : '') + '>' + esc(g.name) + (g.is_active ? '' : ' (hidden)') + '</option>').join('');
    const statusOpts = T_STATUS.map((s) => '<option value="' + s[0] + '"' + (s[0] === t.status ? ' selected' : '') + '>' + esc(s[1]) + '</option>').join('');
    box.innerHTML =
      '<h2>' + (tEditing ? 'Edit tournament' : 'Add tournament') + '</h2>' +
      '<label for="t-game">Game</label><select id="t-game">' + gameOpts + '</select>' +
      '<label for="t-title">Title</label><input id="t-title" maxlength="100" value="' + esc(t.title) + '">' +
      '<div class="grid2"><div><label for="t-fee">Entry fee (Rs)</label><input id="t-fee" type="number" min="0" step="1" value="' + esc(t.entry_fee) + '"></div>' +
      '<div><label for="t-prize">Prize pool (Rs)</label><input id="t-prize" type="number" min="0" step="1" value="' + esc(t.prize_pool) + '"></div>' +
      '<div><label for="t-max">Max players</label><input id="t-max" type="number" min="2" max="1000" value="' + esc(t.max_players) + '"></div>' +
      '<div><label for="t-start">Start date & time</label><input id="t-start" type="datetime-local" value="' + esc(toLocalInput(t.starts_at)) + '"></div></div>' +
      '<label for="t-status">Status</label><select id="t-status">' + statusOpts + '</select>' +
      '<label for="t-banner">Banner URL (https://)</label><input id="t-banner" maxlength="500" value="' + esc(t.banner_url) + '">' +
      '<label for="t-desc">Description</label><input id="t-desc" maxlength="2000" value="' + esc(t.description) + '">' +
      '<label for="t-rules">Rules</label><input id="t-rules" maxlength="4000" value="' + esc(t.rules) + '">' +
      '<div class="err" id="t-err"></div>' +
      '<button class="btn" id="t-save">' + (tEditing ? 'Save changes' : 'Add tournament') + '</button>' +
      (tEditing ? '<button class="btn ghost" id="t-cancel" style="margin-top:10px;width:100%">Cancel</button>' : '');
    document.getElementById('t-save').addEventListener('click', saveTournament);
    const c = document.getElementById('t-cancel');
    if (c) c.addEventListener('click', () => { tEditing = null; renderTForm(); });
  }

  async function saveTournament() {
    const err = document.getElementById('t-err');
    const btn = document.getElementById('t-save');
    err.textContent = '';
    const startVal = document.getElementById('t-start').value;
    if (!startVal) { err.textContent = 'Start date/time daalo'; return; }
    const payload = {
      game_id: document.getElementById('t-game').value,
      title: document.getElementById('t-title').value.trim(),
      entry_fee: Number(document.getElementById('t-fee').value) || 0,
      prize_pool: Number(document.getElementById('t-prize').value) || 0,
      max_players: parseInt(document.getElementById('t-max').value, 10) || 0,
      starts_at: new Date(startVal).toISOString(),
      status: document.getElementById('t-status').value,
      banner_url: document.getElementById('t-banner').value.trim(),
      description: document.getElementById('t-desc').value.trim(),
      rules: document.getElementById('t-rules').value.trim(),
    };
    btn.disabled = true;
    try {
      if (tEditing) await call('PATCH', '/api/admin/tournaments/' + tEditing.id, payload);
      else await call('POST', '/api/admin/tournaments', payload);
      toast(tEditing ? 'Saved' : 'Tournament added');
      tEditing = null;
      renderTForm();
      await loadTournaments();
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  }

  function renderTList() {
    const box = document.getElementById('t-list');
    if (!tournaments.length) { box.innerHTML = '<div class="empty">Abhi koi tournament nahi. Upar form se pehla tournament add karo.</div>'; return; }
    box.innerHTML = tournaments.map((t) =>
      '<div class="row"><div class="info"><b>' + esc(t.title) + '</b><span>' + esc(t.game_name) +
      ' | Entry Rs' + esc(t.entry_fee) + ' | Prize Rs' + esc(t.prize_pool) +
      ' | ' + esc(t.joined_count) + '/' + esc(t.max_players) + ' joined | ' + esc(fmtDate(t.starts_at)) + '</span></div>' +
      '<span class="pill' + ((t.status === 'cancelled' || t.status === 'completed') ? ' off' : '') + '">' + esc(t.status) + '</span>' +
      '<button class="btn ghost small" data-tedit="' + esc(t.id) + '">Edit</button>' +
      '<button class="btn ghost small" data-tdel="' + esc(t.id) + '">Delete</button></div>'
    ).join('');
    box.querySelectorAll('[data-tdel]').forEach((b) => b.addEventListener('click', async () => {
      const t = tournaments.find((x) => x.id === b.getAttribute('data-tdel'));
      if (!t || !window.confirm('Delete "' + t.title + '"? Ye wapas nahi aayega.')) return;
      b.disabled = true;
      try {
        await call('DELETE', '/api/admin/tournaments/' + t.id);
        if (tEditing && tEditing.id === t.id) { tEditing = null; renderTForm(); }
        toast('Deleted');
        await loadTournaments();
      } catch (e) { toast(e.message); b.disabled = false; }
    }));
    box.querySelectorAll('[data-tedit]').forEach((b) => b.addEventListener('click', () => {
      tEditing = tournaments.find((x) => x.id === b.getAttribute('data-tedit')) || null;
      renderTForm();
      document.getElementById('t-form').scrollIntoView({ behavior: 'smooth' });
    }));
  }

  async function loadTournaments() {
    try { tournaments = (await call('GET', '/api/admin/tournaments')).tournaments || []; renderTList(); }
    catch (e) { document.getElementById('t-list').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
  }

  async function initTournaments() {
    tEditing = null;
    try { tGames = (await call('GET', '/api/admin/games')).games || []; } catch (e) { tGames = []; }
    renderTForm();
    loadTournaments();
  }

  call('GET', '/api/admin/me').then((out) => showDash(out.admin)).catch(showLogin);
})();