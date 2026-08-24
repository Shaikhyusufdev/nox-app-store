let adminPassword = '';

const loginBox = document.getElementById('loginBox');
const formBox = document.getElementById('formBox');
const loginMsg = document.getElementById('loginMsg');
const formMsg = document.getElementById('formMsg');

document.getElementById('loginBtn').onclick = async () => {
  const pw = document.getElementById('pwInput').value;
  try {
    await fetchJSON('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    adminPassword = pw;
    loginBox.style.display = 'none';
    formBox.style.display = 'block';
    loadAdminList();
  } catch (err) {
    loginMsg.innerHTML = `<div class="msg err">Wrong password.</div>`;
  }
};

document.getElementById('appForm').onsubmit = async (e) => {
  e.preventDefault();
  formMsg.innerHTML = '';

  const fd = new FormData();
  fd.append('name', document.getElementById('f_name').value);
  fd.append('version', document.getElementById('f_version').value);
  fd.append('size', document.getElementById('f_size').value);
  fd.append('rating', document.getElementById('f_rating').value);
  fd.append('description', document.getElementById('f_desc').value);
  fd.append('keywords', document.getElementById('f_keywords').value);
  fd.append('apk_url', document.getElementById('f_apk_url').value);

  const shots = document.getElementById('f_shots').files;
  for (let i = 0; i < shots.length; i++) fd.append('screenshots', shots[i]);

  try {
    await fetchJSON('/api/admin/apps', {
      method: 'POST',
      headers: { 'x-admin-password': adminPassword },
      body: fd
    });
    formMsg.innerHTML = `<div class="msg ok">App added! Its page is now live automatically.</div>`;
    document.getElementById('appForm').reset();
    loadAdminList();
  } catch (err) {
    formMsg.innerHTML = `<div class="msg err">${err.message}</div>`;
  }
};

async function loadAdminList() {
  const list = document.getElementById('adminList');
  try {
    const apps = await fetchJSON('/api/apps');
    if (!apps.length) {
      list.innerHTML = `<div class="center-empty">No apps yet.</div>`;
      return;
    }
    list.innerHTML = apps.map(app => `
      <div class="admin-row">
        <span>${app.name} <span style="color:var(--muted)">v${app.version || '1.0'}</span></span>
        <button onclick="deleteApp('${app.id}')">Delete</button>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="center-empty">Couldn't load list.</div>`;
  }
}

async function deleteApp(id) {
  if (!confirm('Delete this app?')) return;
  try {
    await fetchJSON(`/api/admin/apps/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });
    loadAdminList();
  } catch (err) {
    alert(err.message);
  }
}
