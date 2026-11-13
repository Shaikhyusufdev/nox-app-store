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
    coin: svg('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>'),
    headset: svg('<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>'),
    clock: svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    play: svg('<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>'),
    check: svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    bolt: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
    shield: svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'),
    back: svg('<path d="m15 18-6-6 6-6"/>'),
    crown: svg('<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>'),
  };

  /* ---------- router ---------- */
    const PUBLIC = ['/login', '/register', '/forgot', '/reset'];
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
    '/rank': renderRank,
    '/earn': renderEarn,
    '/wallet': renderWallet,
    '/support': () => renderSoon('Support', 'Help aur support', 'headset'),
  };

  function render() {
    clearInterval(cdTimer);
    const p = path();
    if (!state.user && !PUBLIC.includes(p)) return go('/login');
    if (state.user && PUBLIC.includes(p) && p !== '/reset') return go('/');
    window.scrollTo(0, 0);
    if (p === '/login') return renderLogin();
    if (p === '/register') return renderRegister();
    if (p === '/forgot') return renderForgot();
    if (p === '/reset') return renderReset();
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
      ${item('#/', 'home', 'Home', 'home', 'home')}
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
                  <p class="alt" style="text-align:right;margin:-4px 0 8px"><a href="#/forgot">Password bhool gaye?</a></p>
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
    injectMatchCss();
    $app.innerHTML = skeletonHome();
    M.nav();
    const [w, g, c] = await Promise.allSettled([api.get('/wallet'), api.get('/games'), api.get('/categories')]);
    if (path() !== '/') return; // user dusre page pe chala gaya
    const balance = w.status === 'fulfilled' ? w.value.wallet.total_balance : 0;
    const games = g.status === 'fulfilled' ? g.value.games : [];
    const cats = c.status === 'fulfilled' ? c.value.categories : [];
    const game = games[0] || null; // sirf EK game (Free Fire) hai, uske matches seedha home pe
    let list = [];
    if (game) {
      try { list = (await api.get('/tournaments?game=' + game.id)).tournaments; } catch { list = []; }
      if (path() !== '/') return;
    }
    let recent = [];
    try { recent = (await api.get('/results/recent')).recent || []; } catch (e) { recent = []; }
    if (path() !== '/') return;
    const name = state.user.username || 'Player';

    const quick = [
      ['#/earn', 'Earn', 'coin', '#ffc83d'],
      ['#/rank', 'Top Players', 'trophy', '#38e1ff'],
      ['#/wallet', 'My Wallet', 'wallet', '#35d98a'],
      ['#/support', 'Support', 'headset', '#ff7a3d'],
    ].map(([href, label, icon, c2]) =>
      `<a href="${href}"><span class="ico" style="--c:${c2}">${ICON[icon]}</span>${label}</a>`).join('');

    const contests = [
      ['Upcoming', 'clock', '#38e1ff'],
      ['Ongoing', 'play', '#ff9a3d'],
      ['Completed', 'check', '#35d98a'],
    ].map(([label, icon, c2]) =>
      `<button class="contest" data-contest="${label.toLowerCase()}" style="--c:${c2}">${ICON[icon]}${label}</button>`).join('');

    $app.innerHTML = `<div class="screen">
      <header class="topbar">
        <div class="avatar" style="${avatarStyle(name)}">${esc(name.charAt(0).toUpperCase())}</div>
        <div class="hello"><small>Hi, <span class="uname">${esc(name)}</span></small><b>NOX ESPORTS</b></div>
        <a class="chip" href="#/wallet" data-count="${Number(balance) || 0}">${money(balance)}</a>
      </header>
      <div class="quick">${quick}</div>
      <div class="sec-title">My contests</div>
      <div class="contests">${contests}</div>
      <div id="mlist">${game ? '' : `<div class="empty"><b>Abhi koi game nahi hai</b>Admin panel se game add hone ke baad yaha matches dikhenge.</div>`}</div>
      ${navHtml('home')}
    </div>`;

    $app.querySelectorAll('[data-contest]').forEach((b) =>
      b.addEventListener('click', () => go('/contests/' + b.getAttribute('data-contest'))));

    if (game) {
      const box = $app.querySelector('#mlist');
      const drawList = () => {
        box.innerHTML = recentHtml(recent) + matchListHtml(cats, list);
        bindMatchList(box, drawList);
        startCd();
      };
      drawList();
    }
    M.enter();
  }

  /* ---------- Matches (Mode tabs, Category, Slots) ---------- */
  const MODES = [['all', 'All'], ['solo', 'Solo'], ['duo', 'Duo'], ['squad', 'Squad']];
  const MODE_NAME = { solo: 'Solo', duo: 'Duo', squad: 'Squad' };
  const ST_LABEL = { upcoming: 'Upcoming', registration_open: 'Open', full: 'Full', ongoing: 'Live', completed: 'Completed', cancelled: 'Cancelled' };
  const JOINABLE = ['upcoming', 'registration_open'];
  const gameFilter = { mode: 'all', cat: 'all' };
  let cdTimer;

  const MATCH_CSS = `
.mt-tabs{display:flex;gap:6px;margin:14px 0 8px}
.mt-tabs button{flex:1;padding:10px 0;border:1px solid var(--edge);background:var(--panel);color:var(--muted);font:600 14px var(--font-head);cursor:pointer;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);transition:all .18s}
.mt-tabs button.on{background:var(--grad);color:#1a0a00;border-color:transparent}
.mt-chips{display:flex;gap:6px;overflow-x:auto;padding:4px 0 10px;scrollbar-width:none}
.mt-chips::-webkit-scrollbar{display:none}
.mt-chips button{flex:none;padding:7px 16px;border:1px solid var(--edge);background:var(--panel);color:var(--muted);font:600 13px var(--font-body);cursor:pointer;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}
.mt-chips button.on{color:var(--ice);background:rgba(56,225,255,.12);border-color:var(--ice)}
.mt-card{display:block;width:100%;text-align:left;position:relative;overflow:hidden;padding:14px;margin-bottom:12px;cursor:pointer;color:var(--ink);font:inherit;border:1px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--edgegrad) border-box;clip-path:var(--cut);transition:scale .15s}
.mt-card:active{scale:.985}
.mt-card::after{content:"";position:absolute;top:0;bottom:0;left:-40%;width:30%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.12),transparent);transform:skewX(-20deg);transition:left .6s;pointer-events:none}
@media (hover:hover){.mt-card:hover::after{left:130%}}
.mt-card h3{margin:0 0 4px;font-size:17px;font-weight:700;padding-right:130px}
.mt-card .meta{font-size:12px;color:var(--muted);margin-bottom:12px}
.mt-card .row3{display:flex;gap:6px}
.mt-card .row3 div{flex:1;background:var(--panel2);border-bottom:2px solid var(--edge);padding:8px;text-align:center}
.mt-card .row3 div:nth-child(2){border-color:var(--gold)}
.mt-card .row3 div:nth-child(2) b{color:var(--gold)}
.mt-card .row3 small{display:block;font-size:11px;color:var(--muted)}
.mt-card .row3 b{font:700 15px var(--font-head)}
.mt-bar{height:6px;background:#222a3e;margin-top:12px;overflow:hidden;transform:skewX(-20deg)}
.mt-bar i{display:block;height:100%;background:var(--fire);box-shadow:0 0 8px rgba(255,91,31,.7)}
.mt-cd{position:absolute;top:12px;right:14px;z-index:1;padding:5px 10px;font:700 12px var(--font-head);letter-spacing:.04em;color:#031a20;background:var(--ice);clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%);animation:mtGlow 1.8s ease-in-out infinite}
.mt-cd.live{background:var(--live);color:#fff;font-size:13px;animation:mtGlowR 1.2s ease-in-out infinite}
.mt-cd.ok{background:#2a3148;color:var(--muted);animation:none}
@keyframes mtGlow{50%{filter:drop-shadow(0 0 8px rgba(56,225,255,.9))}}
@keyframes mtGlowR{50%{filter:drop-shadow(0 0 9px rgba(255,59,92,.95))}}
@media (prefers-reduced-motion:reduce){.mt-cd{animation:none}}
.mt-head{position:relative;padding:14px;margin:10px 0;border:1px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--edgegrad) border-box;clip-path:var(--cut)}
.mt-head h2{margin:0 0 4px;font-size:19px;font-weight:700;padding-right:130px}
.mt-head .meta{font-size:12.5px;color:var(--muted)}
.mt-head .meta b{color:var(--ink)}
.mt-teams{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
.mt-team{padding:10px;border:1.5px solid;clip-path:var(--cut-sm)}
.mt-team.red{border-color:#ff4d5e;background:rgba(255,77,94,.08)}
.mt-team.blue{border-color:#3b82f6;background:rgba(59,130,246,.08)}
.mt-team h4{margin:0 0 8px;text-align:center;font-size:13px;letter-spacing:.1em}
.mt-team.red h4{color:#ff6b7a}.mt-team.blue h4{color:#6ea8ff}
.mt-brgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:10px 0}
.mt-brteam{border:1px solid var(--edge);background:var(--panel);padding:8px;clip-path:var(--cut-sm)}
.mt-brteam h4{margin:0 0 6px;font-size:12px;color:var(--muted);letter-spacing:.08em}
.mt-slot{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;margin-bottom:6px;font:inherit;font-size:13px;text-align:left;border:1px dashed #3a4262;background:var(--panel2);color:var(--ink)}
.mt-slot:last-child{margin-bottom:0}
.mt-slot i{font-style:normal;font:700 11px var(--font-head);min-width:22px;height:22px;background:#222a3e;display:grid;place-items:center;clip-path:var(--hex)}
.mt-slot b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt-slot.open{cursor:pointer}
.mt-slot.open b{color:var(--ice)}
.mt-slot.open:disabled{cursor:default;opacity:.5}
.mt-slot.taken{border-style:solid;border-color:var(--edge);background:var(--panel)}
.mt-slot.me{border-color:var(--ice);background:rgba(56,225,255,.1)}
.mt-slot em{font-style:normal;font:700 10px var(--font-head);color:#031a20;background:var(--ice);padding:2px 6px}
.mt-note{font-size:13px;color:var(--muted);text-align:center;margin:8px 0}
.mt-room{position:relative;margin:10px 0;padding:6px 14px;border:1px solid var(--fire);border-left-width:3px;background:linear-gradient(135deg,rgba(255,91,31,.12),var(--panel2));clip-path:var(--cut-sm)}
.mt-copy{position:relative;display:block;width:100%;padding:12px 0;background:none;border:0;color:var(--ink);font:inherit;cursor:pointer;text-align:left}
.mt-copy span{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700}
.mt-copy b{display:block;margin-top:2px;font:700 24px var(--font-head);letter-spacing:.1em;color:var(--gold);word-break:break-all;text-shadow:0 0 14px rgba(255,200,61,.35)}
.mt-copy+.mt-copy b{color:var(--ice);text-shadow:0 0 14px rgba(56,225,255,.35)}
.mt-copy em{position:absolute;right:0;top:50%;translate:0 -50%;font-style:normal;font:700 10px var(--font-head);letter-spacing:.06em;background:#222a3e;color:var(--ink);padding:5px 9px;clip-path:polygon(5px 0,100% 0,calc(100% - 5px) 100%,0 100%);white-space:nowrap}
.mt-copy.done em{background:var(--ok);color:#03210f}
.mt-copy+.mt-copy{border-top:1px solid rgba(255,255,255,.1)}
.mt-conf{font-size:14px;line-height:1.7;margin-bottom:10px}
.mt-conf small{color:var(--muted)}
@keyframes rsRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes rsShine{from{left:-40%}to{left:140%}}
@keyframes rsPulse{50%{opacity:.9}}
@keyframes rsFloat{0%{transform:translateY(0) rotate(45deg) scale(.6);opacity:0}20%{opacity:1}100%{transform:translateY(-130px) rotate(45deg) scale(1);opacity:0}}
.rs-win{--c1:#38e1ff;--c2:#2a3148;position:relative;overflow:hidden;padding:14px;margin-bottom:12px;border:1px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box,linear-gradient(135deg,var(--c1),var(--c2)) border-box;clip-path:var(--cut);animation:rsRise .55s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i)*140ms + 80ms)}
.rs-win::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 20% 0,var(--c1),transparent 60%);opacity:.16;pointer-events:none;animation:rsPulse 2.4s ease-in-out infinite}
.rs-win::after{content:"";position:absolute;top:0;bottom:0;left:-40%;width:28%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.18),transparent);transform:skewX(-20deg);pointer-events:none;animation:rsShine 3.2s ease-in-out infinite}
.rs-win.r1{--c1:#ffd36a;--c2:#ff8a1f}.rs-win.r1::before{opacity:.3}
.rs-win.r2{--c1:#e6ebf5;--c2:#8d98ad}
.rs-win.r3{--c1:#f0b88a;--c2:#cd7f32}
.rs-top{position:relative;display:flex;align-items:center;gap:12px;margin-bottom:8px}
.rs-medal{flex:none;width:46px;height:46px;clip-path:var(--hex);display:grid;place-items:center;font:700 18px var(--font-head);background:linear-gradient(135deg,var(--c1),var(--c2));color:#1a1204}
.rs-medal svg{width:24px;height:24px;stroke:#3a2400;stroke-width:2}
.rs-rank{font:700 18px var(--font-head)}
.rs-team{font-size:12px;letter-spacing:.08em;color:var(--muted);font-weight:700}
.rs-amt{margin-left:auto;font:700 20px var(--font-head);color:var(--gold);text-shadow:0 0 14px rgba(255,200,61,.45)}
.rs-p{position:relative;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid rgba(255,255,255,.08);font-size:14px}
.rs-p b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs-p span{color:var(--gold);font:700 13px var(--font-head)}
.rs-p em{font-style:normal;font:700 10px var(--font-head);color:#031a20;background:var(--ice);padding:2px 6px;margin-left:6px}
.rs-p.me b{color:var(--ice)}
.rs-win .sp{position:absolute;bottom:0;width:5px;height:5px;background:var(--gold);opacity:0;pointer-events:none;animation:rsFloat 2.6s ease-in infinite}
.rs-lose{border:1px solid var(--edge);background:var(--panel2);padding:10px 12px;margin-bottom:8px;clip-path:var(--cut-sm)}
.rs-chips{display:flex;flex-wrap:wrap;gap:6px}
.rs-chip{padding:5px 12px;border:1px solid var(--edge);background:var(--panel2);color:var(--muted);font-size:13px;clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)}
.rs-chip.me{color:var(--ice);border-color:var(--ice)}
`;
  function injectMatchCss() {
    if (document.getElementById('match-css')) return;
    const st = document.createElement('style');
    st.id = 'match-css';
    st.textContent = MATCH_CSS;
    document.head.appendChild(st);
  }

  // match ka start time: "Today, 9:30 PM" / "Tomorrow, ..." / "14 Nov, 1:40 AM"
  function startLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const tm = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
    const key = (x) => x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate();
    const now = new Date(), tom = new Date(now.getTime() + 86400000);
    if (key(d) === key(now)) return 'Today, ' + tm;
    if (key(d) === key(tom)) return 'Tomorrow, ' + tm;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + tm;
  }
  function cdText(iso, status) {
    if (status === 'completed') return 'ENDED';
    if (status === 'cancelled') return 'CANCELLED';
    if (status === 'ongoing') return 'LIVE';
    return startLabel(iso);
  }
  function tickCd() {
    $app.querySelectorAll('[data-cd]').forEach((el) => {
      const st = el.getAttribute('data-st');
      el.textContent = cdText(el.getAttribute('data-cd'), st);
      el.classList.toggle('live', st === 'ongoing');
      el.classList.toggle('ok', st === 'completed' || st === 'cancelled');
    });
  }
  function startCd() { clearInterval(cdTimer); tickCd(); }
  const cdHtml = (t) => `<span class="mt-cd" data-cd="${esc(t.starts_at)}" data-st="${esc(t.status)}">...</span>`;

  function matchCard(t, catName) {
    const full = t.max_players > 0 ? Math.min(100, Math.round((t.joined_count / t.max_players) * 100)) : 0;
    return `<button type="button" class="mt-card" data-match="${esc(t.id)}">
      ${cdHtml(t)}
      <h3>${esc(t.title)}</h3>
      <div class="meta">${esc(catName)} &middot; ${esc(MODE_NAME[t.mode] || '')} &middot; ${esc(ST_LABEL[t.status] || t.status)}</div>
      <div class="row3">
        <div><small>Entry</small><b>${Number(t.entry_fee) > 0 ? money(t.entry_fee) : 'FREE'}</b></div>
        <div><small>Prize pool</small><b>${money(t.prize_pool)}</b></div>
        <div><small>Joined</small><b>${t.joined_count}/${t.max_players}</b></div>
      </div>
      <div class="mt-bar"><i style="width:${full}%"></i></div>
    </button>`;
  }

  // Haal hi me khatam hue matches (sirf joined user ko, kuch der ke liye) - purane sirf My Contests > Completed me
  function recentHtml(arr) {
    if (!arr || !arr.length) return '';
    return '<div class="sec-title">Just ended</div>' + arr.map((r) => `<button type="button" class="mt-card" data-match="${esc(r.id)}">${cdHtml({ starts_at: r.starts_at, status: 'completed' })}
      <h3>${esc(r.title)}</h3>
      <div class="meta">${esc(r.category_name || 'Match')} &middot; ${esc(MODE_NAME[r.mode] || '')}</div>
      <div class="meta" style="margin-bottom:0">${Number(r.my_prize) > 0 ? 'Aapne jeeta: <b style="color:var(--gold)">' + money(r.my_prize) + '</b>' : 'Result dekho'}</div></button>`).join('');
  }

  // Tabs (All/Solo/Duo/Squad) + category chips + match cards (Home aur game page dono me same)
  function matchListHtml(cats, list) {
    const shown = list.filter((t) => t.status !== 'completed' && (gameFilter.mode === 'all' || t.mode === gameFilter.mode) && (gameFilter.cat === 'all' || t.category_id === gameFilter.cat));
    const tabs = MODES.map(([k, l]) => `<button type="button" data-mode="${k}" class="${gameFilter.mode === k ? 'on' : ''}">${l}</button>`).join('');
    const chips = `<button type="button" data-cat="all" class="${gameFilter.cat === 'all' ? 'on' : ''}">All</button>` +
      cats.map((c) => `<button type="button" data-cat="${esc(c.id)}" class="${gameFilter.cat === c.id ? 'on' : ''}">${esc(c.name)}</button>`).join('');
    const body = shown.length
      ? shown.map((t) => matchCard(t, t.category_name || 'Match')).join('')
      : `<div class="empty"><b>Abhi koi match nahi</b>Is mode/category me jald naye matches aayenge.</div>`;
    return `<div class="mt-tabs">${tabs}</div><div class="mt-chips">${chips}</div>${body}`;
  }
  function bindMatchList(root, redraw) {
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { gameFilter.mode = b.getAttribute('data-mode'); redraw(); }));
    root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { gameFilter.cat = b.getAttribute('data-cat'); redraw(); }));
    root.querySelectorAll('[data-match]').forEach((b) => b.addEventListener('click', () => go('/match/' + b.getAttribute('data-match'))));
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
      $app.innerHTML = `<div class="screen">
        ${subHeader(game.name.toUpperCase(), balance)}
        ${matchListHtml(cats, list)}
        ${navHtml('home')}
      </div>`;
      bindMatchList($app, draw);
      startCd();
      M.enter();
    }
    draw();
  }

  function slotBtn(team, slot, label, p, canJoin) {
    if (p) return `<div class="mt-slot taken${p.is_me ? ' me' : ''}"><i>${esc(label)}</i><b>${esc(p.username)}</b>${p.is_me ? '<em>YOU</em>' : ''}</div>`;
    return `<button type="button" class="mt-slot open" data-team="${team}" data-slot="${slot}" data-label="${esc(label)}"${canJoin ? '' : ' disabled'}><i>${esc(label)}</i><b>${canJoin ? 'Join' : 'Empty'}</b></button>`;
  }

  // tap to copy (https par clipboard API, warna purana tareeka)
  function copyText(txt) {
    const legacy = () => {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).catch(legacy);
    legacy();
    return Promise.resolve();
  }
  // Room ID / Password: sirf joined user ko (server hi bhejta hai), popup aur match page dono me yahi design
  const roomHtml = (room) => `<div class="mt-room">
      <button type="button" class="mt-copy" data-copy="${esc(room.room_id)}"><span>Room ID</span><b>${esc(room.room_id)}</b><em>TAP TO COPY</em></button>
      <button type="button" class="mt-copy" data-copy="${esc(room.room_password)}"><span>Password</span><b>${esc(room.room_password)}</b><em>TAP TO COPY</em></button>
    </div>`;
  function bindCopy(root) {
    root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
      copyText(b.getAttribute('data-copy')).then(() => {
        toast('Copied!');
        const em = b.querySelector('em'), old = em ? em.textContent : '';
        b.classList.add('done');
        if (em) em.textContent = 'COPIED';
        setTimeout(() => { b.classList.remove('done'); if (em) em.textContent = old; }, 1400);
      });
    }));
  }
  function roomSheet(room) {
    const s = openSheet('Room details', `
      <div class="mt-conf">Match shuru hone par is Room ID aur Password se game me join karo.</div>
      ${roomHtml(room)}`);
    bindCopy(s.el);
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

    if (t.status === 'completed') {
      let rs = null;
      try { rs = await api.get('/results/' + id); } catch (e) { rs = null; }
      if (path() !== '/match/' + id) return;
      if (rs) return drawResults(t, rs, balance);
    }

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
    const room = t.room ? roomHtml(t.room) : '';

    const dist = Array.isArray(t.prize_distribution) ? t.prize_distribution : [];
    const ordn = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
    const prizeHtml = (t.layout === 'br' && dist.length)
      ? `<div class="card" style="padding:14px;margin:10px 0"><b>Prizes</b>${dist.map((d) => `<div style="display:flex;justify-content:space-between;padding:6px 0"><span>${ordn(d.rank)}${size > 1 ? ' team' : ''}</span><b style="color:var(--gold)">${money(d.amount)}${size > 1 ? ' (' + money(Math.round(d.amount / size * 100) / 100) + ' each)' : ''}</b></div>`).join('')}${size > 1 ? '<small style="color:var(--muted)">Team ka prize players me barabar bantega.</small>' : ''}</div>`
      : '';

    $app.innerHTML = `<div class="screen">
      ${subHeader('MATCH', balance, '#/')}
      <div class="mt-head">
        ${cdHtml(t)}
        <h2>${esc(t.title)}</h2>
        <div class="meta">${esc(t.category_name || 'Match')} &middot; ${esc(MODE_NAME[t.mode] || '')} &middot; ${esc(ST_LABEL[t.status] || t.status)}</div>
        <div class="meta" style="margin-top:6px">Entry <b>${Number(t.entry_fee) > 0 ? money(t.entry_fee) : 'FREE'}</b> &middot; Prize <b>${money(t.prize_pool)}</b> &middot; Joined <b>${t.joined_count}/${t.max_players}</b></div>
      </div>
      ${room}
      ${prizeHtml}
      <div class="mt-note">${esc(note)}</div>
      ${board}
      ${t.rules ? `<div class="card" style="padding:14px;margin-top:10px"><b>Rules</b><p style="margin:6px 0 0;white-space:pre-wrap;color:var(--muted)">${esc(t.rules)}</p></div>` : ''}
      ${navHtml('home')}
    </div>`;
    $app.querySelectorAll('button.mt-slot.open:not(:disabled)').forEach((b) => b.addEventListener('click', () =>
      joinSlotSheet(t, Number(b.getAttribute('data-team')), Number(b.getAttribute('data-slot')), b.getAttribute('data-label'))));
    bindCopy($app);
    startCd();
    M.enter();
    if (t.room) roomSheet(t.room); // joined user + admin ne room publish kiya -> popup
  }

  // Completed match: jeetne wale rank ke hisaab se (effect ke saath), neeche baaki players
  function drawResults(t, rs, balance) {
    const isBr = rs.layout === 'br';
    const size = rs.team_size || 1;
    const teams = rs.teams || [];
    const placed = teams.filter((x) => x.placement).sort((a, b) => a.placement - b.placement);
    const rest = teams.filter((x) => !x.placement);
    const ordn = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
    const tname = (x) => (isBr ? (size === 1 ? '' : 'TEAM ' + x.team_no) : (x.team_no === 1 ? 'RED TEAM' : 'BLUE TEAM'));
    const plist = (x) => x.players.map((p) => `<div class="rs-p${p.is_me ? ' me' : ''}"><b>${esc(p.username)}${p.is_me ? '<em>YOU</em>' : ''}</b>${Number(p.prize_won) > 0 ? '<span>' + money(p.prize_won) + '</span>' : ''}</div>`).join('');
    const sparks = Array.from({ length: 7 }, (_, i) => `<i class="sp" style="left:${8 + i * 13}%;animation-delay:${(i * 0.45).toFixed(2)}s"></i>`).join('');
    const winCard = (x, i) => {
      const r = Math.min(x.placement, 4);
      const label = isBr ? ordn(x.placement) + ' place' : 'Winner';
      return `<div class="rs-win r${r}" style="--i:${i}">${r === 1 ? sparks : ''}
        <div class="rs-top"><div class="rs-medal">${r === 1 ? ICON.crown : esc(x.placement)}</div>
          <div><div class="rs-rank">${label}</div>${tname(x) ? '<div class="rs-team">' + tname(x) + '</div>' : ''}</div>
          ${Number(x.prize_total) > 0 ? '<div class="rs-amt">' + money(x.prize_total) + '</div>' : ''}</div>
        ${plist(x)}</div>`;
    };
    const restHtml = (isBr && size === 1)
      ? `<div class="rs-chips">${rest.map((x) => x.players.map((p) => `<span class="rs-chip${p.is_me ? ' me' : ''}">${esc(p.username)}</span>`).join('')).join('')}</div>`
      : rest.map((x) => `<div class="rs-lose"><div class="rs-team">${tname(x)}</div>${plist(x)}</div>`).join('');
    $app.innerHTML = `<div class="screen">
      ${subHeader('MATCH', balance, '#/')}
      <div class="mt-head">
        ${cdHtml(t)}
        <h2>${esc(t.title)}</h2>
        <div class="meta">${esc(t.category_name || 'Match')} &middot; ${esc(MODE_NAME[t.mode] || '')} &middot; Completed</div>
        <div class="meta" style="margin-top:6px">Entry <b>${Number(t.entry_fee) > 0 ? money(t.entry_fee) : 'FREE'}</b> &middot; Prize pool <b>${money(t.prize_pool)}</b></div>
      </div>
      <div class="sec-title">Results</div>
      ${placed.length ? placed.map(winCard).join('') : '<div class="empty"><b>Result jald aayega</b></div>'}
      ${rest.length ? '<div class="sec-title" style="margin-top:18px">' + (isBr ? 'Other players' : 'Other team') + '</div>' + restHtml : ''}
      ${navHtml('home')}
    </div>`;
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
    let needFunds = false;
    btn.addEventListener('click', async () => {
      if (needFunds) { s.close(); go('/wallet'); return; }
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
        if (ex.status === 402) { needFunds = true; err.textContent = 'Balance kam hai. Pehle wallet me paise add karo.'; btn.textContent = 'Add Balance'; }
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
          <div class="meta">${esc(catName(r.tournaments.category_id))} &middot; ${esc(MODE_NAME[r.tournaments.mode] || '')}</div>
          <div class="meta" style="margin-bottom:0">Aapka slot: Team ${esc(r.team_no == null ? '-' : r.team_no)}, Slot ${esc(r.slot_no == null ? '-' : r.slot_no)}</div></button>`).join('')
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

  /* ---------- Rank (sabse zyada matches join karne wale top par) ---------- */
  async function renderRank() {
    const rep = (n, cls) => Array.from({ length: n }, () => `<i class="sk ${cls}"></i>`).join('');
    $app.innerHTML = `<div class="screen"><div class="sk sk-top"></div><div class="sk-row sk-three">${rep(3, 'sk-box')}</div>${navHtml('rank')}</div>`;
    M.nav();
    const [bal, rk] = await Promise.allSettled([getBalance(), api.get('/earn/rank')]);
    if (path() !== '/rank') return;
    const balance = bal.status === 'fulfilled' ? bal.value : 0;
    if (rk.status !== 'fulfilled') {
      $app.innerHTML = `<div class="screen">${subHeader('RANK', balance)}
        <div class="empty"><b>Rank load nahi hua</b>${esc(rk.reason && rk.reason.message)}<br><br><button class="btn" id="retry" type="button">Dobara try karo</button></div>
        ${navHtml('rank')}</div>`;
      document.getElementById('retry').addEventListener('click', renderRank);
      M.enter();
      return;
    }
    const leaders = rk.value.leaders || [];
    const me = rk.value.me;
    const row = (l) => `<div class="rk-row${l.is_me ? ' me' : ''}">
      <div class="rk-n${l.rank <= 3 ? ' m' + l.rank : ''}">${esc(l.rank)}</div>
      <div class="avatar rk-av" style="${avatarStyle(l.username)}">${esc(String(l.username || '?').charAt(0).toUpperCase())}</div>
      <div class="rk-u"><b>${esc(l.username)}${l.is_me ? '<em>YOU</em>' : ''}</b></div>
      <div class="rk-c"><b>${esc(l.matches)}</b><small>matches</small></div>
    </div>`;
    const meCard = me
      ? `<div class="rk-me"><small>Aapka rank</small><div class="rk-big">#${esc(me.rank)}</div><small>${esc(me.matches)} matches join kiye</small></div>`
      : `<div class="rk-me"><small>Aapka rank</small><div class="rk-big">-</div><small>Match join karo aur leaderboard me aao</small></div>`;
    $app.innerHTML = `<div class="screen">
      ${subHeader('RANK', balance)}
      ${meCard}
      ${leaders.length ? `<div class="rk-list">${leaders.map(row).join('')}</div>` : `<div class="empty"><b>Abhi koi rank nahi</b>Match join hote hi players yaha dikhenge.</div>`}
      ${navHtml('rank')}
    </div>`;
    M.enter();
  }

  /* ---------- Wallet (Step 2) ---------- */
    /* ---------- Forgot / Reset password ---------- */
  function renderForgot() {
    $app.innerHTML = authLayout(`
      <h1>Password reset</h1>
      <form id="f" novalidate>
        <div class="field"><label for="email">Registered email</label>
          <input id="email" type="email" autocomplete="email" inputmode="email" required>
          <small>Is email par reset link bheja jayega (30 minute valid)</small></div>
        <div class="err" id="err"></div>
        <button class="btn" id="go" type="submit">Send reset link</button>
      </form>
      <p class="alt"><a href="#/login">Login par wapas jao</a></p>`);
    const form = document.getElementById('f'), btn = document.getElementById('go'), err = document.getElementById('err');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const email = document.getElementById('email').value.trim();
      if (!email) { err.textContent = 'Email likho'; return; }
      btn.disabled = true; btn.textContent = 'Please wait...';
      try {
        await api.post('/auth/forgot-password', { email });
        form.innerHTML = '<div class="empty"><b>Request mil gayi</b>Agar ye email registered hai to reset link bhej diya gaya hai. Spam folder bhi dekh lo.</div>';
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = 'Send reset link';
      }
    });
    M.enter();
  }

  function renderReset() {
    const token = new URLSearchParams((location.hash.split('?')[1]) || '').get('token') || '';
    if (token.length < 32) {
      $app.innerHTML = authLayout(`<h1>Link galat hai</h1>
        <div class="empty"><b>Reset link invalid hai</b>Dobara reset link mangwao.</div>
        <p class="alt"><a href="#/forgot">Naya link mangwao</a></p>`);
      M.enter();
      return;
    }
    $app.innerHTML = authLayout(`
      <h1>Naya password</h1>
      <form id="f" novalidate>
        <div class="field"><label for="pw">New password</label>
          <input id="pw" type="password" autocomplete="new-password" minlength="8" required>
          <small>Kam se kam 8 characters</small></div>
        <div class="field"><label for="pw2">Confirm password</label>
          <input id="pw2" type="password" autocomplete="new-password" required></div>
        <div class="err" id="err"></div>
        <button class="btn" id="go" type="submit">Update password</button>
      </form>`);
    const form = document.getElementById('f'), btn = document.getElementById('go'), err = document.getElementById('err');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const pw = document.getElementById('pw').value, pw2 = document.getElementById('pw2').value;
      if (pw.length < 8) { err.textContent = 'Password kam se kam 8 characters ka ho'; return; }
      if (pw !== pw2) { err.textContent = 'Dono password same nahi hain'; return; }
      btn.disabled = true; btn.textContent = 'Please wait...';
      try {
        await api.post('/auth/reset-password', { token, password: pw });
        state.user = null;
        toast('Password update ho gaya. Ab login karo');
        go('/login');
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = 'Update password';
      }
    });
    M.enter();
  }
  const R = '\u20B9';
  const TX_LABEL = { deposit: 'Deposit', entry_fee: 'Entry fee', prize: 'Prize', withdrawal: 'Withdrawal', withdrawal_refund: 'Withdrawal refund', referral_bonus: 'Referral bonus', admin_adjust: 'Admin adjustment', refund: 'Refund', gift_code: 'Gift code', promo: 'Promo' };
  const BAL_LABEL = { deposit: 'Deposit', winnings: 'Winnings', bonus: 'Bonus' };
  const WD_MIN = 50, WD_FEE_PCT = 5, AF_MIN = 10, AF_MAX = 10000; // reference design; baad me admin settings se aayega
  const fmtDate = (s) => { try { return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

  // neeche se aane wala popup (Add Funds / Withdraw / Slot / Room)
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
    const s = openSheet('Add funds', `
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
      <button class="btn" type="button" id="wdgo">Request withdrawal</button>
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
        ${tile('Deposit', dep, 'Match join', '#38e1ff')}
        ${tile('Winnings', win, 'Withdrawable', '#35d98a')}
        ${tile('Bonus', bon, 'Sirf match join', '#ff9a3d')}
      </div>
      <div class="sec-title">History<button type="button" class="link" id="viewall" hidden>View all</button></div>
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
      va.addEventListener('click', () => { all = !all; va.textContent = all ? 'Show less' : 'View all'; drawTx(); });
    }
    document.getElementById('w-dep').addEventListener('click', addFundsSheet);
    document.getElementById('w-wd').addEventListener('click', () => withdrawSheet(win));
    M.enter();
  }

  /* ---------- Earn (Refer) ---------- */
  const EARN_CSS = `
.rf-card{padding:18px;margin:12px 0;text-align:center;border:1px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--edgegrad) border-box;clip-path:var(--cut)}
.rf-card .rf-tag{display:block;letter-spacing:.14em;color:var(--muted);font-weight:700;font-size:12px}
.rf-amt{font-size:52px;font-weight:700;line-height:1.1;margin:4px 0 6px;color:var(--gold);text-shadow:0 0 20px rgba(255,200,61,.45)}
.rf-card p{font-size:13px;color:var(--muted);margin:0 0 14px;line-height:1.5}
.rf-link{display:flex;align-items:center;gap:8px;background:var(--panel2);border:1px dashed var(--edge);padding:6px 6px 6px 12px}
.rf-link span{flex:1;min-width:0;font-size:12.5px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rf-btn{display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:44px;border:0;padding:0 16px;font:700 14px var(--font-head);letter-spacing:.06em;line-height:1;cursor:pointer;color:#1a0a00;background:var(--grad);text-decoration:none;white-space:nowrap;clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)}
.rf-link .rf-btn{height:38px;font-size:13px}
.rf-row{display:flex;align-items:stretch;gap:8px;margin-top:10px}
.rf-row .rf-btn{flex:1}
.rf-row .rf-btn.alt{background:#1d2335;color:var(--ink)}
.rf-stats{display:flex;gap:6px;margin-top:12px}
.rf-stats div{flex:1;background:var(--panel2);border-bottom:2px solid var(--edge);padding:8px 4px}
.rf-stats div:last-child{border-color:var(--gold)}
.rf-stats b{display:block;font:700 16px var(--font-head)}
.rf-stats small{font-size:11px;color:var(--muted)}
.rf-code{margin-top:10px;font-size:12px;color:var(--muted)}
.rf-code b{color:var(--ink)}
`;
  function injectEarnCss() {
    if (document.getElementById('earn-css')) return;
    const st = document.createElement('style');
    st.id = 'earn-css';
    st.textContent = EARN_CSS;
    document.head.appendChild(st);
  }

  async function renderEarn() {
    injectEarnCss();
    const rep = (n, cls) => Array.from({ length: n }, () => `<i class="sk ${cls}"></i>`).join('');
    $app.innerHTML = `<div class="screen"><div class="sk sk-top"></div><div class="sk-row sk-three">${rep(3, 'sk-box')}</div>${navHtml('earn')}</div>`;
    M.nav();
    const [bal, ed] = await Promise.allSettled([getBalance(), api.get('/earn')]);
    if (path() !== '/earn') return;
    const balance = bal.status === 'fulfilled' ? bal.value : 0;
    if (ed.status !== 'fulfilled') {
      $app.innerHTML = `<div class="screen">${subHeader('EARN', balance)}
        <div class="empty"><b>Earn load nahi hua</b>${esc(ed.reason && ed.reason.message)}<br><br><button class="btn" id="retry" type="button">Dobara try karo</button></div>
        ${navHtml('earn')}</div>`;
      document.getElementById('retry').addEventListener('click', renderEarn);
      M.enter();
      return;
    }
    const e = ed.value;
    const link = location.origin + '/?ref=' + encodeURIComponent(e.referral_code);
    const shareText = 'NOX Esports pe khelo aur jeeto! Mere link se join karo: ' + link;

    $app.innerHTML = `<div class="screen">
      ${subHeader('EARN', balance)}
      <div class="rf-card">
        <span class="rf-tag">REFER &amp; EARN</span>
        <div class="rf-amt">${money(e.referrer_bonus)}</div>
        <p>Har friend ke liye, jab wo deposit karke paid match join kare.<br>Aapke friend ko signup par ${money(e.friend_bonus)} bonus.</p>
        <div class="rf-link"><span id="rf-url">${esc(link)}</span><button type="button" class="rf-btn" id="rf-copy">Copy</button></div>
        <div class="rf-row">
          <button type="button" class="rf-btn alt" id="rf-share">Share</button>
          <a class="rf-btn" id="rf-wa" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </div>
        <div class="rf-stats">
          <div><b>${esc(e.referral.total)}</b><small>Friends joined</small></div>
          <div><b>${esc(e.referral.rewarded)}</b><small>Rewarded</small></div>
          <div><b>${money(e.referral.earned)}</b><small>Earned</small></div>
        </div>
        <div class="rf-code">My code: <b>${esc(e.referral_code)}</b></div>
      </div>
      ${navHtml('earn')}
    </div>`;

    $app.querySelector('#rf-copy').addEventListener('click', () => copyText(link).then(() => toast('Link copy ho gaya')));
    $app.querySelector('#rf-share').addEventListener('click', () => {
      if (navigator.share) navigator.share({ title: 'NOX Esports', text: 'NOX Esports pe khelo aur jeeto!', url: link }).catch(() => {});
      else copyText(shareText).then(() => toast('Link copy ho gaya'));
    });
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
