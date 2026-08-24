const API_BASE = ''; // same origin (Express serves both API + frontend)

async function fetchJSON(url, options = {}) {
  const res = await fetch(API_BASE + url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Renders a real uploaded icon <img> if present, otherwise falls back to the
// letter badge. className should be 'app-tile-icon' or 'detail-icon' etc.
function appIcon(app, className) {
  if (app.icon_url) {
    return `<img class="${className} icon-img" src="${app.icon_url}" alt="${app.name} icon" loading="lazy">`;
  }
  return `<div class="${className}">${initials(app.name)}</div>`;
}

function starRating(rating) {
  if (!rating) return 'N/A';
  return `★ ${Number(rating).toFixed(1)}`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
