// Chhota fetch helper: cookie automatically jaati hai (same-origin)
window.api = (function () {
  async function request(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch('/api' + path, opts);
    } catch {
      const e = new Error('Internet check karo, server se connect nahi hua');
      e.status = 0;
      throw e;
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const e = new Error(data.error || 'Kuch galat ho gaya');
      e.status = res.status;
      throw e;
    }
    return data;
  }
  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b || {}),
  };
})();
