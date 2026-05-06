import React, { createContext, useContext, useState } from 'react';

// Auth real contra /api/auth/login. Token guardado en localStorage bajo arman_token / arman_user
// (compartido con las paginas estaticas via /_shared/auth.js).

const TOKEN_KEY = 'arman_token';
const USER_KEY = 'arman_user';

const AuthContext = createContext(null);

function readUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
  catch { return null; }
}

// ── Patch window.fetch a module-load (corre antes del primer render) ───────
// Sin esto, el primer fetch sale sin Authorization porque useEffect corre
// despues del render inicial.
if (typeof window !== 'undefined' && !window.__armanFetchPatched) {
  window.__armanFetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isApi = url.startsWith('/api/') || url.includes('/api/');
    const headers = new Headers(init.headers || {});
    const t = localStorage.getItem(TOKEN_KEY);
    if (isApi && t && !headers.has('Authorization')) {
      headers.set('Authorization', 'Bearer ' + t);
    }
    const res = await orig(input, { ...init, headers });
    if (res.status === 401 && isApi) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      // Forzar reload para que App detecte que no hay sesion y muestre login
      if (!window.location.pathname.includes('login')) {
        window.location.href = '/crm/login';
      }
    }
    return res;
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  const login = async (email, password) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Credenciales invalidas');
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    setToken(data.token);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setToken(null);
  };

  const can = (action) => {
    if (!user) return false;
    if (user.rol === 'admin') return true;
    const operadorActions = ['view_leads', 'update_lead', 'create_lead', 'create_task', 'generate_quote', 'close_won'];
    return operadorActions.includes(action);
  };

  const hasVertical = (v) => {
    if (!user) return false;
    if (user.rol === 'admin') return true;
    return Array.isArray(user.verticales) && user.verticales.includes(v);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, can, hasVertical }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
