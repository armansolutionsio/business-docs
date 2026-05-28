// Helper de auth compartido por todas las paginas estaticas (hub, tech, paybridge, admin, travel).
// - Guarda token+user en localStorage bajo claves "arman_token" y "arman_user".
// - Inyecta Authorization: Bearer en todos los fetch.
// - Si una respuesta vuelve 401, limpia y redirige a /login.html.
// - Helper requireSession() para paginas que necesitan estar logueadas.
(function () {
  const TOKEN_KEY = 'arman_token';
  const USER_KEY = 'arman_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function logout(redirect) {
    clearSession();
    window.location.href = redirect || '/login.html';
  }

  // Bloquea la pagina si no hay token. Llamar al inicio de cada pagina protegida.
  function requireSession(opts) {
    const o = opts || {};
    const token = getToken();
    if (!token) {
      const back = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = '/login.html?next=' + back;
      return null;
    }
    if (o.vertical) {
      const u = getUser();
      if (u && u.rol !== 'admin') {
        const allowed = Array.isArray(u.verticales) ? u.verticales : [];
        if (!allowed.includes(o.vertical)) {
          alert('Tu usuario no tiene acceso a la vertical: ' + o.vertical);
          window.location.href = '/';
          return null;
        }
      }
    }
    return getUser();
  }

  // Wrapper de fetch que agrega Authorization y maneja 401.
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api/') || url.includes('/api/');
    const opts = init || {};
    const headers = new Headers(opts.headers || {});
    const token = getToken();
    if (isApi && token && !headers.has('Authorization')) {
      headers.set('Authorization', 'Bearer ' + token);
    }
    const res = await _origFetch(input, { ...opts, headers });
    if (res.status === 401 && isApi) {
      const path = window.location.pathname;
      if (path !== '/login.html') {
        clearSession();
        const back = encodeURIComponent(path + window.location.search);
        window.location.href = '/login.html?next=' + back + '&expired=1';
      }
    }
    return res;
  };

  window.ArmanAuth = {
    getToken, getUser, setSession, clearSession, logout, requireSession,
  };
})();
