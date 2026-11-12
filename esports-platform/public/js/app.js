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
    window.addEventListener('hashchange', render);
    render();
  }

  const PAGES = {
    '/': renderHome,
    '/profile': renderProfile,
    '/rank': () => renderSoon('Rank', 'Leaderboard (Hall of Fame)', 'trophy'),
    '/earn': () => renderSoon('Earn', 'Spin to Win aur Refer & Earn', 'gift'),
    '/wallet': renderWallet,
    '/support': () => renderSoon('Support', 'Help aur support', 'headset'),
    '/contests': () => renderSoon('My Contests', 'Aapke joined matches yaha dikhenge', 'trophy'),
  };

  function render() {
    const p = path();
    if (!state.user && !PUBLIC.includes(p)) return go('/login');
    if (state.user && PUBLIC.includes(p)) return go('/');
    window.scrollTo(0, 0);
    if (p === '/login') return renderLogin();
    if (p === '/register') return renderRegister();
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
  const subHeader = (title, balance) => `
    <header class="topbar">
      <a class="back" href="#/" aria-label="Back">${ICON.back}</a>
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
      b.addEventListener('click', () => toast('Joined matches yaha dikhenge (jald aa raha hai)')));
    $app.querySelectorAll('[data-game]').forEach((b) =>
      b.addEventListener('click', () => toast('Tournament list agle step me aayegi')));
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

  function addFundsSheet() {
    const s = openSheet('Add Funds', `
      <div class="field"><label for="af">Amount (${R})</label>
        <input id="af" type="number" inputmode="numeric" min="${AF_MIN}" max="${AF_MAX}" placeholder="Amount likho"></div>
      <div class="amts">${[50, 100, 200, 500].map((a) => `<button type="button" class="amt" data-a="${a}">${R}${a}</button>`).join('')}</div>
      <div class="err" id="afe"></div>
      <button class="btn" type="button" id="afgo">Proceed to Pay</button>
      <p class="note">Min ${R}${AF_MIN}, max ${R}${AF_MAX}. Deposit balance se match join hota hai; withdraw sirf Winnings se hota hai.</p>`);
    const inp = s.el.querySelector('#af'), err = s.el.querySelector('#afe');
    s.el.querySelectorAll('.amt').forEach((b) => b.addEventListener('click', () => { inp.value = b.dataset.a; err.textContent = ''; }));
    s.el.querySelector('#afgo').addEventListener('click', () => {
      const a = Number(inp.value);
      if (!Number.isFinite(a) || a < AF_MIN || a > AF_MAX) { err.textContent = `Amount ${R}${AF_MIN} se ${R}${AF_MAX} ke beech do`; return; }
      s.close();
      toast('Payment gateway Phase 3 me judega (abhi sirf design)');
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
