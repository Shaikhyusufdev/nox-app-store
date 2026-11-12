(function () {
  'use strict';

  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');
  const state = { user: null };
  const M = window.Motion || { enter() {}, nav() {} }; // motion.js na chale to app phir bhi chalta hai
  // har user ke username se alag avatar rang (automatic)
  function hue(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  const avatarStyle = (name) => { const h = hue(name); return `background:linear-gradient(135deg,hsl(${h} 70% 45%),hsl(${(h + 45) % 360} 75% 52%))`; };

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  let toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
  }
  const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    trophy: svg('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'),
    gift: svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>'),
    home: svg('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    wallet: svg('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'),
    user: svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    coin: svg('<circle cx="12" cy="12" r="9"/><path d="M14.5 9a3 3 0 0 0-2.5-1c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-2.5-1"/><path d="M12 6v2M12 16v2"/>'),
    headset: svg('<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>'),
    clock: svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    play: svg('<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>'),
    check: svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    bolt: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
    shield: svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'),
    back: svg('<path d="m15 18-6-6 6-6"/>'),
  };

  /* ---------- router ---------- */
  const PUBLIC = ['/login', '/register'];
  const path = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
  function go(p) {
    if (location.hash === '#' + p) render();
    else location.hash = p;
  }

  async function boot() {
    try { state.user = (await api.get('/auth/me')).user; } catch { state.user = null; }
    // referral link (?ref=CODE) se aaya aur login nahi hai -> seedha register screen
    const ref = new URLSearchParams(location.search).get('ref');
    if (!state.user && ref && !location.hash) location.hash = '/register';
    if (state.user) await handlePaymentReturn();
    window.addEventListener('hashchange', render);
    render();
  }

  // Cashfree se wapas aane par (?order_id=...) payment verify karo
  async function handlePaymentReturn() {
    const orderId = new URLSearchParams(location.search).get('order_id');
    if (!orderId) return;
    history.replaceState(null, '', location.pathname + (location.hash || '#/wallet'));
    try {
      const r = await api.get('/payments/verify?order_id=' + encodeURIComponent(orderId));
      if (r.status === 'success') toast('Deposit successful! Balance update ho gaya');
      else if (r.status === 'failed') toast('Payment fail ho gayi. Dobara try karo');
      else toast('Payment process ho rahi hai, thodi der me wallet check karo');
    } catch { toast('Payment status check nahi ho paya, wallet dekho'); }
  }

  const PAGES = {
    '/': renderHome,
    '/profile': renderProfile,
    '/rank': () => renderSoon('Rank', 'Leaderboard (Hall of Fame)', 'trophy'),
    '/earn': () => renderSoon('Earn', 'Spin to Win aur Refer & Earn', 'gift'),
    '/wallet': renderWallet,
    '/support': () => renderSoon('Support', 'Help aur support', 'headset'),
  };

  function render() {
    clearInterval(cdTimer); // match countdown purane page ka band
    const p = path();
    if (!state.user && !PUBLIC.includes(p)) return go('/login');
    if (state.user && PUBLIC.includes(p)) return go('/');
    window.scrollTo(0, 0);
    if (p === '/login') return renderLogin();
    if (p === '/register') return renderRegister();
    let m;
    if ((m = p.match(/^\/game\/([0-9a-f-]{36})$/i))) return renderGame(m[1]);
    if ((m = p.match(/^\/match\/([0-9a-f-]{36})$/i))) return renderMatch(m[1]);
    if ((m = p.match(/^\/contests(?:\/(upcoming|ongoing|completed))?$/))) return renderContests(m[1] || 'upcoming');
    (PAGES[p] || (() => renderSoon('Not found', 'Ye page nahi mila', 'home')))();
  }

  /* ---------- shell ---------- */
  function navHtml(active) {
    const item = (href, key, label, icon, cls = '') =>
      `<a href="${href}" class="${cls} ${active === key ? 'on' : ''}">${ICON[icon]}<span>${label}</span></a>`;
    return `<nav class="nav" aria-label="Main">
      ${item('#/rank', 'rank', 'Rank', 'trophy')}
      ${item('#/earn', 'earn', 'Earn', 'gift')}
      ${item('#/', 'home', '', 'home', 'home')}
      ${item('#/wallet', 'wallet', 'Wallet', 'wallet')}
      ${item('#/profile', 'profile', 'Profile', 'user')}
    </nav>`;
  }
  const subHeader = (title, balance, backHref) => `
    <header class="topbar">
      <a class="back" href="${backHref || '#/'}" aria-label="Back">${ICON.back}</a>
      <div class="title">${esc(title)}</div>
      <a class="chip" href="#/wallet" data-count="${Number(balance) || 0}">${money(balance)}</a>
    </header>`;

  async function getBalance() {
    try { return (await api.get('/wallet')).wallet.total_balance; } catch { return 0; }
  }

  /* ---------- auth screens ---------- */
  function authLayout(inner) {
    return `<div class="auth">
      <div class="brand">NOX ESPORTS</div>
      <p class="tag">Play. Win. Withdraw.</p>
      ${inner}
    </div>`;
  }

  function renderLogin() {
    $app.innerHTML = authLayout(`
      <h1>Login</h1>
      <form id="f" novalidate>
        <div class="field"><label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="field"><label for="pw">Password</label>
          <input id="pw" type="password" autocomplete="current-password" required></div>
        <div class="err" id="err"></div>
        <button class="btn" id="go" type="submit">Login</button>
      </form>
      <p class="alt">Account nahi hai? <a href="#/register">Register karo</a></p>`);
    bindAuthForm(async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('pw').value;
      await api.post('/auth/login', { email, password });
    });
    M.enter();
  }

  function renderRegister() {
    const ref = (new URLSearchParams(location.search).get('ref') || '').trim();
    $app.innerHTML = authLayout(`
      <h1>Create account</h1>
      <form id="f" novalidate>
        <div class="field"><label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="field"><label for="un">Username</label>
          <input id="un" type="text" autocomplete="username" maxlength="20" required>
          <small>3-20 characters: letters, numbers, underscore</small></div>
        <div class="field"><label for="pw">Password</label>
          <input id="pw" type="password" autocomplete="new-password" minlength="8" required>
          <small>Kam se kam 8 characters</small></div>
        <div class="field"><label for="ref">Referral code (optional)</label>
          <input id="ref" type="text" maxlength="20" value="${esc(ref)}"></div>
        <div class="err" id="err"></div>
        <button class="btn" id="go" type="submit">Register</button>
      </form>
      <p class="alt">Pehle se account hai? <a href="#/login">Login karo</a></p>`);
    bindAuthForm(async () => {
      const body = {
        email: document.getElementById('email').value.trim(),
        username: document.getElementById('un').value.trim(),
        password: document.getElementById('pw').value,
      };
      const r = document.getElementById('ref').value.trim();
      if (r) body.ref = r;
      await api.post('/auth/register', body);
    });
    M.enter();
  }

  // submit -> action() (login/register API) -> /me se user lo -> Home
  function bindAuthForm(action) {
    const form = document.getElementById('f');
    const btn = document.getElementById('go');
    const err = document.getElementById('err');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Please wait...';
      btn.classList.add('busy');
      try {
        await action();
        state.user = (await api.get('/auth/me')).user;
        go('/');
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        btn.textContent = label;
        btn.classList.remove('busy');
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      }
    });
  }

  /* ---------- Home ---------- */
  function skeletonHome() {
    const rep = (n, cls) => Array.from({ length: n }, () => `<i class="sk ${cls}"></i>`).join('');
    return `<div class="screen">
      <div class="sk sk-top"></div>
      <div class="sk-row sk-quick">${rep(4, 'sk-circle')}</div>
      <div class="sk sk-line"></div>
      <div class="sk-row sk-three">${rep(3, 'sk-box')}</div>
      <div class="sk sk-line"></div>
      <div class="sk-row sk-three">${rep(6, 'sk-card')}</div>
      ${navHtml('home')}
    </div>`;
  }
  async function renderHome() {
    $app.innerHTML = skeletonHome();
    M.nav();
    const [w, g] = await Promise.allSettled([api.get('/wallet'), api.get('/games')]);
    if (path() !== '/') return; // user dusre page pe chala gaya
    const balance = w.status === 'fulfilled' ? w.value.wallet.total_balance : 0;
    const games = g.status === 'fulfilled' ? g.value.games : [];
    const name = state.user.username || 'Player';

    const quick = [
      ['#/earn', 'Earn', 'coin', '#d9a23a'],
      ['#/rank', 'Top Players', 'trophy', '#1f9a8f'],
      ['#/wallet', 'My Wallet', 'wallet', '#2fae7c'],
      ['#/support', 'Support', 'headset', '#6a5acd'],
    ].map(([href, label, icon, c]) =>
      `<a href="${href}"><span class="ico" style="--c:${c}">${ICON[icon]}</span>${label}</a>`).join('');

    const contests = [
      ['Upcoming', 'clock', '#1f9a8f'],
      ['Ongoing', 'play', '#6a5acd'],
      ['Completed', 'check', '#2fae7c'],
    ].map(([label, icon, c]) =>
      `<button class="contest" data-contest="${label.toLowerCase()}" style="--c:${c}">${ICON[icon]}${label}</button>`).join('');

    const gamesHtml = games.length
      ? `<div class="games">${games.map((x) => `
          <button class="game" data-game="${esc(x.id)}">
            ${x.image_url ? `<img src="${esc(x.image_url)}" alt="" loading="lazy">` : ''}
            <span>${esc(x.name)}</span>
          </button>`).join('')}</div>`
      : `<div class="empty"><b>Abhi koi game nahi hai</b>Admin panel se games add hone ke baad yaha dikhenge.</div>`;

    $app.innerHTML = `<div class="screen">
      <header class="topbar">
        <div class="avatar" style="${avatarStyle(name)}">${esc(name.charAt(0).toUpperCase())}</div>
        <div class="hello"><small>Hi, <span class="uname">${esc(name)}</span></small><b>NOX ESPORTS</b></div>
        <a class="chip" href="#/wallet" data-count="${Number(balance) || 0}">${money(balance)}</a>
      </header>
      <div class="quick">${quick}</div>
      <div class="sec-title">${ICON.shield}MY CONTESTS</div>
      <div class="contests">${contests}</div>
      <div class="sec-title">${ICON.bolt}ESPORT GAMES</div>
      ${gamesHtml}
      ${navHtml('home')}
    </div>`;

    $app.querySelectorAll('[data-contest]').forEach((b) =>
      b.addEventListener('click', () => go('/contests/' + b.getAttribute('data-contest'))));
    $app.querySelectorAll('[data-game]').forEach((b) =>
      b.addEventListener('click', () => go('/game/' + b.getAttribute('data-game'))));
    M.enter();
  }

  /* ---------- Matches (Mode tabs, Category, Slots) ---------- */
  const MODES = [['solo', 'Solo'], ['duo', 'Duo'], ['squad', 'Squad']];
  const MODE_NAME = { solo: 'Solo', duo: 'Duo', squad: 'Squad' };
  const ST_LABEL = { upcoming: 'Upcoming', registration_open: 'Open', full: 'Full', ongoing: 'Live', completed: 'Completed', cancelled: 'Cancelled' };
  const JOINABLE = ['upcoming', 'registration_open'];
  const gameFilter = { mode: 'solo', cat: 'all' };
  let cdTimer;

  const MATCH_CSS = `
.mt-tabs{display:flex;gap:8px;margin:14px 0 8px}
.mt-tabs button{flex:1;padding:11px 0;border-radius:12px;border:1px solid #d9d5cf;background:#fff;font-weight:700;font-size:14px;color:#33302b;cursor:pointer}
.mt-tabs button.on{background:linear-gradient(135deg,#1fa99b,#5b52d6);color:#fff;border-color:transparent}
.mt-chips{display:flex;gap:8px;overflow-x:auto;padding:4px 0 10px;scrollbar-width:none}
.mt-chips::-webkit-scrollbar{display:none}
.mt-chips button{flex:none;padding:7px 14px;border-radius:999px;border:1px solid #d9d5cf;background:#fff;font-size:13px;font-weight:600;color:#33302b;cursor:pointer}
.mt-chips button.on{background:#1f2430;color:#fff;border-color:#1f2430}
.mt-card{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e6e2db;border-radius:16px;padding:14px;margin-bottom:12px;cursor:pointer;position:relative;color:#1f2430;font:inherit}
.mt-card h3{margin:0 0 4px;font-size:16px;padding-right:112px}
.mt-card .meta{font-size:12.5px;color:#6b665e;margin-bottom:10px}
.mt-card .row3{display:flex;gap:8px}
.mt-card .row3 div{flex:1;background:#f5f3f0;border-radius:10px;padding:8px;text-align:center}
.mt-card .row3 small{display:block;font-size:11px;color:#6b665e}
.mt-card .row3 b{font-size:14px}
.mt-bar{height:6px;border-radius:6px;background:#ece8e1;margin-top:10px;overflow:hidden}
.mt-bar i{display:block;height:100%;background:linear-gradient(90deg,#1fa99b,#5b52d6)}
.mt-cd{position:absolute;top:12px;right:12px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.4px;color:#fff;background:linear-gradient(135deg,#ff3d6e,#ff8a1f);box-shadow:0 0 0 0 rgba(255,61,110,.6);animation:mtGlow 1.6s ease-in-out infinite;font-variant-numeric:tabular-nums}
.mt-cd.ok{background:linear-gradient(135deg,#1fa99b,#5b52d6);animation:none}
@keyframes mtGlow{0%{box-shadow:0 0 0 0 rgba(255,61,110,.55),0 0 8px rgba(255,138,31,.5)}70%{box-shadow:0 0 0 10px rgba(255,61,110,0),0 0 18px rgba(255,138,31,.9)}100%{box-shadow:0 0 0 0 rgba(255,61,110,0),0 0 8px rgba(255,138,31,.5)}}
@media (prefers-reduced-motion:reduce){.mt-cd{animation:none}}
.mt-head{position:relative;background:#fff;border:1px solid #e6e2db;border-radius:16px;padding:14px;margin:10px 0}
.mt-head h2{margin:0 0 4px;font-size:18px;padding-right:120px}
.mt-head .meta{font-size:12.5px;color:#6b665e}
.mt-teams{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
.mt-team{border-radius:16px;padding:10px;border:2px solid}
.mt-team.red{border-color:#ff5a5f;background:#fff4f4}
.mt-team.blue{border-color:#3b82f6;background:#f2f7ff}
.mt-team h4{margin:0 0 8px;text-align:center;font-size:13px;letter-spacing:1px}
.mt-team.red h4{color:#d6333a}.mt-team.blue h4{color:#2563eb}
.mt-brgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:10px 0}
.mt-brteam{border:1px solid #e6e2db;background:#fff;border-radius:14px;padding:8px}
.mt-brteam h4{margin:0 0 6px;font-size:12px;color:#6b665e;letter-spacing:.6px}
.mt-slot{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;border-radius:10px;margin-bottom:6px;font:inherit;font-size:13px;text-align:left;border:1px dashed #bdb8b0;background:#fff;color:#1f2430}
.mt-slot:last-child{margin-bottom:0}
.mt-slot i{font-style:normal;font-weight:800;font-size:11px;min-width:20px;height:20px;border-radius:6px;background:#ece8e1;display:grid;place-items:center}
.mt-slot b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt-slot.open{cursor:pointer}
.mt-slot.open b{color:#1f9a8f}
.mt-slot.open:disabled{cursor:default;opacity:.55}
.mt-slot.taken{border-style:solid;border-color:#e6e2db;background:#faf9f7}
.mt-slot.me{border-color:#1fa99b;background:#eafaf7}
.mt-slot em{font-style:normal;font-size:10px;font-weight:800;color:#fff;background:#1fa99b;border-radius:6px;padding:2px 6px}
.mt-note{font-size:13px;color:#6b665e;text-align:center;margin:8px 0}
.mt-room{margin:10px 0;padding:14px;border-radius:16px;background:#1f2430;color:#fff}
.mt-room div{display:flex;justify-content:space-between;padding:4px 0}
.mt-conf{font-size:14px;line-height:1.7;margin-bottom:10px}
`;
  function injectMatchCss() {
    if (document.getElementById('match-css')) return;
    const st = document.createElement('style');
    st.id = 'match-css';
    st.textContent = MATCH_CSS;
    document.head.appendChild(st);
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  function cdText(iso, status) {
    if (status === 'completed') return 'ENDED';
    if (status === 'cancelled') return 'CANCELLED';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return status === 'ongoing' ? 'LIVE' : 'STARTING';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s % 60);
  }
  function tickCd() {
    $app.querySelectorAll('[data-cd]').forEach((el) => {
      const st = el.getAttribute('data-st');
      el.textContent = cdText(el.getAttribute('data-cd'), st);
      el.classList.toggle('ok', st === 'completed' || st === 'cancelled');
    });
  }
  function startCd() { clearInterval(cdTimer); tickCd(); cdTimer = setInterval(tickCd, 1000); }
  const cdHtml = (t) => `<span class="mt-cd" data-cd="${esc(t.starts_at)}" data-st="${esc(t.status)}">...</span>`;

  function matchCard(t, catName) {
    const full = t.max_players > 0 ? Math.min(100, Math.round((t.joined_count / t.max_players) * 100)) : 0;
    return `<button type="button" class="mt-card" data-match="${esc(t.id)}">
      ${cdHtml(t)}
      <h3>${esc(t.title)}</h3>
      <div class="meta">${esc(catName)} &middot; ${esc(MODE_NAME[t.mode] || '')} &middot; ${esc(ST_LABEL[t.status] || t.status)} &middot; ${esc(fmtDate(t.starts_at))}</div>
      <div class="row3">
        <div><small>Entry</small><b>${Number(t.entry_fee) > 0 ? money(t.entry_fee) : 'FREE'}</b></div>
        <div><small>Prize pool</small><b>${money(t.prize_pool)}</b></div>
        <div><small>Joined</small><b>${t.joined_count}/${t.max_players}</b></div>
      </div>
      <div class="mt-bar"><i style="width:${full}%"></i></div>
    </button>`;
  }

  async function renderGame(gameId) {
    injectMatchCss();
    const rep = (n, cls) => Array.from({ length: n }, () => `<i class="sk ${cls}"></i>`).join('');
    $app.innerHTML = `<div class="screen"><div class="sk sk-top"></div><div class="sk-row sk-three">${rep(3, 'sk-box')}</div>${navHtml('home')}</div>`;
    const [gs, cs, ts, bal] = await Promise.allSettled([
      api.get('/games'), api.get('/categories'), api.get('/tournaments?game=' + gameId), getBalance(),
    ]);
    if (path() !== '/game/' + gameId) return;
    const game = gs.status === 'fulfilled' ? gs.value.games.find((x) => x.id === gameId) : null;
    if (!game) { toast('Game nahi mila'); return go('/'); }
    const cats = cs.status === 'fulfilled' ? cs.value.categories : [];
    const list = ts.status === 'fulfilled' ? ts.value.tournaments : [];
    const balance = bal.status === 'fulfilled' ? bal.value : 0;

    function draw() {
      const shown = list.filter((t) => t.mode === gameFilter.mode && (gameFilter.cat === 'all' || t.category_id === gameFilter.cat));
      const tabs = MODES.map(([k, l]) => `<button type="button" data-mode="${k}" class="${gameFilter.mode === k ? 'on' : ''}">${l}</button>`).join('');
      const chips = `<button type="button" data-cat="all" class="${gameFilter.cat === 'all' ? 'on' : ''}">All</button>` +
        cats.map((c) => `<button type="button" data-cat="${esc(c.id)}" class="${gameFilter.cat === c.id ? 'on' : ''}">${esc(c.name)}</button>`).join('');
      const body = shown.length
        ? shown.map((t) => matchCard(t, t.category_name || 'Match')).join('')
        : `<div class="empty"><b>Abhi koi match nahi</b>Is mode/category me jald naye matches aayenge.</div>`;
      $app.innerHTML = `<div class="screen">
        ${subHeader(game.name.toUpperCase(), balance)}
        <div class="mt-tabs">${tabs}</div>
        <div class="mt-chips">${chips}</div>
        ${body}
        ${navHtml('home')}
      </div>`;
      $app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { gameFilter.mode = b.getAttribute('data-mode'); draw(); }));
      $app.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { gameFilter.cat = b.getAttribute('data-cat'); draw(); }));
      $app.querySelectorAll('[data-match]').forEach((b) => b.addEventListener('click', () => go('/match/' + b.getAttribute('data-match'))));
      startCd();
      M.enter();
    }
    draw();
  }

  function slotBtn(team, slot, label, p, canJoin) {
    if (p) return `<div class="mt-slot taken${p.is_me ? ' me' : ''}"><i>${esc(label)}</i><b>${esc(p.username)}</b>${p.is_me ? '<em>YOU</em>' : ''}</div>`;
    return `<button type="button" class="mt-slot open" data-team="${team}" data-slot="${slot}" data-label="${esc(label)}"${canJoin ? '' : ' disabled'}><i>${esc(label)}</i><b>${canJoin ? 'Join' : 'Empty'}</b></button>`;
  }

  async function renderMatch(id) {
    injectMatchCss();
    const rep = (n, cls) => Array.from({ length: n }, () => `<i class="sk ${cls}"></i>`).join('');
    $app.innerHTML = `<div class="screen"><div class="sk sk-top"></div><div class="sk-row sk-three">${rep(3, 'sk-box')}</div>${navHtml('home')}</div>`;
    let t;
    try { t = (await api.get('/tournaments/' + id)).tournament; }
    catch (ex) {
      if (path() !== '/match/' + id) return;
      if (ex.status === 401) { state.user = null; return go('/login'); }
      toast(ex.message || 'Match load nahi hua');
      return go('/');
    }
    if (path() !== '/match/' + id) return;
    const balance = await getBalance();
    if (path() !== '/match/' + id) return;

    const taken = {};
    (t.participants || []).forEach((p) => { taken[p.team_no + '-' + p.slot_no] = p; });
    const canJoin = !t.is_joined && JOINABLE.includes(t.status) && t.joined_count < t.max_players;
    const size = t.team_size || 1, count = t.team_count || 2;

    let board = '';
    if (t.layout === 'br') {
      if (size === 1) {
        board = `<div class="mt-brgrid">${Array.from({ length: count }, (_, i) => slotBtn(i + 1, 1, String(i + 1), taken[(i + 1) + '-1'], canJoin)).join('')}</div>`;
      } else {
        board = `<div class="mt-brgrid">${Array.from({ length: count }, (_, i) => `<div class="mt-brteam"><h4>TEAM ${i + 1}</h4>${
          Array.from({ length: size }, (_, j) => slotBtn(i + 1, j + 1, String(j + 1), taken[(i + 1) + '-' + (j + 1)], canJoin)).join('')}</div>`).join('')}</div>`;
      }
    } else {
      const col = (team, cls, name) => `<div class="mt-team ${cls}"><h4>${name}</h4>${
        Array.from({ length: size }, (_, j) => slotBtn(team, j + 1, String(j + 1), taken[team + '-' + (j + 1)], canJoin)).join('')}</div>`;
      board = `<div class="mt-teams">${col(1, 'red', 'RED TEAM')}${col(2, 'blue', 'BLUE TEAM')}</div>`;
    }

    const note = t.is_joined ? 'Aap is match me join ho chuke ho. Slot match khatam hone tak aapka rahega.'
      : !JOINABLE.includes(t.status) ? 'Is match ki registration band hai.'
      : t.joined_count >= t.max_players ? 'Match full ho chuka hai.'
      : 'Khali slot par tap karke apni jagah chuno.';
    const room = t.room ? `<div class="mt-room"><div><span>Room ID</span><b>${esc(t.room.room_id)}</b></div><div><span>Password</span><b>${esc(t.room.room_password)}</b></div></div>` : '';

    $app.innerHTML = `<div class="screen">
      ${subHeader('MATCH', balance, '#/game/' + t.game_id)}
      <div class="mt-head">
        ${cdHtml(t)}
        <h2>${esc(t.title)}</h2>
        <div class="meta">${esc(t.category_name || 'Match')} &middot; ${esc(MODE_NAME[t.mode] || '')} &middot; ${esc(ST_LABEL[t.status] || t.status)} &middot; ${esc(fmtDate(t.starts_at))}</div>
        <div class="meta" style="margin-top:6px">Entry <b>${Number(t.entry_fee) > 0 ? money(t.entry_fee) : 'FREE'}</b> &middot; Prize <b>${money(t.prize_pool)}</b> &middot; Joined <b>${t.joined_count}/${t.max_players}</b></div>
      </div>
      ${room}
      <div class="mt-note">${esc(note)}</div>
      ${board}
      ${t.rules ? `<div class="card" style="padding:14px;margin-top:10px"><b>Rules</b><p style="margin:6px 0 0;white-space:pre-wrap">${esc(t.rules)}</p></div>` : ''}
      ${navHtml('home')}
    </div>`;
    $app.querySelectorAll('button.mt-slot.open:not(:disabled)').forEach((b) => b.addEventListener('click', () =>
      joinSlotSheet(t, Number(b.getAttribute('data-team')), Number(b.getAttribute('data-slot')), b.getAttribute('data-label'))));
    startCd();
    M.enter();
  }

  function joinSlotSheet(t, team, slot, label) {
    const where = t.layout === 'br' ? (t.team_size === 1 ? 'Slot ' + label : 'Team ' + team + ', Slot ' + slot) : (team === 1 ? 'RED' : 'BLUE') + ' team, Slot ' + slot;
    const fee = Number(t.entry_fee) || 0;
    const s = openSheet('Confirm your slot', `
      <div class="mt-conf"><b>${esc(t.title)}</b><br>Aapka slot: <b>${esc(where)}</b><br>Entry fee: <b>${fee > 0 ? money(fee) : 'FREE'}</b><br>
      <small>Fee Bonus, phir Deposit, phir Winnings balance se kategi. Join ke baad slot match khatam hone tak badal nahi sakta.</small></div>
      <div class="err" id="jme"></div>
      <button class="btn" type="button" id="jmgo">${fee > 0 ? 'Pay ' + money(fee) + ' & Join' : 'Join Free'}</button>`);
    const btn = s.el.querySelector('#jmgo'), err = s.el.querySelector('#jme');
    btn.addEventListener('click', async () => {
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Please wait...';
      try {
        await api.post('/tournaments/' + t.id + '/join', { team_no: team, slot_no: slot });
        s.close();
        toast('Joined! Slot aapka ho gaya');
        renderMatch(t.id);
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = fee > 0 ? 'Pay ' + money(fee) + ' & Join' : 'Join Free';
        if (ex.status === 409) setTimeout(() => { s.close(); renderMatch(t.id); }, 1200); // slot kisi aur ne le liya -> fresh board
      }
    });
  }

  async function renderContests(tab) {
    injectMatchCss();
    const rep = (n, cls) => Array.from({ length: n }, () => `<i class="sk ${cls}"></i>`).join('');
    $app.innerHTML = `<div class="screen"><div class="sk sk-top"></div><div class="sk-row sk-three">${rep(3, 'sk-box')}</div>${navHtml('home')}</div>`;
    const [cs, ct, bal] = await Promise.allSettled([api.get('/my/contests'), api.get('/categories'), getBalance()]);
    if (!path().startsWith('/contests')) return;
    const rows = cs.status === 'fulfilled' ? cs.value.contests : [];
    const cats = ct.status === 'fulfilled' ? ct.value.categories : [];
    const catName = (id) => (cats.find((c) => c.id === id) || {}).name || 'Match';
    const balance = bal.status === 'fulfilled' ? bal.value : 0;
    const GROUP = { upcoming: ['upcoming', 'registration_open', 'full'], ongoing: ['ongoing'], completed: ['completed'] };
    const shown = rows.filter((r) => GROUP[tab].includes(r.tournaments.status));
    const tabs = ['upcoming', 'ongoing', 'completed'].map((k) => `<button type="button" data-tab="${k}" class="${tab === k ? 'on' : ''}">${k.charAt(0).toUpperCase() + k.slice(1)}</button>`).join('');
    const body = shown.length
      ? shown.map((r) => `<button type="button" class="mt-card" data-match="${esc(r.tournaments.id)}">${cdHtml(r.tournaments)}
          <h3>${esc(r.tournaments.title)}</h3>
          <div class="meta">${esc(catName(r.tournaments.category_id))} &middot; ${esc(MODE_NAME[r.tournaments.mode] || '')} &middot; ${esc(fmtDate(r.tournaments.starts_at))}</div>
          <div class="meta">Aapka slot: Team ${esc(r.team_no == null ? '-' : r.team_no)}, Slot ${esc(r.slot_no == null ? '-' : r.slot_no)}</div></button>`).join('')
      : `<div class="empty"><b>Koi match nahi</b>Is section me abhi koi joined match nahi hai.</div>`;
    $app.innerHTML = `<div class="screen">
      ${subHeader('MY CONTESTS', balance)}
      <div class="mt-tabs">${tabs}</div>
      ${body}
      ${navHtml('home')}
    </div>`;
    $app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => go('/contests/' + b.getAttribute('data-tab'))));
    $app.querySelectorAll('[data-match]').forEach((b) => b.addEventListener('click', () => go('/match/' + b.getAttribute('data-match'))));
    startCd();
    M.enter();
  }

  /* ---------- Profile (basic, full version Step 4 me) ---------- */
  async function renderProfile() {
    const balance = await getBalance();
    if (path() !== '/profile') return;
    const u = state.user;
    $app.innerHTML = `<div class="screen">
      ${subHeader('PROFILE', balance)}
      <div class="card prof">
        <div class="avatar" style="${avatarStyle(u.username || '?')}">${esc((u.username || '?').charAt(0).toUpperCase())}</div>
        <h2>${esc(u.username)}</h2>
        <div class="mail">${esc(u.email)}</div>
        <span class="code">My Code: ${esc(u.referral_code || '-')}</span>
      </div>
      <button class="btn-out" id="logout">Secure Logout</button>
      ${navHtml('profile')}
    </div>`;
    document.getElementById('logout').addEventListener('click', async () => {
      try { await api.post('/auth/logout'); } catch { /* cookie waise bhi clear ho jayegi */ }
      state.user = null;
      go('/login');
    });
    M.enter();
  }

  /* ---------- Wallet (Step 2) ---------- */
  const R = '\u20B9';
  const TX_LABEL = { deposit: 'Deposit', entry_fee: 'Entry fee', prize: 'Prize', withdrawal: 'Withdrawal', withdrawal_refund: 'Withdrawal refund', referral_bonus: 'Referral bonus', admin_adjust: 'Admin adjustment', refund: 'Refund', gift_code: 'Gift code', promo: 'Promo' };
  const BAL_LABEL = { deposit: 'Deposit', winnings: 'Winnings', bonus: 'Bonus' };
  const WD_MIN = 50, WD_FEE_PCT = 5, AF_MIN = 10, AF_MAX = 10000; // reference design; baad me admin settings se aayega
  const fmtDate = (s) => { try { return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

  // neeche se aane wala popup (Add Funds / Withdraw)
  function openSheet(title, html) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><b>${esc(title)}</b><button type="button" class="sheet-x" aria-label="Close">&times;</button></div>
      ${html}</div>`;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    function close() {
      document.removeEventListener('keydown', onKey);
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 220);
    }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('.sheet-x').addEventListener('click', close);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    return { el: wrap, close };
  }

  // Cashfree SDK sirf Add Funds dabane par load hota hai
  function loadCashfree() {
    if (window.Cashfree) return Promise.resolve();
    return new Promise((ok, fail) => {
      const t = document.createElement('script');
      t.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      t.onload = ok;
      t.onerror = () => fail(new Error('Payment page load nahi hua, internet check karo'));
      document.head.appendChild(t);
    });
  }

  function addFundsSheet() {
    const s = openSheet('Add Funds', `
      <div class="field"><label for="af">Amount (${R})</label>
        <input id="af" type="number" inputmode="numeric" min="${AF_MIN}" max="${AF_MAX}" placeholder="Amount likho"></div>
      <div class="amts">${[50, 100, 200, 500].map((a) => `<button type="button" class="amt" data-a="${a}">${R}${a}</button>`).join('')}</div>
      <div class="field"><label for="afp">Mobile number</label><input id="afp" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="10 digit number"></div>
      <div class="err" id="afe"></div>
      <button class="btn" type="button" id="afgo">Proceed to Pay</button>
      <p class="note">Min ${R}${AF_MIN}, max ${R}${AF_MAX}. Deposit balance se match join hota hai; withdraw sirf Winnings se hota hai.</p>`);
    const inp = s.el.querySelector('#af'), err = s.el.querySelector('#afe');
    s.el.querySelectorAll('.amt').forEach((b) => b.addEventListener('click', () => { inp.value = b.dataset.a; err.textContent = ''; }));
    const goBtn = s.el.querySelector('#afgo');
    goBtn.addEventListener('click', async () => {
      const a = Number(inp.value);
      if (!Number.isFinite(a) || a < AF_MIN || a > AF_MAX) { err.textContent = `Amount ${R}${AF_MIN} se ${R}${AF_MAX} ke beech do`; return; }
      const phone = s.el.querySelector('#afp').value.trim();
      if (!/^[6-9]\d{9}$/.test(phone)) { err.textContent = 'Sahi 10 digit mobile number likho'; return; }
      err.textContent = '';
      goBtn.disabled = true; goBtn.textContent = 'Please wait...';
      try {
        const o = await api.post('/payments/create', { amount: a, phone });
        await loadCashfree();
        window.Cashfree({ mode: o.mode }).checkout({ paymentSessionId: o.paymentSessionId, redirectTarget: '_self' });
      } catch (ex) {
        err.textContent = ex.message;
        goBtn.disabled = false; goBtn.textContent = 'Proceed to Pay';
      }
    });
  }

  function withdrawSheet(winnings) {
    const s = openSheet('Withdraw', `
      <div class="wd-avail">Withdrawable (Winnings): <b>${money(winnings)}</b></div>
      <div class="field"><label for="wa">Amount (${R})</label>
        <input id="wa" type="number" inputmode="numeric" min="${WD_MIN}" placeholder="Min ${R}${WD_MIN}"></div>
      <div class="fee" id="fee">Fee ${WD_FEE_PCT}%: ${R}0 &middot; Aapko milega: ${R}0</div>
      <div class="seg"><button type="button" class="on" data-m="upi">UPI</button><button type="button" data-m="bank">Bank</button></div>
      <div id="m-upi"><div class="field"><label for="upi">UPI ID</label><input id="upi" type="text" autocomplete="off" placeholder="name@bank"></div></div>
      <div id="m-bank" hidden>
        <div class="field"><label for="bn">Account holder name</label><input id="bn" type="text" autocomplete="off"></div>
        <div class="field"><label for="ba">Account number</label><input id="ba" type="text" inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="bi">IFSC</label><input id="bi" type="text" autocomplete="off" maxlength="11"></div>
      </div>
      <div class="err" id="wde"></div>
      <button class="btn" type="button" id="wdgo">Request Withdrawal</button>
      <p class="note">Min ${R}${WD_MIN} &middot; ${WD_FEE_PCT}% fee. Sirf Winnings balance withdraw hota hai, Bonus nahi.</p>`);
    const $ = (id) => s.el.querySelector(id);
    let method = 'upi';
    const calc = () => {
      const a = Number($('#wa').value) || 0;
      const fee = Math.round(a * WD_FEE_PCT) / 100;
      $('#fee').innerHTML = `Fee ${WD_FEE_PCT}%: ${money(fee)} &middot; Aapko milega: ${money(Math.max(0, a - fee))}`;
    };
    $('#wa').addEventListener('input', () => { $('#wde').textContent = ''; calc(); });
    s.el.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      method = b.dataset.m;
      s.el.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      $('#m-upi').hidden = method !== 'upi';
      $('#m-bank').hidden = method !== 'bank';
      $('#wde').textContent = '';
    }));
    $('#wdgo').addEventListener('click', () => {
      const a = Number($('#wa').value);
      const e = $('#wde');
      if (!Number.isFinite(a) || a < WD_MIN) { e.textContent = `Minimum withdrawal ${R}${WD_MIN} hai`; return; }
      if (a > Number(winnings)) { e.textContent = 'Winnings balance se zyada withdraw nahi ho sakta'; return; }
      if (method === 'upi') {
        if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test($('#upi').value.trim())) { e.textContent = 'Sahi UPI ID likho (name@bank)'; return; }
      } else {
        if ($('#bn').value.trim().length < 3) { e.textContent = 'Account holder name likho'; return; }
        if (!/^\d{9,18}$/.test($('#ba').value.trim())) { e.textContent = 'Account number 9-18 digits ka hona chahiye'; return; }
        if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test($('#bi').value.trim())) { e.textContent = 'Sahi IFSC likho'; return; }
      }
      s.close();
      toast('Withdrawal Phase 3 me judega (abhi sirf design)');
    });
  }

  async function renderWallet() {
    const rep = (n, cls) => Array.from({ length: n }, () => `<i class="sk ${cls}"></i>`).join('');
    $app.innerHTML = `<div class="screen"><div class="sk sk-top"></div><div class="sk sk-line"></div>
      <div class="sk-row sk-three">${rep(3, 'sk-box')}</div>${navHtml('wallet')}</div>`;
    M.nav();
    let wallet, txs;
    try {
      const r = await api.get('/wallet');
      wallet = r.wallet || {}; txs = r.transactions || [];
    } catch (ex) {
      if (path() !== '/wallet') return;
      if (ex.status === 401) { state.user = null; return go('/login'); }
      $app.innerHTML = `<div class="screen">${subHeader('WALLET', 0)}
        <div class="empty"><b>Wallet load nahi hua</b>${esc(ex.message)}<br><br><button class="btn" id="retry" type="button">Dobara try karo</button></div>
        ${navHtml('wallet')}</div>`;
      document.getElementById('retry').addEventListener('click', renderWallet);
      M.enter();
      return;
    }
    if (path() !== '/wallet') return;
    const total = Number(wallet.total_balance) || 0;
    const dep = Number(wallet.deposit_balance) || 0;
    const win = Number(wallet.winnings_balance) || 0;
    const bon = Number(wallet.bonus_balance) || 0;

    const txRow = (t) => {
      const cr = t.direction === 'credit';
      const meta = [t.note, BAL_LABEL[t.balance_type], fmtDate(t.created_at)].filter(Boolean).map(esc).join(' &middot; ');
      return `<div class="tx"><div class="tx-i ${cr ? 'cr' : 'dr'}">${cr ? '+' : '-'}</div>
        <div class="tx-m"><b>${esc(TX_LABEL[t.type] || t.type)}</b><small>${meta}</small></div>
        <div class="tx-a ${cr ? 'cr' : 'dr'}">${cr ? '+' : '-'}${money(t.amount)}</div></div>`;
    };
    const tile = (label, val, note, c) => `<div class="tile" style="--c:${c}"><small>${label}</small><b>${money(val)}</b><em>${note}</em></div>`;

    $app.innerHTML = `<div class="screen">
      ${subHeader('WALLET', total)}
      <div class="wtotal">
        <small>TOTAL BALANCE</small>
        <div class="amt-big">${money(total)}</div>
        <div class="wbtns">
          <button type="button" class="w-btn solid" id="w-dep">Deposit</button>
          <button type="button" class="w-btn line" id="w-wd">Withdraw</button>
        </div>
      </div>
      <div class="tiles">
        ${tile('Deposit', dep, 'Match join', '#1f9a8f')}
        ${tile('Winnings', win, 'Withdrawable', '#2fae7c')}
        ${tile('Bonus', bon, 'Sirf match join', '#6a5acd')}
      </div>
      <div class="sec-title">${ICON.clock}HISTORY<button type="button" class="link" id="viewall" hidden>View All</button></div>
      <div id="txbox"></div>
      ${navHtml('wallet')}
    </div>`;

    const box = document.getElementById('txbox');
    const va = document.getElementById('viewall');
    let all = false;
    const drawTx = () => {
      if (!txs.length) { box.innerHTML = `<div class="empty"><b>Abhi koi transaction nahi</b>Deposit ya match join karne ke baad yaha dikhega.</div>`; return; }
      box.innerHTML = `<div class="card tx-list">${(all ? txs : txs.slice(0, 5)).map(txRow).join('')}</div>`;
    };
    drawTx();
    if (txs.length > 5) {
      va.hidden = false;
      va.addEventListener('click', () => { all = !all; va.textContent = all ? 'Show Less' : 'View All'; drawTx(); });
    }
    document.getElementById('w-dep').addEventListener('click', addFundsSheet);
    document.getElementById('w-wd').addEventListener('click', () => withdrawSheet(win));
    M.enter();
  }

  /* ---------- placeholder pages ---------- */
  async function renderSoon(title, line, icon) {
    const balance = await getBalance();
    const active = { '/rank': 'rank', '/earn': 'earn', '/wallet': 'wallet' }[path()] || '';
    $app.innerHTML = `<div class="screen">
      ${subHeader(title.toUpperCase(), balance)}
      <div class="card soon">
        <div class="big">${ICON[icon]}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(line)}<br>Jald aa raha hai.</p>
      </div>
      ${navHtml(active)}
    </div>`;
    M.enter();
  }

  boot();
})();