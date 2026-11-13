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

  let adminRole = '';
  function showDash(admin) {
    adminRole = admin.role;
    root.innerHTML =
      '<div class="a-wrap wide"><div class="top"><div><h1>Welcome, ' + esc(admin.name) + '</h1>' +
      '<span class="pill">' + esc(admin.role) + '</span></div>' +
      '<button class="btn ghost" id="a-logout">Logout</button></div>' +
      '<div id="a-tabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"></div>' +
      '<div id="sec-dash"></div><div id="sec-users" hidden></div><div id="sec-deps" hidden></div><div id="sec-support" hidden></div>' +
      '<div id="sec-matches" hidden>' +
      '<div class="a-card" id="games-form"></div>' +
      '<div class="a-card"><h2>Games</h2><div id="games-list"><div class="empty">Loading...</div></div></div>' +
      '<div class="a-card"><h2>Match categories</h2><div id="c-box"></div></div>' +
      '<div class="a-card" id="t-form"></div>' +
      '<div class="a-card"><h2>Tournaments</h2><div id="t-list"><div class="empty">Loading...</div></div></div></div></div>';
    document.getElementById('a-logout').addEventListener('click', async () => {
      try { await call('POST', '/api/admin/logout'); } catch (e) { /* ignore */ }
      toast('Logged out');
      showLogin();
    });
    initGames();
    initTournaments();
    tabLoaded = {};
    openTab('dash');
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
      '<button class="btn ghost small" data-toggle="' + esc(g.id) + '">' + (g.is_active ? 'Hide' : 'Show') + '</button>' +
      '<button class="btn ghost small" data-gdel="' + esc(g.id) + '">Delete</button></div>'
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
    box.querySelectorAll('[data-gdel]').forEach((b) => b.addEventListener('click', async () => {
      const g = games.find((x) => x.id === b.getAttribute('data-gdel'));
      if (!g || !window.confirm('Delete "' + g.name + '"? Ye wapas nahi aayega.')) return;
      b.disabled = true;
      try {
        await call('DELETE', '/api/admin/games/' + g.id);
        if (editing && editing.id === g.id) { editing = null; renderForm(); }
        toast('Game deleted');
        await loadGames();
        tGames = games;
        renderTForm();
      } catch (e) { toast(e.message); b.disabled = false; }
    }));
  }

  async function loadGames() {
    try { games = (await call('GET', '/api/admin/games')).games || []; renderList(); }
    catch (e) { document.getElementById('games-list').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
  }

  function initGames() { editing = null; renderForm(); loadGames(); }

  // ---------- Tournaments ----------
  const T_STATUS = [
    ['upcoming', 'Upcoming (join chalu)'],
    ['registration_open', 'Registration open (join chalu)'],
    ['full', 'Full'],
    ['ongoing', 'Ongoing'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
  ];
  let tournaments = [];
  let tGames = [];
  let tEditing = null;
  let tCats = [];
  const MODE_LABEL = { solo: 'Solo', duo: 'Duo', squad: 'Squad' };
  const BR_DEFAULT = { solo: 48, duo: 32, squad: 12 };
  const catById = (id) => tCats.find((c) => c.id === id) || null;

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; }
  }

  function defaultStart() {
    return new Date(Math.ceil(Date.now() / 3600000) * 3600000 + 3600000).toISOString(); // agla poora ghanta + 1 ghanta
  }
  let tPrizes = [];

  function renderTForm() {
    const t = tEditing || { game_id: '', title: '', description: '', rules: '', banner_url: '', entry_fee: 0, prize_pool: 0, category_id: '', mode: 'solo', team_count: 2, starts_at: defaultStart(), status: 'upcoming', prize_distribution: [] };
    tPrizes = (t.prize_distribution || []).map((x) => Number(x.amount) || 0);
    const box = document.getElementById('t-form');
    const gameOpts = '<option value="">-- Game chuno --</option>' + tGames.map((g) =>
      '<option value="' + esc(g.id) + '"' + (g.id === t.game_id ? ' selected' : '') + '>' + esc(g.name) + (g.is_active ? '' : ' (hidden)') + '</option>').join('');
    const catOpts = '<option value="">-- Category chuno --</option>' + tCats.filter((c) => c.is_active || c.id === t.category_id).map((c) =>
      '<option value="' + esc(c.id) + '"' + (c.id === t.category_id ? ' selected' : '') + '>' + esc(c.name) + ' (' + (c.layout === 'br' ? 'BR slots' : 'Red vs Blue') + ')</option>').join('');
    const modeOpts = Object.keys(MODE_LABEL).map((m) => '<option value="' + m + '"' + (m === t.mode ? ' selected' : '') + '>' + MODE_LABEL[m] + '</option>').join('');
    const statusOpts = T_STATUS.map((s) => '<option value="' + s[0] + '"' + (s[0] === t.status ? ' selected' : '') + '>' + esc(s[1]) + '</option>').join('');
    box.innerHTML =
      '<h2>' + (tEditing ? 'Edit tournament' : 'Add tournament') + '</h2>' +
      '<label for="t-game">Game</label><select id="t-game">' + gameOpts + '</select>' +
      '<div class="grid2"><div><label for="t-cat">Category</label><select id="t-cat">' + catOpts + '</select></div>' +
      '<div><label for="t-mode">Mode</label><select id="t-mode">' + modeOpts + '</select></div></div>' +
      '<label for="t-tc">Teams / slots</label><input id="t-tc" type="number" min="2" max="64" value="' + esc(t.team_count) + '">' +
      '<div class="sub" id="t-tcnote" style="font-size:13px;opacity:.75;margin:4px 0 8px"></div>' +
      '<div id="t-prizebox"></div>' +
      '<label for="t-title">Title</label><input id="t-title" maxlength="100" value="' + esc(t.title) + '">' +
      '<div class="grid2"><div><label for="t-fee">Entry fee (Rs)</label><input id="t-fee" type="number" min="0" step="1" value="' + esc(t.entry_fee) + '"></div>' +
      '<div><label for="t-prize">Prize pool (Rs)</label><input id="t-prize" type="number" min="0" step="1" value="' + esc(t.prize_pool) + '"></div>' +
      '<div><label for="t-start">Start date & time</label><input id="t-start" type="datetime-local" value="' + esc(toLocalInput(t.starts_at)) + '"></div></div>' +
      '<label for="t-status">Status</label><select id="t-status">' + statusOpts + '</select>' +
      '<label for="t-banner">Banner URL (https://)</label><input id="t-banner" maxlength="500" value="' + esc(t.banner_url) + '">' +
      '<label for="t-desc">Description</label><input id="t-desc" maxlength="2000" value="' + esc(t.description) + '">' +
      '<label for="t-rules">Rules</label><input id="t-rules" maxlength="4000" value="' + esc(t.rules) + '">' +
      '<div class="err" id="t-err"></div>' +
      '<button class="btn" id="t-save">' + (tEditing ? 'Save changes' : 'Add tournament') + '</button>' +
      (tEditing ? '<button class="btn ghost" id="t-cancel" style="margin-top:10px;width:100%">Cancel</button>' : '');
    document.getElementById('t-save').addEventListener('click', saveTournament);
    const selCat = document.getElementById('t-cat');
    const selMode = document.getElementById('t-mode');
    const tcInp = document.getElementById('t-tc');
    const tcNote = document.getElementById('t-tcnote');
    function drawPrizes(isBr, size) {
      const box = document.getElementById('t-prizebox');
      const prizeInp = document.getElementById('t-prize');
      if (!isBr) { box.innerHTML = ''; prizeInp.disabled = false; return; }
      prizeInp.disabled = true;
      if (!tPrizes.length) tPrizes = [0, 0, 0];
      const ord = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
      box.innerHTML = '<label>Prize per rank (sirf BR)' + (size > 1 ? ' - poori team ka' : '') + '</label>' +
        tPrizes.map((a, i) => '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><span style="min-width:40px;font-weight:700">' + ord(i + 1) + '</span>' +
          '<input type="number" min="0" step="1" data-prank="' + i + '" value="' + (a || '') + '" placeholder="Amount (Rs)"><span style="font-size:12px;opacity:.7;min-width:90px" data-pper="' + i + '"></span></div>').join('') +
        '<div style="display:flex;gap:8px"><button class="btn ghost small" type="button" id="t-padd">+ Add rank</button><button class="btn ghost small" type="button" id="t-pdel">- Remove last</button></div>' +
        '<div id="t-ptotal" style="font-size:13px;opacity:.75;margin:8px 0"></div>';
      function upd() {
        const total = tPrizes.reduce((x, y) => x + (Number(y) || 0), 0);
        prizeInp.value = total;
        document.getElementById('t-ptotal').textContent = 'Total prize pool: Rs ' + total + (size > 1 ? ' (har rank ka prize team ke ' + size + ' players me barabar bantega)' : '');
        box.querySelectorAll('[data-pper]').forEach((el) => {
          const v = Number(tPrizes[Number(el.getAttribute('data-pper'))]) || 0;
          el.textContent = size > 1 && v ? 'Rs ' + (Math.round(v / size * 100) / 100) + ' each' : '';
        });
      }
      box.querySelectorAll('[data-prank]').forEach((inp) => inp.addEventListener('input', () => { tPrizes[Number(inp.getAttribute('data-prank'))] = Number(inp.value) || 0; upd(); }));
      document.getElementById('t-padd').addEventListener('click', () => { if (tPrizes.length < 20) { tPrizes.push(0); drawPrizes(true, size); } });
      document.getElementById('t-pdel').addEventListener('click', () => { if (tPrizes.length > 1) { tPrizes.pop(); drawPrizes(true, size); } });
      upd();
    }
    function syncTeams(fillDefault) {
      const c = catById(selCat.value);
      const size = { solo: 1, duo: 2, squad: 4 }[selMode.value];
      if (c && c.layout === 'red_blue') {
        tcInp.value = 2; tcInp.disabled = true;
        tcNote.textContent = 'Red vs Blue: ' + size + ' vs ' + size + ' = ' + (size * 2) + ' players total';
      } else {
        tcInp.disabled = false;
        if (fillDefault) tcInp.value = BR_DEFAULT[selMode.value];
        const n = Number(tcInp.value) || 0;
        tcNote.textContent = c ? n + ' ' + (size === 1 ? 'players' : 'teams') + ' x ' + size + ' = ' + (n * size) + ' players total' : 'Pehle category chuno';
      }
      drawPrizes(!!c && c.layout === 'br', size);
    }
    selCat.addEventListener('change', () => syncTeams(true));
    selMode.addEventListener('change', () => syncTeams(true));
    tcInp.addEventListener('input', () => syncTeams(false));
    syncTeams(false);
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
      category_id: document.getElementById('t-cat').value,
      mode: document.getElementById('t-mode').value,
      team_count: parseInt(document.getElementById('t-tc').value, 10) || 2,
      prize_distribution: ((catById(document.getElementById('t-cat').value) || {}).layout === 'br') ? tPrizes.map((a, i) => ({ rank: i + 1, amount: Number(a) || 0 })) : [],
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

  // Room ID + password dalo aur joined players ko publish karo (optional: match ko Ongoing bhi karo)
  async function openRoom(t) {
    let cur = { room_id: '', room_password: '' };
    try { cur = (await call('GET', '/api/admin/tournaments/' + t.id + '/room')).room || cur; }
    catch (e) { toast(e.message); return; }
    const canStart = ['upcoming', 'registration_open', 'full'].indexOf(t.status) !== -1;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50';
    ov.innerHTML =
      '<div class="a-card" style="width:100%;max-width:420px;margin:0">' +
      '<h2>Room details</h2>' +
      '<div style="font-size:13px;opacity:.75;margin-bottom:8px">' + esc(t.title) + ' | ' + esc(t.joined_count) + ' joined</div>' +
      '<label for="r-id">Room ID</label><input id="r-id" maxlength="40" autocomplete="off" value="' + esc(cur.room_id) + '">' +
      '<label for="r-pw">Password</label><input id="r-pw" maxlength="40" autocomplete="off" value="' + esc(cur.room_password) + '">' +
      (canStart ? '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="r-start" checked style="width:auto"> Match start (Ongoing) bhi kar do</label>' : '') +
      '<div class="err" id="r-err"></div>' +
      '<button class="btn" id="r-save">Publish to joined players</button>' +
      '<button class="btn ghost" id="r-cancel" style="margin-top:10px;width:100%">Cancel</button></div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('#r-cancel').addEventListener('click', close);
    const err = ov.querySelector('#r-err');
    const btn = ov.querySelector('#r-save');
    btn.addEventListener('click', async () => {
      err.textContent = '';
      const startEl = ov.querySelector('#r-start');
      btn.disabled = true;
      try {
        const out = await call('PUT', '/api/admin/tournaments/' + t.id + '/room', {
          room_id: ov.querySelector('#r-id').value.trim(),
          room_password: ov.querySelector('#r-pw').value.trim(),
          start: startEl ? startEl.checked : false,
        });
        toast(out.started ? 'Room published, match live' : 'Room published');
        close();
        await loadTournaments();
      } catch (e) {
        err.textContent = e.message;
        btn.disabled = false;
      }
    });
    ov.querySelector('#r-id').focus();
  }

  // Joined players dekho + result (rank -> team) dekar prize bantao
  async function openResult(t) {
    let d;
    try { d = await call('GET', '/api/admin/tournaments/' + t.id + '/participants'); }
    catch (e) { toast(e.message); return; }
    const info = d.tournament;
    const ps = d.participants || [];
    const isBr = info.layout === 'br';
    const size = info.team_size || 1;
    const teams = {};
    ps.forEach((p) => { (teams[p.team_no] = teams[p.team_no] || []).push(p); });
    const teamNos = Object.keys(teams).map(Number).sort((a, b) => a - b);
    const teamName = (n) => (isBr ? (size === 1 ? 'Slot ' + n : 'Team ' + n) : (n === 1 ? 'RED' : 'BLUE'));
    const names = (n) => teams[n].map((p) => p.username).join(', ');
    const done = info.status === 'completed';
    const canPay = info.status === 'ongoing' && !done;
    const ord = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

    const listHtml = teamNos.length ? teamNos.map((n) =>
      '<div style="padding:7px 0;border-bottom:1px solid rgba(128,128,128,.2);font-size:14px"><b>' + esc(teamName(n)) + '</b>' +
      (isBr && size === 1 ? '' : '') + ': ' +
      teams[n].map((p) => esc(p.username) + (done && p.prize_won ? ' (' + inr(p.prize_won) + ', rank ' + esc(p.placement) + ')' : '')).join(', ') + '</div>').join('')
      : '<div class="empty">Abhi koi player join nahi hua.</div>';

    const rows = isBr
      ? (info.prize_distribution || []).map((x) => ({ rank: Number(x.rank), amount: Number(x.amount) || 0, label: ord(Number(x.rank)) + (size > 1 ? ' team' : '') }))
      : [{ rank: 1, amount: Number(info.prize_pool) || 0, label: 'Winner team' }];
    const teamOpts = '<option value="">-- chuno --</option>' + teamNos.map((n) => '<option value="' + n + '">' + esc(teamName(n)) + ' - ' + esc(names(n)) + '</option>').join('');

    const payHtml = canPay
      ? '<h2 style="margin-top:16px">Result (rank ke hisaab se prize)</h2>' +
        '<div style="font-size:13px;opacity:.75;margin-bottom:8px">Jo rank khali chhodoge uska prize nahi jayega. Prize ek hi baar jaata hai, baad me badal nahi sakte.</div>' +
        rows.map((r) => '<div style="margin-bottom:10px"><label>' + esc(r.label) + ' - ' + inr(r.amount) + '</label>' +
          '<select data-rr="' + r.rank + '">' + teamOpts + '</select>' +
          '<div style="font-size:12px;opacity:.7;margin-top:3px" data-rs="' + r.rank + '"></div></div>').join('') +
        '<div class="err" id="rs-err"></div><button class="btn" id="rs-go">Prize do</button>'
      : '<div style="font-size:13px;opacity:.75;margin-top:12px">' + (done ? 'Is match ka prize mil chuka hai.' : 'Result dene ke liye match Ongoing hona chahiye (Room / Start se).') + '</div>';

    const m = modal(
      '<h2>' + esc(info.title) + ' ' + pill(info.status, info.status === 'completed' || info.status === 'cancelled') + '</h2>' +
      '<div style="font-size:13px;opacity:.75;margin-bottom:8px">' + esc(MODE_LABEL[info.mode] || '') + ' | ' + esc(info.joined_count) + ' players joined | Prize pool ' + inr(info.prize_pool) + '</div>' +
      '<h2 style="margin-top:8px">Joined players</h2>' + listHtml + payHtml +
      '<button class="btn ghost" id="rs-close" style="margin-top:14px;width:100%">Close</button>');
    const el = m.el;
    el.querySelector('#rs-close').addEventListener('click', m.close);
    if (!canPay) return;

    const shareText = (amount, n) => {
      if (!n || !teams[n]) return '';
      const cnt = teams[n].length;
      return cnt > 1 ? 'Har player ko ~' + inr(Math.floor(amount / cnt * 100) / 100) + ' (' + cnt + ' players)' : '1 player ko ' + inr(amount);
    };
    el.querySelectorAll('[data-rr]').forEach((sel) => sel.addEventListener('change', () => {
      const r = rows.find((x) => x.rank === Number(sel.getAttribute('data-rr')));
      el.querySelector('[data-rs="' + r.rank + '"]').textContent = shareText(r.amount, Number(sel.value));
    }));
    const go = el.querySelector('#rs-go');
    const err = el.querySelector('#rs-err');
    go.addEventListener('click', async () => {
      err.textContent = '';
      const results = [];
      el.querySelectorAll('[data-rr]').forEach((sel) => {
        if (sel.value) results.push({ rank: Number(sel.getAttribute('data-rr')), team_no: Number(sel.value) });
      });
      if (!results.length) { err.textContent = 'Kam se kam ek rank ke liye team chuno'; return; }
      if (new Set(results.map((x) => x.team_no)).size !== results.length) { err.textContent = 'Ek team do rank me nahi ho sakti'; return; }
      const summary = results.map((x) => {
        const r = rows.find((y) => y.rank === x.rank);
        return r.label + ': ' + teamName(x.team_no) + ' (' + names(x.team_no) + ') = ' + inr(r.amount);
      }).join('\n');
      if (!window.confirm('Prize de du? Ye wapas nahi hoga.\n\n' + summary)) return;
      go.disabled = true;
      try {
        const out = await call('POST', '/api/admin/tournaments/' + t.id + '/payout', { results: results });
        toast('Prize mil gaya: ' + inr((out.result || {}).paid_total));
        m.close();
        await loadTournaments();
      } catch (e) { err.textContent = e.message; go.disabled = false; }
    });
  }

  function renderTList() {
    const box = document.getElementById('t-list');
    if (!tournaments.length) { box.innerHTML = '<div class="empty">Abhi koi tournament nahi. Upar form se pehla tournament add karo.</div>'; return; }
    box.innerHTML = tournaments.map((t) =>
      '<div class="row"><div class="info"><b>' + esc(t.title) + '</b><span>' + esc(t.game_name) + ' | ' + esc((catById(t.category_id) || {}).name || 'No category') + ' ' + esc(MODE_LABEL[t.mode] || '') +
      ' | Entry Rs' + esc(t.entry_fee) + ' | Prize Rs' + esc(t.prize_pool) +
      ' | ' + esc(t.joined_count) + '/' + esc(t.max_players) + ' joined | ' + esc(fmtDate(t.starts_at)) + '</span></div>' +
      '<span class="pill' + ((t.status === 'cancelled' || t.status === 'completed') ? ' off' : '') + '">' + esc(t.status) + '</span>' +
      '<button class="btn ghost small" data-tres="' + esc(t.id) + '">' + (t.status === 'ongoing' ? 'Players / Result' : 'Players') + '</button>' +
      '<button class="btn ghost small" data-troom="' + esc(t.id) + '">' + (t.room_published ? 'Room (set)' : 'Room / Start') + '</button>' +
      '<button class="btn ghost small" data-tedit="' + esc(t.id) + '">Edit</button>' +
      '<button class="btn ghost small" data-tdel="' + esc(t.id) + '">Delete</button></div>'
    ).join('');
    box.querySelectorAll('[data-tres]').forEach((b) => b.addEventListener('click', () => {
      const t = tournaments.find((x) => x.id === b.getAttribute('data-tres'));
      if (t) openResult(t);
    }));
    box.querySelectorAll('[data-troom]').forEach((b) => b.addEventListener('click', () => {
      const t = tournaments.find((x) => x.id === b.getAttribute('data-troom'));
      if (t) openRoom(t);
    }));
    box.querySelectorAll('[data-tdel]').forEach((b) => b.addEventListener('click', async () => {
      const t = tournaments.find((x) => x.id === b.getAttribute('data-tdel'));
      if (!t) return;
      const doDelete = async (refund, btnEl) => {
        btnEl.disabled = true;
        try {
          const out = await call('DELETE', '/api/admin/tournaments/' + t.id + (refund ? '?refund=1' : ''));
          if (tEditing && tEditing.id === t.id) { tEditing = null; renderTForm(); }
          toast(refund ? 'Deleted. Refunded ' + (out.refunded_users || 0) + ' players (' + inr(out.refunded_total) + ')' : 'Deleted');
          await loadTournaments();
          return true;
        } catch (e) { toast(e.message); btnEl.disabled = false; return false; }
      };
      if (!t.joined_count) {
        if (!window.confirm('Delete "' + t.title + '"? This cannot be undone.')) return;
        return doDelete(false, b);
      }
      const warn = t.status === 'completed'
        ? '<div style="font-size:13px;color:#ff4d6a;margin:8px 0">This match is completed. If the prize was already paid out, refunding the entry fees means you pay twice.</div>' : '';
      const m = modal(
        '<h2>Delete "' + esc(t.title) + '"</h2>' +
        '<div style="font-size:14px;margin-bottom:8px">' + esc(t.joined_count) + ' players joined. What should happen to their entry fee?</div>' + warn +
        '<button class="btn" id="d-refund" style="margin-top:8px">Refund &amp; Delete</button>' +
        '<button class="btn ghost" id="d-only" style="margin-top:10px;width:100%">Delete (no refund)</button>' +
        '<button class="btn ghost" id="d-x" style="margin-top:10px;width:100%">Cancel</button>');
      m.el.querySelector('#d-x').addEventListener('click', m.close);
      m.el.querySelector('#d-refund').addEventListener('click', async (e) => { if (await doDelete(true, e.currentTarget)) m.close(); });
      m.el.querySelector('#d-only').addEventListener('click', async (e) => { if (await doDelete(false, e.currentTarget)) m.close(); });
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
    await loadCats();
    renderTForm();
    loadTournaments();
  }

  // ---------- Match categories ----------
  async function loadCats() {
    try { tCats = (await call('GET', '/api/admin/tournaments/categories')).categories || []; } catch (e) { tCats = []; }
    renderCats();
  }

  function renderCats() {
    const box = document.getElementById('c-box');
    if (!box) return;
    box.innerHTML =
      tCats.map((c) =>
        '<div class="row"><div class="info"><b>' + esc(c.name) + '</b><span>' + (c.layout === 'br' ? 'BR slots (alag teams/players)' : 'Red vs Blue') + '</span></div>' +
        '<span class="pill' + (c.is_active ? '' : ' off') + '">' + (c.is_active ? 'Active' : 'Hidden') + '</span>' +
        '<button class="btn ghost small" data-ctoggle="' + esc(c.id) + '">' + (c.is_active ? 'Hide' : 'Show') + '</button></div>').join('') +
      '<div class="grid2" style="margin-top:14px"><div><label for="c-name">Nayi category</label><input id="c-name" maxlength="30" placeholder="Jaise: Clash Squad"></div>' +
      '<div><label for="c-layout">Layout</label><select id="c-layout"><option value="red_blue">Red vs Blue</option><option value="br">BR (slots)</option></select></div></div>' +
      '<div class="err" id="c-err"></div><button class="btn" id="c-add">Add category</button>';
    box.querySelectorAll('[data-ctoggle]').forEach((b) => b.addEventListener('click', async () => {
      const c = catById(b.getAttribute('data-ctoggle'));
      if (!c) return;
      b.disabled = true;
      try { await call('PATCH', '/api/admin/tournaments/categories/' + c.id, { is_active: !c.is_active }); await loadCats(); renderTForm(); }
      catch (e) { toast(e.message); b.disabled = false; }
    }));
    document.getElementById('c-add').addEventListener('click', async () => {
      const err = document.getElementById('c-err');
      const btn = document.getElementById('c-add');
      err.textContent = '';
      btn.disabled = true;
      try {
        await call('POST', '/api/admin/tournaments/categories', { name: document.getElementById('c-name').value.trim(), layout: document.getElementById('c-layout').value });
        toast('Category added');
        await loadCats();
        renderTForm();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
  }

  // ---------- Tabs, Dashboard, Users, Deposits ----------
  const TAB_DEFS = [['dash', 'Dashboard'], ['users', 'Users'], ['deps', 'Deposits'], ['support', 'Support'], ['matches', 'Matches']];
  let tabLoaded = {};
  const inr = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const pill = (txt, off) => '<span class="pill' + (off ? ' off' : '') + '">' + esc(txt) + '</span>';

  function openTab(key) {
    const bar = document.getElementById('a-tabs');
    bar.innerHTML = TAB_DEFS.map((t) => '<button class="btn ' + (t[0] === key ? '' : 'ghost ') + 'small" data-tab="' + t[0] + '">' + t[1] + '</button>').join('');
    bar.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => openTab(b.getAttribute('data-tab'))));
    TAB_DEFS.forEach((t) => { const el = document.getElementById('sec-' + t[0]); if (el) el.hidden = t[0] !== key; });
    if (key === 'dash') loadDash();
    if (key === 'users' && !tabLoaded.users) { tabLoaded.users = true; loadUsers(1); }
    if (key === 'deps' && !tabLoaded.deps) { tabLoaded.deps = true; loadDeposits(1); }
    if (key === 'support') loadSupport(1);
  }

  function modal(inner) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50';
    ov.innerHTML = '<div class="a-card" style="width:100%;max-width:480px;margin:0;max-height:92vh;overflow:auto">' + inner + '</div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    return { el: ov, close: close };
  }

  function pager(el, page, total, size, fn) {
    const pages = Math.max(1, Math.ceil(total / size));
    el.insertAdjacentHTML('beforeend',
      '<div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px">' +
      '<button class="btn ghost small" data-pp' + (page <= 1 ? ' disabled' : '') + '>Prev</button>' +
      '<span style="font-size:13px;opacity:.75">Page ' + page + ' / ' + pages + ' (' + total + ')</span>' +
      '<button class="btn ghost small" data-pn' + (page >= pages ? ' disabled' : '') + '>Next</button></div>');
    el.querySelector('[data-pp]').addEventListener('click', () => fn(page - 1));
    el.querySelector('[data-pn]').addEventListener('click', () => fn(page + 1));
  }

  async function loadDash() {
    const box = document.getElementById('sec-dash');
    box.innerHTML = '<div class="a-card"><h2>Dashboard</h2><div class="empty">Loading...</div></div>';
    try {
      const s = (await call('GET', '/api/admin/manage/stats')).stats || {};
      const tile = (label, val) => '<div style="border:1px solid rgba(128,128,128,.3);border-radius:12px;padding:12px"><div style="font-size:12px;opacity:.7">' + esc(label) + '</div><div style="font-size:20px;font-weight:800;margin-top:4px">' + esc(val) + '</div></div>';
      box.innerHTML = '<div class="a-card"><h2>Dashboard</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">' + [
        tile('Total users', s.users_total || 0),
        tile('New users today', s.users_today || 0),
        tile('Blocked users', s.users_blocked || 0),
        tile('Deposits (total)', inr(s.deposits_total)),
        tile('Deposits today', inr(s.deposits_today)),
        tile('Deposits pending', s.deposits_pending || 0),
        tile('Withdrawals pending', (s.withdrawals_pending_count || 0) + ' (' + inr(s.withdrawals_pending_amount) + ')'),
        tile('Withdrawn (paid)', inr(s.withdrawals_paid_total)),
        tile('Entry fees collected', inr(s.entry_fees_total)),
        tile('Prizes paid', inr(s.prizes_total)),
        tile('Users ke wallet me total', inr(s.wallet_total)),
        tile('Open matches', s.matches_open || 0),
        tile('Live matches', s.matches_live || 0),
      ].join('') + '</div></div>';
    } catch (e) {
      box.innerHTML = '<div class="a-card"><h2>Dashboard</h2><div class="err">' + esc(e.message) + '</div><div class="sub" style="font-size:13px;opacity:.75;margin-top:8px">Agar "Could not load stats" aaye to supabase-admin-stats.sql Supabase SQL Editor me run karo.</div></div>';
    }
  }

  // ----- Users -----
  let uQuery = '';
  let uPage = 1;
  async function loadUsers(page) {
    uPage = page;
    const box = document.getElementById('sec-users');
    if (!box.querySelector('#u-list')) {
      box.innerHTML = '<div class="a-card"><h2>Users</h2>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px"><input id="u-q" placeholder="Username / email / user code" maxlength="40" value="' + esc(uQuery) + '"><button class="btn small" id="u-go">Search</button></div>' +
        '<div id="u-list"><div class="empty">Loading...</div></div></div>';
      const run = () => { uQuery = document.getElementById('u-q').value.trim(); loadUsers(1); };
      box.querySelector('#u-go').addEventListener('click', run);
      box.querySelector('#u-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    }
    const list = document.getElementById('u-list');
    list.innerHTML = '<div class="empty">Loading...</div>';
    try {
      const out = await call('GET', '/api/admin/manage/users?page=' + page + '&q=' + encodeURIComponent(uQuery));
      const users = out.users || [];
      list.innerHTML = users.length ? users.map((u) =>
        '<div class="row"><div class="info"><b>' + esc(u.username) + '</b><span>' + esc(u.user_code) + ' | ' + esc(u.email) +
        ' | Dep ' + inr(u.deposit_balance) + ' | Win ' + inr(u.winnings_balance) + ' | Bonus ' + inr(u.bonus_balance) + '</span></div>' +
        pill(u.status, u.status !== 'active') +
        '<button class="btn ghost small" data-uview="' + esc(u.id) + '">Manage</button></div>').join('')
        : '<div class="empty">Koi user nahi mila.</div>';
      list.querySelectorAll('[data-uview]').forEach((b) => b.addEventListener('click', () => openUser(b.getAttribute('data-uview'))));
      pager(list, out.page, out.total, out.page_size, loadUsers);
    } catch (e) { list.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
  }

  async function openUser(id) {
    let d;
    try { d = await call('GET', '/api/admin/manage/users/' + id); } catch (e) { toast(e.message); return; }
    const u = d.user;
    const tx = d.transactions || [];
    const canBlock = adminRole === 'super_admin' || adminRole === 'admin';
    const canAdj = adminRole === 'super_admin';
    const canDel = adminRole === 'super_admin';
    const txHtml = tx.length ? tx.map((t) =>
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:4px 0"><span>' + esc(t.type) + ' (' + esc(t.balance_type) + ')' + (t.note ? ' - ' + esc(t.note) : '') + '</span><b>' + (t.direction === 'credit' ? '+' : '-') + inr(t.amount) + '</b></div>').join('')
      : '<div class="empty">Koi transaction nahi</div>';
    const m = modal(
      '<h2>' + esc(u.username) + ' ' + pill(u.status, u.status !== 'active') + '</h2>' +
      '<div style="font-size:13px;opacity:.75;margin-bottom:10px">' + esc(u.user_code) + ' | ' + esc(u.email) + ' | joined ' + esc(fmtDate(u.created_at)) + '</div>' +
      '<div style="font-size:14px;line-height:1.8">Deposit: <b>' + inr(u.deposit_balance) + '</b> | Winnings: <b>' + inr(u.winnings_balance) + '</b> | Bonus: <b>' + inr(u.bonus_balance) + '</b><br>' +
      'Matches: <b>' + esc(u.total_matches) + '</b> | Wins: <b>' + esc(u.total_wins) + '</b> | Earnings: <b>' + inr(u.total_earnings) + '</b> | Referral code: <b>' + esc(u.referral_code) + '</b></div>' +
      (canBlock ? '<button class="btn ghost" id="m-block" style="margin-top:12px;width:100%">' + (u.status === 'active' ? 'Block user' : 'Unblock user') + '</button>' : '') +
      (canDel && String(u.email).indexOf('@deleted.invalid') === -1 ? '<button class="btn ghost" id="m-del" style="margin-top:10px;width:100%;color:#ff4d6a;border-color:#ff4d6a">Delete user permanently</button>' : '') +
      (canAdj ?
        '<h2 style="margin-top:16px">Balance adjust</h2>' +
        '<div class="grid2"><div><label for="m-bt">Balance</label><select id="m-bt"><option value="deposit">Deposit</option><option value="winnings">Winnings</option><option value="bonus">Bonus</option></select></div>' +
        '<div><label for="m-dir">Action</label><select id="m-dir"><option value="credit">Add</option><option value="debit">Cut</option></select></div></div>' +
        '<label for="m-amt">Amount (Rs)</label><input id="m-amt" type="number" min="1" step="1">' +
        '<label for="m-note">Reason (zaroori)</label><input id="m-note" maxlength="100">' +
        '<div class="err" id="m-err"></div><button class="btn" id="m-apply">Apply</button>' : '') +
      '<h2 style="margin-top:16px">Recent transactions</h2>' + txHtml +
      '<button class="btn ghost" id="m-close" style="margin-top:14px;width:100%">Close</button>');
    const el = m.el;
    el.querySelector('#m-close').addEventListener('click', m.close);
    const refresh = () => { m.close(); openUser(id); loadUsers(uPage); };
    const blockBtn = el.querySelector('#m-block');
    if (blockBtn) blockBtn.addEventListener('click', async () => {
      const to = u.status === 'active' ? 'blocked' : 'active';
      if (!window.confirm((to === 'blocked' ? 'Block' : 'Unblock') + ' "' + u.username + '"?')) return;
      blockBtn.disabled = true;
      try { await call('PATCH', '/api/admin/manage/users/' + id + '/status', { status: to }); toast(to === 'blocked' ? 'User blocked' : 'User unblocked'); refresh(); }
      catch (e) { toast(e.message); blockBtn.disabled = false; }
    });

    const delBtn = el.querySelector('#m-del');
    if (delBtn) delBtn.addEventListener('click', async () => {
      const bal = Number(u.deposit_balance || 0) + Number(u.winnings_balance || 0) + Number(u.bonus_balance || 0);
      const typed = window.prompt('PERMANENT DELETE.\nUser ke wallet me ' + inr(bal) + ' hai.\nEmail, username aur password hat jayenge, wapas nahi aayega. Wallet history anonymous rahegi.\n\nConfirm karne ke liye username type karo: ' + u.username);
      if (typed === null) return;
      if (typed.trim() !== u.username) { toast('Username match nahi hua, delete nahi hua'); return; }
      delBtn.disabled = true;
      try { await call('DELETE', '/api/admin/user-delete/' + id); toast('User delete ho gaya'); m.close(); loadUsers(uPage); }
      catch (e) { toast(e.message); delBtn.disabled = false; }
    });

    const applyBtn = el.querySelector('#m-apply');
    if (applyBtn) applyBtn.addEventListener('click', async () => {
      const err = el.querySelector('#m-err');
      err.textContent = '';
      const body = {
        balance_type: el.querySelector('#m-bt').value,
        direction: el.querySelector('#m-dir').value,
        amount: Number(el.querySelector('#m-amt').value),
        note: el.querySelector('#m-note').value.trim(),
      };
      if (!Number.isFinite(body.amount) || body.amount <= 0) { err.textContent = 'Sahi amount daalo'; return; }
      if (body.note.length < 3) { err.textContent = 'Reason likho (kam se kam 3 letters)'; return; }
      if (!window.confirm((body.direction === 'credit' ? 'ADD ' : 'CUT ') + inr(body.amount) + ' ' + body.balance_type + ' - ' + u.username + '?')) return;
      applyBtn.disabled = true;
      try { await call('POST', '/api/admin/manage/users/' + id + '/adjust', body); toast('Balance updated'); refresh(); }
      catch (e) { err.textContent = e.message; applyBtn.disabled = false; }
    });
  }

  // ----- Support -----
  let sStatus = 'open';
  const SP_CAT = { deposit: 'Deposit', withdrawal: 'Withdrawal', match: 'Match', prize: 'Prize', account: 'Account', other: 'Other' };
  async function loadSupport(page) {
    const box = document.getElementById('sec-support');
    if (!box.querySelector('#s-list')) {
      box.innerHTML = '<div class="a-card"><h2>Support requests <span id="s-open"></span></h2>' +
        '<label for="s-status">Status</label><select id="s-status"><option value="open">Open</option><option value="closed">Closed</option><option value="">All</option></select>' +
        '<div id="s-list" style="margin-top:10px"></div></div>';
      const sel = box.querySelector('#s-status');
      sel.value = sStatus;
      sel.addEventListener('change', (e) => { sStatus = e.target.value; loadSupport(1); });
    }
    const list = document.getElementById('s-list');
    list.innerHTML = '<div class="empty">Loading...</div>';
    try {
      const out = await call('GET', '/api/admin/support?page=' + page + '&status=' + encodeURIComponent(sStatus));
      const rows = out.tickets || [];
      document.getElementById('s-open').innerHTML = pill((out.open_count || 0) + ' open', !out.open_count);
      list.innerHTML = rows.length ? rows.map((t, i) =>
        '<div class="row" style="flex-wrap:wrap"><div class="info"><b>' + esc(t.ticket_no) + ' - ' + esc(t.username || 'deleted user') + '</b>' +
        '<span>' + esc(SP_CAT[t.category] || t.category) + ' | ' + esc(t.user_code) + ' | ' + esc(fmtDate(t.created_at)) + '</span></div>' +
        pill(t.status, t.status === 'closed') +
        '<button class="btn ghost small" data-sopen="' + i + '">' + (t.status === 'open' ? 'Reply / Close' : 'View') + '</button>' +
        '<div style="flex-basis:100%;font-size:13px;white-space:pre-wrap;word-break:break-word;opacity:.9;margin-top:6px">' + esc(t.message) + '</div>' +
        (t.admin_note ? '<div style="flex-basis:100%;font-size:12.5px;opacity:.75;margin-top:4px">Reply: ' + esc(t.admin_note) + '</div>' : '') +
        '</div>').join('')
        : '<div class="empty">Koi request nahi.</div>';
      list.querySelectorAll('[data-sopen]').forEach((b) => b.addEventListener('click', () => openTicket(rows[Number(b.getAttribute('data-sopen'))])));
      pager(list, out.page, out.total, out.page_size, loadSupport);
    } catch (e) { list.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
  }

  function openTicket(t) {
    const isOpen = t.status === 'open';
    const m = modal(
      '<h2>' + esc(t.ticket_no) + ' ' + pill(t.status, !isOpen) + '</h2>' +
      '<div style="font-size:13px;opacity:.75;margin-bottom:8px">' + esc(t.username || 'deleted user') + ' | ' + esc(t.email) + ' | ' + esc(SP_CAT[t.category] || t.category) + ' | ' + esc(fmtDate(t.created_at)) + '</div>' +
      '<div style="font-size:14px;white-space:pre-wrap;word-break:break-word;padding:10px;border:1px solid rgba(128,128,128,.3);border-radius:10px;margin-bottom:12px">' + esc(t.message) + '</div>' +
      '<label for="s-note">Reply (user ko dikhega, optional)</label>' +
      '<textarea id="s-note" maxlength="500" rows="4" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:inherit;color:inherit;font:inherit">' + esc(t.admin_note || '') + '</textarea>' +
      '<div class="err" id="s-err"></div>' +
      (isOpen
        ? '<button class="btn" id="s-close" style="margin-top:8px">Close ticket</button>' +
          '<button class="btn ghost" id="s-reply" style="margin-top:10px;width:100%">Sirf reply save karo (open rehne do)</button>'
        : '<button class="btn" id="s-reopen" style="margin-top:8px">Reopen</button>') +
      '<button class="btn ghost" id="s-x" style="margin-top:10px;width:100%">Cancel</button>');
    const el = m.el;
    const err = el.querySelector('#s-err');
    el.querySelector('#s-x').addEventListener('click', m.close);
    async function send(status, btn) {
      err.textContent = '';
      btn.disabled = true;
      try {
        await call('PATCH', '/api/admin/support/' + t.id, { status: status, note: el.querySelector('#s-note').value.trim() });
        toast(status === 'closed' ? 'Ticket closed' : (isOpen ? 'Reply saved' : 'Ticket reopened'));
        m.close();
        loadSupport(1);
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    }
    const c = el.querySelector('#s-close'); if (c) c.addEventListener('click', () => send('closed', c));
    const r = el.querySelector('#s-reply'); if (r) r.addEventListener('click', () => send('open', r));
    const o = el.querySelector('#s-reopen'); if (o) o.addEventListener('click', () => send('open', o));
  }

  // ----- Deposits -----
  let dStatus = '';
  async function loadDeposits(page) {
    const box = document.getElementById('sec-deps');
    if (!box.querySelector('#d-list')) {
      box.innerHTML = '<div class="a-card"><h2>Deposits</h2>' +
        '<label for="d-status">Status</label><select id="d-status"><option value="">All</option><option value="success">Success</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="rejected">Rejected</option></select>' +
        '<div id="d-list" style="margin-top:10px"><div class="empty">Loading...</div></div></div>';
      box.querySelector('#d-status').addEventListener('change', (e) => { dStatus = e.target.value; loadDeposits(1); });
    }
    const list = document.getElementById('d-list');
    list.innerHTML = '<div class="empty">Loading...</div>';
    try {
      const out = await call('GET', '/api/admin/manage/deposits?page=' + page + '&status=' + encodeURIComponent(dStatus));
      const rows = out.deposits || [];
      list.innerHTML = rows.length ? rows.map((x) =>
        '<div class="row"><div class="info"><b>' + inr(x.amount) + ' - ' + esc(x.username) + '</b><span>' + esc(x.email) + ' | ' + esc(x.method) + ' | ' + esc(fmtDate(x.created_at)) + (x.cf_order_id ? ' | ' + esc(x.cf_order_id) : '') + '</span></div>' +
        pill(x.status, x.status !== 'success') + '</div>').join('')
        : '<div class="empty">Koi deposit nahi.</div>';
      pager(list, out.page, out.total, out.page_size, loadDeposits);
    } catch (e) { list.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
  }

  call('GET', '/api/admin/me').then((out) => showDash(out.admin)).catch(showLogin);
})();