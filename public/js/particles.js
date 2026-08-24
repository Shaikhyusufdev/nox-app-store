(function () {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = window.innerWidth < 640;

  let w, h, dpr;
  let particles = [];
  const COLORS = ['0,255,106', '0,230,118', '57,255,140']; // matrix greens
  const COUNT = isSmall ? 26 : 55;
  const LINK_DIST = isSmall ? 90 : 130;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = window.innerWidth * dpr;
    h = canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }

  function makeParticles() {
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25 * dpr,
      vy: (Math.random() - 0.5) * 0.25 * dpr,
      r: (Math.random() * 1.6 + 0.6) * dpr,
      c: COLORS[Math.floor(Math.random() * COLORS.length)]
    }));
  }

  const CHARS = '01アイウエオカキクケコサシスセソABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let columns = [];
  let fontSize = 15;

  function makeColumns() {
    fontSize = window.innerWidth < 640 ? 13 : 15;
    const colCount = Math.floor(w / (fontSize * dpr));
    columns = Array.from({ length: colCount }, () => Math.floor(Math.random() * -40));
  }

  function drawRain() {
    ctx.font = `${fontSize * dpr}px monospace`;
    for (let i = 0; i < columns.length; i++) {
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      const x = i * fontSize * dpr;
      const y = columns[i] * fontSize * dpr;
      ctx.fillStyle = 'rgba(0,255,106,0.16)';
      ctx.fillText(char, x, y);
      if (y > h && Math.random() > 0.975) columns[i] = 0;
      columns[i]++;
    }
  }

  function step() {
    ctx.fillStyle = 'rgba(5,8,5,0.06)';
    ctx.fillRect(0, 0, w, h);
    drawRain();

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.c},0.55)`;
      ctx.fill();
    }

    // faint connecting lines between nearby particles — subtle "constellation" glass look
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST * dpr) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(0,255,106,${0.14 * (1 - dist / (LINK_DIST * dpr))})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    if (!prefersReduced) requestAnimationFrame(step);
  }

  resize();
  makeParticles();
  makeColumns();
  step();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); makeParticles(); makeColumns(); }, 200);
  });
})();
