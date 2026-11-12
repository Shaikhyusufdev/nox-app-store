// NOX Esports motion system. app.js ke PEHLE load hota hai. Agar ye file na chale to app waise hi chalta hai.
(function () {
  'use strict';
  const mq = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);
  const reduce = mq('(prefers-reduced-motion: reduce)');
  const finePointer = mq('(hover: hover) and (pointer: fine)');

  // in elements ko scroll-reveal milta hai (topbar aur nav ko nahi)
  const REVEAL = [
    '.auth > *',
    '.screen > :not(.topbar):not(.nav):not(.quick):not(.contests):not(.games)',
    '.quick > *', '.contests > *', '.games > *',
  ].join(',');

  let io = null;
  let navIdx = null;   // pichle page ka nav tab index
  let lastBal = 0;     // pichla balance (count-up yahin se shuru hota hai)

  /* ---------- scroll reveal + stagger ---------- */
  function reveal() {
    if (io) { io.disconnect(); io = null; }
    if (reduce || !('IntersectionObserver' in window)) return;
    const items = document.querySelectorAll(REVEAL);
    if (!items.length) return;
    io = new IntersectionObserver((entries) => {
      let i = 0;
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        io.unobserve(el);
        el.style.transitionDelay = (i++ * 55) + 'ms';
        el.classList.add('in');
        // animation ke baad classes hata do taaki hover/press transitions disturb na hon
        setTimeout(() => { el.classList.remove('rv', 'in'); el.style.transitionDelay = ''; }, 1000);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    items.forEach((el) => { el.classList.add('rv'); io.observe(el); });
  }

  /* ---------- balance count-up ---------- */
  const fmt = (v, dec) => '\u20B9' + v.toLocaleString('en-IN', { maximumFractionDigits: dec });
  function count() {
    document.querySelectorAll('[data-count]').forEach((el) => {
      const to = Number(el.dataset.count) || 0;
      const from = lastBal;
      lastBal = to;
      if (reduce || from === to) return;
      const dec = Number.isInteger(to) && Number.isInteger(from) ? 0 : 2;
      const t0 = performance.now(), dur = 700;
      el.textContent = fmt(from, dec);
      (function tick(now) {
        if (!el.isConnected) return;
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = p < 1 ? fmt(from + (to - from) * e, dec) : fmt(to, 2);
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  /* ---------- bottom nav sliding indicator ---------- */
  // tab order: Rank(0) Earn(1) Home(2, bada button) Wallet(3) Profile(4)
  const posOf = (i) => (i < 0 || i === 2 ? null : (i * 20 + 10) + '%');
  function nav() {
    const n = document.querySelector('.nav');
    if (!n) return;
    const idx = Array.prototype.findIndex.call(n.querySelectorAll('a'), (a) => a.classList.contains('on'));
    const ind = document.createElement('i');
    ind.className = 'nav-ind';
    n.appendChild(ind);
    const start = navIdx === null ? null : posOf(navIdx);
    const target = posOf(idx);
    navIdx = idx;
    if (reduce) { if (target) ind.style.left = target; else ind.style.opacity = '0'; return; }
    ind.style.transition = 'none';
    ind.style.left = start || target || '50%';
    ind.style.opacity = start ? '1' : '0';
    void ind.offsetWidth; // reflow: ab transition chalega
    ind.style.transition = '';
    if (target) ind.style.left = target;
    ind.style.opacity = target ? '1' : '0';
  }

  function enter() {
    try { nav(); } catch (e) { /* ignore */ }
    try { count(); } catch (e) { /* ignore */ }
    try { reveal(); } catch (e) { /* ignore */ }
  }

  /* ---------- header: scroll pe blur/shadow ---------- */
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const t = document.querySelector('.topbar');
      if (t) t.classList.toggle('scrolled', window.scrollY > 8);
    });
  }, { passive: true });

  /* ---------- ripple ---------- */
  document.addEventListener('pointerdown', (e) => {
    if (reduce || !e.target.closest) return;
    const el = e.target.closest('.btn, .btn-out, .contest');
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const s = document.createElement('i');
    s.className = 'ripple';
    s.style.width = s.style.height = size + 'px';
    s.style.left = (e.clientX - r.left - size / 2) + 'px';
    s.style.top = (e.clientY - r.top - size / 2) + 'px';
    el.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  });

  /* ---------- game card tilt (sirf mouse/laptop pe) ---------- */
  if (finePointer && !reduce) {
    let cur = null;
    document.addEventListener('pointermove', (e) => {
      const g = e.target.closest ? e.target.closest('.game') : null;
      if (cur && cur !== g) { cur.style.setProperty('--rx', '0deg'); cur.style.setProperty('--ry', '0deg'); cur = null; }
      if (!g) return;
      cur = g;
      const r = g.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      g.style.setProperty('--ry', (x * 10).toFixed(1) + 'deg');
      g.style.setProperty('--rx', (-y * 10).toFixed(1) + 'deg');
    }, { passive: true });
  }

  window.Motion = { enter, nav };
})();
