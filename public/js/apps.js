async function loadApps() {
  const grid = document.getElementById('appGrid');
  try {
    const apps = await fetchJSON('/api/apps');
    if (!apps.length) {
      grid.innerHTML = `<div class="center-empty">No apps listed yet.</div>`;
      return;
    }
    grid.innerHTML = apps.map(app => `
      <a class="app-tile" href="app/${app.slug}">
        <div class="app-tile-icon">${initials(app.name)}</div>
        <div class="app-tile-name">${app.name}</div>
        <div class="app-tile-meta">${starRating(app.rating)} · ${app.size || 'N/A'}</div>
      </a>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div class="center-empty">Couldn't load apps. Try again later.</div>`;
  }
}

loadApps();
