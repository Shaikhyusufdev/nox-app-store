function getSlugFromUrl() {
  // URL looks like /app/some-app-slug
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

async function loadDetail() {
  const detail = document.getElementById('detail');
  const slug = getSlugFromUrl();

  try {
    const app = await fetchJSON(`/api/apps/${slug}`);
    document.title = `${app.name} — NOX Store`;

    const shotsHtml = (app.screenshots || [])
      .slice(0, 6)
      .map(url => `<img src="${url}" alt="${app.name} screenshot" loading="lazy">`)
      .join('');

    detail.innerHTML = `
      <div class="detail-top">
        <div class="detail-icon">${initials(app.name)}</div>
        <div>
          <div class="detail-name">${app.name}</div>
          <div class="detail-stats">
            <div><b>${app.version || '1.0'}</b>Version</div>
            <div><b>${app.size || 'N/A'}</b>Size</div>
            <div><b>${starRating(app.rating)}</b>Rating</div>
          </div>
        </div>
      </div>
      <p class="detail-desc">${app.description || 'No description provided.'}</p>
      ${shotsHtml ? `<div class="shots" style="padding-left:0;padding-right:0">${shotsHtml}</div>` : ''}
      <div class="download-cta" style="margin-left:0">
        <button class="btn btn-primary btn-block" onclick="window.location.href='${app.apk_url}'">
          ⬇ Download APK
        </button>
        <div class="download-hint">Direct link · ${app.size || 'size unknown'}</div>
      </div>
    `;
  } catch (err) {
    detail.innerHTML = `<div class="center-empty">App not found.</div>`;
  }
}

loadDetail();
