async function loadHome() {
  const content = document.getElementById('content');
  const topBtn = document.getElementById('topDownloadBtn');

  try {
    const app = await fetchJSON('/api/apps/latest');

    // Top nav download button jumps straight to the APK
    topBtn.onclick = () => window.location.href = app.apk_url;

    const shotsHtml = (app.screenshots || [])
      .slice(0, 6)
      .map(url => `<img src="${url}" alt="screenshot">`)
      .join('');

    content.innerHTML = `
      <div class="hero">
        <div class="detail-icon" style="margin:0 auto">${initials(app.name)}</div>
        <div class="hero-name">${app.name}</div>
        <div style="color:var(--muted2);font-size:12px;margin-bottom:14px">
          ${starRating(app.rating)} · ${app.size || 'N/A'} · v${app.version || '1.0'}
        </div>
        <p class="hero-desc">${app.description || ''}</p>
        <div class="shots">${shotsHtml}</div>
        <div class="download-cta">
          <button class="btn btn-primary btn-block" onclick="window.location.href='${app.apk_url}'">
            ⬇ Download APK
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="center-empty">No apps listed yet. Check back soon.</div>`;
    topBtn.onclick = () => {};
  }
}

loadHome();
