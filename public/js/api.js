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

function starRating(rating) {
  if (!rating) return 'N/A';
  return `★ ${Number(rating).toFixed(1)}`;
}
