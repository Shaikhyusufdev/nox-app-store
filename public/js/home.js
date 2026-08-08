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
        <div class="eyebrow">// latest release</div>
        <div class="detail-icon" style="margin:0 auto">${initials(app.name)}</div>
        <div class="hero-name">${app.name}</div>
        <div class="hero-meta">
          <span>${starRating(app.rating)}</span><span class="dot">·</span>
          <span>${app.size || 'N/A'}</span><span class="dot">·</span>
          <span>v${app.version || '1.0'}</span>
        </div>
        ${app.description ? `<p class="hero-desc">${app.description}</p>` : ''}
      </div>
      ${shotsHtml ? `<div class="shots">${shotsHtml}</div>` : ''}
      <div class="download-cta">
        <button class="btn btn-primary btn-block" onclick="window.location.href='${app.apk_url}'">
          ⬇ Download APK
        </button>
        <div class="download-hint">Direct link · ${app.size || 'size unknown'}</div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="center-empty">// no apps listed yet — check back soon</div>`;
    topBtn.onclick = () => {};
  }
}

loadHome();
