let allApps = [];

function renderApps(apps) {
  const grid = document.getElementById('appGrid');
  if (!apps.length) {
    grid.innerHTML = `<div class="center-empty">No matching apps.</div>`;
    return;
  }
  grid.innerHTML = apps.map(app => `
    <a class="app-tile" href="/app/${app.slug}">
      <div class="app-tile-icon">${initials(app.name)}</div>
      <div class="app-tile-name">${app.name}</div>
      <div class="app-tile-meta">${starRating(app.rating)} · ${app.size || 'N/A'}</div>
    </a>
  `).join('');
}

async function loadApps() {
  const grid = document.getElementById('appGrid');
  try {
    allApps = await fetchJSON('/api/apps');
    if (!allApps.length) {
      grid.innerHTML = `<div class="center-empty">No apps listed yet.</div>`;
      return;
    }
    renderApps(allApps);
  } catch (err) {
    grid.innerHTML = `<div class="center-empty">Couldn't load apps. Try again later.</div>`;
  }
}

const searchInput = document.getElementById('appSearch');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    renderApps(allApps.filter(a => a.name.toLowerCase().includes(q)));
  });
}

loadApps();
